use reqwest::Client;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::settings;

#[derive(Clone)]
pub struct AnkiClient {
    http: Client,
}

#[derive(Deserialize)]
struct ApiResponse {
    result: Value,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCurrentCard {
    question: String,
    answer: String,
    deck_name: String,
    model_name: String,
    card_id: i64,
    buttons: Vec<u8>,
    field_order: usize,
    fields: HashMap<String, RawField>,
}

#[derive(Deserialize)]
struct RawField {
    value: String,
    order: usize,
}

#[derive(Deserialize)]
struct RawCardInfo {
    #[serde(default)]
    css: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentCard {
    pub question: String,
    pub answer: String,
    pub css: String,
    pub deck_name: String,
    pub model_name: String,
    pub card_id: i64,
    pub buttons: Vec<u8>,
    pub question_sounds: Vec<String>,
    pub answer_sounds: Vec<String>,
}

fn sound_names(value: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut remaining = value;
    while let Some(start) = remaining.find("[sound:") {
        let after_marker = &remaining[start + 7..];
        let Some(end) = after_marker.find(']') else { break };
        let name = after_marker[..end].trim();
        if !name.is_empty() {
            names.push(name.to_string());
        }
        remaining = &after_marker[end + 1..];
    }
    names
}

fn sounds_for_fields(fields: &HashMap<String, RawField>, names: &[String]) -> Vec<String> {
    names
        .iter()
        .filter_map(|name| fields.get(name))
        .flat_map(|field| sound_names(&field.value))
        .collect()
}

fn all_field_sounds(fields: &HashMap<String, RawField>) -> Vec<String> {
    let mut ordered: Vec<_> = fields.values().collect();
    ordered.sort_by_key(|field| field.order);
    ordered
        .into_iter()
        .flat_map(|field| sound_names(&field.value))
        .collect()
}

fn unique(names: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    for name in names {
        if !result.contains(&name) {
            result.push(name);
        }
    }
    result
}

impl AnkiClient {
    pub async fn sync(&self, base_url: &str) -> Result<(), String> {
        self.invoke(base_url, "sync", json!({})).await
    }

    pub fn new() -> Result<Self, String> {
        let http = Client::builder()
            .connect_timeout(std::time::Duration::from_secs(5))
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|error| format!("无法创建网络客户端：{error}"))?;
        Ok(Self { http })
    }

    async fn invoke<T: DeserializeOwned>(&self, base_url: &str, action: &str, params: Value) -> Result<T, String> {
        if base_url.is_empty() {
            return Err("请先设置 Mac 服务地址".into());
        }
        let mut payload = json!({ "action": action, "version": 6, "params": params });
        if let Some(key) = settings::api_key() {
            payload["key"] = Value::String(key);
        }

        let response = self
            .http
            .post(base_url)
            .json(&payload)
            .send()
            .await
            .map_err(|error| format!("无法连接 Mac 上的 Anki：{error}"))?;
        if !response.status().is_success() {
            return Err(format!("Anki 服务返回 HTTP {}", response.status()));
        }
        let body: ApiResponse = response.json().await.map_err(|error| format!("Anki 响应格式无效：{error}"))?;
        if let Some(error) = body.error {
            return Err(format!("AnkiConnect：{error}"));
        }
        serde_json::from_value(body.result).map_err(|error| format!("Anki 返回了意外的数据：{error}"))
    }

    pub async fn version(&self, base_url: &str) -> Result<u8, String> {
        self.invoke(base_url, "version", json!({})).await
    }

    pub async fn deck_names(&self, base_url: &str) -> Result<Vec<String>, String> {
        self.invoke(base_url, "deckNames", json!({})).await
    }

    pub async fn start_deck_review(&self, base_url: &str, name: &str) -> Result<(), String> {
        let decks = self.deck_names(base_url).await?;
        if !decks.iter().any(|deck| deck == name) {
            return Err("选择的牌组不存在".into());
        }
        let success: bool = self.invoke(base_url, "guiDeckReview", json!({ "name": name })).await?;
        if success { Ok(()) } else { Err("Anki 无法启动该牌组，可能今日已经完成".into()) }
    }

