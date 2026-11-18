import { expect, it } from "vitest";
import {
  Camera,
  Color,
  Layer,
  RenderFace,
  RenderTarget,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { createBuildingDistanceView } from "../../../packages/building/src/building/runtime/BuildingDistanceView";
import {
  buildingGroupKey,
  buildingPartKey
} from "../../../packages/building/src/building/runtime/BuildingObjectIdentity";
import { masonryAppearance } from "../../../packages/building/src/building/runtime/MasonryAppearance";
import { NullGraphicDevice } from "../../../packages/rhi-null/src/NullGraphicDevice";
import { TerrainClipmap } from "../../../packages/terrain/src/terrain/clipmap/TerrainClipmap";
import {
  OceanNearshoreOutsidePolicy,
  OceanNearshoreSchemaVersion
} from "../../../packages/water/src/water/authoring/ocean/OceanNearshoreTypes";
import {
  FINITE_OCEAN_SURFACE_LAYER,
  FiniteOceanSurfaceGeometry
} from "../../../packages/water/src/water/runtime/ocean/FiniteOceanSurfaceGeometry";
import { WaterReflectionPreRenderSynchronizer } from "../../../packages/water/src/water/runtime/optics/WaterReflectionPreRenderSynchronizer";
import { SeedWorldPicker } from "../../../packages/world-planning/src/world/SeedWorldPicker";
import { decodeViewIdentity } from "../../../packages/world-planning/src/world/SeedWorldViewSnapshot";

async function createEngine(size = 96) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
}

it("reports the available color outputs through the public hardware contract", async () => {
  const nullDevice = new NullGraphicDevice();
  expect(nullDevice.isWebGL2).toBe(false);
  expect(nullDevice.capability.maxDrawBuffers).toBe(0);
  for (const mode of [WebGLMode.WebGL1, WebGLMode.WebGL2]) {
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      graphicDeviceOptions: { webGLMode: mode }
    });
    try {
      const hardware = engine._hardwareRenderer;
      const webGL2 = mode === WebGLMode.WebGL2;
      const gl = hardware.gl;
      const extension = webGL2 ? null : gl.getExtension("WEBGL_draw_buffers");
      const maxDrawBuffers = webGL2
        ? gl.getParameter((gl as WebGL2RenderingContext).MAX_DRAW_BUFFERS)
        : extension
          ? gl.getParameter(extension.MAX_DRAW_BUFFERS_WEBGL)
          : 1;
      expect(hardware.isWebGL2).toBe(webGL2);
      expect(hardware.capability.maxDrawBuffers).toBe(maxDrawBuffers);
    } finally {
      engine.destroy();
    }
  }
});

it("picks each visible far-proxy surface using the same identity as its detailed geometry", async () => {
  const engine = await createEngine(192);
  try {
    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity("masonry test");
    const eye = scene.createRootEntity("camera");
    eye.transform.setPosition(0, 0, 5);
    eye.transform.lookAt(new Vector3());
    const camera = eye.addComponent(Camera);
    camera.enablePostProcess = true;
    const palette = { id: "wall", seed: 0, wallColor: 0, roofColor: 0, woodColor: 0 };
    const wall = (x: number, pickId?: string) => ({
      owner: "wall",
      pickId,
      material: "wall" as const,
      color: [1, 1, 1],
      positions: [x - 0.75, -1, 0, x + 0.75, -1, 0, x + 0.75, 1, 0, x - 0.75, 1, 0],
      indices: [0, 1, 2, 0, 2, 3],
      uvs: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1]
      ]
    });
    const view = await createBuildingDistanceView(
      engine,
      root,
      { colorOwners: [palette], paletteSlots: [palette] },
      {
        parts: [wall(-1), wall(1, "extension")],
        decorationParts: [],
        retainedWallUnits: [],
        archGroups: [],
        bounds: { min: [-1.75, -1, 0], max: [1.75, 1, 0] },
        stones: [],
        frames: [],
        woodArchFrames: [],
        woodArchPillars: []
      },
      null!,
      camera
    );
    const picker = new SeedWorldPicker(camera);
    try {
      view.setVisualVisible(true);
      masonryAppearance(engine).setColor("brick", "#476b91");
      const ids = [buildingGroupKey("wall"), buildingPartKey("extension")];
      for (const far of [true, false, true]) {
        view.setFarProxyActive(far);
        await Promise.resolve();
        const collected: string[] = [];
        const framePromise = picker.capture(
          (visitor) =>
            view.visitPickBatches((batch) => {
              collected.push(batch.renderer.entity.name);
              visitor(batch);
            }),
          () => ({ entityId: 1, componentId: 1, componentType: "wall" })
        );
        engine.update();
        const frame = await framePromise;
        try {
          const picks = [0.34, 0.66].map((x) => {
            const pixel = frame.identities.read(Math.floor(frame.width * x), frame.height >> 1, 1, 1);
            const id = decodeViewIdentity(pixel, 0, frame.identities.identityBits);
            return frame.identities.resolve(id)?.instanceKey;
          });
          expect(picks).toEqual(ids);
          expect(collected).toEqual(far ? ["Far proxy surfaces"] : ["wall", "wall"]);
          expect(view.root.findByName("Far proxy surfaces")!.isActive).toBe(far);
        } finally {
          frame.identities.dispose();
          frame.image.dispose();
        }
      }
    } finally {
      picker.dispose();
      view.destroy();
    }
  } finally {
    engine.destroy();
  }
});

