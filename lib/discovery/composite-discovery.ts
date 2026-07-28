/**
 * CompositeDiscovery - runs multiple discovery sources and merges their URLs
 *
 * Implements {@link UrlDiscoverySource}, so a composite of several sources looks
 * identical to a single source from the caller's perspective. Sources run in
 * order (e.g. sitemap first, then crawler), their DiscoveredUrl lists are merged
 * and deduplicated, priority-ordered, and finally capped at a single shared page
 * limit (default {@link MAX_PAGES_PER_DOMAIN}). The cap is applied AFTER merging
 * so the 20-page budget is spent on the highest-priority URLs across all sources.
 */

import {
  DiscoveredUrl,
  DiscoveryInput,
  DiscoveryResult,
  UrlDiscoverySource,
} from './types';
import { priorityWeight } from './url-utils';
import { MAX_PAGES_PER_DOMAIN } from './internal-crawler';

export interface CompositeDiscoveryOptions {
  /** Hard cap on merged URLs. Defaults to MAX_PAGES_PER_DOMAIN (20). */
  maxPages?: number;
}

/**
 * Compute the ordering tier for a merged URL (lower = earlier):
 *   0 = high-priority business page (regardless of source)
 *   1 = SERP-discovered page (provenance contains the "serp" source)
 *   2 = everything else (crawler / sitemap / low-medium priority)
 */
function orderingTier(url: DiscoveredUrl): number {
  if (url.priority === 'high') return 0;
  if (url.source.split('+').includes('serp')) return 1;
  return 2;
}

export class CompositeDiscovery implements UrlDiscoverySource {
  readonly name = 'composite';

  private readonly sources: UrlDiscoverySource[];
  private readonly maxPages: number;

  constructor(sources: UrlDiscoverySource[], options: CompositeDiscoveryOptions = {}) {
    this.sources = sources;
    this.maxPages = Math.max(1, options.maxPages ?? MAX_PAGES_PER_DOMAIN);
  }

  async discover(input: DiscoveryInput): Promise<DiscoveryResult> {
    const errors: string[] = [];
    // Keyed by normalized URL so the same page from multiple sources collapses.
    const merged = new Map<string, DiscoveredUrl>();

    for (const source of this.sources) {
      let result: DiscoveryResult;
      try {
        result = await source.discover(input);
      } catch (error) {
        errors.push(
          `${source.name} discovery failed: ${error instanceof Error ? error.message : String(error)}`
        );
        continue;
      }
      errors.push(...result.errors);

      for (const found of result.urls) {
        const existing = merged.get(found.url);
        if (!existing) {
          merged.set(found.url, { ...found });
          continue;
        }
        // Same URL from another source: keep the strongest priority, the
        // shallowest depth, and record combined provenance.
        const keepNewPriority =
          priorityWeight(found.priority) > priorityWeight(existing.priority);
        const sources = new Set(
          `${existing.source},${found.source}`.split(',').map(s => s.trim()).filter(Boolean)
        );
        merged.set(found.url, {
          url: existing.url,
          priority: keepNewPriority ? found.priority : existing.priority,
          source: Array.from(sources).join('+'),
          depth: Math.min(existing.depth, found.depth),
        });
      }
    }

    // Priority-order across all sources, then apply the shared cap AFTER merge.
    //
    // Ordering tiers (as required by the discovery spec):
    //   1. High-priority business pages (any source)
    //   2. SERP-discovered pages
    //   3. Remaining pages (crawler/sitemap)
    // Within a tier, fall back to priority weight (desc) then depth (asc).
    const ordered = Array.from(merged.values()).sort((a, b) => {
      const tierDiff = orderingTier(a) - orderingTier(b);
      if (tierDiff !== 0) return tierDiff;
      const weightDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
      if (weightDiff !== 0) return weightDiff;
      return a.depth - b.depth;
    });

    const limit = Math.min(this.maxPages, input.maxUrls ?? this.maxPages);
    const urls = ordered.slice(0, limit);

    return { source: this.name, urls, errors };
  }
}
