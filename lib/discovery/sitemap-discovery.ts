/**
 * SitemapDiscovery - robots.txt + sitemap.xml URL discovery source
 *
 * Implements {@link UrlDiscoverySource}. Before the crawler follows links, this
 * source discovers URLs declared by the site itself:
 *
 *   1. Fetch /robots.txt and detect `Sitemap:` directives.
 *   2. If no sitemap is declared, fall back to /sitemap.xml.
 *   3. Parse XML sitemaps (both <sitemapindex> and <urlset>), following nested
 *      sitemap indexes up to a bounded depth/count.
 *   4. Keep only same-origin URLs.
 *   5. Classify each URL through the shared priority classifier.
 *
 * Like the crawler, this source ONLY finds URLs - it never extracts. Results
 * flow through the same DiscoveryResult contract so callers treat it uniformly.
 */

import {
  DiscoveredUrl,
  DiscoveryInput,
  DiscoveryResult,
  UrlDiscoverySource,
} from './types';
import { classifyUrlPriority, isSameOrigin, normalizeUrl, priorityWeight } from './url-utils';

/** Per-request fetch timeout, consistent with the rest of the discovery layer. */
export const SITEMAP_FETCH_TIMEOUT_MS = 10000;

/** Safety caps so a malicious/huge sitemap tree cannot exhaust resources. */
export const MAX_SITEMAP_DOCUMENTS = 10; // total sitemap XML docs fetched
export const MAX_SITEMAP_URLS = 500; // total <loc> URLs collected before capping

/** Browser-like headers, consistent with the crawler's fetch layer. */
const SITEMAP_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface SitemapDiscoveryOptions {
  /** Override the per-request fetch timeout in ms. */
  fetchTimeoutMs?: number;
  /** Override the maximum number of sitemap documents fetched. */
  maxDocuments?: number;
}

export class SitemapDiscovery implements UrlDiscoverySource {
  readonly name = 'sitemap';

  private readonly fetchTimeoutMs: number;
  private readonly maxDocuments: number;

  constructor(options: SitemapDiscoveryOptions = {}) {
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? SITEMAP_FETCH_TIMEOUT_MS;
    this.maxDocuments = Math.max(1, options.maxDocuments ?? MAX_SITEMAP_DOCUMENTS);
  }

  /**
   * Fetch a text resource (robots.txt / sitemap XML). Isolated so tests can
   * subclass/override it without real network I/O. Returns null on any failure.
   */
  protected async fetchText(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: SITEMAP_HEADERS,
        redirect: 'follow',
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async discover(input: DiscoveryInput): Promise<DiscoveryResult> {
    const errors: string[] = [];

    const seed = normalizeUrl(input.startUrl);
    if (!seed) {
      return { source: this.name, urls: [], errors: [`Invalid start URL: ${input.startUrl}`] };
    }

    const origin = new URL(seed).origin;

    // Step 1: robots.txt -> Sitemap: directives.
    let sitemapUrls: string[] = [];
    const robotsUrl = `${origin}/robots.txt`;
    const robotsTxt = await this.fetchText(robotsUrl);
    if (robotsTxt) {
      sitemapUrls = this.parseRobotsSitemaps(robotsTxt);
    } else {
      errors.push(`Could not fetch ${robotsUrl}`);
    }

    // Step 2: fall back to /sitemap.xml when none declared.
    if (sitemapUrls.length === 0) {
      sitemapUrls = [`${origin}/sitemap.xml`];
    }

    // Step 3: parse sitemap docs (following nested indexes), collecting <loc>s.
    const collected = new Set<string>();
    const fetchedDocs = new Set<string>();
    const queue = [...new Set(sitemapUrls.map(u => normalizeUrl(u)).filter((u): u is string => !!u))];

    while (queue.length > 0 && fetchedDocs.size < this.maxDocuments && collected.size < MAX_SITEMAP_URLS) {
      const sitemapUrl = queue.shift()!;
      if (fetchedDocs.has(sitemapUrl)) continue;
      fetchedDocs.add(sitemapUrl);

      // Only fetch same-origin sitemap documents.
      if (!isSameOrigin(sitemapUrl, seed)) continue;

      const xml = await this.fetchText(sitemapUrl);
      if (!xml) {
        errors.push(`Could not fetch sitemap: ${sitemapUrl}`);
        continue;
      }

      const { pageUrls, nestedSitemaps } = this.parseSitemapXml(xml);

      // Nested <sitemapindex> entries -> enqueue for further fetching.
      for (const nested of nestedSitemaps) {
        const normalizedNested = normalizeUrl(nested);
        if (normalizedNested && !fetchedDocs.has(normalizedNested)) {
          queue.push(normalizedNested);
        }
      }

      // <urlset> page URLs -> collect same-origin ones.
      for (const pageUrl of pageUrls) {
        const normalized = normalizeUrl(pageUrl);
        if (!normalized) continue;
        if (!isSameOrigin(normalized, seed)) continue; // Step 4: same-origin only
        collected.add(normalized);
        if (collected.size >= MAX_SITEMAP_URLS) break;
      }
    }

    // Step 5: classify priority for every discovered URL.
    const urls: DiscoveredUrl[] = Array.from(collected).map(url => ({
      url,
      priority: classifyUrlPriority(url),
      source: this.name,
      depth: 0,
    }));

    // Order high-priority first for consistent downstream handling.
    urls.sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));

    return { source: this.name, urls, errors };
  }

  /**
   * Extract `Sitemap:` directive URLs from robots.txt content. The directive is
   * case-insensitive per the robots.txt convention.
   */
  private parseRobotsSitemaps(robotsTxt: string): string[] {
    const results: string[] = [];
    const lines = robotsTxt.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
      if (match) {
        results.push(match[1].trim());
      }
    }
    return results;
  }

  /**
   * Parse a sitemap XML document, returning both page URLs (from <urlset>) and
   * nested sitemap URLs (from <sitemapindex>).
   *
   * A robust-enough approach for well-formed sitemaps: distinguish nested
   * sitemap indexes by the presence of a <sitemapindex> root, otherwise treat
   * <loc> entries as page URLs.
   */
  private parseSitemapXml(xml: string): { pageUrls: string[]; nestedSitemaps: string[] } {
    const locValues = this.extractLocValues(xml);
    const isIndex = /<sitemapindex[\s>]/i.test(xml);

    if (isIndex) {
      return { pageUrls: [], nestedSitemaps: locValues };
    }
    return { pageUrls: locValues, nestedSitemaps: [] };
  }

  /** Extract and XML-decode all <loc> values from a sitemap document. */
  private extractLocValues(xml: string): string[] {
    const results: string[] = [];
    const locRegex = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(xml)) !== null) {
      const decoded = this.decodeXmlEntities(match[1].trim());
      if (decoded) results.push(decoded);
    }
    return results;
  }

  /** Decode the small set of XML entities that appear in sitemap URLs. */
  private decodeXmlEntities(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
}
