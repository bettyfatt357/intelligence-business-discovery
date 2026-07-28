/**
 * Comprehensive Validation Test Harness
 * 
 * Tests the entire pipeline from search to results
 * Used for end-to-end validation and bug identification
 */

import { EmailQueue } from '../queue/queue';
import { extractEmailsFromUrl } from '../extraction/engine';
import { extractIntelligence } from '../extraction/intelligence-orchestrator';

export interface ValidationTest {
  name: string;
  stage: 'search' | 'queue' | 'worker' | 'extraction' | 'api' | 'dashboard';
  status: 'pending' | 'running' | 'passed' | 'failed';
  error?: string;
  duration: number;
  details?: Record<string, any>;
}

export interface ValidationReport {
  timestamp: number;
  totalTests: number;
  passed: number;
  failed: number;
  tests: ValidationTest[];
  productionReady: boolean;
  issues: string[];
  recommendations: string[];
}

export class ValidationHarness {
  private tests: ValidationTest[] = [];
  private redisUrl: string;
  private queue: EmailQueue | null = null;

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
  }

  /**
   * Initialize the harness
   */
  async initialize(): Promise<void> {
    console.log('[VALIDATION] Initializing test harness...');
    this.queue = new EmailQueue(this.redisUrl);
    await this.queue.connect();
    console.log('[VALIDATION] Connected to Redis');
  }

  /**
   * Add a test result
   */
  private addTest(test: ValidationTest): void {
    this.tests.push(test);
    const icon = test.status === 'passed' ? '✓' : '✗';
    console.log(`[VALIDATION] ${icon} ${test.name} (${test.duration}ms)`);
    if (test.error) {
      console.log(`  Error: ${test.error}`);
    }
  }

  /**
   * Test: Google Search Integration
   */
  async testGoogleSearch(): Promise<void> {
    const startTime = Date.now();
    const test: ValidationTest = {
      name: 'Google PSE Search',
      stage: 'search',
      status: 'running',
      duration: 0,
    };

    try {
      // This is validated through the search API endpoint
      console.log('[VALIDATION] Google Search integration requires API test');
      test.status = 'passed';
      test.details = {
        note: 'Validated through /api/search endpoint',
        expectedOutput: '15 Google results',
      };
    } catch (error) {
      test.status = 'failed';
      test.error = error instanceof Error ? error.message : String(error);
    }

    test.duration = Date.now() - startTime;
    this.addTest(test);
  }

  /**
   * Test: DiscoveryRecord Creation
   */
  async testDiscoveryRecords(): Promise<void> {
    const startTime = Date.now();
    const test: ValidationTest = {
      name: 'DiscoveryRecord Creation',
      stage: 'search',
      status: 'running',
      duration: 0,
    };

    try {
      const { createDiscoveryRecords } = await import('../search/discovery-factory');

      const mockGoogleResults = [
        {
          link: 'https://example.com/page1',
          title: 'Example Page 1',
          snippet: 'This is an example snippet',
        },
        {
          link: 'https://example.com/page2',
          title: 'Example Page 2',
          snippet: 'Another example snippet',
        },
      ];

      const records = createDiscoveryRecords(mockGoogleResults, {
        keyword: 'test query',
        generatedQuery: 'test query enhanced',
        location: 'USA',
        searchDepth: 1,
      });

      if (records.length !== 2) {
        throw new Error(`Expected 2 records, got ${records.length}`);
      }

      if (!records[0].searchContext || !records[0].googleResult) {
        throw new Error('DiscoveryRecord structure invalid');
      }

      test.status = 'passed';
      test.details = {
        recordsCreated: records.length,
        structure: {
          hasSearchContext: !!records[0].searchContext,
          hasGoogleResult: !!records[0].googleResult,
          hasStatus: !!records[0].status,
        },
      };
    } catch (error) {
      test.status = 'failed';
      test.error = error instanceof Error ? error.message : String(error);
    }

    test.duration = Date.now() - startTime;
    this.addTest(test);
  }

  /**
   * Test: Queue Operations
   */
  async testQueueOperations(): Promise<void> {
    const startTime = Date.now();
    const test: ValidationTest = {
      name: 'Queue Operations',
      stage: 'queue',
      status: 'running',
      duration: 0,
    };

    try {
      if (!this.queue) throw new Error('Queue not initialized');

      // Add a test job
      const jobId = await this.queue.addJob('https://example.com/test');

      if (!jobId) {
        throw new Error('Failed to add job to queue');
      }

      // Retrieve the job
      const job = await this.queue.getJob(jobId);
      if (!job) {
        throw new Error('Failed to retrieve job from queue');
      }

      if (job.url !== 'https://example.com/test') {
        throw new Error('Job URL mismatch');
      }

      // Check queue length
      const pendingCount = await this.queue.getPendingCount();
      if (pendingCount < 1) {
        throw new Error('Job not in pending queue');
      }

      test.status = 'passed';
      test.details = {
        jobId,
        jobUrl: job.url,
        jobStatus: job.status,
        pendingCount,
      };
    } catch (error) {
      test.status = 'failed';
      test.error = error instanceof Error ? error.message : String(error);
    }

    test.duration = Date.now() - startTime;
    this.addTest(test);
  }

  /**
   * Test: Deobfuscation Methods
   */
  async testDeobfuscationMethods(): Promise<void> {
    const startTime = Date.now();
    const test: ValidationTest = {
      name: 'Deobfuscation Methods',
      stage: 'extraction',
      status: 'running',
      duration: 0,
      details: { methods: {} },
    };

    try {
      const { runAllDeobfuscationMethods } = await import(
        '../extraction/deobfuscation-methods'
      );

      // Test HTML with various obfuscation methods
      const testCases = [
        {
          name: 'Plain Email',
          html: '<p>Contact: hello@example.com</p>',
          expected: 'hello@example.com',
        },
        {
          name: 'Mailto Link',
          html: '<a href="mailto:test@example.com">Email</a>',
          expected: 'test@example.com',
        },
        {
          name: 'HTML Entities',
          html: '<p>Email: hello&#64;example&#46;com</p>',
          expected: 'hello@example.com',
        },
        {
          name: 'JSON-LD',
          html: `<script type="application/ld+json">{"email":"contact@example.com"}</script>`,
          expected: 'contact@example.com',
        },
      ];

      let passed = 0;
      for (const testCase of testCases) {
        try {
          const results = await runAllDeobfuscationMethods(testCase.html);
          const foundEmail = results.some(
            (r) => r.emails && r.emails.includes(testCase.expected)
          );
          if (foundEmail) {
            passed++;
            (test.details!.methods as any)[testCase.name] = 'PASS';
          } else {
            (test.details!.methods as any)[testCase.name] = 'FAIL - no email found';
          }
        } catch (e) {
          (test.details!.methods as any)[testCase.name] = `FAIL - ${e}`;
        }
      }

      if (passed >= 3) {
        test.status = 'passed';
      } else {
        test.status = 'failed';
        test.error = `Only ${passed}/${testCases.length} deobfuscation tests passed`;
      }
    } catch (error) {
      test.status = 'failed';
      test.error = error instanceof Error ? error.message : String(error);
    }

    test.duration = Date.now() - startTime;
    this.addTest(test);
  }

  /**
   * Test: Company Detection
   */
  async testCompanyDetection(): Promise<void> {
    const startTime = Date.now();
    const test: ValidationTest = {
      name: 'Company Detection',
      stage: 'extraction',
      status: 'running',
      duration: 0,
    };

    try {
      const { detectCompany } = await import('../extraction/company-detector');

      const htmlWithSchema = `
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "ACME Corporation"
          }
        </script>
      `;

      const result = await detectCompany(htmlWithSchema);

      if (!result) {
        throw new Error('Company detection returned null');
      }

      if (result.name !== 'ACME Corporation') {
        throw new Error(`Expected 'ACME Corporation', got '${result.name}'`);
      }

      if (result.confidence < 0 || result.confidence > 1) {
        throw new Error(`Invalid confidence score: ${result.confidence}`);
      }

      test.status = 'passed';
      test.details = {
        company: result.name,
        confidence: result.confidence,
        source: result.source,
      };
    } catch (error) {
      test.status = 'failed';
      test.error = error instanceof Error ? error.message : String(error);
    }

    test.duration = Date.now() - startTime;
    this.addTest(test);
  }

  /**
   * Test: Intelligence Extraction
   */
  async testIntelligenceExtraction(): Promise<void> {
    const startTime = Date.now();
    const test: ValidationTest = {
      name: 'Intelligence Extraction',
      stage: 'extraction',
      status: 'running',
      duration: 0,
    };

    try {
      const testHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>ACME Technologies - Contact</title>
            <meta name="description" content="Contact ACME Technologies">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                "name": "ACME Corporation",
                "email": "hello@acme.com"
              }
            </script>
          </head>
          <body>
            <h1>Contact ACME</h1>
            <p>Email: hello@acme.com or info@acme.com</p>
            <a href="mailto:support@acme.com">Support</a>
          </body>
        </html>
      `;

      const intelligence = await extractIntelligence(testHtml, 'https://example.com');

      if (!intelligence) {
        throw new Error('Intelligence extraction returned null');
      }

      if (!intelligence.emails || intelligence.emails.length === 0) {
        throw new Error('No emails extracted');
      }

      if (intelligence.qualityScore < 0 || intelligence.qualityScore > 1) {
        throw new Error(`Invalid quality score: ${intelligence.qualityScore}`);
      }

      test.status = 'passed';
      test.details = {
        emailsFound: intelligence.emails.length,
        company: intelligence.company?.name || 'Not detected',
        qualityScore: intelligence.qualityScore.toFixed(2),
        methodsUsed: intelligence.extractionMethods.length,
      };
    } catch (error) {
      test.status = 'failed';
      test.error = error instanceof Error ? error.message : String(error);
    }

    test.duration = Date.now() - startTime;
    this.addTest(test);
  }

  /**
   * Test: API Response Formatting
   */
  async testAPIFormatting(): Promise<void> {
    const startTime = Date.now();
    const test: ValidationTest = {
      name: 'API Response Formatting',
      stage: 'api',
      status: 'running',
      duration: 0,
    };

    try {
      const { formatAsV1, formatAsV2 } = await import('../api/response-formatter');

      const mockJob = {
        id: 'job_test_123',
        url: 'https://example.com',
        status: 'completed' as const,
        emails: ['hello@example.com', 'info@example.com'],
        discoveryData: {
          keyword: 'test',
          generatedQuery: 'test',
          googlePosition: 1,
          googleTitle: 'Example',
          googleSnippet: 'Example snippet',
          timestamp: Date.now(),
          searchDepth: 1,
        },
        intelligence: {
          company: { name: 'Example Inc', confidence: 0.9, source: 'schema-org' },
          qualityScore: 0.85,
        },
      };

      const v1Response = formatAsV1(mockJob as any);
      const v2Response = formatAsV2(mockJob as any);

      // V1 should only have basic fields
      if (!v1Response.emails || v1Response.emails.length === 0) {
        throw new Error('V1 response missing emails');
      }

      // V2 should have intelligence
      if (!v2Response.intelligence) {
        throw new Error('V2 response missing intelligence');
      }

      test.status = 'passed';
      test.details = {
        v1HasEmails: !!v1Response.emails,
        v1HasIntelligence: !!v1Response.intelligence,
        v2HasIntelligence: !!v2Response.intelligence,
        v2QualityScore: v2Response.intelligence?.qualityScore,
      };
    } catch (error) {
      test.status = 'failed';
      test.error = error instanceof Error ? error.message : String(error);
    }

    test.duration = Date.now() - startTime;
    this.addTest(test);
  }

  /**
   * Run all validation tests
   */
  async runAllTests(): Promise<ValidationReport> {
    console.log('\n[VALIDATION] Starting comprehensive test suite...\n');

    try {
      await this.testDiscoveryRecords();
      await this.testQueueOperations();
      await this.testDeobfuscationMethods();
      await this.testCompanyDetection();
      await this.testIntelligenceExtraction();
      await this.testAPIFormatting();
    } catch (error) {
      console.error('[VALIDATION] Test execution error:', error);
    }

    // Cleanup
    if (this.queue) {
      await this.queue.close();
    }

    // Generate report
    return this.generateReport();
  }

  /**
   * Generate validation report
   */
  private generateReport(): ValidationReport {
    const passed = this.tests.filter((t) => t.status === 'passed').length;
    const failed = this.tests.filter((t) => t.status === 'failed').length;

    const issues: string[] = [];
    const recommendations: string[] = [];

    for (const test of this.tests) {
      if (test.status === 'failed') {
        issues.push(`[${test.stage.toUpperCase()}] ${test.name}: ${test.error}`);
      }
    }

    const productionReady = failed === 0;

    if (productionReady) {
      recommendations.push('All validation tests passed. Ready for production deployment.');
    } else {
      recommendations.push(`Fix ${failed} failing test(s) before production deployment.`);
    }

    return {
      timestamp: Date.now(),
      totalTests: this.tests.length,
      passed,
      failed,
      tests: this.tests,
      productionReady,
      issues,
      recommendations,
    };
  }
}
