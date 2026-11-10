import { BadgeAlert, Gavel, HandCoins, UserX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ScamStage } from '../types'

export const STAGE_ICON: Record<ScamStage, LucideIcon> = {
  impersonation: BadgeAlert,
  threats: Gavel,
  isolation: UserX,
  financial_extraction: HandCoins,
}
