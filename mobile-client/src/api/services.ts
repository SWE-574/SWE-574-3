/**
 * Services API – CRUD for services (offers/needs), comments, interest, report, visibility
 * GET/POST /api/services/, GET/PUT/PATCH/DELETE /api/services/{id}/,
 * comments, interest, report, toggle-visibility
 */

import { normalizeRuntimeUrl } from "../constants/env";
import { apiRequest } from './client';
import type { Service, PaginatedResponse } from './types';

export interface ServiceRequest {
  title: string;
  description: string;
  type: 'Offer' | 'Need' | 'Event';
  duration: number;
  max_participants: number;
  tags?: string[];
  tag_ids?: string[];
  tag_names?: string[];
  location_type: string;
  location_area?: string;
  schedule_type?: string;
  schedule_details?: string;
  scheduled_time?: string;
  location_lat?: string;
  location_lng?: string;
  session_exact_location?: string;
  session_exact_location_lat?: string;
  session_exact_location_lng?: string;
  session_location_guide?: string;
  wikidata_labels_json?: string;
}

export interface ServicesListParams {
  page?: number;
  page_size?: number;
  type?: 'Offer' | 'Need' | 'Event';
  search?: string;
  tags?: string;
  location_type?: string;
  /** Owner filter; matches web `serviceAPI.list` (`?user=`). */
  user?: string;
}

function normalizeService(service: Service): Service {
  return {
    ...service,
    ...(service.user
      ? {
          user: {
            ...service.user,
            avatar_url: normalizeRuntimeUrl(service.user.avatar_url),
            banner_url: normalizeRuntimeUrl(service.user.banner_url),
          },
        }
      : {}),
    ...(service.media
      ? {
          media: service.media.map((item) => ({
            ...item,
            file_url: normalizeRuntimeUrl(item.file_url) ?? item.file_url,
          })),
        }
      : {}),
  };
}

export function listServices(params?: ServicesListParams): Promise<PaginatedResponse<Service>> {
  return apiRequest<PaginatedResponse<Service>>('/services/', {
    params: params as Record<string, string | number | undefined>,
  }).then((response) => ({
    ...response,
    results: (response.results ?? []).map(normalizeService),
  }));
}

export function getService(id: string): Promise<Service> {
  return apiRequest<Service>(`/services/${id}/`).then(normalizeService);
}

export function createService(body: ServiceRequest | FormData): Promise<Service> {
  return apiRequest<Service>('/services/', { method: 'POST', body }).then(normalizeService);
}

export function updateService(id: string, body: Partial<ServiceRequest> | FormData): Promise<Service> {
  return apiRequest<Service>(`/services/${id}/`, { method: 'PUT', body }).then(normalizeService);
}

export function patchService(id: string, body: Partial<ServiceRequest> | FormData): Promise<Service> {
  return apiRequest<Service>(`/services/${id}/`, { method: 'PATCH', body }).then(normalizeService);
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
