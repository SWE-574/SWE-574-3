/**
 * Handshakes API – list, create, retrieve, update, delete; accept, approve, cancel, confirm, decline, deny, initiate, report, request-changes; interest by service
 * GET/POST /api/handshakes/, GET/PUT/PATCH/DELETE /api/handshakes/{id}/, action endpoints
 */

import { apiRequest } from './client';
import type { PaginatedResponse } from './types';

export interface Handshake {
  id: string;
  service: string | object;
  initiator?: string | object;
  status: string;
  created_at: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface HandshakeRequest {
  service: string;
  [key: string]: unknown;
}

export type HandshakeIssueType = 'no_show' | 'service_issue' | 'harassment' | 'spam' | 'scam' | 'other'

export interface HandshakesListParams {
  page?: number;
  page_size?: number;
  status?: string;
}

export function listHandshakes(params?: HandshakesListParams): Promise<PaginatedResponse<Handshake>> {
  return apiRequest<PaginatedResponse<Handshake>>('/handshakes/', { params: params as Record<string, string | number | undefined> });
}

export function getHandshake(id: string): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/`);
}

export function createHandshake(body: HandshakeRequest): Promise<Handshake> {
  return apiRequest<Handshake>('/handshakes/', { method: 'POST', body });
}

export function updateHandshake(id: string, body: Partial<HandshakeRequest>): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/`, { method: 'PUT', body });
}

export function patchHandshake(id: string, body: Partial<HandshakeRequest>): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/`, { method: 'PATCH', body });
}

export function deleteHandshake(id: string): Promise<void> {
  return apiRequest<void>(`/handshakes/${id}/`, { method: 'DELETE' });
}

export function acceptHandshake(id: string, body?: object): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/accept/`, { method: 'POST', body: body ?? {} });
}

export function approveHandshake(id: string, body?: object): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/approve/`, { method: 'POST', body: body ?? {} });
}

export function cancelHandshake(id: string, body?: object): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/cancel/`, { method: 'POST', body: body ?? {} });
}

export function confirmHandshake(id: string, body?: object): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/confirm/`, { method: 'POST', body: body ?? {} });
}

export function declineHandshake(id: string, body?: object): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/decline/`, { method: 'POST', body: body ?? {} });
}

export function denyHandshake(id: string, body?: object): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/deny/`, { method: 'POST', body: body ?? {} });
}

export function initiateHandshake(id: string, body?: object): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/initiate/`, { method: 'POST', body: body ?? {} });
}

export function requestCancellationHandshake(id: string, body?: { reason?: string }): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/cancel-request/`, {
    method: 'POST',
    body: body ?? {},
  });
}

export function approveCancellationHandshake(id: string, body?: object): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/cancel-request/approve/`, {
    method: 'POST',
    body: body ?? {},
  });
}

export function rejectCancellationHandshake(id: string, body?: object): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/cancel-request/reject/`, {
    method: 'POST',
    body: body ?? {},
  });
}

export function reportHandshake(
  id: string,
  body?: { issue_type?: HandshakeIssueType; description?: string; reported_user_id?: string },
): Promise<unknown> {
  return apiRequest(`/handshakes/${id}/report/`, { method: 'POST', body: body ?? {} });
}

export function requestHandshakeChanges(id: string, body?: object): Promise<Handshake> {
  return apiRequest<Handshake>(`/handshakes/${id}/request-changes/`, { method: 'POST', body: body ?? {} });
}

export function handshakeServiceInterest(serviceId: string, body?: object): Promise<unknown> {
  return apiRequest(`/handshakes/services/${serviceId}/interest/`, { method: 'POST', body: body ?? {} });
}
