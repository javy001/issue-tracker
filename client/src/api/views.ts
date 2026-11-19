// Saved view hooks (§6.2 v1.8).
import type { CreateViewInput, SavedViewDto, UpdateViewInput } from '@tracker/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.ts';

export const viewKeys = {
  all: () => ['views'] as const,
  detail: (id: string) => ['views', id] as const,
};

export const useViews = () =>
  useQuery({ queryKey: viewKeys.all(), queryFn: () => apiFetch<SavedViewDto[]>('/views') });

export const useView = (id: string) =>
  useQuery({
    queryKey: viewKeys.detail(id),
    queryFn: () => apiFetch<SavedViewDto>(`/views/${encodeURIComponent(id)}`),
  });

export function useCreateView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateViewInput) =>
      apiFetch<SavedViewDto>('/views', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (view) => {
      qc.setQueryData(viewKeys.detail(view.id), view);
      return qc.invalidateQueries({ queryKey: viewKeys.all(), exact: true });
    },
  });
}

export function useUpdateView(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateViewInput) =>
      apiFetch<SavedViewDto>(`/views/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (view) => {
      qc.setQueryData(viewKeys.detail(id), view);
      return qc.invalidateQueries({ queryKey: viewKeys.all(), exact: true });
    },
  });
}

export function useDeleteView(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`/views/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: viewKeys.detail(id) });
      return qc.invalidateQueries({ queryKey: viewKeys.all(), exact: true });
    },
  });
}
