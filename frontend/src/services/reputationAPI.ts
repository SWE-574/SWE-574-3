import apiClient, { getErrorMessage } from './api'
import type {
  NegativeReputationData,
  NegativeReputationResponse,
  PositiveReputationResponse,
  ReputationData,
} from '@/types'

export interface SubmitCombinedEvaluationPayload {
  handshake_id: string
  positive: {
    punctual: boolean
    helpful: boolean
    kindness: boolean
  }
  negative: {
    is_late: boolean
    is_unhelpful: boolean
    is_rude: boolean
  }
  comment?: string
}

export interface SubmitCombinedEvaluationResult {
  positive?: PositiveReputationResponse
  negative?: NegativeReputationResponse
}

function hasPositiveTraits(data: ReputationData): boolean {
  return Boolean(data.punctual || data.helpful || data.kindness)
}

function hasNegativeTraits(data: NegativeReputationData): boolean {
  return Boolean(data.is_late || data.is_unhelpful || data.is_rude)
}

export const reputationAPI = {
  submitPositive: async (payload: ReputationData): Promise<PositiveReputationResponse> => {
    const res = await apiClient.post<PositiveReputationResponse>('/reputation/', payload)
    return res.data
  },

  submitNegative: async (payload: NegativeReputationData): Promise<NegativeReputationResponse> => {
    const res = await apiClient.post<NegativeReputationResponse>('/reputation/negative/', payload)
    return res.data
  },

  submitCombined: async (
    payload: SubmitCombinedEvaluationPayload,
  ): Promise<SubmitCombinedEvaluationResult> => {
    const positivePayload: ReputationData = {
      handshake_id: payload.handshake_id,
      punctual: payload.positive.punctual,
      helpful: payload.positive.helpful,
      kindness: payload.positive.kindness,
      comment: payload.comment?.trim() || undefined,
    }
    const negativePayload: NegativeReputationData = {
      handshake_id: payload.handshake_id,
      is_late: payload.negative.is_late,
      is_unhelpful: payload.negative.is_unhelpful,
      is_rude: payload.negative.is_rude,
      comment: payload.comment?.trim() || undefined,
    }

    const hasPositive = hasPositiveTraits(positivePayload)
    const hasNegative = hasNegativeTraits(negativePayload)

    if (!hasPositive && !hasNegative) {
      throw new Error('Select at least one trait before submitting.')
    }

    const result: SubmitCombinedEvaluationResult = {}

    try {
      if (hasPositive) {
        result.positive = await reputationAPI.submitPositive(positivePayload)
      }
      if (hasNegative) {
        result.negative = await reputationAPI.submitNegative(negativePayload)
      }
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Failed to submit evaluation.'))
    }

    return result
  },
}
