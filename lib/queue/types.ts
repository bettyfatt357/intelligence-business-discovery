export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  url: string;
  normalizedUrl?: string; // For deduplication
  status: JobStatus;
  emails: string[];
  retries: number;
  maxRetries: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  processingTime?: number; // Duration in ms
  emailsFound?: number; // Count of emails
  error: string | null;
  source?: string; // Where did this job come from?
  query?: string; // Search query if applicable
  domain?: string; // Extracted domain for grouping
  attempts?: number; // Number of extraction attempts

  // Business Discovery Domain (Phase 2B+)
  // Optional: DiscoveryRecord data structure for enhanced intelligence
  // Backward compatible: existing jobs work without these fields
  discoveryData?: {
    keyword: string;
    generatedQuery: string;
    location?: string;
    googlePosition: number;
    googleTitle: string;
    googleSnippet: string;
    matchedUrlPattern?: string | null;
    timestamp: number;
    searchDepth: number;
  };

  // Intelligence extraction results (Phase 2D+)
  // Optional: Enhanced results from intelligence extraction engine
  intelligence?: {
    company?: {
      name: string;
      confidence: number;
      source: string;
    };
    emails?: Array<{
      address: string;
      confidence: number;
      extractionMethod: string;
      evidence: string;
      pageSection?: string;
      snippet?: string;
    }>;
    pageMetadata?: {
      title: string;
      description?: string;
      ogTitle?: string;
      ogDescription?: string;
      ogImage?: string;
      schemaOrgType?: string;
    };
    matchedPatterns?: Array<{
      pattern: string;
      stage: 'url' | 'html';
      confidence: number;
    }>;
    qualityScore?: number;
  };
}

export interface QueueConfig {
  redisUrl: string;
  maxRetries?: number;
  jobTimeout?: number; // in ms
}

export interface URLNormalizationOptions {
  removeTrailingSlash?: boolean;
  lowercaseDomain?: boolean;
  removeUtmParams?: boolean;
  normalizeProtocol?: boolean;
}
