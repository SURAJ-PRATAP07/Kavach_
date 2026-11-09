/*
 * Shared types.
 *
 * Section A mirrors the backend exactly (backend/app/detection/schemas.py,
 * backend/app/main.py, backend/app/streaming.py). Do not rename fields.
 *
 * Section B covers features the backend has planned but not built yet
 * (risk score, warnings, incidents, contacts). Confirm these shapes with
 * the backend team before connecting the real APIs.
 */

/* ------------------------------------------------------------------ */
/* A. Backend contracts that exist today                               */
/* ------------------------------------------------------------------ */

export type ScamStage =
  | 'impersonation'
  | 'threats'
  | 'isolation'
  | 'financial_extraction'

export const SCAM_STAGES: ScamStage[] = [
  'impersonation',
  'threats',
  'isolation',
  'financial_extraction',
]

export type TranscriptSource = 'rest' | 'streaming'
export type SignalStrength = 'low' | 'medium' | 'high'
export type ProviderTimestamp = string | number | null

export interface TranscriptSegment {
  text: string
  source: TranscriptSource
  segment_id?: string | null
  segment_index?: number | null
  timestamp?: ProviderTimestamp
  audio_duration_ms?: number | null
  language_code?: string | null
}

export interface DetectionEvidence {
  stage: ScamStage
  rule_id: string
  matched_text: string
  transcript_text: string
  reason: string
  signal_strength: SignalStrength
  source: TranscriptSource
  segment_id?: string | null
  segment_index?: number | null
  timestamp?: ProviderTimestamp
}

export interface StageAssessment {
  stage: ScamStage
  evidence: DetectionEvidence[]
}

export interface DetectionResult {
  segments_analyzed: number
  stage_assessments: StageAssessment[]
  disclaimer: string
}

/** GET /health */
export interface HealthResponse {
  status: string
  service: string
}

/** POST /transcribe */
export interface TranscribeResponse {
  success: boolean
  transcript: string
  model?: string | null
  request_id?: string | null
  processing_time?: number | null
  end_to_end_latency?: number | null
}

/** Messages the backend sends on WS /ws/transcribe */
export type StreamServerMessage =
  | {
      type: 'ready'
      message: string
      language: string
      model: string
      sample_rate: number
      channels: number
      encoding: string
      frame_bytes: number
    }
  | { type: 'connected'; sample_rate: number; chunk_size: number }
  | { type: 'processing'; timestamp: ProviderTimestamp }
  | {
      type: 'transcript'
      text: string
      segment_id: string | null
      segment_index: number | null
      audio_duration_ms: number | null
      latency: number | null
      timestamp: ProviderTimestamp
      detected_language_code: string | null
    }
  | { type: 'error'; message: string }
  | { type: 'stopped'; transcript_received_after_stop_command: boolean }
  | { type: 'provider_event'; event: string }

/* ------------------------------------------------------------------ */
/* B. Planned contracts (mock only for now)                            */
/* ------------------------------------------------------------------ */

export type RiskCategory = 'low' | 'moderate' | 'high' | 'critical'

/** Risk values are only ever displayed, never calculated, by the frontend. */
export interface RiskAssessment {
  score: number | null
  category: RiskCategory | null
  summary?: string | null
  assessed_at?: string | null
}

export type WarningSeverity = 'info' | 'caution' | 'danger'

export interface SafetyWarning {
  id: string
  created_at: string
  severity: WarningSeverity
  title: string
  message: string
  message_hi?: string
  reason: string
  recommended_actions: string[]
  stages: ScamStage[]
  incident_id?: string | null
  acknowledged: boolean
}

/** Combined analysis result for a conversation (planned backend shape). */
export interface ConversationAnalysis {
  detection: DetectionResult
  risk: RiskAssessment | null
  warning: SafetyWarning | null
}

export type SpeakerLabel = 'caller' | 'user' | 'unknown'

/** Transcript line as shown in the UI. Speaker labels are optional. */
export interface TranscriptLine extends TranscriptSegment {
  id: string
  speaker?: SpeakerLabel
  received_at: string
  offset_ms?: number
}

export type IncidentStatus = 'open' | 'reviewed' | 'reported'

export interface Incident {
  id: string
  started_at: string
  ended_at: string
  duration_seconds: number
  caller_label: string
  channel: 'phone' | 'video' | 'upload'
  language: string
  summary: string
  status: IncidentStatus
  risk: RiskAssessment | null
  transcript: TranscriptLine[]
  detection: DetectionResult
}

export type ContactRelation = 'family' | 'friend' | 'neighbour' | 'caregiver' | 'other'

export interface TrustedContact {
  id: string
  name: string
  relation: ContactRelation
  phone: string
  email?: string
  consent_given: boolean
  consent_at?: string | null
  notify_on: WarningSeverity[]
}

export interface AppSettings {
  useMock: boolean
  autoPlayWarning: boolean
  showSpeakerLabels: boolean
  storeTranscripts: boolean
  retentionDays: number
  notificationsConsent: boolean
  notificationsConsentAt: string | null
  notifyChannels: { sms: boolean; whatsapp: boolean; email: boolean }
  uiLanguage: 'en' | 'hi'
}

export type ConnectionState =
  | 'idle'
  | 'requesting_mic'
  | 'connecting'
  | 'ready'
  | 'streaming'
  | 'stopping'
  | 'stopped'
  | 'error'
