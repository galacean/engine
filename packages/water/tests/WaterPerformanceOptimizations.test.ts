import { describe, expect, it, vi } from "vitest";
import {
  AssetType,
  BufferAsset,
  BufferMesh,
  Camera,
  DepthTextureMode,
  Downsampling,
  JSONAsset,
  Material,
  Shader,
  ShaderMacro,
  ShaderMacroCollection,
  Texture2D,
  TextureFormat,
  TextureWrapMode,
  Vector3,
  VertexAttribute,
  VertexElement,
  VertexElementFormat,
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
import {
  WaterReadonlyFloat32Buffer,
  WaterReadonlyUint16Buffer,
  WaterReadonlyUint32Buffer,
  WaterReadonlyUint8Buffer
} from "../src/water/compiler/shared/ReadonlyNumericBuffer";
import { uploadHeightfieldWaterMesh } from "../src/water/runtime/heightfield/HeightfieldWaterMeshUploader";
import { uploadRiverMeshes } from "../src/water/runtime/river/RiverMeshUploader";
import { destroyWaterOwnedMesh } from "../src/water/runtime/resources/destroyWaterOwnedMesh";
import {
  createRiverMaterial,
  setRiverSurfaceAppearanceBinding
} from "../src/water/runtime/river/RiverMaterialFactory";
import { RiverQualityLevel } from "../src/water/authoring/river/RiverAuthoringEnums";
import { WaterBodyAssetRegistry } from "../src/water/runtime/body/WaterBodyAssetRegistry";
import {
  FARMLANDS_RIVER_LOOK_ID,
  registerFarmlandsRiverLook,
  registerRiverWaterBodyPresets,
  riverQualityPlanIdForQuality
} from "../src/water/presets/river/index";
import { WaterRenderContractCompiler } from "../src/water/compiler/surface/WaterRenderContractCompiler";
import { FARMLANDS_CAUSTICS_RESOURCE, FARMLANDS_WAVE_RESOURCE } from "../src/water/resources/river/FarmlandsWaterAssets";
import { CameraWaterFeatureBroker } from "../src/water/runtime/optics/CameraWaterFeatureBroker";
import { WaterReflectionBindingLifecycle } from "../src/water/runtime/optics/WaterReflectionBindingLifecycle";
import {
  applyWaterSurfaceReflectionBinding,
  createWaterSurfaceOpticsBindingState
} from "../src/water/runtime/optics/WaterSurfaceOpticsBinding";
import { createWaterSurfaceAppearanceV2NormalStatements } from "../src/water/runtime/surface/WaterSurfaceAppearanceV2Shader";
import { createHeightfieldWaterShaderSource } from "../src/water/runtime/heightfield/HeightfieldWaterMaterialFactory";
import { applyWaterPatternUniformsV2, bindWaterSurfaceAppearanceV2Clock, updateWaterSurfaceAppearanceV2Clock } from "../src/water/runtime/surface/WaterSurfaceAppearanceV2UniformBinding";
import {
  WATER_ANIMATED_VORONOI_CLOCK_PERIOD,
  WATER_ANIMATED_VORONOI_TEXTURE_PROPERTY,
  WATER_ANIMATED_VORONOI_TEXTURE_SIZE,
  generatePeriodicVoronoiF1Pixels,
  getSharedWaterAnimatedVoronoiTexture
} from "../src/water/runtime/surface/WaterAnimatedVoronoiTexture";
import { createWaterShaderModule, materializeWaterShaderModuleSource } from "../src/water/runtime/material/WaterShaderModule";
import { withScopedWaterShaderAssemblyRegistry } from "../src/water/runtime/material/WaterShaderLibrary";
import { LAKE_COMPILED_SURFACE_APPEARANCE_V2 } from "../src/water/presets/lake/index";
import { WaterSurfaceAppearanceCompiler } from "../src/water/compiler/surface/WaterSurfaceAppearanceCompiler";
import { WaterBoundaryResponseV2, WaterPatternBoundaryCombineV2, WaterPatternModelV2, WaterPatternResponseV2, WaterSurfaceCompositionV2, WaterSurfaceDepthResponseModelV2, WaterSurfacePrimaryColorClosure, WaterRefractionValidationModeV2, WaterRefractionNormalSourceV2, WaterSurfaceAppearanceSchemaVersion } from "../src/water/authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterFieldSemantic } from "../src/water/authoring/surface/WaterSurfaceFieldTypes";
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
import lakeAotShaderSource from "../../terrain/src/data/seed-world/source/Shader/Water/LakeHeightfieldHighHybrid.shader?raw";
import oceanNearAotShaderSource from "../../terrain/src/data/seed-world/source/Shader/Water/OceanNearDetailed.shader?raw";
import oceanFarAotShaderSource from "../../terrain/src/data/seed-world/source/Shader/Water/OceanFarGraded.shader?raw";
import seedWorldProject from "../../terrain/src/data/seed-world/project.json";

describe("Water P0 + P1 performance optimizations", () => {
  it("builds a watertight 4-ring concentric Ocean near-field mesh (12.6k tris) + graded far mesh (1.3k tris) with +Y winding and exact seams", () => {
    const layout = resolveFiniteOceanNearFieldLayout();
    const farLayout = resolveGradedOceanFarFieldLayout();
    expect(layout.triangleCount).toBe(12_576);
    expect(layout.vertexCount).toBe(6_532);
    expect(layout.cellSizeMetres).toBe(2);
    expect(layout.outerCellSizeMetres).toBe(16);
    expect(layout.rings.map((ring) => [ring.outerHalfExtentMetres, ring.cellSizeMetres])).toEqual([
      [64, 2],
      [96, 4],
      [128, 8],
      [192, 16]
    ]);
    expect(farLayout.triangleCount).toBe(1_344);
    expect(farLayout.vertexCount).toBe(768);
    expect(layout.triangleCount + farLayout.triangleCount).toBe(13_920);
    // Outer ring matches graded-far-field 16m segments 1-to-1.
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

    // Every boundary edge (count === 1) must lie exclusively on the outer ±192m square and have length 16m.
    let outerBoundaryEdgeCount = 0;
    for (const [ek, count] of edgeCounts) {
      if (count === 2) continue;
      expect(count, `unexpected non-manifold edge ${ek}`).toBe(1);
      const [aStr, bStr] = ek.split("|");
      const [ax, az] = aStr!.split(",").map(Number) as [number, number];
      const [bx, bz] = bStr!.split(",").map(Number) as [number, number];
      const onOuterBorder =
        (Math.abs(ax) === 192 && Math.abs(bx) === 192) || (Math.abs(az) === 192 && Math.abs(bz) === 192);
      expect(onOuterBorder, `interior T-junction or crack at edge ${ek}`).toBe(true);
      expect(Math.hypot(bx - ax, bz - az)).toBe(16);
      outerBoundaryEdgeCount++;
    }
    expect(outerBoundaryEdgeCount).toBe(farLayout.segmentsPerEdge * 4);
  });

  it("switches inland cameras beyond 192m to Ocean far-only even when RGBA8 shore SDF saturates at 64m", () => {
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

    expect(OCEAN_SCENE_FIELD_DEMAND_BUDGET.detailedClosureEndMetres).toBe(176);
    expect(OCEAN_SCENE_FIELD_DEMAND_BUDGET.releaseMarginMetres).toBe(16);
    expect(OCEAN_SCENE_FIELD_DEMAND_BUDGET.reacquireMarginMetres).toBe(8);

    // Center of island (512, 512) is ~480m from wet ocean (> 192m release threshold) -> far-only!
    const inland = resolver.resolve(512, 10, 512, 0, true);
    expect(inland.required).toBe(false);
    expect(inland.reason).toBe("far-only");
    expect(inland.conservativeHorizontalDryDistanceMetres).toBeGreaterThan(400);

    // Typical Seed World inland spawn (~210m from wet ocean > 192m release threshold) -> far-only!
    const spawnInland = resolver.resolve(260, 10, 512, 0, true);
    expect(spawnInland.required).toBe(false);
    expect(spawnInland.reason).toBe("far-only");

    // Coastal position (150, 512) is ~118m from wet ocean (< 184m reacquire threshold) -> detailed!
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

    // Ocean vertex shader applies continuous camera-distance sampling cell size across all 4 rings
    expect(oceanShaderSource).toContain("oceanGeometryEffectiveSamplingCellSize");
    expect(oceanShaderSource).toContain("smoothstep(32.0, 48.0, distanceToCamera)");
    expect(oceanShaderSource).toContain("smoothstep(64.0, 80.0, distanceToCamera)");
    expect(oceanShaderSource).toContain("smoothstep(96.0, 112.0, distanceToCamera)");
    expect(oceanShaderSource).not.toContain("oceanGeometryWaveGridWeight(waveWavelength, attributes.TEXCOORD_0.x)");

    // Mathematical invariance check: effectiveSamplingCellSize is continuous across 64m/96m/128m seams and 32m snap
    const smoothstep = (e0: number, e1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    const continuousCell = (d: number) =>
      2 + 2 * smoothstep(32, 48, d) + 4 * smoothstep(64, 80, d) + 8 * smoothstep(96, 112, d);
    const meshCell = (dx: number, dz: number) => {
      const r = Math.max(Math.abs(dx), Math.abs(dz));
      return r < 64 ? 2 : r < 96 ? 4 : r < 128 ? 8 : 16;
    };
    const effective = (wx: number, wz: number, camX: number, camZ: number, snapX: number, snapZ: number) =>
      Math.max(meshCell(wx - snapX, wz - snapZ), continuousCell(Math.hypot(wx - camX, wz - camZ)));
    // Camera right at the 32m snap boundary (x = 16): snapping origin from 0 -> 32 changes no world point's effective cell size.
    for (let wx = -160; wx <= 192; wx += 4) {
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

      // P0 regression: looking away (e.g. straight up at sky) enters far-only without locking out detailed recovery.
      const noneVisible = { isVisible: () => false };
      expect(controller.hasCameraVisibleSurfaceChunk(noneVisible)).toBe(false);
      const geomInternal = (controller as unknown as { _geometry: { _presentationPath: string } })._geometry;
      expect(geomInternal._presentationPath).toBe("far-only");
      expect(controller.hasCameraVisibleSurfaceChunk(allVisible)).toBe(true);
      expect(geomInternal._presentationPath).toBe("detailed");
    } finally {
      controller?.destroy();
      resource?.dispose();
      normal.destroy();
      engine.destroy();
    }
  });

  it("culls 100% dry Ocean near quadrants and tightens partially-wet quadrant bounds to actual wet area", async () => {
    registerNativeWater();
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    let controller: OceanWaterRuntimeController | undefined;
    let resource: OceanNearshoreFieldResource | undefined;
    const normal = new Texture2D(engine, 4, 4, undefined, false, false);
    try {
      // Build a 1024m x 1024m island atlas where ONLY x >= 480 (east half) is wet ocean and x < 480 is dry land.
      const width = 128;
      const height = 128;
      const cellSize = 8;
      const bedHeights = new Float32Array(width * height);
      const signedShoreDistances = new Float32Array(width * height);
      for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
          const worldX = x * cellSize + cellSize * 0.5;
          const idx = z * width + x;
          const wet = worldX >= 480;
          bedHeights[idx] = wet ? -12 : 10;
          signedShoreDistances[idx] = worldX - 480;
        }
      }
      const nearshoreDescriptor = {
        schemaVersion: 1 as const,
        id: "dry-quadrant-test-nearshore",
        waterLevel: 0,
        grid: {
          originXZ: [cellSize * 0.5, cellSize * 0.5] as const,
          cellSizeXZ: [cellSize, cellSize] as const,
          width,
          height
        },
        bedHeights,
        signedShoreDistances,
        wetSource: { kind: "water-level" as const, minimumDepth: 0.01 },
        outsidePolicy: {
          negativeX: "dry" as const,
          positiveX: "deep-ocean" as const,
          negativeZ: "dry" as const,
          positiveZ: "dry" as const
        }
      };
      const compiled = OceanNearshoreCompiler.compile(nearshoreDescriptor);
      expect(compiled.valid).toBe(true);
      resource = OceanNearshoreFieldResource.create(compiled.data!);
      const root = engine.sceneManager.activeScene.createRootEntity("DryCullOceanRoot");
      // Camera at x = 352 (128m inland from shore at x = 480, snapped center = 352):
      // West quadrants [160..352] are 100% dry; East quadrants [352..544] are wet only in [~470..544].
      const cameraPos = { x: 352, y: 10, z: 512 };
      controller = new OceanWaterRuntimeController(
        engine,
        root,
        {
          waterBodyId: "dry-cull-ocean",
          waterLevel: 0,
          nearshoreDescriptor,
          surfaceCenterXZ: [512, 512],
          size: 2048,
          surfaceTopology: "finite",
          capabilityMode: "render-and-query",
          sceneFogEnabled: false,
          surfaceShader: Shader.find("Water/Ocean.v1")!,
          textures: describeOceanTextures([normal, normal, null, null, null])
        },
        { physicalSurfaceHash: resource.identity.physicalSurfaceHash, nearshoreResource: resource },
        () => cameraPos
      );

      const chunks = (
        controller as unknown as {
          _geometry: {
            _chunks: Array<{
              region: string;
              entity: { name: string };
              renderer: { enabled: boolean; bounds: { min: Vector3; max: Vector3 } };
              hasWetArea: boolean;
              wetWorldBounds: { min: Vector3; max: Vector3 };
            }>;
          };
        }
      )._geometry._chunks.filter((c) => c.region === "near");

      const westChunks = chunks.filter((c) => c.entity.name.startsWith("near-0-"));
      const eastChunks = chunks.filter((c) => c.entity.name.startsWith("near-1-"));
      expect(westChunks.length).toBe(2);
      expect(eastChunks.length).toBe(2);

      // 100% dry west quadrants are skipped and do not trigger terrain occlusion queries.
      for (const west of westChunks) {
        expect(west.hasWetArea).toBe(false);
        expect(west.renderer.enabled).toBe(false);
      }
      // Partially wet east quadrants have tightened bounds starting near shore (~460+), not at camera (352).
      for (const east of eastChunks) {
        expect(east.hasWetArea).toBe(true);
        expect(east.renderer.enabled).toBe(true);
        expect(east.wetWorldBounds.min.x).toBeGreaterThan(440);
        expect(east.renderer.bounds.min.x).toBeGreaterThan(440);
      }

      const occlusionSpy = vi.fn(() => false);
      controller.refreshTerrainOcclusion({ isOccluded: occlusionSpy });
      expect(occlusionSpy).toHaveBeenCalledTimes(2); // Only the 2 wet east quadrants are tested

      // Moving camera offshore (x = 704) snaps all 4 quadrants into wet ocean -> all 4 become active.
      cameraPos.x = 704;
      controller.update(0.016);
      for (const chunk of chunks) {
        expect(chunk.hasWetArea).toBe(true);
        expect(chunk.renderer.enabled).toBe(true);
      }
    } finally {
      controller?.destroy();
      resource?.dispose();
      normal.destroy();
      engine.destroy();
    }
  });

  it("bakes a tileable 128x128 R8 Voronoi F1 texture, shares it per Engine, and wraps animated clock phase seamlessly at 64s", async () => {
    const size = WATER_ANIMATED_VORONOI_TEXTURE_SIZE;
    const pixels = generatePeriodicVoronoiF1Pixels();
    expect(pixels.length).toBe(size * size);
    let minVal = 255;
    let maxVal = 0;
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] < minVal) minVal = pixels[i];
      if (pixels[i] > maxVal) maxVal = pixels[i];
    }
    expect(minVal).toBeLessThan(20);
    expect(maxVal).toBeGreaterThan(130);

    // Periodic tiling continuity: opposing borders must transition smoothly without a seam jump.
    let maxHorizSeamDiff = 0;
    let maxVertSeamDiff = 0;
    for (let i = 0; i < size; i++) {
      maxHorizSeamDiff = Math.max(maxHorizSeamDiff, Math.abs(pixels[i * size] - pixels[i * size + (size - 1)]));
      maxVertSeamDiff = Math.max(maxVertSeamDiff, Math.abs(pixels[i] - pixels[(size - 1) * size + i]));
    }
    expect(maxHorizSeamDiff).toBeLessThan(28);
    expect(maxVertSeamDiff).toBeLessThan(28);

    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    const material = new Material(engine, Shader.find("Unlit")!);
    try {
      const texA = getSharedWaterAnimatedVoronoiTexture(engine);
      const texB = getSharedWaterAnimatedVoronoiTexture(engine);
      expect(texA).toBe(texB);
      expect(texA.width).toBe(size);
      expect(texA.height).toBe(size);
      expect(texA.format).toBe(TextureFormat.R8_UNorm);
      expect(texA.wrapModeU).toBe(TextureWrapMode.Repeat);
      expect(texA.wrapModeV).toBe(TextureWrapMode.Repeat);
      expect(texA.mipmapCount).toBeGreaterThan(1);

      material.shaderData.setFloat("material_SurfaceTimeOverride", -1);
      bindWaterSurfaceAppearanceV2Clock(material, LAKE_COMPILED_SURFACE_APPEARANCE_V2, false);
      expect(material.shaderData.getTexture(WATER_ANIMATED_VORONOI_TEXTURE_PROPERTY)).toBe(texA);

      updateWaterSurfaceAppearanceV2Clock(material, 1.5);
      const phaseAt1_5 = material.shaderData.getFloat("material_AppearanceV2Boundary1PatternTimeRate");
      updateWaterSurfaceAppearanceV2Clock(material, 1.5 + WATER_ANIMATED_VORONOI_CLOCK_PERIOD);
      const phaseWrapped = material.shaderData.getFloat("material_AppearanceV2Boundary1PatternTimeRate");
      expect(phaseWrapped).toBeCloseTo(phaseAt1_5, 6);
    } finally {
      material.destroy(true);
      engine.destroy();
    }
  });

  it("verifies P0-2 and P0-3 shader optimizations across shipped builtin shaders and Seed World Water AOT artifacts", async () => {
    for (const [label, source] of [
      ["lake.shader", lakeShaderSource],
      ["river.shader", riverShaderSource],
      ["LakeHeightfieldHighHybrid.shader", lakeAotShaderSource]
    ] as const) {
      expect(source, `${label}: remove per-pixel isFinite`).not.toContain("waterAnimatedVoronoiF1IsFinite");
      expect(source, `${label}: NaN-safe Voronoi domain guards`).toContain("!(worldScale > 0.0)");
      expect(source, `${label}: NaN-safe timeRate guard`).toContain("!(timeRate > 0.0)");
      expect(source, `${label}: NaN-safe lacunarity guard`).toContain("!(lacunarity > 0.0)");
      expect(source, `${label}: Voronoi outer gate`).toContain("appearanceBoundaryGate1");
      expect(source, `${label}: baked 128x128 Voronoi texture`).toContain("material_AppearanceV2VoronoiTexture");
      expect(source, `${label}: no procedural 3-octave Voronoi hash`).not.toContain("waterAnimatedVoronoiF1Hash");
      expect(source, `${label}: no procedural 9-cell candidate search`).not.toContain("waterAnimatedVoronoiF1Candidate");
      expect(source, `${label}: zero-offset depth reuse`).toContain("refractionDepthDeltaUv");
      expect(source, `${label}: full-SSR cubemap skip`).toContain("sampleScreenSpaceReflectionRaw");
      expect(source, `${label}: full-SSR validity gate`).toContain("ssrCompositeScale < 0.9999");
    }

    expect(riverShaderSource).toContain("Bool blendEnabled;");
    expect(riverShaderSource).toContain("Enabled = blendEnabled;");
    expect(riverShaderSource).toContain("causticsDepthFade > 0.0 && material_AppearanceV2CausticsResponse.x > 0.0");
    expect(riverShaderSource).toContain("foamSlopeMask > 0.0");
    expect(riverShaderSource).toContain("riverValueNoiseWithGrad");
    expect(riverShaderSource).toContain("riverMacroSurfaceWithGrad");
    expect(riverShaderSource).not.toContain("riverMacroHeight(");
    expect(riverShaderSource).toContain("closure.primaryColorClosureModel < 0.5");

    for (const [label, source] of [
      ["lake.shader", lakeShaderSource],
      ["LakeHeightfieldHighHybrid.shader", lakeAotShaderSource]
    ] as const) {
      expect(source, `${label}: deferred centeredOpaqueColor`).toContain("centeredOpaqueSampled");
      expect(source, `${label}: coastalAlphaWeight deep-water skip`).toContain("closureInput.coastalAlphaWeight >= 0.9999");
      expect(source, `${label}: rain ripple fast gate`).toContain("if (rainRate > 0.0001)");
      expect(source, `${label}: secondary rain ripple gate`).toContain("if (rainRippleSecondaryAmount > 0.0)");
      const ssrPart = source.slice(source.indexOf('Pass "SSRReceiver"'));
      expect(ssrPart, `${label}: wave-0 SSRReceiver omits VS localMap fetch`).not.toContain(
        "texture2D(material_LocalMapTexture, attr.TEXCOORD_0)"
      );
    }

    for (const [label, source] of [
      ["ocean.shader", oceanShaderSource],
      ["OceanNearDetailed.shader", oceanNearAotShaderSource],
      ["OceanFarGraded.shader", oceanFarAotShaderSource]
    ] as const) {
      expect(source, `${label}: outsideAtlas guard`).toContain("if (outsideAtlas < 0.5)");
    }

    for (const [label, source] of [
      ["ocean.shader", oceanShaderSource],
      ["OceanNearDetailed.shader", oceanNearAotShaderSource]
    ] as const) {
      expect(source, `${label}: remove centeredOpaquePosition`).not.toContain("centeredOpaquePosition");
      expect(source, `${label}: single reconstructOpaquePositionWS`).toContain("displacedDepthAvailable > 0.5");
      expect(source, `${label}: on-demand centeredSceneColor`).toContain("if (refractionValidity > 0.9999 && material_RefractionEnabled > 0.5)");
      expect(source, `${label}: zero-offset depth reuse`).toContain("dot(refractionOffset, refractionOffset) > 1e-10");
      expect(source, `${label}: deep opaque early-out`).toContain("bool deepOpaqueWater");
      expect(source, `${label}: deep optical density & conservative min depth gate`).toContain("float deepOpticalExponent");
      expect(source, `${label}: grazing shallow depth protection`).toContain("min(centeredViewDepth, verticalDepth)");
      expect(source, `${label}: caustics depth/distance gate`).toContain("causticsDepthFade");
      expect(source, `${label}: foam distance early-out`).toContain("foamDistanceFade");
      expect(source, `${label}: near-only detail normal early-out`).toContain("if (fadeFactor >= 0.999)");
      expect(source, `${label}: cached connectionFacts`).toContain("vec4 connectionFacts = waterConnectionFacts");
      expect(source, `${label}: no double oceanFarFieldRadiance in transition band`).not.toContain(
        "mix(finalColor, oceanFarFieldRadiance"
      );
    }

    // Verify compiled Seed World AOT .shaderc and builtin lake-heightfield-high-hybrid-v2.shaderc contain the rebuilt shaders.
    const aotLakeEntry = seedWorldProject.files.find(
      (f) => f.virtualPath === "Shader/Water/lake-heightfield-high-hybrid-v2.shaderc"
    )!;
    const aotNearEntry = seedWorldProject.files.find(
      (f) => f.virtualPath === "Shader/Water/ocean-near-detailed.shaderc"
    )!;
    const aotFarEntry = seedWorldProject.files.find(
      (f) => f.virtualPath === "Shader/Water/ocean-far-graded.shaderc"
    )!;
    expect(aotLakeEntry && aotNearEntry && aotFarEntry).toBeTruthy();

    const [lakeShaderc, nearShaderc, farShaderc] = await Promise.all(
      [aotLakeEntry, aotNearEntry, aotFarEntry].map(async (entry) =>
        (await fetch(new URL(`../../terrain/src/data/seed-world/${entry.path}`, import.meta.url).href)).text()
      )
    );
    expect(lakeShaderc).not.toContain("waterAnimatedVoronoiF1IsFinite");
    expect(lakeShaderc).toContain("material_AppearanceV2VoronoiTexture");
    expect(lakeShaderc).not.toContain("waterAnimatedVoronoiF1Hash");
    expect(lakeShaderc).toContain("centeredOpaqueSampled");
    expect(lakeShaderc).toContain("sampleScreenSpaceReflectionRaw");
    expect(lakeShaderc).not.toContain("rainRippleVisibility");
    expect(nearShaderc).not.toContain("centeredOpaquePosition");
    expect(nearShaderc).toContain("outsideAtlas < 0.5");
    expect(nearShaderc).toContain("textureLod ( material_NearshoreTexture");
    expect(nearShaderc).toContain("0.9999");
    expect(farShaderc).toContain("outsideAtlas < 0.5");
    expect(farShaderc).toContain("textureLod ( material_NearshoreTexture");

    // Verify volumetric cloud shadow is hoisted from frag to vert across Lake, River, and Ocean (matching Terrain/Surface).
    for (const [label, source] of [
      ["lake.shader", lakeShaderSource],
      ["river.shader", riverShaderSource],
      ["ocean.shader", oceanShaderSource],
      ["LakeHeightfieldHighHybrid.shader", lakeAotShaderSource],
      ["OceanNearDetailed.shader", oceanNearAotShaderSource]
    ] as const) {
      const vertIdx = source.indexOf("Varyings vert(");
      const fragIdx = source.indexOf("void frag(Varyings input)");
      expect(vertIdx, `${label}: vert entry`).toBeGreaterThan(-1);
      expect(fragIdx, `${label}: frag entry`).toBeGreaterThan(vertIdx);
      const vertBody = source.slice(vertIdx, fragIdx);
      const fragBody = source.slice(fragIdx);
      expect(vertBody, `${label}: vert evaluates sampleVolumetricCloudShadow`).toContain(
        "output.cloudShadow = sampleVolumetricCloudShadow("
      );
      expect(fragBody, `${label}: frag does not call sampleVolumetricCloudShadow`).not.toContain(
        "sampleVolumetricCloudShadow("
      );
      expect(fragBody, `${label}: frag reads hoisted input.cloudShadow`).toContain("input.cloudShadow");
    }

    for (const [label, rawJson] of [
      ["lake-heightfield-high-hybrid-v2.shaderc", lakeShaderc],
      ["ocean-near-detailed.shaderc", nearShaderc]
    ] as const) {
      const parsed = JSON.parse(rawJson) as {
        subShaders: Array<{
          passes: Array<{ vertexShaderInstructions: unknown; fragmentShaderInstructions: unknown }>;
        }>;
      };
      const forwardPass = parsed.subShaders[0]!.passes[0]!;
      const vsText = JSON.stringify(forwardPass.vertexShaderInstructions);
      const fsText = JSON.stringify(forwardPass.fragmentShaderInstructions);
      expect(vsText, `${label}: VS contains sampleVolumetricCloudShadow`).toContain("sampleVolumetricCloudShadow");
      expect(vsText, `${label}: VS contains scene_VolumetricCloudShadowTexture`).toContain(
        "scene_VolumetricCloudShadowTexture"
      );
      expect(fsText, `${label}: FS strips sampleVolumetricCloudShadow`).not.toContain("sampleVolumetricCloudShadow");
      expect(fsText, `${label}: FS strips scene_VolumetricCloudShadowTexture`).not.toContain(
        "scene_VolumetricCloudShadowTexture"
      );
    }
  });

  it("validates 4-element heightfield vertex layout before skipping setVertexElements", async () => {
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    try {
      const mismatched = new BufferMesh(engine);
      mismatched.setVertexElements([
        new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
        new VertexElement(VertexAttribute.Color, 12, VertexElementFormat.Vector4, 0),
        new VertexElement(VertexAttribute.Normal, 28, VertexElementFormat.Vector3, 0),
        new VertexElement(VertexAttribute.UV, 40, VertexElementFormat.Vector2, 0)
      ]);
      const built = uploadHeightfieldWaterMesh(
        engine,
        {
          vertexCount: 3,
          indexCount: 3,
          positions: new WaterReadonlyFloat32Buffer(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1])),
          normals: new WaterReadonlyFloat32Buffer(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0])),
          tangents: new WaterReadonlyFloat32Buffer(new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1])),
          uvs: new WaterReadonlyFloat32Buffer(new Float32Array([0, 0, 1, 0, 0, 1])),
          indices: new WaterReadonlyUint16Buffer(new Uint16Array([0, 1, 2])),
          bounds: { min: [0, 0, 0], max: [1, 0, 1] }
        } as unknown as Parameters<typeof uploadHeightfieldWaterMesh>[1],
        { existing: { surfaceMesh: mismatched, ownedBuffers: [] } }
      );
      expect(built.surfaceMesh).toBe(mismatched);
      expect(mismatched.vertexElements.map((e) => [e.attribute, e.offset, e.format, e.bindingIndex])).toEqual([
        [VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0],
        [VertexAttribute.Normal, 12, VertexElementFormat.Vector3, 0],
        [VertexAttribute.Tangent, 24, VertexElementFormat.Vector4, 0],
        [VertexAttribute.UV, 40, VertexElementFormat.Vector2, 0]
      ]);
      const pool = (engine.resourceManager as unknown as {
        _contentRestorerPool?: Record<number, { restoreContent: () => void }>;
      })._contentRestorerPool;
      expect(() => pool?.[mismatched.instanceId]?.restoreContent()).not.toThrow();
    } finally {
      engine.destroy();
    }
  });

  it("sanitizes pattern uniforms on CPU with zero per-frame allocations and compiles LocalBathymetry Heightfield variants without opaque color", async () => {
    const floats = new Map<string, number>();
    const vec3s = new Map<string, Vector3>();
    applyWaterPatternUniformsV2(
      {
        setFloat: (name, value) => floats.set(name, value),
        setVector3: (name, value) => vec3s.set(name, value)
      },
      1,
      {
        model: WaterPatternModelV2.AnimatedVoronoiF1,
        worldScale: Number.NaN,
        timeRate: Number.POSITIVE_INFINITY,
        opacity: -0.5,
        octaves: { count: 3, weights: [Number.NaN, -1, 0.25] },
        lacunarity: Number.NEGATIVE_INFINITY,
        response: WaterPatternResponseV2.Power,
        invert: true,
        exponent: Number.NaN,
        combine: "signed-boundary-add-saturate" as any
      }
    );
    expect(floats.get("material_AppearanceV2Boundary1PatternWorldScale")).toBe(0);
    expect(floats.get("material_AppearanceV2Boundary1PatternTimeRate")).toBe(0);
    expect(floats.get("material_AppearanceV2Boundary1PatternOpacity")).toBe(0);
    expect(floats.get("material_AppearanceV2Boundary1PatternExponent")).toBe(1);
    expect(floats.get("material_AppearanceV2Boundary1PatternLacunarity")).toBe(0);
    const w = vec3s.get("material_AppearanceV2Boundary1PatternWeights")!;
    expect([w.x, w.y, w.z]).toEqual([0, 0, 0.25]);

    // Verify zero-GC clock updates when pattern rate is non-finite.
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    try {
      const compileAppearance = (asset: Parameters<typeof WaterSurfaceAppearanceCompiler.compile>[0]) => {
        const res = WaterSurfaceAppearanceCompiler.compile(asset);
        expect(res.diagnostics).toEqual([]);
        expect(res.valid).toBe(true);
        return res.data!;
      };

      const noOpaqueAppearance = compileAppearance({
        schemaVersion: WaterSurfaceAppearanceSchemaVersion.V2,
        id: "test-local-no-opaque",
        primaryColorClosure: WaterSurfacePrimaryColorClosure.PhysicalVolume,
        detailLayers: [],
        depthResponse: {
          model: WaterSurfaceDepthResponseModelV2.BeerLambert,
          field: WaterFieldSemantic.OpticalPath
        },
        boundaryEffects: [],
        refraction: {
          enabled: false,
          uvScale: 0,
          normalSource: WaterRefractionNormalSourceV2.ViewSpaceDelta,
          validation: WaterRefractionValidationModeV2.LocalOnlySafe
        },
        composition: WaterSurfaceCompositionV2.AlphaBlend
      });

      const localShaderSource = withScopedWaterShaderAssemblyRegistry(() =>
        materializeWaterShaderModuleSource(
          createWaterShaderModule(
            "Test/HeightfieldNoOpaque",
            createHeightfieldWaterShaderSource(
              WaterQualityTier.High,
              0,
              noOpaqueAppearance,
              WaterSurfaceDepthSource.LocalBathymetry
            ),
            {} as any,
            []
          )
        )
      );
      expect(localShaderSource).not.toContain("camera_OpaqueTexture");
      const compiledLocalShader = Shader.create(localShaderSource)!;
      try {
        expect(compiledLocalShader.compileVariant(engine, [])).toBe(true);
      } finally {
        compiledLocalShader.destroy();
      }

      // GPU-compile all SignedBoundaryAddSaturate / Multiply / AddSaturate variants in Heightfield.
      const patternVariants = [
        {
          id: "test-signed-linear",
          response: WaterPatternResponseV2.Linear,
          invert: false,
          exponent: undefined,
          combine: WaterPatternBoundaryCombineV2.SignedBoundaryAddSaturate
        },
        {
          id: "test-signed-pos-exp",
          response: WaterPatternResponseV2.Power,
          invert: false,
          exponent: 1.5,
          combine: WaterPatternBoundaryCombineV2.SignedBoundaryAddSaturate
        },
        {
          id: "test-multiply",
          response: WaterPatternResponseV2.Power,
          invert: true,
          exponent: -1.5,
          combine: WaterPatternBoundaryCombineV2.Multiply
        },
        {
          id: "test-add-saturate",
          response: WaterPatternResponseV2.Linear,
          invert: true,
          exponent: undefined,
          combine: WaterPatternBoundaryCombineV2.AddSaturate
        }
      ] as const;

      for (const variant of patternVariants) {
        const compiledApp = compileAppearance({
          schemaVersion: WaterSurfaceAppearanceSchemaVersion.V2,
          id: variant.id,
          primaryColorClosure: WaterSurfacePrimaryColorClosure.LitSceneColorDepthRamp,
          detailLayers: [],
          depthResponse: {
            model: WaterSurfaceDepthResponseModelV2.PowerRamp,
            field: WaterFieldSemantic.VerticalDepth,
            distanceMeters: 3.6,
            exponent: 1.1,
            color: [0.05, 0.25, 0.35, 1]
          },
          boundaryEffects: [
            {
              id: "contact-foam",
              field: WaterFieldSemantic.ObstacleContact,
              response: WaterBoundaryResponseV2.Linear,
              rangeMeters: 0.2,
              invert: true,
              pattern: {
                model: WaterPatternModelV2.AnimatedVoronoiF1,
                worldScale: 2.5,
                timeRate: 1,
                opacity: 0.5,
                octaves: { count: 3, weights: [0.5, 0.25, 0.125] },
                lacunarity: 2,
                response: variant.response,
                invert: variant.invert,
                ...(variant.exponent !== undefined ? { exponent: variant.exponent } : {}),
                combine: variant.combine
              },
              outputs: { color: [1, 1, 1], roughness: 1 }
            }
          ],
          refraction: {
            enabled: true,
            uvScale: 0.15,
            normalSource: WaterRefractionNormalSourceV2.TangentSpace,
            validation: WaterRefractionValidationModeV2.ShiftedSceneDepth
          },
          composition: WaterSurfaceCompositionV2.PrecomposedReplace
        });
        const variantSource = withScopedWaterShaderAssemblyRegistry(() =>
          materializeWaterShaderModuleSource(
            createWaterShaderModule(
              `Test/${variant.id}`,
              createHeightfieldWaterShaderSource(
                WaterQualityTier.High,
                0,
                compiledApp,
                WaterSurfaceDepthSource.HybridOptionalSceneDepth
              ),
              {} as any,
              []
            )
          )
        );
        const shader = Shader.create(variantSource)!;
        try {
          expect(shader.compileVariant(engine, []), variant.id).toBe(true);
        } finally {
          shader.destroy();
        }
      }

      // Clock update reuses state without mutating/allocating on repeated frames.
      const material = new Material(engine, Shader.find("Unlit")!);
      material.shaderData.setFloat("material_SurfaceTimeOverride", -1);
      bindWaterSurfaceAppearanceV2Clock(material, LAKE_COMPILED_SURFACE_APPEARANCE_V2, false);
      updateWaterSurfaceAppearanceV2Clock(material, 1.5);
      const firstPhase = material.shaderData.getFloat("material_AppearanceV2Boundary1PatternTimeRate");
      expect(Number.isFinite(firstPhase)).toBe(true);
      updateWaterSurfaceAppearanceV2Clock(material, 1.5);
      expect(material.shaderData.getFloat("material_AppearanceV2Boundary1PatternTimeRate")).toBe(firstPhase);
      material.destroy();
    } finally {
      engine.destroy();
    }
  });

  it("toggles dynamic blendEnabled on River materials and uploads Heightfield/River geometry directly into BufferMesh with ContentRestorer", async () => {
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    try {
      // P1-3a: dynamic blendEnabled for River PrecomposedReplace vs AlphaBlend.
      const registry = new WaterBodyAssetRegistry();
      registerRiverWaterBodyPresets(registry);
      registerFarmlandsRiverLook(registry);
      const look = registry.getLookAuthoringSnapshot(FARMLANDS_RIVER_LOOK_ID)!;
      const qualityPlan = registry.getQualityPlan(riverQualityPlanIdForQuality(RiverQualityLevel.High))!;
      const compileRiverBinding = (composition: WaterSurfaceCompositionV2) => {
        const appearanceAsset = { ...look.appearance.appearance, composition };
        const compiled = WaterRenderContractCompiler.compile({
          sourceId: `${look.look.id}-${composition}`,
          look: { ...look.look, riverDrops: undefined },
          appearance: appearanceAsset,
          fieldDependencies: look.appearance.fieldDependencies,
          optics: { id: look.optics.id, profile: look.optics.profile },
          reflectionIntent: look.reflectionPolicy,
          renderState: look.renderState,
          resources: [FARMLANDS_WAVE_RESOURCE, FARMLANDS_CAUSTICS_RESOURCE],
          qualityPlan
        });
        expect(compiled.valid).toBe(true);
        const contract = compiled.data!;
        const dummyTex = new Texture2D(engine, 2, 2);
        return {
          binding: {
            appearance: contract.surfaceClosure.appearance,
            renderContract: contract,
            textureBindings: [
              { layerId: "large-waves", texture: dummyTex },
              { layerId: "broad-waves", texture: dummyTex },
              { layerId: "shallow-caustics", texture: dummyTex }
            ],
            featureFlags: look.appearance.featureFlags
          },
          dummyTex
        };
      };

      const replaceSetup = compileRiverBinding(WaterSurfaceCompositionV2.PrecomposedReplace);
      const alphaSetup = compileRiverBinding(WaterSurfaceCompositionV2.AlphaBlend);
      const riverMat = createRiverMaterial(
        engine,
        { baseColor: "#114455", foamColor: "#ffffff", foamIntensity: 0.5, clarity: 0.8 },
        1,
        {
          seed: 42,
          maxDisplacement: 0.12,
          displacementLengthScale: 3.0,
          shoreDampingWidth: 1.0,
          turbulence: 0.5
        },
        replaceSetup.binding,
        {
          tier: "high",
          opticalProfile: look.optics.profile,
          refractionEnabled: true,
          reflection: undefined
        }
      );
      expect(riverMat.shaderData.getInt("blendEnabled")).toBe(0);
      expect(riverMat.shader.compileVariant(engine, ["CAMERA_ENABLE_SSR"])).toBe(true);
      expect(
        riverMat.shader.compileVariant(engine, [
          "CAMERA_ENABLE_SSR",
          "CAMERA_SSR_BILATERAL_SAMPLE",
          "SSR_PACKED_DEPTH_RG8",
          "SSR_PACKED_NORMAL_OCT8"
        ])
      ).toBe(true);

      setRiverSurfaceAppearanceBinding(riverMat, alphaSetup.binding);
      expect(riverMat.shaderData.getInt("blendEnabled")).toBe(1);
      setRiverSurfaceAppearanceBinding(riverMat, replaceSetup.binding);
      expect(riverMat.shaderData.getInt("blendEnabled")).toBe(0);
      riverMat.destroy();
      replaceSetup.dummyTex.destroy();
      alphaSetup.dummyTex.destroy();

      // P2-2: BufferMesh Heightfield & River uploaders with releaseCpuData and ContentRestorer.
      const hfGeometry = {
        positions: new WaterReadonlyFloat32Buffer(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1])),
        normals: new WaterReadonlyFloat32Buffer(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0])),
        tangents: new WaterReadonlyFloat32Buffer(new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1])),
        uvs: new WaterReadonlyFloat32Buffer(new Float32Array([0, 0, 1, 0, 0, 1])),
        indices: new WaterReadonlyUint16Buffer(new Uint16Array([0, 1, 2])),
        vertexCount: 3,
        indexCount: 3,
        bounds: { min: [0, 0, 0] as const, max: [1, 0, 1] as const }
      };
      const hfResult = uploadHeightfieldWaterMesh(engine, hfGeometry, { releaseCpuData: true, boundsPadding: 0.5 });
      expect(hfResult.surfaceMesh).toBeInstanceOf(BufferMesh);
      expect(hfResult.surfaceMesh.vertexBufferBindings[0]?.buffer.readable).toBe(false);
      expect(hfResult.surfaceMesh.indexBufferBinding?.buffer.readable).toBe(false);
      expect(hfResult.surfaceMesh.vertexElements.map((e) => e.attribute)).toEqual([
        VertexAttribute.Position,
        VertexAttribute.Normal,
        VertexAttribute.Tangent,
        VertexAttribute.UV
      ]);
      expect(hfResult.surfaceMesh.bounds.max.y).toBe(0.5);
      // Reuse existing mesh cleanly.
      const hfReused = uploadHeightfieldWaterMesh(engine, hfGeometry, { existing: hfResult, releaseCpuData: true });
      expect(hfReused.surfaceMesh).toBe(hfResult.surfaceMesh);

      const riverArtifact = {
        surfaceGeometry: {
          positions: [[0, 0, 0], [1, 0, 0], [0, 0, 2]] as const,
          normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0]] as const,
          tangents: [[0, 0, 1, 1], [0, 0, 1, 1], [0, 0, 1, 1]] as const,
          uvs: [[0, 0], [1, 0], [0, 1]] as const,
          uv1s: [[1.2, 0.5], [1.2, 0.5], [1.2, 0.5]] as const,
          uv2s: [[-1, 0], [1, 0], [-1, 1]] as const,
          uv3s: [[2, 1], [2, 1], [2, 1]] as const,
          indices: new WaterReadonlyUint32Buffer(new Uint32Array([0, 1, 2])),
          bounds: { min: [0, 0, 0] as const, max: [1, 0, 2] as const },
          maxDisplacement: 0.1,
          drawStart: 0,
          drawCount: 3
        }
      };
      const riverMesh = uploadRiverMeshes(engine, riverArtifact, { releaseCpuData: true });
      expect(riverMesh.surfaceMesh).toBeInstanceOf(BufferMesh);
      expect(riverMesh.surfaceMesh.vertexBufferBindings[0]?.buffer.readable).toBe(false);
      expect(riverMesh.surfaceMesh.vertexElements.map((e) => e.attribute)).toEqual([
        VertexAttribute.Position,
        VertexAttribute.Normal,
        VertexAttribute.Tangent,
        VertexAttribute.UV,
        VertexAttribute.UV1,
        VertexAttribute.UV2,
        VertexAttribute.UV3,
        VertexAttribute.UV4,
        VertexAttribute.UV5
      ]);
      // Invoke ContentRestorer on both live BufferMesh uploaders without losing buffers.
      await (engine.resourceManager as unknown as { _restoreResourcesContent(): Promise<void[]> })._restoreResourcesContent();
      hfResult.surfaceMesh.destroy(true);
      for (const b of hfResult.ownedBuffers) b.destroy(true);

      // Reusing existing River BufferMesh across stride changes (colors added/removed, even at identical byteLength) must update stride and destroy old buffers.
      const makeRiverArtifact = (vertexCount: number, withColors: boolean) => ({
        surfaceGeometry: {
          positions: Array.from({ length: vertexCount }, (_, i) => [i, 0, 0] as const),
          normals: Array.from({ length: vertexCount }, () => [0, 1, 0] as const),
          tangents: Array.from({ length: vertexCount }, () => [0, 0, 1, 1] as const),
          ...(withColors ? { colors: Array.from({ length: vertexCount }, () => [1, 1, 1, 1] as const) } : {}),
          uvs: Array.from({ length: vertexCount }, () => [0, 0] as const),
          uv1s: Array.from({ length: vertexCount }, () => [1, 0] as const),
          uv2s: Array.from({ length: vertexCount }, () => [0, 0] as const),
          uv3s: Array.from({ length: vertexCount }, () => [2, 1] as const),
          indices: new WaterReadonlyUint32Buffer(new Uint32Array([0, 1, 2])),
          bounds: { min: [0, 0, 0] as const, max: [vertexCount, 0, 1] as const },
          maxDisplacement: 0.1,
          drawStart: 0,
          drawCount: 3
        }
      });
      const river13NoColor = uploadRiverMeshes(engine, makeRiverArtifact(13, false), {
        existing: riverMesh,
        releaseCpuData: true
      });
      const buf13 = river13NoColor.surfaceMesh.vertexBufferBindings[0]!.buffer;
      expect(river13NoColor.surfaceMesh.vertexBufferBindings[0]!.stride).toBe(22 * 4);
      const river11WithColor = uploadRiverMeshes(engine, makeRiverArtifact(11, true), {
        existing: river13NoColor,
        releaseCpuData: true
      });
      const buf11 = river11WithColor.surfaceMesh.vertexBufferBindings[0]!.buffer;
      expect(buf11).not.toBe(buf13);
      expect(buf13.destroyed).toBe(true);
      expect(buf11.byteLength).toBe(buf13.byteLength);
      expect(river11WithColor.surfaceMesh.vertexBufferBindings[0]!.stride).toBe(26 * 4);
      expect(river11WithColor.surfaceMesh.vertexElements.some((e) => e.attribute === VertexAttribute.Color)).toBe(true);
      const river13Again = uploadRiverMeshes(engine, makeRiverArtifact(13, false), {
        existing: river11WithColor,
        releaseCpuData: true
      });
      expect(buf11.destroyed).toBe(true);
      expect(river13Again.surfaceMesh.vertexBufferBindings[0]!.stride).toBe(22 * 4);
      expect(river13Again.surfaceMesh.vertexElements.some((e) => e.attribute === VertexAttribute.Color)).toBe(false);

      // CR-005: existingHeightfield & existingRiver uploaders must preserve prior buffers & bindings when reallocation fails mid-upload.
      const hfReusable = uploadHeightfieldWaterMesh(engine, hfGeometry, { releaseCpuData: true });
      const prevHfVB = hfReusable.surfaceMesh.vertexBufferBindings[0]!.buffer;
      const prevHfIB = hfReusable.surfaceMesh.indexBufferBinding!.buffer;
      const hfGeometry4 = {
        positions: new WaterReadonlyFloat32Buffer(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1])),
        normals: new WaterReadonlyFloat32Buffer(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0])),
        tangents: new WaterReadonlyFloat32Buffer(new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1])),
        uvs: new WaterReadonlyFloat32Buffer(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1])),
        indices: new WaterReadonlyUint16Buffer(new Uint16Array([0, 1, 2, 1, 3, 2])),
        vertexCount: 4,
        indexCount: 6,
        bounds: { min: [0, 0, 0] as const, max: [1, 0, 1] as const }
      };
      const prevRiverVB = river13Again.surfaceMesh.vertexBufferBindings[0]!.buffer;
      const prevRiverIB = river13Again.surfaceMesh.indexBufferBinding!.buffer;
      const restorerSpy = vi.spyOn(engine.resourceManager, "addContentRestorer").mockImplementation(() => {
        throw new Error("injected water restorer failure");
      });
      try {
        expect(() =>
          uploadHeightfieldWaterMesh(engine, hfGeometry4, { existing: hfReusable, releaseCpuData: true })
        ).toThrow("injected water restorer failure");
        expect(prevHfVB.destroyed).toBe(false);
        expect(prevHfIB.destroyed).toBe(false);
        expect(hfReusable.surfaceMesh.vertexBufferBindings[0]!.buffer).toBe(prevHfVB);
        expect(hfReusable.surfaceMesh.indexBufferBinding!.buffer).toBe(prevHfIB);

        expect(() =>
          uploadRiverMeshes(engine, makeRiverArtifact(17, false), {
            existing: river13Again,
            releaseCpuData: true
          })
        ).toThrow("injected water restorer failure");
        expect(prevRiverVB.destroyed).toBe(false);
        expect(prevRiverIB.destroyed).toBe(false);
        expect(river13Again.surfaceMesh.vertexBufferBindings[0]!.buffer).toBe(prevRiverVB);
        expect(river13Again.surfaceMesh.indexBufferBinding!.buffer).toBe(prevRiverIB);
      } finally {
        restorerSpy.mockRestore();
      }

      hfReusable.surfaceMesh.destroy(true);
      for (const b of hfReusable.ownedBuffers) b.destroy(true);
      destroyWaterOwnedMesh(riverMesh.surfaceMesh);
      expect(riverMesh.surfaceMesh.destroyed).toBe(true);
    } finally {
      engine.destroy();
    }
  });

  it("verifies River VS analytic macro gradient height parity and >= 0.9999 normal alignment across 10,000 samples", () => {
    const HASH_MUL = 747796405,
      HASH_INC = 2891336453,
      HASH_OUT = 277803737,
      PERIOD = 4096;
    const REF_SPEED = 1.5,
      STEP = 0.05,
      MIN_SPEED = 0.05,
      FLOW_EPS = 0.0001;
    const WARP_SCALE = 0.55,
      WARP_STRENGTH = 0.58;
    const M = {
      warpOffsetX: [13.1, 7.7] as const,
      warpOffsetY: [3.8, 19.4] as const,
      s2: 2.03,
      o2: [17.7, 9.2] as const,
      s3: 4.11,
      o3: [8.3, 21.6] as const,
      w: [0.55, 0.28, 0.17] as const,
      rs: 1.37,
      ro: [5.2, 11.6] as const,
      broadW: 0.72,
      ridgeW: 0.28
    };
    const posMod = (v: number, m: number) => ((v % m) + m) % m;
    const hash21 = (x: number, y: number, seed: number) => {
      const cx = posMod(Math.floor(x), PERIOD) >>> 0;
      const cy = posMod(Math.floor(y), PERIOD) >>> 0;
      const inp = ((cx + Math.imul(cy, PERIOD)) ^ seed) >>> 0;
      const st = (Math.imul(inp, HASH_MUL) + HASH_INC) >>> 0;
      const wd = Math.imul((st >>> ((st >>> 28) + 4)) ^ st, HASH_OUT) >>> 0;
      return (((wd >>> 22) ^ wd) >>> 8) / 16777216;
    };
    const valueNoiseGrad = (px: number, py: number, seed: number): readonly [number, number, number] => {
      const x = posMod(px, PERIOD),
        y = posMod(py, PERIOD);
      const cx = Math.floor(x),
        cy = Math.floor(y);
      const lx = x - cx,
        ly = y - cy;
      const ux = lx * lx * (3 - 2 * lx),
        uy = ly * ly * (3 - 2 * ly);
      const dux = 6 * lx * (1 - lx),
        duy = 6 * ly * (1 - ly);
      const v00 = hash21(cx, cy, seed),
        v10 = hash21(cx + 1, cy, seed);
      const v01 = hash21(cx, cy + 1, seed),
        v11 = hash21(cx + 1, cy + 1, seed);
      const a = v00 + (v10 - v00) * ux;
      const b = v01 + (v11 - v01) * ux;
      return [
        a + (b - a) * uy,
        ((v10 - v00) + ((v11 - v01) - (v10 - v00)) * uy) * dux,
        (b - a) * duy
      ];
    };
    const smoothstep = (e0: number, e1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    interface MotionParams {
      seed: number;
      maxDisp: number;
      lengthScale: number;
      shoreW: number;
      turb: number;
      offsets: readonly [number, number, number, number];
      warpOff: number;
    }
    const macroHeight = (mx: number, my: number, hw: number, speed: number, params: MotionParams) => {
      const { seed, maxDisp, lengthScale, shoreW, turb, offsets, warpOff } = params;
      const shoreDamp = smoothstep(0, shoreW, hw - Math.abs(mx));
      const flowing = speed > FLOW_EPS ? 1 : 0;
      const ls = Math.max(lengthScale, 0.001);
      const bx = mx / ls,
        by = (my * REF_SPEED) / ls;
      const wx = valueNoiseGrad(bx * WARP_SCALE + M.warpOffsetX[0], by * WARP_SCALE + M.warpOffsetX[1] + warpOff * flowing, seed)[0] * 2 - 1;
      const wy = valueNoiseGrad(bx * WARP_SCALE + M.warpOffsetY[0], by * WARP_SCALE + M.warpOffsetY[1] + warpOff * flowing, seed)[0] * 2 - 1;
      const u = bx + wx * WARP_STRENGTH * turb,
        v = by + wy * WARP_STRENGTH * turb;
      const broad =
        valueNoiseGrad(u, v + offsets[0] * flowing, seed)[0] * M.w[0] +
        valueNoiseGrad(u * M.s2 + M.o2[0], v * M.s2 + M.o2[1] + offsets[1] * flowing, seed)[0] * M.w[1] +
        valueNoiseGrad(u * M.s3 + M.o3[0], v * M.s3 + M.o3[1] + offsets[2] * flowing, seed)[0] * M.w[2];
      const rn = valueNoiseGrad(u * M.rs + M.ro[0], v * M.rs + M.ro[1] + offsets[3] * flowing, seed)[0];
      const ridge = 1 - Math.abs(rn * 2 - 1);
      return maxDisp * shoreDamp * ((broad - 0.5) * M.broadW + (ridge - 0.5) * M.ridgeW * turb);
    };
    const macroAnalytic = (mx: number, my: number, hw: number, speed: number, params: MotionParams) => {
      const { seed, maxDisp, lengthScale, shoreW, turb, offsets, warpOff } = params;
      const sdDist = hw - Math.abs(mx);
      const shoreDamp = smoothstep(0, shoreW, sdDist);
      const st = shoreW > 0 ? Math.max(0, Math.min(1, sdDist / shoreW)) : 0;
      const dSd =
        shoreW > 0 && sdDist > 0 && sdDist < shoreW
          ? ((6 * st * (1 - st)) / shoreW) * (mx > 0 ? -1 : mx < 0 ? 1 : 0)
          : 0;
      const flowing = speed > FLOW_EPS ? 1 : 0;
      const ls = Math.max(lengthScale, 0.001);
      const bx = mx / ls,
        by = (my * REF_SPEED) / ls;
      const wg = WARP_STRENGTH * turb;
      const w0 = valueNoiseGrad(bx * WARP_SCALE + M.warpOffsetX[0], by * WARP_SCALE + M.warpOffsetX[1] + warpOff * flowing, seed);
      const w1 = valueNoiseGrad(bx * WARP_SCALE + M.warpOffsetY[0], by * WARP_SCALE + M.warpOffsetY[1] + warpOff * flowing, seed);
      const u = bx + (w0[0] * 2 - 1) * wg,
        v = by + (w1[0] * 2 - 1) * wg;
      const jxx = 1 + 2 * wg * WARP_SCALE * w0[1],
        jxy = 2 * wg * WARP_SCALE * w0[2];
      const jyx = 2 * wg * WARP_SCALE * w1[1],
        jyy = 1 + 2 * wg * WARP_SCALE * w1[2];
      const o0 = valueNoiseGrad(u, v + offsets[0] * flowing, seed);
      const o1 = valueNoiseGrad(u * M.s2 + M.o2[0], v * M.s2 + M.o2[1] + offsets[1] * flowing, seed);
      const o2 = valueNoiseGrad(u * M.s3 + M.o3[0], v * M.s3 + M.o3[1] + offsets[2] * flowing, seed);
      const broad = o0[0] * M.w[0] + o1[0] * M.w[1] + o2[0] * M.w[2];
      const gBu = o0[1] * M.w[0] + o1[1] * M.w[1] * M.s2 + o2[1] * M.w[2] * M.s3;
      const gBv = o0[2] * M.w[0] + o1[2] * M.w[1] * M.s2 + o2[2] * M.w[2] * M.s3;
      const r = valueNoiseGrad(u * M.rs + M.ro[0], v * M.rs + M.ro[1] + offsets[3] * flowing, seed);
      const rsgn = r[0] * 2 - 1;
      const ridge = 1 - Math.abs(rsgn);
      const dr = rsgn >= 0 ? -2 : 2;
      const gSu = gBu * M.broadW + r[1] * M.rs * dr * M.ridgeW * turb;
      const gSv = gBv * M.broadW + r[2] * M.rs * dr * M.ridgeW * turb;
      const gBx = gSu * jxx + gSv * jyx,
        gBy = gSu * jxy + gSv * jyy;
      const shape = (broad - 0.5) * M.broadW + (ridge - 0.5) * M.ridgeW * turb;
      const sSpeed = Math.max(speed, MIN_SPEED);
      return {
        height: maxDisp * shoreDamp * shape,
        dAcross: maxDisp * (dSd * shape + shoreDamp * (gBx / ls)),
        dDownstream: maxDisp * shoreDamp * (gBy * (REF_SPEED / (ls * sSpeed))),
        ridgeSignedAbs: Math.abs(rsgn)
      };
    };

    let rngState = 24681357;
    const rng = () => {
      rngState = (rngState * 1664525 + 1013904223) >>> 0;
      return rngState / 4294967296;
    };
    let maxHeightDiff = 0;
    let awayCount = 0;
    let minAwayDot = 1;
    for (let i = 0; i < 10_000; i++) {
      const hw = 4 + rng() * 12;
      const mx = (rng() * 2 - 1) * hw;
      const my = rng() * 120;
      const speed = 0.5 + rng() * 2.5;
      const params: MotionParams = {
        seed: (rng() * 1000) | 0,
        maxDisp: 0.08 + rng() * 0.16,
        lengthScale: 2.5 + rng() * 4.5,
        shoreW: 0.8 + rng() * 2.0,
        turb: 0.2 + rng() * 0.9,
        offsets: [rng() * 10, rng() * 10, rng() * 10, rng() * 10],
        warpOff: rng() * 10
      };
      const dt = STEP / Math.max(speed, MIN_SPEED);
      const h = macroHeight(mx, my, hw, speed, params);
      const da =
        (macroHeight(mx + STEP, my, hw, speed, params) - macroHeight(mx - STEP, my, hw, speed, params)) / (2 * STEP);
      const dd =
        (macroHeight(mx, my + dt, hw, speed, params) - macroHeight(mx, my - dt, hw, speed, params)) / (2 * STEP);
      const analytic = macroAnalytic(mx, my, hw, speed, params);
      maxHeightDiff = Math.max(maxHeightDiff, Math.abs(h - analytic.height));
      if (
        analytic.ridgeSignedAbs > 0.12 &&
        Math.abs(mx) > 0.06 &&
        Math.abs(hw - Math.abs(mx) - params.shoreW) > 0.06 &&
        hw - Math.abs(mx) > 0.06
      ) {
        const l1 = Math.hypot(-da, 1, -dd);
        const l2 = Math.hypot(-analytic.dAcross, 1, -analytic.dDownstream);
        const dot = (-da * -analytic.dAcross + 1 + -dd * -analytic.dDownstream) / (l1 * l2);
        awayCount++;
        minAwayDot = Math.min(minAwayDot, dot);
      }
    }
    expect(maxHeightDiff).toBeLessThan(1e-12);
    expect(awayCount).toBeGreaterThan(7_000);
    expect(minAwayDot).toBeGreaterThanOrEqual(0.9999);
  });

  it("prunes rain ripples, secondary cubemap, box projection, and non-SSR branch at compile time and toggles optics macros accurately", async () => {
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    const lakeShader = Shader.create(lakeShaderSource.replace("Water/Lake.v1", "WaterMacroPruneTest/Lake"));
    const riverShader = Shader.create(riverShaderSource.replace("Water/River.v1", "WaterMacroPruneTest/River"));
    const oceanShader = Shader.create(oceanShaderSource.replace("Water/Ocean.v1", "WaterMacroPruneTest/Ocean"));
    try {
      const lakeForwardPass = lakeShader.subShaders[0].passes[0];
      const lakeSsrPass = lakeShader.subShaders[0].passes[1];
      const riverForwardPass = riverShader.subShaders[0].passes[0];
      const oceanForwardPass = oceanShader.subShaders[0].passes[0];

      const makeMacros = (names: readonly (string | readonly [string, string])[]) => {
        const collection = new ShaderMacroCollection();
        collection.enable(ShaderMacro.getByName("GRAPHICS_API_WEBGL2"));
        for (const entry of names) {
          collection.enable(
            typeof entry === "string" ? ShaderMacro.getByName(entry) : ShaderMacro.getByName(entry[0], entry[1])
          );
        }
        return collection;
      };

      const lakeWetWithSecondary = lakeForwardPass._getShaderProgram(
        engine,
        makeMacros(["MATERIAL_WATER_SECONDARY_ENVIRONMENT_REFLECTION", "MATERIAL_WATER_ENVIRONMENT_BOX_PROJECTION"])
      );
      const lakeDrySteady = lakeForwardPass._getShaderProgram(engine, makeMacros(["SCENE_SURFACE_CLIMATE_DRY"]));
      const lakeDrySsr = lakeForwardPass._getShaderProgram(
        engine,
        makeMacros(["SCENE_SURFACE_CLIMATE_DRY", "CAMERA_ENABLE_SSR"])
      );
      const lakeSsrReceiverDry = lakeSsrPass._getShaderProgram(engine, makeMacros(["SCENE_SURFACE_CLIMATE_DRY"]));
      const lakeCloudShadow = lakeForwardPass._getShaderProgram(
        engine,
        makeMacros(["SCENE_SURFACE_CLIMATE_DRY", ["SCENE_DIRECT_LIGHT_COUNT", "1"], "SCENE_VOLUMETRIC_CLOUD_SHADOW"])
      );
      const lakeCloudShadowPick = lakeForwardPass._getShaderProgram(
        engine,
        makeMacros([
          "SCENE_SURFACE_CLIMATE_DRY",
          ["SCENE_DIRECT_LIGHT_COUNT", "1"],
          "SCENE_VOLUMETRIC_CLOUD_SHADOW",
          "RENDERER_WORLD_PICK"
        ])
      );
      const riverSteady = riverForwardPass._getShaderProgram(engine, makeMacros([]));
      const riverCloudShadow = riverForwardPass._getShaderProgram(
        engine,
        makeMacros(["SCENE_VOLUMETRIC_CLOUD_SHADOW"])
      );
      const riverCloudShadowPick = riverForwardPass._getShaderProgram(
        engine,
        makeMacros(["SCENE_VOLUMETRIC_CLOUD_SHADOW", "RENDERER_WORLD_PICK"])
      );
      const oceanSteady = oceanForwardPass._getShaderProgram(engine, makeMacros([]));
      const oceanCloudShadow = oceanForwardPass._getShaderProgram(
        engine,
        makeMacros(["SCENE_VOLUMETRIC_CLOUD_SHADOW"])
      );
      const oceanCloudShadowPick = oceanForwardPass._getShaderProgram(
        engine,
        makeMacros(["SCENE_VOLUMETRIC_CLOUD_SHADOW", "RENDERER_WORLD_PICK"])
      );
      const oceanWithSecondary = oceanForwardPass._getShaderProgram(
        engine,
        makeMacros(["MATERIAL_WATER_SECONDARY_ENVIRONMENT_REFLECTION", "MATERIAL_WATER_ENVIRONMENT_BOX_PROJECTION"])
      );

      expect(lakeWetWithSecondary.isValid).toBe(true);
      expect(lakeDrySteady.isValid).toBe(true);
      expect(lakeDrySsr.isValid).toBe(true);
      expect(lakeSsrReceiverDry.isValid).toBe(true);
      expect(lakeCloudShadow.isValid).toBe(true);
      expect(lakeCloudShadowPick.isValid).toBe(true);
      expect(riverSteady.isValid).toBe(true);
      expect(riverCloudShadow.isValid).toBe(true);
      expect(riverCloudShadowPick.isValid).toBe(true);
      expect(oceanSteady.isValid).toBe(true);
      expect(oceanCloudShadow.isValid).toBe(true);
      expect(oceanCloudShadowPick.isValid).toBe(true);
      expect(oceanWithSecondary.isValid).toBe(true);

      // Volumetric cloud shadow is evaluated in VS, so enabling SCENE_VOLUMETRIC_CLOUD_SHADOW adds
      // 0 fragment texture units (activeTextureCount) while binding 2 vertex texture units (_activeTextureUint),
      // and RENDERER_WORLD_PICK skips the VS cloud-shadow fetch as well.
      const totalTextureUnits = (program: { activeTextureCount: number }) =>
        (program as unknown as { _activeTextureUint: number })._activeTextureUint;
      expect(lakeCloudShadow.activeTextureCount).toBe(lakeDrySteady.activeTextureCount);
      expect(totalTextureUnits(lakeCloudShadow) - totalTextureUnits(lakeDrySteady)).toBe(2);
      expect(totalTextureUnits(lakeCloudShadowPick)).toBeLessThan(totalTextureUnits(lakeCloudShadow));

      expect(riverCloudShadow.activeTextureCount).toBe(riverSteady.activeTextureCount);
      expect(totalTextureUnits(riverCloudShadow) - totalTextureUnits(riverSteady)).toBe(2);
      expect(totalTextureUnits(riverCloudShadowPick)).toBeLessThan(totalTextureUnits(riverCloudShadow));

      expect(oceanCloudShadow.activeTextureCount).toBe(oceanSteady.activeTextureCount);
      expect(totalTextureUnits(oceanCloudShadow) - totalTextureUnits(oceanSteady)).toBe(2);
      expect(totalTextureUnits(oceanCloudShadowPick)).toBeLessThan(totalTextureUnits(oceanCloudShadow));

      // Dry + no secondary cubemap saves 2 active fragment texture units on Lake (rain atlas + secondary cubemap),
      // and stays well within WebGL2's 16 guaranteed fragment texture units even with the baked 128x128 Voronoi LUT.
      expect(lakeDrySteady.activeTextureCount).toBeLessThanOrEqual(14);
      expect(lakeWetWithSecondary.activeTextureCount - lakeDrySteady.activeTextureCount).toBe(2);
      // No secondary cubemap saves 1 active fragment texture unit on Ocean.
      expect(oceanWithSecondary.activeTextureCount - oceanSteady.activeTextureCount).toBe(1);

      // Verify applyWaterSurfaceReflectionBinding toggles the new macros cleanly.
      const mat = new Material(engine, lakeShader);
      const state = createWaterSurfaceOpticsBindingState();
      const dummyCube = new Texture2D(engine, 1, 1) as unknown as import("@galacean/engine").TextureCube;
      const baseLobe = {
        texture: dummyCube,
        ownership: "borrowed" as const,
        rotationDegrees: 0,
        exposure: 1,
        intensity: 1,
        colorSpace: "linear" as const,
        hdr: false,
        maximumMipLevel: 0
      };
      try {
        applyWaterSurfaceReflectionBinding(mat.shaderData, state, "high", {
          requestedSource: "probe",
          resolvedSource: "probe",
          requestedMode: "probe",
          resolvedMode: "probe",
          composition: "environment",
          environment: {
            providerId: "test",
            revision: 1,
            role: "distant-environment",
            primary: baseLobe,
            secondaryWeight: 0
          }
        });
        expect(
          mat.shaderData._macroCollection.isEnable(
            ShaderMacro.getByName("MATERIAL_WATER_SECONDARY_ENVIRONMENT_REFLECTION")
          )
        ).toBe(false);
        expect(
          mat.shaderData._macroCollection.isEnable(ShaderMacro.getByName("MATERIAL_WATER_ENVIRONMENT_BOX_PROJECTION"))
        ).toBe(false);

        applyWaterSurfaceReflectionBinding(mat.shaderData, state, "high", {
          requestedSource: "probe",
          resolvedSource: "probe",
          requestedMode: "probe",
          resolvedMode: "probe",
          composition: "environment",
          environment: {
            providerId: "test",
            revision: 2,
            role: "distant-environment",
            primary: {
              ...baseLobe,
              projection: {
                mode: "box",
                probePosition: [0, 1, 0],
                boxMinimum: [-10, -10, -10],
                boxMaximum: [10, 10, 10]
              }
            },
            secondary: baseLobe,
            secondaryWeight: 0
          }
        });
        expect(
          mat.shaderData._macroCollection.isEnable(
            ShaderMacro.getByName("MATERIAL_WATER_SECONDARY_ENVIRONMENT_REFLECTION")
          )
        ).toBe(true);
        expect(
          mat.shaderData._macroCollection.isEnable(ShaderMacro.getByName("MATERIAL_WATER_ENVIRONMENT_BOX_PROJECTION"))
        ).toBe(true);

        applyWaterSurfaceReflectionBinding(mat.shaderData, state, "high", undefined);
        expect(
          mat.shaderData._macroCollection.isEnable(
            ShaderMacro.getByName("MATERIAL_WATER_SECONDARY_ENVIRONMENT_REFLECTION")
          )
        ).toBe(false);
        expect(
          mat.shaderData._macroCollection.isEnable(ShaderMacro.getByName("MATERIAL_WATER_ENVIRONMENT_BOX_PROJECTION"))
        ).toBe(false);
      } finally {
        mat.destroy(true);
        (dummyCube as unknown as Texture2D).destroy(true);
      }
    } finally {
      lakeShader.destroy();
      riverShader.destroy();
      oceanShader.destroy();
      engine.destroy();
    }
  });
});
