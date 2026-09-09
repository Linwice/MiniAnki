import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const form = document.querySelector<HTMLFormElement>("#deck-form")!;
const select = document.querySelector<HTMLSelectElement>("#deck-select")!;
const note = document.querySelector<HTMLParagraphElement>("#deck-note")!;

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!select.value) return;
  note.textContent = "正在启动牌组…";
  try {
    await invoke("start_deck_review", { name: select.value });
    await getCurrentWindow().emitTo("main", "deck-started");
    await getCurrentWindow().close();
  } catch (error) {
    note.textContent = messageFrom(error);
  }
});

document.querySelector("#close-decks")!.addEventListener("click", () => void getCurrentWindow().close());

async function start(): Promise<void> {
  try {
    const decks = await invoke<string[]>("list_decks");
    for (const name of decks) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.append(option);
    }
    note.textContent = decks.length ? "选择后由 Anki 开始复习。" : "没有找到牌组。";
  } catch (error) {
    note.textContent = messageFrom(error);
  }
}

void start();
