import type { ModeId, WorkspaceView } from './store/uiSlice'

export interface ModeProfile {
  id: ModeId
  label: string
  shortLabel: string
  accent: string
  operatorGoal: string
  showRail: boolean
  showLeftPanel: boolean
  showRightPanel: boolean
  showTasking: boolean
  defaultWorkspace: WorkspaceView
}

export const MODE_PROFILES: ModeProfile[] = [
  {
    id: 'defense',
    label: 'Defense',
    shortLabel: 'DEFENSE',
    accent: '#FF2D55',
    operatorGoal: 'See threat, confirm plan, execute fast',
    showRail: false,
    showLeftPanel: true,
    showRightPanel: false,
    showTasking: true,
    defaultWorkspace: 'tracks',
  },
  {
    id: 'recon',
    label: 'Recon',
    shortLabel: 'RECON',
    accent: '#00D4AA',
    operatorGoal: 'Grow map coverage and classify POIs',
    showRail: false,
    showLeftPanel: false,
    showRightPanel: false,
    showTasking: true,
    defaultWorkspace: 'tracks',
  },
  {
    id: 'attack',
    label: 'Attack',
    shortLabel: 'ATTACK',
    accent: '#FFB800',
    operatorGoal: 'Review intel and authorize deliberate action',
    showRail: false,
    showLeftPanel: false,
    showRightPanel: true,
    showTasking: true,
    defaultWorkspace: 'policy',
  },
]

export function getModeProfile(id: ModeId): ModeProfile {
  return MODE_PROFILES.find((m) => m.id === id) ?? MODE_PROFILES[0]
}

export function describeModeSwitchImpact(
  from: ModeId,
  to: ModeId,
  pendingCount: number,
  engagedCount: number,
): { title: string; detail: string } {
  const target = getModeProfile(to)
  const fromProfile = getModeProfile(from)
  const hidesDecisionLane = fromProfile.showLeftPanel && !target.showLeftPanel
  const queueLabel =
    pendingCount > 0 && engagedCount > 0
      ? `${pendingCount} pending and ${engagedCount} active engagement${engagedCount === 1 ? '' : 's'}`
      : pendingCount > 0
        ? `${pendingCount} pending recommendation${pendingCount === 1 ? '' : 's'}`
        : `${engagedCount} active engagement${engagedCount === 1 ? '' : 's'}`

  return {
    title: `Switch to ${target.shortLabel}?`,
    detail: hidesDecisionLane
      ? `Switching to ${target.shortLabel} will hide the decision lane. ${queueLabel} remain. Continue?`
      : pendingCount + engagedCount > 0
        ? `${queueLabel} remain. Switching modes may change visible controls. Continue?`
        : `Switch mission context to ${target.shortLabel}.`,
  }
}

export function isDegraded(gnss: string, c2Link: string): boolean {
  return gnss === 'denied' || gnss === 'degraded' || c2Link === 'lost' || c2Link === 'weak'
}
