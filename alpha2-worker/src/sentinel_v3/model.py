from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator

from .features import ROW_KEYS, track_features, relation_features, group_features

MOTION_FEATURES = [
    "observed_speed_mps_mean", "observed_speed_mps_std", "turn_rate_abs_mean",
    "turn_rate_abs_std", "accel_abs_mean", "accel_abs_std", "observed_z_m_std",
    "observed_vz_mps_std", "path_efficiency", "heading_coherence", "track_age_s",
    "track_confidence", "identity_confidence", "sensor_age_s", "quality",
    "speed_cv_long", "speed_range_long", "turn_rate_abs_long_mean",
    "turn_rate_abs_long_std", "turn_peak_long", "accel_abs_long_mean",
    "accel_abs_long_std", "accel_peak_long", "observed_vz_mps_long_std",
]
RELATION_FEATURES = [
    "distance_m", "boundary_distance_m", "radial_velocity_mps", "closing_speed_mps",
    "alignment_cos", "eta_point_s", "inside_monitoring", "protected_radius_m",
    "wider_monitoring_radius_m", "observed_speed_mps_mean", "turn_rate_abs_mean",
    "path_efficiency", "quality", "radial_velocity_raw_mps", "radial_velocity_8_mps",
    "radial_velocity_20_mps", "radial_distance_5s", "radial_distance_15s",
]


def _classifier(seed: int) -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        learning_rate=0.08, max_iter=140, max_leaf_nodes=31, min_samples_leaf=40,
        l2_regularization=1.0, class_weight=None, early_stopping=False,
        random_state=seed,
    )


def _fit_calibrated(x_train, y_train, x_cal, y_cal, seed: int):
    base = _classifier(seed).fit(x_train, y_train)
    return CalibratedClassifierCV(FrozenEstimator(base), method="sigmoid").fit(x_cal, y_cal)


def _balanced_sample(frame: pd.DataFrame, label: str, limit_per_class: int, seed: int) -> pd.DataFrame:
    """Reduce adjacent-frame redundancy while retaining every rare-class row."""
    pieces = []
    for _, group in frame.groupby(label, sort=False, observed=True):
        if len(group) > limit_per_class:
            group = group.sample(limit_per_class, random_state=seed)
        pieces.append(group)
    return pd.concat(pieces, ignore_index=True)


def _natural_sample(frame: pd.DataFrame, limit: int, seed: int) -> pd.DataFrame:
    """Bound memory without changing the empirical calibration distribution."""
    return frame.sample(limit, random_state=seed) if len(frame) > limit else frame.copy()


