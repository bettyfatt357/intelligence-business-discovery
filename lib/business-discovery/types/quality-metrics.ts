/**
 * QualityMetrics
 * 
 * Comprehensive quality scoring for discovery results.
 * Determines reliability and actionability of the intelligence.
 */

export interface QualityScores {
  /** Company identification confidence (0-1) */
  companyConfidence: number;

  /** Email extraction completeness (0-1) */
  emailCompleteness: number;

  /** Email extraction accuracy (0-1) */
  emailAccuracy: number;

  /** Pattern matching confidence (0-1) */
  patternConfidence: number;

  /** Overall discovery quality (0-1) */
  overallQuality: number;
}

export interface QualityMetrics {
  /** Overall confidence in this discovery (0-1) */
  confidence: number;

  /** Individual quality scores */
  scores: QualityScores;

  /** Quality grade (A-F) */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';

  /** Detailed quality factors */
  factors: {
    hasCompanyName: boolean;
    hasVerifiedEmails: boolean;
    hasMultipleExtractionMethods: boolean;
    hasPatternMatches: boolean;
    hasStructuredMarkup: boolean;
    pageIsResponsive: boolean;
    pageHasModernFramework: boolean;
  };

  /** Quality issues/warnings */
  warnings: string[];

  /** Why quality is at this level */
  explanation: string;

  /** Actionability assessment */
  actionability: {
    /** Whether result is ready for use */
    isActionable: boolean;
    /** Recommended actions */
    suggestedActions: string[];
    /** Any manual verification needed */
    needsVerification: boolean;
  };

  /** Scoring calculation details */
  details: {
    sourcesUsed: string[];
    methodsUsed: string[];
    timeTakenMs: number;
  };
}

/**
 * Quality thresholds for discovery results
 */
export const QUALITY_THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.65,
  LOW: 0.40,
  MINIMUM: 0.0,
};

export const QUALITY_GRADES = {
  A: { min: 0.90, max: 1.0, label: 'Excellent' },
  B: { min: 0.80, max: 0.89, label: 'Good' },
  C: { min: 0.65, max: 0.79, label: 'Fair' },
  D: { min: 0.40, max: 0.64, label: 'Poor' },
  F: { min: 0.0, max: 0.39, label: 'Very Poor' },
};
