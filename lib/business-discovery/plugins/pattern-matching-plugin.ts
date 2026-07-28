/**
 * Pattern Matching Plugin Interface
 * 
 * Plugin architecture for pattern matching in URL, metadata, and HTML.
 * Patterns are applied in 3 stages: search query generation, URL validation, HTML matching.
 */

import type { PageContent } from '../types/page-content';

export type PatternStage = 'query-generation' | 'url-validation' | 'html-matching';
export type PatternType = 'keyword' | 'regex' | 'url-path';

export interface PatternDefinition {
  /** Unique pattern identifier */
  id: string;

  /** Pattern value (keyword, regex, or URL path) */
  value: string;

  /** Type of pattern */
  type: PatternType;

  /** Description of what this pattern matches */
  description: string;

  /** Which stages this pattern is used in */
  stages: PatternStage[];

  /** Priority for execution order */
  priority: number;
}

export interface PatternMatchingPlugin {
  /** Unique identifier for this pattern */
  readonly id: string;

  /** The pattern definition */
  readonly pattern: PatternDefinition;

  /**
   * Check if pattern matches in URL.
   * Used during Stage 2 (URL validation).
   */
  matchesUrl(url: string): boolean;

  /**
   * Check if pattern matches in page metadata.
   * Used at beginning of Stage 3 (HTML matching).
   */
  matchesMetadata(pageContent: PageContent): boolean;

  /**
   * Find all pattern matches in HTML content.
   * Used in Stage 3 (HTML matching) for comprehensive detection.
   */
  matchesHtml(html: string): Array<{
    location: string;
    context: string;
    confidence: number;
  }>;

  /**
   * Calculate overall confidence for this pattern match.
   */
  calculateConfidence(
    urlMatch: boolean,
    metadataMatch: boolean,
    htmlMatches: number
  ): number;
}

/**
 * Registry for pattern matching plugins
 */
export interface PatternMatchingRegistry {
  /** Register a pattern */
  register(plugin: PatternMatchingPlugin): void;

  /** Get patterns for a specific stage */
  getForStage(stage: PatternStage): PatternMatchingPlugin[];

  /** Get all registered patterns */
  getAll(): PatternMatchingPlugin[];

  /** Unregister a pattern */
  unregister(id: string): void;
}

/**
 * Pattern matching result
 */
export interface PatternMatchingResult {
  /** Pattern that was matched */
  patternId: string;

  /** Stages where matched */
  matchedStages: PatternStage[];

  /** Overall confidence */
  confidence: number;

  /** Evidence of matches */
  evidence: Array<{
    stage: PatternStage;
    location: string;
    context: string;
  }>;

  /** Execution time */
  durationMs: number;
}
