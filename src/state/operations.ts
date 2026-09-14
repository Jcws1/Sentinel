import { createStore, useStoreSelector, useStoreValue } from './createStore'
import { INITIAL_EVENTS, INITIAL_TASKS, type MissionTask, type OperationalEvent } from '@/data/operations'

export interface OperationsState {
  missionState: 'ACTIVE' | 'HOLD' | 'RECALL'
  autoMode: 'OFF' | 'SUPERVISED' | 'LOCKED'
  connected: boolean
  gnss: 'ACTIVE' | 'DEGRADED' | 'DENIED'
  tasks: MissionTask[]
  selectedTaskId: string
  events: OperationalEvent[]
  wedgetail: {
    mode: 'single' | 'coastal'
    status: 'standby' | 'connecting' | 'tasking' | 'engaging' | 'complete' | 'error'
    phase: 'idle' | 'track-ready' | 'launch' | 'intercept' | 'complete' | 'error'
    startedAt: number | null
    message: string
    boxId?: string
    targetLabel?: string
  }
}

export const operationsStore = createStore<OperationsState>({
  missionState: 'ACTIVE',
  autoMode: 'OFF',
  connected: true,
  gnss: 'DEGRADED',
  tasks: INITIAL_TASKS,
  selectedTaskId: INITIAL_TASKS[0].id,
  events: INITIAL_EVENTS,
  wedgetail: { mode: 'single', status: 'standby', phase: 'idle', startedAt: null, message: 'Training adapter ready' },
})

export const useOperations = () => useStoreValue(operationsStore)
export const useMissionState = () => useStoreSelector(operationsStore, (state) => state.missionState)

export function addEvent(action: string, entity: string, severity: OperationalEvent['severity'] = 'info', source = 'Operator') {
  operationsStore.set((state) => ({
    ...state,
    events: [{ id: `EV-${Date.now()}`, time: new Date().toLocaleTimeString('en-GB', { hour12: false }), severity, source, entity, action, actor: source === 'Operator' ? 'Local operator' : 'Adapter' }, ...state.events],
  }))
}

export function setWedgetailStatus(patch: Partial<OperationsState['wedgetail']>) {
  operationsStore.set((state) => ({ ...state, wedgetail: { ...state.wedgetail, ...patch } }))
}

export function cycleAutoMode() {
  operationsStore.set((state) => ({ ...state, autoMode: state.autoMode === 'OFF' ? 'SUPERVISED' : state.autoMode === 'SUPERVISED' ? 'LOCKED' : 'OFF' }))
}

export function setMissionState(missionState: OperationsState['missionState']) {
  operationsStore.set((state) => ({ ...state, missionState }))
  addEvent(`Mission state set to ${missionState}`, 'MISSION', missionState === 'ACTIVE' ? 'info' : 'caution')
}

export function selectTask(selectedTaskId: string) {
  operationsStore.set((state) => ({ ...state, selectedTaskId }))
}

export function setTaskStatus(taskId: string, status: MissionTask['status']) {
  operationsStore.set((state) => ({ ...state, tasks: state.tasks.map((task) => task.id === taskId ? { ...task, status } : task) }))
  addEvent(`Task ${status}`, taskId, status === 'rejected' ? 'caution' : 'info')
}

export function approveEligibleTasks() {
  operationsStore.set((state) => ({ ...state, tasks: state.tasks.map((task) => task.status === 'review' && task.policy === 'within' && task.adapter === 'sentinel-native' ? { ...task, status: 'executing' } : task) }))
  addEvent('Eligible local tasks approved', 'TASKS')
}
