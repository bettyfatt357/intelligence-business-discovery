/**
 * IntelligenceRecord
 * 
 * Complete business intelligence for a discovery.
 * Final comprehensive result combining all discovery, extraction, and analysis.
 */

import type { DiscoveryRecord } from './discovery-record';
import type { Company, CompanyQuality } from './company';
import type { EmailIntelligence, EmailQuality } from './email-intelligence';
import type { PageContent } from './page-content';
import type { EvidenceCollection } from './evidence';
import type { QualityMetrics } from './quality-metrics';

export interface IntelligenceRecord {
  /** Unique identifier */
  id: string;

  /** Original discovery that led to this intelligence */
  discovery: DiscoveryRecord;

  /** Page content and metadata extracted */
  pageContent: PageContent;

  /** Detected company information */
  company: Company;
  companyQuality: CompanyQuality;

  /** Extracted emails and their extraction methods */
  emails: EmailIntelligence[];
  emailQuality: EmailQuality;

  /** Pattern matches found in the page */
  patternMatches: Array<{
    pattern: string;
    matches: number; // How many times found
    locations: string[]; // Where found (e.g., ['title', 'body', 'form'])
    confidence: number;
  }>;

  /** All evidence collected during processing */
  evidence: EvidenceCollection;

  /** Processing status and result */
  processing: {
    status: 'success' | 'partial' | 'failed';
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
    errors: string[];
    warnings: string[];
  };

  /** Quality and scoring */
  quality: QualityMetrics;

  /** Overall result actionability */
  actionability: {
    canContact: boolean;
    primaryEmail?: string;
    verified: boolean;
    readyForOutreach: boolean;
  };

  /** Processing metadata */
  metadata: {
    processingVersion: string; // Algorithm version
    dataVersion: string; // Schema version
    processingStages: string[]; // Which stages were run
    runtimeMs: number;
  };
}

/**
 * Statistics about a batch of IntelligenceRecords
 */
export interface BatchStatistics {
  totalRecords: number;
  successfulRecords: number;
  partialRecords: number;
  failedRecords: number;
  averageQuality: number;
  averageEmailCount: number;
  recordsWithVerifiedEmails: number;
  recordsReadyForOutreach: number;
  totalUniqueEmails: number;
  averageProcessingTimeMs: number;
}
