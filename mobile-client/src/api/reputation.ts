/**
 * Reputation API – list, create, retrieve, update, delete; negative feedback
 * GET/POST /api/reputation/, GET/PUT/PATCH/DELETE /api/reputation/{id}/, POST /api/reputation/negative/
 */

import { apiRequest } from './client';
import type { PaginatedResponse } from './types';

export interface ReputationEntry {
  id: string;
  from_user?: string | object;
  to_user?: string | object;
  handshake?: string;
  rating?: number;
  comment?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ReputationRequest {
  handshake: string;
  rating?: number;
  comment?: string;
  [key: string]: unknown;
}

export interface ReputationListParams {
  page?: number;
  page_size?: number;
}

export function listReputation(params?: ReputationListParams): Promise<PaginatedResponse<ReputationEntry>> {
  return apiRequest<PaginatedResponse<ReputationEntry>>('/reputation/', { params: params as Record<string, string | number | undefined> });
}

export function getReputation(id: string): Promise<ReputationEntry> {
  return apiRequest<ReputationEntry>(`/reputation/${id}/`);
}

export function createReputation(body: ReputationRequest): Promise<ReputationEntry> {
  return apiRequest<ReputationEntry>('/reputation/', { method: 'POST', body });
}

export function updateReputation(id: string, body: Partial<ReputationRequest>): Promise<ReputationEntry> {
  return apiRequest<ReputationEntry>(`/reputation/${id}/`, { method: 'PUT', body });
}

export function patchReputation(id: string, body: Partial<ReputationRequest>): Promise<ReputationEntry> {
  return apiRequest<ReputationEntry>(`/reputation/${id}/`, { method: 'PATCH', body });
}

export function deleteReputation(id: string): Promise<void> {
  return apiRequest<void>(`/reputation/${id}/`, { method: 'DELETE' });
}

export function createNegativeReputation(body: ReputationRequest): Promise<ReputationEntry> {
  return apiRequest<ReputationEntry>('/reputation/negative/', { method: 'POST', body });
}
