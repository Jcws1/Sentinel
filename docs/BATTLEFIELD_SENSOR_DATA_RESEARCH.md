# Battlefield sensor interfaces, datasets, and data-shape research

Status: research note  
Date: 27 July 2026  
Scope: public, unclassified counter-UAS and battlefield sensing references for
Sentinel's simulator and adapter design. This does not modify the implementation
plan.

## 1. Findings

The central finding is that Sentinel should not model its internal contract on
one vendor's API. Public vendor material confirms integration capability but
usually withholds the actual schema.

Use three layers:

1. A modality-neutral observation envelope influenced by the UK MOD SAPIENT
   standard.
2. Typed modality payloads for radar, RF, EO/IR, acoustic, cooperative identity,
   and vehicle telemetry.
3. Thin adapters for SAPIENT, ASTERIX, ONVIF/MISB, MAVLink, OpenDroneID, ROS 2,
   and proprietary vendor interfaces.

SAPIENT/BSI Flex 335 is the strongest public reference for this work. It was
created for autonomous networked sensors, adopted by UK MOD for counter-UAS,
tested with NATO C-UAS systems, and has public Protobuf definitions and a test
harness.

## 2. Public standards and APIs

| Interface | Typical source | Publicly documented data | Transport/encoding | Sentinel use |
|---|---|---|---|---|
| SAPIENT / BSI Flex 335 v2 | Multi-modal C-UAS edge sensors and fusion nodes | detection ID, object ID, location or range/bearing, ENU velocity, confidence, classification, behavior, RF signal, files, associations, status and tasking | Protobuf; public proto files | Preferred external sensor adapter and semantic reference |
| ASTERIX CAT-048 | Monoradar target reports | radar source, time, measured polar position, Cartesian position, track number/status, velocity, Mode A/C/S and plots/tracks depending profile | Compact binary data blocks | Radar track adapter |
| ASTERIX CAT-010 | Surface movement/MLAT and generic target reports | target report descriptor, position, velocity, track status and identity | Compact binary | Possible short-range radar adapter |
| ONVIF Profile T | Network EO/IR and PTZ cameras | media profiles, stream URI, H.264/H.265, PTZ, imaging settings, events and metadata stream | SOAP control; RTSP/RTP media and metadata | Camera discovery/control and media transport |
| MISB ST 0601 | Airborne full-motion video | platform and sensor position/orientation, FOV, slant range, frame centre/corners, timestamp and mission metadata | KLV metadata in MPEG transport stream | Georegistration of EO/IR video |
| MAVLink 2 | PX4/ArduPilot vehicles and payload components | vehicle pose/velocity, battery, estimator status, camera/gimbal metadata, ADS-B and OpenDroneID messages | Binary serial/UDP | Friendly vehicle and payload adapter |
| OpenDroneID / ASTM F3411 implementation | Cooperative broadcast Remote ID receivers | Basic ID, location/vector, authentication, self-ID, system/operator location and operator ID | Bluetooth/Wi-Fi; open C decoder | Cooperative target input, never sole hostile classification |
| ROS 2 messages | Gazebo and research sensors | images, camera calibration, IMU, NavSat, point clouds, audio/custom radar topics | DDS | Simulator/research adapter |
| Cursor on Target | Tactical event sharing | event UID/type/time/stale and geospatial point, with extensible detail | XML over network transports | Optional C2 interop; not a raw-signal format |

### 2.1 SAPIENT shape worth preserving

The public `DetectionReport` Protobuf includes:

- `report_id` and `object_id`
- optional task and state such as object lost
- either range/bearing or Cartesian location
- detection confidence
- track and object information
- predicted location and timestamp
- classification hierarchy and confidence
- behavior and confidence
- associated network files
- RF signal amplitude, frequency band and pulse duration
- associations with other detections
- ENU velocity
- optional reported identity and colour

Sentinel does not need to reproduce SAPIENT internally field-for-field. It should
be possible to translate without losing measurement geometry, time,
uncertainty, classification, association, or provenance.

