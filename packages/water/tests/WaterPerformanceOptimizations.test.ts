import { describe, expect, it, vi } from "vitest";
import {
  AssetType,
  BufferAsset,
  Camera,
  DepthTextureMode,
  Downsampling,
  JSONAsset,
  Material,
  Shader,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  createFiniteOceanNearFieldQuadrantTopology,
  resolveFiniteOceanNearFieldLayout,
  resolveGradedOceanFarFieldLayout
} from "../src/water/runtime/ocean/FiniteOceanSurfaceGeometry";
import {
  OCEAN_SCENE_FIELD_DEMAND_BUDGET,
  OceanSceneFieldDemandResolver
} from "../src/water/runtime/ocean/OceanSceneFieldDemand";
import { OceanNearshoreCompiler } from "../src/water/compiler/ocean/OceanNearshoreCompiler";
import { OceanNearshoreFieldResource } from "../src/water/runtime/ocean/OceanNearshoreFieldResource";
import { OceanWaterRuntimeController } from "../src/water/runtime/ocean/OceanWaterRuntimeController";
import { describeOceanTextures } from "../src/water/runtime/ocean/OceanTextures";
import { WaterReadonlyUint8Buffer } from "../src/water/compiler/shared/ReadonlyNumericBuffer";
import { CameraWaterFeatureBroker } from "../src/water/runtime/optics/CameraWaterFeatureBroker";
import { WaterReflectionBindingLifecycle } from "../src/water/runtime/optics/WaterReflectionBindingLifecycle";
import { createWaterSurfaceAppearanceV2NormalStatements } from "../src/water/runtime/surface/WaterSurfaceAppearanceV2Shader";
import { createHeightfieldWaterShaderSource } from "../src/water/runtime/heightfield/HeightfieldWaterMaterialFactory";
import { LAKE_COMPILED_SURFACE_APPEARANCE_V2 } from "../src/water/presets/lake/index";
import { WaterQualityTier } from "../src/water/authoring/wave/enums/WaterQualityTier";
import { WaterSurfaceDepthSource } from "../src/water/authoring/surface/enums/WaterSurfaceDepthSource";
import {
  WaterBodyComponent,
  WaterSystem,
  compileWaterShape,
  createWaterCreationPreset,
  encodeWaterTerrainAssets,
  registerNativeWater
} from "../src/water/native/index";
import { createWaterMaterialDefaults } from "../src/water/native/WaterMaterial";
import { createWaterQualitySettings } from "../src/water/native/WaterQualitySettings";
import { lake, terrain } from "./WaterFixtures";
import riverShaderSource from "../src/water/native/assets/Water/Shaders/river.shader?raw";
import lakeShaderSource from "../src/water/native/assets/Water/Shaders/lake.shader?raw";
import oceanShaderSource from "../src/water/native/assets/Water/Shaders/ocean.shader?raw";

