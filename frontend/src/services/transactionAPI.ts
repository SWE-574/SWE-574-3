import apiClient from './api'
import type { PaginatedTransactionResponse, Transaction, TransactionSummary } from '@/types'

export type TransactionDirection = 'all' | 'credit' | 'debit'

const EMPTY_SUMMARY: TransactionSummary = {
  current_balance: 0,
  total_earned: 0,
  total_spent: 0,
}

function normalizeTransaction(transaction: Transaction): Transaction {
  return {
    ...transaction,
    amount: Number(transaction.amount ?? 0),
    balance_after: Number(transaction.balance_after ?? 0),
  }
}

export const transactionAPI = {
  list: async (
    params: { page?: number; direction?: TransactionDirection } = {},
    signal?: AbortSignal,
  ): Promise<PaginatedTransactionResponse> => {
    const res = await apiClient.get<PaginatedTransactionResponse | Transaction[]>(
      '/transactions/',
      {
        params: {
          page: params.page ?? 1,
          direction: params.direction ?? 'all',
        },
        signal,
      },
    )

    if (Array.isArray(res.data)) {
      return {
        count: res.data.length,
        next: null,
        previous: null,
        results: res.data.map(normalizeTransaction),
        summary: EMPTY_SUMMARY,
      }
    }

    return {
      ...res.data,
      summary: {
        current_balance: Number(res.data.summary?.current_balance ?? 0),
        total_earned: Number(res.data.summary?.total_earned ?? 0),
        total_spent: Number(res.data.summary?.total_spent ?? 0),
      },
      results: res.data.results.map(normalizeTransaction),
    }
  },
}