## 3. Representative sensors and public integration evidence

These systems are representative integration targets, not recommendations to
purchase them.

### 3.1 Radar

| Product/model | Public output/API evidence | Likely output level | Public schema confidence |
|---|---|---|---|
| Robin Radar IRIS | Current product sheet lists SAPIENT, XML, ASTERIX and CoT data interfaces; earlier material describes an XML broadcast interface | 3D tracks, classifications and alarms | High for interface family; vendor XML details are not public |
| DRS RADA ieMHR | Official page lists ASTERIX and customer-tailored protocols | 4D target tracks and track status | High for ASTERIX availability |
| Echodyne EchoShield | Official material describes an SDK, range-Doppler access and 10 Hz high-fidelity track output | Tracks and optional lower-level radar products | Medium; SDK schema requires vendor access |
| Blighter A400 series | Official material confirms layered C-UAS/C2 integration | Target tracks and alarms | Low; exact protocol was not found publicly |
| Fortem TrueView R20 | Public AERPAW dataset includes R20 tracking/localisation output | Radar localisation and tracks | Medium from dataset, not a general public API |

Expected radar adapter fields:

```ts
type RadarMeasurement = {
  reportLevel: 'plot' | 'track' | 'range_doppler' | 'micro_doppler'
  rangeM?: number
  azimuthRad?: number
  elevationRad?: number
  radialVelocityMS?: number
  positionEnuM?: { east: number; north: number; up: number }
  velocityEnuMS?: { east: number; north: number; up: number }
  rcsDbsm?: number
  snrDb?: number
  trackNumber?: string
  trackStatus?: 'tentative' | 'confirmed' | 'coasting' | 'dropped'
  classification?: Array<{ label: string; confidence: number }>
  spectrumRef?: string
}
```

Do not require RCS or micro-Doppler from every radar. Many operational
integrations expose tracks rather than raw ADC or spectral data.

### 3.2 RF detection and cooperative identity

| Product/model | Public output/API evidence | Likely output level | Public schema confidence |
|---|---|---|---|
| DroneShield DroneSentry-X / RfOne through DroneSentry-C2 | DroneSentry-C2 advertises a REST API, RF/radar/optical fusion, remote status/configuration, and logs containing vendor, location, duration and MAC address | Detections, identity, geolocation and health | Medium; REST endpoint schema is commercial |
| Dedrone RF-360 / RF-300 | Official material describes detection, classification and localisation of drones and controllers; RF-360 connects to cloud with integrated GPS/LTE | RF event, drone/controller location and class | Low; public API schema was not found |
| Sentrycs passive RF/CoRF | Official material lists drone make/model/serial, drone and operator location, altitude, speed and heading | Decoded/derived telemetry and identity | Low; proprietary protocol-processing interface |
| OpenDroneID receiver | Open decoder libraries and MAVLink messages expose the complete public message family | Cooperative identity, vehicle/operator location and motion | High |
| Generic SDR/DF array | Device SDK normally yields I/Q samples, PSD/spectrogram, power and angle-of-arrival estimates | Raw RF and derived bearings | Depends on receiver SDK |

Expected RF adapter fields:

```ts
type RfMeasurement = {
  reportLevel: 'energy' | 'signal' | 'bearing' | 'decoded_identity'
  startFrequencyHz?: number
  centerFrequencyHz: number
  stopFrequencyHz?: number
  bandwidthHz?: number
  amplitudeDbm?: number
  snrDb?: number
  bearingRad?: number
  elevationRad?: number
  bearingStdDevRad?: number
  protocolFamily?: string
  emitterClass?: string
  uasId?: string
  controllerPosition?: GeoPosition
  vehiclePosition?: GeoPosition
  velocity?: { horizontalMS?: number; verticalMS?: number; headingRad?: number }
  macAddress?: string
  iqRef?: string
  psdRef?: string
}
```

An RF non-detection is not evidence that no drone exists. Autonomous,
pre-programmed, emission-controlled, jammed, or fibre-controlled aircraft may
produce no usable control-link observation.

