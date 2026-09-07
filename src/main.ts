import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { renderCardSide } from "./card-renderer";
import type { CurrentCard, HealthStatus, PublicSettings } from "./types";

const status = document.querySelector<HTMLDivElement>("#status")!;
const surface = document.querySelector<HTMLDivElement>("#card-surface")!;
const reviewView = document.querySelector<HTMLElement>("#review-view")!;
const settingsView = document.querySelector<HTMLElement>("#settings-view")!;
const deckView = document.querySelector<HTMLElement>("#deck-view")!;
const deckForm = document.querySelector<HTMLFormElement>("#deck-form")!;
const deckSelect = document.querySelector<HTMLSelectElement>("#deck-select")!;
const settingsForm = document.querySelector<HTMLFormElement>("#settings-form")!;
const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url")!;
const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key")!;
const textSizeInput = document.querySelector<HTMLInputElement>("#text-size")!;
const textSizeValue = document.querySelector<HTMLOutputElement>("#text-size-value")!;
const textOpacityInput = document.querySelector<HTMLInputElement>("#text-opacity")!;
const textOpacityValue = document.querySelector<HTMLOutputElement>("#text-opacity-value")!;

let currentCard: CurrentCard | null = null;
let showingAnswer = false;
let busy = false;
let currentAudioUrls: string[] = [];
let activeAudio: HTMLAudioElement | null = null;

function setStatus(message: string, isError = false): void {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function playAudio(urls = currentAudioUrls): Promise<void> {
  activeAudio?.pause();
  for (const url of urls) {
    const audio = new Audio(url);
    activeAudio = audio;
    try {
      await audio.play();
      await new Promise<void>((resolve) => {
        audio.addEventListener("ended", () => resolve(), { once: true });
        audio.addEventListener("error", () => resolve(), { once: true });
      });
    } catch {
      setStatus("媒体已缓存，但系统阻止了自动播放；按 R 重播", true);
      break;
    }
  }
}

function applyTextSize(value: string): void {
  const parsed = Number(value);
  const pixels = Number.isFinite(parsed) ? Math.min(40, Math.max(10, parsed)) : 15;
  surface.style.setProperty("--content-scale", String(pixels / 15));
  textSizeInput.value = String(pixels);
  textSizeValue.value = `${pixels}px`;
}

function applyTextOpacity(value: string): void {
  const parsed = Number(value);
  const percent = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 100;
  surface.style.setProperty("--content-opacity", String(percent / 100));
  textOpacityInput.value = String(percent);
  textOpacityValue.value = `${percent}%`;
}

function showPanel(panel: "review" | "settings" | "deck"): void {
  reviewView.classList.toggle("hidden", panel !== "review");
  settingsView.classList.toggle("hidden", panel !== "settings");
  deckView.classList.toggle("hidden", panel !== "deck");
}

async function displaySide(html: string, sounds: string[], autoPlay: boolean): Promise<string[]> {
  if (!currentCard) return [];
  const rendered = await renderCardSide(surface, html, currentCard.css, sounds);
  currentAudioUrls = rendered.audioUrls;
  if (autoPlay && rendered.audioUrls.length) void playAudio(rendered.audioUrls);
  return rendered.missingMedia;
}

function clearCard(): void {
  surface.shadowRoot?.replaceChildren();
}

async function loadCurrent(): Promise<void> {
  busy = true;
  setStatus("正在读取当前卡片…");
  try {
    currentCard = await invoke<CurrentCard | null>("load_current_card");
    showingAnswer = false;
    if (!currentCard) {
      clearCard();
      setStatus("请选择要复习的牌组");
      await openDecks();
      return;
    }
    const missing = await displaySide(currentCard.question, currentCard.questionSounds, true);
    await invoke("start_card_timer", { expectedCardId: currentCard.cardId });
    setStatus(missing.length ? `媒体不存在：${missing.join(", ")}` : `${currentCard.modelName} · Space 显示答案`, missing.length > 0);
  } catch (error) {
    currentCard = null;
    clearCard();
    setStatus(messageFrom(error), true);
  } finally {
    busy = false;
  }
}

async function showAnswer(): Promise<void> {
  if (busy || !currentCard || showingAnswer) return;
  busy = true;
  setStatus("正在翻面…");
  try {
    await invoke("show_answer", { expectedCardId: currentCard.cardId });
    showingAnswer = true;
    const missing = await displaySide(currentCard.answer, currentCard.answerSounds, true);
    setStatus(missing.length ? `媒体不存在：${missing.join(", ")}` : "请选择评分", missing.length > 0);
  } catch (error) {
    setStatus(messageFrom(error), true);
    await loadCurrent();
  } finally {
    busy = false;
  }
}

async function answer(ease: number): Promise<void> {
  if (busy || !currentCard || !showingAnswer || !currentCard.buttons.includes(ease)) return;
  busy = true;
  setStatus("正在提交评分…");
  try {
    currentCard = await invoke<CurrentCard | null>("answer_card", {
      expectedCardId: currentCard.cardId,
      ease,
    });
    showingAnswer = false;
    if (!currentCard) {
      clearCard();
      currentAudioUrls = [];
      setStatus("当前复习已完成");
    } else {
      const missing = await displaySide(currentCard.question, currentCard.questionSounds, true);
      await invoke("start_card_timer", { expectedCardId: currentCard.cardId });
      setStatus(missing.length ? `媒体不存在：${missing.join(", ")}` : `${currentCard.modelName} · Space 显示答案`, missing.length > 0);
    }
  } catch (error) {
    setStatus(messageFrom(error), true);
    await loadCurrent();
  } finally {
    busy = false;
  }
}

async function openSettings(): Promise<void> {
  const settings = await invoke<PublicSettings>("load_settings");
  baseUrlInput.value = settings.baseUrl;
  apiKeyInput.value = "";
  showPanel("settings");
  baseUrlInput.focus();
}

function closeSettings(): void {
  showPanel("review");
}

async function openDecks(): Promise<void> {
  showPanel("deck");
  deckSelect.replaceChildren();
  document.querySelector<HTMLParagraphElement>("#deck-note")!.textContent = "正在读取牌组…";
  try {
    const decks = await invoke<string[]>("list_decks");
    for (const name of decks) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = name === currentCard?.deckName;
      deckSelect.append(option);
    }
    document.querySelector<HTMLParagraphElement>("#deck-note")!.textContent = decks.length
      ? "Mac 只需保持 Anki 运行，无需手动进入复习。"
      : "没有找到牌组。";
  } catch (error) {
    document.querySelector<HTMLParagraphElement>("#deck-note")!.textContent = messageFrom(error);
  }
}

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKey = apiKeyInput.value.trim();
  try {
    await invoke("save_settings", {
      input: { baseUrl: baseUrlInput.value.trim(), apiKey: apiKey || null },
    });
    closeSettings();
    await loadCurrent();
  } catch (error) {
    document.querySelector<HTMLParagraphElement>("#settings-note")!.textContent = messageFrom(error);
  }
});

deckForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!deckSelect.value || busy) return;
  busy = true;
  document.querySelector<HTMLParagraphElement>("#deck-note")!.textContent = "正在启动牌组…";
  try {
    await invoke("start_deck_review", { name: deckSelect.value });
    showPanel("review");
    await loadCurrent();
  } catch (error) {
    document.querySelector<HTMLParagraphElement>("#deck-note")!.textContent = messageFrom(error);
  } finally {
    busy = false;
  }
});

document.querySelector("#cancel-settings")!.addEventListener("click", closeSettings);
document.querySelector("#cancel-deck")!.addEventListener("click", () => showPanel("review"));
textSizeInput.addEventListener("input", () => {
  applyTextSize(textSizeInput.value);
  localStorage.setItem("text-size", textSizeInput.value);
});
textOpacityInput.addEventListener("input", () => {
  applyTextOpacity(textOpacityInput.value);
  localStorage.setItem("text-opacity", textOpacityInput.value);
});

void listen("open-settings", () => void openSettings());
void listen("open-decks", () => void openDecks());

window.addEventListener("keydown", (event) => {
  if (!settingsView.classList.contains("hidden") || !deckView.classList.contains("hidden")) return;
  if (event.code === "Space") {
    event.preventDefault();
    void showAnswer();
  } else if (event.key.toLowerCase() === "r") {
    void playAudio();
  } else if (event.key === "Escape") {
    void getCurrentWindow().hide();
  } else if (/^[1-4]$/.test(event.key) && showingAnswer) {
    void answer(Number(event.key));
  }
});

async function start(): Promise<void> {
  applyTextSize(localStorage.getItem("text-size") ?? "15");
  applyTextOpacity(localStorage.getItem("text-opacity") ?? "100");
  try {
    const settings = await invoke<PublicSettings>("load_settings");
    if (!settings.baseUrl) {
      await openSettings();
      return;
    }
    const health = await invoke<HealthStatus>("health_check");
    setStatus(`AnkiConnect v${health.apiVersion}`);
    await loadCurrent();
  } catch (error) {
    setStatus(messageFrom(error), true);
  }
}

void start();
