export interface RenderDrawCommands {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, group: GPUBindGroup): void;
  setBindGroup(index: number, group: GPUBindGroup, offsets: Uint32Array, start: number, length: number): void;
  setVertexBuffer(slot: number, buffer: GPUBuffer): void;
  setIndexBuffer(buffer: GPUBuffer, format: GPUIndexFormat): void;
  draw(count: number, instances?: number, start?: number, firstInstance?: number): void;
  drawIndexed(count: number, instances?: number, start?: number, baseVertex?: number, firstInstance?: number): void;
}
enum Op {
  Pipeline,
  Group,
  Vertex,
  Index,
  Draw,
  Indexed
}
type Resource = GPUBuffer | GPURenderPipeline | GPUBindGroup | undefined;
interface Command {
  op: Op;
  resource: Resource;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  offsets?: Uint32Array;
}
interface Chunk {
  records: Command[];
  native?: GPURenderBundle;
}
interface History {
  draws: number;
  chunks: Chunk[];
}

/** Replays unchanged native draw streams. Dynamic viewport, scissor, blend and stencil reference remain pass commands. */
export class WebGPUDrawBundles implements RenderDrawCommands {
  private readonly _histories = new WeakMap<object, Map<string, History>>();
  private readonly _submit: GPURenderBundle[] = [];
  private _history?: History;
  private _nativePass?: { executeBundles(bundles: GPURenderBundle[]): void };
  private _descriptor?: GPURenderBundleEncoderDescriptor;
  private _encoder?: GPURenderBundleEncoder;
  private _chunk?: Chunk;
  private _chunkIndex = 0;
  private _cursor = 0;
  private _chunkDraws = 0;
  private _draws = 0;
  private _enabled = false;
  constructor(private readonly _device: GPUDevice) {}

  begin(
    pass: { executeBundles(bundles: GPURenderBundle[]): void },
    target: object,
    key: string,
    colors: readonly GPUTextureFormat[],
    depth: GPUTextureFormat | undefined,
    samples: number,
    force = false
  ): void {
    let histories = this._histories.get(target);
    if (!histories) {
      histories = new Map();
      this._histories.set(target, histories);
    }
    let history = histories.get(key);
    if (!history) {
      history = { draws: 0, chunks: [] };
      histories.set(key, history);
    }
    this._history = history;
    this._enabled = force || history.draws >= 32;
    this._nativePass = pass;
    this._descriptor = this._enabled
      ? { colorFormats: colors, depthStencilFormat: depth, sampleCount: samples }
      : undefined;
    this._chunkIndex = this._draws = 0;
  }

  get enabled(): boolean {
    return this._enabled;
  }
  beginDraw(): boolean {
    this._draws++;
    if (!this._enabled) return false;
    const changed = this._chunkDraws >= 128 && this.flush();
    if (!this._chunk) {
      const chunks = this._history!.chunks;
      this._chunk = chunks[this._chunkIndex] ??= { records: [] };
    }
    this._chunkDraws++;
    return changed;
  }

  flush(): boolean {
    const chunk = this._chunk;
    if (!chunk || !this._cursor) return false;
    if (!chunk.native || this._cursor !== chunk.records.length) this._recordPrefix();
    if (this._encoder) {
      chunk.records.length = this._cursor;
      chunk.native = this._encoder.finish();
      this._encoder = undefined;
    }
    this._submit[0] = chunk.native!;
    this._nativePass!.executeBundles(this._submit);
    this._submit.length = 0;
    this._chunk = undefined;
    this._chunkIndex++;
    this._cursor = this._chunkDraws = 0;
    return true;
  }

  end(): void {
    if (!this._history) return;
    this.flush();
    this._history.draws = this._draws;
    if (this._enabled) this._history.chunks.length = this._chunkIndex;
    this._history = this._chunk = this._nativePass = undefined;
    this._enabled = false;
  }

