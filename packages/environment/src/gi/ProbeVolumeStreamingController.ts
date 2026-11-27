import {
  AssetType,
  BoundingBox,
  BoundingFrustum,
  BoolUpdateFlag,
  BufferAsset,
  Camera,
  Matrix,
  ProbeVolume,
  ProbeVolumeBinary,
  Script,
  Vector3
} from "@galacean/engine";
import type { ProbeVolumeChunkDescriptorJSON } from "@galacean/engine";

type ChunkState = "unloaded" | "loading" | "loaded" | "error";

interface StreamingChunk {
  descriptor: ProbeVolumeChunkDescriptorJSON;
  cellBounds: BoundingBox;
  worldBounds: BoundingBox;
  state: ChunkState;
  request?: Promise<void>;
  desired: boolean;
  unloadAt: number;
}

const visibleCellHalo = 1;
const unloadDelayMilliseconds = 2000;

/**
 * Keeps independently loaded probe-volume binary chunks resident across the camera view.
 * The probe manifest and streaming policy stay in the demo layer; ProbeVolume owns decoded runtime data.
 */
export class ProbeVolumeStreamingController extends Script {
  onResidencyChanged?: () => void;

  private _volume!: ProbeVolume;
  private _manifestUrl = "";
  private _chunks: StreamingChunk[] = [];
  private _visibleChunkIndices = new Uint32Array(0);
  private _camera!: Camera;
  private _cameraTransformChanged!: BoolUpdateFlag;
  private _viewMatrix = new Matrix();
  private _projectionMatrix = new Matrix();
  private _volumeMatrix = new Matrix();
  private _cellSize = Number.NaN;
  private _viewProjection = new Matrix();
  private _frustum = new BoundingFrustum();
  private _worldToLocal = new Matrix();
  private _localAnchor = new Vector3();
  private _initialized = false;
  private _pinned = false;

  get residentChunkCount(): number {
    return this._volume?.loadedChunkCount ?? 0;
  }

  get totalChunkCount(): number {
    return this._chunks.length;
  }

  get residentCellCount(): number {
    return this._volume?.cells.length ?? 0;
  }

  get residentBrickCount(): number {
    return this._volume?.bricks.length ?? 0;
  }

  get status(): string {
    let loading = 0;
    let errors = 0;
    for (let i = 0; i < this._chunks.length; i++) {
      const state = this._chunks[i].state;
      if (state === "loading") {
        loading++;
      } else if (state === "error") {
        errors++;
      }
    }
    if (errors > 0) {
      return `${errors} chunk request failed`;
    }
    if (loading > 0) {
      return `Loading ${loading} chunk${loading > 1 ? "s" : ""}`;
    }
    return this._pinned ? "All chunks pinned for authoring" : "Covering camera view";
  }

  async initialize(volume: ProbeVolume, manifestUrl: string): Promise<void> {
    this._volume = volume;
    this._manifestUrl = new URL(manifestUrl, location.href).href;
    const camera = this.entity.getComponent(Camera);
    if (!camera) {
      throw new Error("ProbeVolumeStreamingController must be attached to a camera entity.");
    }
    this._camera = camera;
    this._cameraTransformChanged = this.entity.registerWorldChangeFlag();
    this._chunks = volume.chunkDescriptors.map(
      (descriptor): StreamingChunk => ({
        descriptor,
        cellBounds: new BoundingBox(toVector3(descriptor.minCell), toVector3(descriptor.maxCell)),
        worldBounds: new BoundingBox(),
        state: "unloaded",
        desired: false,
        unloadAt: Number.POSITIVE_INFINITY
      })
    );
    this._visibleChunkIndices = new Uint32Array(this._chunks.length);
    this._initialized = true;
    this._refreshDesiredChunks();
    await Promise.all(this._chunks.map((chunk) => chunk.request));
  }

  override onUpdate(): void {
    if (this._initialized && !this._pinned) {
      this._refreshDesiredChunks();
      this._evictUnusedChunks();
    }
  }

  /** Load every binary chunk and stop automatic eviction for bake/download authoring actions. */
  async pinAllChunks(): Promise<void> {
    this._pinned = true;
    for (let i = 0; i < this._chunks.length; i++) {
      const chunk = this._chunks[i];
      chunk.desired = true;
      chunk.unloadAt = Number.POSITIVE_INFINITY;
      this._loadChunk(chunk, true);
    }
    this._notify();
    await Promise.all(this._chunks.map((chunk) => chunk.request));
    this._notify();
  }

  /** Resume camera-relative loading after a temporary authoring operation. */
  resumeStreaming(): void {
    this._pinned = false;
    this._refreshDesiredChunks(true);
    this._notify();
  }

  override onDestroy(): void {
    this._initialized = false;
    this._cameraTransformChanged?.destroy();
    this.onResidencyChanged = undefined;
  }

