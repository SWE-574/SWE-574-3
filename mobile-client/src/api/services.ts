/**
 * Services API – CRUD for services (offers/needs), comments, interest, report, visibility
 * GET/POST /api/services/, GET/PUT/PATCH/DELETE /api/services/{id}/,
 * comments, interest, report, toggle-visibility
 */

import { apiRequest } from './client';
import type { Service, PaginatedResponse } from './types';

export interface ServiceRequest {
  title: string;
  description: string;
  type: 'Offer' | 'Need';
  duration: number;
  max_participants: number;
  tags: string[];
  location_type: string;
  location_area?: string;
  schedule_type?: string;
  schedule_details?: string;
}

export interface ServicesListParams {
  page?: number;
  page_size?: number;
  type?: 'Offer' | 'Need';
  search?: string;
  tags?: string;
  location_type?: string;
}

export function listServices(params?: ServicesListParams): Promise<PaginatedResponse<Service>> {
  return apiRequest<PaginatedResponse<Service>>('/services/', { params: params as Record<string, string | number | undefined> });
}

export function getService(id: string): Promise<Service> {
  return apiRequest<Service>(`/services/${id}/`);
}

export function createService(body: ServiceRequest): Promise<Service> {
  return apiRequest<Service>('/services/', { method: 'POST', body });
}

export function updateService(id: string, body: Partial<ServiceRequest>): Promise<Service> {
  return apiRequest<Service>(`/services/${id}/`, { method: 'PUT', body });
}

export function patchService(id: string, body: Partial<ServiceRequest>): Promise<Service> {
  return apiRequest<Service>(`/services/${id}/`, { method: 'PATCH', body });
}

export function deleteService(id: string): Promise<void> {
  return apiRequest<void>(`/services/${id}/`, { method: 'DELETE' });
}

export function reportService(id: string, body?: { reason?: string }): Promise<unknown> {
  return apiRequest(`/services/${id}/report/`, { method: 'POST', body: body ?? {} });
}

export function toggleServiceVisibility(id: string): Promise<Service> {
  return apiRequest<Service>(`/services/${id}/toggle-visibility/`, { method: 'POST' });
}

export function addServiceInterest(serviceId: string, body?: { message?: string }): Promise<unknown> {
  return apiRequest(`/services/${serviceId}/interest/`, { method: 'POST', body: body ?? {} });
}
