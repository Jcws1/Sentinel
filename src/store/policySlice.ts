import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { PolicyZone } from '../types'

interface PolicyState {
  zones: PolicyZone[]
  rules: Array<{ id: string; expression: string; action: string }>
  summary: string[]
}

const initialState: PolicyState = {
  zones: [],
  rules: [],
  summary: [],
}

const policySlice = createSlice({
  name: 'policy',
  initialState,
  reducers: {
    hydratePolicy(_state, action: PayloadAction<PolicyState>) {
      return action.payload
    },
  },
})

export const { hydratePolicy } = policySlice.actions
export default policySlice.reducer
