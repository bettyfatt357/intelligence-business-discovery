/**
 * Deobfuscation Methods - Plugin-based Email Extraction
 *
 * 15 email extraction techniques, each operating independently so methods can
 * be added to or removed from the registry without affecting the others.
 *
 * Currently registered methods (see DEOBFUSCATION_METHODS at the bottom of the
 * file for the authoritative list):
 * - Basic: plaintext, mailto, html-entity
 * - Encoding: decimal-entity, hex-entity, unicode-escape, base64
 * - Ciphers: rot13, reversed-string
 * - Scripting/data: javascript-variable, json-string, json-ld, react-props
 * - Enterprise: cloudflare (XOR-hex email protection)
 * - Text obfuscation: text-obfuscation (bracketed [at]/[dot] tokens)
 *
 * NOTE: Vue, Angular, Next.js, Svelte, CSS, Shadow DOM, standalone schema.org,
 * Punycode, and microdata methods are NOT implemented. Add them as new classes
 * and register them below before referencing them here.
 */

import { JSDOM } from 'jsdom';

export interface DeobfuscationResult {
  method: string;
  emails: string[];
  confidence: number; // 0-1, based on method reliability
  evidence: string[]; // Sample snippets showing where found
  timestamp: number;
}

/**
 * Method 1: Plain Text Emails
 * Finds emails already visible in text (high confidence)
 */
export class PlainTextMethod {
  name = 'plaintext';
  emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  detect(html: string): boolean {
    return this.emailRegex.test(html);
  }

