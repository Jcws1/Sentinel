import { createStore, useStoreSelector, useStoreValue } from './createStore'
import { INITIAL_EVENTS, INITIAL_TASKS, type MissionMode, type MissionTask, type OperationalEvent } from '@/data/operations'

export interface OperationsState {
  mode: MissionMode
  missionState: 'ACTIVE' | 'HOLD' | 'RECALL'
  autoMode: 'OFF' | 'SUPERVISED' | 'LOCKED'
  connected: boolean
  gnss: 'ACTIVE' | 'DEGRADED' | 'DENIED'
  tasks: MissionTask[]
  selectedTaskId: string
  events: OperationalEvent[]
}

export const operationsStore = createStore<OperationsState>({
  mode: 'defense',
  missionState: 'ACTIVE',
  autoMode: 'OFF',
  connected: true,
  gnss: 'DEGRADED',
  tasks: INITIAL_TASKS,
  selectedTaskId: INITIAL_TASKS[0].id,
  events: INITIAL_EVENTS,
})

export const useOperations = () => useStoreValue(operationsStore)
export const useMode = () => useStoreSelector(operationsStore, (state) => state.mode)
export const useMissionState = () => useStoreSelector(operationsStore, (state) => state.missionState)

function addEvent(action: string, entity: string, severity: OperationalEvent['severity'] = 'info') {
  operationsStore.set((state) => ({
    ...state,
    events: [{ id: `EV-${Date.now()}`, time: new Date().toLocaleTimeString('en-GB', { hour12: false }), severity, source: 'Operator', entity, action, actor: 'Local operator' }, ...state.events],
  }))
}

export function setMissionMode(mode: MissionMode) {
  operationsStore.set((state) => ({ ...state, mode }))
  addEvent(`Mission mode changed to ${mode}`, 'MISSION')
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
  operationsStore.set((state) => ({ ...state, tasks: state.tasks.map((task) => task.status === 'review' && task.policy === 'within' ? { ...task, status: 'executing' } : task) }))
  addEvent('Eligible plan groups confirmed for execution', 'MISSION')
}
