/**
 * Transactions API – list and retrieve transaction history
 * GET /api/transactions/, GET /api/transactions/{id}/
 */

import { apiRequest } from './client';
import type { PaginatedResponse } from './types';

export interface Transaction {
  id: string;
  user?: string | object;
  amount?: string;
  type?: string;
  handshake?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface TransactionsListParams {
  page?: number;
  page_size?: number;
}

export function listTransactions(params?: TransactionsListParams): Promise<PaginatedResponse<Transaction>> {
  return apiRequest<PaginatedResponse<Transaction>>('/transactions/', { params: params as Record<string, string | number | undefined> });
}

export function getTransaction(id: string): Promise<Transaction> {
  return apiRequest<Transaction>(`/transactions/${id}/`);
}
