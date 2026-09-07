const SOUND_PATTERN = /\[sound:([^\]\r\n]+)]/gi;
const ANKI_PLAY_PATTERN = /\[anki:play:[qa]:\d+]/gi;
const CSS_URL_PATTERN = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;

export function extractSoundFilenames(html: string): string[] {
  return [...html.matchAll(SOUND_PATTERN)].map((match) => match[1].trim());
}

export function removeSoundMarkers(html: string): string {
  return html.replace(SOUND_PATTERN, "").replace(ANKI_PLAY_PATTERN, "");
}

export function normalizeMediaName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /^(?:data|blob|https?|asset):/i.test(trimmed)) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }

  decoded = decoded.replace(/^\.?\//, "");
  if (!decoded || decoded.includes("/") || decoded.includes("\\") || decoded === "." || decoded === "..") {
    return null;
  }
  return decoded;
}

export function extractHtmlMediaFilenames(html: string): string[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const names = [...extractSoundFilenames(html)];
  for (const element of document.querySelectorAll<HTMLImageElement | HTMLMediaElement | HTMLSourceElement>(
    "img[src], audio[src], video[src], source[src]",
  )) {
    const name = normalizeMediaName(element.getAttribute("src") ?? "");
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

export function extractCssMediaFilenames(css: string): string[] {
  const names: string[] = [];
  for (const match of css.matchAll(CSS_URL_PATTERN)) {
    const name = normalizeMediaName(match[2]);
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

export function rewriteCssMedia(css: string, urls: ReadonlyMap<string, string>): string {
  return css.replace(CSS_URL_PATTERN, (whole, _quote: string, rawValue: string) => {
    const name = normalizeMediaName(rawValue);
    return name && urls.has(name) ? `url("${urls.get(name)}")` : whole;
  });
}
