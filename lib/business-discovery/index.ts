/**
 * Business Discovery Domain Layer
 * 
 * Storage-agnostic domain model for the Business Discovery Engine.
 * All search, queue, worker, extraction, and dashboard components depend on this domain.
 * 
 * This layer defines what the business discovery system knows and does,
 * independent of how data is stored or displayed.
 */

export * from './types/discovery-record';
export * from './types/intelligence-record';
export * from './types/company';
export * from './types/page-content';
export * from './types/evidence';
export * from './types/email-intelligence';
export * from './types/quality-metrics';
export * from './types/errors';

export * from './plugins/deobfuscation-plugin';
export * from './plugins/company-detection-plugin';
export * from './plugins/pattern-matching-plugin';

export * from './builders/intelligence-builder';
export * from './builders/quality-scorer';
