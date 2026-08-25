# Sentinel physical telemetry validation plan

Use this after the recorded-dataset integration succeeds. Its purpose is to
separate source-sensor error, gateway/transport error, and Anchor decision error.

## Equipment and reference

- Sentinel flight hardware in its normal mounting and software configuration.
- An independent survey-grade RTK/PPK rover rigidly mounted on the aircraft.
- A surveyed or logged base station with raw observations retained.
- A measured antenna lever arm between Sentinel's position reference point and
  the truth antenna, including axis convention and sign.
- A shared PPS/PTP time source where supported; otherwise record a visible or
  electrical synchronization event and estimate residual clock offset.

Do not call one onboard GNSS receiver “ground truth” for another without
documenting shared antennas, corrections, constellations, and common-mode risks.

## Record every layer

Capture immutable, timestamped logs at the aircraft/gateway input, the exact
gateway output sent to Sentinel, Sentinel's normalized output, Anchor input, and
Anchor decision output. Also retain RTK/PPK raw observations, solution status,
covariance or standard deviations, satellite count, correction age, and base
station metadata. Hash all files before analysis.

## Flight matrix

1. Static surveyed point for at least five minutes.
2. Open-sky low-dynamics route with repeated straight legs and hover periods.
3. Higher-dynamics turns, climbs, descents, and accelerations within the
   aircraft's approved envelope.
4. Legitimate naturally degraded environments such as partial sky obstruction,
   with a safety pilot and approved operating procedures.
5. Sensor-disconnect or recorded-message fault injection on a bench or
   hardware-in-the-loop setup for deterministic denial and recovery.

Do not transmit RF interference or spoof GNSS without the required legal,
range-safety, and spectrum authority. A shielded test facility or conducted
signal simulator is the appropriate route for intentional RF tests.

## Pre-registered analysis

- Freeze coordinate frames, units, datum/geoid handling, timestamp basis, lever
  arms, interpolation limits, and exclusion rules before examining results.
- Calibrate only on a designated flight or opening partition; score a separate
  flight wherever possible.
- Report horizontal, vertical, and 3D median/RMSE/p95/p99/max; 5/10/25 m pass
  rates; latency and age-of-fix; drop, duplicate, and out-of-order rates.
- For each reported uncertainty radius, measure empirical containment coverage
  and count overconfident samples.
- Score Anchor's accept/dead-reckon/withhold decisions against truth without
  exposing truth or the fault timeline during its first pass.
- Report results by phase and flight condition, not only as one pooled average.

## Acceptance gate

Do not use a single dataset number as an operational accuracy claim. Agree with
the partner team on maximum error, latency, outage behavior, and uncertainty
coverage thresholds, then require those thresholds on an untouched flight. Any
change to sensors, antennas, firmware, coordinate transforms, filtering, or
mounting should trigger at least a targeted revalidation.
