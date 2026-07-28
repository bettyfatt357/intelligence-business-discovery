/**
 * URL Discovery Utilities
 *
 * Pure, side-effect-free helpers for the discovery layer. Everything here is
 * synchronous and I/O-free so it can be unit-tested in isolation:
 *   - normalizeUrl        canonicalize a URL for dedupe/visited tracking
 *   - isSameOrigin        same-site guard (never leave the target domain)
 *   - classifyUrlPriority high/medium/low bucketing for business pages
 *   - extractLinks        parse <a href> links out of HTML
 */

import { UrlPriority } from './types';

/**
 * High-priority path segments - dedicated business/contact pages.
 * A URL whose path matches one of these (exactly or as a segment) is treated
 * as the most valuable to extract from.
 */
export const HIGH_PRIORITY_PATHS = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/team',
  '/staff',
  '/directory',
  '/leadership',
  '/locations',
  '/people',
  '/faculty',
  '/members',
];

/**
 * Medium-priority keywords - pages that merely *contain* these words in their
 * path are likely to hold contact data but are less certain than the dedicated
 * pages above.
 */
export const MEDIUM_PRIORITY_KEYWORDS = [
  'contact',
  'email',
  'staff',
  'team',
  'directory',
  'people',
  'faculty',
  'leadership',
];

/**
 * Normalize a URL into a canonical form for deduplication and visited-set
 * tracking. Returns null if the input cannot be parsed or is not http(s).
 *
 * Normalization rules:
 *  - resolve relative URLs against `base` when provided
 *  - lowercase the hostname (leaves path case intact - paths can be case-sensitive)
 *  - drop the URL fragment (#...)
 *  - remove the default port (:80 / :443)
 *  - de-duplicate and sort query parameters (prevents repeated-param explosions)
 *  - strip a trailing slash from non-root paths
 */
export function normalizeUrl(raw: string, base?: string): string | null {
  let parsed: URL;
  try {
    parsed = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  // Lowercase hostname (host comparison is case-insensitive).
  parsed.hostname = parsed.hostname.toLowerCase();

  // Remove fragment.
  parsed.hash = '';

  // Remove default ports.
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  // De-duplicate + sort query params to collapse repeated/ordering variants.
  if (parsed.search) {
    const params = new URLSearchParams(parsed.search);
    const deduped = new Map<string, string>();
    for (const [key, value] of params.entries()) {
      deduped.set(key, value); // last value wins; removes duplicate keys
    }
    const sortedKeys = Array.from(deduped.keys()).sort();
    const rebuilt = new URLSearchParams();
    for (const key of sortedKeys) {
      rebuilt.set(key, deduped.get(key)!);
    }
    const qs = rebuilt.toString();
    parsed.search = qs ? `?${qs}` : '';
  }

  // Strip trailing slash from non-root paths.
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  return parsed.toString();
}

/**
 * Reduce a hostname to a www-insensitive form so "www.acme.com" and "acme.com"
 * compare equal.
 */
function baseHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

/**
 * Same-origin / same-site guard. Returns true when `candidate` belongs to the
 * same site as `base`. Treats www and non-www as the same site and ignores
 * http/https differences, but never matches a different registrable host.
 */
export function isSameOrigin(candidate: string, base: string): boolean {
  let candidateUrl: URL;
  let baseUrl: URL;
  try {
    candidateUrl = new URL(candidate);
    baseUrl = new URL(base);
  } catch {
    return false;
  }
  return baseHost(candidateUrl.hostname) === baseHost(baseUrl.hostname);
}

/**
 * Classify a URL's relevance for contact/business extraction.
 *
 *  - 'high'   : path is (or starts with) a dedicated business page
 *  - 'medium' : path merely contains a contact-related keyword
 *  - 'low'    : everything else
 */
export function classifyUrlPriority(url: string): UrlPriority {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase().replace(/\/+$/, '');
  } catch {
    return 'low';
  }

  // High: exact match or a path segment equal to a dedicated business path.
  for (const highPath of HIGH_PRIORITY_PATHS) {
    if (pathname === highPath || pathname.startsWith(`${highPath}/`)) {
      return 'high';
    }
  }

  // Medium: any contact-related keyword appears in the path.
  for (const keyword of MEDIUM_PRIORITY_KEYWORDS) {
    if (pathname.includes(keyword)) {
      return 'medium';
    }
  }

  return 'low';
}

/** Numeric weight for a priority bucket (used for ordering/queue sorting). */
export function priorityWeight(priority: UrlPriority): number {
  switch (priority) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

/**
 * Extract all <a href> links from HTML and resolve them to normalized absolute
 * URLs against `baseUrl`. Non-http(s), unparseable, fragment-only, and
 * mailto:/tel:/javascript: links are dropped. The returned list is deduplicated
 * while preserving first-seen order.
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();
  const anchorRegex = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    if (!rawHref) continue;

    // Skip non-navigational schemes and pure fragments early.
    const lower = rawHref.toLowerCase();
    if (
      lower.startsWith('mailto:') ||
      lower.startsWith('tel:') ||
      lower.startsWith('javascript:') ||
      lower.startsWith('#')
    ) {
      continue;
    }

    const normalized = normalizeUrl(rawHref, baseUrl);
    if (!normalized) continue;

    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push(normalized);
    }
  }

  return results;
}
