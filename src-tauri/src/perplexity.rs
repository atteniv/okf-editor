use serde_json::Value;

use crate::error::AppError;

fn output_text(_response: &Value) -> Result<String, AppError> {
    todo!("extract Agent API output text")
}

fn website_host(_website_url: &str) -> Result<String, AppError> {
    todo!("validate website URL")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_message_text_from_agent_response() {
        let response = serde_json::json!({
            "output": [
                { "type": "web_search", "results": [] },
                {
                    "type": "message",
                    "content": [
                        { "type": "output_text", "text": "{\"docs\":[]}" }
                    ]
                }
            ]
        });

        assert_eq!(output_text(&response).unwrap(), "{\"docs\":[]}");
    }

    #[test]
    fn rejects_missing_agent_message_text() {
        let error = output_text(&serde_json::json!({ "output": [] })).unwrap_err();
        assert_eq!(error.code, crate::error::ErrorCode::Network);
    }

    #[test]
    fn accepts_public_http_and_https_website_urls() {
        assert_eq!(website_host("https://www.example.com/about").unwrap(), "www.example.com");
        assert_eq!(website_host("http://example.com").unwrap(), "example.com");
    }

    #[test]
    fn rejects_non_web_and_credentialed_urls() {
        for url in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://user:password@example.com",
            "not a url",
        ] {
            assert!(website_host(url).is_err(), "accepted {url}");
        }
    }
}
