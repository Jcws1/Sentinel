import { ViewStub } from './ViewStub'

export function FleetView() {
  return (
    <ViewStub
      summary="The interceptor swarm. Per-airframe state and how the allocator has distributed the current intent across it."
      contents={[
        'Per-interceptor status and endurance',
        'Current task assignment',
        'Allocation rationale for the active intent',
        'Recall and hold controls',
      ]}
    />
  )
}
