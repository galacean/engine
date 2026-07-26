import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readWaterPcgSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

describe("Water PCG debug panel visibility", () => {
  it("keeps every runtime debug panel mounted and visible independently of route mode", () => {
    const htmlSource = readWaterPcgSource("index.html");
    const routerSource = readWaterPcgSource("demo/router.ts");
    const riverSource = readWaterPcgSource("demo/main.ts");
    const poolSource = readWaterPcgSource("demo/pool/main.ts");
    const oceanSource = readWaterPcgSource("demo/ocean/main.ts");
    const heightfieldSource = readWaterPcgSource("demo/heightfield/main.ts");
    const grasslandsSource = readWaterPcgSource("demo/grasslands/main.ts");

    expect(htmlSource.match(/data-water-debug-panel/g)).toHaveLength(5);
    expect(htmlSource).not.toContain("data-dev-only");
    expect(htmlSource).not.toContain("data-p1-controls hidden");
    expect(routerSource).toContain('document.documentElement.dataset.waterPcgDebugPanels = "visible";');

    expect(riverSource).toContain('waterDebugPanel.root.dataset.waterDebugPanel = "";');
    expect(riverSource).not.toContain("waterDebugPanel.root.hidden");
    expect(riverSource).not.toContain("developerToolsEnabled");

    expect(poolSource).toContain('p1Controls?.removeAttribute("hidden");');
    expect(oceanSource).toContain('gui = new dat.GUI({ name: "Ocean Showcase Diagnostics", width: 290 });');
    expect(oceanSource).not.toContain("developerToolsEnabled");
    expect(heightfieldSource).toContain('gui = new dat.GUI({ name: "Heightfield water" });');
    expect(heightfieldSource).not.toContain("if (developerTools)");
    expect(grasslandsSource).toContain("statusElement.dataset.state = state;");
    expect(grasslandsSource).toContain("document.documentElement.dataset.waterPcgAutomation = String(automation);");
    expect(grasslandsSource).not.toContain("developerToolsEnabled");
    expect(htmlSource).toContain(
      'html[data-water-pcg-automation="true"][data-water-pcg-runtime="grasslands"] #example-bar'
    );
    expect(htmlSource).toContain(
      'html[data-water-pcg-automation="true"][data-water-pcg-runtime="grasslands"] #case-intro'
    );
    expect(htmlSource).toContain(
      'html[data-water-pcg-automation="true"][data-water-pcg-runtime="grasslands"] #grasslands-water-hud'
    );
    expect(htmlSource).toContain(
      'html[data-water-pcg-automation="true"][data-water-pcg-runtime="grasslands"] #fixture-mark'
    );
  });
});
