use base64::Engine;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{ffi::OsStr, fs, path::Path};
use tauri::{AppHandle, Manager};

use crate::anki_client::AnkiClient;

const MAX_ENCODED_MEDIA_BYTES: usize = 90 * 1024 * 1024;

#[derive(Serialize)]
pub struct CachedMedia {
    filename: String,
    path: String,
    sha256: String,
}

fn validate_filename(filename: &str) -> Result<(), String> {
    if filename.is_empty() || Path::new(filename).file_name() != Some(OsStr::new(filename)) {
        return Err("媒体文件名无效".into());
    }
    Ok(())
}

fn cache_name(filename: &str) -> String {
    let name_hash = format!("{:x}", Sha256::digest(filename.as_bytes()));
    let extension = Path::new(filename)
        .extension()
        .and_then(OsStr::to_str)
        .filter(|value| value.len() <= 10 && value.chars().all(|character| character.is_ascii_alphanumeric()))
        .unwrap_or("bin");
    format!("{name_hash}.{extension}")
}

pub async fn cache(
    app: &AppHandle,
    client: &AnkiClient,
    base_url: &str,
    filename: &str,
) -> Result<CachedMedia, String> {
    validate_filename(filename)?;
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("无法确定媒体缓存目录：{error}"))?
        .join("media");
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建媒体缓存：{error}"))?;
    let path = directory.join(cache_name(filename));

    let bytes = if path.exists() {
        fs::read(&path).map_err(|error| format!("无法读取媒体缓存：{error}"))?
    } else {
        let encoded = client.retrieve_media(base_url, filename).await?;
        if encoded.len() > MAX_ENCODED_MEDIA_BYTES {
            return Err(format!("媒体文件过大：{filename}"));
        }
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| format!("媒体 Base64 无效：{error}"))?;
        let temporary = path.with_extension("download");
        fs::write(&temporary, &decoded).map_err(|error| format!("无法写入媒体缓存：{error}"))?;
        fs::rename(&temporary, &path).map_err(|error| format!("无法提交媒体缓存：{error}"))?;
        decoded
    };

    Ok(CachedMedia {
        filename: filename.to_string(),
        path: path.to_string_lossy().into_owned(),
        sha256: format!("{:x}", Sha256::digest(&bytes)),
    })
}

