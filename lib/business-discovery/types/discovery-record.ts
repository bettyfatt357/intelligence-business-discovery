/**
 * DiscoveryRecord
 * 
 * Immutable capture of a Google search result with search context.
 * Created at search time, never modified during processing.
 * Provides complete audit trail of where and how the discovery was found.
 */

export interface DiscoveryRecord {
  /** Unique identifier */
  id: string;

  /** Search context */
  searchContext: {
    /** Original search keyword */
    keyword: string;
    /** Search pattern/intent (e.g., "contact", "team", "leadership") */
    pattern?: string;
    /** Geographic context */
    location?: string;
    /** Search depth (1-5) for advanced discovery */
    searchDepth: number;
    /** Timestamp when search was initiated */
    searchedAt: Date;
  };

  /** Google search result data */
  googleResult: {
    /** Result rank in Google search (1-indexed) */
    rank: number;
    /** Full Google query executed */
    query: string;
    /** Result URL */
    url: string;
    /** Result title from Google */
    title: string;
    /** Result snippet from Google */
    snippet: string;
    /** URL display text from Google */
    displayUrl: string;
  };

  /** Processing status */
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  statusReason?: string;

  /** Creation timestamp */
  createdAt: Date;
}
