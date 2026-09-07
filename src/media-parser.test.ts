import { describe, expect, it } from "vitest";
import {
  extractCssMediaFilenames,
  extractSoundFilenames,
  normalizeMediaName,
  removeSoundMarkers,
  rewriteCssMedia,
} from "./media-parser";

describe("media parsing", () => {
  it("extracts and removes Anki sound markers", () => {
    const html = "猫 [sound:neko.mp3] [sound:例句 01.ogg] [anki:play:q:0]";
    expect(extractSoundFilenames(html)).toEqual(["neko.mp3", "例句 01.ogg"]);
    expect(removeSoundMarkers(html)).toBe("猫   ");
  });

  it("accepts flat Anki filenames and rejects remote or traversing paths", () => {
    expect(normalizeMediaName("image%2001.jpg")).toBe("image 01.jpg");
    expect(normalizeMediaName("https://example.com/image.jpg")).toBeNull();
    expect(normalizeMediaName("../secret.txt")).toBeNull();
  });

  it("rewrites local CSS media URLs", () => {
    const css = ".card{background:url('paper.png')} @font-face{src:url(font.woff2)}";
    expect(extractCssMediaFilenames(css)).toEqual(["paper.png", "font.woff2"]);
    expect(rewriteCssMedia(css, new Map([["paper.png", "asset://paper"]]))).toContain('url("asset://paper")');
  });
});
