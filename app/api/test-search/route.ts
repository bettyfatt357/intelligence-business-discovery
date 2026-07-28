import { NextResponse } from 'next/server';
import { GoogleProgrammableSearchProvider } from '@/lib/discovery/search-providers';

/**
 * GET /api/test-search?q=...
 *
 * TEMPORARY debug endpoint for Phase 3B (SERP discovery).
 *
 * Runs a single query through GoogleProgrammableSearchProvider and returns the
 * raw result rows (title, link, snippet) so the Programmable Search Engine
 * credentials and cx configuration can be verified end to end.
 *
 * This route is for debugging only:
 *   - It does NOT touch extraction, discovery ordering, workers, or the database.
 *   - It can be deleted once SERP discovery is verified.
 *
 * NOTE: GoogleProgrammableSearchProvider deliberately degrades gracefully -
 * on misconfiguration or transport failure its search() returns [] instead of
 * throwing. That hides the underlying cause, which is exactly what we need for
 * debugging, so when the provider returns no rows this route performs a
 * secondary diagnostic request to surface Google's actual error payload
 * (invalid key, invalid cx, quota exceeded, etc.).
 */

const DEFAULT_QUERY = 'VFW Post Texas contact email';
const GOOGLE_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const DIAGNOSTIC_TIMEOUT_MS = 10000;

interface DiagnosticInfo {
  httpStatus: number | null;
  googleErrorMessage: string | null;
  googleErrorReason: string | null;
  totalResultsReported: string | null;
  note: string;
}

/**
 * Secondary raw request used only when the provider yields zero rows.
 * Reports the real HTTP status and Google error body so misconfiguration is
 * clearly distinguishable from a genuinely empty result set.
 */
async function diagnoseEmptyResults(query: string): Promise<DiagnosticInfo> {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_PSE_API_KEY;
  const cx = process.env.GOOGLE_CX ?? process.env.GOOGLE_PSE_CX;

  if (!apiKey || !cx) {
    return {
      httpStatus: null,
      googleErrorMessage: null,
      googleErrorReason: null,
      totalResultsReported: null,
      note: 'Credentials missing; no diagnostic request attempted.',
    };
  }

  const params = new URLSearchParams({ key: apiKey, cx, q: query, num: '10' });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DIAGNOSTIC_TIMEOUT_MS);

  try {
    const response = await fetch(`${GOOGLE_ENDPOINT}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> };
      searchInformation?: { totalResults?: string };
    } | null;

    return {
      httpStatus: response.status,
      googleErrorMessage: body?.error?.message ?? null,
      googleErrorReason: body?.error?.errors?.[0]?.reason ?? null,
      totalResultsReported: body?.searchInformation?.totalResults ?? null,
      note: response.ok
        ? 'Google responded OK but returned no items for this query.'
        : 'Google returned an error response - see googleErrorMessage/googleErrorReason.',
    };
  } catch (error) {
    return {
      httpStatus: null,
      googleErrorMessage: error instanceof Error ? error.message : String(error),
      googleErrorReason: 'network_or_timeout',
      totalResultsReported: null,
      note: 'Diagnostic request failed before a response was received.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: Request) {
  const startTime = Date.now();

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || DEFAULT_QUERY;

  const provider = new GoogleProgrammableSearchProvider();

  // Case 1: provider not configured -> log clearly and report which vars are missing.
  if (!provider.isConfigured()) {
    const missing: string[] = [];
    if (!process.env.GOOGLE_API_KEY && !process.env.GOOGLE_PSE_API_KEY) {
      missing.push('GOOGLE_API_KEY (or GOOGLE_PSE_API_KEY)');
    }
    if (!process.env.GOOGLE_CX && !process.env.GOOGLE_PSE_CX) {
      missing.push('GOOGLE_CX (or GOOGLE_PSE_CX)');
    }

    console.error(
      `[TEST-SEARCH] Provider "${provider.name}" is NOT configured. Missing env vars: ${missing.join(', ')}`
    );

    return NextResponse.json(
      {
        success: false,
        provider: provider.name,
        configured: false,
        query,
        error: 'Search provider is not configured.',
        missingEnvVars: missing,
        results: [],
        resultCount: 0,
      },
      { status: 500 }
    );
  }

  try {
    console.log(`[TEST-SEARCH] Running query via "${provider.name}": ${query}`);
    const results = await provider.search(query);
    const elapsedMs = Date.now() - startTime;

    // Case 2: configured but zero rows -> diagnose the real cause.
    if (results.length === 0) {
      const diagnostic = await diagnoseEmptyResults(query);
      console.error(
        `[TEST-SEARCH] Query returned 0 results. status=${diagnostic.httpStatus} ` +
          `reason=${diagnostic.googleErrorReason} message=${diagnostic.googleErrorMessage} ` +
          `note=${diagnostic.note}`
      );

      return NextResponse.json(
        {
          success: false,
          provider: provider.name,
          configured: true,
          query,
          elapsedMs,
          error: 'Search returned no results.',
          diagnostic,
          results: [],
          resultCount: 0,
        },
        { status: 200 }
      );
    }

    // Case 3: success -> return raw rows (title, link, snippet).
    console.log(`[TEST-SEARCH] Query returned ${results.length} results in ${elapsedMs}ms`);

    return NextResponse.json(
      {
        success: true,
        provider: provider.name,
        configured: true,
        query,
        elapsedMs,
        resultCount: results.length,
        results: results.map(result => ({
          title: result.title ?? null,
          link: result.url,
          snippet: result.snippet ?? null,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[TEST-SEARCH] Unexpected failure for query "${query}": ${message}`);

    return NextResponse.json(
      {
        success: false,
        provider: provider.name,
        configured: true,
        query,
        error: `Unexpected failure: ${message}`,
        results: [],
        resultCount: 0,
      },
      { status: 500 }
    );
  }
}