### 3.3 EO/IR

| Product/model/interface | Public output/API evidence | Likely output level | Public schema confidence |
|---|---|---|---|
| Teledyne FLIR Hadron 640R | Official integration material specifies 64 MP visible plus 640×512 radiometric thermal, USB/MIPI, 60 Hz, platform drivers and Boson command SDKs | Visible frames, thermal frames/radiometry and camera control | High for core data; exact payload/gimbal integration varies |
| FLIR Boson/Boson+ | Public SDK documentation for Python/C/C# and UVC/reference drivers | Thermal video, radiometry on supported models, camera settings | High |
| ONVIF Profile T camera | Standard stream discovery, H.264/H.265, PTZ, metadata and events | Encoded frames, PTZ state and analytics metadata | High |
| MISB ST 0601 payload | Standard KLV fields for airborne georegistered motion imagery | Video plus platform/sensor geometry | High |
| DroneShield VisionAI | Public material describes camera-agnostic optical/thermal analytics integrated in DroneSentry-C2 | Detections/classifications and tracks | Low; commercial API schema |

Expected EO/IR adapter fields:

```ts
type ImageryMeasurement = {
  spectrum: 'visible' | 'nir' | 'mwir' | 'lwir'
  mediaRef: string
  frameNumber?: number
  imageSize: { width: number; height: number }
  pixelFormat?: string
  sensorPose: Pose
  horizontalFovRad: number
  verticalFovRad: number
  gimbal?: { azimuthRad: number; elevationRad: number; rollRad: number }
  detections: Array<{
    detectionId: string
    boundingBox: { x: number; y: number; width: number; height: number }
    classScores: Array<{ label: string; confidence: number }>
    lineOfSight?: { bearingRad: number; elevationRad: number }
    trackId?: string
    temperatureK?: number
  }>
  frameCenter?: GeoPosition
  footprint?: GeoPosition[]
}
```

Store or stream pixels separately from the observation event bus. An
observation should refer to a frame/clip using `mediaRef`.

### 3.4 Acoustic

| Product/model | Public output/API evidence | Likely output level | Public schema confidence |
|---|---|---|---|
| Squarehead Discovair G2+ | Official page describes a machine-to-machine API, classification alarm and precise bearing; current system supports directional and hemispheric modes | Bearing/elevation, class, alarm and potentially audio evidence | Medium; exact API schema is commercial |
| Generic microphone array | Common research path produces multichannel PCM, beamformed audio, direction of arrival and class score | Audio samples and derived bearing | High if Sentinel owns the processing |

Expected acoustic adapter fields:

```ts
type AcousticMeasurement = {
  reportLevel: 'energy' | 'bearing' | 'classification'
  bearingRad?: number
  elevationRad?: number
  bearingStdDevRad?: number
  soundPressureDb?: number
  snrDb?: number
  frequencyBandsHz?: Array<{ low: number; high: number; energyDb: number }>
  classification?: Array<{ label: string; confidence: number }>
  arrayGeometryRevision?: string
  audioRef?: string
}
```

Acoustic systems often provide bearing rather than reliable absolute range.
Multiple arrays or fusion with radar/EO are needed for a stronger position
estimate.

### 3.5 Friendly vehicle and payload telemetry

MAVLink/PX4 should remain the primary public model for friendly vehicles:

```ts
type VehicleTelemetry = {
  vehicleId: string
  platformProfileRevision: string
  observedAt: string
  pose: PoseWithCovariance
  velocity: VelocityWithCovariance
  navigationSource: 'gnss' | 'ins' | 'vio' | 'mesh' | 'truth'
  battery?: {
    remainingPercent?: number
    voltageV?: number
    currentA?: number
    consumedMah?: number
    temperatureC?: number
  }
  link?: { rssiDbm?: number; packetLoss?: number; latencyMs?: number }
  estimator?: { healthy: boolean; flags: string[] }
  components: Array<{
    componentId: number
    kind: 'autopilot' | 'camera' | 'gimbal' | 'payload' | 'remote_id' | 'other'
    health: string
    capabilities: string[]
  }>
}
```

