// AI hooks (§8). Results are suggestions; the UI decides what to apply.
import type { ParseFilterRequest, ParseFilterResponse } from '@tracker/shared';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from './client.ts';

export function useParseFilter() {
  return useMutation({
    mutationFn: (input: ParseFilterRequest) =>
      apiFetch<ParseFilterResponse>('/ai/parse-filter', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}
