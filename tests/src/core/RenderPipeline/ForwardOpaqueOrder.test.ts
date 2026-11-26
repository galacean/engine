import { describe, expect, it, vi } from "vitest";
import { CullingResults } from "../../../../packages/core/src/RenderPipeline/CullingResults";
import type { RenderContext } from "../../../../packages/core/src/RenderPipeline/RenderContext";
import type { RenderElement } from "../../../../packages/core/src/RenderPipeline/RenderElement";
import { ForwardOpaqueOrder } from "../../../../packages/core/src/RenderPipeline/enums/ForwardOpaqueOrder";
import { PipelineStage } from "../../../../packages/core/src/RenderPipeline/enums/PipelineStage";
import { RenderQueueMaskType } from "../../../../packages/core/src/RenderPipeline/enums/RenderQueueMaskType";

describe("Forward opaque order", () => {
  const context = {} as RenderContext;

  function batch(order = ForwardOpaqueOrder.Default): RenderElement {
    return { component: { _forwardOpaqueOrder: order } } as RenderElement;
  }

  it("draws coverage before terrain and leaves the original batches available to other passes", () => {
    const culling = new CullingResults();
    const terrainA = batch(ForwardOpaqueOrder.Background);
    const terrainB = batch(ForwardOpaqueOrder.Background);
    const building = batch();
    const leaf = batch();
    const grass = batch(ForwardOpaqueOrder.Coverage);
    culling.opaqueQueue.batchedElements.push(terrainA, building, terrainB);
    culling.alphaTestQueue.batchedElements.push(leaf, grass);
    culling.hasForwardCoverage = true;

    const opaque = vi.spyOn(culling.opaqueQueue, "render").mockImplementation((ctx, stage, mask, elements, lo, hi) => {
      expect([ctx, stage, mask]).toEqual([context, PipelineStage.Forward, RenderQueueMaskType.No]);
      expect(elements).toEqual([building, grass, terrainA, terrainB]);
      expect(elements!.slice(lo, hi)).toEqual([grass]);
    });
    const alphaTest = vi.spyOn(culling.alphaTestQueue, "render").mockImplementation((ctx, stage, mask, elements) => {
      expect([ctx, stage, mask]).toEqual([context, PipelineStage.Forward, RenderQueueMaskType.No]);
      expect(elements).toEqual([leaf]);
    });

    culling.renderForward(context);
    culling.renderForward(context);

    expect(opaque).toHaveBeenCalledTimes(2);
    expect(alphaTest).toHaveBeenCalledTimes(2);
    expect(opaque.mock.invocationCallOrder[0]).toBeLessThan(alphaTest.mock.invocationCallOrder[0]);
    expect(culling.opaqueQueue.batchedElements).toEqual([terrainA, building, terrainB]);
    expect(culling.alphaTestQueue.batchedElements).toEqual([leaf, grass]);
  });

  it("uses the normal queues without both groups or when reordering is disabled", () => {
    const culling = new CullingResults();
    const opaque = vi.spyOn(culling.opaqueQueue, "render").mockImplementation(() => {});
    const alphaTest = vi.spyOn(culling.alphaTestQueue, "render").mockImplementation(() => {});

    culling.alphaTestQueue.batchedElements.push(batch(ForwardOpaqueOrder.Coverage));
    culling.hasForwardCoverage = true;
    culling.renderForward(context);

    culling.reset();
    culling.opaqueQueue.batchedElements.push(batch(ForwardOpaqueOrder.Background));
    culling.renderForward(context);

    expect(culling.hasForwardCoverage).toBe(false);
    culling.alphaTestQueue.batchedElements.push(batch(ForwardOpaqueOrder.Coverage));
    culling.hasForwardCoverage = true;
    culling.renderForward(context, false);

    expect(opaque.mock.calls).toEqual(Array(3).fill([context, PipelineStage.Forward]));
    expect(alphaTest.mock.calls).toEqual(Array(3).fill([context, PipelineStage.Forward]));
  });
});
