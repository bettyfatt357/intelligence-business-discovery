import { NextResponse } from 'next/server';
import { withAuth, AuthedRequest, getUserId } from '@/lib/auth/middleware';
import { withAdminAuth } from '@/lib/auth/admin-auth';
import { extractIntelligence } from '@/lib/extraction/intelligence-orchestrator';
// Phase 3 debug only: discovery diagnostics for the admin test endpoint.
// Reuses the existing discovery layer (which calls the unchanged
// extractIntelligence pipeline). Opt-in via `discovery: true` in the body.
// This block is isolated so it can be removed/hidden after Phase 3 verification.
import { discoverAndExtract } from '@/lib/discovery';

/**
 * POST /api/admin/test-extraction
 *
 * End-to-end extraction test mode.
 *
 * Accepts a URL and runs it through the EXACT same pipeline the Worker uses
 * for intelligent extraction (Phase 2D):
 *   1. fetch(url) -> HTML
 *   2. extractIntelligence(html, url) -> full IntelligenceRecord
 *
 * Returns the complete ExtractionIntelligence record: emails (with confidence,
 * extraction method, and evidence), company detection, page metadata,
 * quality score, and any extraction errors.
 *
 * Protected: Admin authorization required (Auth -> AdminAuth -> Handler)
 *
 * NOTE: This endpoint does not modify architecture. It reuses the existing
 * Intelligence Extraction Engine and mirrors the Worker's fetch step so that
 * results are identical to what the queue pipeline would produce.
 */

// Same fetch timeout the worker uses for jobs (20s)
const FETCH_TIMEOUT_MS = 20000;

// Chrome/Edge Chromium headers so the fetch layer behaves like a real browser.
// This improves success rates against sites that vary output based on the
// User-Agent or reject non-browser clients.
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

/**
 * Detect Cloudflare challenges, captchas, access-denied, and empty/too-short
 * responses that indicate the real page content was never returned.
 */
function detectBlockOrChallenge(html: string): string | null {
  if (!html || html.trim().length === 0) {
    return 'Empty response body';
  }
  if (html.trim().length < 200) {
    return 'Response body too short (<200 characters)';
  }

  const lower = html.toLowerCase();

  if (
    lower.includes('cf-browser-verification') ||
    lower.includes('cf-challenge') ||
    lower.includes('checking your browser before accessing') ||
    lower.includes('just a moment') ||
    lower.includes('attention required! | cloudflare')
  ) {
    return 'Cloudflare challenge page detected';
  }
  if (lower.includes('captcha') || lower.includes('recaptcha') || lower.includes('hcaptcha')) {
    return 'CAPTCHA challenge detected';
  }
  if (lower.includes('access denied') || lower.includes('403 forbidden')) {
    return 'Access denied page detected';
  }

  return null;
}

function isValidHttpUrl(value: string): { valid: boolean; parsed?: URL; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { valid: false, reason: 'URL is not parseable' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only http and https protocols are allowed' };
  }

  return { valid: true, parsed };
}

