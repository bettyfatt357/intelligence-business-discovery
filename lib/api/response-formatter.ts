/**
 * API Response Formatters
 * 
 * Handles versioning of API responses.
 * API v1: Legacy format (emails only) - UNCHANGED
 * API v2: Enterprise format (full intelligence) - NEW (Phase 2E)
 */

import { Job } from '../queue/types';

/**
 * API v1 Response Format (Legacy)
 * Returns only emails for backward compatibility
 */
export interface ApiV1JobResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  url: string;
  emails: string[];
  processingTime?: number;
  error?: string | null;
}

/**
 * API v2 Response Format (Enterprise Intelligence)
 * Full business discovery intelligence including company, metadata, quality scoring
 */
export interface ApiV2JobResponse {
  // Job metadata
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  url: string;
  processingTime?: number;
  error?: string | null;

  // Discovery context (from Phase 2B)
  discovery?: {
    keyword: string;
    generatedQuery: string;
    location?: string;
    googlePosition: number;
    googleTitle: string;
    googleSnippet: string;
    searchDepth: number;
  };

  // Intelligence extraction (from Phase 2D)
  intelligence?: {
    company?: {
      name: string;
      confidence: number;
      source: string;
      sources: Array<{
        type: string;
        confidence: number;
        value: string;
      }>;
    };
    
    emails: Array<{
      address: string;
      confidence: number;
      extractionMethod: string;
      extractionMethods: string[];
      evidence: string;
      verified: boolean;
    }>;

    metadata: {
      title: string;
      description?: string;
      ogTitle?: string;
      ogDescription?: string;
      ogImage?: string;
      canonical?: string;
      charset?: string;
    };

    extractionPatterns: Array<{
      pattern: string;
      stage: 'url' | 'html';
      confidence: number;
    }>;

    qualityScore: number;
    uniqueEmailCount: number;
    extractionMethods: string[];
    processedAt: number;
    errors?: string[];
  };

  // Legacy format (for compatibility with existing integrations)
  emails: string[];
}

/**
 * Format job as API v1 response (legacy, no intelligence)
 */
export function formatAsV1(job: Job): ApiV1JobResponse {
  return {
    id: job.id,
    status: job.status as any,
    url: job.url,
    emails: job.emails || [],
    processingTime: job.processingTime,
    error: job.error,
  };
}

/**
 * Format job as API v2 response (with full intelligence if available)
 */
export function formatAsV2(job: Job): ApiV2JobResponse {
  const base: ApiV2JobResponse = {
    id: job.id,
    status: job.status as any,
    url: job.url,
    processingTime: job.processingTime,
    error: job.error,
    emails: job.emails || [],
  };

  // Add discovery data if available (Phase 2B)
  if (job.discoveryData) {
    base.discovery = {
      keyword: job.discoveryData.keyword,
      generatedQuery: job.discoveryData.generatedQuery,
      location: job.discoveryData.location,
      googlePosition: job.discoveryData.googlePosition,
      googleTitle: job.discoveryData.googleTitle,
      googleSnippet: job.discoveryData.googleSnippet,
      searchDepth: job.discoveryData.searchDepth,
    };
  }

  // Add intelligence data if available (Phase 2D)
  if (job.intelligence) {
    base.intelligence = {
      company: job.intelligence.company,
      
      emails: (job.intelligence.emails || []).map((email) => ({
        address: email.address,
        confidence: email.confidence,
        extractionMethod: email.extractionMethod,
        extractionMethods: email.extractionMethod.split(', '),
        evidence: email.evidence,
        verified: email.verified,
      })),

      metadata: job.intelligence.pageMetadata || {
        title: '',
        charset: 'utf-8',
      },

      extractionPatterns: job.intelligence.matchedPatterns || [],
      qualityScore: job.intelligence.qualityScore || 0,
      uniqueEmailCount: (job.intelligence.emails || []).length,
      extractionMethods: [], // Will be populated from patterns
      processedAt: job.completedAt || Date.now(),
    };

    // Populate extraction methods from patterns
    const methods = new Set<string>();
    (job.intelligence.matchedPatterns || []).forEach(p => {
      methods.add(p.pattern);
    });
    base.intelligence.extractionMethods = Array.from(methods);
  }

  return base;
}

