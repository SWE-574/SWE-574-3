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
  handshake?: string;
  handshake_id?: string;
  rating?: number;
  comment?: string;
  [key: string]: unknown;
}

export interface SubmitCombinedEvaluationPayload {
  handshake_id: string;
  positive: {
    punctual: boolean;
    helpful: boolean;
    kindness: boolean;
  };
  negative: {
    is_late: boolean;
    is_unhelpful: boolean;
    is_rude: boolean;
  };
  comment?: string;
}

export interface SubmitCombinedEventEvaluationPayload {
  handshake_id: string;
  positive: {
    well_organized: boolean;
    engaging: boolean;
    welcoming: boolean;
  };
  negative: {
    disorganized: boolean;
    boring: boolean;
    unwelcoming: boolean;
  };
  comment?: string;
}

function hasTruthyValue(values: Record<string, boolean>): boolean {
  return Object.values(values).some(Boolean);
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

export async function submitCombinedEvaluation(
  payload: SubmitCombinedEvaluationPayload,
): Promise<{ positive?: ReputationEntry; negative?: ReputationEntry }> {
  const result: { positive?: ReputationEntry; negative?: ReputationEntry } = {};
  const comment = payload.comment?.trim() || undefined;

  if (!hasTruthyValue(payload.positive) && !hasTruthyValue(payload.negative)) {
    throw new Error('Select at least one trait before submitting.');
  }

  if (hasTruthyValue(payload.positive)) {
    result.positive = await createReputation({
      handshake_id: payload.handshake_id,
      ...payload.positive,
      comment,
    });
  }

  if (hasTruthyValue(payload.negative)) {
    result.negative = await createNegativeReputation({
      handshake_id: payload.handshake_id,
      ...payload.negative,
      comment,
    });
  }

  return result;
}

export async function submitCombinedEventEvaluation(
  payload: SubmitCombinedEventEvaluationPayload,
): Promise<{ positive?: ReputationEntry; negative?: ReputationEntry }> {
  const result: { positive?: ReputationEntry; negative?: ReputationEntry } = {};
  const comment = payload.comment?.trim() || undefined;

  if (!hasTruthyValue(payload.positive) && !hasTruthyValue(payload.negative)) {
    throw new Error('Select at least one trait before submitting.');
  }

  if (hasTruthyValue(payload.positive)) {
    result.positive = await createReputation({
      handshake_id: payload.handshake_id,
      ...payload.positive,
      comment,
    });
  }

  if (hasTruthyValue(payload.negative)) {
    result.negative = await createNegativeReputation({
      handshake_id: payload.handshake_id,
      ...payload.negative,
      comment,
    });
  }

  return result;
}
