/**
 * Intelligence Extraction Orchestrator
 * 
 * Coordinates extraction of business intelligence from web pages.
 * Runs deobfuscation methods, company detection, and builds comprehensive results.
 */

import { runAllDeobfuscationMethods, runExternalJavaScriptScan, DeobfuscationResult } from './deobfuscation-methods';
import { detectCompany, CompanyDetection, normalizeCompanyName } from './company-detector';

export interface ExtractedEmail {
  address: string;
  confidence: number;
  extractionMethod: string;
  evidence: string;
  verified: boolean;
}

export interface PageMetadata {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  charset?: string;
}

export interface ExtractionIntelligence {
  url: string;
  title: string;
  company: CompanyDetection | null;
  emails: ExtractedEmail[];
  metadata: PageMetadata;
  qualityScore: number; // 0-1
  extractionMethods: string[];
  uniqueEmailCount: number;
  processedAt: number;
  errors: string[];
}

/**
 * Extract page metadata from HTML
 */
function extractMetadata(html: string, url: string): PageMetadata {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(/<meta\s+name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']+)['"]/i);
  const ogTitleMatch = html.match(/<meta\s+property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)['"]/i);
  const ogDescMatch = html.match(/<meta\s+property\s*=\s*["']og:description["'][^>]*content\s*=\s*["']([^"']+)['"]/i);
  const ogImageMatch = html.match(/<meta\s+property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)['"]/i);
  const canonicalMatch = html.match(/<link\s+rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)['"]/i);
  const charsetMatch = html.match(/<meta\s+charset\s*=\s*["']?([^\s"']+)/i);

  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    description: descMatch ? descMatch[1] : undefined,
    ogTitle: ogTitleMatch ? ogTitleMatch[1] : undefined,
    ogDescription: ogDescMatch ? ogDescMatch[1] : undefined,
    ogImage: ogImageMatch ? ogImageMatch[1] : undefined,
    canonical: canonicalMatch ? canonicalMatch[1] : undefined,
    charset: charsetMatch ? charsetMatch[1] : 'utf-8',
  };
}

/**
 * Deduplicate and deduplicate emails with confidence aggregation
 */
function deduplicateEmails(allEmails: Array<{ address: string; method: string; evidence: string; confidence: number }>): ExtractedEmail[] {
  const emailMap = new Map<string, { methods: string[]; confidence: number; evidence: string[] }>();

  allEmails.forEach(email => {
    const normalized = email.address.toLowerCase();
    const existing = emailMap.get(normalized);

    if (existing) {
      // Aggregate methods and confidence
      if (!existing.methods.includes(email.method)) {
        existing.methods.push(email.method);
      }
      existing.confidence = Math.min(0.99, existing.confidence + 0.05); // Boost confidence if found by multiple methods
      existing.evidence.push(email.evidence);
    } else {
      emailMap.set(normalized, {
        methods: [email.method],
        confidence: email.confidence,
        evidence: [email.evidence],
      });
    }
  });

  return Array.from(emailMap.entries()).map(([address, data]) => ({
    address,
    confidence: Math.min(0.99, data.confidence),
    extractionMethod: data.methods.join(', '),
    evidence: data.evidence[0] || address, // Use first evidence snippet
    verified: false,
  }));
}

/**
 * Calculate overall quality score based on extraction results
 */
function calculateQualityScore(emails: ExtractedEmail[], company: CompanyDetection | null, methodCount: number): number {
  let score = 0;

  // Email extraction contribution (0-0.5)
  if (emails.length > 0) {
    const avgConfidence = emails.reduce((sum, e) => sum + e.confidence, 0) / emails.length;
    score += Math.min(0.5, (emails.length / 3) * 0.3 + avgConfidence * 0.2); // 3+ emails = max points
  }

  // Company detection contribution (0-0.3)
  if (company && company.confidence > 0.5) {
    score += company.confidence * 0.3;
  }

  // Extraction method diversity (0-0.2)
  if (methodCount > 1) {
    score += Math.min(0.2, (methodCount / 10) * 0.2); // 10+ methods = max points
  }

  return Math.min(0.99, score);
}

/**
 * Main orchestration function - extract all intelligence from a page
 */
export async function extractIntelligence(html: string, url: string): Promise<ExtractionIntelligence> {
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    // Step 1: Extract metadata
    let metadata: PageMetadata;
    try {
      metadata = extractMetadata(html, url);
    } catch (error) {
      metadata = { title: '', charset: 'utf-8' };
      errors.push(`Metadata extraction error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 2: Detect company
    let company: CompanyDetection | null = null;
    try {
      company = detectCompany(html, url);
    } catch (error) {
      errors.push(`Company detection error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 3: Run deobfuscation methods
    let deobfResults: DeobfuscationResult[] = [];
    let extractionMethods: string[] = [];
    try {
      deobfResults = runAllDeobfuscationMethods(html);
      extractionMethods = deobfResults.map(r => r.method);
    } catch (error) {
      errors.push(`Deobfuscation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 3b: Scan same-origin external JavaScript files (async). Reuses the
    // existing async runner, which already normalizes/validates emails and
    // returns the standard DeobfuscationResult shape. Merging into deobfResults
    // lets the results flow through the same aggregation, dedup, confidence,
    // and evidence pipeline below without any special handling.
    try {
      const jsResult = await runExternalJavaScriptScan(html, url);
      if (jsResult) {
        deobfResults.push(jsResult);
        extractionMethods.push(jsResult.method);
      }
    } catch (error) {
      errors.push(`External JS scan error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 4: Aggregate emails
    const allEmails: Array<{ address: string; method: string; evidence: string; confidence: number }> = [];
    deobfResults.forEach(result => {
      result.emails.forEach((email, index) => {
        allEmails.push({
          address: email,
          method: result.method,
          evidence: result.evidence[index] || email,
          confidence: result.confidence,
        });
      });
    });

    const emails = deduplicateEmails(allEmails);

    // Step 5: Calculate quality score
    const qualityScore = calculateQualityScore(emails, company, extractionMethods.length);

    const processingTime = Date.now() - startTime;
    console.log(`[INTELLIGENCE] Processed ${url} in ${processingTime}ms: ${emails.length} emails, ${company ? 'company detected' : 'no company'}`);

    return {
      url,
      title: metadata.title,
      company,
      emails,
      metadata,
      qualityScore,
      extractionMethods,
      uniqueEmailCount: emails.length,
      processedAt: Date.now(),
      errors,
    };
  } catch (error) {
    console.error(`[INTELLIGENCE] Critical error extracting intelligence from ${url}:`, error);
    
    return {
      url,
      title: '',
      company: null,
      emails: [],
      metadata: { title: '', charset: 'utf-8' },
      qualityScore: 0,
      extractionMethods: [],
      uniqueEmailCount: 0,
      processedAt: Date.now(),
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Batch extraction with progress tracking
 */
export async function extractIntelligenceBatch(
  pages: Array<{ html: string; url: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<ExtractionIntelligence[]> {
  const results: ExtractionIntelligence[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const intelligence = await extractIntelligence(page.html, page.url);
    results.push(intelligence);

    if (onProgress) {
      onProgress(i + 1, pages.length);
    }
  }

  return results;
}

/**
 * Filter results by quality threshold
 */
export function filterByQuality(results: ExtractionIntelligence[], threshold: number = 0.5): ExtractionIntelligence[] {
  return results.filter(r => r.qualityScore >= threshold);
}

/**
 * Sort results by quality
 */
export function sortByQuality(results: ExtractionIntelligence[]): ExtractionIntelligence[] {
  return [...results].sort((a, b) => b.qualityScore - a.qualityScore);
}
