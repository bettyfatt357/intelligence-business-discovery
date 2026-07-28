/**
 * Deobfuscation Plugin Interface
 * 
 * Plugin architecture for email extraction methods.
 * Each method implements this interface to participate in the extraction pipeline.
 */

import type { EmailExtractionMethod } from '../types/email-intelligence';

export interface DeobfuscationPlugin {
  /** Unique identifier for this method */
  readonly id: EmailExtractionMethod;

  /** Human-readable name */
  readonly name: string;

  /** Description of what this method detects */
  readonly description: string;

  /** Whether this method requires JavaScript rendering */
  readonly requiresJSRendering: boolean;

  /**
   * Detect if this method might be used in the given HTML.
   * Fast heuristic check - doesn't extract, just indicates applicability.
   */
  canDetect(html: string): boolean;

  /**
   * Extract emails using this method.
   * Returns all emails found using this specific deobfuscation technique.
   */
  extract(html: string): Promise<string[]>;

  /**
   * Extract with context - returns emails with evidence.
   */
  extractWithContext(html: string): Promise<Array<{
    email: string;
    evidence: string; // The snippet where it was found
    confidence: number;
  }>>;
}

/**
 * Registry for deobfuscation plugins
 */
export interface DeobfuscationRegistry {
  /** Register a new plugin */
  register(plugin: DeobfuscationPlugin): void;

  /** Get a specific plugin by ID */
  get(id: EmailExtractionMethod): DeobfuscationPlugin | undefined;

  /** Get all registered plugins */
  getAll(): DeobfuscationPlugin[];

  /** Get plugins that can handle the given HTML */
  getApplicable(html: string): DeobfuscationPlugin[];

  /** Unregister a plugin */
  unregister(id: EmailExtractionMethod): void;
}

/**
 * Plugin execution result
 */
export interface DeobfuscationResult {
  /** Method used */
  method: EmailExtractionMethod;

  /** Emails found */
  emails: string[];

  /** Emails with context */
  emailsWithContext: Array<{
    email: string;
    evidence: string;
    confidence: number;
  }>;

  /** Execution time */
  durationMs: number;

  /** Success status */
  success: boolean;

  /** Any errors encountered */
  error?: string;
}
