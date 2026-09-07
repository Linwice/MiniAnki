import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { renderCardSide } from "./card-renderer";
import type { CurrentCard, HealthStatus, PublicSettings } from "./types";

const deckName = document.querySelector<HTMLSpanElement>("#deck-name")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const frame = document.querySelector<HTMLIFrameElement>("#card-frame")!;
const answerActions = document.querySelector<HTMLDivElement>("#answer-actions")!;
const reviewView = document.querySelector<HTMLElement>("#review-view")!;
const settingsView = document.querySelector<HTMLElement>("#settings-view")!;
const settingsForm = document.querySelector<HTMLFormElement>("#settings-form")!;
const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url")!;
const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key")!;

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

function labelsFor(buttons: number[]): Map<number, string> {
  if (buttons.length >= 4) return new Map([[1, "Again"], [2, "Hard"], [3, "Good"], [4, "Easy"]]);
  if (buttons.length === 3) return new Map([[1, "Again"], [2, "Good"], [3, "Easy"]]);
  if (buttons.length === 2) return new Map([[1, "Again"], [2, "Good"]]);
  return new Map(buttons.map((button) => [button, `评分 ${button}`]));
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

async function displaySide(html: string, autoPlay: boolean): Promise<string[]> {
  if (!currentCard) return [];
  const rendered = await renderCardSide(frame, html, currentCard.css);
  currentAudioUrls = rendered.audioUrls;
  if (autoPlay && rendered.audioUrls.length) void playAudio(rendered.audioUrls);
  return rendered.missingMedia;
}

function renderAnswerButtons(): void {
  answerActions.replaceChildren();
  if (!showingAnswer || !currentCard) return;
  const labels = labelsFor(currentCard.buttons);
  for (const ease of currentCard.buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${ease} ${labels.get(ease) ?? "评分"}`;
    button.disabled = busy;
    button.addEventListener("click", () => void answer(ease));
    answerActions.append(button);
  }
}

async function loadCurrent(): Promise<void> {
  busy = true;
  renderAnswerButtons();
  setStatus("正在读取当前卡片…");
  try {
    currentCard = await invoke<CurrentCard | null>("load_current_card");
    showingAnswer = false;
    if (!currentCard) {
      deckName.textContent = "Mini Anki";
      frame.srcdoc = "";
      setStatus("Mac 上的 Anki 尚未进入复习页面");
      return;
    }
    deckName.textContent = currentCard.deckName;
    const missing = await displaySide(currentCard.question, true);
    await invoke("start_card_timer", { expectedCardId: currentCard.cardId });
    setStatus(missing.length ? `媒体不存在：${missing.join(", ")}` : `${currentCard.modelName} · Space 显示答案`, missing.length > 0);
  } catch (error) {
    currentCard = null;
    frame.srcdoc = "";
    setStatus(messageFrom(error), true);
  } finally {
    busy = false;
    renderAnswerButtons();
  }
}

async function showAnswer(): Promise<void> {
  if (busy || !currentCard || showingAnswer) return;
  busy = true;
  setStatus("正在翻面…");
  try {
    await invoke("show_answer", { expectedCardId: currentCard.cardId });
    showingAnswer = true;
    const missing = await displaySide(currentCard.answer, true);
    setStatus(missing.length ? `媒体不存在：${missing.join(", ")}` : "请选择评分", missing.length > 0);
  } catch (error) {
    setStatus(messageFrom(error), true);
    await loadCurrent();
  } finally {
    busy = false;
    renderAnswerButtons();
  }
}

async function answer(ease: number): Promise<void> {
  if (busy || !currentCard || !showingAnswer || !currentCard.buttons.includes(ease)) return;
  busy = true;
  renderAnswerButtons();
  setStatus("正在提交评分…");
  try {
    currentCard = await invoke<CurrentCard | null>("answer_card", {
      expectedCardId: currentCard.cardId,
      ease,
    });
    showingAnswer = false;
    if (!currentCard) {
      deckName.textContent = "Mini Anki";
      frame.srcdoc = "";
      currentAudioUrls = [];
      setStatus("当前复习已完成");
    } else {
      deckName.textContent = currentCard.deckName;
      const missing = await displaySide(currentCard.question, true);
      await invoke("start_card_timer", { expectedCardId: currentCard.cardId });
      setStatus(missing.length ? `媒体不存在：${missing.join(", ")}` : `${currentCard.modelName} · Space 显示答案`, missing.length > 0);
    }
  } catch (error) {
    setStatus(messageFrom(error), true);
    await loadCurrent();
  } finally {
    busy = false;
    renderAnswerButtons();
  }
}

async function openSettings(): Promise<void> {
  const settings = await invoke<PublicSettings>("load_settings");
  baseUrlInput.value = settings.baseUrl;
  apiKeyInput.value = "";
  reviewView.classList.add("hidden");
  settingsView.classList.remove("hidden");
  baseUrlInput.focus();
}

function closeSettings(): void {
  settingsView.classList.add("hidden");
  reviewView.classList.remove("hidden");
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

document.querySelector("#settings-button")!.addEventListener("click", () => void openSettings());
document.querySelector("#cancel-settings")!.addEventListener("click", closeSettings);
document.querySelector("#hide-button")!.addEventListener("click", () => void getCurrentWindow().hide());

window.addEventListener("keydown", (event) => {
  if (settingsView.classList.contains("hidden") === false) return;
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