@dataclass
class SentinelV3:
    motion_model: object
    relation_model: object
    irregular_threshold: float = 1.0
    approaching_threshold: float = 1.0
    version: str = "3.0.0-alpha.2"

    @classmethod
    def fit(cls, root: Path, train_ids: set[str], calibration_ids: set[str], seed: int = 73) -> "SentinelV3":
        fused = pd.read_parquet(root / "fused_tracks.parquet")
        assets = pd.read_parquet(root / "assets.parquet")
        labels = pd.read_parquet(root / "truth" / "evaluation_labels.parquet")
        track = track_features(fused)
        motion_truth = labels.drop_duplicates(ROW_KEYS)[ROW_KEYS + ["truth_motion_state"]]
        motion_train_truth = _balanced_sample(motion_truth[motion_truth.scenario_id.isin(train_ids)], "truth_motion_state", 120_000, seed)
        motion_cal_truth = _natural_sample(motion_truth[motion_truth.scenario_id.isin(calibration_ids)], 200_000, seed + 10)
        m_train = track.merge(motion_train_truth, on=ROW_KEYS, how="inner", validate="one_to_one")
        m_cal = track.merge(motion_cal_truth, on=ROW_KEYS, how="inner", validate="one_to_one")
        motion = _fit_calibrated(m_train[MOTION_FEATURES], m_train["truth_motion_state"], m_cal[MOTION_FEATURES], m_cal["truth_motion_state"], seed)
        mp = motion.predict_proba(m_cal[MOTION_FEATURES])
        irregular_i = list(motion.classes_).index("irregular")
        irregular_truth = m_cal["truth_motion_state"].eq("irregular").to_numpy()
        best_irregular, best_f1 = 1.0, -1.0
        for threshold in np.arange(.10, .61, .025):
            chosen = mp[:, irregular_i] >= threshold
            tp = np.sum(chosen & irregular_truth); fp = np.sum(chosen & ~irregular_truth); fn = np.sum(~chosen & irregular_truth)
            f1 = 2 * tp / max(2 * tp + fp + fn, 1)
            if f1 > best_f1: best_irregular, best_f1 = float(threshold), float(f1)

        relation_truth = labels[ROW_KEYS + ["asset_id", "truth_asset_relation"]]
        relation_train_truth = _balanced_sample(relation_truth[relation_truth.scenario_id.isin(train_ids)], "truth_asset_relation", 160_000, seed + 20)
        relation_cal_truth = _natural_sample(relation_truth[relation_truth.scenario_id.isin(calibration_ids)], 300_000, seed + 30)
        relation_train = relation_features(track, relation_train_truth[ROW_KEYS + ["asset_id"]], assets).merge(relation_train_truth, on=ROW_KEYS + ["asset_id"], validate="one_to_one")
        relation_cal = relation_features(track, relation_cal_truth[ROW_KEYS + ["asset_id"]], assets).merge(relation_cal_truth, on=ROW_KEYS + ["asset_id"], validate="one_to_one")
        relation_model = _fit_calibrated(relation_train[RELATION_FEATURES], relation_train["truth_asset_relation"], relation_cal[RELATION_FEATURES], relation_cal["truth_asset_relation"], seed + 1)
        rp = relation_model.predict_proba(relation_cal[RELATION_FEATURES])
        approach_i = list(relation_model.classes_).index("approaching")
        approach_truth = relation_cal["truth_asset_relation"].eq("approaching").to_numpy()
        crossing_truth = relation_cal["truth_asset_relation"].eq("crossing").to_numpy()
        best_approach, best_recall = 1.0, -1.0
        for threshold in np.arange(.05, .61, .01):
            chosen = rp[:, approach_i] >= threshold
            recall = np.mean(chosen[approach_truth]) if approach_truth.any() else 0.0
            crossing_fpr = np.mean(chosen[crossing_truth]) if crossing_truth.any() else 0.0
            if crossing_fpr <= .05 and recall > best_recall:
                best_approach, best_recall = float(threshold), float(recall)
        return cls(motion, relation_model, best_irregular, best_approach)

    @classmethod
    def fit_separate(cls, development_root: Path, calibration_root: Path, calibration_ids: set[str], seed: int = 73) -> "SentinelV3":
        """Fit on every development scenario and calibrate on disjoint validation scenarios."""
        dfused = pd.read_parquet(development_root / "fused_tracks.parquet")
        dassets = pd.read_parquet(development_root / "assets.parquet")
        dlabels = pd.read_parquet(development_root / "truth" / "evaluation_labels.parquet")
        dtrack = track_features(dfused)
        cfused = pd.read_parquet(calibration_root / "fused_tracks.parquet")
        cassets = pd.read_parquet(calibration_root / "assets.parquet")
        clabels = pd.read_parquet(calibration_root / "truth" / "evaluation_labels.parquet")
        ctrack = track_features(cfused)

        dmt = dlabels.drop_duplicates(ROW_KEYS)[ROW_KEYS + ["truth_motion_state"]]
        cmt = clabels.drop_duplicates(ROW_KEYS)[ROW_KEYS + ["truth_motion_state"]]
        dmt = _balanced_sample(dmt, "truth_motion_state", 500_000, seed)
        cmt = _natural_sample(cmt[cmt.scenario_id.isin(calibration_ids)], 200_000, seed + 10)
        m_train = dtrack.merge(dmt, on=ROW_KEYS, how="inner", validate="one_to_one")
        m_cal = ctrack.merge(cmt, on=ROW_KEYS, how="inner", validate="one_to_one")
        motion = _fit_calibrated(m_train[MOTION_FEATURES], m_train.truth_motion_state, m_cal[MOTION_FEATURES], m_cal.truth_motion_state, seed)
        mp = motion.predict_proba(m_cal[MOTION_FEATURES])
        ii = list(motion.classes_).index("irregular"); truth = m_cal.truth_motion_state.eq("irregular").to_numpy()
        best_irregular, best_f1 = 1.0, -1.0
        for threshold in np.arange(.10, .61, .025):
            chosen = mp[:, ii] >= threshold
            tp = np.sum(chosen & truth); fp = np.sum(chosen & ~truth); fn = np.sum(~chosen & truth)
            f1 = 2 * tp / max(2 * tp + fp + fn, 1)
            if f1 > best_f1: best_irregular, best_f1 = float(threshold), float(f1)

        keys = ROW_KEYS + ["asset_id"]
        drt = _balanced_sample(dlabels[keys + ["truth_asset_relation"]], "truth_asset_relation", 600_000, seed + 20)
        crt = _natural_sample(clabels.loc[clabels.scenario_id.isin(calibration_ids), keys + ["truth_asset_relation"]], 300_000, seed + 30)
        r_train = relation_features(dtrack, drt[keys], dassets).merge(drt, on=keys, validate="one_to_one")
        r_cal = relation_features(ctrack, crt[keys], cassets).merge(crt, on=keys, validate="one_to_one")
        relation_model = _fit_calibrated(r_train[RELATION_FEATURES], r_train.truth_asset_relation, r_cal[RELATION_FEATURES], r_cal.truth_asset_relation, seed + 1)
        rp = relation_model.predict_proba(r_cal[RELATION_FEATURES])
        ai = list(relation_model.classes_).index("approaching")
        approaching = r_cal.truth_asset_relation.eq("approaching").to_numpy(); crossing = r_cal.truth_asset_relation.eq("crossing").to_numpy()
        best_approach, best_recall = 1.0, -1.0
        for threshold in np.arange(.05, .61, .01):
            chosen = rp[:, ai] >= threshold
            recall = np.mean(chosen[approaching]) if approaching.any() else 0.0
            crossing_fpr = np.mean(chosen[crossing]) if crossing.any() else 0.0
            if crossing_fpr <= .05 and recall > best_recall:
                best_approach, best_recall = float(threshold), float(recall)
        return cls(motion, relation_model, best_irregular, best_approach, version="3.0.0-alpha.2")

    def predict(self, root: Path, scenario_ids: set[str] | None = None) -> pd.DataFrame:
        fused = pd.read_parquet(root / "fused_tracks.parquet")
        template = pd.read_parquet(root / "prediction_template.parquet")
        assets = pd.read_parquet(root / "assets.parquet")
        if scenario_ids is not None:
            fused = fused[fused.scenario_id.isin(scenario_ids)]
            template = template[template.scenario_id.isin(scenario_ids)]
            assets = assets[assets.scenario_id.isin(scenario_ids)]
        track = track_features(fused)
        mp = self.motion_model.predict_proba(track[MOTION_FEATURES]); mi = mp.argmax(axis=1)
        motion_out = track[ROW_KEYS].copy()
        motion_out["predicted_motion"] = self.motion_model.classes_[mi]
        irregular_i = list(self.motion_model.classes_).index("irregular")
        motion_out.loc[mp[:, irregular_i] >= self.irregular_threshold, "predicted_motion"] = "irregular"
        motion_out["motion_confidence"] = mp.max(axis=1) * track.quality.to_numpy()

        relation = relation_features(track, template, assets)
        rp = self.relation_model.predict_proba(relation[RELATION_FEATURES]); ri = rp.argmax(axis=1)
        out = relation[ROW_KEYS + ["asset_id"]].merge(motion_out, on=ROW_KEYS, validate="many_to_one")
        out["predicted_asset_relation"] = self.relation_model.classes_[ri]
        approach_i = list(self.relation_model.classes_).index("approaching")
        out.loc[rp[:, approach_i] >= self.approaching_threshold, "predicted_asset_relation"] = "approaching"
        out["asset_relation_confidence"] = rp.max(axis=1) * relation.quality.to_numpy()
        out["estimated_eta_s"] = np.where(out.predicted_asset_relation.eq("approaching"), relation.eta_point_s, np.nan)

        gf = group_features(track)
        coord = np.full(len(gf), "independent", dtype=object)
        enough = gf.neighbor_count >= 1
        coherent = enough & (gf.velocity_alignment >= 0.75)
        coord[coherent & (gf.expansion_rate_mps.abs() < 1.5)] = "coordinated"
        coord[coherent & (gf.expansion_rate_mps >= 1.5)] = "splitting"
        coord[coherent & (gf.expansion_rate_mps <= -1.5)] = "merging"
        gf["predicted_coordination"] = coord
        gf["coordination_confidence"] = np.where(enough, np.clip((gf.velocity_alignment + 1) / 2, .35, .95), .75)
        gf["predicted_group_id"] = None
        out = out.merge(gf[ROW_KEYS + ["predicted_coordination", "coordination_confidence", "predicted_group_id"]], on=ROW_KEYS, how="left", validate="many_to_one")
        out["model_version"] = self.version
        return out

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)

    @classmethod
    def load(cls, path: Path) -> "SentinelV3":
        return joblib.load(path)