    async fn raw_current(&self, base_url: &str) -> Result<Option<RawCurrentCard>, String> {
        self.invoke(base_url, "guiCurrentCard", json!({})).await
    }

    pub async fn current(&self, base_url: &str) -> Result<Option<CurrentCard>, String> {
        let Some(raw) = self.raw_current(base_url).await? else {
            return Ok(None);
        };
        let info: Vec<RawCardInfo> = self.invoke(base_url, "cardsInfo", json!({ "cards": [raw.card_id] })).await?;
        let css = info.into_iter().next().map(|value| value.css).unwrap_or_default();
        let templates: Option<Value> = self
            .invoke(
                base_url,
                "modelFieldsOnTemplates",
                json!({ "modelName": raw.model_name.clone() }),
            )
            .await
            .ok();
        let template = templates
            .as_ref()
            .and_then(Value::as_object)
            .and_then(|values| values.values().nth(raw.field_order))
            .and_then(Value::as_array);
        let field_names = |index: usize| -> Vec<String> {
            template
                .and_then(|sides| sides.get(index))
                .and_then(Value::as_array)
                .map(|names| names.iter().filter_map(Value::as_str).map(ToOwned::to_owned).collect())
                .unwrap_or_default()
        };
        let question_fields = field_names(0);
        let answer_fields = field_names(1);
        let fallback_sounds = all_field_sounds(&raw.fields);
        let question_sounds = if question_fields.is_empty() {
            fallback_sounds.clone()
        } else {
            sounds_for_fields(&raw.fields, &question_fields)
        };
        let answer_sounds = if answer_fields.is_empty() {
            fallback_sounds
        } else {
            unique([
                question_sounds.clone(),
                sounds_for_fields(&raw.fields, &answer_fields),
            ].concat())
        };
        Ok(Some(CurrentCard {
            question: raw.question,
            answer: raw.answer,
            css,
            deck_name: raw.deck_name,
            model_name: raw.model_name,
            card_id: raw.card_id,
            buttons: raw.buttons,
            question_sounds,
            answer_sounds,
        }))
    }

    async fn require_card(&self, base_url: &str, expected_card_id: i64) -> Result<(), String> {
        let current = self.raw_current(base_url).await?;
        match current {
            Some(card) if card.card_id == expected_card_id => Ok(()),
            Some(_) => Err("Mac 上的当前卡片已经变化，已取消本次操作".into()),
            None => Err("Mac 上的 Anki 已离开复习页面".into()),
        }
    }

    pub async fn start_timer(&self, base_url: &str, expected_card_id: i64) -> Result<(), String> {
        self.require_card(base_url, expected_card_id).await?;
        let success: bool = self.invoke(base_url, "guiStartCardTimer", json!({})).await?;
        if success { Ok(()) } else { Err("Anki 无法启动卡片计时器".into()) }
    }

    pub async fn show_answer(&self, base_url: &str, expected_card_id: i64) -> Result<(), String> {
        self.require_card(base_url, expected_card_id).await?;
        let success: bool = self.invoke(base_url, "guiShowAnswer", json!({})).await?;
        if success { Ok(()) } else { Err("Anki 无法显示当前答案".into()) }
    }

    pub async fn answer(&self, base_url: &str, expected_card_id: i64, ease: u8) -> Result<(), String> {
        self.require_card(base_url, expected_card_id).await?;
        let current = self.raw_current(base_url).await?.ok_or("Mac 上的 Anki 已离开复习页面")?;
        if !current.buttons.contains(&ease) {
            return Err(format!("当前卡片不支持评分 {ease}"));
        }
        let success: bool = self.invoke(base_url, "guiAnswerCard", json!({ "ease": ease })).await?;
        if success { Ok(()) } else { Err("Anki 拒绝了本次评分，请先显示答案".into()) }
    }

    pub async fn retrieve_media(&self, base_url: &str, filename: &str) -> Result<String, String> {
        let value: Value = self.invoke(base_url, "retrieveMediaFile", json!({ "filename": filename })).await?;
        value.as_str().map(ToOwned::to_owned).ok_or_else(|| format!("媒体不存在：{filename}"))
    }
}
