import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PublicSettings } from "./types";

const form = document.querySelector<HTMLFormElement>("#settings-form")!;
const connectionModeInput = document.querySelector<HTMLSelectElement>("#connection-mode")!;
const remoteAddressRow = document.querySelector<HTMLElement>("#remote-address-row")!;
const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url")!;
const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key")!;
const textOpacityInput = document.querySelector<HTMLInputElement>("#text-opacity")!;
const textOpacityValue = document.querySelector<HTMLOutputElement>("#text-opacity-value")!;
const note = document.querySelector<HTMLParagraphElement>("#settings-note")!;

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function applyTextOpacity(value: string): void {
  const parsed = Number(value);
  const percent = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 100;
  textOpacityInput.value = String(percent);
  textOpacityValue.value = `${percent}%`;
}

function applyConnectionMode(mode: string): void {
  const local = mode === "local";
  remoteAddressRow.classList.toggle("hidden", local);
  baseUrlInput.required = !local;
  if (local) baseUrlInput.value = "http://127.0.0.1:8765";
  note.textContent = local
    ? "连接当前 Windows 电脑上的 AnkiConnect（默认端口 8765）。"
    : "地址保存在配置文件；密钥保存在系统凭据库。";
}

connectionModeInput.addEventListener("change", () => applyConnectionMode(connectionModeInput.value));

textOpacityInput.addEventListener("input", () => {
  applyTextOpacity(textOpacityInput.value);
  localStorage.setItem("text-opacity", textOpacityInput.value);
  void getCurrentWindow().emitTo("main", "text-opacity-change", { value: textOpacityInput.value });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await invoke("save_settings", {
      input: { baseUrl: connectionModeInput.value === "local" ? "http://127.0.0.1:8765" : baseUrlInput.value.trim(), apiKey: apiKeyInput.value.trim() || null },
    });
    await getCurrentWindow().emitTo("main", "settings-saved");
    await getCurrentWindow().close();
  } catch (error) {
    note.textContent = messageFrom(error);
  }
});

document.querySelector("#close-settings")!.addEventListener("click", () => void getCurrentWindow().close());

async function start(): Promise<void> {
  const settings = await invoke<PublicSettings>("load_settings");
  baseUrlInput.value = settings.baseUrl;
  connectionModeInput.value = /^http:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/.test(settings.baseUrl) ? "local" : "remote";
  applyConnectionMode(connectionModeInput.value);
  apiKeyInput.value = "";
  applyTextOpacity(localStorage.getItem("text-opacity") ?? "100");
  (connectionModeInput.value === "local" ? connectionModeInput : baseUrlInput).focus();
}

void start();
