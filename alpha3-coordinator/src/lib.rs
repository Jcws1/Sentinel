//! Alpha.3 temporal coordination reference.
//!
//! This crate assesses coordination only. It does not command or execute
//! countermeasures. Consumers must apply mission-epoch, revision, freshness,
//! feasibility and operator-confirmation gates before task execution.

use std::collections::{BTreeMap, BTreeSet, VecDeque};

#[derive(Clone, Debug, PartialEq)]
pub struct TrackSample {
    pub track_id: String,
    pub mission_epoch: u64,
    pub revision: u64,
    pub timestamp_ms: u64,
    pub position_m: [f64; 3],
    pub velocity_mps: [f64; 3],
    pub confidence: f64,
    pub target_asset_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub history_window_ms: u64,
    pub candidate_distance_m: f64,
    pub candidate_altitude_m: f64,
    pub minimum_track_confidence: f64,
    pub edge_enter_threshold: f64,
    pub edge_exit_threshold: f64,
    pub edge_enter_duration_ms: u64,
    pub edge_exit_duration_ms: u64,
    pub group_confirm_duration_ms: u64,
    pub dropout_grace_ms: u64,
    pub minimum_group_size: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            history_window_ms: 15_000,
            candidate_distance_m: 250.0,
            candidate_altitude_m: 100.0,
            minimum_track_confidence: 0.5,
            edge_enter_threshold: 0.72,
            edge_exit_threshold: 0.48,
            edge_enter_duration_ms: 1_500,
            edge_exit_duration_ms: 2_000,
            group_confirm_duration_ms: 2_000,
            dropout_grace_ms: 3_000,
            minimum_group_size: 2,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct PairEvidence {
    pub distance_stability: f64,
    pub velocity_alignment: f64,
    pub heading_alignment: f64,
    pub synchronized_acceleration: f64,
    pub common_target: f64,
    pub sustained_similarity: f64,
    pub crossing_penalty: f64,
    pub quality_penalty: f64,
    pub score: f64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GroupState {
    Forming,
    Coordinated,
    Splitting,
    Merging,
    Dissolved,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ThreatGroup {
    pub group_id: u64,
    pub mission_epoch: u64,
    pub revision: u64,
    pub state: GroupState,
    pub confidence: f64,
    pub member_track_ids: BTreeSet<String>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EventKind {
    GroupFormed,
    GroupConfirmed,
    GroupSplit,
    GroupsMerged,
    GroupDissolved,
    MembershipChanged,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CoordinationEvent {
    pub kind: EventKind,
    pub mission_epoch: u64,
    pub group_id: u64,
    pub group_revision: u64,
    pub timestamp_ms: u64,
    pub member_track_ids: BTreeSet<String>,
    pub related_group_ids: Vec<u64>,
    pub reason_codes: Vec<&'static str>,
}

#[derive(Clone, Debug)]
struct TrackHistory {
    latest_revision: u64,
    samples: VecDeque<TrackSample>,
}

#[derive(Clone, Debug, Default)]
struct EdgeState {
    active: bool,
    above_since_ms: Option<u64>,
    below_since_ms: Option<u64>,
    score: f64,
}

#[derive(Clone, Debug)]
pub struct CoordinationSnapshot {
    pub timestamp_ms: u64,
    pub groups: Vec<ThreatGroup>,
    pub events: Vec<CoordinationEvent>,
    pub pair_evidence: BTreeMap<(String, String), PairEvidence>,
}

pub struct Coordinator {
    config: Config,
    mission_epoch: u64,
    histories: BTreeMap<String, TrackHistory>,
    edges: BTreeMap<(String, String), EdgeState>,
    groups: BTreeMap<u64, ThreatGroup>,
    next_group_id: u64,
}

impl Coordinator {
    pub fn new(config: Config, mission_epoch: u64) -> Self {
        assert!(config.edge_enter_threshold > config.edge_exit_threshold);
        assert!(config.minimum_group_size >= 2);
        Self {
            config,
            mission_epoch,
            histories: BTreeMap::new(),
            edges: BTreeMap::new(),
            groups: BTreeMap::new(),
            next_group_id: 1,
        }
    }

    pub fn mission_epoch(&self) -> u64 {
        self.mission_epoch
    }

    pub fn reset_epoch(&mut self, mission_epoch: u64) {
        self.mission_epoch = mission_epoch;
        self.histories.clear();
        self.edges.clear();
        self.groups.clear();
        self.next_group_id = 1;
    }

    /// Returns false for stale epochs or non-monotonic revisions.
    pub fn ingest(&mut self, sample: TrackSample) -> bool {
        if sample.mission_epoch != self.mission_epoch || !finite_sample(&sample) {
            return false;
        }
        let history = self
            .histories
            .entry(sample.track_id.clone())
            .or_insert_with(|| TrackHistory {
                latest_revision: 0,
                samples: VecDeque::new(),
            });
        if !history.samples.is_empty() && sample.revision <= history.latest_revision {
            return false;
        }
        history.latest_revision = sample.revision;
        let cutoff = sample
            .timestamp_ms
            .saturating_sub(self.config.history_window_ms);
        history.samples.push_back(sample);
        while history
            .samples
            .front()
            .is_some_and(|value| value.timestamp_ms < cutoff)
        {
            history.samples.pop_front();
        }
        true
    }

    pub fn assess(&mut self, now_ms: u64) -> CoordinationSnapshot {
        self.expire_histories(now_ms);
        let ids: Vec<String> = self.histories.keys().cloned().collect();
        let mut evidence_map = BTreeMap::new();
        let mut candidate_keys = BTreeSet::new();

        for (index, left) in ids.iter().enumerate() {
            for right in ids.iter().skip(index + 1) {
                let key = ordered_pair(left, right);
                if let Some(evidence) = self.pair_evidence(left, right, now_ms) {
                    candidate_keys.insert(key.clone());
                    evidence_map.insert(key, evidence);
                }
            }
        }

        let known_edges: Vec<(String, String)> = self.edges.keys().cloned().collect();
        for key in known_edges {
            if !candidate_keys.contains(&key) {
                self.update_edge(&key, 0.0, now_ms);
            }
        }
        for (key, evidence) in &evidence_map {
            self.update_edge(key, evidence.score, now_ms);
        }

        let components = self.active_components(&ids);
        let events = self.update_groups(components, now_ms);
        let groups = self
            .groups
            .values()
            .filter(|group| group.state != GroupState::Dissolved)
            .cloned()
            .collect();

        CoordinationSnapshot {
            timestamp_ms: now_ms,
            groups,
            events,
            pair_evidence: evidence_map,
        }
    }

    fn expire_histories(&mut self, now_ms: u64) {
        let grace = self.config.dropout_grace_ms;
        self.histories.retain(|_, history| {
            history
                .samples
                .back()
                .is_some_and(|sample| now_ms.saturating_sub(sample.timestamp_ms) <= grace)
        });
    }

    fn pair_evidence(&self, left: &str, right: &str, now_ms: u64) -> Option<PairEvidence> {
        let a = self.histories.get(left)?;
        let b = self.histories.get(right)?;
        let latest_a = a.samples.back()?;
        let latest_b = b.samples.back()?;
        let delta = sub(latest_a.position_m, latest_b.position_m);
        let distance = norm(delta);
        if distance > self.config.candidate_distance_m
            || delta[2].abs() > self.config.candidate_altitude_m
        {
            return None;
        }

        let velocity_alignment = cosine01(latest_a.velocity_mps, latest_b.velocity_mps);
        let heading_alignment = velocity_alignment;
        let distances = aligned_distances(&a.samples, &b.samples, 300);
        let distance_stability = stability_score(&distances, self.config.candidate_distance_m);
        let synchronized_acceleration = acceleration_similarity(&a.samples, &b.samples);
        let common_target = match (&latest_a.target_asset_id, &latest_b.target_asset_id) {
            (Some(x), Some(y)) if x == y => 1.0,
            _ => 0.0,
        };
        let duration = distances
            .first()
            .map(|(timestamp, _)| now_ms.saturating_sub(*timestamp))
            .unwrap_or(0);
        let sustained_similarity =
            (duration as f64 / 4_000.0).clamp(0.0, 1.0) * distance_stability * velocity_alignment;
        let crossing_penalty = crossing_penalty(latest_a, latest_b, distance_stability);
        let minimum_quality = latest_a.confidence.min(latest_b.confidence);
        let quality_penalty = if minimum_quality < self.config.minimum_track_confidence {
            1.0
        } else {
            1.0 - minimum_quality.clamp(0.0, 1.0)
        };

        // Proximity is deliberately absent. Stable relative geometry and sustained
        // common motion are the primary evidence; crossing and poor data dominate.
        let score = (0.25 * distance_stability
            + 0.20 * velocity_alignment
            + 0.10 * heading_alignment
            + 0.10 * synchronized_acceleration
            + 0.10 * common_target
            + 0.25 * sustained_similarity
            - 0.45 * crossing_penalty
            - 0.20 * quality_penalty)
            .clamp(0.0, 1.0);

        Some(PairEvidence {
            distance_stability,
            velocity_alignment,
            heading_alignment,
            synchronized_acceleration,
            common_target,
            sustained_similarity,
            crossing_penalty,
            quality_penalty,
            score,
        })
    }

    fn update_edge(&mut self, key: &(String, String), score: f64, now_ms: u64) {
        let edge = self.edges.entry(key.clone()).or_default();
        edge.score = score;
        if edge.active {
            if score < self.config.edge_exit_threshold {
                let since = *edge.below_since_ms.get_or_insert(now_ms);
                if now_ms.saturating_sub(since) >= self.config.edge_exit_duration_ms {
                    edge.active = false;
                    edge.above_since_ms = None;
                }
            } else {
                edge.below_since_ms = None;
            }
        } else if score >= self.config.edge_enter_threshold {
            let since = *edge.above_since_ms.get_or_insert(now_ms);
            if now_ms.saturating_sub(since) >= self.config.edge_enter_duration_ms {
                edge.active = true;
                edge.below_since_ms = None;
            }
        } else {
            edge.above_since_ms = None;
        }
    }

    fn active_components(&self, ids: &[String]) -> Vec<BTreeSet<String>> {
        let mut adjacency: BTreeMap<String, BTreeSet<String>> = ids
            .iter()
            .cloned()
            .map(|id| (id, BTreeSet::new()))
            .collect();
        for ((left, right), edge) in &self.edges {
            if edge.active && adjacency.contains_key(left) && adjacency.contains_key(right) {
                adjacency.get_mut(left).unwrap().insert(right.clone());
                adjacency.get_mut(right).unwrap().insert(left.clone());
            }
        }
        let mut visited = BTreeSet::new();
        let mut components = Vec::new();
        for id in ids {
            if visited.contains(id) {
                continue;
            }
            let mut stack = vec![id.clone()];
            let mut component = BTreeSet::new();
            while let Some(current) = stack.pop() {
                if !visited.insert(current.clone()) {
                    continue;
                }
                component.insert(current.clone());
                if let Some(neighbours) = adjacency.get(&current) {
                    stack.extend(neighbours.iter().rev().cloned());
                }
            }
            if component.len() >= self.config.minimum_group_size {
                components.push(component);
            }
        }
        components.sort();
        components
    }

    fn update_groups(
        &mut self,
        components: Vec<BTreeSet<String>>,
        now_ms: u64,
    ) -> Vec<CoordinationEvent> {
        let previous: Vec<ThreatGroup> = self
            .groups
            .values()
            .filter(|group| group.state != GroupState::Dissolved)
            .cloned()
            .collect();
        let mut claimed_previous = BTreeSet::new();
        let mut next = BTreeMap::new();
        let mut events = Vec::new();

        for component in components {
            let overlaps: Vec<&ThreatGroup> = previous
                .iter()
                .filter(|group| !group.member_track_ids.is_disjoint(&component))
                .collect();
            let best = overlaps.iter().max_by(|a, b| {
                overlap_score(&a.member_track_ids, &component)
                    .total_cmp(&overlap_score(&b.member_track_ids, &component))
            });

            if let Some(previous_group) = best {
                claimed_previous.insert(previous_group.group_id);
                let mut group = (*previous_group).clone();
                let membership_changed = group.member_track_ids != component;
                group.updated_at_ms = now_ms;
                if membership_changed {
                    group.revision += 1;
                    group.member_track_ids = component.clone();
                }
                if overlaps.len() > 1 {
                    group.state = GroupState::Merging;
                    events.push(event(
                        EventKind::GroupsMerged,
                        &group,
                        now_ms,
                        overlaps.iter().map(|value| value.group_id).collect(),
                        vec!["MULTIPLE_PREVIOUS_GROUPS_OVERLAP"],
                    ));
                } else if membership_changed {
                    events.push(event(
                        EventKind::MembershipChanged,
                        &group,
                        now_ms,
                        vec![previous_group.group_id],
                        vec!["PERSISTENT_COMPONENT_CHANGED"],
                    ));
                }
                if group.state == GroupState::Forming
                    && now_ms.saturating_sub(group.created_at_ms)
                        >= self.config.group_confirm_duration_ms
                {
                    group.state = GroupState::Coordinated;
                    group.revision += 1;
                    events.push(event(
                        EventKind::GroupConfirmed,
                        &group,
                        now_ms,
                        vec![],
                        vec!["SUSTAINED_GROUP_EVIDENCE"],
                    ));
                } else if matches!(group.state, GroupState::Merging | GroupState::Splitting)
                    && !membership_changed
                {
                    group.state = GroupState::Coordinated;
                    group.revision += 1;
                }
                group.confidence = self.group_confidence(&component);
                next.insert(group.group_id, group);
            } else {
                // Formation evidence starts when the component's active edges first
                // crossed the enter threshold, not when hysteresis finally exposed
                // the component. Otherwise the enter and confirmation durations are
                // accidentally applied serially and stable groups remain `Forming`
                // longer than the configured confirmation interval.
                let created_at_ms = self.component_evidence_since(&component, now_ms);
                let group = ThreatGroup {
                    group_id: self.next_group_id,
                    mission_epoch: self.mission_epoch,
                    revision: 1,
                    state: GroupState::Forming,
                    confidence: self.group_confidence(&component),
                    member_track_ids: component,
                    created_at_ms,
                    updated_at_ms: now_ms,
                };
                self.next_group_id += 1;
                events.push(event(
                    EventKind::GroupFormed,
                    &group,
                    now_ms,
                    vec![],
                    vec!["NEW_PERSISTENT_COMPONENT"],
                ));
                next.insert(group.group_id, group);
            }
        }

        for old in previous {
            if claimed_previous.contains(&old.group_id) {
                continue;
            }
            let descendants: Vec<u64> = next
                .values()
                .filter(|group| !group.member_track_ids.is_disjoint(&old.member_track_ids))
                .map(|group| group.group_id)
                .collect();
            let mut dissolved = old.clone();
            dissolved.revision += 1;
            dissolved.updated_at_ms = now_ms;
            dissolved.state = if descendants.len() > 1 {
                GroupState::Splitting
            } else {
                GroupState::Dissolved
            };
            events.push(event(
                if descendants.len() > 1 {
                    EventKind::GroupSplit
                } else {
                    EventKind::GroupDissolved
                },
                &dissolved,
                now_ms,
                descendants,
                vec![if dissolved.state == GroupState::Splitting {
                    "COMPONENT_DIVIDED"
                } else {
                    "NO_ACTIVE_COMPONENT"
                }],
            ));
        }

        self.groups = next;
        events
    }

    fn group_confidence(&self, members: &BTreeSet<String>) -> f64 {
        let mut total = 0.0;
        let mut count = 0usize;
        let ids: Vec<&String> = members.iter().collect();
        for (index, left) in ids.iter().enumerate() {
            for right in ids.iter().skip(index + 1) {
                if let Some(edge) = self.edges.get(&ordered_pair(left, right)) {
                    total += edge.score;
                    count += 1;
                }
            }
        }
        if count == 0 {
            0.0
        } else {
            total / count as f64
        }
    }

    fn component_evidence_since(&self, members: &BTreeSet<String>, fallback_ms: u64) -> u64 {
        self.edges
            .iter()
            .filter(|((left, right), edge)| {
                edge.active && members.contains(left) && members.contains(right)
            })
            .filter_map(|(_, edge)| edge.above_since_ms)
            .min()
            .unwrap_or(fallback_ms)
    }
}

fn event(
    kind: EventKind,
    group: &ThreatGroup,
    timestamp_ms: u64,
    related_group_ids: Vec<u64>,
    reason_codes: Vec<&'static str>,
) -> CoordinationEvent {
    CoordinationEvent {
        kind,
        mission_epoch: group.mission_epoch,
        group_id: group.group_id,
        group_revision: group.revision,
        timestamp_ms,
        member_track_ids: group.member_track_ids.clone(),
        related_group_ids,
        reason_codes,
    }
}

fn ordered_pair(left: &str, right: &str) -> (String, String) {
    if left <= right {
        (left.to_owned(), right.to_owned())
    } else {
        (right.to_owned(), left.to_owned())
    }
}

fn finite_sample(sample: &TrackSample) -> bool {
    sample.confidence.is_finite()
        && sample.position_m.iter().all(|value| value.is_finite())
        && sample.velocity_mps.iter().all(|value| value.is_finite())
}

fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn norm(value: [f64; 3]) -> f64 {
    dot(value, value).sqrt()
}

fn cosine01(a: [f64; 3], b: [f64; 3]) -> f64 {
    let denominator = norm(a) * norm(b);
    if denominator < 1e-6 {
        0.5
    } else {
        ((dot(a, b) / denominator) + 1.0) * 0.5
    }
}

fn aligned_distances(
    a: &VecDeque<TrackSample>,
    b: &VecDeque<TrackSample>,
    tolerance_ms: u64,
) -> Vec<(u64, f64)> {
    let mut result = Vec::new();
    for left in a {
        if let Some(right) = b
            .iter()
            .min_by_key(|right| left.timestamp_ms.abs_diff(right.timestamp_ms))
        {
            if left.timestamp_ms.abs_diff(right.timestamp_ms) <= tolerance_ms {
                result.push((
                    left.timestamp_ms.max(right.timestamp_ms),
                    norm(sub(left.position_m, right.position_m)),
                ));
            }
        }
    }
    result.sort_by_key(|value| value.0);
    result
}

fn stability_score(values: &[(u64, f64)], scale: f64) -> f64 {
    if values.len() < 3 {
        return 0.0;
    }
    let mean = values.iter().map(|value| value.1).sum::<f64>() / values.len() as f64;
    let variance = values
        .iter()
        .map(|value| (value.1 - mean).powi(2))
        .sum::<f64>()
        / values.len() as f64;
    (1.0 - variance.sqrt() / scale.max(1.0)).clamp(0.0, 1.0)
}

fn acceleration(samples: &VecDeque<TrackSample>) -> Option<[f64; 3]> {
    let last = samples.back()?;
    let previous = samples.iter().rev().nth(1)?;
    let dt = last.timestamp_ms.saturating_sub(previous.timestamp_ms) as f64 / 1_000.0;
    if dt <= 0.0 {
        None
    } else {
        let delta = sub(last.velocity_mps, previous.velocity_mps);
        Some([delta[0] / dt, delta[1] / dt, delta[2] / dt])
    }
}

fn acceleration_similarity(a: &VecDeque<TrackSample>, b: &VecDeque<TrackSample>) -> f64 {
    match (acceleration(a), acceleration(b)) {
        (Some(left), Some(right)) if norm(left) > 0.05 && norm(right) > 0.05 => {
            cosine01(left, right)
        }
        (Some(left), Some(right)) if norm(left) <= 0.05 && norm(right) <= 0.05 => 1.0,
        _ => 0.5,
    }
}

fn crossing_penalty(a: &TrackSample, b: &TrackSample, stability: f64) -> f64 {
    let relative_position = sub(a.position_m, b.position_m);
    let relative_velocity = sub(a.velocity_mps, b.velocity_mps);
    let speed_squared = dot(relative_velocity, relative_velocity);
    if speed_squared < 1e-6 {
        return 0.0;
    }
    let time_to_closest = -dot(relative_position, relative_velocity) / speed_squared;
    let closest = [
        relative_position[0] + relative_velocity[0] * time_to_closest,
        relative_position[1] + relative_velocity[1] * time_to_closest,
        relative_position[2] + relative_velocity[2] * time_to_closest,
    ];
    let crossing_soon = (1.0 - time_to_closest.abs() / 8.0).clamp(0.0, 1.0);
    let close_approach = (1.0 - norm(closest) / 100.0).clamp(0.0, 1.0);
    crossing_soon * close_approach * (1.0 - stability)
}

fn overlap_score(left: &BTreeSet<String>, right: &BTreeSet<String>) -> f64 {
    let intersection = left.intersection(right).count() as f64;
    let union = left.union(right).count() as f64;
    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(id: &str, revision: u64, time: u64, x: f64, y: f64, vx: f64, vy: f64) -> TrackSample {
        TrackSample {
            track_id: id.to_owned(),
            mission_epoch: 7,
            revision,
            timestamp_ms: time,
            position_m: [x, y, 50.0],
            velocity_mps: [vx, vy, 0.0],
            confidence: 0.95,
            target_asset_id: Some("asset-a".to_owned()),
        }
    }

    fn feed_pair(
        coordinator: &mut Coordinator,
        id_a: &str,
        id_b: &str,
        offset: [f64; 2],
    ) -> CoordinationSnapshot {
        let mut snapshot = coordinator.assess(0);
        for step in 0..=8 {
            let time = step * 500;
            let x = step as f64 * 5.0;
            assert!(coordinator.ingest(sample(id_a, step + 1, time, x, 0.0, 10.0, 0.0)));
            assert!(coordinator.ingest(sample(
                id_b,
                step + 1,
                time,
                x + offset[0],
                offset[1],
                10.0,
                0.0
            )));
            snapshot = coordinator.assess(time);
        }
        snapshot
    }

    #[test]
    fn stable_formation_becomes_coordinated() {
        let mut coordinator = Coordinator::new(Config::default(), 7);
        let snapshot = feed_pair(&mut coordinator, "a", "b", [20.0, 10.0]);
        assert_eq!(snapshot.groups.len(), 1);
        assert_eq!(snapshot.groups[0].state, GroupState::Coordinated);
        assert_eq!(snapshot.groups[0].member_track_ids.len(), 2);
    }

    #[test]
    fn unrelated_crossing_does_not_form_group() {
        let mut coordinator = Coordinator::new(Config::default(), 7);
        let mut snapshot = coordinator.assess(0);
        for step in 0..=12 {
            let time = step * 500;
            let p = -60.0 + step as f64 * 10.0;
            coordinator.ingest(sample("east", step + 1, time, p, 0.0, 20.0, 0.0));
            coordinator.ingest(sample("north", step + 1, time, 0.0, p, 0.0, 20.0));
            snapshot = coordinator.assess(time);
        }
        assert!(snapshot.groups.is_empty());
    }

    #[test]
    fn rejects_stale_revision_and_wrong_epoch() {
        let mut coordinator = Coordinator::new(Config::default(), 7);
        assert!(coordinator.ingest(sample("a", 1, 0, 0.0, 0.0, 1.0, 0.0)));
        assert!(!coordinator.ingest(sample("a", 1, 1, 1.0, 0.0, 1.0, 0.0)));
        let mut wrong = sample("a", 2, 2, 2.0, 0.0, 1.0, 0.0);
        wrong.mission_epoch = 8;
        assert!(!coordinator.ingest(wrong));
    }

    #[test]
    fn dropout_grace_preserves_then_expires_group() {
        let mut coordinator = Coordinator::new(Config::default(), 7);
        let snapshot = feed_pair(&mut coordinator, "a", "b", [20.0, 10.0]);
        assert_eq!(snapshot.groups.len(), 1);
        let within_grace = coordinator.assess(6_500);
        assert_eq!(within_grace.groups.len(), 1);
        let expired = coordinator.assess(7_500);
        assert!(expired.groups.is_empty());
        assert!(expired
            .events
            .iter()
            .any(|event| event.kind == EventKind::GroupDissolved));
    }

    #[test]
    fn replay_is_deterministic() {
        fn run() -> Vec<(u64, GroupState, BTreeSet<String>)> {
            let mut coordinator = Coordinator::new(Config::default(), 7);
            let snapshot = feed_pair(&mut coordinator, "a", "b", [20.0, 10.0]);
            snapshot
                .groups
                .into_iter()
                .map(|group| (group.group_id, group.state, group.member_track_ids))
                .collect()
        }
        assert_eq!(run(), run());
    }
}
