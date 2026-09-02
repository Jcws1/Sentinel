import { ViewStub } from './ViewStub'

export function EventsView() {
  return (
    <ViewStub
      summary="Ordered record of everything the system and the operator did, with enough context to reconstruct a decision after the fact."
      contents={[
        'Chronological event stream',
        'Filter by severity, entity and source',
        'Operator actions with issuing identity',
        'Export for after-action review',
      ]}
    />
  )
}
