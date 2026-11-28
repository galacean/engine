import { BoundingBox, Matrix, Vector3 } from "@galacean/engine-math";
import { describe, expect, it, vi } from "vitest";
import { HeightfieldWaterRuntimeController } from "@galacean/engine-water/water/runtime/heightfield/HeightfieldWaterRuntimeController";

function makeBox(minX: number, minZ: number, maxX: number, maxZ: number): BoundingBox {
  return new BoundingBox(new Vector3(minX, -1, minZ), new Vector3(maxX, 1, maxZ));
}

describe("HeightfieldWaterRuntimeController.hasCameraVisibleSurfaceChunk", () => {
  it("matches BasicRenderPipeline renderer.bounds submission under partial vs full terrain occlusion", () => {
    const rendererBounds = makeBox(0, 0, 128, 128);
    const occludedCellBounds = makeBox(0, 0, 64, 64);
    const openCellBounds = makeBox(64, 64, 128, 128);
    const worldMatrix = new Matrix();

    const chunk = {
      renderer: {
        enabled: true,
        bounds: rendererBounds,
        entity: { isActiveInHierarchy: true, layer: 1 }
      },
      visibilityBounds: [
        { localBounds: occludedCellBounds, worldBounds: occludedCellBounds, terrainOccluded: true },
        { localBounds: openCellBounds, worldBounds: openCellBounds, terrainOccluded: false }
      ],
      terrainOcclusionKeys: ["k0", "k1"],
      terrainOccluded: false
    };

    const controller = Object.create(HeightfieldWaterRuntimeController.prototype) as HeightfieldWaterRuntimeController & {
      _activeSet: unknown;
    };
    controller._activeSet = {
      root: { transform: { worldMatrix } },
      visibilityWorldMatrixElements: new Float32Array(worldMatrix.elements),
      visibilityWorldMatrixInitialized: true,
      chunks: [chunk]
    };

    // 1. Partially occluded chunk whose renderer.bounds intersects the frustum (even if only the occluded corner is in view)
    //    MUST return true so opaqueTexture/depthTexture leases stay active while BasicRenderPipeline submits the MeshRenderer.
    const visibleSpy = vi.fn((bounds: BoundingBox) => bounds === rendererBounds);
    expect(controller.hasCameraVisibleSurfaceChunk({ isVisible: visibleSpy })).toBe(true);
    expect(visibleSpy).toHaveBeenCalledTimes(1);
    expect(visibleSpy).toHaveBeenCalledWith(rendererBounds, 1);

    // 2. When renderer.bounds is outside the frustum, returns false immediately without iterating dead visibilityBounds cells.
    const culledSpy = vi.fn(() => false);
    expect(controller.hasCameraVisibleSurfaceChunk({ isVisible: culledSpy })).toBe(false);
    expect(culledSpy).toHaveBeenCalledTimes(1);
    expect(culledSpy).toHaveBeenCalledWith(rendererBounds, 1);

    // 3. When all cells are terrain-occluded, refreshTerrainOcclusion disables renderer.enabled -> returns false.
    chunk.renderer.enabled = false;
    const disabledSpy = vi.fn(() => true);
    expect(controller.hasCameraVisibleSurfaceChunk({ isVisible: disabledSpy })).toBe(false);
    expect(disabledSpy).not.toHaveBeenCalled();
  });
});
