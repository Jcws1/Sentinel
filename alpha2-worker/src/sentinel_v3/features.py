from __future__ import annotations

import numpy as np
import pandas as pd

TRACK_KEYS = ["scenario_id", "fused_track_id"]
ROW_KEYS = ["scenario_id", "timestamp_s", "fused_track_id"]


def _angle_delta(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a - b + 180.0) % 360.0 - 180.0


def track_features(fused: pd.DataFrame, window: int = 20) -> pd.DataFrame:
    """Create causal track features. No metadata, events, IDs, or future rows are used."""
    d = fused.sort_values(ROW_KEYS).copy()
    g = d.groupby(TRACK_KEYS, sort=False, observed=True)
    dt = g.timestamp_s.diff().clip(lower=0.05, upper=2.0)
    step = np.hypot(g.observed_x_m.diff(), g.observed_y_m.diff())
    heading_delta = _angle_delta(d.observed_heading_deg, g.observed_heading_deg.shift()).abs()
    d["dt_s"] = dt.fillna(0.5)
    d["step_m"] = step.fillna(0.0)
    d["turn_rate_abs"] = (heading_delta / d.dt_s).clip(0, 360).fillna(0.0)
    d["accel_abs"] = (g.observed_speed_mps.diff().abs() / d.dt_s).clip(0, 100).fillna(0.0)
    rad = np.deg2rad(d.observed_heading_deg)
    d["heading_sin"] = np.sin(rad)
    d["heading_cos"] = np.cos(rad)

    rolling_cols = [
        "observed_speed_mps", "turn_rate_abs", "accel_abs", "observed_z_m",
        "observed_vz_mps", "heading_sin", "heading_cos", "step_m",
    ]
    for col in rolling_cols:
        roll = d.groupby(TRACK_KEYS, sort=False, observed=True)[col].rolling(window, min_periods=3)
        d[f"{col}_mean"] = roll.mean().reset_index(level=TRACK_KEYS, drop=True)
        d[f"{col}_std"] = roll.std().reset_index(level=TRACK_KEYS, drop=True).fillna(0.0)

    old_x = g.observed_x_m.shift(window - 1)
    old_y = g.observed_y_m.shift(window - 1)
    displacement = np.hypot(d.observed_x_m - old_x, d.observed_y_m - old_y)
    path = d.groupby(TRACK_KEYS, sort=False, observed=True).step_m.rolling(window, min_periods=3).sum().reset_index(level=TRACK_KEYS, drop=True)
    d["path_efficiency"] = (displacement / path.clip(lower=1e-3)).clip(0, 1).fillna(1.0)
    d["heading_coherence"] = np.hypot(d.heading_sin_mean, d.heading_cos_mean).clip(0, 1)
    # A longer memory exposes sustained zigzags, stop/start behaviour and orbit structure.
    long_window = window * 3
    for col in ["observed_speed_mps", "turn_rate_abs", "accel_abs", "observed_vz_mps"]:
        roll = d.groupby(TRACK_KEYS, sort=False, observed=True)[col].rolling(long_window, min_periods=5)
        d[f"{col}_long_mean"] = roll.mean().reset_index(level=TRACK_KEYS, drop=True)
        d[f"{col}_long_std"] = roll.std().reset_index(level=TRACK_KEYS, drop=True).fillna(0.0)
        d[f"{col}_long_max"] = roll.max().reset_index(level=TRACK_KEYS, drop=True)
        d[f"{col}_long_min"] = roll.min().reset_index(level=TRACK_KEYS, drop=True)
    d["speed_cv_long"] = (d.observed_speed_mps_long_std / d.observed_speed_mps_long_mean.clip(lower=.5)).clip(0, 5)
    d["speed_range_long"] = d.observed_speed_mps_long_max - d.observed_speed_mps_long_min
    d["turn_peak_long"] = d.turn_rate_abs_long_max
    d["accel_peak_long"] = d.accel_abs_long_max
    d["track_age_s"] = (d.timestamp_s - g.timestamp_s.transform("min")).clip(0, 120)
    for lag in (8, 20):
        elapsed = (d.timestamp_s - g.timestamp_s.shift(lag)).clip(lower=.1)
        d[f"stable_vx_{lag}"] = ((d.observed_x_m - g.observed_x_m.shift(lag)) / elapsed).fillna(d.observed_vx_mps)
        d[f"stable_vy_{lag}"] = ((d.observed_y_m - g.observed_y_m.shift(lag)) / elapsed).fillna(d.observed_vy_mps)
    d["quality"] = (
        d.track_confidence.clip(0, 1)
        * d.identity_confidence.clip(0, 1)
        * np.exp(-d.sensor_age_s.clip(lower=0) / 2.0)
    ).clip(0, 1)
    keep = ROW_KEYS + [
        "observed_x_m", "observed_y_m", "observed_z_m", "observed_vx_mps",
        "observed_vy_mps", "observed_vz_mps", "observed_speed_mps",
        "track_confidence", "identity_confidence", "sensor_age_s", "quality",
        "observed_speed_mps_mean", "observed_speed_mps_std",
        "turn_rate_abs_mean", "turn_rate_abs_std", "accel_abs_mean", "accel_abs_std",
        "observed_z_m_std", "observed_vz_mps_std", "path_efficiency",
        "heading_coherence", "track_age_s", "speed_cv_long", "speed_range_long",
        "turn_rate_abs_long_mean", "turn_rate_abs_long_std", "turn_peak_long",
        "accel_abs_long_mean", "accel_abs_long_std", "accel_peak_long",
        "observed_vz_mps_long_std",
        "stable_vx_8", "stable_vy_8", "stable_vx_20", "stable_vy_20",
    ]
    return d[keep].replace([np.inf, -np.inf], np.nan).fillna(0.0)


