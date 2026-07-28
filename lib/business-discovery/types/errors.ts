/**
 * Business Discovery Domain Errors
 * 
 * Domain-specific error types for discovery processing.
 */

export class BusinessDiscoveryError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'BusinessDiscoveryError';
  }
}

export class DiscoveryExtractionError extends BusinessDiscoveryError {
  constructor(message: string, public url: string, public stage: string) {
    super(message, 'EXTRACTION_ERROR');
    this.name = 'DiscoveryExtractionError';
  }
}

export class CompanyDetectionError extends BusinessDiscoveryError {
  constructor(message: string) {
    super(message, 'COMPANY_DETECTION_ERROR');
    this.name = 'CompanyDetectionError';
  }
}

export class EmailExtractionError extends BusinessDiscoveryError {
  constructor(message: string) {
    super(message, 'EMAIL_EXTRACTION_ERROR');
    this.name = 'EmailExtractionError';
  }
}

export class PatternMatchingError extends BusinessDiscoveryError {
  constructor(message: string) {
    super(message, 'PATTERN_MATCHING_ERROR');
    this.name = 'PatternMatchingError';
  }
}

export class IntelligenceBuilderError extends BusinessDiscoveryError {
  constructor(message: string) {
    super(message, 'INTELLIGENCE_BUILDER_ERROR');
    this.name = 'IntelligenceBuilderError';
  }
}
