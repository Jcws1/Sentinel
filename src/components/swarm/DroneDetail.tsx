import { Section } from '@/components/panel/Section'
import { StatusRow } from '@/components/panel/StatusRow'
import { getPlatform } from '@/data/platforms'
import { formatBearing, formatDistance } from '@/lib/geo'
import {
  formatAltitude,
  formatDuration,
  formatLat,
  formatLon,
  formatPercent,
  formatSpeed,
} from '@/lib/format'
import {
  CAMERA_CODE,
  CAMERA_LABEL,
  STATE_LABEL,
  type Drone,
} from '@/types/swarm'

/**
 * Identity strip at the head of the body.
 *
 * The callsign is already in the panel header, so this carries what the
 * header cannot: the designation as it appears on the tile the operator just
 * clicked, and the fit that decides whether this aircraft is usable tonight.
 */
function Identity({ drone, platform }: { drone: Drone; platform: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-base tabular text-text">
        {drone.designation}
      </span>
      <span className="font-mono text-2xs tabular text-text-tertiary">
        {platform}
      </span>
      <span className="ml-auto font-mono text-2xs tabular text-text-tertiary">
        {CAMERA_CODE[drone.camera]}
      </span>
    </div>
  )
}

/**
 * Detail body for one aircraft.
 *
 * Ordered by how soon it changes: live state first, airframe limits last.
 * The spec sheet is the least urgent thing here but it is not filler — an
 * operator deciding whether to send this aircraft is comparing a distance on
 * the map against the combat radius, and that number has to be reachable
 * without leaving the panel.
 */
export function DroneDetail({ drone }: { drone: Drone }) {
  const platform = getPlatform(drone.platformId)
  const offline = drone.state === 'offline'
  const [cruiseLow, cruiseHigh] = platform.cruiseSpeedMs

  return (
    <div className="flex flex-col gap-4 p-3">
      <Identity drone={drone} platform={platform.name} />

      {/* Stated once, at the top, rather than annotating six rows. Without it
          every number below reads as current, and none of them are. */}
      {offline ? (
        <p className="rounded-xs border border-border-faint bg-panel-inset p-2 text-2xs leading-snug text-text-secondary">
          Link lost. Every value below is last known, not current.
        </p>
      ) : null}

      <Section title="Status">
        <div className="flex flex-col gap-1">
          <StatusRow label="State" value={STATE_LABEL[drone.state]} />
          <StatusRow label="Task" value={drone.taskId ?? 'Unassigned'} />
          <StatusRow label="Battery" value={formatPercent(drone.battery)} />
          <StatusRow
            label="Endurance"
            value={`${formatDuration(drone.enduranceS)} remaining`}
          />
          <StatusRow
            label="Link"
            value={offline ? 'NO LINK' : formatPercent(drone.linkQuality)}
          />
        </div>
      </Section>

      <Section title="Kinematics">
        <div className="flex flex-col gap-1">
          <StatusRow label="Speed" value={formatSpeed(drone.speedMs)} />
          <StatusRow label="Altitude" value={formatAltitude(drone.altitudeM)} />
          <StatusRow label="Heading" value={formatBearing(drone.headingDeg)} />
          <StatusRow
            label="Position"
            value={`${formatLat(drone.position[1], 4)} ${formatLon(drone.position[0], 4)}`}
          />
        </div>
      </Section>

      <Section title="Airframe">
        <div className="flex flex-col gap-1">
          <StatusRow
            label="Type"
            value={`${platform.manufacturer} ${platform.name}`}
          />
          <StatusRow label="Role" value={platform.role} />
          <StatusRow
            label="Cruise"
            value={`${Math.round(cruiseLow * 3.6)}–${formatSpeed(cruiseHigh)}`}
          />
          <StatusRow label="Max speed" value={formatSpeed(platform.maxSpeedMs)} />
          <StatusRow label="Climb rate" value={`${platform.climbRateMs} m/s`} />
          <StatusRow
            label="Ceiling"
            value={`${formatAltitude(platform.serviceCeilingM)} (max ${formatAltitude(platform.maxCeilingM)})`}
          />
          {/* Radius before range, and both labelled: the one that bounds
              tasking is the round trip, and reading the 37 km figure as a
              reachable distance strands the aircraft. */}
          <StatusRow
            label="Radius, w/ return"
            value={formatDistance(platform.combatRadiusM)}
          />
          <StatusRow
            label="Range, one way"
            value={formatDistance(platform.maxRangeM)}
          />
          {/* "Rated" because the row above it, in Status, is this
              aircraft's actual remaining time. Two rows both labelled
              Endurance, four sections apart, is a misread waiting to happen. */}
          <StatusRow
            label="Endurance, rated"
            value={`${formatDuration(platform.enduranceCruiseS)} cruise · ${formatDuration(platform.enduranceDashS)} dash`}
          />
          <StatusRow label="Payload" value={`${platform.payloadG} g`} />
          <StatusRow label="MTOW" value={`${platform.mtowKg} kg`} />
        </div>
      </Section>

      <Section title="Systems">
        <div className="flex flex-col gap-1">
          <StatusRow label="Camera" value={CAMERA_LABEL[drone.camera]} />
          <StatusRow label="Control link" value={platform.controlLink} />
          <StatusRow label="Video" value={platform.videoLink} />
          <StatusRow label="Battery pack" value={platform.battery} />
        </div>
      </Section>

      {/* The published figures are qualified by the manufacturer and the
          qualification travels with them. A spec read as a guarantee is how
          an aircraft gets tasked past its actual endurance. */}
      <p className="text-2xs leading-snug text-text-disabled">
        Airframe figures are manufacturer published and vary with battery
        capacity, weather, payload weight and flight profile.
      </p>
    </div>
  )
}
