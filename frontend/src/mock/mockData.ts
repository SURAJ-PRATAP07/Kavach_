/*
 * Mock data for UI development.
 *
 * Everything here is hand-written sample data. Shapes follow
 * src/types/index.ts so the real backend can replace it without UI changes.
 * Rule IDs and reasons are copied from backend/app/detection/rules.py.
 */
import type {
  ConversationAnalysis,
  DetectionEvidence,
  DetectionResult,
  Incident,
  RiskAssessment,
  SafetyWarning,
  ScamStage,
  SignalStrength,
  SpeakerLabel,
  TranscriptLine,
  TrustedContact,
} from '../types'
import { SCAM_STAGES } from '../types'

export const DISCLAIMER =
  'Detected signals indicate potential risk. They do not independently confirm that a scam has occurred.'

const RULES: Record<string, { stage: ScamStage; reason: string; strength: SignalStrength }> = {
  IMPERSONATION_AUTHORITY_CLAIM: {
    stage: 'impersonation',
    reason: 'The speaker claims to represent a law-enforcement authority.',
    strength: 'medium',
  },
  THREAT_ARREST: {
    stage: 'threats',
    reason: 'The transcript contains a direct or explicitly reported threat of arrest.',
    strength: 'medium',
  },
  ISOLATION_SECRECY: {
    stage: 'isolation',
    reason: 'The speaker instructs the listener to keep the interaction secret.',
    strength: 'medium',
  },
  FINANCIAL_SAFE_ACCOUNT: {
    stage: 'financial_extraction',
    reason: 'The speaker directs the listener to move money into a purported safe account.',
    strength: 'high',
  },
}

export interface ScriptLine {
  speaker: SpeakerLabel
  text: string
  lang: string
  at: number // seconds from call start
  hit?: { rule: keyof typeof RULES; match: string }
}

const now = Date.now()
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString()

export function buildTranscript(script: ScriptLine[], startIso: string): TranscriptLine[] {
  const start = new Date(startIso).getTime()
  return script.map((l, i) => ({
    id: `seg_${i}`,
    text: l.text,
    source: 'streaming',
    segment_id: `seg-${i.toString().padStart(3, '0')}`,
    segment_index: i,
    timestamp: new Date(start + l.at * 1000).toISOString(),
    audio_duration_ms: 2800,
    language_code: l.lang,
    speaker: l.speaker,
    received_at: new Date(start + l.at * 1000).toISOString(),
    offset_ms: l.at * 1000,
  }))
}

export function evidenceFor(line: ScriptLine, index: number, startIso: string): DetectionEvidence | null {
  if (!line.hit) return null
  const rule = RULES[line.hit.rule]
  return {
    stage: rule.stage,
    rule_id: line.hit.rule,
    matched_text: line.hit.match,
    transcript_text: line.text,
    reason: rule.reason,
    signal_strength: rule.strength,
    source: 'streaming',
    segment_id: `seg-${index.toString().padStart(3, '0')}`,
    segment_index: index,
    timestamp: new Date(new Date(startIso).getTime() + line.at * 1000).toISOString(),
  }
}

export function buildDetection(script: ScriptLine[], startIso: string, upTo = script.length): DetectionResult {
  const evidence = script
    .slice(0, upTo)
    .map((l, i) => evidenceFor(l, i, startIso))
    .filter((e): e is DetectionEvidence => e !== null)
  return {
    segments_analyzed: upTo,
    stage_assessments: SCAM_STAGES.map((stage) => ({
      stage,
      evidence: evidence.filter((e) => e.stage === stage),
    })),
    disclaimer: DISCLAIMER,
  }
}

/* ------------------------------------------------------------------ */
/* Scripts                                                             */
/* ------------------------------------------------------------------ */

