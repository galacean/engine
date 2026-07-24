import {
  AssetType,
  BoundingBox,
  BoundingFrustum,
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
  private _descriptors: readonly ProbeVolumeChunkDescriptorJSON[] = [];
  private _states = new Map<string, ChunkState>();
  private _loadPromises = new Map<string, Promise<void>>();
  private _desiredChunkIds = new Set<string>();
  private _chunkBounds = new Map<string, BoundingBox>();
  private _lastRequiredAt = new Map<string, number>();
  private _camera!: Camera;
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
    return this._descriptors.length;
  }

  get residentCellCount(): number {
    return this._volume?.cells.length ?? 0;
  }

  get residentBrickCount(): number {
    return this._volume?.bricks.length ?? 0;
  }

  get status(): string {
    const loading = Array.from(this._states.values()).filter((state) => state === "loading").length;
    const errors = Array.from(this._states.values()).filter((state) => state === "error").length;
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
    this._descriptors = volume.chunkDescriptors;
    const camera = this.entity.getComponent(Camera);
    if (!camera) {
      throw new Error("ProbeVolumeStreamingController must be attached to a camera entity.");
    }
    this._camera = camera;
    for (const descriptor of this._descriptors) {
      this._states.set(descriptor.id, "unloaded");
      this._chunkBounds.set(descriptor.id, createChunkWorldBounds(descriptor, volume));
    }
    this._initialized = true;
    await this._refreshDesiredChunks();
  }

  onUpdate(): void {
    if (this._initialized && !this._pinned) {
      void this._refreshDesiredChunks();
    }
  }

  /** Load every binary chunk and stop automatic eviction for bake/download authoring actions. */
  async pinAllChunks(): Promise<void> {
    this._pinned = true;
    this._desiredChunkIds = new Set(this._descriptors.map((descriptor) => descriptor.id));
    const now = Date.now();
    for (const descriptor of this._descriptors) {
      this._lastRequiredAt.set(descriptor.id, now);
    }
    this._notify();
    await Promise.all(this._descriptors.map((descriptor) => this._loadChunk(descriptor, true)));
    this._notify();
  }

  /** Resume camera-relative loading after a temporary authoring operation. */
  resumeStreaming(): void {
    this._pinned = false;
    void this._refreshDesiredChunks();
  }

  private async _refreshDesiredChunks(): Promise<void> {
    Matrix.multiply(this._camera.projectionMatrix, this._camera.viewMatrix, this._viewProjection);
    this._frustum.calculateFromMatrix(this._viewProjection);
    Matrix.invert(this._volume.localToWorldMatrix, this._worldToLocal);
    Vector3.transformCoordinate(this.entity.transform.worldPosition, this._worldToLocal, this._localAnchor);

    const distances = this._descriptors
      .map((descriptor) => ({
        descriptor,
        distance: getHorizontalDistance(descriptor, this._volume.cellSize, this._localAnchor)
      }))
      .sort((left, right) => left.distance - right.distance);
    const visibleDescriptors = this._descriptors.filter((descriptor) =>
      this._frustum.intersectsBox(this._chunkBounds.get(descriptor.id)!)
    );
    const desiredDescriptors = this._descriptors.filter((descriptor) =>
      visibleDescriptors.some((visibleDescriptor) =>
        areChunkBoundsWithinCellHalo(descriptor, visibleDescriptor, visibleCellHalo)
      )
    );
    if (desiredDescriptors.length === 0 && distances.length > 0) {
      desiredDescriptors.push(distances[0].descriptor);
    }
    this._desiredChunkIds = new Set(desiredDescriptors.map((descriptor) => descriptor.id));

    const now = Date.now();
    for (const descriptor of desiredDescriptors) {
      this._lastRequiredAt.set(descriptor.id, now);
    }
    const loadPromises = desiredDescriptors.map((descriptor) => this._loadChunk(descriptor, false));
    for (const descriptor of this._descriptors) {
      if (this._desiredChunkIds.has(descriptor.id)) {
        continue;
      }
      const lastRequiredAt = this._lastRequiredAt.get(descriptor.id);
      if (lastRequiredAt === undefined) {
        this._lastRequiredAt.set(descriptor.id, now);
      } else if (this._states.get(descriptor.id) === "loaded" && now - lastRequiredAt >= unloadDelayMilliseconds) {
        this._volume.removeChunk(descriptor.id);
        this._states.set(descriptor.id, "unloaded");
        this._notify();
      }
    }
    await Promise.all(loadPromises);
  }

  private _loadChunk(descriptor: ProbeVolumeChunkDescriptorJSON, force: boolean): Promise<void> {
    const state = this._states.get(descriptor.id);
    if (state === "loaded" || (state === "error" && !force)) {
      return Promise.resolve();
    }
    const existingRequest = this._loadPromises.get(descriptor.id);
    if (existingRequest) {
      return existingRequest;
    }

    const request = this._requestChunk(descriptor, force).finally(() => {
      this._loadPromises.delete(descriptor.id);
    });
    this._loadPromises.set(descriptor.id, request);
    return request;
  }

  private async _requestChunk(descriptor: ProbeVolumeChunkDescriptorJSON, force: boolean): Promise<void> {
    this._states.set(descriptor.id, "loading");
    this._notify();
    let bufferAsset: BufferAsset | null = null;
    try {
      bufferAsset = await this.engine.resourceManager.load<BufferAsset>({
        type: AssetType.Buffer,
        url: new URL(descriptor.url, this._manifestUrl).href
      });
      const chunk = ProbeVolumeBinary.decode(bufferAsset.buffer);
      if (force || this._pinned || this._desiredChunkIds.has(descriptor.id)) {
        this._volume.addChunk(descriptor.id, chunk);
        this._states.set(descriptor.id, "loaded");
      } else {
        this._states.set(descriptor.id, "unloaded");
      }
      chunk.dispose();
    } catch (error) {
      this._states.set(descriptor.id, "error");
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

function getHorizontalDistance(
  descriptor: ProbeVolumeChunkDescriptorJSON,
  cellSize: number,
  position: Vector3
): number {
  const minCell = toVector3(descriptor.minCell);
  const maxCell = toVector3(descriptor.maxCell);
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

function createChunkWorldBounds(descriptor: ProbeVolumeChunkDescriptorJSON, volume: ProbeVolume): BoundingBox {
  const minCell = toVector3(descriptor.minCell);
  const maxCell = toVector3(descriptor.maxCell);
  const cellSize = volume.cellSize;
  const bounds = new BoundingBox(
    new Vector3(minCell.x * cellSize, minCell.y * cellSize, minCell.z * cellSize),
    new Vector3((maxCell.x + 1) * cellSize, (maxCell.y + 1) * cellSize, (maxCell.z + 1) * cellSize)
  );
  BoundingBox.transform(bounds, volume.localToWorldMatrix, bounds);
  return bounds;
}

function areChunkBoundsWithinCellHalo(
  left: ProbeVolumeChunkDescriptorJSON,
  right: ProbeVolumeChunkDescriptorJSON,
  halo: number
): boolean {
  const leftMin = toVector3(left.minCell);
  const leftMax = toVector3(left.maxCell);
  const rightMin = toVector3(right.minCell);
  const rightMax = toVector3(right.maxCell);
  return (
    getCellBoundsDistance(leftMin.x, leftMax.x, rightMin.x, rightMax.x) <= halo &&
    getCellBoundsDistance(leftMin.y, leftMax.y, rightMin.y, rightMax.y) <= halo &&
    getCellBoundsDistance(leftMin.z, leftMax.z, rightMin.z, rightMax.z) <= halo
  );
}

function getCellBoundsDistance(leftMin: number, leftMax: number, rightMin: number, rightMax: number): number {
  return Math.max(leftMin - rightMax, rightMin - leftMax, 0);
}
