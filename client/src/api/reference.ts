// Reference data hooks (§7.1). Rarely changes, so it is cached for the session.
import type { ProductDto, TagDto, TeamDto, UserDto } from '@tracker/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiFetch } from './client.ts';

const forever = { staleTime: Infinity, gcTime: Infinity } as const;

export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: () => apiFetch<UserDto>('/me'), ...forever });
export const useUsers = () =>
  useQuery({ queryKey: ['users'], queryFn: () => apiFetch<UserDto[]>('/users'), ...forever });
export const useTeams = () =>
  useQuery({ queryKey: ['teams'], queryFn: () => apiFetch<TeamDto[]>('/teams'), ...forever });
export const useProducts = () =>
  useQuery({
    queryKey: ['products'],
    queryFn: () => apiFetch<ProductDto[]>('/products'),
    ...forever,
  });
export const useTags = () =>
  useQuery({ queryKey: ['tags'], queryFn: () => apiFetch<TagDto[]>('/tags'), ...forever });

/** Lookups for joining identifiers in TaskDto to names and colors (§7.1 v1.3). */
export function useLookups() {
  const users = useUsers().data;
  const tags = useTags().data;
  const teams = useTeams().data;
  return useMemo(
    () => ({
      user: new Map((users ?? []).map((u) => [u.handle, u])),
      tagColor: new Map((tags ?? []).map((t) => [t.name, t.color])),
      team: new Map((teams ?? []).map((t) => [t.key, t])),
    }),
    [users, tags, teams],
  );
}
