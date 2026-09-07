import DOMPurify from "dompurify";
import { invoke } from "@tauri-apps/api/core";
import type { CachedMedia } from "./types";
import {
  extractCssMediaFilenames,
  extractHtmlMediaFilenames,
  extractSoundFilenames,
  normalizeMediaName,
  removeSoundMarkers,
  rewriteCssMedia,
} from "./media-parser";

export interface RenderedSide {
  audioUrls: string[];
  missingMedia: string[];
}

async function cacheAll(names: string[]): Promise<{ urls: Map<string, string>; missing: string[] }> {
  const uniqueNames = [...new Set(names)];
  const entries = await Promise.all(
    uniqueNames.map(async (filename) => {
      try {
        const cached = await invoke<CachedMedia>("cache_media", { filename });
        return [filename, cached.dataUrl] as const;
      } catch {
        return null;
      }
    }),
  );
  const available = entries.filter((entry): entry is readonly [string, string] => entry !== null);
  const urls = new Map(available);
  return { urls, missing: uniqueNames.filter((name) => !urls.has(name)) };
}

function rewriteHtmlMedia(html: string, urls: ReadonlyMap<string, string>): string {
  const document = new DOMParser().parseFromString(removeSoundMarkers(html), "text/html");
  for (const element of document.querySelectorAll<HTMLElement>("img[src], audio[src], video[src], source[src]")) {
    const name = normalizeMediaName(element.getAttribute("src") ?? "");
    if (name && urls.has(name)) element.setAttribute("src", urls.get(name)!);
    element.removeAttribute("srcset");
    element.removeAttribute("autoplay");
  }
  return DOMPurify.sanitize(document.body.innerHTML, {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button"],
    FORBID_ATTR: ["srcdoc", "srcset"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

export async function renderCardSide(
  surface: HTMLElement,
  html: string,
  css: string,
  sideSounds: string[],
): Promise<RenderedSide> {
  const directSounds = extractSoundFilenames(html).map(normalizeMediaName).filter((name): name is string => Boolean(name));
  const soundNames = [...new Set([...sideSounds, ...directSounds])];
  const mediaNames = [...extractHtmlMediaFilenames(html), ...extractCssMediaFilenames(css), ...soundNames];
  const { urls, missing } = await cacheAll(mediaNames);
  const safeHtml = rewriteHtmlMedia(html, urls);
  const rewrittenCss = rewriteCssMedia(css, urls);
  const safeCss = rewrittenCss.replaceAll("<", "\\3C ");

  const root = surface.shadowRoot ?? surface.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host{display:block;min-height:100%;color:inherit}
    .card{box-sizing:border-box;padding:12px;overflow-wrap:anywhere}
    img,video{max-width:100%;max-height:130px;object-fit:contain}audio{max-width:100%}
  </style><style>${safeCss}</style><div id="card-content">${safeHtml}</div><style>
    #card-content{width:calc(100% / var(--content-scale, 1));zoom:var(--content-scale, 1);opacity:var(--content-opacity, 1)}
    #card-content,#card-content *{background:transparent!important;background-color:transparent!important;background-image:none!important}
  </style>`;

  return {
    audioUrls: soundNames.map((name) => urls.get(name)).filter((url): url is string => Boolean(url)),
    missingMedia: missing,
  };
}
