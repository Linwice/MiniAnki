use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};

const KEYRING_SERVICE: &str = "com.minianki.app";
const KEYRING_USER: &str = "ankiconnect-api-key";

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub base_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsInput {
    pub base_url: String,
    pub api_key: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicSettings {
    pub base_url: String,
    pub has_api_key: bool,
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("settings.json"))
        .map_err(|error| format!("无法确定配置目录：{error}"))
}

pub fn load(app: &AppHandle) -> Settings {
    settings_path(app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let parent = path.parent().ok_or("配置路径无效")?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建配置目录：{error}"))?;
    let content = serde_json::to_vec_pretty(settings).map_err(|error| format!("无法序列化配置：{error}"))?;
    fs::write(path, content).map_err(|error| format!("无法保存配置：{error}"))
}

fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|error| format!("无法访问系统凭据库：{error}"))
}

pub fn api_key() -> Option<String> {
    credential().ok()?.get_password().ok()
}

pub fn set_api_key(value: &str) -> Result<(), String> {
    credential()?
        .set_password(value)
        .map_err(|error| format!("无法保存 API key：{error}"))
}

pub fn validate_base_url(value: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(value).map_err(|_| "服务地址格式无效")?;
    let host = url.host_str().ok_or("服务地址缺少主机名")?;
    let local_http = url.scheme() == "http" && matches!(host, "127.0.0.1" | "localhost");
    if url.scheme() != "https" && !local_http {
        return Err("远程服务必须使用 HTTPS；HTTP 只允许 localhost".into());
    }
    if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("服务地址不能包含账号、查询参数或片段".into());
    }
    url.set_path("");
    Ok(url.as_str().trim_end_matches('/').to_string())
}

