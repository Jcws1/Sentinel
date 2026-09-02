import { ViewStub } from './ViewStub'

export function PolicyView() {
  return (
    <ViewStub
      summary="The bounds on autonomy. What the system is permitted to do without an operator in the loop, and what it must ask for."
      contents={[
        'Active rule set and its provenance',
        'Engagement authority and geofence limits',
        'Violations and near-miss log',
        'Rule editor with dry-run against live state',
      ]}
    />
  )
}
