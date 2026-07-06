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

// Keychain round-trip against the real platform store. macOS-only: CI's
// Linux runners have no Secret Service, and this exercises the exact code
// path the app uses on the primary dev platform.
#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn set_get_delete_round_trip() {
        let name = "openrouter-api-key";
        // Preserve any real value the developer has stored.
        let previous = get(name).unwrap();

        secret_set(name.into(), "test-secret-value".into()).unwrap();
        assert!(secret_exists(name.into()).unwrap());
        assert_eq!(get(name).unwrap().as_deref(), Some("test-secret-value"));
        secret_delete(name.into()).unwrap();
        assert!(!secret_exists(name.into()).unwrap());

        if let Some(value) = previous {
            secret_set(name.into(), value).unwrap();
        }
    }

    #[test]
    fn rejects_unknown_secret_names() {
        assert!(secret_set("arbitrary-name".into(), "x".into()).is_err());
    }
}