export const CBI_PARCEL_SCRIPT: ScriptLine[] = [
  { speaker: 'caller', lang: 'hi-IN', at: 2, text: 'Hello, kya main Ramesh Kumar ji se baat kar raha hoon?' },
  { speaker: 'user', lang: 'hi-IN', at: 6, text: 'Haan ji, boliye. Aap kaun?' },
  {
    speaker: 'caller', lang: 'hi-IN', at: 9,
    text: 'Main CBI se bol raha hoon. Aapke Aadhaar card se Mumbai se ek parcel book hua hai.',
    hit: { rule: 'IMPERSONATION_AUTHORITY_CLAIM', match: 'Main CBI se bol raha hoon' },
  },
  { speaker: 'user', lang: 'hi-IN', at: 16, text: 'Kaun sa parcel? Maine toh koi parcel nahi bheja.' },
  { speaker: 'caller', lang: 'hi-IN', at: 20, text: 'Us parcel mein drugs aur fake passport mile hain. Aapke naam pe FIR darj ho chuki hai.' },
  {
    speaker: 'caller', lang: 'hi-IN', at: 27,
    text: 'Agar aap cooperate nahi karenge toh aapko giraftar kar liya jayega.',
    hit: { rule: 'THREAT_ARREST', match: 'aapko giraftar kar liya jayega' },
  },
  { speaker: 'user', lang: 'hi-IN', at: 33, text: 'Sir please, main apne bete ko call karke poochta hoon.' },
  {
    speaker: 'caller', lang: 'hi-IN', at: 37,
    text: 'Nahi! Kisi ko mat batana. Yeh national security ka case hai, video call pe bane rahiye.',
    hit: { rule: 'ISOLATION_SECRECY', match: 'Kisi ko mat batana' },
  },
  { speaker: 'user', lang: 'hi-IN', at: 45, text: 'Theek hai sir, ab mujhe kya karna hoga?' },
  {
    speaker: 'caller', lang: 'hi-IN', at: 49,
    text: 'Verification ke liye apne paise safe account mein transfer karo. Jaanch ke baad RBI wapas kar dega.',
    hit: { rule: 'FINANCIAL_SAFE_ACCOUNT', match: 'paise safe account mein transfer karo' },
  },
]

const CYBER_CELL_HINDI_SCRIPT: ScriptLine[] = [
  {
    speaker: 'caller', lang: 'hi-IN', at: 3,
    text: 'मैं साइबर क्राइम विभाग से बोल रहा हूँ। आपके मोबाइल नंबर से गैरकानूनी विज्ञापन भेजे गए हैं।',
    hit: { rule: 'IMPERSONATION_AUTHORITY_CLAIM', match: 'मैं साइबर क्राइम विभाग से बोल रहा हूँ' },
  },
  { speaker: 'user', lang: 'hi-IN', at: 11, text: 'मुझे इसके बारे में कुछ नहीं पता।' },
  {
    speaker: 'caller', lang: 'hi-IN', at: 15,
    text: 'दो घंटे में आपका नंबर बंद होगा और आपको गिरफ्तार कर लिया जाएगा।',
    hit: { rule: 'THREAT_ARREST', match: 'आपको गिरफ्तार कर लिया जाएगा' },
  },
  {
    speaker: 'caller', lang: 'hi-IN', at: 24,
    text: 'किसी को मत बताना, वरना केस और बिगड़ जाएगा।',
    hit: { rule: 'ISOLATION_SECRECY', match: 'किसी को मत बताना' },
  },
  { speaker: 'user', lang: 'hi-IN', at: 30, text: 'मैं अभी फ़ोन काट रही हूँ, मुझे अपने पति से बात करनी है।' },
]

const CUSTOMS_SCRIPT: ScriptLine[] = [
  {
    speaker: 'caller', lang: 'en-IN', at: 2,
    text: 'Good afternoon. I am a police officer attached to the customs department at Delhi airport.',
    hit: { rule: 'IMPERSONATION_AUTHORITY_CLAIM', match: 'I am a police officer' },
  },
  { speaker: 'user', lang: 'en-IN', at: 9, text: 'Okay, what is this about?' },
  { speaker: 'caller', lang: 'en-IN', at: 12, text: 'A courier in your name has been held. Please share your full name and date of birth.' },
  { speaker: 'user', lang: 'en-IN', at: 19, text: 'I will visit the airport office myself. Please give me your badge number.' },
  { speaker: 'caller', lang: 'en-IN', at: 25, text: 'Call disconnected by caller.' },
]

