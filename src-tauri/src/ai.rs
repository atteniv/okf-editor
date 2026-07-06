use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, ErrorCode};
use crate::secrets;

/// OpenRouter chat streaming (BYOK). The API key lives in the OS keychain
/// and every request happens here in Rust — the webview never sees the key
/// (same posture as the git token, docs/DESIGN.md §7.4). Chunks stream to
/// the UI as `okf://ai-stream` events.
const API: &str = "https://openrouter.ai/api/v1";
const KEY_NAME: &str = "openrouter-api-key";

#[derive(Default)]
pub struct AiState(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Serialize)]
struct StreamEvent {
    request_id: String,
    kind: &'static str, // "delta" | "done" | "error"
    text: String,
}

fn emit(app: &AppHandle, request_id: &str, kind: &'static str, text: String) {
    let _ = app.emit(
        "okf://ai-stream",
        StreamEvent {
            request_id: request_id.to_string(),
            kind,
            text,
        },
    );
}

fn net_err(e: reqwest::Error) -> AppError {
    AppError {
        code: ErrorCode::Network,
        message: format!("OpenRouter request failed: {e}"),
    }
}

#[derive(PartialEq, Debug)]
pub enum SseLine {
    Delta(String),
    Done,
    Other,
}

/// Parse one SSE line from an OpenAI-compatible streaming response.
pub fn parse_sse_line(line: &str) -> SseLine {
    let Some(data) = line.strip_prefix("data: ") else {
        return SseLine::Other;
    };
    if data.trim() == "[DONE]" {
        return SseLine::Done;
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(data) else {
        return SseLine::Other;
    };
    match value["choices"][0]["delta"]["content"].as_str() {
        Some(delta) if !delta.is_empty() => SseLine::Delta(delta.to_string()),
        _ => SseLine::Other,
    }
}

#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    state: State<'_, AiState>,
    request_id: String,
    model: String,
    messages: Vec<ChatMessage>,
) -> Result<(), AppError> {
    let Some(key) = secrets::get(KEY_NAME)? else {
        return Err(AppError {
            code: ErrorCode::NotConfigured,
            message: "OpenRouter API key is not configured".into(),
        });
    };

    let body = serde_json::json!({ "model": model, "messages": messages, "stream": true });
    let response = reqwest::Client::new()
        .post(format!("{API}/chat/completions"))
        .bearer_auth(&key)
        .header("HTTP-Referer", "https://github.com/atteniv/okf-editor")
        .header("X-Title", "OKF Editor")
        .json(&body)
        .send()
        .await
        .map_err(net_err)?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(AppError {
            code: ErrorCode::Network,
            message: format!("OpenRouter returned {status}: {detail}"),
        });
    }

    let cancel = Arc::new(AtomicBool::new(false));
    state
        .0
        .lock()
        .expect("ai state lock poisoned")
        .insert(request_id.clone(), cancel.clone());

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    'outer: while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(e) => {
                emit(&app, &request_id, "error", e.to_string());
                break;
            }
        };
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim_end_matches('\r').to_string();
            buffer.drain(..=pos);
            match parse_sse_line(&line) {
                SseLine::Delta(delta) => emit(&app, &request_id, "delta", delta),
                SseLine::Done => break 'outer,
                SseLine::Other => {}
            }
        }
    }

    state
        .0
        .lock()
        .expect("ai state lock poisoned")
        .remove(&request_id);
    emit(&app, &request_id, "done", String::new());
    Ok(())
}

#[tauri::command]
pub fn ai_cancel(state: State<'_, AiState>, request_id: String) {
    if let Some(flag) = state
        .0
        .lock()
        .expect("ai state lock poisoned")
        .get(&request_id)
    {
        flag.store(true, Ordering::Relaxed);
    }
}

#[derive(Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub async fn ai_models() -> Result<Vec<ModelInfo>, AppError> {
    let mut request = reqwest::Client::new().get(format!("{API}/models"));
    if let Some(key) = secrets::get(KEY_NAME)? {
        request = request.bearer_auth(key);
    }
    let value: serde_json::Value = request
        .send()
        .await
        .map_err(net_err)?
        .json()
        .await
        .map_err(net_err)?;
    let list = value["data"].as_array().cloned().unwrap_or_default();
    Ok(list
        .into_iter()
        .filter_map(|model| {
            let id = model["id"].as_str()?.to_string();
            let name = model["name"].as_str().unwrap_or(&id).to_string();
            Some(ModelInfo { id, name })
        })
        .collect())
}

#[tauri::command]
pub fn ai_key_status() -> Result<bool, AppError> {
    Ok(secrets::get(KEY_NAME)?.is_some())
}

#[derive(Serialize)]
pub struct AiKeyInfo {
    pub label: Option<String>,
    pub usage: Option<f64>,
    pub limit: Option<f64>,
}

/// Verify the stored key against OpenRouter (GET /key) so a bad paste is
/// caught at save time, not on the first real request.
#[tauri::command]
pub async fn ai_verify() -> Result<AiKeyInfo, AppError> {
    let Some(key) = secrets::get(KEY_NAME)? else {
        return Err(AppError {
            code: ErrorCode::NotConfigured,
            message: "OpenRouter API key is not configured".into(),
        });
    };
    let response = reqwest::Client::new()
        .get(format!("{API}/key"))
        .bearer_auth(&key)
        .send()
        .await
        .map_err(net_err)?;
    if response.status() == 401 || response.status() == 403 {
        return Err(AppError {
            code: ErrorCode::AuthFailed,
            message: "OpenRouter does not recognize this key — re-copy it from openrouter.ai/keys"
                .into(),
        });
    }
    if !response.status().is_success() {
        return Err(AppError {
            code: ErrorCode::Network,
            message: format!("OpenRouter returned {}", response.status()),
        });
    }
    let value: serde_json::Value = response.json().await.map_err(net_err)?;
    let data = &value["data"];
    Ok(AiKeyInfo {
        label: data["label"].as_str().map(str::to_string),
        usage: data["usage"].as_f64(),
        limit: data["limit"].as_f64(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_content_deltas() {
        let line = r#"data: {"choices":[{"delta":{"content":"Hello"}}]}"#;
        assert_eq!(parse_sse_line(line), SseLine::Delta("Hello".into()));
    }

    #[test]
    fn recognizes_done_sentinel() {
        assert_eq!(parse_sse_line("data: [DONE]"), SseLine::Done);
    }

    #[test]
    fn ignores_comments_empty_deltas_and_other_fields() {
        assert_eq!(parse_sse_line(": keep-alive"), SseLine::Other);
        assert_eq!(parse_sse_line(""), SseLine::Other);
        assert_eq!(
            parse_sse_line(r#"data: {"choices":[{"delta":{"role":"assistant"}}]}"#),
            SseLine::Other
        );
        assert_eq!(
            parse_sse_line(r#"data: {"choices":[{"delta":{"content":""}}]}"#),
            SseLine::Other
        );
    }

    #[test]
    fn tolerates_malformed_json() {
        assert_eq!(parse_sse_line("data: {nope"), SseLine::Other);
    }
}