## 4. Canonical Sentinel observation envelope

Every adapter should emit the same envelope around a modality payload:

```ts
type SensorObservation = {
  schemaVersion: '1.0'
  observationId: string
  source: {
    sensorId: string
    sensorTypeId: string
    adapterType:
      | 'sapient'
      | 'asterix'
      | 'onvif_misb'
      | 'mavlink'
      | 'open_drone_id'
      | 'ros2'
      | 'vendor'
      | 'sim'
      | 'replay'
    configurationRevision: number
    mode: 'live' | 'sim' | 'replay'
  }
  sequence: number
  time: {
    observedAt: string
    receivedAt: string
    clockQuality: 'ptp' | 'gps' | 'ntp' | 'estimated' | 'unknown'
    uncertaintyMs?: number
  }
  frame: {
    id: string
    convention: 'WGS84' | 'LOCAL_ENU' | 'SENSOR_POLAR' | 'IMAGE'
    originRevision?: string
  }
  sensorPose?: PoseWithCovariance
  measurement:
    | { modality: 'radar'; data: RadarMeasurement }
    | { modality: 'rf'; data: RfMeasurement }
    | { modality: 'eo_ir'; data: ImageryMeasurement }
    | { modality: 'acoustic'; data: AcousticMeasurement }
    | { modality: 'cooperative_id'; data: CooperativeIdentityMeasurement }
  quality: {
    detectionConfidence?: number
    measurementCovariance?: number[]
    latencyMs: number
    staleAfterMs: number
    processingLevel: 'raw_ref' | 'measurement' | 'local_track' | 'classification'
  }
  associations?: Array<{
    observationId: string
    relationship: 'same_object' | 'derived_from' | 'supports' | 'conflicts'
    confidence?: number
  }>
  rawEvidence?: Array<{
    mediaType: string
    uri: string
    sha256?: string
    retentionClass?: string
  }>
}
```

### Fields that must never be optional at the envelope level

- Observation ID
- Sensor/source ID
- Source mode: live, simulation, or replay
- Configuration revision
- Sequence number
- Observation and reception timestamps
- Frame ID/convention
- Modality
- Processing level
- Latency and freshness policy

Without these fields, multi-sensor association and audit are not reliable.

## 5. Public datasets

None of these datasets demonstrates battlefield effectiveness. They are useful
for schema design, preprocessing, baselines, and regression tests.

| Dataset | Modalities and shape | Labels | Best use | Limitation |
|---|---|---|---|---|
| TSMS-Drone (2026 Scientific Data) | Time-aligned CW radar complex vector (16,384 samples), RF complex vector (262,144 samples), FMCW 161×4096 range-Doppler map, representative raw FMCW ADC | target type, distance, modality, repeated index | Best public example for synchronized radar/RF fusion and raw-reference shapes | Controlled 2–30 m collection with four commercial drones and one non-drone object |
| Open Radar Initiative outdoor moving-object dataset | Per-track Doppler spectra plus timestamps, range, azimuth, radial velocity, SNR, filtered XYZ, class and radar parameters | UAV/person/bicycle/vehicle class | Radar track and micro-Doppler schema; CFAR/classification baselines | Ground-surveillance research setting |
| Halmstad multi-sensor drone dataset | 365 thermal and 285 visible ten-second videos, 203,328 annotated frames, plus WAV clips | drone, bird, aircraft, helicopter; audio drone/helicopter/background | EO/IR/audio ingestion and modality fusion | Daylight, up to about 200 m, limited drone types |
| Anti-UAV / Anti-UAV410 | RGB and/or thermal videos with per-frame boxes, visibility and attributes; 410 version has over 438k annotated boxes | target box, present/lost state, scene attributes | Tiny target tracking, occlusion and reacquisition | Primarily single-object tracking; no radar/RF |
| Drone-vs-Bird challenge | Video sequences with drone/bird annotations under data-use agreement | bounding boxes/classes | False-positive testing against birds | Access agreement and limited sensor metadata |
| VTI_DroneSET_FFT | RF recordings/FFT products for Phantom IV, Mavic Zoom and Mavic 2 Enterprise across operating modes | drone and controller/operating scenario | RF classification schema and baseline | Narrow product/protocol set |
| AERPAW Dataset-28 | Synchronized UAV telemetry, RF/link quality, Keysight RF sensor and Fortem R20 radar localisation/tracking | mission/trajectory and timing fields | Live-vs-digital-twin adapter testing and timestamp alignment | Not designed as a hostile-drone classification benchmark |

