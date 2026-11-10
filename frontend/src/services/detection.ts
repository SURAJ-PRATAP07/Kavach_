import type { ConversationAnalysis, TranscriptSegment } from '../types'
import { http, mockDelay } from './api'
import { ENDPOINTS, getUseMock } from './config'
import { DISCLAIMER, MOCK_INCIDENTS } from '../mock/mockData'
import { SCAM_STAGES } from '../types'

/*
 * The frontend never detects scams or calculates risk itself.
 * It sends transcript segments to the backend and displays the answer.
 *
 * Backend today: detect_segments() exists in Python but has no HTTP route.
 * When the team adds one, set ENDPOINTS.analyze and make sure it returns
 * ConversationAnalysis (or adapt the mapping below).
 */
export async function analyzeSegments(segments: TranscriptSegment[]): Promise<ConversationAnalysis> {
  if (getUseMock()) {
    // Mock mode: return the pre-written analysis of the sample upload.
    const sample = MOCK_INCIDENTS.find((i) => i.channel === 'upload')
    if (!sample) return mockDelay(emptyAnalysis(segments.length), 500)
    return mockDelay({ detection: sample.detection, risk: sample.risk, warning: null }, 700)
  }
  const { data } = await http.post<ConversationAnalysis>(ENDPOINTS.analyze, { segments })
  return {
    detection: data.detection,
    risk: data.risk ?? null,
    warning: data.warning ?? null,
  }
}

export function emptyAnalysis(segments = 0): ConversationAnalysis {
  return {
    detection: {
      segments_analyzed: segments,
      stage_assessments: SCAM_STAGES.map((stage) => ({ stage, evidence: [] })),
      disclaimer: DISCLAIMER,
    },
    risk: null,
    warning: null,
  }
}
