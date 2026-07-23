import type { Engine, Entity, Material, ShaderData, TextureCube } from "@galacean/engine-core";
import { describe, expect, it, vi } from "vitest";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { RiverChunkSourceKind } from "../../compiler/river/RiverGeometryEnums";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../../runtime/optics/WaterOpticalProfile";
import { WaterOpticsDebugView } from "../../runtime/optics/WaterSurfaceOpticsTypes";
import { WATER_OPTICS_SHADER_PROPERTY } from "../../runtime/optics/constants/WaterOpticsShaderConstants";
import { RiverRuntimeController } from "../../runtime/river/RiverRuntimeController";

function createMaterialHarness(): {
  readonly material: Material;
  readonly setTexture: ReturnType<typeof vi.fn>;
} {
  const setTexture = vi.fn();
  const shaderData = {
    setFloat: vi.fn(),
    setVector3: vi.fn(),
    setVector4: vi.fn(),
    setMatrix: vi.fn(),
    setTexture
  } as unknown as ShaderData;
  return { material: { shaderData } as unknown as Material, setTexture };
}

describe("RiverRuntimeController surface optics", () => {
  it("updates active and inactive cached surface/local-map materials and clears stale Probe textures", () => {
    const controller = new RiverRuntimeController({} as Engine, {} as Entity);
    const firstSurface = createMaterialHarness();
    const firstLocalMap = createMaterialHarness();
    const cachedSurface = createMaterialHarness();
    const cachedLocalMap = createMaterialHarness();
    const runtimeSets = (
      controller as unknown as {
        readonly _runtimeSets: Map<string, unknown>;
      }
    )._runtimeSets;
    const createRuntimeSet = (surface: Material, surfaceLocalMap: Material): unknown => ({
      reaches: [
        {
          config: { quality: { material: { level: RiverQualityLevel.High } } },
          materials: {
            surface,
            surfaceLocalMap
          }
        }
      ]
    });
    runtimeSets.set("active", createRuntimeSet(firstSurface.material, firstLocalMap.material));
    runtimeSets.set("cached", createRuntimeSet(cachedSurface.material, cachedLocalMap.material));
    const probeTexture = {} as TextureCube;

    controller.setSurfaceOpticsBinding({
      tier: "high",
      opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
      refractionEnabled: true,
      reflection: {
        requestedSource: "probe",
        resolvedSource: "probe",
        probeTexture
      },
      debugView: WaterOpticsDebugView.Final
    });
    for (const harness of [firstSurface, firstLocalMap, cachedSurface, cachedLocalMap]) {
      expect(harness.setTexture).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.reflectionCubeTexture, probeTexture);
    }

    controller.setSurfaceOpticsBinding();
    for (const harness of [firstSurface, firstLocalMap, cachedSurface, cachedLocalMap]) {
      expect(harness.setTexture).toHaveBeenCalledWith(WATER_OPTICS_SHADER_PROPERTY.reflectionCubeTexture, null);
      expect(harness.setTexture).toHaveBeenLastCalledWith(WATER_OPTICS_SHADER_PROPERTY.planarReflectionTexture, null);
    }
  });

  it("toggles generated junction chunks without hiding reach water", () => {
    const controller = new RiverRuntimeController({} as Engine, {} as Entity);
    const reachRoot = { isActive: true };
    const junctionRoot = { isActive: true };
    const internal = controller as unknown as {
      _activeChunks: Array<{
        root: { isActive: boolean };
        sourceId: string;
        compiled: { id: string; sourceKind: RiverChunkSourceKind };
      }>;
    };
    internal._activeChunks = [
      {
        root: reachRoot,
        sourceId: "reach",
        compiled: { id: "reach-chunk", sourceKind: RiverChunkSourceKind.Reach }
      },
      {
        root: junctionRoot,
        sourceId: "junction",
        compiled: { id: "junction-chunk", sourceKind: RiverChunkSourceKind.Junction }
      }
    ];

    controller.setJunctionVisibility(false);
    expect(reachRoot.isActive).toBe(true);
    expect(junctionRoot.isActive).toBe(false);

    controller.setJunctionVisibility(true);
    expect(reachRoot.isActive).toBe(true);
    expect(junctionRoot.isActive).toBe(true);
  });
});
