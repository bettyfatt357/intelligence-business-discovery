/**
 * Search Provider Abstraction
 *
 * A pluggable interface for search-engine backends used by SerpDiscovery.
 * SerpDiscovery depends ONLY on this interface, never on a concrete engine, so
 * new backends (Bing, Brave, SerpAPI, etc.) can be added without touching
 * SerpDiscovery itself.
 *
 *   SearchProvider
 *        search(query): Promise<SearchResult[]>
 *          |
 *          +-- GoogleProgrammableSearchProvider  (this phase)
 *          +-- Future: BingWebSearchProvider
 *          +-- Future: BraveSearchProvider
 *          +-- Future: SerpApiProvider
 */

/** A single result row returned by a search provider. */
export interface SearchResult {
  /** Absolute result URL. */
  url: string;
  /** Result title, when available. */
  title?: string;
  /** Result snippet/description, when available. */
  snippet?: string;
}

/**
 * The contract every search backend must implement. Implementations should be
 * resilient: on misconfiguration or transport error they return an empty array
 * rather than throwing, so discovery degrades gracefully.
 */
export interface SearchProvider {
  /** Stable identifier used in logs and provenance (e.g. "google-pse"). */
  readonly name: string;
  /** Whether the provider is configured and usable (e.g. API keys present). */
  isConfigured(): boolean;
  /** Run a single search query and return result rows. */
  search(query: string): Promise<SearchResult[]>;
}

/** Per-request timeout, consistent with the rest of the discovery layer. */
export const SEARCH_PROVIDER_TIMEOUT_MS = 10000;

/**
 * Google Programmable Search Engine (Custom Search JSON API) provider.
 *
 * Requires two environment variables (optional at build time - the provider
 * simply reports isConfigured() === false when absent). The canonical names
 * match the rest of the codebase (lib/config/google.ts); the GOOGLE_PSE_*
 * names are accepted as fallbacks:
 *   - GOOGLE_API_KEY (or GOOGLE_PSE_API_KEY) : Custom Search API key
 *   - GOOGLE_CX      (or GOOGLE_PSE_CX)      : Programmable Search Engine ID (cx)
 *
 * Docs: https://developers.google.com/custom-search/v1/using_rest
 */
export class GoogleProgrammableSearchProvider implements SearchProvider {
  readonly name = 'google-pse';

  private readonly apiKey: string | undefined;
  private readonly cx: string | undefined;
  private readonly timeoutMs: number;
  private readonly endpoint = 'https://www.googleapis.com/customsearch/v1';

  constructor(options: { apiKey?: string; cx?: string; timeoutMs?: number } = {}) {
    this.apiKey = options.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_PSE_API_KEY;
    this.cx = options.cx ?? process.env.GOOGLE_CX ?? process.env.GOOGLE_PSE_CX;
    this.timeoutMs = options.timeoutMs ?? SEARCH_PROVIDER_TIMEOUT_MS;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.cx);
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.isConfigured()) return [];

    const params = new URLSearchParams({
      key: this.apiKey!,
      cx: this.cx!,
      q: query,
      num: '10',
    });
    const requestUrl = `${this.endpoint}?${params.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(requestUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return [];

      const data = (await response.json()) as {
        items?: Array<{ link?: string; title?: string; snippet?: string }>;
      };
      if (!Array.isArray(data.items)) return [];

      return data.items
        .filter(item => typeof item.link === 'string' && item.link.length > 0)
        .map(item => ({
          url: item.link as string,
          title: item.title,
          snippet: item.snippet,
        }));
    } catch {
      // Timeout / network / parse error -> degrade gracefully.
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