  setPipeline(pipeline: GPURenderPipeline): void {
    this._command(Op.Pipeline, pipeline);
  }
  setVertexBuffer(slot: number, buffer: GPUBuffer): void {
    const recorded = this._chunk!.records[this._cursor];
    if (!this._encoder && recorded?.op === Op.Vertex && recorded.resource === buffer && recorded.a === slot) {
      this._cursor++;
      return;
    }
    this._command(Op.Vertex, buffer, slot);
  }
  setIndexBuffer(buffer: GPUBuffer, format: GPUIndexFormat): void {
    const encodedFormat = format === "uint16" ? 0 : 1;
    const recorded = this._chunk!.records[this._cursor];
    if (!this._encoder && recorded?.op === Op.Index && recorded.resource === buffer && recorded.a === encodedFormat) {
      this._cursor++;
      return;
    }
    this._command(Op.Index, buffer, encodedFormat);
  }
  setBindGroup(index: number, group: GPUBindGroup, offsets?: Uint32Array, start = 0, length = 0): void {
    this._command(
      Op.Group,
      group,
      index,
      length,
      length ? offsets![start] : 0,
      0,
      0,
      length > 1 ? offsets : undefined,
      start
    );
  }
  draw(count: number, instances = 1, start = 0, firstInstance = 0): void {
    this._command(Op.Draw, undefined, count, instances, start, firstInstance);
  }
  drawIndexed(count: number, instances = 1, start = 0, baseVertex = 0, firstInstance = 0): void {
    const recorded = this._chunk!.records[this._cursor];
    if (
      !this._encoder &&
      recorded?.op === Op.Indexed &&
      recorded.a === count &&
      recorded.b === instances &&
      recorded.c === start &&
      recorded.d === baseVertex &&
      recorded.e === firstInstance
    ) {
      this._cursor++;
      return;
    }
    this._command(Op.Indexed, undefined, count, instances, start, baseVertex, firstInstance);
  }

  private _command(
    op: Op,
    resource: Resource,
    a = 0,
    b = 0,
    c = 0,
    d = 0,
    e = 0,
    offsets?: Uint32Array,
    start = 0
  ): void {
    const records = this._chunk!.records;
    let r = records[this._cursor];
    let same =
      r && r.op === op && r.resource === resource && r.a === a && r.b === b && r.c === c && r.d === d && r.e === e;
    if (same && offsets) {
      for (let i = 1; i < b; i++)
        if (r.offsets![i] !== offsets[start + i]) {
          same = false;
          break;
        }
    }
    if (!same) {
      this._recordPrefix();
      if (!r) records[this._cursor] = r = { op, resource, a, b, c, d, e };
      else {
        r.op = op;
        r.resource = resource;
        r.a = a;
        r.b = b;
        r.c = c;
        r.d = d;
        r.e = e;
      }
      if (offsets) {
        if (!r.offsets || r.offsets.length !== b) r.offsets = new Uint32Array(b);
        for (let i = 0; i < b; i++) r.offsets[i] = offsets[start + i];
      }
    }
    this._cursor++;
    if (this._encoder) this._encode(this._encoder, r);
  }

  private _recordPrefix(): void {
    if (this._encoder) return;
    const encoder = (this._encoder = this._device.createRenderBundleEncoder(this._descriptor!));
    const records = this._chunk!.records;
    for (let i = 0; i < this._cursor; i++) this._encode(encoder, records[i]);
  }

  private _encode(encoder: GPURenderBundleEncoder, r: Command): void {
    switch (r.op) {
      case Op.Pipeline:
        encoder.setPipeline(r.resource as GPURenderPipeline);
        return;
      case Op.Vertex:
        encoder.setVertexBuffer(r.a, r.resource as GPUBuffer);
        return;
      case Op.Index:
        encoder.setIndexBuffer(r.resource as GPUBuffer, r.a ? "uint32" : "uint16");
        return;
      case Op.Group:
        if (!r.b) encoder.setBindGroup(r.a, r.resource as GPUBindGroup);
        else if (r.b === 1) encoder.setBindGroup(r.a, r.resource as GPUBindGroup, [r.c]);
        else encoder.setBindGroup(r.a, r.resource as GPUBindGroup, r.offsets!, 0, r.b);
        return;
      case Op.Draw:
        encoder.draw(r.a, r.b, r.c, r.d);
        return;
      case Op.Indexed:
        encoder.drawIndexed(r.a, r.b, r.c, r.d, r.e);
        return;
    }
  }
}
