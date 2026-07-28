/**
 * InternalCrawler - same-domain URL discovery source
 *
 * Implements {@link UrlDiscoverySource}. Starting from a seed URL, it follows
 * same-domain <a href> links breadth-first, prioritizing business/contact
 * pages, and returns a bounded, deduplicated, priority-ordered list of URLs.
 *
 * It does NOT extract emails - discovery and extraction are separate layers.
 * Discovered URLs are handed to the existing extraction pipeline by
 * ./index.ts. This class only finds URLs.
 */

import {
  DiscoveredUrl,
  DiscoveryInput,
  DiscoveryResult,
  UrlDiscoverySource,
  UrlPriority,
} from './types';
import {
  classifyUrlPriority,
  extractLinks,
  isSameOrigin,
  normalizeUrl,
  priorityWeight,
} from './url-utils';

/** Maximum pages to crawl per domain. Configurable safety limit. */
export const MAX_PAGES_PER_DOMAIN = 20;

/** Per-request fetch timeout, mirroring the extraction path's fetch handling. */
export const CRAWL_FETCH_TIMEOUT_MS = 10000;

/** Browser-like headers, consistent with the rest of the fetch layer. */
const CRAWL_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

interface CrawlQueueItem {
  url: string;
  depth: number;
  priority: UrlPriority;
}

export interface InternalCrawlerOptions {
  /** Override the max pages crawled per domain (defaults to MAX_PAGES_PER_DOMAIN). */
  maxPages?: number;
  /** Override the per-request fetch timeout in ms. */
  fetchTimeoutMs?: number;
}

export class InternalCrawler implements UrlDiscoverySource {
  readonly name = 'internal-crawler';

  private readonly maxPages: number;
  private readonly fetchTimeoutMs: number;

  constructor(options: InternalCrawlerOptions = {}) {
    this.maxPages = Math.max(1, options.maxPages ?? MAX_PAGES_PER_DOMAIN);
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? CRAWL_FETCH_TIMEOUT_MS;
  }

  /**
   * Fetch a page's HTML. Isolated so tests can subclass/override it without
   * performing real network I/O. Returns null on any failure.
   */
  protected async fetchHtml(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: CRAWL_HEADERS,
        redirect: 'follow',
      });
      if (!response.ok) return null;

      // Only parse HTML documents for links.
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !contentType.toLowerCase().includes('html')) {
        return null;
      }

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
      return {
        source: this.name,
        urls: [],
        errors: [`Invalid start URL: ${input.startUrl}`],
      };
    }

    const pageBudget = Math.min(this.maxPages, input.maxUrls ?? this.maxPages);

    // Visited set prevents duplicate URLs and infinite crawling.
    const visited = new Set<string>();
    // Discovered results keyed by normalized URL (also prevents duplicates).
    const discovered = new Map<string, DiscoveredUrl>();

    // Priority-aware frontier: we always expand the highest-priority known URL
    // next so the page budget is spent on the most valuable pages first.
    const frontier: CrawlQueueItem[] = [
      { url: seed, depth: 0, priority: classifyUrlPriority(seed) },
    ];

    // Record the seed itself as a discovered URL.
    discovered.set(seed, {
      url: seed,
      priority: classifyUrlPriority(seed),
      source: this.name,
      depth: 0,
    });

    while (frontier.length > 0 && visited.size < pageBudget) {
      // Pull the highest-priority (then shallowest) item from the frontier.
      frontier.sort((a, b) => {
        const weightDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
        if (weightDiff !== 0) return weightDiff;
        return a.depth - b.depth;
      });
      const current = frontier.shift()!;

      if (visited.has(current.url)) continue;
      visited.add(current.url);

      const html = await this.fetchHtml(current.url);
      if (html === null) {
        errors.push(`Failed to fetch: ${current.url}`);
        continue;
      }

      // Extract, resolve, and normalize links; keep only same-domain pages.
      const links = extractLinks(html, current.url);
      for (const link of links) {
        if (!isSameOrigin(link, seed)) continue; // never leave the target domain

        if (!discovered.has(link)) {
          const priority = classifyUrlPriority(link);
          discovered.set(link, {
            url: link,
            priority,
            source: this.name,
            depth: current.depth + 1,
          });
        }

        // Only queue for crawling if not yet visited/queued and budget allows.
        if (!visited.has(link) && !frontier.some(item => item.url === link)) {
          frontier.push({
            url: link,
            depth: current.depth + 1,
            priority: classifyUrlPriority(link),
          });
        }
      }
    }

    // Order results: high priority first, then medium, then low; stable by depth.
    const urls = Array.from(discovered.values()).sort((a, b) => {
      const weightDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
      if (weightDiff !== 0) return weightDiff;
      return a.depth - b.depth;
    });

    return { source: this.name, urls, errors };
  }
}