describe("Water P0 + P1 performance optimizations", () => {
  it("builds a watertight 3-ring concentric Ocean near-field mesh (~51.6k tris) with +Y winding and exact seams", () => {
    const layout = resolveFiniteOceanNearFieldLayout();
    const farLayout = resolveGradedOceanFarFieldLayout();
    expect(layout.triangleCount).toBe(51_648);
    expect(layout.vertexCount).toBe(26_372);
    expect(layout.cellSizeMetres).toBe(2);
    expect(layout.outerCellSizeMetres).toBe(8);
    expect(layout.rings.map((ring) => [ring.outerHalfExtentMetres, ring.cellSizeMetres])).toEqual([
      [128, 2],
      [192, 4],
      [320, 8]
    ]);
    // Outer ring matches graded-far-field 8m segments 1-to-1.
    expect((farLayout.innerHalfExtentMetres * 2) / farLayout.segmentsPerEdge).toBe(layout.outerCellSizeMetres);

    let totalArea = 0;
    let totalTriangles = 0;
    let totalVertices = 0;
    const edgeCounts = new Map<string, number>();
    const vertexCellSizes = new Map<string, number>();

    const pointKey = (x: number, z: number) => `${x},${z}`;
    const edgeKey = (ax: number, az: number, bx: number, bz: number) => {
      const a = pointKey(ax, az);
      const b = pointKey(bx, bz);
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };

    for (const signX of [-1, 1] as const) {
      for (const signZ of [-1, 1] as const) {
        const topo = createFiniteOceanNearFieldQuadrantTopology(layout, signX, signZ);
        expect(topo.positions.length).toBeLessThanOrEqual(65_535);
        totalVertices += topo.positions.length;
        totalTriangles += topo.indices.length / 3;

        for (let i = 0; i < topo.positions.length; i++) {
          const p = topo.positions[i]!;
          const key = pointKey(p.x, p.z);
          const cellSize = topo.uvs[i]!.x;
          const prev = vertexCellSizes.get(key);
          if (prev !== undefined) {
            expect(cellSize, `shared seam cellSize mismatch at ${key}`).toBe(prev);
          } else {
            vertexCellSizes.set(key, cellSize);
          }
        }

        for (let i = 0; i < topo.indices.length; i += 3) {
          const p0 = topo.positions[topo.indices[i]!]!;
          const p1 = topo.positions[topo.indices[i + 1]!]!;
          const p2 = topo.positions[topo.indices[i + 2]!]!;
          const e1x = p1.x - p0.x;
          const e1z = p1.z - p0.z;
          const e2x = p2.x - p0.x;
          const e2z = p2.z - p0.z;
          // Cross product (p1 - p0) x (p2 - p0) Y component: e1z * e2x - e1x * e2z
          const crossY = e1z * e2x - e1x * e2z;
          expect(crossY, `triangle ${i / 3} in quadrant (${signX},${signZ}) must wind +Y`).toBeGreaterThan(0);
          totalArea += crossY * 0.5;

          for (const [a, b] of [
            [p0, p1],
            [p1, p2],
            [p2, p0]
          ] as const) {
            const ek = edgeKey(a.x, a.z, b.x, b.z);
            edgeCounts.set(ek, (edgeCounts.get(ek) ?? 0) + 1);
          }
        }
      }
    }

    expect(totalTriangles).toBe(layout.triangleCount);
    expect(totalVertices).toBe(layout.vertexCount);
    expect(totalArea).toBeCloseTo(layout.windowSizeMetres * layout.windowSizeMetres, 4);

    // Every boundary edge (count === 1) must lie exclusively on the outer ±320m square and have length 8m.
    let outerBoundaryEdgeCount = 0;
    for (const [ek, count] of edgeCounts) {
      if (count === 2) continue;
      expect(count, `unexpected non-manifold edge ${ek}`).toBe(1);
      const [aStr, bStr] = ek.split("|");
      const [ax, az] = aStr!.split(",").map(Number) as [number, number];
      const [bx, bz] = bStr!.split(",").map(Number) as [number, number];
      const onOuterBorder =
        (Math.abs(ax) === 320 && Math.abs(bx) === 320) || (Math.abs(az) === 320 && Math.abs(bz) === 320);
      expect(onOuterBorder, `interior T-junction or crack at edge ${ek}`).toBe(true);
      expect(Math.hypot(bx - ax, bz - az)).toBe(8);
      outerBoundaryEdgeCount++;
    }
    expect(outerBoundaryEdgeCount).toBe(farLayout.segmentsPerEdge * 4);
  });

  it("switches inland cameras beyond 304m to Ocean far-only even when RGBA8 shore SDF saturates at 64m", () => {
    const width = 256;
    const height = 256;
    const worldSize = 1024; // 4m per texel
    const cellSize = worldSize / width;
    const pixels = new Uint8Array(width * height * 4);
    const shoreDistanceRange = 64;
    // Wet ocean ring on outer 32m border (8 texels); dry island interior [32..992] (radius ~480m to center).
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const wet = x < 8 || x >= width - 8 || z < 8 || z >= height - 8;
        const offset = (z * width + x) * 4;
        pixels[offset] = wet ? 255 : 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = wet ? 128 : 0;
        // Simulate RGBA8 clamping to -64m across dry interior.
        pixels[offset + 3] = wet ? 255 : 1;
      }
    }
    const resolver = new OceanSceneFieldDemandResolver(
      {
        width,
        height,
        pixels: new WaterReadonlyUint8Buffer(pixels),
        worldToUv: [1 / worldSize, 1 / worldSize, 0, 0],
        maximumDepth: 16,
        shoreDistanceRange,
        wetShoreDistanceCode: 129
      },
      { horizontalMagnitude: 2, vertical: 1 }
    );

    expect(OCEAN_SCENE_FIELD_DEMAND_BUDGET.releaseMarginMetres).toBe(16);
    expect(OCEAN_SCENE_FIELD_DEMAND_BUDGET.reacquireMarginMetres).toBe(8);

    // Center of island (512, 512) is ~480m from wet ocean (> 304m release threshold) -> far-only!
    const inland = resolver.resolve(512, 10, 512, 0, true);
    expect(inland.required).toBe(false);
    expect(inland.reason).toBe("far-only");
    expect(inland.conservativeHorizontalDryDistanceMetres).toBeGreaterThan(400);

    // Coastal position (150, 512) is ~118m from wet ocean (< 296m reacquire threshold) -> detailed!
    const coastal = resolver.resolve(150, 10, 512, 0, false);
    expect(coastal.required).toBe(true);
    expect(coastal.reason).toBe("detailed-closure");
  });

  it("guards displaced refraction fetches, removes dead riverSampleScene, and simplifies half-res SSRReceiver micro-normals", () => {
    // Dead riverSampleScene helper is no longer injected into river shader
    expect(riverShaderSource).not.toContain("riverSampleScene");

    // Guarded displaced opaque color fetch in shipped builtin shaders
    expect(riverShaderSource).toContain("refractionSampleValidity > 0.001");
    expect(lakeShaderSource).toContain("refractionSampleValidity > 0.001");
    expect(oceanShaderSource).toContain("refractionValidity > 0.001");

    // Ocean vertex shader applies continuous camera-distance sampling cell size across all wave groups
    expect(oceanShaderSource).toContain("oceanGeometryEffectiveSamplingCellSize");
    expect(oceanShaderSource).toContain("smoothstep(96.0, 112.0, distanceToCamera)");
    expect(oceanShaderSource).toContain("smoothstep(160.0, 176.0, distanceToCamera)");
    expect(oceanShaderSource).not.toContain("oceanGeometryWaveGridWeight(waveWavelength, attributes.TEXCOORD_0.x)");

    // Mathematical invariance check: effectiveSamplingCellSize is continuous across 128m/192m seams and 32m snap
    const smoothstep = (e0: number, e1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    const continuousCell = (d: number) => 2 + 2 * smoothstep(96, 112, d) + 4 * smoothstep(160, 176, d);
    const meshCell = (dx: number, dz: number) => {
      const r = Math.max(Math.abs(dx), Math.abs(dz));
      return r < 128 ? 2 : r < 192 ? 4 : 8;
    };
    const effective = (wx: number, wz: number, camX: number, camZ: number, snapX: number, snapZ: number) =>
      Math.max(meshCell(wx - snapX, wz - snapZ), continuousCell(Math.hypot(wx - camX, wz - camZ)));
    // Camera right at the 32m snap boundary (x = 16): snapping origin from 0 -> 32 changes no world point's effective cell size.
    for (let wx = -240; wx <= 280; wx += 4) {
      expect(effective(wx, 0, 16, 0, 0, 0)).toBeCloseTo(effective(wx, 0, 16, 0, 32, 0), 6);
    }

    // River builtin SSRReceiver omits Detail1 while Forward keeps Detail1
    const riverForwardIdx = riverShaderSource.indexOf('Pass "Forward"');
    const riverSsrIdx = riverShaderSource.indexOf('Pass "SSRReceiver"');
    expect(riverForwardIdx).toBeGreaterThan(-1);
    expect(riverSsrIdx).toBeGreaterThan(riverForwardIdx);
    const riverForwardPart = riverShaderSource.slice(riverForwardIdx, riverSsrIdx);
    const riverSsrPart = riverShaderSource.slice(riverSsrIdx);
    expect(riverForwardPart).toContain("texture2D(material_AppearanceV2Detail1Texture");
    expect(riverSsrPart).not.toContain("texture2D(material_AppearanceV2Detail1Texture");

    // Lake builtin SSRReceiver omits Detail1 and rainRippleField micro-normal fetches and uses conservative storm roughness
    const lakeForwardIdx = lakeShaderSource.indexOf('Pass "Forward"');
    const lakeSsrIdx = lakeShaderSource.indexOf('Pass "SSRReceiver"');
    const lakeForwardPart = lakeShaderSource.slice(lakeForwardIdx, lakeSsrIdx);
    const lakeSsrPart = lakeShaderSource.slice(lakeSsrIdx);
    expect(lakeForwardPart).toContain("texture2D(material_AppearanceV2Detail1Texture");
    expect(lakeSsrPart).not.toContain("texture2D(material_AppearanceV2Detail1Texture");
    expect(lakeSsrPart).not.toContain("rainRipplePrimarySample");
    expect(lakeSsrPart).toContain("rainRippleStormAmount * 0.02");
    expect(lakeSsrPart).not.toContain("rainRippleStormAmount * 0.08");

    // V2 normal statement generator respects maxDetailLayers: 1
    const singleLayerNormal = createWaterSurfaceAppearanceV2NormalStatements(LAKE_COMPILED_SURFACE_APPEARANCE_V2, {
      boundedTime: true,
      maxDetailLayers: 1
    });
    expect(singleLayerNormal).toContain("material_AppearanceV2Detail0Texture");
    expect(singleLayerNormal).not.toContain("material_AppearanceV2Detail1Texture");

    // JIT Heightfield shader generator also emits simplified SSRReceiver
    const hfShader = createHeightfieldWaterShaderSource(
      WaterQualityTier.High,
      0,
      LAKE_COMPILED_SURFACE_APPEARANCE_V2,
      WaterSurfaceDepthSource.HybridOptionalSceneDepth
    );
    expect(hfShader).toContain("SSRReceiver");
  });

  it("defaults CameraWaterFeatureBroker high quality to 2x downsampling and releases leases out of frustum", () => {
    const camera = {
      depthTextureMode: DepthTextureMode.None,
      opaqueTextureEnabled: false,
      opaqueTextureDownsampling: Downsampling.None,
      _enableForwardDepthResolve: false
    };
    const broker = new CameraWaterFeatureBroker(camera);
    const highLease = broker.acquireRequest("water-high", {
      depthTexture: true,
      opaqueTexture: true,
      reflection: "ssr",
      caustics: false,
      quality: "high"
    });
    expect(camera.opaqueTextureEnabled).toBe(true);
    expect(camera.opaqueTextureDownsampling).toBe(Downsampling.TwoX);
    expect(broker.ssrRequested).toBe(true);

    // Explicit full-res override still works when requested.
    const fullResLease = broker.acquireRequest("water-full", {
      depthTexture: true,
      opaqueTexture: true,
      reflection: "ssr",
      caustics: false,
      quality: "high",
      opaqueDownsampling: Downsampling.None
    });
    expect(camera.opaqueTextureDownsampling).toBe(Downsampling.None);
    fullResLease.destroy();
    expect(camera.opaqueTextureDownsampling).toBe(Downsampling.TwoX);

    // Releasing final lease restores camera features cleanly.
    highLease.destroy();
    expect(camera.opaqueTextureEnabled).toBe(false);
    expect(camera.depthTextureMode).toBe(DepthTextureMode.None);
    expect(broker.ssrRequested).toBe(false);
    broker.destroy();

    // Frustum culling lifecycle releases ownership after 2 culled frames and restores immediately on visible.
    const states: Array<{ visible: boolean; surfaceFieldsRequired: boolean }> = [];
    const lifecycle = new WaterReflectionBindingLifecycle({
      service: {
        setRequest: () => 1,
        removeRequest: () => true,
        getBinding: () => undefined
      },
      request: {
        id: "river-test",
        visible: true,
        ssrEligible: true,
        policy: { preferred: "ssr", fallbacks: ["environment", "analytic"] },
        cullingMask: 1,
        waterLayerMask: 1
      },
      applyBinding: () => {}
    });
    lifecycle.attachCameraOwnership({
      setState: (state) => states.push({ visible: state.visible, surfaceFieldsRequired: state.surfaceFieldsRequired }),
      destroy: () => {}
    });
    expect(states[states.length - 1]).toEqual({ visible: true, surfaceFieldsRequired: true });
    lifecycle.observeCameraFrustumVisibility(false);
    expect(states[states.length - 1]!.visible).toBe(true); // 1-frame hysteresis
    lifecycle.observeCameraFrustumVisibility(false);
    expect(states[states.length - 1]!.visible).toBe(false); // released on 2nd culled frame
    lifecycle.observeCameraFrustumVisibility(true);
    expect(states[states.length - 1]!.visible).toBe(true); // restored immediately
    lifecycle.destroy();
  });

  it("throttles WaterSceneRuntimeHost.refreshTerrainOcclusion via public API and marks dirty on pose, revision, and visibility toggles", async () => {
    registerNativeWater();
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    try {
      const scene = engine.sceneManager.activeScene;
      const system = scene.createRootEntity("WaterSystemRoot").addComponent(WaterSystem);
      const camera = scene.createRootEntity("Camera").addComponent(Camera);
      camera.entity.transform.setPosition(10, 5, 10);
      camera.entity.transform.lookAt(new Vector3(4, 0, 4));
      system.camera = camera;
      system.beginInputUpdate();

      const file = createWaterMaterialDefaults("lake");
      const material = await engine.resourceManager.load<Material>({
        type: AssetType.Material,
        url: "data:application/json," + encodeURIComponent(JSON.stringify(file))
      });
      const encoded = encodeWaterTerrainAssets({
        ...terrain,
        origin: [-32, -32],
        columns: 65,
        rows: 65,
        heights: Array(65 * 65).fill(-2)
      });
      const description = new JSONAsset(engine);
      const heights = new BufferAsset(engine);
      description.data = encoded.description;
      heights.buffer = encoded.heights.buffer;
      const bodyEntity = scene.createRootEntity("Lake");
      const body = bodyEntity.addComponent(WaterBodyComponent);
      body.authoring = {
        shape: {
          ...lake,
          referenceLevel: 0,
          shoreline: [
            [-6, -6],
            [6, -6],
            [6, 6],
            [-6, 6]
          ].map(([x, z], index) => ({ id: `p${index}`, ring: "shore", x, z }))
        },
        terrain: { mode: "asset", description, heights },
        quality: createWaterQualitySettings("lake"),
        material,
        visible: true,
        priority: 10
      };
      await (await system.prepareBatch([{ body, configuration: body._compileAuthoring() }])).commit().retiredCleanup;

      const host = system.runtimeHost;
      let revision = 1;
      const isOccludedSpy = vi.fn(() => false);
      host.setTerrainOcclusionProvider({
        get revision() {
          return revision;
        },
        isOccluded: isOccludedSpy
      });

      // First call evaluates occlusion on active chunks.
      host.refreshTerrainOcclusion();
      const callsAfterFirst = isOccludedSpy.mock.calls.length;
      expect(callsAfterFirst).toBeGreaterThan(0);

      // Stationary frames with identical revision skip completely.
      host.refreshTerrainOcclusion();
      host.refreshTerrainOcclusion();
      expect(isOccludedSpy).toHaveBeenCalledTimes(callsAfterFirst);

      // Sub-threshold camera jitter (< 0.05m) still skips.
      camera.entity.transform.setPosition(10.01, 5, 10.01);
      host.refreshTerrainOcclusion();
      expect(isOccludedSpy).toHaveBeenCalledTimes(callsAfterFirst);

      // Small movement >= 0.05m (< 8m horizon rebuild threshold) refreshes immediately even with unchanged revision.
      camera.entity.transform.setPosition(10.2, 5, 10);
      host.refreshTerrainOcclusion();
      const callsAfterMove = isOccludedSpy.mock.calls.length;
      expect(callsAfterMove).toBeGreaterThan(callsAfterFirst);

      // Stationary again -> skips.
      host.refreshTerrainOcclusion();
      expect(isOccludedSpy).toHaveBeenCalledTimes(callsAfterMove);

      // Visibility toggle via host.setVisible marks terrain occlusion dirty while stationary.
      host.setVisible(false, "lake");
      host.refreshTerrainOcclusion();
      host.setVisible(true, "lake");
      host.refreshTerrainOcclusion();
      const callsAfterHostToggle = isOccludedSpy.mock.calls.length;
      expect(callsAfterHostToggle).toBeGreaterThan(callsAfterMove);

      // Visibility toggle via body handle marks terrain occlusion dirty while stationary.
      const handle = host.getBodyHandle(body.waterId)!;
      handle.setVisible(false);
      host.refreshTerrainOcclusion();
      handle.setVisible(true);
      host.refreshTerrainOcclusion();
      const callsAfterHandleToggle = isOccludedSpy.mock.calls.length;
      expect(callsAfterHandleToggle).toBeGreaterThan(callsAfterHostToggle);

      // Provider revision bump triggers refresh.
      revision = 2;
      host.refreshTerrainOcclusion();
      const callsAfterRevision = isOccludedSpy.mock.calls.length;
      expect(callsAfterRevision).toBeGreaterThan(callsAfterHandleToggle);

      // Force flag always refreshes.
      host.refreshTerrainOcclusion(true);
      expect(isOccludedSpy.mock.calls.length).toBeGreaterThan(callsAfterRevision);
      system.endInputUpdate(true, false);
      await system.dispose();
    } finally {
      engine.destroy();
    }
  });

  it("re-evaluates OceanWaterRuntimeController terrain occlusion automatically on 32m snap and vertical datum offset, and respects hierarchy active state", async () => {
    registerNativeWater();
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    let controller: OceanWaterRuntimeController | undefined;
    let resource: OceanNearshoreFieldResource | undefined;
    const normal = new Texture2D(engine, 4, 4, undefined, false, false);
    try {
      const preset = createWaterCreationPreset("ocean");
      const asset = compileWaterShape(preset.shape, preset.terrain, "ocean-snap-occlusion");
      const source = (asset.source as { descriptor: { config: Record<string, unknown> } }).descriptor.config as any;
      const compiled = OceanNearshoreCompiler.compile(source.nearshoreDescriptor);
      expect(compiled.valid).toBe(true);
      resource = OceanNearshoreFieldResource.create(compiled.data!);
      const root = engine.sceneManager.activeScene.createRootEntity("OceanSnapRoot");
      const cameraPos = { x: 0, y: 10, z: 0 };

      controller = new OceanWaterRuntimeController(
        engine,
        root,
        {
          ...source,
          waterBodyId: "ocean-snap-occlusion",
          surfaceCenterXZ: [0, 0],
          size: 4096,
          surfaceTopology: "finite",
          capabilityMode: "render-and-query",
          sceneFogEnabled: false,
          surfaceShader: Shader.find("Water/Ocean.v1")!,
          textures: describeOceanTextures([normal, normal, null, null, null])
        },
        { physicalSurfaceHash: resource.identity.physicalSurfaceHash, nearshoreResource: resource },
        () => cameraPos
      );

      let occludeAll = true;
      const isOccludedSpy = vi.fn((_key: string) => occludeAll);
      const allVisible = { isVisible: () => true };

      controller.refreshTerrainOcclusion({ isOccluded: isOccludedSpy });
      const initialCalls = isOccludedSpy.mock.calls.length;
      expect(initialCalls).toBe(4); // 4 near-field quadrants
      expect(controller.hasCameraVisibleSurfaceChunk(allVisible)).toBe(true); // far field remains active

      // Small move without snap does not re-trigger controller snap occlusion.
      cameraPos.x = 5;
      controller.update(0.016);
      expect(isOccludedSpy).toHaveBeenCalledTimes(initialCalls);

      // Moving >= 32m triggers near-field snap and automatically re-evaluates terrain occlusion on the new bounds.
      occludeAll = false;
      cameraPos.x = 64;
      controller.update(0.016);
      expect(isOccludedSpy).toHaveBeenCalledTimes(initialCalls + 4);

      // Vertical surface-level offset change also re-evaluates terrain occlusion while stationary.
      controller.setSurfaceLevelOffsetMetres(3);
      expect(isOccludedSpy).toHaveBeenCalledTimes(initialCalls + 8);

      // Deactivating the ocean root suppresses visible surface chunks.
      controller.root.isActive = false;
      expect(controller.hasCameraVisibleSurfaceChunk(allVisible)).toBe(false);
      controller.root.isActive = true;
      expect(controller.hasCameraVisibleSurfaceChunk(allVisible)).toBe(true);
    } finally {
      controller?.destroy();
      resource?.dispose();
      normal.destroy();
      engine.destroy();
    }
  });
});
