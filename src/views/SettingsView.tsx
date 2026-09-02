import { ViewStub } from './ViewStub'

export function SettingsView() {
  return (
    <ViewStub
      summary="Console and node configuration. Local to this operator station; nothing here changes mission state."
      contents={[
        'Basemap and tile source',
        'Units, coordinate format and time zone',
        'Node identity and network endpoints',
        'Display density and reduced motion',
      ]}
    />
  )
}
