import { SetDataOptions, WebGLEngine } from "@galacean/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Buffer } from "../../../../packages/core/src/graphic/Buffer";
import { PrimitiveChunk } from "../../../../packages/core/src/RenderPipeline/PrimitiveChunk";
import { VertexMergeBatcher } from "../../../../packages/core/src/RenderPipeline/VertexMergeBatcher";
import type { RenderElement } from "../../../../packages/core/src/RenderPipeline/RenderElement";
import { GLPrimitive } from "../../../../packages/rhi-webgl/src/GLPrimitive";

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

  it("skips redundant VBO/IBO GPU uploads in steady-state frames and allocates only 1 slot for static chunks", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);

    const vbo0 = chunk.primitive.vertexBufferBindings[0]!.buffer;
    const ibo0 = chunk.primitive.indexBufferBinding!.buffer;
    const vboSpy = vi.spyOn(vbo0, "setData");
    const iboSpy = vi.spyOn(ibo0, "setData");

    const elem = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);

    // Frame 1: initial upload to fresh slot 0 uses SetDataOptions.None (zero Discard orphans).
    (engine.time as any)._frameCount = 1;
    VertexMergeBatcher.batch(null, elem);
    chunk.uploadBuffer();
    expect(vboSpy).toHaveBeenCalledTimes(1);
    expect(iboSpy).toHaveBeenCalledTimes(1);
    expect(vboSpy.mock.calls[0][4]).toBe(SetDataOptions.None);
    expect(iboSpy.mock.calls[0][4]).toBe(SetDataOptions.None);

    // Frames 2..4: identical data -> zero GPU uploads, ring stays at 1 VBO + 1 IBO (zero extra VRAM).
    for (let frame = 2; frame <= 4; frame++) {
      (engine.time as any)._frameCount = frame;
      VertexMergeBatcher.batch(null, elem);
      chunk.uploadBuffer();
    }
    expect(vboSpy).toHaveBeenCalledTimes(1);
    expect(iboSpy).toHaveBeenCalledTimes(1);
    expect((chunk as any)._vboBindings.length).toBe(1);
    expect((chunk as any)._iboBindings.length).toBe(1);

    // Frame 5: mutate a single vertex float right after static Frame 4 drew vbo0 ->
    // vbo0 is still in-flight (5 - 4 < 3), so VBO safely rotates to a new slot with SetDataOptions.None,
    // while unchanged IBO stays on ibo0 with zero IBO uploads.
    (engine.time as any)._frameCount = 5;
    chunk.vertices[0] = 999;
    VertexMergeBatcher.batch(null, elem);
    chunk.uploadBuffer();
    const vbo1 = chunk.primitive.vertexBufferBindings[0]!.buffer;
    expect(vbo1).not.toBe(vbo0);
    expect(vboSpy).toHaveBeenCalledTimes(1);
    expect(chunk.primitive.indexBufferBinding!.buffer).toBe(ibo0);
    expect(iboSpy).toHaveBeenCalledTimes(1);
  });

  it("rotates 3-frame VBO/IBO ring slots across continuous dynamic frames with zero Discard orphans and bounded VRAM", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);

    const elem = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);
    const gl = (engine._hardwareRenderer as any).gl as WebGL2RenderingContext;
    const setDataSpy = vi.spyOn(Buffer.prototype, "setData");
    const bufferDataSpy = vi.spyOn(gl, "bufferData");
    const bufferSubDataSpy = vi.spyOn(gl, "bufferSubData");

    const vboHistory: Buffer[] = [];
    const iboHistory: Buffer[] = [];

    // 12 consecutive dynamic frames: vertices and indices both change every single frame.
    for (let frame = 1; frame <= 12; frame++) {
      (engine.time as any)._frameCount = frame;
      chunk.vertices[0] = frame * 10;
      elem.subChunk!.indices = frame % 2 === 0 ? [0, 1, 2, 2, 1, 3] : [0, 2, 1, 1, 2, 3];
      VertexMergeBatcher.batch(null, elem);
      chunk.uploadBuffer();
      vboHistory.push(chunk.primitive.vertexBufferBindings[0]!.buffer);
      iboHistory.push(chunk.primitive.indexBufferBinding!.buffer);
    }

    // Ring grows lazily to exactly 3 VBOs and 3 IBOs and cycles 0 -> 1 -> 2 -> 0 -> 1 -> 2.
    expect((chunk as any)._vboBindings.length).toBe(3);
    expect((chunk as any)._iboBindings.length).toBe(3);
    expect(new Set(vboHistory).size).toBe(3);
    expect(new Set(iboHistory).size).toBe(3);
    for (let i = 3; i < 12; i++) {
      expect(vboHistory[i]).toBe(vboHistory[i - 3]);
      expect(iboHistory[i]).toBe(iboHistory[i - 3]);
    }

    // Every single upload used SetDataOptions.None (ZERO Discard orphans!).
    expect(setDataSpy).toHaveBeenCalledTimes(24); // 12 VBO + 12 IBO
    for (const call of setDataSpy.mock.calls) {
      expect(call[4]).toBe(SetDataOptions.None);
    }
    // Only the 2 lazily allocated VBOs + 2 lazily allocated IBOs called gl.bufferData (constructor storage).
    // Frames 4..12 perform ZERO gl.bufferData calls.
    expect(bufferDataSpy).toHaveBeenCalledTimes(4);
    expect(bufferSubDataSpy).toHaveBeenCalledTimes(24);

    // Destroying the chunk destroys ALL 3 VBO slots and ALL 3 IBO slots cleanly.
    const allVbos = [...new Set(vboHistory)];
    const allIbos = [...new Set(iboHistory)];
    chunk.destroy();
    for (const buf of [...allVbos, ...allIbos]) {
      expect(buf.destroyed).toBe(true);
    }
    setDataSpy.mockRestore();
  });

  it("falls back to SetDataOptions.Discard only when >4 uploads saturate a single frame (e.g. MaskManager)", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);

    const elem = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);
    const setDataSpy = vi.spyOn(Buffer.prototype, "setData");

    (engine.time as any)._frameCount = 1;
    engine._frameInProcess = true;

    // 6 dynamic VBO uploads in the SAME frame:
    // - Uploads 1..4 use distinct ring slots 0, 1, 2, 3 with SetDataOptions.None (0 orphans).
    // - Uploads 5..6 saturate the 4-slot cap and safely fall back to SetDataOptions.Discard.
    const vboOptions: SetDataOptions[] = [];
    for (let pass = 1; pass <= 6; pass++) {
      engine._renderCount = pass;
      chunk.vertices[0] = pass * 100;
      VertexMergeBatcher.batch(null, elem);
      const before = setDataSpy.mock.calls.length;
      chunk.uploadBuffer();
      const vboCall = setDataSpy.mock.calls
        .slice(before)
        .find((_, idx) => (setDataSpy.mock.instances[before + idx] as Buffer).type === 0);
      expect(vboCall).toBeDefined();
      vboOptions.push(vboCall![4] as SetDataOptions);
    }
    engine._frameInProcess = false;

    expect(vboOptions).toEqual([
      SetDataOptions.None,
      SetDataOptions.None,
      SetDataOptions.None,
      SetDataOptions.None,
      SetDataOptions.Discard,
      SetDataOptions.Discard
    ]);
    expect((chunk as any)._vboBindings.length).toBe(4);
    setDataSpy.mockRestore();
  });

  it("rotates cleanly with zero Discard orphans across multi-canvas static+dynamic passes (UIUtils.renderOverlay pattern)", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 4096);
    chunks.push(chunk);

    const rhi = engine._hardwareRenderer as any;
    const gl = rhi.gl as WebGL2RenderingContext;
    const glPrimitive = new GLPrimitive(rhi, chunk.primitive);
    (chunk.primitive as any)._platformPrimitive = glPrimitive;
    const fakeProgram = {
      id: 77,
      attributeLocation: { POSITION: 0, TEXCOORD_0: 1, COLOR_0: 2 }
    } as any;
    const drawElementsSpy = vi.spyOn(gl, "drawElements").mockImplementation(() => {});

    const staticCanvasElem = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);
    const dynamicCanvasElem = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);

    // Warm up 4 frames: each frame static Canvas 0 batches/uploads/draws BEFORE dynamic Canvas 1 mutates.
    const setDataSpy = vi.spyOn(Buffer.prototype, "setData");
    for (let f = 1; f <= 4; f++) {
      (engine.time as any)._frameCount = f;
      engine._frameInProcess = true;
      // Canvas 0 (static): stamps previous frame's active slot to f
      VertexMergeBatcher.batch(null, staticCanvasElem);
      chunk.uploadBuffer();
      chunk.primitive.draw(fakeProgram, staticCanvasElem.subChunk!.subMesh);
      // Canvas 1 (dynamic): mutates every frame
      chunk.vertices[dynamicCanvasElem.subChunk!.vertexArea.start] = f * 3.14;
      VertexMergeBatcher.batch(null, dynamicCanvasElem);
      chunk.uploadBuffer();
      chunk.primitive.draw(fakeProgram, dynamicCanvasElem.subChunk!.subMesh);
      engine._frameInProcess = false;
    }

    // Multi-canvas steady state uses 4 slots (D+1 = 4) and tightly sized 4KB VBOs + 1KB IBOs (<= 20KB total VRAM!).
    const vboSlots: Buffer[] = (chunk as any)._vboBindings.map((b: any) => b.buffer);
    const iboSlots: Buffer[] = (chunk as any)._iboBindings.map((b: any) => b.buffer);
    expect(vboSlots.length).toBe(4);
    const totalGpuBytes = [...vboSlots, ...iboSlots].reduce((s, b) => s + b.byteLength, 0);
    expect(totalGpuBytes).toBeLessThanOrEqual(4 * 4096 + 4 * 1024);

    const createVaoSpy = vi.spyOn(gl, "createVertexArray");
    const deleteVaoSpy = vi.spyOn(gl, "deleteVertexArray");
    const bufferDataSpy = vi.spyOn(gl, "bufferData");
    const callsBefore = setDataSpy.mock.calls.length;

    // 12 more consecutive multi-canvas frames: ZERO Discard orphans, ZERO gl.bufferData calls, ZERO VAO thrashing!
    for (let f = 5; f <= 16; f++) {
      (engine.time as any)._frameCount = f;
      engine._frameInProcess = true;
      VertexMergeBatcher.batch(null, staticCanvasElem);
      chunk.uploadBuffer();
      chunk.primitive.draw(fakeProgram, staticCanvasElem.subChunk!.subMesh);
      chunk.vertices[dynamicCanvasElem.subChunk!.vertexArea.start] = f * 3.14;
      VertexMergeBatcher.batch(null, dynamicCanvasElem);
      chunk.uploadBuffer();
      chunk.primitive.draw(fakeProgram, dynamicCanvasElem.subChunk!.subMesh);
      engine._frameInProcess = false;
    }

    const steadyCalls = setDataSpy.mock.calls.slice(callsBefore);
    expect(steadyCalls.length).toBe(12); // exactly 1 VBO upload/frame, 0 IBO uploads
    for (const call of steadyCalls) {
      expect(call[4]).toBe(SetDataOptions.None);
    }
    const vboIboOrphans = bufferDataSpy.mock.calls.filter(
      ([target]) => target === gl.ARRAY_BUFFER || target === gl.ELEMENT_ARRAY_BUFFER
    );
    expect(vboIboOrphans.length).toBe(0);
    expect(createVaoSpy).toHaveBeenCalledTimes(0);
    expect(deleteVaoSpy).toHaveBeenCalledTimes(0);

    chunk.destroy();
    for (const buf of [...vboSlots, ...iboSlots]) {
      expect(buf.destroyed).toBe(true);
    }
    expect((glPrimitive as any)._vaoMap.size).toBe(0);
    drawElementsSpy.mockRestore();
    setDataSpy.mockRestore();
  });

  it("grows lazy power-of-2 GPU VBO slots on demand without leaks or Discard orphans", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 4096);
    chunks.push(chunk);

    // Initially 4 KB VBO + 1 KB IBO (vs 144 KB + 32 KB eager allocation).
    const vboSmall = chunk.primitive.vertexBufferBindings[0]!.buffer;
    const iboSmall = chunk.primitive.indexBufferBinding!.buffer;
    expect(vboSmall.byteLength).toBe(4096);
    expect(iboSmall.byteLength).toBe(1024);

    // Allocate 200 quads (800 vertices * 36B = 28,800 B -> grows cleanly to 32,768 B).
    const elems: RenderElement[] = [];
    for (let i = 0; i < 200; i++) {
      elems.push(makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]));
    }
    const setDataSpy = vi.spyOn(Buffer.prototype, "setData");
    (engine.time as any)._frameCount = 1;
    VertexMergeBatcher.batch(null, elems[0]);
    for (let i = 1; i < elems.length; i++) {
      VertexMergeBatcher.batch(elems[0], elems[i]);
    }
    chunk.uploadBuffer();

    const vboGrown = chunk.primitive.vertexBufferBindings[0]!.buffer;
    const iboGrown = chunk.primitive.indexBufferBinding!.buffer;
    expect(vboSmall.destroyed).toBe(true);
    expect(iboSmall.destroyed).toBe(true);
    expect(vboGrown.byteLength).toBe(32768);
    expect(iboGrown.byteLength).toBe(4096);
    expect(chunk.primitive._bufferStructChanged).toBe(true);
    for (const call of setDataSpy.mock.calls) {
      expect(call[4]).toBe(SetDataOptions.None);
    }

    chunk.destroy();
    expect(vboGrown.destroyed).toBe(true);
    expect(iboGrown.destroyed).toBe(true);
    setDataSpy.mockRestore();
  });

  it("caches per-slot VAOs across 3-frame dynamic rendering with zero VAO thrashing, zero orphans, and zero VAO leaks", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);

    // Bind live src GLPrimitive directly to the chunk's Primitive so this test validates src/GLPrimitive.ts
    // independently of any prebuilt dist/ bundle.
    const rhi = engine._hardwareRenderer as any;
    const gl = rhi.gl as WebGL2RenderingContext;
    const glPrimitive = new GLPrimitive(rhi, chunk.primitive);
    (chunk.primitive as any)._platformPrimitive = glPrimitive;

    const fakeProgram = {
      id: 42,
      attributeLocation: { POSITION: 0, TEXCOORD_0: 1, COLOR_0: 2 }
    } as any;

    const elem = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);
    const createVaoSpy = vi.spyOn(gl, "createVertexArray");
    const deleteVaoSpy = vi.spyOn(gl, "deleteVertexArray");
    const drawElementsSpy = vi.spyOn(gl, "drawElements").mockImplementation(() => {});

    // Warm up 3 dynamic frames so all 3 VBO ring slots and their per-slot VAOs are populated.
    for (let f = 1; f <= 3; f++) {
      (engine.time as any)._frameCount = f;
      chunk.vertices[0] = f * 0.5;
      VertexMergeBatcher.batch(null, elem);
      chunk.uploadBuffer();
      chunk.primitive.draw(fakeProgram, elem.subChunk!.subMesh);
    }
    expect((chunk as any)._vboBindings.length).toBe(3);
    expect((glPrimitive as any)._vaoMap.size).toBe(3);
    expect(createVaoSpy).toHaveBeenCalledTimes(3);
    expect(deleteVaoSpy).toHaveBeenCalledTimes(0);

    const bufferDataSpy = vi.spyOn(gl, "bufferData");

    // Next 9 continuous dynamic frames: 0 VAO creations, 0 VAO deletions, 0 VBO/IBO bufferData orphans!
    for (let f = 4; f <= 12; f++) {
      (engine.time as any)._frameCount = f;
      chunk.vertices[0] = f * 0.5;
      VertexMergeBatcher.batch(null, elem);
      chunk.uploadBuffer();
      chunk.primitive.draw(fakeProgram, elem.subChunk!.subMesh);
    }
    expect(createVaoSpy).toHaveBeenCalledTimes(3);
    expect(deleteVaoSpy).toHaveBeenCalledTimes(0);
    expect(drawElementsSpy).toHaveBeenCalledTimes(12);
    const vboIboOrphans = bufferDataSpy.mock.calls.filter(
      ([target]) => target === gl.ARRAY_BUFFER || target === gl.ELEMENT_ARRAY_BUFFER
    );
    expect(vboIboOrphans.length).toBe(0);

    // Destroying the chunk must delete EVERY cached VAO (0 VAO leaks) and ALL rotated VBO/IBO buffers.
    const vboSlots: Buffer[] = (chunk as any)._vboBindings.map((b: any) => b.buffer);
    const iboSlots: Buffer[] = (chunk as any)._iboBindings.map((b: any) => b.buffer);
    chunk.destroy();
    expect(deleteVaoSpy).toHaveBeenCalledTimes(3);
    expect((glPrimitive as any)._vaoMap.size).toBe(0);
    for (const buf of [...vboSlots, ...iboSlots]) {
      expect(buf.destroyed).toBe(true);
    }

    drawElementsSpy.mockRestore();
  });

  it("keeps idle rotated ring slots alive across ResourceManager.gc() and sizes active-prefix snapshots lazily", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 4096);
    chunks.push(chunk);

    const elem = makeElement(chunk, 4, [0, 1, 2, 2, 1, 3]);
    for (let frame = 1; frame <= 3; frame++) {
      (engine.time as any)._frameCount = frame;
      chunk.vertices[0] = frame;
      VertexMergeBatcher.batch(null, elem);
      chunk.uploadBuffer();
    }

    const vboSlots: Buffer[] = (chunk as any)._vboBindings.map((b: any) => b.buffer);
    expect(vboSlots.length).toBe(3);

    // Active-prefix snapshots must scale with active geometry (~36 floats / 6 indices), NOT full 176 KB capacity.
    const vboSnap: Float32Array = (chunk as any)._gpuVboSnapshot;
    const iboSnap: Uint16Array = (chunk as any)._gpuIboSnapshot;
    expect(vboSnap.byteLength).toBeLessThanOrEqual(256);
    expect(iboSnap.byteLength).toBeLessThanOrEqual(128);

    // Idle slots have refCount=0 but isGCIgnored=true, so gc() must never destroy them.
    engine.resourceManager.gc();
    for (const buf of vboSlots) {
      expect(buf.destroyed).toBe(false);
    }

    chunk.destroy();
    for (const buf of vboSlots) {
      expect(buf.destroyed).toBe(true);
    }
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
    chunk.primitive._bufferStructChanged = false;
    vbo._isContentLost = true;
    ibo._isContentLost = true;
    vbo._rebuild();
    ibo._rebuild();
    expect(vbo.isContentLost).toBe(true);
    expect(ibo.isContentLost).toBe(true);

    // Frame 2: completely static (no writes at all) must restore full [0..72] & [0..12] and invalidate stale VAOs.
    (engine.time as any)._frameCount = 2;
    chunk.uploadBuffer();
    expect(chunk.primitive._bufferStructChanged).toBe(true);
    expect(vboSpy).toHaveBeenCalledTimes(2);
    expect(iboSpy).toHaveBeenCalledTimes(2);
    expect(vboSpy.mock.calls[1][3]).toBe(72);
    expect(vboSpy.mock.calls[1][4]).toBe(SetDataOptions.None);
    expect(iboSpy.mock.calls[1][3]).toBe(12);
    expect(iboSpy.mock.calls[1][4]).toBe(SetDataOptions.None);
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
    expect(grownSpy.mock.calls[0][4]).toBe(SetDataOptions.None);

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
    expect(grownSpy.mock.calls[0][4]).toBe(SetDataOptions.None);
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
    engine._frameInProcess = false;

    expect(chunk.indices.length).toBe(initialLength);
    // Bounded to at most 4 rotated IBO slots, all at the initial 512-index capacity (zero growth).
    const iboSlots: Buffer[] = (chunk as any)._iboBindings.map((b: any) => b.buffer);
    expect(iboSlots.length).toBe(4);
    expect(iboSlots).toContain(chunk.primitive.indexBufferBinding!.buffer);
    for (const buf of iboSlots) {
      expect(buf.byteLength).toBe(initialLength * Uint16Array.BYTES_PER_ELEMENT);
      expect(buf.destroyed).toBe(false);
    }
    expect(iboSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it("handles heterogeneous passes and MaskManager-style same-renderCount cycles with 0 growth, then disposes all rotated IBO slots on growth", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);
    const initialLength = chunk.indices.length; // 512

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
    const preGrowIbos: Buffer[] = (chunk as any)._iboBindings.map((b: any) => b.buffer);
    expect(preGrowIbos.length).toBe(4);
    for (const buf of preGrowIbos) {
      expect(buf.destroyed).toBe(false);
    }

    // Now a single pass genuinely needing 528 indices (> 512) after a 480-index dead prefix
    // must compact the dead prefix first, grow minimally to 1024, clear old VAOs, and destroy ALL 3 old IBO slots.
    chunk.primitive._bufferStructChanged = false;
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
    expect(chunk.primitive._bufferStructChanged).toBe(true);
    expect((chunk as any)._iboBindings.length).toBe(1);
    expect(bigPassQuads[0].subChunk!.subMesh.start).toBe(0);
    expect(extraQuad.subChunk!.subMesh.start).toBe(480);
    expect(extraQuad.subChunk!.subMesh.count).toBe(48);
    for (const oldIbo of preGrowIbos) {
      expect(oldIbo.pendingDestroy).toBe(true);
    }
    (engine as any)._processPendingDestroyObjects();
    engine._frameInProcess = false;
    for (const oldIbo of preGrowIbos) {
      expect(oldIbo.destroyed).toBe(true);
    }
  });

  it("preserves zero-orphan steady-state (0 IBO uploads on Frame 2+) for multi-UICanvas passes in Engine.update() (Path C)", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const chunk = new PrimitiveChunk(engine, 128);
    chunks.push(chunk);

    const setDataSpy = vi.spyOn(Buffer.prototype, "setData");
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

    // Frame 1 populates [0..6) on IBO slot 0 for Canvas 0 and rotates to IBO slot 1 for [0..12) on Canvas 1,
    // both with SetDataOptions.None (zero Discard orphans!).
    runFrame(1);
    expect(canvas0Elem.subChunk!.subMesh.start).toBe(0);
    expect(canvas1Elem.subChunk!.subMesh.start).toBe(6);
    const frame1Calls = setDataSpy.mock.calls.length;
    expect(frame1Calls).toBe(4); // 2 VBO + 2 IBO across the 2 initial passes
    for (const call of setDataSpy.mock.calls) {
      expect(call[4]).toBe(SetDataOptions.None);
    }

    // Frame 2 & Frame 3: identical multi-canvas passes -> ZERO VBO/IBO setData calls!
    runFrame(2);
    runFrame(3);
    expect(setDataSpy).toHaveBeenCalledTimes(frame1Calls);
    expect(canvas0Elem.subChunk!.subMesh.start).toBe(0);
    expect(canvas1Elem.subChunk!.subMesh.start).toBe(6);
    setDataSpy.mockRestore();
  });
});
