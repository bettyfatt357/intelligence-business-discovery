/**
 * PageContent
 * 
 * Extracted and processed page content.
 * Captures both raw and processed information about the discovered page.
 */

export interface PageMetadata {
  /** Page title */
  title?: string;

  /** Page description/meta description */
  description?: string;

  /** Page language */
  language?: string;

  /** Character set */
  charset?: string;

  /** Open Graph title */
  ogTitle?: string;

  /** Open Graph description */
  ogDescription?: string;

  /** Open Graph image */
  ogImage?: string;
}

export interface PageContent {
  /** URL of the page */
  url: string;

  /** Page title and description from metadata */
  metadata: PageMetadata;

  /** Full page title for pattern matching */
  pageTitle?: string;

  /** Main headings (H1, H2, etc.) */
  headings: {
    h1: string[];
    h2: string[];
  };

  /** Page structure - what types of content exist */
  structure: {
    hasContactForm: boolean;
    hasEmailVisible: boolean;
    hasPhoneVisible: boolean;
    hasSocialLinks: boolean;
    hasTeamPage: boolean;
  };

  /** Detected technologies/frameworks */
  detectedTechnologies: {
    framework?: string; // React, Vue, Angular, Next.js, Nuxt, etc.
    hasShadowDOM: boolean;
    hasReact: boolean;
    hasVue: boolean;
    hasAngular: boolean;
  };

  /** Raw HTML length and stats */
  stats: {
    htmlLength: number;
    hasJavaScript: boolean;
    isRenderable: boolean; // Can JS be executed to extract content
  };

  /** HTTP response metadata */
  response?: {
    status: number;
    contentType?: string;
    lastModified?: Date;
    cacheControl?: string;
  };

  /** Processing metadata */
  processed: {
    fetchedAt: Date;
    processingTimeMs: number;
    encoding: string;
  };
}
