/**
 * GET /api/v2/job/:id
 * 
 * API v2 - Returns full job with intelligence data
 * Includes discovery context, company detection, and extraction intelligence
 */

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { formatAsV2 } from '@/lib/api/response-formatter';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Validate job ID format
    if (!jobId || typeof jobId !== 'string' || jobId.length === 0) {
      return NextResponse.json(
        { error: 'Invalid job ID' },
        { status: 400 }
      );
    }

    // Initialize Redis client
    const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
      automaticDeserialization: false,
    });

    // Get job from Redis
    const jobJson = (await redis.get(`job:${jobId}`)) as string | null;

    if (!jobJson) {
      return NextResponse.json(
        { error: `Job ${jobId} not found` },
        { status: 404 }
      );
    }

    try {
      const job = JSON.parse(jobJson);

      // Check if job is completed
      if (job.status !== 'completed' && job.status !== 'failed') {
        return NextResponse.json(
          {
            id: job.id,
            status: job.status,
            message: `Job is still ${job.status}. Please wait for completion.`,
            url: job.url,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
          },
          { status: 202 }
        );
      }

      // Format response using v2 formatter (includes intelligence)
      const response = formatAsV2(job);

      return NextResponse.json(response, { status: 200 });
    } catch (parseError) {
      console.error(`[API v2] Failed to parse job ${jobId}:`, parseError);
      return NextResponse.json(
        { error: 'Failed to parse job data' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[API v2] Error fetching job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
