/**
 * Quality Scorer
 * 
 * Calculates comprehensive quality metrics for IntelligenceRecords.
 * Determines reliability, completeness, and actionability.
 */

import type { Company } from '../types/company';
import type { EmailIntelligence } from '../types/email-intelligence';
import type { PageContent } from '../types/page-content';
import type { EvidenceCollection } from '../types/evidence';
import type { QualityMetrics, QualityScores } from '../types/quality-metrics';

export interface QualityScoreWeights {
  /** Weight for company confidence (0-1) */
  companyWeight: number;

  /** Weight for email completeness (0-1) */
  emailCompletenessWeight: number;

  /** Weight for email accuracy (0-1) */
  emailAccuracyWeight: number;

  /** Weight for pattern matching (0-1) */
  patternWeight: number;

  /** Weight for evidence quality (0-1) */
  evidenceWeight: number;
}

export interface QualityScorer {
  /**
   * Score individual quality aspects
   */
  scoreCompanyConfidence(company: Company): number;

  scoreEmailCompleteness(emails: EmailIntelligence[]): number;

  scoreEmailAccuracy(emails: EmailIntelligence[]): number;

  scorePatternMatches(patternMatches: Array<any>): number;

  scoreEvidence(evidence: EvidenceCollection): number;

  /**
   * Calculate complete quality metrics for an extraction
   */
  scoreExtraction(input: {
    company: Company | null;
    emails: EmailIntelligence[];
    patternMatches: Array<any>;
    evidence: EvidenceCollection;
    pageContent: PageContent;
  }): QualityMetrics;

  /**
   * Calculate individual quality scores
   */
  calculateScores(input: {
    company: Company | null;
    emails: EmailIntelligence[];
    patternMatches: Array<any>;
    evidence: EvidenceCollection;
  }): QualityScores;

  /**
   * Convert numerical score to letter grade
   */
  gradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F';

  /**
   * Determine if a record is actionable
   */
  isActionable(metrics: QualityMetrics): boolean;

  /**
   * Get recommended actions based on quality metrics
   */
  getSuggestedActions(metrics: QualityMetrics): string[];

  /**
   * Set custom scoring weights
   */
  setWeights(weights: Partial<QualityScoreWeights>): void;

  /**
   * Get current scoring weights
   */
  getWeights(): QualityScoreWeights;
}

/**
 * Default quality scoring weights
 */
export const DEFAULT_QUALITY_WEIGHTS: QualityScoreWeights = {
  companyWeight: 0.20,
  emailCompletenessWeight: 0.35,
  emailAccuracyWeight: 0.25,
  patternWeight: 0.10,
  evidenceWeight: 0.10,
};

/**
 * Quality thresholds for actionability
 */
export const ACTIONABILITY_THRESHOLDS = {
  minOverallConfidence: 0.60,
  minEmailConfidence: 0.70,
  minEmailCount: 1,
  requireCompanyName: true,
  requirePatternMatch: false,
};
