import { SetDataOptions, WebGLEngine } from "@galacean/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrimitiveChunk } from "../../../../packages/core/src/RenderPipeline/PrimitiveChunk";
import { VertexMergeBatcher } from "../../../../packages/core/src/RenderPipeline/VertexMergeBatcher";
import type { RenderElement } from "../../../../packages/core/src/RenderPipeline/RenderElement";

function makeElement(chunk: PrimitiveChunk, vertexCount: number, localIndices: number[]): RenderElement {
  const subChunk = chunk.allocateSubChunk(vertexCount)!;
  expect(subChunk).not.toBeNull();
  subChunk.indices = localIndices;
  const { start, size } = subChunk.vertexArea;
  for (let i = 0; i < size; i++) {
    chunk.vertices[start + i] = start + i + 1;
  }
  return { subChunk } as RenderElement;
}

describe("PrimitiveChunk", () => {
  let engine: WebGLEngine | undefined;
  const chunks: PrimitiveChunk[] = [];

  afterEach(() => {
    for (const chunk of chunks.splice(0)) {
      if (chunk.primitive) chunk.destroy();
    }
    engine?.destroy();
    engine = undefined;
  });

  it("skips redundant VBO/IBO GPU uploads in steady-state frames when vertex and index data are unchanged", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);

    const vbo = chunk.primitive.vertexBufferBindings[0]!.buffer;
    const ibo = chunk.primitive.indexBufferBinding!.buffer;
    const vboSpy = vi.spyOn(vbo, "setData");
    const iboSpy = vi.spyOn(ibo, "setData");

    const elem = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);

    // Frame 1: initial upload.
    (engine.time as any)._frameCount = 1;
    VertexMergeBatcher.batch(null, elem);
    chunk.uploadBuffer();
    expect(vboSpy).toHaveBeenCalledTimes(1);
    expect(iboSpy).toHaveBeenCalledTimes(1);
    expect(vboSpy.mock.calls[0][4]).toBe(SetDataOptions.Discard);
    expect(iboSpy.mock.calls[0][4]).toBe(SetDataOptions.Discard);

    // Frame 2: identical data -> zero GPU uploads.
    (engine.time as any)._frameCount = 2;
    VertexMergeBatcher.batch(null, elem);
    chunk.uploadBuffer();
    expect(vboSpy).toHaveBeenCalledTimes(1);
    expect(iboSpy).toHaveBeenCalledTimes(1);

    // Frame 3: mutate a single vertex float -> only VBO uploads.
    (engine.time as any)._frameCount = 3;
    chunk.vertices[0] = 999;
    VertexMergeBatcher.batch(null, elem);
    chunk.uploadBuffer();
    expect(vboSpy).toHaveBeenCalledTimes(2);
    expect(iboSpy).toHaveBeenCalledTimes(1);
  });

  it("re-uploads full VBO/IBO high-water ranges immediately after WebGL context loss/restore even when static (P1-1)", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);

    const vbo = chunk.primitive.vertexBufferBindings[0]!.buffer;
    const ibo = chunk.primitive.indexBufferBinding!.buffer;
    const vboSpy = vi.spyOn(vbo, "setData");
    const iboSpy = vi.spyOn(ibo, "setData");

    const elemA = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);
    const elemB = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);

    (engine.time as any)._frameCount = 1;
    VertexMergeBatcher.batch(null, elemA);
    VertexMergeBatcher.batch(elemA, elemB);
    chunk.uploadBuffer();
    expect(vboSpy).toHaveBeenCalledTimes(1);
    expect(iboSpy).toHaveBeenCalledTimes(1);
    expect(vboSpy.mock.calls[0][3]).toBe(72); // 8 vertices * 9 floats
    expect(iboSpy.mock.calls[0][3]).toBe(12); // 2 quads * 6 indices

    // Simulate WebGL context loss + restore rebuild (empty GPU buffers with _isContentLost = true).
    vbo._isContentLost = true;
    ibo._isContentLost = true;
    vbo._rebuild();
    ibo._rebuild();
    expect(vbo.isContentLost).toBe(true);
    expect(ibo.isContentLost).toBe(true);

    // Frame 2: completely static (only elemA re-batched or even no writes at all) must restore full [0..72] & [0..12].
    (engine.time as any)._frameCount = 2;
    chunk.uploadBuffer();
    expect(vboSpy).toHaveBeenCalledTimes(2);
    expect(iboSpy).toHaveBeenCalledTimes(2);
    expect(vboSpy.mock.calls[1][3]).toBe(72);
    expect(vboSpy.mock.calls[1][4]).toBe(SetDataOptions.Discard);
    expect(iboSpy.mock.calls[1][3]).toBe(12);
    expect(iboSpy.mock.calls[1][4]).toBe(SetDataOptions.Discard);
    expect(vbo.isContentLost).toBe(false);
    expect(ibo.isContentLost).toBe(false);

    // Frame 3: back to steady state -> zero uploads again.
    (engine.time as any)._frameCount = 3;
    VertexMergeBatcher.batch(null, elemA);
    VertexMergeBatcher.batch(elemA, elemB);
    chunk.uploadBuffer();
    expect(vboSpy).toHaveBeenCalledTimes(2);
    expect(iboSpy).toHaveBeenCalledTimes(2);
  });

  it("grows IBO losslessly on intra-batch overflow (e.g. SpriteMask 512-index chunk) and disposes old & final buffers cleanly (P1-2a)", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    // SpriteMask chunk uses maxVertexCount = 128 -> initial IBO capacity is 512 Uint16 indices.
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);
    expect(chunk.indices.length).toBe(512);

    const initialIbo = chunk.primitive.indexBufferBinding!.buffer;
    const initialVbo = chunk.primitive.vertexBufferBindings[0]!.buffer;

    // Allocate 32 quads (128 vertices), each referencing 18 indices (6 triangles) in one single batch -> 576 > 512!
    const elements: RenderElement[] = [];
    const perElemIndices = [0, 1, 2, 2, 1, 3, 0, 1, 2, 2, 1, 3, 0, 1, 2, 2, 1, 3];
    for (let i = 0; i < 32; i++) {
      elements.push(makeElement(chunk, 4, perElemIndices));
    }

    (engine.time as any)._frameCount = 1;
    VertexMergeBatcher.batch(null, elements[0]);
    for (let i = 1; i < elements.length; i++) {
      // Continuing the same batch (preElement !== null, i.e., isBatchStart === false) crosses 512 indices!
      VertexMergeBatcher.batch(elements[0], elements[i]);
    }

    expect(chunk.indices.length).toBe(1024);
    expect(chunk.updateIndexLength).toBe(576);
    expect(elements[0].subChunk!.subMesh.start).toBe(0);
    expect(elements[0].subChunk!.subMesh.count).toBe(576);
    // Old GPU Buffer must be destroyed immediately upon growth.
    expect(initialIbo.destroyed).toBe(true);
    const grownIbo = chunk.primitive.indexBufferBinding!.buffer;
    expect(grownIbo).not.toBe(initialIbo);
    expect(grownIbo.destroyed).toBe(false);

    // Verify first and last element indices are intact in the grown buffer.
    expect(Array.from(chunk.indices.subarray(0, 6))).toEqual([0, 1, 2, 2, 1, 3]);
    const lastOffset = 31 * 4;
    expect(Array.from(chunk.indices.subarray(576 - 6, 576))).toEqual([
      lastOffset,
      lastOffset + 1,
      lastOffset + 2,
      lastOffset + 2,
      lastOffset + 1,
      lastOffset + 3
    ]);

    const grownSpy = vi.spyOn(grownIbo, "setData");
    chunk.uploadBuffer();
    expect(grownSpy).toHaveBeenCalledTimes(1);
    expect(grownSpy.mock.calls[0][3]).toBe(576);

    // Destroying the chunk must dispose both VBO and the current grown IBO cleanly.
    chunk.destroy();
    expect(initialVbo.destroyed).toBe(true);
    expect(grownIbo.destroyed).toBe(true);
  });

  it("preserves earlier unrendered batches in the same unuploaded pass when a new batch exceeds initial IBO capacity (P1-2b)", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);
    expect(chunk.indices.length).toBe(512);

    // Batch A writes 504 indices [0..504), leaving 8 slots before initial 512 capacity.
    const batchA = makeElement(
      chunk,
      4,
      Array.from({ length: 84 }, () => [0, 1, 2, 2, 1, 3]).flat()
    );
    // Batch B starts a second batch in the SAME unuploaded pass needing 12 indices -> 504 + 12 = 516 > 512.
    const batchB = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3, 0, 1, 2, 2, 1, 3]);

    (engine.time as any)._frameCount = 1;
    VertexMergeBatcher.batch(null, batchA);
    VertexMergeBatcher.batch(null, batchB);
    expect(chunk.indices.length).toBe(1024);
    expect(batchA.subChunk!.subMesh.start).toBe(0);
    expect(batchA.subChunk!.subMesh.count).toBe(504);
    expect(batchB.subChunk!.subMesh.start).toBe(504);
    expect(batchB.subChunk!.subMesh.count).toBe(12);

    // Batch A's indices at [0..6] must NOT be overwritten by Batch B, and Batch B's must start at 504 with vertexOffset 4.
    expect(Array.from(chunk.indices.subarray(0, 6))).toEqual([0, 1, 2, 2, 1, 3]);
    expect(Array.from(chunk.indices.subarray(504, 510))).toEqual([4, 5, 6, 6, 5, 7]);

    const grownIbo = chunk.primitive.indexBufferBinding!.buffer;
    const grownSpy = vi.spyOn(grownIbo, "setData");
    chunk.uploadBuffer();
    expect(grownSpy).toHaveBeenCalledTimes(1);
    expect(grownSpy.mock.calls[0][3]).toBe(516);
    expect(grownSpy.mock.calls[0][4]).toBe(SetDataOptions.Discard);
  });

  it("resets cursor on standalone manual camera.render() passes with frozen frameCount (0 reallocs, 1 steady-state upload) (Path A)", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);
    const initialLength = chunk.indices.length;
    const initialIbo = chunk.primitive.indexBufferBinding!.buffer;
    const iboSpy = vi.spyOn(initialIbo, "setData");

    // 60 indices per manual render; 50 renders would be 3000 > 512 without manual-render reset.
    const elem = makeElement(
      chunk,
      4,
      Array.from({ length: 10 }, () => [0, 1, 2, 2, 1, 3]).flat()
    );

    (engine.time as any)._frameCount = 1;
    engine._frameInProcess = false;

    for (let pass = 1; pass <= 50; pass++) {
      engine._renderCount = pass;
      VertexMergeBatcher.batch(null, elem);
      chunk.uploadBuffer();
    }

    expect(chunk.indices.length).toBe(initialLength);
    expect(chunk.primitive.indexBufferBinding!.buffer).toBe(initialIbo);
    expect(initialIbo.destroyed).toBe(false);
    expect(iboSpy).toHaveBeenCalledTimes(1);
  });

  it("compacts live multi-quad passes with 0 IBO growth across 50 cross-renderCount passes in one Engine.update() frame (Path B)", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);
    const initialLength = chunk.indices.length; // 512

    // 16 distinct 6-index quads per pass (= 96 indices/pass; 50 passes = 4800 indices total).
    // Mixes unmerged separate batches (first 8 quads) + merged single batch (last 8 quads)
    // so mid-pass compaction is proven for BOTH standalone and merged SubMeshes.
    const quads: RenderElement[] = [];
    for (let q = 0; q < 16; q++) {
      quads.push(makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]));
    }

    (engine.time as any)._frameCount = 1;
    engine._frameInProcess = true;
    const initialIbo = chunk.primitive.indexBufferBinding!.buffer;
    const iboSpy = vi.spyOn(initialIbo, "setData");

    for (let pass = 1; pass <= 50; pass++) {
      engine._renderCount = pass;
      // Rotate quad order between odd/even passes to avoid trivial identical snapshots.
      const offset = pass % 2 === 0 ? 1 : 0;
      const ordered = quads.map((_, i) => quads[(i + offset) % quads.length]);

      // 8 unmerged quads (8 separate SubMeshes)
      for (let i = 0; i < 8; i++) {
        VertexMergeBatcher.batch(null, ordered[i]);
      }
      // 8 merged quads sharing ordered[8]'s SubMesh
      VertexMergeBatcher.batch(null, ordered[8]);
      for (let i = 9; i < 16; i++) {
        VertexMergeBatcher.batch(ordered[8], ordered[i]);
      }

      chunk.uploadBuffer();

      // Verify every unmerged quad's SubMesh range and relocated index values.
      for (let i = 0; i < 8; i++) {
        const sub = ordered[i].subChunk!;
        const { start, count } = sub.subMesh;
        expect(count).toBe(6);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(start + count).toBeLessThanOrEqual(chunk.indices.length);
        const vOff = sub.vertexArea.start / 9;
        expect(Array.from(chunk.indices.subarray(start, start + 6))).toEqual([
          vOff,
          vOff + 1,
          vOff + 2,
          vOff + 2,
          vOff + 1,
          vOff + 3
        ]);
      }
      // Verify the merged 8-quad batch's start/count and first+last quad index values.
      const mergedLeader = ordered[8].subChunk!;
      expect(mergedLeader.subMesh.count).toBe(48);
      expect(mergedLeader.subMesh.start + 48).toBeLessThanOrEqual(chunk.indices.length);
      const firstMergedVOff = mergedLeader.vertexArea.start / 9;
      const lastMergedVOff = ordered[15].subChunk!.vertexArea.start / 9;
      expect(
        Array.from(chunk.indices.subarray(mergedLeader.subMesh.start, mergedLeader.subMesh.start + 6))
      ).toEqual([
        firstMergedVOff,
        firstMergedVOff + 1,
        firstMergedVOff + 2,
        firstMergedVOff + 2,
        firstMergedVOff + 1,
        firstMergedVOff + 3
      ]);
      expect(
        Array.from(chunk.indices.subarray(mergedLeader.subMesh.start + 42, mergedLeader.subMesh.start + 48))
      ).toEqual([
        lastMergedVOff,
        lastMergedVOff + 1,
        lastMergedVOff + 2,
        lastMergedVOff + 2,
        lastMergedVOff + 1,
        lastMergedVOff + 3
      ]);
    }

    expect(chunk.indices.length).toBe(initialLength);
    expect(chunk.primitive.indexBufferBinding!.buffer).toBe(initialIbo);
    expect(initialIbo.destroyed).toBe(false);
    expect(iboSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it("handles heterogeneous passes and MaskManager-style same-renderCount upload cycles with 0 growth, then grows minimally only when one pass exceeds capacity", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);
    const initialLength = chunk.indices.length; // 512
    const initialIbo = chunk.primitive.indexBufferBinding!.buffer;

    const tinyQuad = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);
    const bigPassQuads = Array.from({ length: 10 }, () =>
      makeElement(
        chunk,
        4,
        Array.from({ length: 8 }, () => [0, 1, 2, 2, 1, 3]).flat()
      )
    ); // 10 * 48 = 480 indices

    (engine.time as any)._frameCount = 1;
    engine._frameInProcess = true;
    engine._renderCount = 7; // Frozen _renderCount (MaskManager.drawMask pattern)

    // 30 alternating tiny (6) and large (480) passes with frozen frameCount & frozen _renderCount -> 0 growth!
    for (let iter = 0; iter < 30; iter++) {
      VertexMergeBatcher.batch(null, tinyQuad);
      chunk.uploadBuffer();
      expect(tinyQuad.subChunk!.subMesh.count).toBe(6);

      for (let i = 0; i < bigPassQuads.length; i++) {
        VertexMergeBatcher.batch(null, bigPassQuads[i]);
      }
      chunk.uploadBuffer();
      // iter 0 fits right after tinyQuad ([6..486) <= 512); iter 1+ compacts live pass cleanly to [0..480).
      const expectedBase = iter === 0 ? 6 : 0;
      expect(bigPassQuads[0].subChunk!.subMesh.start).toBe(expectedBase);
      expect(bigPassQuads[9].subChunk!.subMesh.start).toBe(expectedBase + 432);
      const lastVOff = bigPassQuads[9].subChunk!.vertexArea.start / 9;
      expect(
        Array.from(chunk.indices.subarray(expectedBase + 432, expectedBase + 438))
      ).toEqual([lastVOff, lastVOff + 1, lastVOff + 2, lastVOff + 2, lastVOff + 1, lastVOff + 3]);
    }

    expect(chunk.indices.length).toBe(initialLength);
    expect(chunk.primitive.indexBufferBinding!.buffer).toBe(initialIbo);
    expect(initialIbo.destroyed).toBe(false);

    // Now a single pass genuinely needing 528 indices (> 512) after a 480-index dead prefix
    // must compact the dead prefix first and grow only to 1024 (NOT 480 + 528 = 1008 -> still 1024,
    // and start offset must be 0 rather than 480).
    for (let i = 0; i < bigPassQuads.length; i++) {
      VertexMergeBatcher.batch(null, bigPassQuads[i]); // 480
    }
    const extraQuad = makeElement(
      chunk,
      4,
      Array.from({ length: 8 }, () => [0, 1, 2, 2, 1, 3]).flat()
    ); // +48 = 528
    VertexMergeBatcher.batch(null, extraQuad);
    chunk.uploadBuffer();

    expect(chunk.indices.length).toBe(1024);
    expect(bigPassQuads[0].subChunk!.subMesh.start).toBe(0);
    expect(extraQuad.subChunk!.subMesh.start).toBe(480);
    expect(extraQuad.subChunk!.subMesh.count).toBe(48);
    expect(initialIbo.pendingDestroy).toBe(true);
    (engine as any)._processPendingDestroyObjects();
    engine._frameInProcess = false;
    expect(initialIbo.destroyed).toBe(true);
  });

  it("preserves zero-orphan steady-state (0 IBO uploads on Frame 2+) for multi-UICanvas passes in Engine.update() (Path C)", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);

    const ibo = chunk.primitive.indexBufferBinding!.buffer;
    const iboSpy = vi.spyOn(ibo, "setData");

    const canvas0Elem = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);
    const canvas1Elem = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);

    let renderCount = 0;
    const runFrame = (frameCount: number) => {
      (engine!.time as any)._frameCount = frameCount;
      engine!._frameInProcess = true;
      // Canvas 0 pass
      engine!._renderCount = ++renderCount;
      VertexMergeBatcher.batch(null, canvas0Elem);
      chunk.uploadBuffer();
      // Canvas 1 pass in the same Engine.update() frame
      engine!._renderCount = ++renderCount;
      VertexMergeBatcher.batch(null, canvas1Elem);
      chunk.uploadBuffer();
      engine!._frameInProcess = false;
    };

    // Frame 1 populates [0..6) for Canvas 0 and [6..12) for Canvas 1.
    runFrame(1);
    expect(canvas0Elem.subChunk!.subMesh.start).toBe(0);
    expect(canvas1Elem.subChunk!.subMesh.start).toBe(6);
    const frame1Uploads = iboSpy.mock.calls.length;
    expect(frame1Uploads).toBe(2);

    // Frame 2 & Frame 3: identical multi-canvas passes -> ZERO IBO setData calls!
    runFrame(2);
    runFrame(3);
    expect(iboSpy).toHaveBeenCalledTimes(frame1Uploads);
    expect(canvas0Elem.subChunk!.subMesh.start).toBe(0);
    expect(canvas1Elem.subChunk!.subMesh.start).toBe(6);
  });
});
