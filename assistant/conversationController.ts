import type {
  AssistantIntent,
  AssistantSuggestedAction,
  CompactC2Context,
  MissionDraft,
  MissionDraftPatch,
  OodStage,
} from './types'

export interface ConversationRoute {
  intent: AssistantIntent
  stage: OodStage
  usesModel: boolean
  mayMutateDraft: boolean
  directReply?: string
  ambiguousValue?: string
}

const ACKNOWLEDGEMENTS = /^(?:(?:uh+|um+|h+m+|ok(?:ay)?|sure|yes|yep|yeah|roger|copy|got it|fine|alright)[,\s]*)+[.!]*$/i
const RESERVED_MODEL_REPLIES = /^(?:operatorMessage|canonicalC2Context|currentDraft|draftPatch|reply|null|undefined)$/i

function cleanStandaloneValue(message: string): string | null {
  if (message.includes('?')) return null
  const value = message.trim().replace(/[.!]+$/, '')
  if (!/^[\p{L}][\p{L}\p{N} '\-]{1,48}$/u.test(value)) return null
  if (value.split(/\s+/).length > 4) return null
  if (/^(?:where|what|who|why|when|how|which|show|list|locate|find|are|is|do|does|can|could|would|should)\b/i.test(value)) return null
  return value
}

function availableAssetsReply(context: CompactC2Context, message: string): string {
  const unassigned = context.assets.filter((asset) => {
    const lifecycle = asset.lifecycle.toLowerCase()
    return (
      !asset.assignedMissionId &&
      !['offline', 'lost', 'retired', 'unavailable', 'maintenance'].includes(lifecycle)
    )
  })
  const observationRequested = /\b(?:area observation|observe|observation|recon|surveillance)\b/i.test(message)
  const available = observationRequested
    ? unassigned.filter((asset) => /\b(?:scout|recon|surveillance|mapping|eo|camera|imagery)\b/i.test(`${asset.platformType} ${asset.payloadStatus}`))
    : unassigned
  if (available.length === 0) {
    return `No aircraft currently report as an unassigned ${observationRequested ? 'observation candidate' : 'available asset'} in the canonical C2 snapshot. This is a snapshot result, not an airworthiness or command-authority determination.`
  }
  const rows = available.slice(0, 8).map((asset) => {
    const confidence = asset.positioningConfidence <= 1
      ? asset.positioningConfidence * 100
      : asset.positioningConfidence
    return `• ${asset.displayName} (${asset.assetId}) — ${Math.round(asset.batteryPercent)}% battery, ${asset.linkState} link, ${Math.round(confidence)}% positioning confidence`
  })
  const remainder = available.length > rows.length ? `\n• ${available.length - rows.length} more available asset(s)` : ''
  const qualifier = observationRequested ? 'unassigned observation candidate' : 'unassigned aircraft'
  return `${available.length} ${qualifier}${available.length === 1 ? '' : 's'} ${available.length === 1 ? 'reports' : 'report'} in the canonical C2 snapshot:\n\n${rows.join('\n')}${remainder}\n\nThis is a platform/payload-state screen, not final mission eligibility or command authority.`
}

function statusReply(context: CompactC2Context): string {
  const reporting = context.assets.length
  const assigned = context.assets.filter((asset) => asset.assignedMissionId).length
  return `Canonical C2 status: mission ${context.mission.state}; C2 link ${context.mission.c2Link}; GNSS ${context.mission.gnss}. ${reporting} assets are reporting, ${assigned} are assigned, and ${context.tracks.length} fused tracks are present. Snapshot retrieved ${context.retrievedAt}.`
}

function inboundThreatsReply(context: CompactC2Context): string {
  const inbound = context.tracks
    .filter((track) => Number.isFinite(track.etaToProtectedAssetSeconds) && track.etaToProtectedAssetSeconds >= 0)
    .sort((left, right) => left.etaToProtectedAssetSeconds - right.etaToProtectedAssetSeconds)
  if (inbound.length === 0) {
    return 'No canonical tracks currently report an ETA to the protected asset. Sentinel does not infer enemy identity from missing track data.'
  }
  const rows = inbound.slice(0, 8).map((track) => {
    const confidence = track.fusionConfidence <= 1 ? track.fusionConfidence * 100 : track.fusionConfidence
    return `• ${track.trackId} — Class ${track.threatClass}, ETA ${Math.round(track.etaToProtectedAssetSeconds)}s, ${Math.round(track.speed)} m/s, ${Math.round(confidence)}% fusion confidence, ${track.contributingSensors.length} contributing sensor${track.contributingSensors.length === 1 ? '' : 's'}${track.alert ? ', alert active' : ''}`
  })
  const remainder = inbound.length > rows.length ? `\n• ${inbound.length - rows.length} more inbound track(s)` : ''
  return `${inbound.length} canonical threat track${inbound.length === 1 ? '' : 's'} report an ETA to the protected asset:\n\n${rows.join('\n')}${remainder}\n\n“Threat” reflects the canonical C2 classification. It is not authoritative enemy identification or engagement authorization. Per-track observation age is not yet available.`
}

function threatLocationsReply(context: CompactC2Context): string {
  const tracks = [...context.tracks].sort((left, right) => {
    if (left.alert !== right.alert) return left.alert ? -1 : 1
    return left.etaToProtectedAssetSeconds - right.etaToProtectedAssetSeconds
  })
  if (tracks.length === 0) {
    return 'No threat tracks are present in the current canonical C2 snapshot. Sentinel does not infer enemy identity or location when no canonical track is available.'
  }
  const rows = tracks.slice(0, 8).map((track) => {
    const confidence = track.fusionConfidence <= 1 ? track.fusionConfidence * 100 : track.fusionConfidence
    return `- ${track.trackId} - Class ${track.threatClass}, ${track.position.lat.toFixed(5)}, ${track.position.lng.toFixed(5)}, altitude ${Math.round(track.altitude)} m, ${Math.round(confidence)}% fusion confidence, ETA ${Math.round(track.etaToProtectedAssetSeconds)}s${track.alert ? ', alert active' : ''}`
  })
  const remainder = tracks.length > rows.length ? `\n- ${tracks.length - rows.length} more threat track(s)` : ''
  return `${tracks.length} canonical threat track${tracks.length === 1 ? '' : 's'} in the current C2 snapshot:\n\n${rows.join('\n')}${remainder}\n\n"Threat" is the canonical C2 classification, not authoritative enemy identification or engagement authorization. Snapshot retrieved ${context.retrievedAt}; per-track observation age is not yet available.`
}

function boundaryReply(context: CompactC2Context): string {
  return `Sentinel AI is a local decision-support layer, not a vehicle-control fallback. It reads the canonical C2 snapshot after the edge gateway, but cannot access Gazebo, raw devices or command an asset. Current reported conditions are C2 link ${context.mission.c2Link} and GNSS ${context.mission.gnss}.`
}

export function routeConversation(input: {
  message: string
  context: CompactC2Context
  draft: MissionDraft | null
}): ConversationRoute {
  const message = input.message.trim()
  const normalized = message.toLowerCase()

  if (ACKNOWLEDGEMENTS.test(message)) {
    return {
      intent: 'ACKNOWLEDGEMENT',
      stage: input.draft?.status === 'READY_FOR_VALIDATION' ? 'DECIDE' : 'ORIENT',
      usesModel: false,
      mayMutateDraft: false,
      directReply: input.draft?.status === 'READY_FOR_VALIDATION'
        ? 'No mission details changed. The draft is ready for review or deterministic validation.'
        : 'No changes made. Choose a suggested next step or provide a specific mission detail.',
    }
  }

  if (/\b(fallback|gazebo|raw (?:sensor|device)|command authority|what can you do|your boundaries|can you (?:control|command|task))\b/i.test(message)) {
    return {
      intent: 'EXPLAIN_BOUNDARY',
      stage: 'ORIENT',
      usesModel: false,
      mayMutateDraft: false,
      directReply: boundaryReply(input.context),
    }
  }

  if (
    /\b(?:which|what|show|list|are there|how many)\b.*\b(?:available|unassigned|ready)\b.*\b(?:aircraft|drone|uav|asset)s?\b/i.test(message) ||
    /\b(?:aircraft|drone|uav|asset)s?\b.*\b(?:available|unassigned|ready)\b/i.test(message)
  ) {
    return {
      intent: 'OBSERVE_AVAILABLE_ASSETS',
      stage: 'OBSERVE',
      usesModel: false,
      mayMutateDraft: false,
      directReply: availableAssetsReply(input.context, message),
    }
  }

  if (
    /\bwhere\b.*\b(?:enemy|enemies|hostile|hostiles|threat|threats|contact|contacts)\b/i.test(message) ||
    /\b(?:show|list|locate|find)\b.*\b(?:enemy|enemies|hostile|hostiles|threat|threats|contact|contacts)\b.*\b(?:position|positions|location|locations|tracks?)\b/i.test(message) ||
    /\b(?:enemy|enemies|hostile|hostiles|threat|threats|contact|contacts)\b.*\b(?:position|positions|location|locations)\b/i.test(message)
  ) {
    return {
      intent: 'OBSERVE_THREAT_LOCATIONS',
      stage: 'OBSERVE',
      usesModel: false,
      mayMutateDraft: false,
      directReply: threatLocationsReply(input.context),
    }
  }

  if (
    /\b(?:enemy|enemies|hostile|hostiles|threat|threats|contact|contacts)\b.*\b(?:inbound|incoming|approaching|closing|coming)\b/i.test(message) ||
    /\b(?:inbound|incoming|approaching|closing)\b.*\b(?:enemy|enemies|hostile|hostiles|threat|threats|contact|contacts)\b/i.test(message) ||
    /\bwhat(?:'s| is| are)?\s+(?:coming|inbound).*\b(?:at us|toward|towards|protected asset)\b/i.test(message) ||
    /\banything\s+(?:inbound|incoming|approaching|coming at us)\b/i.test(message)
  ) {
    return {
      intent: 'OBSERVE_INBOUND_THREATS',
      stage: 'OBSERVE',
      usesModel: false,
      mayMutateDraft: false,
      directReply: inboundThreatsReply(input.context),
    }
  }

  if (/\b(?:what changed|what has changed|recent changes?|since (?:the )?last)\b/i.test(message)) {
    return {
      intent: 'OBSERVE_CHANGES',
      stage: 'OBSERVE',
      usesModel: false,
      mayMutateDraft: false,
      directReply: `Sentinel currently exposes the latest canonical snapshot, not a bounded change history, so I cannot reliably state what changed. Current status: mission ${input.context.mission.state}, C2 link ${input.context.mission.c2Link}, GNSS ${input.context.mission.gnss}, and ${input.context.assets.length} reporting assets.`,
    }
  }

  if (/\b(?:c2|gnss|link|system|mission|asset) status\b|\bwhat(?:'s| is) happening\b/i.test(message)) {
    return {
      intent: 'OBSERVE_STATUS',
      stage: 'OBSERVE',
      usesModel: false,
      mayMutateDraft: false,
      directReply: statusReply(input.context),
    }
  }

  const standalone = cleanStandaloneValue(message)
  if (standalone && !/\b(?:search|observe|monitor|patrol|relay|escort|resupply|deliver|evacuate|draft|mission)\b/i.test(normalized)) {
    return {
      intent: 'AMBIGUOUS_VALUE',
      stage: 'ORIENT',
      usesModel: false,
      mayMutateDraft: false,
      ambiguousValue: standalone,
      directReply: `Should I use “${standalone}” as the mission area? I have not changed the draft.`,
    }
  }

  const drafting = /\b(?:search|observe|observation|monitor|patrol|relay|escort|resupply|deliver|evacuate|draft|mission|area|duration|priority|reserve|authority|approval|connected|degraded)\b/i.test(message)
  if (drafting) {
    return {
      intent: 'START_OR_UPDATE_DRAFT',
      stage: 'ORIENT',
      usesModel: true,
      mayMutateDraft: true,
    }
  }

  return {
    intent: 'UNKNOWN',
    stage: 'ORIENT',
    usesModel: true,
    mayMutateDraft: false,
  }
}

export function guardDraftPatch(message: string, patch: MissionDraftPatch): MissionDraftPatch {
  const allowed = new Set<keyof MissionDraftPatch>()
  if (/\b(?:search|observe|observation|monitor|patrol|relay|escort|resupply|deliver|evacuate)\b/i.test(message)) {
    allowed.add('taskType')
    allowed.add('objective')
  }
  if (/\b(?:objective|goal|purpose|mission is|need to|search|observe|monitor|patrol|relay|escort|resupply|deliver|evacuate)\b/i.test(message)) {
    allowed.add('objective')
  }
  if (/\b(?:area|near|around|within|at|over|use .{1,50} as (?:the )?(?:mission )?area)\b/i.test(message)) allowed.add('area')
  if (/\b(?:minute|minutes|hour|hours|duration)\b/i.test(message)) allowed.add('durationMinutes')
  if (/\b(?:deadline|until|by)\b/i.test(message)) allowed.add('deadline')
  if (/\b(?:start|begin|commence)\b/i.test(message)) {
    allowed.add('earliestStart')
    allowed.add('latestStart')
  }
  if (/\b(?:priority|urgent|urgency)\b/i.test(message)) allowed.add('priority')
  if (/\b(?:reserve|battery)\b/i.test(message)) allowed.add('minimumReservePercent')
  if (/\b(?:confidence|certainty)\b/i.test(message)) allowed.add('minimumConfidence')
  if (/\b(?:connected|required link|degraded|communications|comms)\b/i.test(message)) allowed.add('communicationsPolicy')
  if (/\b(?:authority|approval|approved|order|authorization)\b/i.test(message)) allowed.add('authorityReference')
  if (/\b(?:capability|eo\/ir|radar|relay|payload|strong link|positioning)\b/i.test(message)) allowed.add('requiredCapabilities')
  if (/\b(?:assume|assumption)\b/i.test(message)) allowed.add('assumptions')

  const guarded = Object.fromEntries(
    Object.entries(patch).filter(([key]) => allowed.has(key as keyof MissionDraftPatch)),
  ) as MissionDraftPatch
  if (guarded.area) {
    const area = { ...guarded.area }
    if (!/\b(?:radius|within|kilomet(?:er|re)s?|\d+(?:\.\d+)?\s*km|met(?:er|re)s?)\b/i.test(message)) {
      delete area.radiusM
    }
    if (!/\b(?:coordinate|coordinates|latitude|longitude|lat|lng)\b|[-+]?\d{1,3}\.\d+\s*[,/]\s*[-+]?\d{1,3}\.\d+/i.test(message)) {
      delete area.center
    }
    guarded.area = area
  }
  return guarded
}

export function safeModelReply(reply: string): string {
  const clean = reply.trim()
  if (!clean || RESERVED_MODEL_REPLIES.test(clean)) {
    return 'I could not turn that into a reliable answer. No mission details were changed. Please choose a suggested next step or rephrase the request.'
  }
  return clean
}

export function suggestedActions(input: {
  route: ConversationRoute
  draft: MissionDraft | null
}): AssistantSuggestedAction[] {
  const { route, draft } = input
  if (route.intent === 'OBSERVE_INBOUND_THREATS' || route.intent === 'OBSERVE_THREAT_LOCATIONS') {
    return [
      ...(draft ? [{
        id: 'return-to-draft',
        label: `Return to ${draft.taskType?.replaceAll('_', ' ') ?? 'mission'} draft`,
        kind: 'UI_ACTION' as const,
        action: 'OPEN_INSPECTOR' as const,
      }] : []),
      ...(route.intent === 'OBSERVE_THREAT_LOCATIONS'
        ? [{ id: 'refresh-threat-locations', label: 'Refresh threat locations', kind: 'MESSAGE' as const, message: 'Where are the threat tracks?' }]
        : [{ id: 'refresh-threats', label: 'Refresh inbound threats', kind: 'MESSAGE' as const, message: 'Show inbound threats.' }]),
      { id: 'threat-view-toggle', label: route.intent === 'OBSERVE_THREAT_LOCATIONS' ? 'Show inbound threats' : 'Show threat locations', kind: 'MESSAGE', message: route.intent === 'OBSERVE_THREAT_LOCATIONS' ? 'Show inbound threats.' : 'Where are the threat tracks?' },
      { id: 'c2-status', label: 'Show C2 status', kind: 'MESSAGE', message: 'Show current C2 status.' },
    ]
  }
  if (route.intent === 'AMBIGUOUS_VALUE' && route.ambiguousValue) {
    return [
      {
        id: 'confirm-area',
        label: `Use ${route.ambiguousValue} as area`,
        kind: 'MESSAGE',
        message: `Use ${route.ambiguousValue} as the mission area.`,
      },
      { id: 'available-assets', label: 'View available aircraft', kind: 'MESSAGE', message: 'Which aircraft are currently available?' },
    ]
  }
  if (draft?.status === 'READY_FOR_VALIDATION') {
    return [
      { id: 'review-draft', label: 'Review draft', kind: 'UI_ACTION', action: 'OPEN_INSPECTOR' },
      { id: 'validate-draft', label: 'Validate draft', kind: 'UI_ACTION', action: 'VALIDATE_DRAFT' },
      { id: 'change-details', label: 'Change mission details', kind: 'MESSAGE', message: 'I need to change the mission details.' },
    ]
  }
  if (draft) {
    const missing = draft.unresolvedFields[0]
    const missingCopy: Record<string, { label: string; message: string }> = {
      taskType: { label: 'Choose mission type', message: 'Help me choose the mission type.' },
      objective: { label: 'Set mission objective', message: 'Help me define the mission objective.' },
      area: { label: 'Set mission area', message: 'Help me set the mission area.' },
      durationMinutesOrDeadline: { label: 'Set duration or deadline', message: 'Help me set the mission duration or deadline.' },
      priority: { label: 'Set mission priority', message: 'Help me set the mission priority.' },
      communicationsPolicy: { label: 'Set communications requirement', message: 'Help me set the communications requirement.' },
      authorityReference: { label: 'Add authority reference', message: 'Help me add the operator authority reference.' },
    }
    const next = missing ? (missingCopy[missing] ?? { label: 'Resolve next detail', message: `Help me resolve the missing ${missing} detail.` }) : null
    return [
      ...(next ? [{ id: 'resolve-next', label: next.label, kind: 'MESSAGE' as const, message: next.message }] : []),
      { id: 'review-draft', label: 'Review draft', kind: 'UI_ACTION', action: 'OPEN_INSPECTOR' },
      { id: 'available-assets', label: 'View available aircraft', kind: 'MESSAGE', message: 'Which aircraft are currently available?' },
    ]
  }
  return [
    { id: 'available-assets', label: 'View available aircraft', kind: 'MESSAGE', message: 'Which aircraft are currently available?' },
    { id: 'draft-observation', label: 'Draft area observation', kind: 'MESSAGE', message: 'Help me draft an area observation mission.' },
    { id: 'explain-boundary', label: 'Explain AI boundaries', kind: 'MESSAGE', message: 'What can Sentinel AI do?' },
  ]
}