/**
 * Format job list as API v1 responses
 */
export function formatListAsV1(jobs: Job[]): ApiV1JobResponse[] {
  return jobs.map(formatAsV1);
}

/**
 * Format job list as API v2 responses
 */
export function formatListAsV2(jobs: Job[]): ApiV2JobResponse[] {
  return jobs.map(formatAsV2);
}

/**
 * Batch format response based on API version
 */
export function formatResponse<T extends Job | Job[]>(
  data: T,
  apiVersion: 'v1' | 'v2'
): T extends Job[]
  ? ApiV1JobResponse[] | ApiV2JobResponse[]
  : ApiV1JobResponse | ApiV2JobResponse {
  if (Array.isArray(data)) {
    return (apiVersion === 'v1'
      ? formatListAsV1(data as Job[])
      : formatListAsV2(data as Job[])) as any;
  }

  return (apiVersion === 'v1'
    ? formatAsV1(data as Job)
    : formatAsV2(data as Job)) as any;
}

/**
 * Filter high-quality results for API v2
 */
export function filterHighQuality(jobs: Job[], threshold: number = 0.6): ApiV2JobResponse[] {
  return jobs
    .filter(job => {
      if (!job.intelligence?.qualityScore) return false;
      return job.intelligence.qualityScore >= threshold;
    })
    .map(formatAsV2);
}

/**
 * Sort results by quality score (v2 only)
 */
export function sortByQuality(jobs: Job[]): ApiV2JobResponse[] {
  return jobs
    .sort((a, b) => {
      const scoreA = a.intelligence?.qualityScore || 0;
      const scoreB = b.intelligence?.qualityScore || 0;
      return scoreB - scoreA;
    })
    .map(formatAsV2);
}

/**
 * Extract summary statistics from jobs (v2 only)
 */
export function extractSummary(jobs: Job[]) {
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const failedJobs = jobs.filter(j => j.status === 'failed').length;
  
  const intelligenceJobs = jobs.filter(j => j.intelligence).length;
  const avgQuality = intelligenceJobs > 0
    ? jobs.reduce((sum, j) => sum + (j.intelligence?.qualityScore || 0), 0) / intelligenceJobs
    : 0;

  const totalEmails = jobs.reduce((sum, j) => sum + (j.emails?.length || 0), 0);
  const uniqueEmails = new Set(jobs.flatMap(j => j.emails || [])).size;

  const companiesDetected = jobs
    .filter(j => j.intelligence?.company)
    .reduce((acc, j) => {
      const company = j.intelligence?.company?.name;
      if (company) {
        acc[company] = (acc[company] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

  return {
    totalJobs,
    completedJobs,
    failedJobs,
    successRate: totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0,
    intelligenceAvailable: intelligenceJobs,
    averageQualityScore: avgQuality,
    totalEmails,
    uniqueEmails,
    companiesDetected,
    extractionMethods: Array.from(
      new Set(
        jobs
          .filter(j => j.intelligence?.extractionMethods)
          .flatMap(j => j.intelligence?.extractionMethods || [])
      )
    ),
  };
}

/**
 * Export formats for different use cases
 */
export const exportFormats = {
  /**
   * CSV export for Excel/Sheets
   */
  csv: (jobs: Job[]): string => {
    const headers = [
      'Job ID',
      'Status',
      'URL',
      'Company',
      'Email Count',
      'Emails',
      'Quality Score',
      'Processing Time (ms)',
      'Processed At',
    ];

    const rows = jobs.map(job => [
      job.id,
      job.status,
      job.url,
      job.intelligence?.company?.name || '',
      job.intelligence?.emails?.length || 0,
      (job.emails || []).join('; '),
      (job.intelligence?.qualityScore || 0).toFixed(2),
      job.processingTime || '',
      new Date(job.completedAt || 0).toISOString(),
    ]);

    return [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  },

  /**
   * JSONL export (one JSON object per line)
   */
  jsonl: (jobs: Job[]): string => {
    return jobs.map(job => JSON.stringify(formatAsV2(job))).join('\n');
  },

  /**
   * JSON array export
   */
  json: (jobs: Job[]): string => {
    return JSON.stringify(formatListAsV2(jobs), null, 2);
  },
};
