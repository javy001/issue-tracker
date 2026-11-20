// AI hooks (§8). Results are suggestions; the UI decides what to apply.
import type {
  EstimateRequest,
  EstimateResponse,
  ParseFilterRequest,
  ParseFilterResponse,
  SuggestAssigneeRequest,
  SuggestAssigneeResponse,
} from '@tracker/shared';
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

/** §8.2 (v1.12): on demand only, so a mutation rather than a query. */
export function useEstimateSuggestion() {
  return useMutation({
    mutationFn: (input: EstimateRequest) =>
      apiFetch<EstimateResponse>('/ai/estimate', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

/** §8.3 (v1.13): on demand only, for unassigned tasks. */
export function useAssigneeSuggestion() {
  return useMutation({
    mutationFn: (input: SuggestAssigneeRequest) =>
      apiFetch<SuggestAssigneeResponse>('/ai/suggest-assignee', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}
