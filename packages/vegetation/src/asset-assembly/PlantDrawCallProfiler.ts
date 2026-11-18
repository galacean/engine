import { type Camera, type MeshRenderer, Script } from "@galacean/engine";

export interface PlantDrawCalls {
  main: number;
  shadow: number;
  shared: number;
}

export interface PlantDrawCallSnapshot extends PlantDrawCalls {
  ready: boolean;
  plants: Readonly<Record<string, PlantDrawCalls>>;
  groups: Readonly<Record<string, PlantDrawCalls>>;
}

type Primitive = { instanceCount: number };
type Renderer = { instanceId: number; mesh: { _primitive: Primitive } };
type Program = { _uploadRendererId: number };
type InstanceBuffer = { upload(renderers: Renderer[], start: number, count: number): void };
type DrawDevice = { drawPrimitive(primitive: Primitive, subMesh: unknown, program: Program): void };
type ProfileEngine = {
  _hardwareRenderer: DrawDevice;
  _batcherManager: { instanceBuffer: InstanceBuffer };
  _renderContext: { camera: Camera | null; virtualCamera: unknown };
};

class PlantDrawCallFrame extends Script {
  profiler?: PlantDrawCallProfiler;
  override onBeginRender(): void {
    this.profiler?.beginFrame();
  }
  override onEndRender(): void {
    this.profiler?.endFrame();
  }
}

const emptyCounts = (): PlantDrawCalls => ({ main: 0, shadow: 0, shared: 0 });

/** Gallery-owned submission profiler. Observes this Engine only and forwards every
 * call unchanged. No shader, batch, culling, render order or Engine source is modified.
 * GLPrimitive emits one GL draw for each submitted non-empty library primitive.
 * InstanceBuffer.upload provides the exact post-culling slice, including UBO splits.
 */
export class PlantDrawCallProfiler {
  private readonly _engine: ProfileEngine;
  private readonly _frame: PlantDrawCallFrame;
  private readonly _owners = new Map<number, { assetId: string; primitive: Primitive }>();
  private readonly _listeners = new Set<() => void>();
  private _assetIds: readonly string[] = [];
  private _groups: readonly { id: string; assetIds: readonly string[] }[] = [];
  private readonly _groupByAsset = new Map<string, string>();
  private _renderers: readonly { assetId: string; renderer: MeshRenderer }[] = [];
  private _providers: readonly { assetId: string; getRenderers(): readonly MeshRenderer[] }[] = [];
  private _instances: readonly Renderer[] = [];
  private _instanceStart = 0;
  private _instanceCount = 0;
  private _pending: PlantDrawCallSnapshot = { ...emptyCounts(), ready: false, plants: {}, groups: {} };
  private _snapshot = this._pending;
  private _signature = "";
  private _destroyed = false;
  private readonly _restore: () => void;

  constructor(private readonly _camera: Camera) {
    const engine = (this._engine = _camera.engine as unknown as ProfileEngine);
    const device = engine._hardwareRenderer;
    const buffer = engine._batcherManager.instanceBuffer;
    const draw = device.drawPrimitive;
    const upload = buffer.upload;
    const profiler = this;
    const observedUpload: InstanceBuffer["upload"] = function (this: InstanceBuffer, renderers, start, count) {
      upload.call(this, renderers, start, count);
      profiler._instances = renderers;
      profiler._instanceStart = start;
      profiler._instanceCount = count;
    };
    const observedDraw: DrawDevice["drawPrimitive"] = function (this: DrawDevice, primitive, subMesh, program) {
      draw.call(this, primitive, subMesh, program);
      profiler._record(primitive, program);
    };
    buffer.upload = observedUpload;
    device.drawPrimitive = observedDraw;
    this._restore = () => {
      if (buffer.upload === observedUpload) buffer.upload = upload;
      if (device.drawPrimitive === observedDraw) device.drawPrimitive = draw;
    };
    this._frame = _camera.entity.addComponent(PlantDrawCallFrame);
    this._frame.profiler = this;
  }

  setRenderers(
    assetIds: readonly string[],
    renderers: readonly { assetId: string; renderer: MeshRenderer }[],
    providers: readonly { assetId: string; getRenderers(): readonly MeshRenderer[] }[] = [],
    groups: readonly { id: string; assetIds: readonly string[] }[] = []
  ): void {
    this._assetIds = assetIds;
    this._renderers = renderers;
    this._providers = providers;
    this._groups = groups;
    this._groupByAsset.clear();
    for (const group of groups) for (const id of group.assetIds) this._groupByAsset.set(id, group.id);
    this._signature = "";
    this.beginFrame();
    this._snapshot = this._pending;
  }

  getSnapshot(): PlantDrawCallSnapshot {
    return this._snapshot;
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  beginFrame(): void {
    this._owners.clear();
    const register = (assetId: string, renderer: MeshRenderer) => {
      const source = renderer as unknown as Renderer;
      if (source.mesh) this._owners.set(source.instanceId, { assetId, primitive: source.mesh._primitive });
    };
    for (const { assetId, renderer } of this._renderers) register(assetId, renderer);
    // Editable exhibition trees can replace their renderers between frames.
    for (const provider of this._providers)
      for (const renderer of provider.getRenderers()) register(provider.assetId, renderer);
    this._pending = {
      ...emptyCounts(),
      ready: false,
      plants: Object.fromEntries(this._assetIds.map((id) => [id, emptyCounts()])),
      groups: Object.fromEntries(this._groups.map(({ id }) => [id, emptyCounts()]))
    };
    this._instances = [];
    this._instanceCount = 0;
  }

  endFrame(): void {
    this._pending.ready = true;
    this._snapshot = this._pending;
    const signature = JSON.stringify(this._snapshot);
    if (signature === this._signature) return;
    this._signature = signature;
    for (const listener of this._listeners) listener();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._restore();
    this._frame.profiler = undefined;
    this._frame.destroy();
    this._owners.clear();
    this._renderers = [];
    this._providers = [];
    this._groups = [];
    this._groupByAsset.clear();
    this._listeners.clear();
  }

  private _record(primitive: Primitive, program: Program): void {
    const context = this._engine._renderContext;
    if (this._destroyed || context.camera !== this._camera) return;
    const assets = new Set<string>();
    const include = (rendererId: number) => {
      const owner = this._owners.get(rendererId);
      if (owner?.primitive === primitive) assets.add(owner.assetId);
    };
    // Explicit instance-attribute meshes (for example the editable shrub) are
    // still owned by one Renderer and do not use the native instance UBO slice.
    if (program._uploadRendererId >= 0) include(program._uploadRendererId);
    else if (primitive.instanceCount > 0) {
      for (let i = this._instanceStart; i < this._instanceStart + this._instanceCount; i++)
        include(this._instances[i].instanceId);
    }
    if (!assets.size) return;
    // The main camera's cascaded shadow pass substitutes its light virtual camera.
    // Other camera renders (for example IBL captures) are outside this panel's scope.
    const stage =
      context.virtualCamera === (this._camera as unknown as { _virtualCamera: unknown })._virtualCamera
        ? "main"
        : "shadow";
    this._pending[stage]++;
    if (assets.size > 1) this._pending.shared++;
    for (const id of assets) {
      this._pending.plants[id][stage]++;
      if (assets.size > 1) this._pending.plants[id].shared++;
    }
    // A native draw shared by several instances contributes once to its parent.
    const groups = new Set([...assets].map((id) => this._groupByAsset.get(id)).filter((id) => id !== undefined));
    for (const id of groups) {
      this._pending.groups[id][stage]++;
      if (groups.size > 1) this._pending.groups[id].shared++;
    }
  }
}
