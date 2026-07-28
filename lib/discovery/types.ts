/**
 * URL Discovery Layer - Shared Types & Pluggable Interface
 *
 * This layer sits IN FRONT of the extraction pipeline. Its job is to find
 * relevant page URLs for a target before extraction runs. Multiple discovery
 * sources can be plugged in behind a single interface:
 *
 *   URL Discovery Layer
 *          |
 *          +-- InternalCrawler   (this phase - follows same-domain links)
 *          |
 *          +-- Future:
 *               - SerpDiscovery      (search-engine result pages)
 *               - SitemapDiscovery   (sitemap.xml parsing)
 *               - ManualDiscovery    (operator-supplied URLs)
 *
 * Every source implements {@link UrlDiscoverySource}, so callers (and the
 * extraction integration in ./index.ts) treat all sources uniformly.
 */

/** Priority bucket for a discovered URL. Higher priority = crawl/extract first. */
export type UrlPriority = 'high' | 'medium' | 'low';

/** A single URL found by a discovery source. */
export interface DiscoveredUrl {
  /** Fully-normalized absolute URL. */
  url: string;
  /** Relevance bucket derived from the URL path/keywords. */
  priority: UrlPriority;
  /** Name of the source that discovered this URL (e.g. "internal-crawler"). */
  source: string;
  /**
   * Link depth from the starting URL (0 = seed). Only meaningful for
   * crawl-based sources; other sources may report 0.
   */
  depth: number;
}

/** Input contract shared by every discovery source. */
export interface DiscoveryInput {
  /** Starting URL or domain to discover pages for. */
  startUrl: string;
  /**
   * Optional hard cap on how many URLs to return. Sources should treat this
   * as an upper bound and may return fewer.
   */
  maxUrls?: number;
}

/** Output contract shared by every discovery source. */
export interface DiscoveryResult {
  /** Name of the source that produced this result. */
  source: string;
  /** Discovered URLs, ordered by priority (high first). */
  urls: DiscoveredUrl[];
  /** Non-fatal problems encountered during discovery. */
  errors: string[];
}

/**
 * The interface every URL discovery source must implement.
 *
 * A future SerpDiscovery / SitemapDiscovery only needs to implement this same
 * shape to slot into the discovery layer and the extraction integration.
 */
export interface UrlDiscoverySource {
  /** Stable identifier used in logs and in DiscoveredUrl.source. */
  readonly name: string;
  /** Discover relevant URLs for the given input. */
  discover(input: DiscoveryInput): Promise<DiscoveryResult>;
}
