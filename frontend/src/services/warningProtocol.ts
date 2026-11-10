import type {
  DetectionEvidence,
  DetectionResult,
  ScamStage,
  SignalStrength,
  StreamSafetyWarning,
  StreamServerMessage,
  StreamWarningDecision,
  TranscriptSource,
  WarningPlaybackClientStatus,
} from '../types'

export const MAX_WARNING_AUDIO_BYTES = 5 * 1024 * 1024

const SCAM_STAGES: ScamStage[] = [
  'impersonation',
  'threats',
  'isolation',
  'financial_extraction',
]
const PLAYBACK_STATUSES: WarningPlaybackClientStatus[] = [
  'received',
  'playback_started',
  'playback_completed',
  'playback_blocked',
  'playback_failed',
  'cancelled',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isTimestamp(value: unknown): value is string | number | null {
  return value === null || typeof value === 'string' || isFiniteNumber(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isStage(value: unknown): value is ScamStage {
  return typeof value === 'string' && SCAM_STAGES.includes(value as ScamStage)
}

function isDetectionEvidence(value: unknown): value is DetectionEvidence {
  if (!isRecord(value)) return false
  const strengths: SignalStrength[] = ['low', 'medium', 'high']
  const sources: TranscriptSource[] = ['rest', 'streaming']
  return (
    isStage(value.stage) &&
    typeof value.rule_id === 'string' &&
    typeof value.matched_text === 'string' &&
    typeof value.transcript_text === 'string' &&
    typeof value.reason === 'string' &&
    strengths.includes(value.signal_strength as SignalStrength) &&
    sources.includes(value.source as TranscriptSource) &&
    (value.segment_id === undefined || value.segment_id === null || typeof value.segment_id === 'string') &&
    (value.segment_index === undefined ||
      value.segment_index === null ||
      (Number.isInteger(value.segment_index) && (value.segment_index as number) >= 0)) &&
    (value.timestamp === undefined || isTimestamp(value.timestamp))
  )
}

function isDetectionResult(value: unknown): value is DetectionResult {
  if (!isRecord(value) || !Array.isArray(value.stage_assessments)) return false
  return (
    Number.isInteger(value.segments_analyzed) &&
    (value.segments_analyzed as number) >= 0 &&
    typeof value.disclaimer === 'string' &&
    value.stage_assessments.every(
      (assessment) =>
        isRecord(assessment) &&
        isStage(assessment.stage) &&
        Array.isArray(assessment.evidence) &&
        assessment.evidence.every(isDetectionEvidence),
    )
  )
}

function isWarningDecision(value: unknown): value is StreamWarningDecision {
  if (!isRecord(value) || !Array.isArray(value.distinct_stages)) return false
  return (
    (value.level === 'monitor' || value.level === 'advisory' || value.level === 'warning') &&
    typeof value.should_speak === 'boolean' &&
    isStringArray(value.reason_codes) &&
    isStringArray(value.matched_rule_ids) &&
    value.distinct_stages.every(isStage)
  )
}

export function parseSafetyWarning(value: unknown): StreamSafetyWarning | null {
  if (!isRecord(value)) return null
  if (
    value.type !== 'safety_warning' ||
    typeof value.warning_id !== 'string' ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(value.warning_id) ||
    value.level !== 'warning' ||
    !isStringArray(value.reason_codes) ||
    !isStringArray(value.matched_rule_ids) ||
    !Array.isArray(value.distinct_stages) ||
    !value.distinct_stages.every(isStage) ||
    value.audio_format !== 'wav' ||
    !Number.isInteger(value.audio_bytes) ||
    (value.audio_bytes as number) < 44 ||
    (value.audio_bytes as number) > MAX_WARNING_AUDIO_BYTES ||
    !isFiniteNumber(value.audio_duration_seconds) ||
    value.audio_duration_seconds <= 0 ||
    value.audio_duration_seconds > 120 ||
    typeof value.message !== 'string'
  ) {
    return null
  }

  return {
    warning_id: value.warning_id,
    level: 'warning',
    reason_codes: value.reason_codes,
    matched_rule_ids: value.matched_rule_ids,
    distinct_stages: value.distinct_stages,
    audio_format: 'wav',
    audio_bytes: value.audio_bytes as number,
    audio_duration_seconds: value.audio_duration_seconds,
    message: value.message,
  }
}

export function isWarningPlaybackClientStatus(
  value: unknown,
): value is WarningPlaybackClientStatus {
  return typeof value === 'string' && PLAYBACK_STATUSES.includes(value as WarningPlaybackClientStatus)
}

export function parseStreamServerMessage(value: unknown): StreamServerMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null

  switch (value.type) {
    case 'ready':
      if (
        typeof value.message !== 'string' ||
        typeof value.language !== 'string' ||
        typeof value.model !== 'string' ||
        !isFiniteNumber(value.sample_rate) ||
        !isFiniteNumber(value.channels) ||
        typeof value.encoding !== 'string' ||
        !isFiniteNumber(value.frame_bytes) ||
        typeof value.warning_consent_enabled !== 'boolean' ||
        value.warning_consent_scope !== 'session'
      ) return null
      return {
        type: 'ready',
        message: value.message,
        language: value.language,
        model: value.model,
        sample_rate: value.sample_rate,
        channels: value.channels,
        encoding: value.encoding,
        frame_bytes: value.frame_bytes,
        warning_consent_enabled: value.warning_consent_enabled,
        warning_consent_scope: 'session',
      }

    case 'connected':
      if (!isFiniteNumber(value.sample_rate) || !isFiniteNumber(value.chunk_size)) return null
      return { type: 'connected', sample_rate: value.sample_rate, chunk_size: value.chunk_size }

    case 'processing':
      if (!isTimestamp(value.timestamp)) return null
      return { type: 'processing', timestamp: value.timestamp }

    case 'transcript': {
      if (
        typeof value.text !== 'string' ||
        !(typeof value.segment_id === 'string' || value.segment_id === null) ||
        !(Number.isInteger(value.segment_index) || value.segment_index === null) ||
        !(isFiniteNumber(value.audio_duration_ms) || value.audio_duration_ms === null) ||
        !(isFiniteNumber(value.latency) || value.latency === null) ||
        !isTimestamp(value.timestamp) ||
        !(typeof value.detected_language_code === 'string' || value.detected_language_code === null) ||
        (value.detection !== undefined && !isDetectionResult(value.detection)) ||
        (value.conversation_detection !== undefined && !isDetectionResult(value.conversation_detection)) ||
        (value.warning_decision !== undefined && !isWarningDecision(value.warning_decision))
      ) return null

      return {
        type: 'transcript',
        text: value.text,
        segment_id: value.segment_id,
        segment_index: value.segment_index as number | null,
        audio_duration_ms: value.audio_duration_ms,
        latency: value.latency,
        timestamp: value.timestamp,
        detected_language_code: value.detected_language_code,
        ...(value.detection ? { detection: value.detection } : {}),
        ...(value.conversation_detection ? { conversation_detection: value.conversation_detection } : {}),
        ...(value.warning_decision ? { warning_decision: value.warning_decision } : {}),
      }
    }

    case 'error':
    case 'warning_synthesis_error':
    case 'warning_playback_status_error':
      return typeof value.message === 'string' ? { type: value.type, message: value.message } : null

    case 'stopped':
      return typeof value.transcript_received_after_stop_command === 'boolean'
        ? { type: 'stopped', transcript_received_after_stop_command: value.transcript_received_after_stop_command }
        : null

    case 'provider_event':
      return typeof value.event === 'string' ? { type: 'provider_event', event: value.event } : null

    case 'warning_consent_updated':
      return typeof value.enabled === 'boolean' && value.scope === 'session' && typeof value.message === 'string'
        ? { type: 'warning_consent_updated', enabled: value.enabled, scope: 'session', message: value.message }
        : null

    case 'warning_consent_error':
      return typeof value.enabled === 'boolean' && value.scope === 'session' && typeof value.message === 'string'
        ? { type: 'warning_consent_error', enabled: value.enabled, scope: 'session', message: value.message }
        : null

    case 'safety_warning': {
      const warning = parseSafetyWarning(value)
      return warning ? { type: 'safety_warning', ...warning } : null
    }

    case 'warning_playback_status_updated':
      return typeof value.warning_id === 'string' &&
        isWarningPlaybackClientStatus(value.status) &&
        typeof value.message === 'string'
        ? {
            type: 'warning_playback_status_updated',
            warning_id: value.warning_id,
            status: value.status,
            message: value.message,
          }
        : null

    default:
      return null
  }
}

export function validateWarningWav(
  audio: ArrayBuffer,
  warning: StreamSafetyWarning,
): string | null {
  if (audio.byteLength !== warning.audio_bytes) return 'Audio size does not match its warning metadata.'
  if (audio.byteLength < 44 || audio.byteLength > MAX_WARNING_AUDIO_BYTES) return 'Audio payload size is invalid.'

  const view = new DataView(audio)
  const readFourCc = (offset: number) =>
    String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))

  if (readFourCc(0) !== 'RIFF' || readFourCc(8) !== 'WAVE') return 'Audio is not a RIFF/WAVE file.'
  const riffEnd = view.getUint32(4, true) + 8
  if (riffEnd !== audio.byteLength) return 'WAV container length is inconsistent.'

  let offset = 12
  let formatValid = false
  let dataBytes = 0
  while (offset + 8 <= riffEnd) {
    const chunkName = readFourCc(offset)
    const chunkBytes = view.getUint32(offset + 4, true)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkBytes
    if (chunkEnd > riffEnd) return 'WAV chunk exceeds the audio payload.'

    if (chunkName === 'fmt ') {
      if (chunkBytes < 16) return 'WAV format chunk is incomplete.'
      formatValid =
        view.getUint16(chunkStart, true) === 1 &&
        view.getUint16(chunkStart + 2, true) === 1 &&
        view.getUint32(chunkStart + 4, true) === 16000 &&
        view.getUint32(chunkStart + 8, true) === 32000 &&
        view.getUint16(chunkStart + 12, true) === 2 &&
        view.getUint16(chunkStart + 14, true) === 16
    } else if (chunkName === 'data') {
      dataBytes = chunkBytes
    }

    offset = chunkEnd + (chunkBytes % 2)
  }

  if (!formatValid) return 'WAV must be mono, 16 kHz, 16-bit PCM.'
  if (dataBytes <= 0 || dataBytes % 2 !== 0) return 'WAV audio data is empty or malformed.'
  const duration = dataBytes / 32000
  if (Math.abs(duration - warning.audio_duration_seconds) > 0.02) {
    return 'WAV duration does not match its warning metadata.'
  }
  return null
}
