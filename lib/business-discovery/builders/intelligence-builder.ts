/**
 * Intelligence Builder
 * 
 * Orchestrates all extraction, detection, and analysis to build an IntelligenceRecord.
 * This is the main entry point for transforming a discovery into actionable intelligence.
 */

import type { DiscoveryRecord } from '../types/discovery-record';
import type { IntelligenceRecord, BatchStatistics } from '../types/intelligence-record';
import type { PageContent } from '../types/page-content';
import type { DeobfuscationRegistry } from '../plugins/deobfuscation-plugin';
import type { CompanyDetectionRegistry } from '../plugins/company-detection-plugin';
import type { PatternMatchingRegistry } from '../plugins/pattern-matching-plugin';

export interface IntelligenceBuilderOptions {
  /** Registries for plugins */
  deobfuscationRegistry: DeobfuscationRegistry;
  companyDetectionRegistry: CompanyDetectionRegistry;
  patternMatchingRegistry: PatternMatchingRegistry;

  /** Quality scorer instance */
  qualityScorer?: any; // Will be imported as QualityScorer

  /** Whether to require all plugins to run */
  requireAllPlugins?: boolean;

  /** Timeout for extraction operations */
  extractionTimeoutMs?: number;

  /** Maximum time for entire build process */
  buildTimeoutMs?: number;
}

export interface IntelligenceBuildProcess {
  /** Start timestamp */
  startedAt: Date;

  /** Completion timestamp */
  completedAt?: Date;

  /** Which stages have completed */
  completedStages: string[];

  /** Current stage */
  currentStage?: string;

  /** Any errors encountered during building */
  errors: string[];

  /** Warnings (non-fatal issues) */
  warnings: string[];

  /** Progress percentage (0-100) */
  progress: number;
}

export interface IntelligenceBuilder {
  /**
   * Build a complete IntelligenceRecord from discovery and page content.
   */
  build(
    discovery: DiscoveryRecord,
    pageContent: PageContent,
    html: string
  ): Promise<IntelligenceRecord>;

  /**
   * Build with detailed process tracking.
   */
  buildWithProgress(
    discovery: DiscoveryRecord,
    pageContent: PageContent,
    html: string,
    onProgress?: (process: IntelligenceBuildProcess) => void
  ): Promise<IntelligenceRecord>;

  /**
   * Build multiple records in batch.
   */
  buildBatch(
    items: Array<{
      discovery: DiscoveryRecord;
      pageContent: PageContent;
      html: string;
    }>
  ): Promise<{
    records: IntelligenceRecord[];
    statistics: BatchStatistics;
    errors: Array<{ index: number; error: string }>;
  }>;

  /**
   * Validate that an IntelligenceRecord is complete and valid.
   */
  validate(record: IntelligenceRecord): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };

  /**
   * Get registry instances
   */
  getDeobfuscationRegistry(): DeobfuscationRegistry;
  getCompanyDetectionRegistry(): CompanyDetectionRegistry;
  getPatternMatchingRegistry(): PatternMatchingRegistry;
}

/**
 * Default orchestration steps for building intelligence
 */
export const INTELLIGENCE_BUILD_STEPS = [
  'initialize',
  'detect-company',
  'extract-emails',
  'match-patterns',
  'collect-evidence',
  'calculate-quality',
  'finalize',
] as const;
