import { useEffect, useState } from 'react';
import { ApiClient, ApiError } from '@/lib/api/client';
import { getUserCredential } from '@/lib/auth/storage';

interface Usage {
  quotaUsed: number;
  quotaLimit: number;
  quotaRemaining: number;
  plan: string;
  resetDate: string;
}

export function useUsage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsage() {
      try {
        // Get user credential from storage (localStorage or future auth provider)
        const credential = getUserCredential();
        
        // Create API client with credential (will attach x-api-key header automatically)
        const client = new ApiClient(credential);
        
        // Fetch usage with typed response
        const data = await client.get<Usage>('/api/billing/status');
        setUsage(data);
        setError(null);
      } catch (err) {
        let message = 'Failed to fetch usage';
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
        console.error('[useUsage] Error fetching usage:', message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchUsage();
    const interval = setInterval(fetchUsage, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  return { usage, isLoading, error };
}
