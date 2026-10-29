import { describe, expect, it } from "vitest";
import { avisoTaxa, mbps } from "./taxa-video";

describe("M20: taxa do vídeo (a Meta recusa acima de 25 Mbps)", () => {
  it("calcula a taxa média em Mbps", () => {
    expect(mbps(100_000_000, 20)).toBe(40); // 100 MB em 20 s = 40 Mbps
    expect(mbps(1000, 0)).toBe(0); // duração desconhecida não inventa taxa
  });
  it("avisa só acima do limite", () => {
    expect(avisoTaxa("nicolas.mp4", 40)).toMatch(/"nicolas.mp4" tem 40 Mbps.*25 Mbps/);
    expect(avisoTaxa("ok.mp4", 25)).toBe("");
    expect(avisoTaxa("ok.mp4", 12)).toBe("");
  });
});
