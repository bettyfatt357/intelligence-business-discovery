/**
 * EmailIntelligence
 * 
 * Email extracted with extraction method and confidence.
 */

export type EmailExtractionMethod =
  | 'plaintext'
  | 'mailto'
  | 'html-entity'
  | 'unicode'
  | 'hex'
  | 'decimal'
  | 'base64'
  | 'rot13'
  | 'css-hidden'
  | 'javascript-variable'
  | 'react-props'
  | 'vue-data'
  | 'angular-template'
  | 'next-hydration'
  | 'shadow-dom'
  | 'json-ld'
  | 'data-attribute'
  | 'onclick-handler';

export interface EmailIntelligence {
  /** Email address extracted */
  email: string;

  /** Method used to extract the email */
  extractionMethod: EmailExtractionMethod;

  /** Confidence that extraction is correct (0-1) */
  confidence: number;

  /** Where in the page was it found */
  htmlLocation?: {
    tag: string;
    attribute?: string;
    cssSelector?: string;
  };

  /** Evidence snippet showing context */
  evidenceSnippet?: string;

  /** Whether email appears to be verified/active */
  isVerified?: boolean;

  /** Associated metadata */
  metadata: {
    extractedAt?: string; // Timestamp or element location
    dataType?: string; // 'contact', 'support', 'sales', 'general'
    obfuscationLevel?: 'none' | 'light' | 'heavy';
  };
}

/**
 * Quality metrics for email extraction
 */
export interface EmailQuality {
  /** Number of unique emails extracted */
  uniqueCount: number;

  /** Average confidence of extracted emails */
  averageConfidence: number;

  /** Extraction methods used (diversity indicates comprehensive extraction) */
  methodsUsed: EmailExtractionMethod[];

  /** Percentage of emails verified */
  verificationRate?: number;
}