const BANK_SCRIPT: ScriptLine[] = [
  { speaker: 'caller', lang: 'hi-IN', at: 2, text: 'Namaste, main aapke bank branch se bol rahi hoon, aapka cheque book tayyar hai.' },
  { speaker: 'user', lang: 'hi-IN', at: 8, text: 'Achha, main kal branch aakar le leta hoon.' },
  { speaker: 'caller', lang: 'hi-IN', at: 12, text: 'Ji bilkul, subah dus baje ke baad aa jaiye. Dhanyavaad.' },
]

const ENGLISH_SAFE_ACCOUNT_SCRIPT: ScriptLine[] = [
  {
    speaker: 'caller', lang: 'en-IN', at: 3,
    text: 'Madam, I am calling from cyber crime. Your bank account is linked to a money laundering case.',
    hit: { rule: 'IMPERSONATION_AUTHORITY_CLAIM', match: 'I am calling from cyber crime' },
  },
  {
    speaker: 'caller', lang: 'en-IN', at: 12,
    text: 'If you hang up, you will be arrested within the hour.',
    hit: { rule: 'THREAT_ARREST', match: 'you will be arrested' },
  },
  {
    speaker: 'caller', lang: 'en-IN', at: 20,
    text: 'Do not tell anyone about this call, not even your children.',
    hit: { rule: 'ISOLATION_SECRECY', match: 'Do not tell anyone about this call' },
  },
  {
    speaker: 'caller', lang: 'en-IN', at: 31,
    text: 'To prove your innocence, transfer your money to a safe account controlled by the RBI.',
    hit: { rule: 'FINANCIAL_SAFE_ACCOUNT', match: 'transfer your money to a safe account' },
  },
  { speaker: 'user', lang: 'en-IN', at: 40, text: 'I am calling 1930 to verify this first.' },
]

const UPLOAD_SCRIPT: ScriptLine[] = [
  {
    speaker: 'unknown', lang: 'hi-IN', at: 1,
    text: 'Main police se baat kar raha hoon, aapke naam pe arrest warrant nikla hai.',
    hit: { rule: 'IMPERSONATION_AUTHORITY_CLAIM', match: 'Main police se baat kar raha hoon' },
  },
  {
    speaker: 'unknown', lang: 'hi-IN', at: 8,
    text: 'Aap Skype pe aaiye, aur kisi ko iske baare mein mat batana.',
    hit: { rule: 'ISOLATION_SECRECY', match: 'kisi ko iske baare mein mat batana' },
  },
  { speaker: 'unknown', lang: 'hi-IN', at: 15, text: 'Settlement ke liye aaj hi paisa bhejna hoga.' },
]

/* ------------------------------------------------------------------ */
/* Incidents                                                           */
/* ------------------------------------------------------------------ */

interface IncidentSeed {
  id: string
  minutesAgo: number
  caller: string
  channel: Incident['channel']
  language: string
  summary: string
  status: Incident['status']
  risk: RiskAssessment
  script: ScriptLine[]
}

