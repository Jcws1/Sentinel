export type RoeTaskType = 'observe' | 'track' | 'escort' | 'relay' | 'intercept'
export type RoeAreaType = 'controlled' | 'dense-urban' | 'protected-buffer' | 'no-go'
export type RoeControlMode = 'supervised' | 'manual' | 'autonomous'
export type RoeCivilianContext = 'clear' | 'unclear' | 'present'
export type RoeAuthority = 'operator' | 'mission-commander' | 'designated-reviewer'
export type RoeCommsState = 'strong' | 'weak' | 'lost'

export interface RoeEvaluationInput {
  taskType: RoeTaskType
  purpose: string
  areaType: RoeAreaType
  durationMinutes: number
  assetClass: string
  controlMode: RoeControlMode
  civilianContext: RoeCivilianContext
  protectedLocation: boolean
  requesterAuthority: RoeAuthority
  comms: RoeCommsState
  dataAgeSeconds: number
}

export type RoeOutcome =
  | 'eligible'
  | 'restricted'
  | 'approval'
  | 'indeterminate'
  | 'ineligible'

export interface RoeRuleMatch {
  id: string
  name: string
  source: string
  effect: RoeOutcome
  reason: string
}

export interface RoeEvaluation {
  outcome: RoeOutcome
  label: string
  summary: string
  matchedRules: RoeRuleMatch[]
  constraints: string[]
  missingInputs: string[]
  revalidateOn: string[]
}

const severity: Record<RoeOutcome, number> = {
  eligible: 0,
  restricted: 1,
  approval: 2,
  indeterminate: 3,
  ineligible: 4,
}

const labels: Record<RoeOutcome, string> = {
  eligible: 'Eligible',
  restricted: 'Eligible with constraints',
  approval: 'Additional approval required',
  indeterminate: 'Indeterminate',
  ineligible: 'Ineligible',
}

