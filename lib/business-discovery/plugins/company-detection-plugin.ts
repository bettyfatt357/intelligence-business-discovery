/**
 * Company Detection Plugin Interface
 * 
 * Plugin architecture for company detection methods.
 * Each source (schema.org, JSON-LD, OpenGraph, etc.) implements this interface.
 */

import type { Company, CompanyDetectionSource, CompanyQuality } from '../types/company';
import type { PageContent } from '../types/page-content';

export interface CompanyDetectionPlugin {
  /** Unique identifier for this source */
  readonly id: CompanyDetectionSource;

  /** Human-readable name of this detection source */
  readonly name: string;

  /** Description of how this method works */
  readonly description: string;

  /** Priority/order for detection (0 = highest priority) */
  readonly priority: number;

  /**
   * Detect if this source is available in the page.
   * Fast heuristic check.
   */
  isAvailable(pageContent: PageContent, html: string): boolean;

  /**
   * Attempt to detect company from this source.
   * Returns null if not found or applicable.
   */
  detect(pageContent: PageContent, html: string): Promise<Company | null>;

  /**
   * Get confidence weight for this source (0-1).
   * Used to calculate overall company confidence.
   */
  getConfidenceWeight(): number;
}

/**
 * Registry for company detection plugins
 */
export interface CompanyDetectionRegistry {
  /** Register a new detection plugin */
  register(plugin: CompanyDetectionPlugin): void;

  /** Get a specific plugin by ID */
  get(id: CompanyDetectionSource): CompanyDetectionPlugin | undefined;

  /** Get all registered plugins, sorted by priority */
  getAll(): CompanyDetectionPlugin[];

  /** Get plugins available for this page */
  getAvailable(pageContent: PageContent, html: string): CompanyDetectionPlugin[];

  /** Unregister a plugin */
  unregister(id: CompanyDetectionSource): void;
}

/**
 * Company detection result
 */
export interface CompanyDetectionResult {
  /** Detected company, if any */
  company: Company | null;

  /** Quality of detection */
  quality: CompanyQuality;

  /** All sources that were tried */
  triedSources: CompanyDetectionSource[];

  /** Sources that found a result */
  successfulSources: CompanyDetectionSource[];

  /** Execution time */
  durationMs: number;

  /** Success status */
  success: boolean;

  /** Any errors encountered */
  errors: string[];
}
