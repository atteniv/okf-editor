use serde::Serialize;

use crate::error::{AppError, ErrorCode};
use crate::secrets;

/// GitHub REST (docs/DESIGN.md §7.5, Phase 1 slice). All calls happen in
/// Rust with the token from the keychain — the webview never sees it.
const API: &str = "https://api.github.com";
const TOKEN_NAME: &str = "github-token";

fn client(token: &str, url: String) -> reqwest::RequestBuilder {
    reqwest::Client::new()
        .get(url)
        .bearer_auth(token)
        .header("User-Agent", "okf-editor")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
}

fn require_token() -> Result<String, AppError> {
    secrets::get(TOKEN_NAME)?.ok_or(AppError {
        code: ErrorCode::NotConfigured,
        message: "GitHub token is not configured".into(),
    })
}

fn net_err(e: reqwest::Error) -> AppError {
    AppError {
        code: ErrorCode::Network,
        message: format!("GitHub request failed: {e}"),
    }
}

async fn check_auth(response: reqwest::Response) -> Result<reqwest::Response, AppError> {
    if response.status() == 401 || response.status() == 403 {
        return Err(AppError {
            code: ErrorCode::AuthFailed,
            message: "GitHub rejected the token (expired or missing scopes?)".into(),
        });
    }
    if !response.status().is_success() {
        return Err(AppError {
            code: ErrorCode::Network,
            message: format!("GitHub returned {}", response.status()),
        });
    }
    Ok(response)
}

#[derive(Serialize)]
pub struct GithubUser {
    pub login: String,
    pub name: Option<String>,
}

#[tauri::command]
pub async fn github_verify() -> Result<GithubUser, AppError> {
    let token = require_token()?;
    let response = client(&token, format!("{API}/user"))
        .send()
        .await
        .map_err(net_err)?;
    let value: serde_json::Value = check_auth(response).await?.json().await.map_err(net_err)?;
    Ok(GithubUser {
        login: value["login"].as_str().unwrap_or_default().to_string(),
        name: value["name"].as_str().map(str::to_string),
    })
}

#[derive(Serialize)]
pub struct RepoInfo {
    pub full_name: String,
    pub clone_url: String,
    pub private: bool,
}

/// Create a repository under the authenticated user. Fine-grained tokens
/// scoped to a single repo CANNOT do this (needs Administration: write or
/// classic `repo` scope) — the 403/404 is classified so the UI can fall
/// back to connect-an-existing-repo (DESIGN §5).
#[tauri::command]
pub async fn github_create_repo(name: String, private: bool) -> Result<RepoInfo, AppError> {
    let token = require_token()?;
    let body = serde_json::json!({
        "name": name,
        "private": private,
        "auto_init": false,
    });
    let response = reqwest::Client::new()
        .post(format!("{API}/user/repos"))
        .bearer_auth(&token)
        .header("User-Agent", "okf-editor")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&body)
        .send()
        .await
        .map_err(net_err)?;
    if response.status() == 401 || response.status() == 403 || response.status() == 404 {
        return Err(AppError {
            code: ErrorCode::AuthFailed,
            message: "This token cannot create repositories (fine-grained tokens need Administration: write; classic tokens need the repo scope)".into(),
        });
    }
    if response.status() == 422 {
        let detail = response.text().await.unwrap_or_default();
        return Err(AppError {
            code: ErrorCode::Io,
            message: format!("GitHub rejected the repository (name taken?): {detail}"),
        });
    }
    if !response.status().is_success() {
        return Err(AppError {
            code: ErrorCode::Network,
            message: format!("GitHub returned {}", response.status()),
        });
    }
    let value: serde_json::Value = response.json().await.map_err(net_err)?;
    Ok(RepoInfo {
        full_name: value["full_name"].as_str().unwrap_or_default().to_string(),
        clone_url: value["clone_url"].as_str().unwrap_or_default().to_string(),
        private: value["private"].as_bool().unwrap_or(private),
    })
}

#[tauri::command]
pub async fn github_list_repos() -> Result<Vec<RepoInfo>, AppError> {
    let token = require_token()?;
    let url = format!("{API}/user/repos?per_page=100&sort=pushed");
    let response = client(&token, url).send().await.map_err(net_err)?;
    let value: serde_json::Value = check_auth(response).await?.json().await.map_err(net_err)?;
    let list = value.as_array().cloned().unwrap_or_default();
    Ok(list
        .into_iter()
        .filter_map(|repo| {
            Some(RepoInfo {
                full_name: repo["full_name"].as_str()?.to_string(),
                clone_url: repo["clone_url"].as_str()?.to_string(),
                private: repo["private"].as_bool().unwrap_or(false),
            })
        })
        .collect())
}
