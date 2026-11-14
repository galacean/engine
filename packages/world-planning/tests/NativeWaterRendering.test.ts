import { WATER_BUILTIN_SHADER_SOURCES } from "@galacean/engine-water/water/native/WaterBuiltinShaderSources";
import { createWaterQualitySettings } from "@galacean/engine-water/water/native/WaterQualitySettings";
import { expect, it } from "vitest";
import { MeshRenderer, Shader } from "@galacean/engine";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/index";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import type { WaterShapeAuthoring } from "@galacean/engine-water/water/native/WaterAuthoring";
import { openWaterEditorFixture } from "./WaterEditorFixture";

it.each(["lake", "river", "ocean"] as const)(
  "renders the explicit native %s preset identically through compiled and source shaders",
  async (kind) => {
    const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
    const current = await openWaterEditorFixture(
      `water-pixels:${crypto.randomUUID()}`,
      manifest,
      BUILTIN_WATER_PROJECT_URL
    );
    current.engine.time.timeScale = 0;
    current.engine.canvas.setResolution(256, 256);
    let authoredShader: Shader | undefined;
    try {
      expect((await current.water.execute(async () => {})).runtimeError).toBeUndefined();
      let identity = current.editor.projection.queryComponents({ type: "WaterBodyComponent" })[0];
      if (kind !== "lake") {
        expect((await current.water.change({ operation: "remove", id: identity.id })).runtimeError).toBeUndefined();
        const shape: WaterShapeAuthoring =
          kind !== "ocean"
            ? {
                kind: "river",
                speed: 0,
                course: {
                  id: "render-river",
                  points: [
                    { id: "head", x: 1, z: 4, elevation: 0, width: 4, depth: 1 },
                    { id: "tail", x: 7, z: 4, elevation: 0, width: 4, depth: 1 }
                  ]
                }
              }
            : {
                kind,
                waterLevel: 0.25,
                layout: {
                  schemaVersion: 1,
                  kind: "ocean-surface-layout",
                  centerXZ: [4, 4],
                  size: 12,
                  surfaceTopology: "finite",
                  finitePatchGridSize: 4
                }
              };
        const created = await current.water.change({
          operation: "create",
          name: kind,
          input: {
            shape,
            terrain: {
              mode: "asset",
              description: { $ref: "Water/Terrain/manual-bed.json" },
              heights: { $ref: "Water/Terrain/manual-bed.bin" }
            },
            material: { $ref: `Water/Materials/${kind}.mat` },
            quality: createWaterQualitySettings(kind)
          }
        });
        expect(created.runtimeError).toBeUndefined();
        identity = current.editor.projection.queryComponents({ id: created.value })[0];
      }
      const body = current.editor.projection.component(identity.id) as WaterBodyComponent,
        native = body.configuration!;
      const renderers: MeshRenderer[] = [];
      for (const root of current.engine.sceneManager.activeScene!.rootEntities)
        root.getComponentsIncludeChildren(MeshRenderer, renderers);
      expect(renderers.some((renderer) => renderer.getMaterial()?.shader === native.material!.shader)).toBe(true);
      const gl = current.canvas.getContext("webgl2")!;
      const render = () => {
        current.engine.update();
        expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBeNull();
        const pixels = new Uint8Array(256 * 256 * 4);
        gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        expect(gl.getError()).toBe(0);
        return pixels;
      };
      const converted = render();
      const originalShader = native.material!.shader;
      authoredShader = Shader.create(
        WATER_BUILTIN_SHADER_SOURCES[kind].replace(
          `Water/${kind === "lake" ? "Lake" : kind === "river" ? "River" : "Ocean"}.v1`,
          `WaterParity/${kind}`
        )
      );
      native.material!.shader = authoredShader;
      await body.refresh();
      const original = render();
      native.material!.shader = originalShader;
      await body.refresh();
      let maximumDelta = 0;
      for (let index = 0; index < converted.length; index++)
        maximumDelta = Math.max(maximumDelta, Math.abs(converted[index] - original[index]));
      expect(maximumDelta).toBe(0);
      await (await current.system.prepareBatch([{ body, configuration: { ...native, visible: false } }])).commit()
        .retiredCleanup;
      const empty = render();
      let waterPixels = 0;
      for (let index = 0; index < converted.length; index += 4)
        if (
          converted[index] !== empty[index] ||
          converted[index + 1] !== empty[index + 1] ||
          converted[index + 2] !== empty[index + 2]
        )
          waterPixels++;
      expect(waterPixels).toBeGreaterThan(1000);
    } finally {
      await current.close();
      authoredShader?.destroy();
    }
  }
);
