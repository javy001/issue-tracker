import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client.ts';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ status: 'ok' }>('/health'),
    retry: false,
  });
}
