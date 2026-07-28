/**
 * URL Discovery Layer - public entry point + extraction integration
 *
 * Flow:
 *   Starting URL
 *         |
 *         v
 *   InternalCrawler (or any UrlDiscoverySource)
 *         |
 *         v
 *   Discovered URLs
 *         |
 *         v
 *   Existing extractIntelligence()   <-- unchanged, one call per page
 *         |
 *         v
 *   Merge intelligence results       <-- thin cross-page aggregation here
 *
 * This module does NOT extract or deobfuscate anything itself. It fetches each
 * discovered page's HTML the same way the worker does and delegates all
 * extraction/scoring to the existing pipeline, then combines the per-page
 * ExtractionIntelligence outputs (which are already deduped/scored per page).
 */

import {
  extractIntelligence,
  ExtractionIntelligence,
  ExtractedEmail,
} from '../extraction/intelligence-orchestrator';
import { CompanyDetection } from '../extraction/company-detector';
import { InternalCrawler, MAX_PAGES_PER_DOMAIN } from './internal-crawler';
import { SitemapDiscovery } from './sitemap-discovery';
import { SerpDiscovery } from './serp-discovery';
import { GoogleProgrammableSearchProvider } from './search-providers';
import { CompositeDiscovery } from './composite-discovery';
import {
  DiscoveredUrl,
  DiscoveryResult,
  UrlDiscoverySource,
} from './types';

export * from './types';
export {
  InternalCrawler,
  MAX_PAGES_PER_DOMAIN,
  CRAWL_FETCH_TIMEOUT_MS,
} from './internal-crawler';
export {
  SitemapDiscovery,
  SITEMAP_FETCH_TIMEOUT_MS,
  MAX_SITEMAP_DOCUMENTS,
  MAX_SITEMAP_URLS,
} from './sitemap-discovery';
export {
  SerpDiscovery,
  SERP_QUERY_TERMS,
} from './serp-discovery';
export {
  GoogleProgrammableSearchProvider,
  SEARCH_PROVIDER_TIMEOUT_MS,
} from './search-providers';
export type { SearchProvider, SearchResult } from './search-providers';
export { CompositeDiscovery } from './composite-discovery';
export {
  normalizeUrl,
  isSameOrigin,
  classifyUrlPriority,
  extractLinks,
  priorityWeight,
  HIGH_PRIORITY_PATHS,
  MEDIUM_PRIORITY_KEYWORDS,
} from './url-utils';

/** Result of crawling a site and running extraction over every discovered page. */
export interface DiscoverAndExtractResult {
  startUrl: string;
  /** URLs found by the discovery source(s), priority-ordered. */
  discovered: DiscoveredUrl[];
  /** Per-page intelligence, each already deduped/scored by extractIntelligence. */
  pages: ExtractionIntelligence[];
  /** Emails merged across every page (union, highest confidence wins). */
  mergedEmails: ExtractedEmail[];
  /** Best company detection across pages (highest confidence). */
  company: CompanyDetection | null;
  /** Count of unique merged emails. */
  totalUniqueEmails: number;
  /** Non-fatal problems from discovery + extraction. */
  errors: string[];
}

export interface DiscoverAndExtractOptions {
  /** Discovery source to use. Defaults to a fresh InternalCrawler. */
  source?: UrlDiscoverySource;
  /** Max pages to extract from (upper bound; also passed to discovery). */
  maxUrls?: number;
  /** Per-request fetch timeout for page HTML retrieval (ms). */
  fetchTimeoutMs?: number;
}

const DEFAULT_EXTRACT_TIMEOUT_MS = 15000;

/**
 * Fetch a page's HTML for extraction, mirroring the worker's `fetch(url)`
 * approach. Returns null on failure.
 */