it("keeps the second camera's ocean when the reflection camera excludes its layer", async () => {
  const engine = await createEngine();
  try {
    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor = new Color(0, 0, 0, 1);
    const root = scene.createRootEntity("ocean test");
    const material = new UnlitMaterial(engine);
    material.baseColor = new Color(1, 0, 0, 1);
    material.renderFace = RenderFace.Double;
    const outside = OceanNearshoreOutsidePolicy.DeepOcean;
    const geometry = new FiniteOceanSurfaceGeometry(
      engine,
      root,
      { near: material, far: material },
      {
        nearshore: {
          schemaVersion: OceanNearshoreSchemaVersion.V1,
          id: "ocean-test",
          waterLevel: 0,
          grid: { originXZ: [0, 0], cellSizeXZ: [1, 1], width: 2, height: 2 },
          bedHeights: new Float32Array(4).fill(-1),
          wetSource: { kind: "water-level" },
          outsidePolicy: { negativeX: outside, positiveX: outside, negativeZ: outside, positiveZ: outside }
        },
        surfaceCenterXZ: [0, 0],
        size: 200,
        waterLevel: 0,
        maximumDisplacement: { x: 0, y: 0, z: 0 },
        initialCameraPositionXZ: { x: 0, z: 0 },
        initialPresentationPath: "detailed"
      }
    );
    const cameraAt = (name: string, priority: number) => {
      const eye = scene.createRootEntity(name);
      eye.transform.setPosition(0, 20, 5);
      eye.transform.lookAt(new Vector3());
      const camera = eye.addComponent(Camera);
      camera.priority = priority;
      camera.isOrthographic = true;
      camera.orthographicSize = 4;
      camera.enableFrustumCulling = false;
      camera.cullingMask = FINITE_OCEAN_SURFACE_LAYER;
      return camera;
    };
    const source = cameraAt("Reflection camera", 0);
    const observer = cameraAt("Observer camera", 1);
    const texture = new Texture2D(engine, 96, 96, TextureFormat.R8G8B8A8, false);
    const target = new RenderTarget(engine, 96, 96, texture);
    observer.renderTarget = target;
    const sync = source.entity.addComponent(WaterReflectionPreRenderSynchronizer);
    const demand: boolean[] = [];
    sync.configure({
      sourceCamera: source,
      service: { update() {} },
      beforeUpdate: () => {
        demand.push(
          geometry.hasCameraVisibleChunk({ isVisible: (_bounds, layer) => Boolean(source.cullingMask & layer) })
        );
      }
    });
    try {
      const pixel = new Uint8Array(4);
      for (const mask of [FINITE_OCEAN_SURFACE_LAYER, Layer.Layer0, FINITE_OCEAN_SURFACE_LAYER]) {
        source.cullingMask = mask;
        engine.update();
        texture.getPixelBuffer(48, 48, 1, 1, 0, pixel);
        expect(Array.from(pixel)).toEqual([255, 0, 0, 255]);
      }
      expect(demand).toEqual([true, false, true]);
    } finally {
      observer.renderTarget = null;
      target.destroy();
      texture.destroy();
      geometry.destroy();
    }
  } finally {
    engine.destroy();
  }
});

it("refreshes local terrain bounds for a canonical height frame with a stationary camera", async () => {
  const engine = await createEngine();
  try {
    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity("terrain test");
    const camera = scene.createRootEntity("camera").addComponent(Camera);
    const clipmap = new TerrainClipmap(
      engine,
      root,
      camera,
      {
        vertexSpacing: 1,
        minHeight: 0,
        maxHeight: 100,
        sources: [
          {
            id: "region",
            worldPosition: [-32, 0, -32],
            worldSize: [64, 100, 64],
            heightSampleSize: [65, 65],
            heightDecodeOffset: 0,
            heightDecodeScale: 100,
            heightSamples: new Uint16Array(65 ** 2).fill(2000)
          }
        ]
      },
      new UnlitMaterial(engine),
      16,
      3
    );
    try {
      clipmap.snap(new Vector3());
      const maxHeight = () => {
        let max = -Infinity;
        clipmap.visitRenderers((renderer) => {
          max = Math.max(max, renderer.bounds.max.y);
        });
        return max;
      };
      expect(maxHeight()).toBeLessThan(5);
      const heightFrame = {
        regionId: "region",
        sampleOrigin: [30, 30] as const,
        sampleSize: [5, 5] as const,
        samples: new Uint16Array(25).fill(46000)
      };
      clipmap.updateHeightRegionFrame(heightFrame);
      expect(maxHeight()).toBeGreaterThan(70);
      // Changing the decode range requires a complete Region frame.
      const fullFrame = {
        regionId: "region",
        sampleOrigin: [0, 0] as const,
        sampleSize: [65, 65] as const,
        samples: new Uint16Array(65 ** 2).fill(46000)
      };
      clipmap.updateHeightRegionFrame({ ...fullFrame, heightDecode: { offset: 50, scale: 100 } });
      expect(maxHeight()).toBeGreaterThan(120);
      clipmap.updateHeightRegionFrame(fullFrame);
      expect(maxHeight()).toBeCloseTo(71.1915, 3);
    } finally {
      clipmap.destroy();
    }
  } finally {
    engine.destroy();
  }
});
