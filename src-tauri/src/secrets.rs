use keyring::Entry;

use crate::error::{AppError, ErrorCode};

/// OS-keychain secret store (docs/DESIGN.md §7.4). Names are allowlisted —
/// the webview cannot use this as a general keychain reader — and there is
/// deliberately NO secret_get command: secrets are consumed inside Rust
/// (AI requests, git auth); the webview only learns whether one exists.
const SERVICE: &str = "com.atteniv.okf-editor";
const ALLOWED: &[&str] = &["openrouter-api-key", "github-token"];

fn entry(name: &str) -> Result<Entry, AppError> {
    if !ALLOWED.contains(&name) {
        return Err(AppError {
            code: ErrorCode::Io,
            message: format!("unknown secret name: {name}"),
        });
    }
    Entry::new(SERVICE, name).map_err(|e| AppError {
        code: ErrorCode::Io,
        message: format!("keychain unavailable: {e}"),
    })
}

/// Internal read for Rust consumers only (never exposed as a command).
pub fn get(name: &str) -> Result<Option<String>, AppError> {
    match entry(name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError {
            code: ErrorCode::Io,
            message: format!("keychain read failed: {e}"),
        }),
    }
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), AppError> {
    entry(&name)?.set_password(&value).map_err(|e| AppError {
        code: ErrorCode::Io,
        message: format!("keychain write failed: {e}"),
    })
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), AppError> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError {
            code: ErrorCode::Io,
            message: format!("keychain delete failed: {e}"),
        }),
    }
}

#[tauri::command]
pub fn secret_exists(name: String) -> Result<bool, AppError> {
    Ok(get(&name)?.is_some())
}
