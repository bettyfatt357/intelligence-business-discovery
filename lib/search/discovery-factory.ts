/**
 * Discovery Record Factory
 * 
 * Transforms Google search results into DiscoveryRecords
 * Captures search context and metadata at search time
 */

import { DiscoveryRecord } from '../business-discovery';
import { randomBytes } from 'crypto';

interface GoogleResult {
  link: string;
  title: string;
  snippet: string;
}

/**
 * Extract display URL from full URL
 */
function getDisplayUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname : '');
  } catch {
    return url;
  }
}

/**
 * Create DiscoveryRecords from Google search results
 */
export function createDiscoveryRecords(
  googleResults: GoogleResult[],
  searchContext: {
    keyword: string;
    generatedQuery: string;
    location?: string;
    searchDepth?: number;
  }
): DiscoveryRecord[] {
  return googleResults.map((result, index) => {
    const record: DiscoveryRecord = {
      id: `discovery_${randomBytes(8).toString('hex')}`,
      searchContext: {
        keyword: searchContext.keyword,
        location: searchContext.location,
        searchDepth: searchContext.searchDepth || 1,
        searchedAt: new Date(),
      },
      googleResult: {
        rank: index + 1,
        query: searchContext.generatedQuery,
        url: result.link,
        title: result.title,
        snippet: result.snippet,
        displayUrl: getDisplayUrl(result.link),
      },
      status: 'pending',
      createdAt: new Date(),
    };

    return record;
  });
}

/**
 * Batch create discovery records with validation
 */
export function createDiscoveryRecordsBatch(
  googleResults: GoogleResult[],
  searchContext: {
    keyword: string;
    generatedQuery: string;
    location?: string;
    searchDepth?: number;
  }
): {
  records: DiscoveryRecord[];
  errors: Array<{ index: number; error: string }>;
} {
  const records: DiscoveryRecord[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  googleResults.forEach((result, index) => {
    try {
      const record: DiscoveryRecord = {
        id: `discovery_${randomBytes(8).toString('hex')}`,
        searchContext: {
          keyword: searchContext.keyword,
          location: searchContext.location,
          searchDepth: searchContext.searchDepth || 1,
          searchedAt: new Date(),
        },
        googleResult: {
          rank: index + 1,
          query: searchContext.generatedQuery,
          url: result.link,
          title: result.title,
          snippet: result.snippet,
          displayUrl: getDisplayUrl(result.link),
        },
        status: 'pending',
        createdAt: new Date(),
      };

      records.push(record);
    } catch (error) {
      errors.push({
        index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return { records, errors };
}
