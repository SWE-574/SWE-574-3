/**
 * Transactions API – list and retrieve transaction history.
 * GET /api/transactions/, GET /api/transactions/{id}/
 */

import { apiRequest } from "./client";
import type { PaginatedResponse } from "./types";

export type TransactionDirection = "all" | "credit" | "debit" | "reservation";

export interface TransactionCounterpart {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string | null;
}

export interface Transaction {
  id: string;
  handshake_id?: string | null;
  service_id?: string | null;
  transaction_type: "provision" | "transfer" | "refund" | "adjustment" | string;
  transaction_type_display?: string;
  service_type?: "Offer" | "Need" | "Event" | null;
  schedule_type?: "One-Time" | "Recurrent" | string | null;
  max_participants?: number | null;
  handshake_status?: string | null;
  service_status?: string | null;
  is_current_user_provider?: boolean;
  counterpart: TransactionCounterpart | null;
  amount: number;
  balance_after: number;
  description: string;
  service_title?: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface TransactionSummary {
  current_balance: number;
  total_earned: number;
  total_spent: number;
}

export interface PaginatedTransactionResponse
  extends PaginatedResponse<Transaction> {
  summary: TransactionSummary;
}

export interface TransactionsListParams {
  page?: number;
  page_size?: number;
  direction?: TransactionDirection;
}

export const EMPTY_SUMMARY: TransactionSummary = {
  current_balance: 0,
  total_earned: 0,
  total_spent: 0,
};

function toNumber(value: unknown): number {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function normalizeTransaction(raw: Partial<Transaction>): Transaction {
  return {
    id: String(raw.id ?? ""),
    handshake_id:
      raw.handshake_id == null ? null : String(raw.handshake_id),
    service_id: raw.service_id == null ? null : String(raw.service_id),
    transaction_type: String(raw.transaction_type ?? "adjustment"),
    transaction_type_display: raw.transaction_type_display
      ? String(raw.transaction_type_display)
      : undefined,
    service_type:
      raw.service_type == null
        ? null
        : (String(raw.service_type) as Transaction["service_type"]),
    schedule_type:
      raw.schedule_type == null
        ? null
        : (String(raw.schedule_type) as Transaction["schedule_type"]),
    max_participants:
      raw.max_participants == null ? null : toNumber(raw.max_participants),
    handshake_status:
      raw.handshake_status == null ? null : String(raw.handshake_status),
    service_status:
      raw.service_status == null ? null : String(raw.service_status),
    is_current_user_provider: raw.is_current_user_provider === true,
    counterpart: raw.counterpart
      ? {
          id: String((raw.counterpart as TransactionCounterpart).id ?? ""),
          first_name: String(
            (raw.counterpart as TransactionCounterpart).first_name ?? "",
          ),
          last_name: String(
            (raw.counterpart as TransactionCounterpart).last_name ?? "",
          ),
          email: String((raw.counterpart as TransactionCounterpart).email ?? ""),
          avatar_url:
            (raw.counterpart as TransactionCounterpart).avatar_url ?? null,
        }
      : null,
    amount: toNumber(raw.amount),
    balance_after: toNumber(raw.balance_after),
    description: String(raw.description ?? ""),
    service_title:
      raw.service_title == null ? null : String(raw.service_title),
    created_at: String(raw.created_at ?? ""),
  };
}

function normalizeSummary(summary?: Partial<TransactionSummary> | null) {
  return {
    current_balance: toNumber(summary?.current_balance),
    total_earned: toNumber(summary?.total_earned),
    total_spent: toNumber(summary?.total_spent),
  };
}

export async function listTransactions(
  params: TransactionsListParams = {},
): Promise<PaginatedTransactionResponse> {
  const res = await apiRequest<
    PaginatedTransactionResponse | Transaction[]
  >("/transactions/", {
    params: params as Record<string, string | number | undefined>,
  });

  if (Array.isArray(res)) {
    return {
      count: res.length,
      next: null,
      previous: null,
      results: res.map(normalizeTransaction),
      summary: EMPTY_SUMMARY,
    };
  }

  return {
    count: Number(res.count ?? 0),
    next: res.next ?? null,
    previous: res.previous ?? null,
    results: (res.results ?? []).map(normalizeTransaction),
    summary: normalizeSummary(res.summary),
  };
}

export async function getTransaction(id: string): Promise<Transaction> {
  const res = await apiRequest<Transaction>(`/transactions/${id}/`);
  return normalizeTransaction(res);
}