async function handler(request: AuthedRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const url = (body as { url?: unknown })?.url;

    if (typeof url !== 'string' || url.trim().length === 0) {
      return NextResponse.json(
        { error: 'A "url" string is required in the request body' },
        { status: 400 }
      );
    }

    const trimmedUrl = url.trim();
    const validation = isValidHttpUrl(trimmedUrl);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid URL: ${validation.reason}` },
        { status: 400 }
      );
    }

    // Phase 3 debug flag: when true, additionally run the discovery layer and
    // return discovery diagnostics. Off by default so the standard single-page
    // response shape is unchanged.
    const discoveryEnabled = (body as { discovery?: unknown })?.discovery === true;

    console.log(
      `[TEST-EXTRACTION] User ${getUserId(request)} testing extraction for: ${trimmedUrl}`
    );

    // Step 1: Fetch HTML with a browser-like configuration (mirrors the
    // Worker's intelligence fetch step, upgraded to behave like Chromium).
    let html: string;
    let statusCode = 0;
    let contentType: string | null = null;
    let server: string | null = null;
    let finalUrl = trimmedUrl;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(trimmedUrl, {
        signal: controller.signal,
        headers: BROWSER_HEADERS,
        redirect: 'follow',
      });

      // Capture response diagnostics (useful for debugging Cloudflare,
      // bot blocks, redirects, and dead links).
      statusCode = response.status;
      contentType = response.headers.get('content-type');
      server = response.headers.get('server');
      finalUrl = response.url || trimmedUrl;

      console.log(
        `[TEST-EXTRACTION] Fetch result: status=${statusCode} ${response.statusText}, ` +
          `contentType=${contentType}, server=${server}, finalUrl=${finalUrl}`
      );

      if (!response.ok) {
        // The fetch succeeded at the network level; the target server simply
        // returned a non-success HTTP status (e.g. 404 dead link, 403 block).
        // Report the actual status so the caller can tell this apart from a
        // real connection/timeout failure.
        return NextResponse.json(
          {
            error: `Target URL returned HTTP ${statusCode} ${response.statusText}`,
            statusCode,
            statusText: response.statusText,
            contentType,
            server,
            finalUrl,
          },
          { status: 502 }
        );
      }

      html = await response.text();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const aborted = message.includes('abort');
      return NextResponse.json(
        {
          error: aborted
            ? `Fetch timed out after ${FETCH_TIMEOUT_MS}ms`
            : 'Failed to fetch target URL',
          details: message,
          finalUrl,
        },
        { status: aborted ? 504 : 502 }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Step 1b: Validate HTML before extraction. Detect empty responses,
    // too-short bodies, and Cloudflare/captcha/access-denied challenge pages.
    const blockReason = detectBlockOrChallenge(html);
    if (blockReason) {
      return NextResponse.json(
        {
          error: 'Blocked or challenge page detected',
          reason: blockReason,
          statusCode,
          contentType,
          server,
          finalUrl,
          fetchedBytes: html.length,
        },
        { status: 502 }
      );
    }

    // Step 2: Run through the existing Intelligence Extraction Engine
    // (identical call to the Worker's processJob intelligence path)
    const intelligence = await extractIntelligence(html, trimmedUrl);

    // Step 3 (Phase 3 debug, opt-in): run the discovery layer and collect
    // diagnostics. This does NOT change extraction logic — discoverAndExtract
    // delegates to the same extractIntelligence pipeline. Failures here are
    // swallowed into the diagnostics block so they never affect the core test.
    let discoveryDiagnostics:
      | {
          enabled: true;
          discoverySources: string[];
          discoveredUrls: Array<{
            url: string;
            priority: string;
            source: string;
            depth: number;
          }>;
          discoveredCount: number;
          pagesProcessed: number;
          errors: string[];
        }
      | { enabled: false } = { enabled: false };

    if (discoveryEnabled) {
      try {
        console.log(`[TEST-EXTRACTION] Running discovery diagnostics for: ${trimmedUrl}`);
        const discovery = await discoverAndExtract(trimmedUrl);
        // "Discovery source" = distinct provenance across discovered URLs.
        const discoverySources = Array.from(
          new Set(discovery.discovered.map(d => d.source))
        ).sort();
        discoveryDiagnostics = {
          enabled: true,
          discoverySources,
          discoveredUrls: discovery.discovered.map(d => ({
            url: d.url,
            priority: d.priority,
            source: d.source,
            depth: d.depth,
          })),
          discoveredCount: discovery.discovered.length,
          pagesProcessed: discovery.pages.length,
          errors: discovery.errors,
        };
      } catch (error) {
        discoveryDiagnostics = {
          enabled: true,
          discoverySources: [],
          discoveredUrls: [],
          discoveredCount: 0,
          pagesProcessed: 0,
          errors: [
            `Discovery diagnostics failed: ${error instanceof Error ? error.message : String(error)}`,
          ],
        };
      }
    }

    const totalTimeMs = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        testMode: true,
        // Response diagnostics
        statusCode,
        contentType,
        server,
        finalUrl,
        fetchedBytes: html.length,
        totalTimeMs,
        // Full IntelligenceRecord as produced by the pipeline
        intelligence,
        // Phase 3 debug: discovery diagnostics (only populated when opted in)
        discoveryDiagnostics,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[TEST-EXTRACTION] Error:', error);
    return NextResponse.json(
      {
        error: 'Extraction test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Wrap with auth middleware: Auth -> AdminAuth -> Handler
export const POST = withAuth(withAdminAuth(handler));
