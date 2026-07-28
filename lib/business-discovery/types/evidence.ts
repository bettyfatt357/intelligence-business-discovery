/**
 * Evidence
 * 
 * Trackable evidence for findings (company, emails, patterns).
 * Each finding includes where it was found and how confident we are.
 */

export interface MatchLocation {
  /** HTML element type where found */
  element: string;

  /** CSS selector if available */
  cssSelector?: string;

  /** Attribute if found in attribute */
  attribute?: string;

  /** Text content preview */
  textPreview: string;

  /** Line/position in HTML */
  position?: number;
}

export interface PatternMatch {
  /** Pattern that was matched */
  pattern: string;

  /** Type of pattern match */
  matchType: 'keyword' | 'regex' | 'url-path' | 'domain';

  /** Where in the page was it found */
  location: MatchLocation;

  /** Confidence in the match (0-1) */
  confidence: number;

  /** Context around the match */
  context?: string;
}

export interface Evidence {
  /** Unique evidence identifier */
  id: string;

  /** Type of evidence */
  type: 'company' | 'email' | 'pattern' | 'contact-info' | 'structure';

  /** What was found */
  finding: string;

  /** Where it was found */
  location: MatchLocation;

  /** Stage where evidence was collected */
  stage: 'url-analysis' | 'metadata' | 'html' | 'rendered-content';

  /** Confidence in the evidence (0-1) */
  confidence: number;

  /** Supporting evidence items */
  relatedEvidence: string[]; // IDs of related evidence

  /** Method used to find this evidence */
  method: string;

  /** Full context snippet */
  snippet: string;

  /** Timestamp of discovery */
  discoveredAt: Date;
}

/**
 * Evidence collection for an IntelligenceRecord
 */
export interface EvidenceCollection {
  /** All collected evidence */
  items: Evidence[];

  /** Evidence grouped by type */
  byType: Record<string, Evidence[]>;

  /** Total unique evidence items */
  count: number;

  /** Quality of evidence collection */
  quality: {
    /** Percentage of findings backed by evidence */
    coveragePercent: number;
    /** Average confidence across all evidence */
    averageConfidence: number;
    /** Number of evidence items per finding (higher = stronger) */
    itemsPerFinding: number;
  };
}
