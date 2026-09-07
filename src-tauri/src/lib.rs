mod anki_client;
mod media_cache;
mod settings;

use anki_client::{AnkiClient, CurrentCard};
use serde::Serialize;
use std::sync::RwLock;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

struct AppState {
    client: AnkiClient,
    settings: RwLock<settings::Settings>,
}

impl AppState {
    fn base_url(&self) -> Result<String, String> {
        self.settings
            .read()
            .map(|settings| settings.base_url.clone())
            .map_err(|_| "配置锁已损坏".into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthStatus {
    api_version: u8,
    in_review: bool,
}

#[tauri::command]
fn load_settings(state: State<'_, AppState>) -> Result<settings::PublicSettings, String> {
    let current = state.settings.read().map_err(|_| "配置锁已损坏")?;
    Ok(settings::PublicSettings {
        base_url: current.base_url.clone(),
        has_api_key: settings::api_key().is_some(),
    })
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    input: settings::SettingsInput,
) -> Result<settings::PublicSettings, String> {
    let base_url = settings::validate_base_url(&input.base_url)?;
    if let Some(api_key) = input.api_key.as_deref().filter(|value| !value.is_empty()) {
        settings::set_api_key(api_key)?;
    }
    let updated = settings::Settings { base_url: base_url.clone() };
    settings::save(&app, &updated)?;
    *state.settings.write().map_err(|_| "配置锁已损坏")? = updated;
    Ok(settings::PublicSettings { base_url, has_api_key: settings::api_key().is_some() })
}

#[tauri::command]
async fn health_check(state: State<'_, AppState>) -> Result<HealthStatus, String> {
    let base_url = state.base_url()?;
    let api_version = state.client.version(&base_url).await?;
    let in_review = state.client.current(&base_url).await?.is_some();
    Ok(HealthStatus { api_version, in_review })
}

#[tauri::command]
async fn list_decks(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let base_url = state.base_url()?;
    state.client.deck_names(&base_url).await
}

#[tauri::command]
async fn start_deck_review(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let base_url = state.base_url()?;
    state.client.start_deck_review(&base_url, &name).await
}

#[tauri::command]
async fn load_current_card(state: State<'_, AppState>) -> Result<Option<CurrentCard>, String> {
    let base_url = state.base_url()?;
    state.client.current(&base_url).await
}

#[tauri::command]
async fn start_card_timer(state: State<'_, AppState>, expected_card_id: i64) -> Result<(), String> {
    let base_url = state.base_url()?;
    state.client.start_timer(&base_url, expected_card_id).await
}

#[tauri::command]
async fn show_answer(state: State<'_, AppState>, expected_card_id: i64) -> Result<(), String> {
    let base_url = state.base_url()?;
    state.client.show_answer(&base_url, expected_card_id).await
}

#[tauri::command]
async fn answer_card(
    state: State<'_, AppState>,
    expected_card_id: i64,
    ease: u8,
) -> Result<Option<CurrentCard>, String> {
    let base_url = state.base_url()?;
    state.client.answer(&base_url, expected_card_id, ease).await?;
    state.client.current(&base_url).await
}

#[tauri::command]
async fn cache_media(
    app: AppHandle,
    state: State<'_, AppState>,
    filename: String,
) -> Result<media_cache::CachedMedia, String> {
    let base_url = state.base_url()?;
    media_cache::cache(&app, &state.client, &base_url, &filename).await
}

pub fn run() {
    let toggle_shortcut = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyA);
    let handler_shortcut = toggle_shortcut.clone();
    let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcut(toggle_shortcut)
        .expect("global shortcut is valid")
        .with_handler(move |app, shortcut, event| {
            if shortcut == &handler_shortcut && event.state() == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(shortcut_plugin)
        .setup(|app| {
            let client = AnkiClient::new().map_err(std::io::Error::other)?;
            let state = AppState {
                client,
                settings: RwLock::new(settings::load(app.handle())),
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            health_check,
            list_decks,
            start_deck_review,
            load_current_card,
            start_card_timer,
            show_answer,
            answer_card,
            cache_media
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mini Anki");
}
