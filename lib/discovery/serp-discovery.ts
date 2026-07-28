/**
 * SerpDiscovery - search-engine-based URL discovery source
 *
 * Implements {@link UrlDiscoverySource}. Given a target domain, it issues a set
 * of `site:domain <term>` queries through a pluggable {@link SearchProvider},
 * collects the result URLs, normalizes + deduplicates them, keeps only
 * same-origin URLs, and classifies each through the shared priority classifier.
 *
 * SerpDiscovery is provider-AGNOSTIC: the concrete search engine (Google PSE,
 * Bing, Brave, SerpAPI, ...) is injected via the constructor. Google is never
 * hardcoded here.
 *
 * Like the other sources, this ONLY finds URLs - it never extracts. Results
 * flow through the same DiscoveryResult contract so callers treat it uniformly.
 */

import {
  DiscoveredUrl,
  DiscoveryInput,
  DiscoveryResult,
  UrlDiscoverySource,
} from './types';
import { classifyUrlPriority, isSameOrigin, normalizeUrl, priorityWeight } from './url-utils';
import { SearchProvider } from './search-providers';

/**
 * Query terms appended to `site:domain` to surface contact/business pages.
 * The final `"@"` query targets pages that literally contain an email address.
 */
export const SERP_QUERY_TERMS = [
  'contact',
  'about',
  'team',
  'staff',
  'directory',
  'faculty',
  'leadership',
  'people',
  '"@"',
];

export interface SerpDiscoveryOptions {
  /** Query terms to append to `site:domain`. Defaults to SERP_QUERY_TERMS. */
  queryTerms?: string[];
}

export class SerpDiscovery implements UrlDiscoverySource {
  readonly name = 'serp';

  private readonly provider: SearchProvider;
  private readonly queryTerms: string[];

  /**
   * @param provider Any SearchProvider implementation (dependency-injected).
   */
  constructor(provider: SearchProvider, options: SerpDiscoveryOptions = {}) {
    this.provider = provider;
    this.queryTerms = options.queryTerms ?? SERP_QUERY_TERMS;
  }

  async discover(input: DiscoveryInput): Promise<DiscoveryResult> {
    const errors: string[] = [];

    const seed = normalizeUrl(input.startUrl);
    if (!seed) {
      return { source: this.name, urls: [], errors: [`Invalid start URL: ${input.startUrl}`] };
    }

    // If the provider is not configured (e.g. missing API keys), degrade
    // gracefully to an empty result rather than failing the whole pipeline.
    if (!this.provider.isConfigured()) {
      return {
        source: this.name,
        urls: [],
        errors: [`Search provider "${this.provider.name}" is not configured; skipping SERP discovery.`],
      };
    }

    // Derive the bare host for the `site:` operator (www-insensitive).
    const host = new URL(seed).hostname.replace(/^www\./, '');

    // Build queries: `site:host <term>`.
    const queries = this.queryTerms.map(term => `site:${host} ${term}`);

    // Run all queries in parallel; each provider call is independently guarded.
    const resultsPerQuery = await Promise.all(
      queries.map(async query => {
        try {
          return await this.provider.search(query);
        } catch (error) {
          errors.push(
            `SERP query failed ("${query}"): ${error instanceof Error ? error.message : String(error)}`
          );
          return [];
        }
      })
    );

    // Normalize + dedupe + same-origin filter across all query results.
    const seen = new Set<string>();
    const urls: DiscoveredUrl[] = [];
    for (const results of resultsPerQuery) {
      for (const result of results) {
        const normalized = normalizeUrl(result.url);
        if (!normalized) continue;
        if (!isSameOrigin(normalized, seed)) continue; // same-origin only
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        urls.push({
          url: normalized,
          priority: classifyUrlPriority(normalized),
          source: this.name,
          depth: 0,
        });
      }
    }

    // High-priority first for consistent downstream handling.
    urls.sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));

    return { source: this.name, urls, errors };
  }
}