  private _refreshDesiredChunks(force = false): void {
    const volume = this._volume;
    const view = this._camera.viewMatrix;
    const projection = this._camera.projectionMatrix;
    const volumeChanged =
      this._cellSize !== volume.cellSize || !matricesMatch(this._volumeMatrix, volume.localToWorldMatrix);
    // Public matrices also cover custom view/projection assignments and in-place Volume transforms
    const cameraChanged =
      this._cameraTransformChanged.flag ||
      !matricesMatch(this._viewMatrix, view) ||
      !matricesMatch(this._projectionMatrix, projection);
    if (!force && !cameraChanged && !volumeChanged) {
      return;
    }
    this._cameraTransformChanged.flag = false;
    if (cameraChanged) {
      this._viewMatrix.copyFrom(view);
      this._projectionMatrix.copyFrom(projection);
      Matrix.multiply(projection, view, this._viewProjection);
      this._frustum.calculateFromMatrix(this._viewProjection);
    }
    if (volumeChanged) {
      this._cellSize = volume.cellSize;
      this._volumeMatrix.copyFrom(volume.localToWorldMatrix);
      Matrix.invert(this._volumeMatrix, this._worldToLocal);
    }
    Vector3.transformCoordinate(this.entity.transform.worldPosition, this._worldToLocal, this._localAnchor);

    const chunks = this._chunks;
    let visibleCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (volumeChanged) {
        updateChunkWorldBounds(chunk, volume);
      }
      if (this._frustum.intersectsBox(chunk.worldBounds)) {
        this._visibleChunkIndices[visibleCount++] = i;
      }
    }
    let nearestIndex = -1;
    if (visibleCount === 0) {
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < chunks.length; i++) {
        const distance = getHorizontalDistance(chunks[i].cellBounds, volume.cellSize, this._localAnchor);
        if (distance < nearestDistance) {
          nearestIndex = i;
          nearestDistance = distance;
        }
      }
    }
    const now = Date.now();
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let desired = i === nearestIndex;
      for (let j = 0; j < visibleCount && !desired; j++) {
        desired = areChunkBoundsWithinCellHalo(
          chunk.cellBounds,
          chunks[this._visibleChunkIndices[j]].cellBounds,
          visibleCellHalo
        );
      }
      if (desired) {
        chunk.unloadAt = Number.POSITIVE_INFINITY;
      } else if (chunk.desired) {
        chunk.unloadAt = now + unloadDelayMilliseconds;
      }
      chunk.desired = desired;
      if (desired) {
        this._loadChunk(chunk, false);
      }
    }
  }

  private _evictUnusedChunks(): void {
    let now: number | undefined;
    for (let i = 0; i < this._chunks.length; i++) {
      const chunk = this._chunks[i];
      if (!chunk.desired && chunk.state === "loaded" && (now ??= Date.now()) >= chunk.unloadAt) {
        this._volume.removeChunk(chunk.descriptor.id);
        chunk.state = "unloaded";
        this._notify();
      }
    }
  }

  private _loadChunk(chunk: StreamingChunk, force: boolean): void {
    if (chunk.state === "loaded" || chunk.request || (chunk.state === "error" && !force)) {
      return;
    }
    chunk.request = this._requestChunk(chunk, force).finally(() => {
      chunk.request = undefined;
    });
  }

  private async _requestChunk(entry: StreamingChunk, force: boolean): Promise<void> {
    const descriptor = entry.descriptor;
    entry.state = "loading";
    this._notify();
    let bufferAsset: BufferAsset | null = null;
    try {
      bufferAsset = await this.engine.resourceManager.load<BufferAsset>({
        type: AssetType.Buffer,
        url: new URL(descriptor.url, this._manifestUrl).href
      });
      if (this.destroyed) {
        return;
      }
      const chunk = ProbeVolumeBinary.decode(bufferAsset.buffer);
      if (force || this._pinned || entry.desired) {
        this._volume.addChunk(descriptor.id, chunk);
        entry.state = "loaded";
      } else {
        entry.state = "unloaded";
      }
      chunk.dispose();
    } catch (error) {
      entry.state = "error";
      console.error(`Probe chunk "${descriptor.id}" failed to load.`, error);
    } finally {
      bufferAsset?.destroy();
      this._notify();
    }
  }

  private _notify(): void {
    this.onResidencyChanged?.();
  }
}

function getHorizontalDistance(bounds: BoundingBox, cellSize: number, position: Vector3): number {
  const { min: minCell, max: maxCell } = bounds;
  const minX = minCell.x * cellSize;
  const minZ = minCell.z * cellSize;
  const maxX = (maxCell.x + 1) * cellSize;
  const maxZ = (maxCell.z + 1) * cellSize;
  const dx = Math.max(minX - position.x, 0, position.x - maxX);
  const dz = Math.max(minZ - position.z, 0, position.z - maxZ);
  return Math.max(dx, dz);
}

function toVector3(value: number[] | { x: number; y: number; z: number }): Vector3 {
  return Array.isArray(value) ? new Vector3(value[0], value[1], value[2]) : new Vector3(value.x, value.y, value.z);
}

function updateChunkWorldBounds(chunk: StreamingChunk, volume: ProbeVolume): void {
  const { min: minCell, max: maxCell } = chunk.cellBounds;
  const cellSize = volume.cellSize;
  const bounds = chunk.worldBounds;
  bounds.min.set(minCell.x * cellSize, minCell.y * cellSize, minCell.z * cellSize);
  bounds.max.set((maxCell.x + 1) * cellSize, (maxCell.y + 1) * cellSize, (maxCell.z + 1) * cellSize);
  BoundingBox.transform(bounds, volume.localToWorldMatrix, bounds);
}

function areChunkBoundsWithinCellHalo(left: BoundingBox, right: BoundingBox, halo: number): boolean {
  const { min: leftMin, max: leftMax } = left;
  const { min: rightMin, max: rightMax } = right;
  return (
    getCellBoundsDistance(leftMin.x, leftMax.x, rightMin.x, rightMax.x) <= halo &&
    getCellBoundsDistance(leftMin.y, leftMax.y, rightMin.y, rightMax.y) <= halo &&
    getCellBoundsDistance(leftMin.z, leftMax.z, rightMin.z, rightMax.z) <= halo
  );
}

function getCellBoundsDistance(leftMin: number, leftMax: number, rightMin: number, rightMax: number): number {
  return Math.max(leftMin - rightMax, rightMin - leftMax, 0);
}

function matricesMatch(left: Readonly<Matrix>, right: Readonly<Matrix>): boolean {
  const a = left.elements;
  const b = right.elements;
  for (let i = 0; i < 16; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
