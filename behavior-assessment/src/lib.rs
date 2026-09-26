use async_trait::async_trait;
use chrono::{DateTime, Utc};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeSet, HashMap},
    sync::Arc,
    time::Duration,
};
use thiserror::Error;

pub const CONTRACT_VERSION: &str = "sentinel.behavior-assessment/v1";
pub const FEATURE_CONTRACT_VERSION: &str = "sentinel.behavior-features/v1";
pub const ALPHA2_MODEL_VERSION: &str = "3.0.0-alpha.2";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ObservationFeature {
    pub timestamp_s: f64,
    pub x_m: f64,
    pub y_m: f64,
    pub z_m: f64,
    pub vx_mps: f64,
    pub vy_mps: f64,
    pub vz_mps: f64,
    pub speed_mps: f64,
    pub heading_deg: f64,
    pub track_confidence: f64,
    pub identity_confidence: f64,
    pub sensor_age_s: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProtectedAsset {
    pub asset_id: String,
    pub x_m: f64,
    pub y_m: f64,
    pub protected_radius_m: f64,
    pub monitoring_radius_m: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AssessmentRequest {
    pub contract_version: String,
    pub feature_contract_version: String,
    pub request_id: String,
    pub mission_id: String,
    pub mission_epoch: String,
    pub track_id: String,
    pub track_revision: u64,
    pub captured_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub history: Vec<ObservationFeature>,
    pub assets: Vec<ProtectedAsset>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AssessmentResponse {
    pub contract_version: String,
    pub feature_contract_version: String,
    pub request_id: String,
    pub mission_id: String,
    pub mission_epoch: String,
    pub track_id: String,
    pub track_revision: u64,
    pub captured_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub produced_at: DateTime<Utc>,
    pub model_version: String,
    pub artifact_sha256: String,
    pub authority: String,
    pub motion: Value,
    pub asset_relations: Vec<Value>,
    pub coordination: Value,
    pub timing_ms: Value,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CurrentTrackAuthority {
    pub mission_epoch: String,
    pub track_revision: u64,
}

pub trait AuthorityReader: Send + Sync + 'static {
    fn current(&self, mission_id: &str, track_id: &str) -> Option<CurrentTrackAuthority>;
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum InferenceError {
    #[error("worker unavailable: {0}")]
    Unavailable(String),
    #[error("worker timed out")]
    Timeout,
    #[error("invalid worker response: {0}")]
    InvalidResponse(String),
}

#[async_trait]
pub trait InferenceWorker: Send + Sync + 'static {
    async fn infer(&self, request: AssessmentRequest)
    -> Result<AssessmentResponse, InferenceError>;
}

#[async_trait]
pub trait BatchInferenceWorker: InferenceWorker {
    async fn infer_batch(
        &self,
        requests: Vec<AssessmentRequest>,
    ) -> Result<Vec<AssessmentResponse>, InferenceError>;
}

#[derive(Clone)]
pub struct HttpInferenceWorker {
    client: reqwest::Client,
    endpoint: Url,
}

impl HttpInferenceWorker {
    pub fn new(endpoint: Url) -> Result<Self, InferenceError> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| InferenceError::Unavailable(error.to_string()))?;
        Ok(Self { client, endpoint })
    }
}

#[async_trait]
impl InferenceWorker for HttpInferenceWorker {
    async fn infer(
        &self,
        request: AssessmentRequest,
    ) -> Result<AssessmentResponse, InferenceError> {
        let response = self
            .client
            .post(self.endpoint.clone())
            .json(&request)
            .send()
            .await
            .map_err(|error| InferenceError::Unavailable(error.to_string()))?;
        if !response.status().is_success() {
            return Err(InferenceError::InvalidResponse(format!(
                "HTTP {}",
                response.status()
            )));
        }
        response
            .json()
            .await
            .map_err(|error| InferenceError::InvalidResponse(error.to_string()))
    }
}

#[async_trait]
impl BatchInferenceWorker for HttpInferenceWorker {
    async fn infer_batch(
        &self,
        requests: Vec<AssessmentRequest>,
    ) -> Result<Vec<AssessmentResponse>, InferenceError> {
        let mut endpoint = self.endpoint.clone();
        endpoint.set_path("/v1/infer-batch");
        let response = self
            .client
            .post(endpoint)
            .json(&requests)
            .send()
            .await
            .map_err(|error| InferenceError::Unavailable(error.to_string()))?;
        if !response.status().is_success() {
            return Err(InferenceError::InvalidResponse(format!(
                "HTTP {}",
                response.status()
            )));
        }
        response
            .json()
            .await
            .map_err(|error| InferenceError::InvalidResponse(error.to_string()))
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum AssessmentDisposition {
    Accepted(Box<AssessmentResponse>),
    Rejected { reason: &'static str },
    Unavailable { detail: String },
}

pub struct AssessmentCoordinator<W, A> {
    worker: Arc<W>,
    authority: Arc<A>,
    allowed_models: BTreeSet<String>,
    timeout: Duration,
}

impl<W, A> Clone for AssessmentCoordinator<W, A> {
    fn clone(&self) -> Self {
        Self {
            worker: self.worker.clone(),
            authority: self.authority.clone(),
            allowed_models: self.allowed_models.clone(),
            timeout: self.timeout,
        }
    }
}

impl<W: InferenceWorker, A: AuthorityReader> AssessmentCoordinator<W, A> {
    pub fn alpha2(worker: Arc<W>, authority: Arc<A>, timeout: Duration) -> Self {
        Self {
            worker,
            authority,
            allowed_models: BTreeSet::from([ALPHA2_MODEL_VERSION.to_owned()]),
            timeout,
        }
    }

    pub fn submit(
        &self,
        request: AssessmentRequest,
    ) -> tokio::task::JoinHandle<AssessmentDisposition> {
        let this = self.clone();
        tokio::spawn(async move { this.assess(request).await })
    }

    pub async fn assess(&self, request: AssessmentRequest) -> AssessmentDisposition {
        if request.contract_version != CONTRACT_VERSION
            || request.feature_contract_version != FEATURE_CONTRACT_VERSION
        {
            return AssessmentDisposition::Rejected {
                reason: "unsupported_request_contract",
            };
        }
        let response =
            match tokio::time::timeout(self.timeout, self.worker.infer(request.clone())).await {
                Err(_) => {
                    return AssessmentDisposition::Unavailable {
                        detail: InferenceError::Timeout.to_string(),
                    };
                }
                Ok(Err(error)) => {
                    return AssessmentDisposition::Unavailable {
                        detail: error.to_string(),
                    };
                }
                Ok(Ok(response)) => response,
            };
        self.validate(&request, response, Utc::now())
    }

    pub fn validate(
        &self,
        request: &AssessmentRequest,
        response: AssessmentResponse,
        now: DateTime<Utc>,
    ) -> AssessmentDisposition {
        if response.contract_version != CONTRACT_VERSION
            || response.feature_contract_version != FEATURE_CONTRACT_VERSION
        {
            return AssessmentDisposition::Rejected {
                reason: "unsupported_response_contract",
            };
        }
        if response.request_id != request.request_id
            || response.mission_id != request.mission_id
            || response.track_id != request.track_id
            || response.captured_at != request.captured_at
        {
            return AssessmentDisposition::Rejected {
                reason: "response_identity_mismatch",
            };
        }
        if response.mission_epoch != request.mission_epoch
            || response.track_revision != request.track_revision
        {
            return AssessmentDisposition::Rejected {
                reason: "response_revision_mismatch",
            };
        }
        if response.expires_at != request.expires_at || now > request.expires_at {
            return AssessmentDisposition::Rejected {
                reason: "assessment_expired",
            };
        }
        if !self.allowed_models.contains(&response.model_version) {
            return AssessmentDisposition::Rejected {
                reason: "model_version_not_allowed",
            };
        }
        if response.authority != "non_authoritative_decision_support" {
            return AssessmentDisposition::Rejected {
                reason: "invalid_assessment_authority",
            };
        }
        let Some(current) = self
            .authority
            .current(&request.mission_id, &request.track_id)
        else {
            return AssessmentDisposition::Rejected {
                reason: "track_no_longer_current",
            };
        };
        if current.mission_epoch != request.mission_epoch {
            return AssessmentDisposition::Rejected {
                reason: "mission_epoch_advanced",
            };
        }
        if current.track_revision != request.track_revision {
            return AssessmentDisposition::Rejected {
                reason: "track_revision_advanced",
            };
        }
        AssessmentDisposition::Accepted(Box::new(response))
    }
}

impl<W: BatchInferenceWorker, A: AuthorityReader> AssessmentCoordinator<W, A> {
    /// Sends one bounded transport batch while retaining per-request validation.
    pub async fn assess_batch(
        &self,
        requests: Vec<AssessmentRequest>,
    ) -> Vec<AssessmentDisposition> {
        if requests.is_empty() {
            return Vec::new();
        }
        if requests.len() > 128 {
            return requests
                .iter()
                .map(|_| AssessmentDisposition::Rejected {
                    reason: "batch_too_large",
                })
                .collect();
        }
        let result =
            tokio::time::timeout(self.timeout, self.worker.infer_batch(requests.clone())).await;
        let responses = match result {
            Err(_) => {
                return requests
                    .iter()
                    .map(|_| AssessmentDisposition::Unavailable {
                        detail: InferenceError::Timeout.to_string(),
                    })
                    .collect();
            }
            Ok(Err(error)) => {
                return requests
                    .iter()
                    .map(|_| AssessmentDisposition::Unavailable {
                        detail: error.to_string(),
                    })
                    .collect();
            }
            Ok(Ok(responses)) => responses,
        };
        let mut by_id = HashMap::with_capacity(responses.len());
        for response in responses {
            if by_id
                .insert(response.request_id.clone(), response)
                .is_some()
            {
                return requests
                    .iter()
                    .map(|_| AssessmentDisposition::Rejected {
                        reason: "duplicate_batch_response",
                    })
                    .collect();
            }
        }
        requests
            .iter()
            .map(|request| match by_id.remove(&request.request_id) {
                Some(response) => self.validate(request, response, Utc::now()),
                None => AssessmentDisposition::Rejected {
                    reason: "missing_batch_response",
                },
            })
            .collect()
    }
}
