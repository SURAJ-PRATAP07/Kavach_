import type {
  RiskCategory,
  ScamStage,
  SignalStrength,
  WarningSeverity,
} from '../types'

export const STAGE_META: Record<
  ScamStage,
  { label: string; labelHi: string; short: string; description: string; color: string; examples: string[] }
> = {
  impersonation: {
    label: 'Impersonation',
    labelHi: 'नकली अधिकारी',
    short: 'IMP',
    description: 'Caller claims to be police, CBI, customs, cyber cell or another authority.',
    color: '#a78bfa',
    examples: ['"Main CBI se bol raha hoon"', '"I am calling from cyber crime"'],
  },
  threats: {
    label: 'Threats',
    labelHi: 'धमकी',
    short: 'THR',
    description: 'Arrest threats, fake FIRs, legal intimidation and pressure.',
    color: '#fb923c',
    examples: ['"Aapko giraftar kar liya jayega"', '"You will be arrested"'],
  },
  isolation: {
    label: 'Isolation',
    labelHi: 'अकेला करना',
    short: 'ISO',
    description: 'Instructions to keep the call secret or not contact family.',
    color: '#38bdf8',
    examples: ['"Kisi ko mat batana"', '"Do not tell anyone about this call"'],
  },
  financial_extraction: {
    label: 'Financial extraction',
    labelHi: 'पैसे की मांग',
    short: 'FIN',
    description: 'Requests to transfer money, share OTP or move funds to a "safe account".',
    color: '#f43f5e',
    examples: ['"Paise safe account mein transfer karo"', '"Share the OTP"'],
  },
}

export const STRENGTH_META: Record<SignalStrength, { label: string; cls: string }> = {
  low: { label: 'Low', cls: 'bg-slate-500/15 text-slate-300 ring-slate-400/30' },
  medium: { label: 'Medium', cls: 'bg-amber-500/15 text-amber-300 ring-amber-400/30' },
  high: { label: 'High', cls: 'bg-rose-500/15 text-rose-300 ring-rose-400/30' },
}

export const RISK_META: Record<RiskCategory, { label: string; cls: string; color: string }> = {
  low: { label: 'Low', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30', color: '#34d399' },
  moderate: { label: 'Moderate', cls: 'bg-amber-500/15 text-amber-300 ring-amber-400/30', color: '#fbbf24' },
  high: { label: 'High', cls: 'bg-orange-500/15 text-orange-300 ring-orange-400/30', color: '#fb923c' },
  critical: { label: 'Critical', cls: 'bg-rose-500/15 text-rose-300 ring-rose-400/30', color: '#f43f5e' },
}

export const SEVERITY_META: Record<WarningSeverity, { label: string; cls: string; color: string }> = {
  info: { label: 'Info', cls: 'bg-sky-500/15 text-sky-300 ring-sky-400/30', color: '#38bdf8' },
  caution: { label: 'Caution', cls: 'bg-amber-500/15 text-amber-300 ring-amber-400/30', color: '#fbbf24' },
  danger: { label: 'Danger', cls: 'bg-rose-500/15 text-rose-300 ring-rose-400/30', color: '#f43f5e' },
}

export const LANGUAGE_LABELS: Record<string, string> = {
  'hi-IN': 'Hindi',
  'en-IN': 'English (IN)',
  'hi-en': 'Hinglish',
}

export function languageLabel(code?: string | null): string {
  if (!code) return 'Unknown'
  return LANGUAGE_LABELS[code] ?? code
}