const SEEDS: IncidentSeed[] = [
  {
    id: 'INC-1042', minutesAgo: 95, caller: '+91 98XXX X4521', channel: 'video', language: 'hi-IN',
    summary: 'Caller posing as a CBI officer alleged a drug parcel, threatened arrest, told the user not to inform family and asked for a "safe account" transfer.',
    status: 'open',
    risk: { score: 92, category: 'critical', summary: 'All four digital-arrest stages observed.', assessed_at: ago(94) },
    script: CBI_PARCEL_SCRIPT,
  },
  {
    id: 'INC-1041', minutesAgo: 60 * 26, caller: '+91 70XXX X1180', channel: 'phone', language: 'hi-IN',
    summary: 'Hindi call claiming to be from the cyber crime department, with an arrest threat and a secrecy instruction. User ended the call to consult family.',
    status: 'reviewed',
    risk: { score: 74, category: 'high', summary: 'Impersonation, threats and isolation observed.', assessed_at: ago(60 * 26) },
    script: CYBER_CELL_HINDI_SCRIPT,
  },
  {
    id: 'INC-1039', minutesAgo: 60 * 72, caller: '+91 88XXX X9032', channel: 'phone', language: 'en-IN',
    summary: 'Caller claimed to be a police officer with customs and asked for personal details. No threats or payment request before the call ended.',
    status: 'reviewed',
    risk: { score: 38, category: 'moderate', summary: 'Authority claim only.', assessed_at: ago(60 * 72) },
    script: CUSTOMS_SCRIPT,
  },
  {
    id: 'INC-1036', minutesAgo: 60 * 120, caller: 'Bank branch (saved)', channel: 'phone', language: 'hi-IN',
    summary: 'Routine call about a cheque book. No scam signals detected.',
    status: 'reviewed',
    risk: { score: 6, category: 'low', summary: 'No stage signals.', assessed_at: ago(60 * 120) },
    script: BANK_SCRIPT,
  },
  {
    id: 'INC-1033', minutesAgo: 60 * 200, caller: '+91 63XXX X7745', channel: 'video', language: 'en-IN',
    summary: 'English-language digital arrest attempt with a money-laundering pretext and a safe-account transfer demand. User called 1930.',
    status: 'reported',
    risk: { score: 88, category: 'critical', summary: 'All four stages observed.', assessed_at: ago(60 * 200) },
    script: ENGLISH_SAFE_ACCOUNT_SCRIPT,
  },
  {
    id: 'INC-1030', minutesAgo: 60 * 290, caller: 'Uploaded recording', channel: 'upload', language: 'hi-IN',
    summary: 'Recording uploaded for review. Police impersonation and secrecy instruction found; the payment request did not match a known pattern.',
    status: 'reviewed',
    risk: { score: 61, category: 'high', summary: 'Impersonation and isolation observed.', assessed_at: ago(60 * 290) },
    script: UPLOAD_SCRIPT,
  },
]

export const MOCK_INCIDENTS: Incident[] = SEEDS.map((s) => {
  const started = ago(s.minutesAgo)
  const last = s.script[s.script.length - 1]
  const duration = last.at + 6
  return {
    id: s.id,
    started_at: started,
    ended_at: new Date(new Date(started).getTime() + duration * 1000).toISOString(),
    duration_seconds: duration,
    caller_label: s.caller,
    channel: s.channel,
    language: s.language,
    summary: s.summary,
    status: s.status,
    risk: s.risk,
    transcript: buildTranscript(s.script, started).map((t) =>
      s.channel === 'upload' ? { ...t, source: 'rest' as const } : t,
    ),
    detection: buildDetection(s.script, started),
  }
})

/* ------------------------------------------------------------------ */
/* Warnings                                                            */
/* ------------------------------------------------------------------ */

export const STANDARD_ACTIONS = [
  'Hang up. Real police or CBI never arrest anyone over a phone or video call.',
  'Do not share OTP, PIN or bank details, and do not transfer money.',
  'Talk to a family member or someone you trust right now.',
  'Report it on 1930 or at cybercrime.gov.in.',
]

export const MOCK_WARNINGS: SafetyWarning[] = [
  {
    id: 'WRN-311', created_at: ago(94), severity: 'danger',
    title: 'Possible digital-arrest scam',
    message: 'This call shows the pattern of a digital-arrest scam. Do not transfer any money.',
    message_hi: 'Apna one-time password kisi ke saath share na karein.',
    reason: 'Authority claim, arrest threat, secrecy instruction and a safe-account transfer request were all detected.',
    recommended_actions: STANDARD_ACTIONS,
    stages: ['impersonation', 'threats', 'isolation', 'financial_extraction'],
    incident_id: 'INC-1042', acknowledged: false,
  },
  {
    id: 'WRN-308', created_at: ago(60 * 26), severity: 'caution',
    title: 'Caller is pressuring you to stay silent',
    message: 'The caller claimed authority, threatened arrest and asked you to keep the call secret.',
    message_hi: 'Kisi ke saath share na karein.',
    reason: 'Impersonation, threats and isolation signals detected.',
    recommended_actions: STANDARD_ACTIONS.slice(0, 3),
    stages: ['impersonation', 'threats', 'isolation'],
    incident_id: 'INC-1041', acknowledged: true,
  },
  {
    id: 'WRN-305', created_at: ago(60 * 72), severity: 'info',
    title: 'Caller claims to be an official',
    message: 'Verify the caller independently before sharing any personal details.',
    reason: 'Authority claim detected without other scam stages.',
    recommended_actions: ['Ask for name and badge number, then call the official number yourself.', STANDARD_ACTIONS[1]],
    stages: ['impersonation'],
    incident_id: 'INC-1039', acknowledged: true,
  },
  {
    id: 'WRN-301', created_at: ago(60 * 200), severity: 'danger',
    title: 'Safe-account transfer requested',
    message: 'No government agency asks you to move money to a "safe account".',
    message_hi: 'Apna one-time password. Kisi ke saath share na karein.',
    reason: 'High-strength financial extraction signal with prior threats.',
    recommended_actions: STANDARD_ACTIONS,
    stages: ['impersonation', 'threats', 'isolation', 'financial_extraction'],
    incident_id: 'INC-1033', acknowledged: true,
  },
]