Recommended initial dataset suite:

1. TSMS-Drone for radar/RF raw and synchronized fusion fixtures.
2. Open Radar Initiative for track-level radar fixtures.
3. Halmstad for visible/thermal/acoustic fixtures.
4. Anti-UAV410 for thermal tracking and lost/reacquired states.
5. AERPAW for vehicle telemetry and real/digital-twin timing.

## 6. Model and signal-processing candidates

Use conservative baselines first. The immediate goal is to validate data flow,
uncertainty, and fusion, not to claim a novel classifier.

### Radar

```text
raw ADC/IQ
  -> range/Doppler FFT
  -> CFAR detections
  -> angle estimation
  -> clustering
  -> local track filter
  -> micro-Doppler feature/classifier
```

Candidate baselines:

- Range-Doppler CFAR for detection.
- Kalman or interacting multiple model filter for local tracks.
- Short-time Fourier transform for micro-Doppler spectrograms.
- Small CNN/ResNet or the dataset's published GoogLeNet baseline for
  drone/non-drone classification.

### RF

```text
IQ samples
  -> channelization / PSD / spectrogram
  -> burst detection
  -> protocol or fingerprint classification
  -> direction finding / multilateration
```

Candidate baselines:

- Energy detector plus PSD/STFT features.
- CNN/ResNet on spectrograms for research comparisons.
- Protocol decoder for OpenDroneID/cooperative signals.
- Angle of arrival from a calibrated antenna array.

Split train and test by capture session, device, environment, and preferably
physical aircraft. Random window splits can leak transmitter/session
fingerprints and greatly overstate accuracy.

### EO/IR

```text
decoded frame + camera calibration + pose
  -> small-object detector
  -> image tracker
  -> line-of-sight ray
  -> classification and track update
```

Candidate baselines:

- A compact one-stage detector or DETR-family detector trained for tiny aerial
  objects.
- Kalman/ByteTrack-style association for multi-object video.
- Anti-UAV transformer/Siamese baselines for single-target thermal tracking.
- Explicit drone-vs-bird negative class.

### Acoustic

```text
multichannel PCM
  -> calibration and filtering
  -> beamforming / direction of arrival
  -> log-mel or spectrogram features
  -> CNN/CRNN classification
```

Candidate baselines:

- GCC-PHAT or beamforming for bearing.
- Log-mel spectrogram plus compact CNN/CRNN for class probability.
- Noise-class and unknown-class outputs rather than forced drone/non-drone.

### Fusion

Start with measurement-level or track-level probabilistic fusion:

- coordinate/frame transformation
- time alignment and out-of-sequence handling
- statistical gating
- nearest-neighbour or JPDA association
- constant-velocity Kalman filter
- classification probability pooling with source reliability
- track confirmation, coasting and deletion

Do not concatenate all raw modalities into one neural network for the MVP. It
is hard to audit, hard to train with the available public datasets, and brittle
when a sensor is absent.

## 7. Suggested adapter conformance fixtures

Create one small, versioned fixture set for each interface:

- SAPIENT Protobuf detection with range/bearing, ENU velocity, classification,
  behavior and RF signal.
- ASTERIX CAT-048 confirmed track and track-drop report.
- ONVIF media profile plus one MISB KLV metadata sample.
- MAVLink vehicle telemetry, camera component and Remote ID messages.
- Radar plot with range/azimuth/radial velocity but no identity.
- RF bearing with no range.
- EO bounding box with calibrated line of sight but no absolute target position.
- Acoustic bearing/classification with no range.
- Two-source fused track with covariance.
- Stale, out-of-order and conflicting observations.

