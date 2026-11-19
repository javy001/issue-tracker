// Task hooks (§9.5): lists use useInfiniteQuery with cursors (§7.2); edits are optimistic and
// roll back on error.
import type {
  FilterQueryInput,
  ListTasksResponse,
  TaskDetailDto,
  TaskDto,
  UpdateTaskInput,
} from '@tracker/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { apiFetch } from './client.ts';

export const taskKeys = {
  lists: () => ['tasks'] as const,
  list: (filter: FilterQueryInput) => ['tasks', filter] as const,
  detail: (id: string) => ['task', id.toUpperCase()] as const,
};

const PAGE_SIZE = 50;

export function useTaskList(filter: FilterQueryInput) {
  return useInfiniteQuery({
    queryKey: taskKeys.list(filter),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        filter: JSON.stringify(filter),
        limit: String(PAGE_SIZE),
      });
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<ListTasksResponse>(`/tasks?${params}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: taskKeys.detail(id ?? ''),
    queryFn: () => apiFetch<TaskDetailDto>(`/tasks/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

/** Applies a patch locally for the optimistic update. */
function applyPatch<T extends TaskDto>(task: T, input: UpdateTaskInput): T {
  const next: T = { ...task };
  if (input.title !== undefined) next.title = input.title;
  if (input.description !== undefined) next.description = input.description;
  if (input.status !== undefined) next.status = input.status;
  if (input.priority !== undefined) next.priority = input.priority;
  if (input.assignee !== undefined) next.assignee = input.assignee;
  if (input.product !== undefined) next.product = input.product;
  if (input.tags !== undefined) next.tags = [...new Set(input.tags)].sort();
  if (input.estimateHours !== undefined) {
    next.estimateHours = input.estimateHours;
    next.estimateSource = input.estimateHours === null ? null : (input.estimateSource ?? 'manual');
  }
  return next;
}

type ListData = InfiniteData<ListTasksResponse, string | null>;

export function useUpdateTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTaskInput) =>
      apiFetch<TaskDetailDto>(`/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onMutate: async (input) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: taskKeys.detail(id) }),
        qc.cancelQueries({ queryKey: taskKeys.lists() }),
      ]);
      const detail = qc.getQueryData<TaskDetailDto>(taskKeys.detail(id));
      const lists = qc.getQueriesData<ListData>({ queryKey: taskKeys.lists() });

      if (detail) qc.setQueryData(taskKeys.detail(id), applyPatch(detail, input));
      qc.setQueriesData<ListData>(
        { queryKey: taskKeys.lists() },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              items: p.items.map((t) => (t.id === id ? applyPatch(t, input) : t)),
            })),
          },
      );
      return { detail, lists };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.detail) qc.setQueryData(taskKeys.detail(id), ctx.detail);
      ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: (task) => {
      qc.setQueryData(taskKeys.detail(id), task);
    },
    onSettled: () => {
      // Lists may gain or lose the task (e.g. a status change on the Active page).
      void qc.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
