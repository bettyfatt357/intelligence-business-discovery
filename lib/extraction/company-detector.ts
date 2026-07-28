/**
 * Company Detection Engine
 * 
 * Hierarchical company detection with confidence scoring.
 * Checks multiple sources in priority order to identify company from page content.
 * Each source contributes to confidence score.
 */

import { JSDOM } from 'jsdom';

export interface CompanyDetection {
  name: string;
  confidence: number; // 0-1
  source: string;
  sources: CompanySource[];
}

export interface CompanySource {
  type: 'schema-org' | 'json-ld' | 'opengraph' | 'page-title' | 'heading' | 'domain';
  confidence: number;
  value: string;
}

/**
 * Extract company name from schema.org markup
 */
export function detectFromSchemaOrg(html: string): CompanySource | null {
  try {
    const regex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
      const data = JSON.parse(match[1]);
      
      if (data['@type'] === 'Organization' && data.name) {
        return {
          type: 'schema-org',
          confidence: 0.95,
          value: data.name,
        };
      }

      if (Array.isArray(data) && data[0]?.['@type'] === 'Organization' && data[0]?.name) {
        return {
          type: 'schema-org',
          confidence: 0.95,
          value: data[0].name,
        };
      }

      if (data.publisher?.name) {
        return {
          type: 'schema-org',
          confidence: 0.85,
          value: data.publisher.name,
        };
      }
    }
  } catch (error) {
    // Ignore parsing errors
  }

  return null;
}

/**
 * Extract company from JSON-LD blocks
 */
export function detectFromJSONLD(html: string): CompanySource | null {
  try {
    const regex = /<script\s+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        
        if (data.name && data['@type']?.includes('Organization')) {
          return {
            type: 'json-ld',
            confidence: 0.90,
            value: data.name,
          };
        }

        if (data.author?.name) {
          return {
            type: 'json-ld',
            confidence: 0.75,
            value: data.author.name,
          };
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  } catch (error) {
    // Ignore
  }

  return null;
}

/**
 * Extract from OpenGraph meta tags
 */
export function detectFromOpenGraph(html: string): CompanySource | null {
  try {
    // Look for og:site_name, og:title
    const siteNameMatch = html.match(/<meta\s+property\s*=\s*["']og:site_name["'][^>]*content\s*=\s*["']([^"']+)['"]/i);
    if (siteNameMatch && siteNameMatch[1]) {
      return {
        type: 'opengraph',
        confidence: 0.80,
        value: siteNameMatch[1],
      };
    }

    const titleMatch = html.match(/<meta\s+property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)['"]/i);
    if (titleMatch && titleMatch[1] && titleMatch[1].length < 100) {
      // Only use if reasonably short (not a full page title)
      return {
        type: 'opengraph',
        confidence: 0.60,
        value: titleMatch[1],
      };
    }
  } catch (error) {
    // Ignore
  }

  return null;
}

/**
 * Extract from page title tag
 */
export function detectFromPageTitle(html: string): CompanySource | null {
  try {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const title = titleMatch[1].trim();
      // Extract company name (usually before first pipe or dash)
      const parts = title.split(/\s*[|–-]\s*/);
      if (parts[0] && parts[0].length < 100) {
        return {
          type: 'page-title',
          confidence: 0.70,
          value: parts[0],
        };
      }
    }
  } catch (error) {
    // Ignore
  }

  return null;
}

/**
 * Extract from H1 or main heading
 */
export function detectFromHeading(html: string): CompanySource | null {
  try {
    const dom = new JSDOM(html);
    const h1 = dom.window.document.querySelector('h1, [role="heading"][aria-level="1"]');
    
    if (h1 && h1.textContent) {
      const text = h1.textContent.trim();
      if (text && text.length < 100 && text.length > 2) {
        return {
          type: 'heading',
          confidence: 0.75,
          value: text,
        };
      }
    }
  } catch (error) {
    // Ignore DOM errors
  }

  return null;
}

/**
 * Extract from domain name
 */
export function detectFromDomain(url: string): CompanySource | null {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    if (domain) {
      // Extract company name from domain (remove www, extract main part)
      let company = domain
        .replace(/^www\./, '')
        .split('.')[0]
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

      if (company && company.length < 50) {
        return {
          type: 'domain',
          confidence: 0.40, // Low confidence for domain-only detection
          value: company,
        };
      }
    }
  } catch (error) {
    // Ignore URL errors
  }

  return null;
}

/**
 * Main company detection function
 * Runs all detection methods and returns aggregated result
 */
export function detectCompany(html: string, url: string): CompanyDetection | null {
  const sources: CompanySource[] = [];

  // Run all detection methods in priority order
  const schemaOrg = detectFromSchemaOrg(html);
  if (schemaOrg) sources.push(schemaOrg);

  const jsonLd = detectFromJSONLD(html);
  if (jsonLd) sources.push(jsonLd);

  const og = detectFromOpenGraph(html);
  if (og) sources.push(og);

  const title = detectFromPageTitle(html);
  if (title) sources.push(title);

  const heading = detectFromHeading(html);
  if (heading) sources.push(heading);

  const domain = detectFromDomain(url);
  if (domain) sources.push(domain);

  if (sources.length === 0) {
    return null;
  }

  // Use highest confidence source as primary
  const primary = sources.reduce((a, b) => a.confidence > b.confidence ? a : b);

  // Calculate aggregate confidence
  const avgConfidence = sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length;
  const confidence = Math.min(0.99, Math.max(0.1, avgConfidence));

  return {
    name: primary.value,
    confidence,
    source: primary.type,
    sources,
  };
}

/**
 * Verify company name validity
 */
export function isValidCompanyName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  
  const trimmed = name.trim();
  
  // Must be 2-100 characters
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  
  // Cannot be pure numbers or special characters only
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  
  // Common false positives to exclude
  const falsePositives = [
    'page',
    'document',
    'content',
    'article',
    'homepage',
    'site',
    'website',
    'untitled',
    'loading',
    'error',
  ];
  
  if (falsePositives.includes(trimmed.toLowerCase())) return false;
  
  return true;
}

/**
 * Deduplicate and normalize company names
 */
export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\W_]/g, (char) => (char === ' ' || char === '-' ? char : ''))
    .trim();
}

/**
 * Batch company detection
 */
export function detectCompanyBatch(pages: Array<{ html: string; url: string }>): CompanyDetection[] {
  return pages
    .map(page => detectCompany(page.html, page.url))
    .filter((detection): detection is CompanyDetection => {
      return detection !== null && isValidCompanyName(detection.name);
    })
    .map(detection => ({
      ...detection,
      name: normalizeCompanyName(detection.name),
    }));
}