Each adapter test should prove:

- units and axes
- timestamp semantics
- source/configuration identity
- lossless preservation of uncertainty
- correct handling of absent fields
- source mode labeling
- bounded malformed-input behavior

## 8. Practical conclusions for Sentinel

1. Add a SAPIENT adapter before a named vendor adapter if external hardware is
   not yet selected.
2. Add ASTERIX CAT-048 as the first radar-specific adapter.
3. Treat ONVIF/MISB video and metadata as a separate high-bandwidth plane.
4. Add OpenDroneID as a cooperative input, not a universal drone detector.
5. Preserve bearing-only and range-only measurements. Do not manufacture a
   precise geolocation when the sensor did not provide one.
6. Permit local sensor tracks but identify the processing level so Sentinel
   does not confuse a vendor track with a raw detection.
7. Store raw I/Q, spectrograms, audio and video by reference with retention and
   integrity metadata.
8. Make sensor configuration revision, clock quality and coordinate frame
   first-class fields.
9. Require an `unknown` class in every classifier.
10. Validate on held-out sessions and environments; public benchmark accuracy
    is not an operational performance claim.

## 9. Primary sources

Standards and public implementations:

- UK MOD SAPIENT overview:
  <https://www.gov.uk/guidance/sapient-autonomous-sensor-system>
- SAPIENT/BSI Flex 335 v2 Protobuf:
  <https://github.com/dstl/SAPIENT-Proto-Files/tree/main/bsi_flex_335_v2_0>
- SAPIENT v2 test harness:
  <https://github.com/dstl/BSI-Flex-335-v2-Test-Harness>
- EUROCONTROL ASTERIX:
  <https://www.eurocontrol.int/asterix>
- ASTERIX CAT-048:
  <https://www.eurocontrol.int/publication/cat048-eurocontrol-specification-surveillance-data-exchange-asterix-part-4-category-48>
- ONVIF Profile T:
  <https://www.onvif.org/profiles/profile-t/>
- MAVLink common messages:
  <https://mavlink.io/en/messages/common.html>
- OpenDroneID reference implementation:
  <https://github.com/opendroneid/opendroneid-core-c>

Representative sensor sources:

- Robin Radar IRIS:
  <https://www.robinradar.com/hubfs/Iris%20Datasheet%20V15.7_Online.pdf>
- DRS RADA ieMHR:
  <https://www.drsrada.com/products/iemhr>
- Echodyne EchoShield:
  <https://www.echodyne.com/radar-systems/echoshield>
- Blighter aerial threat detection:
  <https://blighter.com/solutions/aerial-threat-detection/>
- DroneShield C2 software:
  <https://www.droneshield.com/products-software>
- Dedrone RF-360:
  <https://www.dedrone.com/press/dedrone-introduces-next-generation-of-drone-detection-sensor>
- Sentrycs:
  <https://sentrycs.com/>
- Teledyne FLIR Hadron 640 development kits:
  <https://oem.flir.com/en-ca/products/hadron-640-development-kits/>
- Squarehead Discovair:
  <https://www.sqhead.com/drone-detection>

Datasets:

- TSMS-Drone:
  <https://doi.org/10.1038/s41597-026-06802-6>
- Open Radar Initiative:
  <https://github.com/openradarinitiative/open_radar_datasets>
- Halmstad multi-sensor drone dataset:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC8573135/>
- Anti-UAV:
  <https://github.com/ZhaoJ9014/Anti-UAV>
- Anti-UAV410:
  <https://github.com/HwangBo94/Anti-UAV410>
- VTI_DroneSET_FFT:
  <https://data.mendeley.com/datasets/s6tgnnp5n2>
- AERPAW Dataset-28:
  <https://aerpaw.org/dataset/multi-modal-rf-sensor-and-radar-dataset-for-uav-tracking/>

