import { useEffect, useState } from 'react';
import { ApiClient, ApiError } from '@/lib/api/client';
import { getUserCredential } from '@/lib/auth/storage';

interface Metrics {
  activeJobs: number;
  completedJobs: number;
  totalEmails: number;
  totalSearches: number;
}

export function useMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        // Get user credential from storage (localStorage or future auth provider)
        const credential = getUserCredential();
        
        // Create API client with credential (will attach x-api-key header automatically)
        const client = new ApiClient(credential);
        
        // Fetch metrics with typed response
        const data = await client.get<Metrics>('/api/metrics');
        setMetrics(data);
        setError(null);
      } catch (err) {
        let message = 'Failed to fetch metrics';
        if (ApiError.isUnauthorized(err)) {
          message = 'Unauthorized - please check your API key';
        } else if (ApiError.isForbidden(err)) {
          message = 'Forbidden - insufficient permissions';
        } else if (err instanceof ApiError) {
          message = err.message;
        } else if (err instanceof Error) {
          message = err.message;
        }
        setError(message);
        console.error('[useMetrics] Error fetching metrics:', message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return { metrics, isLoading, error };
}
