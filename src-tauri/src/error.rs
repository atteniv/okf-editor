use serde::Serialize;

/// Structured error crossing the command boundary (docs/DESIGN.md §7).
/// Serializes to `{ code, message }` for the frontend.
#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    PathOutsideBundle,
    NotFound,
    Io,
    Network,
    /// A required credential/setting is missing (e.g. no API key yet).
    NotConfigured,
}

impl AppError {
    pub fn path_outside_bundle(detail: &str) -> Self {
        Self {
            code: ErrorCode::PathOutsideBundle,
            message: format!("path escapes the bundle root: {detail}"),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        let code = match err.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::NotFound,
            _ => ErrorCode::Io,
        };
        Self {
            code,
            message: err.to_string(),
        }
    }
}
