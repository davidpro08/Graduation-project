import { authenticatedRequest } from '@/lib/api';
import type { FacetResponse } from './types';

export function fetchPersonaFacets(conversationId: string, province: string[], occupationSearch: string, page: number, signal: AbortSignal) {
  const query = new URLSearchParams({ occupationSearch, page: String(page) });
  province.forEach(value => query.append('province', value));
  return authenticatedRequest<FacetResponse>(`/conversations/${conversationId}/personas/facets?${query}`, { signal });
}
