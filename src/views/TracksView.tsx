import { ViewStub } from './ViewStub'

export function TracksView() {
  return (
    <ViewStub
      summary="The air picture. Every detected contact with its classification, kinematics and the sensor that holds it."
      contents={[
        'Sortable contact table',
        'Classification and confidence',
        'Track history and predicted path',
        'Hand-off between sensors',
      ]}
    />
  )
}