  extract(html: string): DeobfuscationResult {
    const matches = html.match(this.emailRegex) || [];
    const emails = [...new Set(matches)];
    
    return {
      method: this.name,
      emails,
      confidence: 0.95,
      evidence: emails.slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 2: Mailto Links
 * Extracts emails from mailto: URIs
 */
export class MailtoMethod {
  name = 'mailto';
  mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

  detect(html: string): boolean {
    return this.mailtoRegex.test(html);
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    let match;
    const regex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    
    while ((match = regex.exec(html)) !== null) {
      emails.add(match[1].toLowerCase());
    }

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.98,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 3: HTML Entity Encoded Emails
 * Decodes HTML entities like &amp; &lt; etc.
 */
export class HtmlEntityMethod {
  name = 'html-entity';

  detect(html: string): boolean {
    return /&#\d+;|&#x[0-9a-fA-F]+;|&[a-zA-Z]+;/.test(html);
  }

  // Common email-related named entities that JSDOM does not reliably resolve
  // in an HTML body context (e.g. MathML/misc entities). Pre-decoding these
  // guarantees coverage without altering the existing JSDOM decode step.
  private static readonly NAMED_ENTITIES: Record<string, string> = {
    '&commat;': '@',
    '&period;': '.',
    '&dot;': '.',
    '&colon;': ':',
  };

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    // Pre-decode common email-related named entities (case-insensitive) so
    // they survive into the text content regardless of JSDOM's handling.
    let preprocessed = html;
    for (const [entity, char] of Object.entries(HtmlEntityMethod.NAMED_ENTITIES)) {
      preprocessed = preprocessed.replace(new RegExp(entity, 'gi'), char);
    }

    // Decode entities (existing behavior: JSDOM resolves standard entities)
    const doc = new JSDOM(preprocessed).window.document;
    const text = doc.body.textContent || '';
    
    const matches = text.match(emailRegex) || [];
    matches.forEach(email => emails.add(email.toLowerCase()));

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.85,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 4: Decimal Entities
 * Decodes &#NNNN; format
 */
export class DecimalMethod {
  name = 'decimal-entity';

  detect(html: string): boolean {
    return /&#\d{2,3};/.test(html);
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    
    // Replace decimal entities
    let decoded = html.replace(/&#(\d+);/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 10));
    });

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = decoded.match(emailRegex) || [];
    matches.forEach(email => emails.add(email.toLowerCase()));

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.80,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 5: Hexadecimal Entities
 * Decodes &#xHHHH; format
 */
export class HexMethod {
  name = 'hex-entity';

  detect(html: string): boolean {
    return /&#x[0-9a-fA-F]{2,};/.test(html);
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    
    // Replace hex entities
    let decoded = html.replace(/&#x([0-9a-fA-F]+);/gi, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = decoded.match(emailRegex) || [];
    matches.forEach(email => emails.add(email.toLowerCase()));

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.80,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 6: Unicode Escapes
 * Decodes \uHHHH and \xHH format
 */
export class UnicodeMethod {
  name = 'unicode-escape';

  detect(html: string): boolean {
    return /\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}/.test(html);
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    
    // Decode unicode escapes
    let decoded = html
      .replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = decoded.match(emailRegex) || [];
    matches.forEach(email => emails.add(email.toLowerCase()));

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.75,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 7: Base64 Encoding
 * Detects and decodes base64-encoded content
 */
export class Base64Method {
  name = 'base64';

  detect(html: string): boolean {
    // Look for base64-looking strings
    return /[A-Za-z0-9+/]{20,}={0,2}/.test(html);
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    
    // Try common base64 encoded email patterns
    const base64Regex = /[A-Za-z0-9+/]{20,}={0,2}/g;
    const matches = html.match(base64Regex) || [];

    matches.forEach(b64 => {
      try {
        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const found = decoded.match(emailRegex) || [];
        found.forEach(email => emails.add(email.toLowerCase()));
      } catch (e) {
        // Invalid base64, skip
      }
    });

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.70,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 8: ROT13 Cipher
 * Decodes ROT13 encoded text
 */
export class ROT13Method {
  name = 'rot13';

  private rot13(str: string): string {
    return str.replace(/[a-zA-Z]/g, (char) => {
      const code = char.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        return String.fromCharCode(((code - 65 + 13) % 26) + 65);
      }
      if (code >= 97 && code <= 122) {
        return String.fromCharCode(((code - 97 + 13) % 26) + 97);
      }
      return char;
    });
  }

  detect(html: string): boolean {
    // ROT13 often appears in data attributes or text
    const sample = this.rot13(html.substring(0, 500));
    return /@/.test(sample) && /[a-z]/.test(sample);
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    const decoded = this.rot13(html);

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = decoded.match(emailRegex) || [];
    matches.forEach(email => emails.add(email.toLowerCase()));

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.65,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 9: Reversed String
 * Detects reversed email strings
 */
export class ReversedMethod {
  name = 'reversed-string';

  detect(html: string): boolean {
    // Look for @ symbol in reversed context
    const reversed = html.split('').reverse().join('');
    return /@/.test(reversed);
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    const reversed = html.split('').reverse().join('');

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = reversed.match(emailRegex) || [];
    matches.forEach(email => emails.add(email.toLowerCase()));

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.60,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 10: JavaScript Variables
 * Extracts emails assigned to JS variables
 */
export class JavaScriptVariableMethod {
  name = 'javascript-variable';

  detect(html: string): boolean {
    return /(?:var|let|const)\s+\w+\s*=\s*['"][^'"]*@[^'"]*['"]/.test(html);
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    const regex = /(?:var|let|const)\s+\w+\s*=\s*['"]([^'"]*@[^'"]*)['"]/g;
    
    let match;
    while ((match = regex.exec(html)) !== null) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const found = match[1].match(emailRegex) || [];
      found.forEach(email => emails.add(email.toLowerCase()));
    }

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.85,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 11: JSON String
 * Extracts from JSON-encoded strings
 */
export class JSONMethod {
  name = 'json-string';

  detect(html: string): boolean {
    try {
      const match = html.match(/"[^"]*@[^"]*"/);
      return !!match;
    } catch {
      return false;
    }
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    const jsonStrings = html.match(/"[^"]*"/g) || [];

    jsonStrings.forEach(str => {
      try {
        const decoded = JSON.parse(str);
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const found = decoded.match?.(emailRegex) || [];
        found.forEach((email: string) => emails.add(email.toLowerCase()));
      } catch (e) {
        // Not valid JSON
      }
    });

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.75,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 12: JSON-LD Structured Data
 * Extracts from schema.org JSON-LD blocks
 */
export class JSONLDMethod {
  name = 'json-ld';

  detect(html: string): boolean {
    return /<script\s+type\s*=\s*["']application\/ld\+json["'][^>]*>/.test(html);
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    const regex = /<script\s+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const json = JSON.stringify(data);
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const found = json.match(emailRegex) || [];
        found.forEach(email => emails.add(email.toLowerCase()));
      } catch (e) {
        // Invalid JSON-LD
      }
    }

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.90,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 13: React Component Props
 * Extracts from React hydration data
 */
export class ReactPropsMethod {
  name = 'react-props';

  detect(html: string): boolean {
    return /data-react-props|__REACT_DEVTOOLS_GLOBAL_HOOK__|__reactInternalInstance/.test(html);
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();
    
    // Look for email patterns in React attributes and data
    const dataRegex = /data-[\w-]*=["']([^"']*@[^"']*)['"]/g;
    let match;
    
    while ((match = dataRegex.exec(html)) !== null) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const found = match[1].match(emailRegex) || [];
      found.forEach(email => emails.add(email.toLowerCase()));
    }

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.80,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 14: Cloudflare Email Protection
 * Decodes Cloudflare's email obfuscation (data-cfemail / __cf_email__).
 *
 * Cloudflare stores the address as a hex string where the first byte is an
 * XOR key and each subsequent byte is a character of the email XORed with
 * that key. It appears in two places:
 *   - <a class="__cf_email__" data-cfemail="HEX">[email&#160;protected]</a>
 *   - <span class="__cf_email__" data-cfemail="HEX">...</span>
 *   - links to /cdn-cgi/l/email-protection#HEX
 */
export class CloudflareMethod {
  name = 'cloudflare';
  emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  detect(html: string): boolean {
    return /data-cfemail\s*=|__cf_email__|\/cdn-cgi\/l\/email-protection#/.test(html);
  }

  /**
   * Decode a single Cloudflare-encoded hex string.
   * First byte (2 hex chars) is the XOR key.
   */
  private decodeCfEmail(encoded: string): string {
    let email = '';
    const key = parseInt(encoded.substr(0, 2), 16);
    if (Number.isNaN(key)) return '';
    for (let i = 2; i < encoded.length; i += 2) {
      const charCode = parseInt(encoded.substr(i, 2), 16) ^ key;
      if (Number.isNaN(charCode)) return '';
      email += String.fromCharCode(charCode);
    }
    return email;
  }

  extract(html: string): DeobfuscationResult {
    const emails = new Set<string>();

    // Collect every encoded hex payload from both attribute and hash forms.
    const encodedValues = new Set<string>();

    const attrRegex = /data-cfemail\s*=\s*["']([0-9a-fA-F]+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(html)) !== null) {
      encodedValues.add(match[1]);
    }

    const hashRegex = /\/cdn-cgi\/l\/email-protection#([0-9a-fA-F]+)/g;
    while ((match = hashRegex.exec(html)) !== null) {
      encodedValues.add(match[1]);
    }

    encodedValues.forEach((encoded) => {
      // Need at least the key byte plus one character byte.
      if (encoded.length < 4 || encoded.length % 2 !== 0) return;
      try {
        const decoded = this.decodeCfEmail(encoded);
        if (this.emailRegex.test(decoded)) {
          emails.add(decoded.toLowerCase());
        }
      } catch {
        // Malformed payload, skip
      }
    });

    return {
      method: this.name,
      emails: Array.from(emails),
      confidence: 0.95,
      evidence: Array.from(emails).slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Method 15: Text Obfuscation (bracketed at/dot tokens)
 * Reconstructs addresses written to defeat naive scrapers, e.g.:
 *   - "name [at] domain [dot] com"
 *   - "name (at) domain (dot) com"
 *   - "name {at} domain {dot} com"
 * All bracket styles ([], (), {}) and surrounding/interior whitespace
 * variations are supported. Tokens are matched case-insensitively.
 */
export class TextObfuscationMethod {
  name = 'text-obfuscation';
  emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  // "[at]", "(at)", "{at}" with optional whitespace inside and around.
  private atRegex = /\s*[[({]\s*at\s*[\])}]\s*/gi;
  // "[dot]", "(dot)", "{dot}" with optional whitespace inside and around.
  private dotRegex = /\s*[[({]\s*dot\s*[\])}]\s*/gi;

  detect(html: string): boolean {
    // Use non-global patterns here so detection is stateless (a global regex
    // would carry lastIndex between calls and miss on reuse).
    return /[[({]\s*at\s*[\])}]/i.test(html) || /[[({]\s*dot\s*[\])}]/i.test(html);
  }

  extract(html: string): DeobfuscationResult {
    // Replace obfuscation tokens with their real characters, collapsing the
    // whitespace that typically pads them so "a [at] b [dot] com" -> "a@b.com".
    const deobfuscated = html
      .replace(this.atRegex, '@')
      .replace(this.dotRegex, '.');

    const matches = deobfuscated.match(this.emailRegex) || [];
    const emails = [...new Set(matches.map((email) => email.toLowerCase()))];

    return {
      method: this.name,
      emails,
      confidence: 0.75,
      evidence: emails.slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Shared Email Normalization Layer
 *
 * A single canonicalization/validation pass applied to the output of every
 * method (see runAllDeobfuscationMethods). Centralizing this here keeps each
 * method free of ad-hoc cleanup and guarantees consistent, valid emails flow
 * into the orchestrator's cross-method dedup/confidence aggregation.
 */

// Full-string validation (anchored) - stricter than the "find" regexes above.
const EMAIL_VALIDATION_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Normalize a single raw email candidate.
 * Returns the canonical email, or null if it is invalid.
 *
 * Steps: strip mailto: prefix + query params, trim whitespace, remove
 * surrounding quotes/brackets, lowercase, then validate the final format.
 */
export function normalizeEmail(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;

  let email = raw.trim();

  // Remove a leading mailto: scheme if present.
  email = email.replace(/^mailto:/i, '');

  // Drop mailto query parameters, e.g. "a@b.com?subject=hi" -> "a@b.com".
  const queryIndex = email.indexOf('?');
  if (queryIndex !== -1) {
    email = email.slice(0, queryIndex);
  }

  // Strip surrounding quotes/brackets/angle-brackets and stray whitespace.
  email = email
    .replace(/^[\s'"<>(){}[\]]+/, '')
    .replace(/[\s'"<>(){}[\]]+$/, '')
    .trim()
    .toLowerCase();

  return EMAIL_VALIDATION_REGEX.test(email) ? email : null;
}

/**
 * Normalize a list of raw emails: canonicalize each, drop invalid ones, and
 * deduplicate. Order of first appearance is preserved.
 */
export function normalizeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of emails) {
    const normalized = normalizeEmail(raw);
    if (normalized) {
      seen.add(normalized);
    }
  }
  return Array.from(seen);
}

/**
 * Registry of all deobfuscation methods
 */
export const DEOBFUSCATION_METHODS = [
  new PlainTextMethod(),
  new MailtoMethod(),
  new HtmlEntityMethod(),
  new DecimalMethod(),
  new HexMethod(),
  new UnicodeMethod(),
  new Base64Method(),
  new ROT13Method(),
  new ReversedMethod(),
  new JavaScriptVariableMethod(),
  new JSONMethod(),
  new JSONLDMethod(),
  new ReactPropsMethod(),
  new CloudflareMethod(),
  new TextObfuscationMethod(),
];

/**
 * Run all deobfuscation methods and aggregate results
 */
export function runAllDeobfuscationMethods(html: string): DeobfuscationResult[] {
  return DEOBFUSCATION_METHODS
    .map(method => {
      try {
        if (method.detect(html)) {
          const result = method.extract(html);
          // Apply the shared normalization/validation layer to every method's
          // output. This canonicalizes and validates emails and dedupes within
          // the result while preserving the DeobfuscationResult shape. Evidence
          // is realigned to the normalized emails to stay consistent.
          const emails = normalizeEmails(result.emails);
          return { ...result, emails, evidence: emails.slice(0, 3) };
        }
      } catch (error) {
        console.error(`[DEOBFUSCATION] Error in ${(method as any).name}:`, error);
      }
      return { method: (method as any).name, emails: [], confidence: 0, evidence: [], timestamp: Date.now() };
    })
    .filter(result => result.emails.length > 0);
}

/**
 * External JavaScript Email Scanning
 *
 * An ASYNC extraction method that follows the same DeobfuscationResult contract
 * as the sync registry methods, but is deliberately NOT registered in
 * DEOBFUSCATION_METHODS because it (a) performs network I/O and (b) needs the
 * page URL to enforce same-origin. It reuses the existing sync methods to scan
 * fetched JS content (rather than duplicating scanning logic) and funnels all
 * discovered emails through the shared normalizeEmails() pipeline.
 *
 * Use runExternalJavaScriptScan(html, baseUrl) to invoke it.
 */

// Operational limits for external JS scanning.
const MAX_JS_FILES = 20; // maximum external JS files fetched per page
const MAX_JS_BYTES = 1024 * 1024; // 1MB cap per JS file
const JS_FETCH_TIMEOUT_MS = 10000; // per-file request timeout

// Same-origin script URLs whose path/host indicates analytics, advertising,
// tracking, or a bundled third-party/CDN library. These rarely contain the
// site owner's contact emails and are skipped to save the fetch budget.
const THIRD_PARTY_SCRIPT_PATTERNS = [
  // Analytics / tag managers
  'google-analytics', 'googletagmanager', 'gtag', 'gtm.js', 'analytics',
  'segment', 'mixpanel', 'amplitude', 'heap', 'matomo', 'piwik', 'hotjar',
  'fullstory', 'mouseflow', 'clarity',
  // Advertising
  'doubleclick', 'googlesyndication', 'adservice', 'adsbygoogle', 'adroll',
  'taboola', 'outbrain', 'criteo',
  // Social / tracking pixels
  'facebook', 'fbevents', 'connect.facebook', 'twitter', 'linkedin', 'pinterest',
  // Common CDN library bundles
  'jquery', 'bootstrap', 'popper', 'lodash', 'moment', 'react.production',
  'vue.min', 'angular.min', 'polyfill', 'modernizr', 'recaptcha', 'hcaptcha',
  'cloudflare', 'cdnjs', 'jsdelivr', 'unpkg', 'gstatic',
];

/**
 * Parse <script src="..."> URLs from HTML, resolve them against the page URL,
 * keep only same-origin files, drop known third-party/CDN/tracking scripts,
 * and cap the count at MAX_JS_FILES.
 */
export function extractSameOriginScriptUrls(html: string, baseUrl: string): string[] {
  let pageOrigin: string;
  try {
    pageOrigin = new URL(baseUrl).origin;
  } catch {
    return [];
  }

  const urls: string[] = [];
  const seen = new Set<string>();
  const scriptRegex = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const rawSrc = match[1].trim();
    if (!rawSrc) continue;

    let resolved: URL;
    try {
      resolved = new URL(rawSrc, baseUrl);
    } catch {
      continue;
    }

    // Only http(s) and only same-origin.
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    if (resolved.origin !== pageOrigin) continue;

    const normalizedUrl = resolved.href;
    if (seen.has(normalizedUrl)) continue;

    // Skip known analytics/advertising/tracking/CDN scripts.
    const lower = normalizedUrl.toLowerCase();
    if (THIRD_PARTY_SCRIPT_PATTERNS.some(pattern => lower.includes(pattern))) continue;

    seen.add(normalizedUrl);
    urls.push(normalizedUrl);

    if (urls.length >= MAX_JS_FILES) break;
  }

  return urls;
}

/**
 * Fetch a single JS file with a timeout and a 1MB size cap.
 * Returns the JS text, or null on failure / oversize / non-JS response.
 */
async function fetchJavaScriptFile(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), JS_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) return null;

    // Pre-check declared size to avoid downloading huge bundles.
    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_JS_BYTES) {
      return null;
    }

    const text = await response.text();
    if (text.length > MAX_JS_BYTES) {
      // Enforce cap even when content-length was absent/inaccurate.
      return text.slice(0, MAX_JS_BYTES);
    }
    return text;
  } catch {
    // Timeout, network error, or abort - skip this file.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * External-JS Email Relevance Filtering
 *
 * Bundled theme/plugin/library JavaScript frequently embeds the author's or
 * vendor's contact email (e.g. jack@greensock.com, khanhnq@nootheme.com),
 * which are false positives for the *target site's* contact data. These
 * helpers are applied ONLY to external-JS results — HTML-sourced extraction is
 * unaffected — to keep same-domain emails and drop obvious vendor noise.
 */

// Known third-party vendor / theme / plugin / library / analytics email
// domains. Emails on these domains are never the target site's own contacts.
const VENDOR_EMAIL_DOMAINS = new Set<string>([
  // Animation / UI libraries
  'greensock.com', 'gsap.com',
  // Theme & template marketplaces / vendors
  'nootheme.com', 'themeforest.net', 'envato.com', 'themify.me',
  'elegantthemes.com', 'themeisle.com', 'kadencewp.com', 'astra.com',
  'wpbakery.com', 'sliderrevolution.com', 'themepunch.com',
  // WordPress ecosystem / plugin authors
  'wordpress.org', 'wordpress.com', 'automattic.com', 'woocommerce.com',
  'elementor.com', 'yoast.com', 'wpforms.com', 'wpengine.com',
  'wpmudev.com', 'gravityforms.com', 'jetpack.com',
  // Frameworks / tooling / infra
  'jquery.com', 'jquery.org', 'sentry.io', 'cloudflare.com',
  // Analytics / advertising
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
  'segment.com', 'mixpanel.com', 'hotjar.com',
  // Generic placeholders often shipped in library source
  'example.com', 'example.org', 'domain.com', 'email.com', 'sentry.wordpress.org',
]);

// Local-part / substring signals that indicate a non-contact vendor address.
const VENDOR_EMAIL_SIGNALS = ['theme', 'plugin', 'noreply', 'no-reply', 'donotreply'];

/**
 * Reduce a hostname to its registrable-domain approximation (last two labels),
 * e.g. "www.mail.acme.co.uk" -> "co.uk" is imperfect for multi-part TLDs, but
 * for same-site comparison we compare full host suffixes below, so this simple
 * last-two-labels form is sufficient and conservative.
 */
function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length <= 2) return labels.join('.');
  return labels.slice(-2).join('.');
}

/** Domain portion (after @) of an email, lowercased. */
function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

/**
 * Score how relevant a JS-discovered email is to the target site.
 *   >= 1.0  same registrable domain (or subdomain) as the site  -> keep
 *   <= 0    known vendor domain or vendor signal                 -> drop
 *    0.1    unrelated third-party domain                         -> drop
 */
export function scoreJsEmailRelevance(email: string, siteHost: string): number {
  const eDomain = emailDomain(email);
  if (!eDomain) return 0;

  // Explicit vendor domains are always rejected.
  if (VENDOR_EMAIL_DOMAINS.has(eDomain)) return 0;

  // Vendor signal in the local part (e.g. theme@, plugin-support@).
  const localPart = email.slice(0, email.lastIndexOf('@'));
  if (VENDOR_EMAIL_SIGNALS.some(sig => localPart.includes(sig))) return 0;

  const siteDomain = registrableDomain(siteHost);
  const targetDomain = registrableDomain(eDomain);

  // Same registrable domain, or an exact host/subdomain relationship.
  if (
    targetDomain === siteDomain ||
    eDomain === siteHost.toLowerCase() ||
    eDomain.endsWith(`.${siteDomain}`)
  ) {
    return 1.0;
  }

  // Unrelated third-party domain: low relevance, dropped by the threshold.
  return 0.1;
}

/**
 * Filter normalized JS-sourced emails down to those clearly related to the
 * target site. Only same-domain emails clear the relevance threshold; vendor
 * and unrelated third-party emails are removed.
 */
export function filterExternalJsEmails(emails: string[], baseUrl: string): string[] {
  let siteHost: string;
  try {
    siteHost = new URL(baseUrl).hostname;
  } catch {
    // Without a valid site host we cannot judge relevance; be conservative.
    return [];
  }

  const RELEVANCE_THRESHOLD = 1.0;
  return emails.filter(email => scoreJsEmailRelevance(email, siteHost) >= RELEVANCE_THRESHOLD);
}

/**
 * Async external JavaScript scanning method.
 *
 * Scans same-origin external JS files for normal emails, mailto strings, and
 * obfuscated email strings by reusing the existing sync deobfuscation methods
 * against each file's content. All results are normalized via normalizeEmails()
 * and then relevance-filtered to remove third-party vendor/library noise.
 */
export class ExternalJavaScriptMethod {
  name = 'external-javascript';

  detect(html: string): boolean {
    // There is at least one external script tag to consider.
    return /<script\b[^>]*\bsrc\s*=/i.test(html);
  }

  async extract(html: string, baseUrl: string): Promise<DeobfuscationResult> {
    const scriptUrls = extractSameOriginScriptUrls(html, baseUrl);
    const collected: string[] = [];

    // Fetch files in parallel; each has its own timeout and size cap.
    const contents = await Promise.all(scriptUrls.map(url => fetchJavaScriptFile(url)));

    for (const content of contents) {
      if (!content) continue;
      // Reuse the existing sync registry to find emails inside the JS text
      // (plaintext, mailto, entities, base64, rot13, bracketed [at]/[dot], etc.)
      // rather than duplicating scanning logic here.
      const jsResults = runAllDeobfuscationMethods(content);
      jsResults.forEach(result => collected.push(...result.emails));
    }

    // Single authoritative normalization/validation/dedupe pass (shared layer).
    const normalized = normalizeEmails(collected);

    // Relevance filtering (external-JS only): keep same-domain emails, drop
    // third-party vendor/library/plugin-author addresses and unrelated domains.
    const emails = filterExternalJsEmails(normalized, baseUrl);

    return {
      method: this.name,
      emails,
      confidence: 0.7,
      evidence: emails.slice(0, 3),
      timestamp: Date.now(),
    };
  }
}

/**
 * Run external JavaScript scanning and return a DeobfuscationResult, matching
 * the shape produced by runAllDeobfuscationMethods so callers can merge the
 * results identically. Returns null when no external JS is present.
 */
export async function runExternalJavaScriptScan(
  html: string,
  baseUrl: string
): Promise<DeobfuscationResult | null> {
  const method = new ExternalJavaScriptMethod();
  try {
    if (!method.detect(html)) return null;
    const result = await method.extract(html, baseUrl);
    return result.emails.length > 0 ? result : null;
  } catch (error) {
    console.error('[DEOBFUSCATION] Error in external-javascript:', error);
    return null;
  }
}
