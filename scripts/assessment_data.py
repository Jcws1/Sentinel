"""Generate reproducible, neutral synthetic observation batches for a code review.

This exercises data ingestion and missing observations, not aircraft dynamics,
sensor detection accuracy or physical effects. Coordinates use a documented
local spherical conversion; all samples and their area move together.
"""
import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
import random
import re

EARTH_RADIUS_M = 6371008.8
ORIGIN = (103.85, 1.35)


def encoded(value):
    return (json.dumps(value, indent=2, ensure_ascii=True, allow_nan=False) + '\n').encode('utf-8')


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def shifted(lon, lat, north, east, reference_latitude=ORIGIN[1]):
    return (lon + math.degrees(east / (EARTH_RADIUS_M * math.cos(math.radians(reference_latitude)))),
            lat + math.degrees(north / EARTH_RADIUS_M))


def timestamp(value):
    return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def create_datasets(seed=20260925, units=40, timestamps=6, drop_rate=.10,
                    north_m=2000., east_m=0., jitter_m=5., time_shift_s=60., run_id='review'):
    if not isinstance(seed, int) or not 0 <= seed <= 2**32 - 1:
        raise ValueError('seed must be an integer from 0 to 4294967295')
    if not 1 <= units <= 40 or not 2 <= timestamps <= 20:
        raise ValueError('The review generator supports 1-40 units and 2-20 timestamps')
    if not all(math.isfinite(v) for v in (drop_rate, north_m, east_m, jitter_m, time_shift_s)):
        raise ValueError('All variation parameters must be finite')
    if not 0 <= drop_rate <= .8 or not 0 <= jitter_m <= 25:
        raise ValueError('drop-rate must be 0-0.8 and jitter-m must be 0-25')
    if drop_rate > (timestamps - 1) / timestamps:
        raise ValueError('That drop rate would remove the preserved first snapshot; use more timestamps or a lower rate')
    if abs(north_m) > 100000 or abs(east_m) > 100000 or abs(time_shift_s) > 86400:
        raise ValueError('Review shifts are bounded to 100 km and one day')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,32}', run_id):
        raise ValueError('run-id must be 1-32 letters, digits, underscores or hyphens')
    parameters = dict(seed=seed, units=units, timestamps=timestamps, drop_rate=drop_rate,
                      north_m=north_m, east_m=east_m, jitter_m=jitter_m,
                      time_shift_s=time_shift_s, run_id=run_id)
    suffix = digest(parameters)[:10]
    start = datetime(2026, 9, 25, 0, 0, 0, tzinfo=timezone.utc)
    # Generous fixed bounds contain the demonstration movement and <=25 m jitter.
    corners = [shifted(*ORIGIN, n, e) for e, n in [(-650, -650), (650, -650), (650, 650), (-650, 650), (-650, -650)]]
    baseline = dict(
        schema_version='1.0', mission_id=f'ASSESSMENT-{run_id}-{suffix}-BASE',
        command=dict(command_id=f'ASSESSMENT-{run_id}-{suffix}-BASE-START', action='START',
                     issued_at=timestamp(start), execute_at=timestamp(start), source_mode='SIMULATED'),
        area=dict(area_id='SYNTHETIC-OBSERVATION-AREA', polygon=[list(p) for p in corners], min_altitude_m=0, max_altitude_m=500),
        resolution=dict(interaction_radius_m=1, location_grid_deg=.001),
        calibration_profile=dict(profile_id='ASSESSMENT-NEUTRAL-OBSERVATIONS', version='1.0.0', evidence_status='NOTIONAL',
                                 source_summary='Synthetic neutral observations for software input robustness only.',
                                 rules=[dict(actor_class='I', subject_class='I', probability=0, health_delta=-1)]),
        samples_by_timestamp={})
    columns = math.ceil(math.sqrt(units))
    for step in range(timestamps):
        rows = []
        for unit in range(units):
            north = ((unit // columns) - (columns - 1) / 2) * 100 + step * 3
            east = ((unit % columns) - (columns - 1) / 2) * 100 + step * 2
            lon, lat = shifted(*ORIGIN, north, east)
            rows.append(dict(drone_id=f'OBS-{unit+1:03}', longitude_deg=lon, latitude_deg=lat,
                             altitude_m=100 + unit % 5 * 10, **{'class': 'I'}, team='NEUTRAL', health=100, status='ACTIVE'))
        baseline['samples_by_timestamp'][timestamp(start + timedelta(seconds=step))] = rows
    variant = deepcopy(baseline)
    variant['mission_id'] = baseline['mission_id'].replace('-BASE', '-VARIANT')
    variant['command']['command_id'] = baseline['command']['command_id'].replace('-BASE', '-VARIANT')
    for key in ('issued_at', 'execute_at'):
        variant['command'][key] = timestamp(start + timedelta(seconds=time_shift_s))
    variant['area']['polygon'] = [list(shifted(lon, lat, north_m, east_m)) for lon, lat in corners]
    rng = random.Random(seed)
    # Preserve the first snapshot so every identity is known before it goes missing.
    eligible = [(step, unit) for step in range(1, timestamps) for unit in range(units)]
    removed_count = min(round(units * timestamps * drop_rate), len(eligible))
    removed = set(rng.sample(eligible, removed_count))
    removed_details = []
    variant['samples_by_timestamp'] = {}
    for step, (at, rows) in enumerate(baseline['samples_by_timestamp'].items()):
        shifted_at = timestamp(start + timedelta(seconds=step + time_shift_s))
        kept = []
        for unit, row in enumerate(rows):
            changed = deepcopy(row)
            changed['longitude_deg'], changed['latitude_deg'] = shifted(row['longitude_deg'], row['latitude_deg'],
                north_m + rng.uniform(-jitter_m, jitter_m), east_m + rng.uniform(-jitter_m, jitter_m))
            if (step, unit) in removed:
                removed_details.append(dict(baseline_timestamp=at, variant_timestamp=shifted_at, drone_id=row['drone_id']))
            else:
                kept.append(changed)
        variant['samples_by_timestamp'][shifted_at] = kept
    invalid = deepcopy(variant)
    invalid['mission_id'] = baseline['mission_id'].replace('-BASE', '-INVALID')
    invalid['command']['command_id'] = baseline['command']['command_id'].replace('-BASE', '-INVALID')
    next(iter(invalid['samples_by_timestamp'].values()))[0]['latitude_deg'] = 91
    last_rows = next(reversed(variant['samples_by_timestamp'].values()))
    present = {row['drone_id'] for row in last_rows}
    missing_at_end = sorted(row['drone_id'] for row in next(iter(baseline['samples_by_timestamp'].values())) if row['drone_id'] not in present)
    manifest = dict(purpose='Synthetic input robustness demonstration; no sensor, aircraft or physical-effects validation.',
                    parameters=parameters, coordinate_method='Local spherical conversion, mean Earth radius 6371008.8 m, longitude scale at latitude 1.35 degrees.',
                    baseline_rows=units * timestamps, variant_rows=units * timestamps - len(removed),
                    removed_rows=len(removed), actual_drop_rate=len(removed) / (units * timestamps),
                    removed_observations=removed_details, expected_final_unobserved=missing_at_end,
                    expected=dict(baseline='HTTP 200; supplied neutral observations recorded',
                                  variant='HTTP 200; omitted observations remain unobserved, not removed or guessed',
                                  invalid='HTTP 422; latitude 91 rejected before creating a recording',
                                  exact_retry='Same command identity and body returns the stored result without another execution'),
                    files={name: dict(sha256=digest(value), bytes=len(encoded(value))) for name, value in [('baseline.json', baseline), ('variant.json', variant), ('invalid.json', invalid)]})
    return baseline, variant, invalid, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--seed', type=int, default=20260925)
    parser.add_argument('--units', type=int, default=40)
    parser.add_argument('--timestamps', type=int, default=6)
    parser.add_argument('--drop-rate', type=float, default=.1)
    parser.add_argument('--north-m', type=float, default=2000)
    parser.add_argument('--east-m', type=float, default=0)
    parser.add_argument('--jitter-m', type=float, default=5)
    parser.add_argument('--time-shift-s', type=float, default=60)
    parser.add_argument('--run-id', default='review')
    args = vars(parser.parse_args())
    out = args.pop('output')
    try:
        datasets = create_datasets(**args)
    except ValueError as error:
        parser.error(str(error))
    # Refuse overwrite so a reviewer can retain the exact prior inputs.
    if out.exists() and any(out.iterdir()):
        parser.error('Output directory is not empty; choose a new directory to preserve earlier inputs')
    out.mkdir(parents=True, exist_ok=True)
    for name, value in zip(('baseline.json', 'variant.json', 'invalid.json', 'manifest.json'), datasets):
        (out / name).write_bytes(encoded(value))
    print(json.dumps(dict(output=str(out.resolve()), baseline_rows=datasets[3]['baseline_rows'],
                          variant_rows=datasets[3]['variant_rows'], removed_rows=datasets[3]['removed_rows'],
                          expected_final_unobserved=datasets[3]['expected_final_unobserved']), indent=2))


if __name__ == '__main__':
    main()