def relation_features(track: pd.DataFrame, template: pd.DataFrame, assets: pd.DataFrame) -> pd.DataFrame:
    """Create per-track/per-asset geometry using only observed state and published boundaries."""
    keys = ROW_KEYS + ["asset_id"]
    d = template[keys].merge(track, on=ROW_KEYS, how="left", validate="many_to_one")
    a = assets[["scenario_id", "asset_id", "x_m", "y_m", "protected_radius_m", "wider_monitoring_radius_m"]]
    d = d.merge(a, on=["scenario_id", "asset_id"], how="left", validate="many_to_one")
    # Sampling may scramble input rows. Temporal derivatives must always be causal
    # and chronological within a track–asset pair.
    d = d.sort_values(["scenario_id", "fused_track_id", "asset_id", "timestamp_s"]).reset_index(drop=True)
    rx = d.observed_x_m - d.x_m
    ry = d.observed_y_m - d.y_m
    distance = np.hypot(rx, ry).clip(lower=1.0)
    radial_raw = (rx * d.observed_vx_mps + ry * d.observed_vy_mps) / distance
    radial_8 = (rx * d.stable_vx_8 + ry * d.stable_vy_8) / distance
    radial_20 = (rx * d.stable_vx_20 + ry * d.stable_vy_20) / distance
    pair_keys = ["scenario_id", "fused_track_id", "asset_id"]
    pair = d.groupby(pair_keys, sort=False, observed=True)
    dt = pair.timestamp_s.diff().clip(lower=.05, upper=2)
    radial_distance = (pd.Series(distance, index=d.index).groupby([d[k] for k in pair_keys], sort=False).diff() / dt).fillna(radial_8)
    d["radial_distance_raw"] = radial_distance
    d["radial_distance_5s"] = d.groupby(pair_keys, sort=False, observed=True).radial_distance_raw.rolling(10, min_periods=2).mean().reset_index(level=pair_keys, drop=True).fillna(d.radial_distance_raw)
    d["radial_distance_15s"] = d.groupby(pair_keys, sort=False, observed=True).radial_distance_raw.rolling(30, min_periods=3).mean().reset_index(level=pair_keys, drop=True).fillna(d.radial_distance_raw)
    radial = d.radial_distance_5s
    speed = np.hypot(d.stable_vx_8, d.stable_vy_8).clip(lower=0.1)
    closing = (-radial).clip(lower=0)
    boundary = distance - d.protected_radius_m
    d["distance_m"] = distance
    d["boundary_distance_m"] = boundary
    d["radial_velocity_mps"] = radial
    d["closing_speed_mps"] = closing
    d["radial_velocity_raw_mps"] = radial_raw
    d["radial_velocity_8_mps"] = radial_8
    d["radial_velocity_20_mps"] = radial_20
    d["alignment_cos"] = (-(rx * d.stable_vx_8 + ry * d.stable_vy_8) / (distance * speed)).clip(-1, 1)
    d["eta_point_s"] = np.where(closing > 0.2, boundary.clip(lower=0) / closing, 3600.0).clip(0, 3600)
    d["inside_monitoring"] = (distance <= d.wider_monitoring_radius_m).astype(float)
    feature_cols = [c for c in track.columns if c not in ROW_KEYS] + [
        "distance_m", "boundary_distance_m", "radial_velocity_mps", "closing_speed_mps",
        "alignment_cos", "eta_point_s", "inside_monitoring", "protected_radius_m",
        "wider_monitoring_radius_m", "radial_velocity_raw_mps", "radial_velocity_8_mps",
        "radial_velocity_20_mps", "radial_distance_5s", "radial_distance_15s",
    ]
    return d[keys + feature_cols].replace([np.inf, -np.inf], np.nan).fillna(0.0)


def group_features(track: pd.DataFrame, bin_s: float = 1.0) -> pd.DataFrame:
    """Infer causal group geometry from contemporaneous observed tracks."""
    cols = ROW_KEYS + ["neighbor_count", "nearest_distance_m", "velocity_alignment", "expansion_rate_mps"]
    base = track[ROW_KEYS + ["observed_x_m", "observed_y_m", "stable_vx_8", "stable_vy_8"]].copy()
    base["time_bin"] = np.floor(base.timestamp_s / bin_s).astype(int)
    rows: list[tuple] = []
    for (sid, _), g in base.groupby(["scenario_id", "time_bin"], sort=False, observed=True):
        pos = g[["observed_x_m", "observed_y_m"]].to_numpy(float)
        vel = g[["stable_vx_8", "stable_vy_8"]].to_numpy(float)
        n = len(g)
        for j, row in enumerate(g.itertuples(index=False)):
            if n == 1:
                rows.append((row.scenario_id, row.timestamp_s, row.fused_track_id, 0.0, 9999.0, 0.0, 0.0))
                continue
            delta = pos - pos[j]
            dist = np.hypot(delta[:, 0], delta[:, 1]); dist[j] = np.inf
            near = (dist < 350.0)
            idx = np.where(near)[0]
            nearest = float(np.min(dist))
            if len(idx):
                s0 = max(np.linalg.norm(vel[j]), 0.1)
                sj = np.maximum(np.linalg.norm(vel[idx], axis=1), 0.1)
                align = float(np.mean((vel[idx] @ vel[j]) / (sj * s0)))
                unit = delta[idx] / np.maximum(dist[idx, None], 1.0)
                expansion = float(np.mean(np.sum((vel[idx] - vel[j]) * unit, axis=1)))
            else:
                align, expansion = 0.0, 0.0
            rows.append((row.scenario_id, row.timestamp_s, row.fused_track_id, float(len(idx)), nearest, align, expansion))
    return pd.DataFrame(rows, columns=cols)
