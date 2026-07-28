/**
 * Company
 * 
 * Detected company information with confidence scoring.
 * Multiple detection sources contribute to final confidence.
 */

export type CompanyDetectionSource = 
  | 'schema-org'
  | 'json-ld'
  | 'opengraph'
  | 'page-title'
  | 'heading'
  | 'domain'
  | 'email-domain'
  | 'markup';

export interface Company {
  /** Company name detected from page */
  name: string;

  /** Confidence score (0-1) based on detection source */
  confidence: number;

  /** Source of detection */
  detectionSource: CompanyDetectionSource;

  /** Additional sources that confirmed this company */
  secondarySources: CompanyDetectionSource[];

  /** Evidence snippet showing where name was found */
  evidenceSnippet?: string;

  /** Additional metadata about detection */
  metadata: {
    rawValue?: string;
    detectedAt?: string; // CSS selector or HTML element type
    extractionMethod?: string;
  };
}

/**
 * Quality metrics for company detection
 */
export interface CompanyQuality {
  /** Overall company confidence (0-1) */
  confidence: number;

  /** Whether company was confirmed by multiple sources */
  hasMultipleSources: boolean;

  /** Whether company came from structural markup */
  hasStructuredMarkup: boolean;

  /** Confidence in company name accuracy */
  nameAccuracy: 'high' | 'medium' | 'low';
}