async function fetchPageHtml(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Merge emails across multiple already-scored pages.
 *
 * This is a thin cross-page aggregation over ExtractedEmail objects that the
 * existing pipeline already produced (deduped + scored per page). It does not
 * re-run or duplicate the deobfuscation/normalization engine: it only unions
 * identical addresses, keeping the highest confidence and merging method lists.
 */
function mergeEmailsAcrossPages(pages: ExtractionIntelligence[]): ExtractedEmail[] {
  const merged = new Map<string, ExtractedEmail>();

  for (const page of pages) {
    for (const email of page.emails) {
      const key = email.address.toLowerCase();
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...email });
        continue;
      }
      // Keep the strongest signal for this address across pages.
      const methods = new Set(
        [existing.extractionMethod, email.extractionMethod]
          .join(',')
          .split(',')
          .map(m => m.trim())
          .filter(Boolean)
      );
      merged.set(key, {
        address: existing.address,
        confidence: Math.max(existing.confidence, email.confidence),
        extractionMethod: Array.from(methods).join(','),
        evidence: existing.confidence >= email.confidence ? existing.evidence : email.evidence,
        verified: existing.verified || email.verified,
      });
    }
  }

  // Highest confidence first for a stable, useful ordering.
  return Array.from(merged.values()).sort((a, b) => b.confidence - a.confidence);
}

/** Pick the highest-confidence company detection across pages. */
function pickBestCompany(pages: ExtractionIntelligence[]): CompanyDetection | null {
  let best: CompanyDetection | null = null;
  for (const page of pages) {
    if (page.company && (!best || page.company.confidence > best.confidence)) {
      best = page.company;
    }
  }
  return best;
}

/**
 * Discover relevant pages for a site and run the EXISTING extraction pipeline
 * over each one, then merge the results.
 *
 * @param startUrl Seed URL / domain to discover and extract from.
 * @param options  Discovery source + limits (all optional).
 */
export async function discoverAndExtract(
  startUrl: string,
  options: DiscoverAndExtractOptions = {}
): Promise<DiscoverAndExtractResult> {
  // Default discovery runs three sources behind a single CompositeDiscovery:
  //   1. SitemapDiscovery  (robots.txt + sitemap.xml)
  //   2. InternalCrawler   (same-domain link following)
  //   3. SerpDiscovery     (search-engine `site:` queries, provider-injected)
  // The composite merges/dedupes all URLs, applies the required ordering
  // (high-priority business pages -> SERP pages -> remaining crawler pages),
  // and enforces the shared page cap AFTER merging so the 20-page budget covers
  // all sources combined. SerpDiscovery degrades to empty when no search
  // provider is configured, so the pipeline is unaffected without API keys.
  const pageCap = options.maxUrls ?? MAX_PAGES_PER_DOMAIN;
  const source =
    options.source ??
    new CompositeDiscovery(
      [
        new SitemapDiscovery(),
        new InternalCrawler({ maxPages: pageCap }),
        new SerpDiscovery(new GoogleProgrammableSearchProvider()),
      ],
      { maxPages: pageCap }
    );
  const extractTimeout = options.fetchTimeoutMs ?? DEFAULT_EXTRACT_TIMEOUT_MS;
  const errors: string[] = [];

  // Step 1: Discover URLs via the pluggable discovery source.
  let discovery: DiscoveryResult;
  try {
    discovery = await source.discover({ startUrl, maxUrls: options.maxUrls });
  } catch (error) {
    discovery = {
      source: source.name,
      urls: [],
      errors: [`Discovery failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  errors.push(...discovery.errors);

  const targets = options.maxUrls
    ? discovery.urls.slice(0, options.maxUrls)
    : discovery.urls;

  // Step 2: Run the existing extractIntelligence() for every discovered page.
  const pages: ExtractionIntelligence[] = [];
  for (const target of targets) {
    const html = await fetchPageHtml(target.url, extractTimeout);
    if (html === null) {
      errors.push(`Failed to fetch page for extraction: ${target.url}`);
      continue;
    }
    try {
      const intelligence = await extractIntelligence(html, target.url);
      pages.push(intelligence);
    } catch (error) {
      errors.push(
        `Extraction failed for ${target.url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Step 3: Merge per-page intelligence into a single site-level view.
  const mergedEmails = mergeEmailsAcrossPages(pages);
  const company = pickBestCompany(pages);

  return {
    startUrl,
    discovered: discovery.urls,
    pages,
    mergedEmails,
    company,
    totalUniqueEmails: mergedEmails.length,
    errors,
  };
}
