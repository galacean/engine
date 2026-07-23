import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Layer } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { createWaterOpticsLabFixture } from "../../demo/examples/water-optics-lab/WaterOpticsLabFixture";
import {
  analyzeWaterOpticsPlanarAnchor,
  createWaterOpticsPlanarAnchorExpectedPoint,
  WATER_OPTICS_PLANAR_ANCHOR_COLOR,
  WATER_OPTICS_PLANAR_ANCHOR_ID,
  WATER_OPTICS_PLANAR_ANCHOR_LAYER,
  WATER_OPTICS_PLANAR_ANCHOR_MAXIMUM_ERROR_PX,
  WATER_OPTICS_PLANAR_ANCHOR_POSITION,
  WATER_OPTICS_PLANAR_ANCHOR_SEARCH_RADIUS_PX,
  WATER_OPTICS_PLANAR_ANCHOR_SIZE
} from "../../demo/examples/water-optics-lab/WaterOpticsPlanarAnchorReference";

function readWaterPcgSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

function setPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number]
): void {
  const offset = (y * width + x) * 4;
  pixels.set(color, offset);
}

describe("Water Optics Planar anchor reference", () => {
  it("creates one lime Layer28 marker visible to Planar but excluded from the source Camera", () => {
    const fixture = createWaterOpticsLabFixture("medium");
    const anchor = fixture.targets.find((target) => target.id === WATER_OPTICS_PLANAR_ANCHOR_ID);
    expect(anchor).toEqual({
      id: WATER_OPTICS_PLANAR_ANCHOR_ID,
      kind: "planar-anchor",
      position: WATER_OPTICS_PLANAR_ANCHOR_POSITION,
      size: WATER_OPTICS_PLANAR_ANCHOR_SIZE,
      color: WATER_OPTICS_PLANAR_ANCHOR_COLOR
    });
    expect(WATER_OPTICS_PLANAR_ANCHOR_LAYER).toBe(Layer.Layer28);

    const sourceCameraMask = Layer.Everything & ~Layer.Layer29 & ~WATER_OPTICS_PLANAR_ANCHOR_LAYER;
    const planarCameraMask = Layer.Everything & ~Layer.Layer30;
    expect(sourceCameraMask & WATER_OPTICS_PLANAR_ANCHOR_LAYER).toBe(0);
    expect(planarCameraMask & WATER_OPTICS_PLANAR_ANCHOR_LAYER).toBe(WATER_OPTICS_PLANAR_ANCHOR_LAYER);

    const sceneSource = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabScene.ts");
    const mainSource = readWaterPcgSource("demo/examples/water-optics-lab/main.ts");
    expect(sceneSource).toContain('target.kind === "planar-anchor"');
    expect(sceneSource).toContain("entity.layer = WATER_OPTICS_PLANAR_ANCHOR_LAYER");
    expect(mainSource).toContain("~WATER_OPTICS_PLANAR_ANCHOR_LAYER");
  });

  it("derives the expected source-screen point through reflection and a water-plane ray intersection", () => {
    let projectedWorldPoint: Vector3 | undefined;
    const sourceCamera = {
      entity: { transform: { worldPosition: new Vector3(0, 6, 18) } },
      worldToScreenPoint: (point: Vector3, out: Vector3): Vector3 => {
        projectedWorldPoint = point.clone();
        out.set(700, 350, 20);
        return out;
      }
    } as unknown as Parameters<typeof createWaterOpticsPlanarAnchorExpectedPoint>[0];

    const reference = createWaterOpticsPlanarAnchorExpectedPoint(sourceCamera, [4, 2, -6], 0);

    expect(reference.reflectedMarkerWorldPoint).toEqual([4, -2, -6]);
    expect(reference.rayParameter).toBeCloseTo(0.75, 8);
    expect(reference.waterIntersectionWorldPoint).toEqual([3, 0, 0]);
    expect(projectedWorldPoint).toEqual(new Vector3(3, 0, 0));
    expect(reference.expectedScreenX).toBe(700);
    expect(reference.expectedScreenY).toBe(350);
    expect(reference.expectedScreenDepth).toBe(20);
    expect(JSON.parse(JSON.stringify(reference))).toMatchObject({
      expectedScreenX: 700,
      expectedScreenY: 350,
      waterIntersectionWorldPoint: [3, 0, 0]
    });
  });

  it("rejects an expected ray that cannot cross the water surface before the virtual marker", () => {
    const sourceCamera = {
      entity: { transform: { worldPosition: new Vector3(0, 0, 10) } },
      worldToScreenPoint: (_point: Vector3, out: Vector3): Vector3 => out
    } as unknown as Parameters<typeof createWaterOpticsPlanarAnchorExpectedPoint>[0];

    expect(() => createWaterOpticsPlanarAnchorExpectedPoint(sourceCamera, [1, 0, -2], 0)).toThrow(
      "parallel to the water surface"
    );
  });

  it("uses a full-resolution +/-24px green-advantage centroid and passes at no more than 3px", () => {
    const width = 1280;
    const height = 720;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const expectedScreenX = 900.5;
    const expectedScreenY = 420.5;
    const lime = [20, 240, 15, 255] as const;
    setPixel(pixels, width, 899, 420, lime);
    setPixel(pixels, width, 900, 420, lime);
    setPixel(pixels, width, 901, 420, lime);
    setPixel(pixels, width, 950, 420, lime);

    const analysis = analyzeWaterOpticsPlanarAnchor(pixels, width, height, expectedScreenX, expectedScreenY);

    expect(analysis).toMatchObject({
      width,
      height,
      expectedScreenX,
      expectedScreenY,
      observedScreenX: 900.5,
      observedScreenY: 420.5,
      errorX: 0,
      errorY: 0,
      errorPx: 0,
      searchRadiusPx: WATER_OPTICS_PLANAR_ANCHOR_SEARCH_RADIUS_PX,
      searchBounds: { minX: 877, minY: 397, maxX: 924, maxY: 444 },
      contributingPixelCount: 3,
      signalDetected: true,
      maximumErrorPx: WATER_OPTICS_PLANAR_ANCHOR_MAXIMUM_ERROR_PX,
      passed: true
    });
    expect(analysis.totalGreenAdvantage).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(analysis))).toEqual(analysis);
  });

  it("fails closed when the lime signal is missing or its centroid error exceeds 3px", () => {
    const width = 160;
    const height = 120;
    const pixels = new Uint8ClampedArray(width * height * 4);
    setPixel(pixels, width, 10, 10, [20, 120, 180, 255]);
    const missing = analyzeWaterOpticsPlanarAnchor(pixels, width, height, 1, 1);
    expect(missing).toMatchObject({
      searchBounds: { minX: 0, minY: 0, maxX: 25, maxY: 25 },
      observedScreenX: null,
      observedScreenY: null,
      errorPx: null,
      contributingPixelCount: 0,
      signalDetected: false,
      passed: false
    });

    setPixel(pixels, width, 104, 100, [20, 240, 15, 255]);
    const displaced = analyzeWaterOpticsPlanarAnchor(pixels, width, height, 100.5, 100.5);
    expect(displaced.observedScreenX).toBe(104.5);
    expect(displaced.observedScreenY).toBe(100.5);
    expect(displaced.errorPx).toBe(4);
    expect(displaced.signalDetected).toBe(true);
    expect(displaced.passed).toBe(false);
  });
});
