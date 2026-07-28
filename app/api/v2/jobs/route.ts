/**
 * GET /api/v2/jobs
 * 
 * API v2 - Returns list of jobs with intelligence data
 * Supports filtering by quality score and pagination
 */

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { formatListAsV2, filterHighQuality, sortByQuality } from '@/lib/api/response-formatter';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse query parameters
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const minQuality = url.searchParams.get('minQuality') ? parseFloat(url.searchParams.get('minQuality')!) : undefined;
    const status = url.searchParams.get('status') || 'completed';

    // Validate parameters
    if (limit < 1 || limit > 1000) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 1000' },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: 'Offset must be non-negative' },
        { status: 400 }
      );
    }

    // Initialize Redis client
    const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
      automaticDeserialization: false,
    });

    // Get completed jobs
    let jobIds: string[] = [];

    if (status === 'completed') {
      // Get from completed set
      const completedIds = (await redis.smembers('jobs:completed')) as string[];
      jobIds = completedIds || [];
    } else if (status === 'pending') {
      // Get from pending list
      const pendingIds = (await redis.lrange('queue:pending', 0, -1)) as string[];
      jobIds = pendingIds || [];
    } else if (status === 'all') {
      // Get all jobs
      const completedIds = (await redis.smembers('jobs:completed')) as string[];
      const pendingIds = (await redis.lrange('queue:pending', 0, -1)) as string[];
      jobIds = [...(completedIds || []), ...(pendingIds || [])];
    }

    // Get job details
    const jobs = [];
    for (const jobId of jobIds) {
      try {
        const jobJson = (await redis.get(`job:${jobId}`)) as string | null;
        if (jobJson) {
          const job = JSON.parse(jobJson);
          jobs.push(job);
        }
      } catch (e) {
        // Skip malformed jobs
      }
    }

    // Filter by quality if specified
    let filteredJobs = jobs;
    if (minQuality !== undefined) {
      filteredJobs = filterHighQuality(jobs, minQuality);
    }

    // Sort by quality
    const sortedJobs = sortByQuality(filteredJobs);

    // Apply pagination
    const paginatedJobs = sortedJobs.slice(offset, offset + limit);

    // Format response using v2 formatter
    const formattedJobs = formatListAsV2(paginatedJobs);

    return NextResponse.json(
      {
        jobs: formattedJobs,
        total: sortedJobs.length,
        limit,
        offset,
        hasMore: offset + limit < sortedJobs.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API v2] Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
