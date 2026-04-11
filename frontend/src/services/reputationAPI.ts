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

export interface SubmitCombinedEventEvaluationPayload {
  handshake_id: string
  positive: {
    well_organized: boolean
    engaging: boolean
    welcoming: boolean
  }
  negative: {
    disorganized: boolean
    boring: boolean
    unwelcoming: boolean
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

function hasPositiveEventTraits(p: SubmitCombinedEventEvaluationPayload['positive']): boolean {
  return Boolean(p.well_organized || p.engaging || p.welcoming)
}

function hasNegativeEventTraits(n: SubmitCombinedEventEvaluationPayload['negative']): boolean {
  return Boolean(n.disorganized || n.boring || n.unwelcoming)
}

export const reputationAPI = {
  attachReviewImages: async (handshakeId: string, images: File[]): Promise<void> => {
    const fd = new FormData()
    fd.append('handshake_id', handshakeId)
    images.forEach((img) => fd.append('images', img))
    await apiClient.post('/handshakes/add-review/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

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

  submitCombinedEvent: async (
    payload: SubmitCombinedEventEvaluationPayload,
  ): Promise<SubmitCombinedEvaluationResult> => {
    const hasPositive = hasPositiveEventTraits(payload.positive)
    const hasNegative = hasNegativeEventTraits(payload.negative)

    if (!hasPositive && !hasNegative) {
      throw new Error('Select at least one trait before submitting.')
    }

    const result: SubmitCombinedEvaluationResult = {}

    try {
      if (hasPositive) {
        result.positive = await reputationAPI.submitPositive({
          handshake_id: payload.handshake_id,
          well_organized: payload.positive.well_organized,
          engaging: payload.positive.engaging,
          welcoming: payload.positive.welcoming,
          comment: payload.comment?.trim() || undefined,
        })
      }
      if (hasNegative) {
        result.negative = await reputationAPI.submitNegative({
          handshake_id: payload.handshake_id,
          disorganized: payload.negative.disorganized,
          boring: payload.negative.boring,
          unwelcoming: payload.negative.unwelcoming,
          comment: payload.comment?.trim() || undefined,
        })
      }
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Failed to submit evaluation.'))
    }

    return result
  },
}
