import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PublicSettings } from "./types";

const form = document.querySelector<HTMLFormElement>("#settings-form")!;
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

textOpacityInput.addEventListener("input", () => {
  applyTextOpacity(textOpacityInput.value);
  localStorage.setItem("text-opacity", textOpacityInput.value);
  void getCurrentWindow().emitTo("main", "text-opacity-change", { value: textOpacityInput.value });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await invoke("save_settings", {
      input: { baseUrl: baseUrlInput.value.trim(), apiKey: apiKeyInput.value.trim() || null },
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
  apiKeyInput.value = "";
  applyTextOpacity(localStorage.getItem("text-opacity") ?? "100");
  baseUrlInput.focus();
}

void start();