export function evaluateRoe(input: RoeEvaluationInput): RoeEvaluation {
  const matchedRules: RoeRuleMatch[] = []
  const constraints = new Set<string>()
  const revalidateOn = new Set<string>(['Area or task scope changes'])
  const missingInputs: string[] = []

  if (!input.purpose.trim()) missingInputs.push('Task purpose')
  if (input.durationMinutes <= 0) missingInputs.push('Valid task duration')

  if (input.areaType === 'no-go') {
    matchedRules.push({
      id: 'ZONE-001',
      name: 'No-go area exclusion',
      source: 'Operation policy / geographic controls',
      effect: 'ineligible',
      reason: 'The proposed task intersects an area classified as no-go.',
    })
  }

  if (input.areaType === 'dense-urban') {
    matchedRules.push({
      id: 'URBAN-006',
      name: 'Dense urban task controls',
      source: 'Urban operations policy §6',
      effect: 'restricted',
      reason: 'Dense urban terrain requires bounded scope and continuous context review.',
    })
    constraints.add('Remain within the declared task area')
    constraints.add('Time-limited authority')
    revalidateOn.add('Civilian context changes')
  }

  if (input.areaType === 'protected-buffer' || input.protectedLocation) {
    matchedRules.push({
      id: 'URBAN-014',
      name: 'Protected-location review',
      source: 'ROE §4.2 / protected objects',
      effect: 'approval',
      reason: 'A protected location is within the task context and requires designated review.',
    })
    constraints.add('Protected-location exclusion remains active')
    revalidateOn.add('Protected-location indicator changes')
  }

  if (input.civilianContext === 'unclear') {
    matchedRules.push({
      id: 'CIV-002',
      name: 'Unresolved civilian context',
      source: 'Civilian-harm mitigation policy §2',
      effect: input.taskType === 'intercept' ? 'indeterminate' : 'restricted',
      reason: 'Civilian context is unresolved and must remain visible throughout tasking.',
    })
    constraints.add('Pause and re-evaluate if civilian indicators increase')
    revalidateOn.add('Civilian context changes')
  }

  if (input.civilianContext === 'present' && input.taskType === 'intercept') {
    matchedRules.push({
      id: 'CIV-003',
      name: 'Consequential task near civilians',
      source: 'Civilian-harm mitigation policy §3',
      effect: 'approval',
      reason: 'The proposed consequential task requires commander and designated review.',
    })
    constraints.add('Explicit human authorization required')
    revalidateOn.add('Civilian movement or density changes')
  }

  if (input.controlMode === 'autonomous') {
    matchedRules.push({
      id: 'CTRL-004',
      name: 'Autonomy supervision requirement',
      source: 'Human-control standard §4',
      effect: input.taskType === 'intercept' ? 'ineligible' : 'approval',
      reason:
        input.taskType === 'intercept'
          ? 'This task/control-mode combination is outside the configured authorization envelope.'
          : 'Autonomous control requires explicit authorization and bounded behavior.',
    })
    constraints.add('Named human supervisor')
    revalidateOn.add('Control mode changes')
  }

  if (input.taskType === 'intercept' && input.requesterAuthority === 'operator') {
    matchedRules.push({
      id: 'AUTH-003',
      name: 'Command authority threshold',
      source: 'Delegation matrix §3',
      effect: 'approval',
      reason: 'The requester cannot authorize this task category.',
    })
    constraints.add('Mission commander approval')
  }

  if (input.comms === 'weak') {
    matchedRules.push({
      id: 'COMMS-008',
      name: 'Degraded command link',
      source: 'C2 resilience policy §8',
      effect: 'restricted',
      reason: 'The command link is degraded; authorization must define loss-link behavior.',
    })
    constraints.add('Loss-link behavior declared before dispatch')
    revalidateOn.add('Command-link state changes')
  }

  if (input.comms === 'lost') {
    matchedRules.push({
      id: 'COMMS-009',
      name: 'Command link unavailable',
      source: 'C2 resilience policy §9',
      effect: 'ineligible',
      reason: 'A new task cannot be dispatched while the command link is lost.',
    })
  }

  if (input.dataAgeSeconds > 30) {
    matchedRules.push({
      id: 'DATA-006',
      name: 'Stale operational context',
      source: 'Evidence assurance policy §6',
      effect: 'indeterminate',
      reason: `The context is ${input.dataAgeSeconds}s old and exceeds the 30s evaluation threshold.`,
    })
    revalidateOn.add('Fresh context becomes available')
  }

  if (input.durationMinutes > 30) {
    matchedRules.push({
      id: 'TIME-005',
      name: 'Extended task duration',
      source: 'Task authority policy §5',
      effect: 'approval',
      reason: 'The requested duration exceeds standing operator authority.',
    })
    constraints.add('Authority expires at the approved end time')
  }

  if (missingInputs.length) {
    matchedRules.push({
      id: 'INPUT-001',
      name: 'Required task parameters',
      source: 'Policy engine schema',
      effect: 'indeterminate',
      reason: `Required values are missing: ${missingInputs.join(', ')}.`,
    })
  }

  if (!matchedRules.length) {
    matchedRules.push({
      id: 'BASE-001',
      name: 'Standing task authority',
      source: 'Operation policy / baseline',
      effect: 'eligible',
      reason: 'The proposal is within the configured standing authority envelope.',
    })
  }

  const outcome = matchedRules.reduce<RoeOutcome>(
    (current, rule) => (severity[rule.effect] > severity[current] ? rule.effect : current),
    'eligible',
  )

  const summary: Record<RoeOutcome, string> = {
    eligible: 'The proposal is within standing task authority.',
    restricted: 'The proposal may proceed only within the accumulated constraints.',
    approval: 'The proposal must be routed to the displayed authority before dispatch.',
    indeterminate: 'A material input is missing, unresolved, or stale.',
    ineligible: 'The proposal is outside the current authorization envelope.',
  }

  return {
    outcome,
    label: labels[outcome],
    summary: summary[outcome],
    matchedRules,
    constraints: [...constraints],
    missingInputs,
    revalidateOn: [...revalidateOn],
  }
}