/* ------------------------------------------------------------------ */
/* Contacts and dashboard stats                                        */
/* ------------------------------------------------------------------ */

export const MOCK_CONTACTS: TrustedContact[] = [
  {
    id: 'CT-1', name: 'Rohit Kumar', relation: 'family', phone: '+91 98765 43210', email: 'rohit@example.com',
    consent_given: true, consent_at: ago(60 * 24 * 12), notify_on: ['danger'],
  },
  {
    id: 'CT-2', name: 'Dr. Meena Sharma', relation: 'neighbour', phone: '+91 91234 56780',
    consent_given: false, consent_at: null, notify_on: ['danger', 'caution'],
  },
]

export interface DailyStat {
  date: string
  monitored: number
  flagged: number
}

export const MOCK_DAILY_STATS: DailyStat[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(now - (13 - i) * 86_400_000)
  const monitored = [3, 4, 2, 5, 3, 6, 4, 3, 5, 2, 4, 6, 5, 3][i]
  const flagged = [0, 1, 0, 1, 0, 2, 0, 0, 1, 0, 1, 1, 0, 1][i]
  return { date: d.toISOString(), monitored, flagged }
})

export const MOCK_SUMMARY = {
  protectedSince: ago(60 * 24 * 41),
  callsMonitored: MOCK_DAILY_STATS.reduce((n, d) => n + d.monitored, 0),
  scamsFlagged: MOCK_INCIDENTS.filter((i) => (i.risk?.category ?? 'low') !== 'low').length,
  warningsPlayed: 9,
  moneySavedNote: 'No transfers made after a warning',
}

/** Live demo analysis after `n` script lines (pre-scripted, not computed). */
export function mockLiveAnalysis(n: number, startIso: string): ConversationAnalysis {
  const detection = buildDetection(CBI_PARCEL_SCRIPT, startIso, n)
  const stages = detection.stage_assessments.filter((s) => s.evidence.length).length
  const risk: RiskAssessment | null =
    stages === 0
      ? { score: 4, category: 'low', summary: 'No signals yet.' }
      : [
          { score: 34, category: 'moderate' as const, summary: 'Authority claim detected.' },
          { score: 61, category: 'high' as const, summary: 'Authority claim with arrest threat.' },
          { score: 79, category: 'high' as const, summary: 'Threats combined with isolation.' },
          { score: 94, category: 'critical' as const, summary: 'All four stages present.' },
        ][stages - 1]
  const warning: SafetyWarning | null =
    stages >= 3
      ? {
          ...MOCK_WARNINGS[0],
          id: 'WRN-LIVE',
          created_at: new Date().toISOString(),
          severity: stages === 4 ? 'danger' : 'caution',
          title: stages === 4 ? 'Stop. This looks like a digital-arrest scam' : 'Caller is isolating you',
          stages: detection.stage_assessments.filter((s) => s.evidence.length).map((s) => s.stage),
          incident_id: null,
          acknowledged: false,
        }
      : null
  return { detection, risk: risk ? { ...risk, assessed_at: new Date().toISOString() } : null, warning }
}
