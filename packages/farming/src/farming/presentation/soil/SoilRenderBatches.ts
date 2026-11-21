import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Entity,
  IndexFormat,
  Matrix,
  MeshRenderer,
  MeshTopology,
  Script,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector3,
  Vector4,
  VertexElement,
  VertexElementFormat,
  type Engine,
  type PBRMaterial
} from "@galacean/engine";
import type { PlotGrid } from "../../domain/FarmingGround";
import type { SoilCell } from "./SoilBoundary";
import type { SurfaceTriangle } from "../../geometry/SurfaceTriangles";
import { restoreResource } from "@galacean/engine-modify/rendering/RestorableResources";
import { disposeSoilMesh } from "./disposeSoilMesh";

export const SOIL_BATCH_SIDE = 4;
export const SOIL_COVERAGE_SIDE = 65;
const stateSize = 12;
const VERTEX_FLOATS = 16;
const VERTEX_STRIDE = VERTEX_FLOATS * 4;
const scratchBoundsPoint = new Vector3();

interface Chunk {
  key: string;
  entity: Entity;
  renderer: MeshRenderer;
  plots: Set<SoilBatchPlot>;
  plotList: SoilBatchPlot[];
  mesh?: BufferMesh;
  geometryDirty: boolean;
  visibilityDirty: boolean;
}

function createSoilVertexElements(): VertexElement[] {
  return [
    new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
    new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
    new VertexElement("TANGENT", 24, VertexElementFormat.Vector4, 0),
    new VertexElement("COLOR_0", 40, VertexElementFormat.Vector4, 0),
    new VertexElement("TEXCOORD_0", 56, VertexElementFormat.Vector2, 0)
  ];
}

function computeInterleavedTangents(
  vertices: Float32Array,
  vertexCount: number,
  indices: Uint32Array,
  indexCount: number,
  basis: Float64Array
): void {
  basis.fill(0, 0, vertexCount * 6);
  for (let i = 0; i + 2 < indexCount; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    const offsetA = a * VERTEX_FLOATS;
    const offsetB = b * VERTEX_FLOATS;
    const offsetC = c * VERTEX_FLOATS;
    const e1x = vertices[offsetB] - vertices[offsetA];
    const e1y = vertices[offsetB + 1] - vertices[offsetA + 1];
    const e1z = vertices[offsetB + 2] - vertices[offsetA + 2];
    const e2x = vertices[offsetC] - vertices[offsetA];
    const e2y = vertices[offsetC + 1] - vertices[offsetA + 1];
    const e2z = vertices[offsetC + 2] - vertices[offsetA + 2];
    const x1 = vertices[offsetB + 14] - vertices[offsetA + 14];
    const x2 = vertices[offsetC + 14] - vertices[offsetA + 14];
    const y1 = vertices[offsetB + 15] - vertices[offsetA + 15];
    const y2 = vertices[offsetC + 15] - vertices[offsetA + 15];
    const determinant = x1 * y2 - x2 * y1;
    if (determinant === 0) continue;
    const inverse = 1 / determinant;
    const ty1 = y1 * inverse;
    const ty2 = y2 * inverse;
    const bx1 = x1 * inverse;
    const bx2 = x2 * inverse;
    const tx = e1x * ty2 - e2x * ty1;
    const ty = e1y * ty2 - e2y * ty1;
    const tz = e1z * ty2 - e2z * ty1;
    const bx = e2x * bx1 - e1x * bx2;
    const by = e2y * bx1 - e1y * bx2;
    const bz = e2z * bx1 - e1z * bx2;
    for (let corner = 0; corner < 3; corner++) {
      const offset = (corner === 0 ? a : corner === 1 ? b : c) * 6;
      basis[offset] += tx;
      basis[offset + 1] += ty;
      basis[offset + 2] += tz;
      basis[offset + 3] += bx;
      basis[offset + 4] += by;
      basis[offset + 5] += bz;
    }
  }
  for (let i = 0; i < vertexCount; i++) {
    const vOffset = i * VERTEX_FLOATS;
    const nx = vertices[vOffset + 3];
    const ny = vertices[vOffset + 4];
    const nz = vertices[vOffset + 5];
    const bOffset = i * 6;
    let tx = basis[bOffset];
    let ty = basis[bOffset + 1];
    let tz = basis[bOffset + 2];
    const bx = basis[bOffset + 3];
    const by = basis[bOffset + 4];
    const bz = basis[bOffset + 5];
    const handedness = (ty * bz - tz * by) * nx + (tz * bx - tx * bz) * ny + (tx * by - ty * bx) * nz > 0 ? 1 : -1;
    const normalLengthSquared = nx * nx + ny * ny + nz * nz;
    const projection = normalLengthSquared > 0 ? (tx * nx + ty * ny + tz * nz) / normalLengthSquared : 0;
    tx -= nx * projection;
    ty -= ny * projection;
    tz -= nz * projection;
    const length = Math.hypot(tx, ty, tz);
    if (length > 0) {
      const inverse = 1 / length;
      tx *= inverse;
      ty *= inverse;
      tz *= inverse;
    }
    vertices[vOffset + 6] = tx;
    vertices[vOffset + 7] = ty;
    vertices[vOffset + 8] = tz;
    vertices[vOffset + 9] = handedness;
  }
}

/** Slot identity is independent of spatial chunks; sparse farms do not allocate 16 masks per chunk. */
export function soilAtlasLayout(slots: number, maximum: number) {
  if (!Number.isInteger(maximum) || maximum < SOIL_COVERAGE_SIDE || !Number.isSafeInteger(slots))
    throw new RangeError("Invalid soil atlas dimensions");
  const side = Math.floor(maximum / SOIL_COVERAGE_SIDE);
  if (slots < 1 || slots > side * side)
    throw new RangeError(`Soil atlas cannot fit ${slots} plots at texture limit ${maximum}`);
  const capacity = Math.min(side * side, 2 ** Math.ceil(Math.log2(Math.max(4, slots))));
  const columns = Math.min(side, 2 ** Math.ceil(Math.log2(Math.sqrt(capacity))));
  return { columns, rows: Math.ceil(capacity / columns), capacity };
}

/** Plot-local visual state. This is not an Engine Renderer and owns no per-plot GPU resource. */
export class SoilBatchPlot {
  readonly state = new Float32Array(stateSize);
  coverage?: Uint8Array;
  triangles: readonly SurfaceTriangle[] = [];
  size = 1;
  enabled = true;
  destroyed = false;
  /** @internal */
  stateDirty = false;
  /** @internal */
  coverageDirty = false;
  private readonly matrix = new Float64Array(16);
  private hasMatrix = false;
  private readonly worldBounds = new BoundingBox();
  private readonly boundsMatrix = new Float32Array(16);
  private boundsDirty = true;
  constructor(
    readonly entity: Entity,
    readonly slot: number,
    readonly chunk: Chunk,
    private readonly owner: SoilRenderBatches
  ) {}
  setSamples(samples: readonly number[]): void {
    let changed = false;
    for (let i = 0; i < 9; i++) {
      const index = Math.floor(i / 3) * 4 + (i % 3),
        value = Math.fround(samples[i]);
      if (this.state[index] !== value) {
        this.state[index] = value;
        changed = true;
      }
    }
    if (changed) this.owner.markStateDirty(this);
  }
  setProgress(index: 3 | 7, value: number): void {
    value = Math.fround(value);
    if (this.state[index] === value) return;
    this.state[index] = value;
    this.owner.markStateDirty(this);
  }
  refreshVisibility(): void {
    const value = this.enabled && this.entity.isActiveInHierarchy ? 1 : 0;
    if (this.state[11] === value) return;
    this.state[11] = value;
    this.owner.markStateDirty(this);
    this.owner.markVisibilityDirty(this.chunk);
  }
  get bounds(): BoundingBox {
    const matrix = this.entity.transform.worldMatrix.elements;
    let changed = this.boundsDirty;
    for (let i = 0; i < 16 && !changed; i++) changed = matrix[i] !== this.boundsMatrix[i];
    if (changed) {
      this.boundsDirty = false;
      this.boundsMatrix.set(matrix);
      const { min, max } = this.worldBounds;
      min.set(Infinity, Infinity, Infinity);
      max.set(-Infinity, -Infinity, -Infinity);
      const worldMatrix = this.entity.transform.worldMatrix;
      const triangles = this.triangles;
      for (let i = 0; i < triangles.length; i++) {
        const triangle = triangles[i];
        for (let j = 0; j < 3; j++) {
          const p = triangle[j];
          scratchBoundsPoint.set(p[0], p[1], p[2]);
          Vector3.transformCoordinate(scratchBoundsPoint, worldMatrix, scratchBoundsPoint);
          min.set(
            Math.min(min.x, scratchBoundsPoint.x),
            Math.min(min.y, scratchBoundsPoint.y),
            Math.min(min.z, scratchBoundsPoint.z)
          );
          max.set(
            Math.max(max.x, scratchBoundsPoint.x),
            Math.max(max.y, scratchBoundsPoint.y),
            Math.max(max.z, scratchBoundsPoint.z)
          );
        }
      }
      if (!triangles.length) {
        min.set(0, 0, 0);
        max.set(0, 0, 0);
      }
    }
    return this.worldBounds;
  }
  setCoverage(pixels: Uint8Array): void {
    this.coverage = pixels;
    this.owner.markCoverageDirty(this);
  }
  setSurface(triangles: readonly SurfaceTriangle[], size: number): void {
    const matrix = this.entity.transform.worldMatrix.elements;
    let same = this.hasMatrix && size === this.size && triangles.length === this.triangles.length;
    if (same) {
      for (let i = 0; i < 16; i++) {
        if (this.matrix[i] !== matrix[i]) {
          same = false;
          break;
        }
      }
    }
    if (same) {
      const prev = this.triangles;
      for (let i = 0; i < triangles.length && same; i++) {
        const a = triangles[i],
          b = prev[i];
        for (let j = 0; j < 3; j++) {
          const pa = a[j],
            pb = b[j];
          if (pa[0] !== pb[0] || pa[1] !== pb[1] || pa[2] !== pb[2]) {
            same = false;
            break;
          }
        }
      }
    }
    if (same) return;
    this.triangles = triangles;
    this.boundsDirty = true;
    this.hasMatrix = true;
    for (let i = 0; i < 16; i++) this.matrix[i] = matrix[i];
    this.size = size;
    this.owner.markGeometryDirty(this.chunk);
  }
  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.owner.remove(this);
    this.coverage = undefined;
    this.triangles = [];
  }
}
class SoilBatchLifetime extends Script {
  release?: () => void;
  override onDestroy(): void {
    this.release?.();
    this.release = undefined;
  }
}

/** One mesh per occupied 4x4 domain; one material and stable, partially updated atlases per farm. */
export class SoilRenderBatches {
  private readonly stateDirtyList: SoilBatchPlot[] = [];
  private readonly coverageDirtyList: SoilBatchPlot[] = [];
  private readonly geometryDirtyList: Chunk[] = [];
  private readonly visibilityDirtyList: Chunk[] = [];
  private readonly root: Entity;
  private readonly chunks = new Map<string, Chunk>();
  private readonly chunkList: Chunk[] = [];
  private readonly plots = new Set<SoilBatchPlot>();
  private readonly plotList: SoilBatchPlot[] = [];
  private readonly free: number[] = [];
  private nextSlot = 0;
  private layout?: ReturnType<typeof soilAtlasLayout>;
  private coverage?: Texture2D;
  private states?: Texture2D;
  private statePixels = new Float32Array(0);
  private stateRows: Float32Array[] = [];
  private dirtyRowFlags = new Uint8Array(0);
  private readonly dirtyRowList: number[] = [];
  private readonly batchLayout = new Vector4();
  private readonly maximum: number;
  private disposed = false;
  private geometryUploads = 0;
  private coverageUploads = 0;
  private stateUploads = 0;
  private uploadedBytes = 0;

  private weldVertices = new Float32Array(0);
  private weldVertexInts = new Int32Array(0);
  private weldIndices = new Uint32Array(0);
  private weldHashBuckets = new Int32Array(0);
  private weldHashNext = new Int32Array(0);
  private tangentBasis = new Float64Array(0);
  private readonly scratchInverse = new Matrix();
  private readonly scratchRelative = new Matrix();
  private readonly scratchNormalMatrix = new Matrix();
  private readonly scratchAB = new Vector3();
  private readonly scratchAC = new Vector3();
  private readonly scratchNormal = new Vector3();
  private readonly scratchPos = new Vector3();

  constructor(
    readonly engine: Engine,
    parent: Entity,
    readonly material: PBRMaterial
  ) {
    this.maximum = Number(
      (engine as unknown as { _hardwareRenderer: { capability: { maxTextureSize: number } } })._hardwareRenderer
        .capability.maxTextureSize
    );
    soilAtlasLayout(1, this.maximum);
    this.root = parent.createChild("soil-render-batches");
    this.root.addComponent(SoilBatchLifetime).release = () => this.dispose();
    material.isTransparent = true;
    material.shaderData.enableMacro("FARM_SOIL_BATCH");
    material.shaderData.enableMacro("FARM_SOIL_COVERAGE");
  }
  /** @internal */
  markStateDirty(plot: SoilBatchPlot): void {
    if (plot.stateDirty || plot.destroyed) return;
    plot.stateDirty = true;
    this.stateDirtyList.push(plot);
  }
  /** @internal */
  markCoverageDirty(plot: SoilBatchPlot): void {
    if (plot.coverageDirty || plot.destroyed) return;
    plot.coverageDirty = true;
    this.coverageDirtyList.push(plot);
  }
  /** @internal */
  markGeometryDirty(chunk: Chunk): void {
    if (chunk.geometryDirty) return;
    chunk.geometryDirty = true;
    this.geometryDirtyList.push(chunk);
  }
  /** @internal */
  markVisibilityDirty(chunk: Chunk): void {
    if (chunk.visibilityDirty) return;
    chunk.visibilityDirty = true;
    this.visibilityDirtyList.push(chunk);
  }
  add(entity: Entity, grid: PlotGrid, cell: SoilCell): SoilBatchPlot {
    if (this.disposed) throw new Error("Soil batches have been disposed");
    const slot = this.free.length ? this.free[this.free.length - 1] : this.nextSlot;
    soilAtlasLayout(slot + 1, this.maximum); // Reject before changing ownership or allocating a chunk.
    const x = Math.floor(cell.cellX / SOIL_BATCH_SIDE),
      z = Math.floor(cell.cellZ / SOIL_BATCH_SIDE);
    const key = JSON.stringify([cell.groundId, grid.originX, grid.originZ, grid.cellSize, x, z]);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const root = this.root.createChild(`soil-chunk-${key}`);
      root.transform.setWorldPosition(
        grid.originX + x * SOIL_BATCH_SIDE * grid.cellSize,
        0,
        grid.originZ + z * SOIL_BATCH_SIDE * grid.cellSize
      );
      const renderer = root.addComponent(MeshRenderer);
      renderer.enabled = false;
      renderer.castShadows = false;
      renderer.receiveShadows = true;
      renderer.enableVertexColor = true;
      renderer.setMaterial(this.material);
      chunk = {
        key,
        entity: root,
        renderer,
        plots: new Set(),
        plotList: [],
        geometryDirty: false,
        visibilityDirty: false
      };
      this.chunks.set(key, chunk);
      this.chunkList.push(chunk);
    }
    if (this.free.length) this.free.pop();
    else this.nextSlot++;
    const plot = new SoilBatchPlot(entity, slot, chunk, this);
    chunk.plots.add(plot);
    chunk.plotList.push(plot);
    this.plots.add(plot);
    this.plotList.push(plot);
    this.markStateDirty(plot);
    return plot;
  }
  remove(plot: SoilBatchPlot): void {
    if (!this.plots.delete(plot)) return;
    const plotIndex = this.plotList.indexOf(plot);
    if (plotIndex >= 0) {
      const last = this.plotList.pop()!;
      if (plotIndex < this.plotList.length) this.plotList[plotIndex] = last;
    }
    this.free.push(plot.slot);
    plot.stateDirty = false;
    plot.coverageDirty = false;
    plot.chunk.plots.delete(plot);
    const chunkPlotIndex = plot.chunk.plotList.indexOf(plot);
    if (chunkPlotIndex >= 0) {
      const last = plot.chunk.plotList.pop()!;
      if (chunkPlotIndex < plot.chunk.plotList.length) plot.chunk.plotList[chunkPlotIndex] = last;
    }
    this.markGeometryDirty(plot.chunk);
    this.markVisibilityDirty(plot.chunk);
    if (!this.plots.size) {
      this.flushGeometry();
      this.releaseTextures();
      this.free.length = this.nextSlot = 0;
    }
  }
  flush(): void {
    if (this.disposed || !this.plots.size) return;
    this.ensureTextures();
    const coverageDirty = this.coverageDirtyList;
    if (coverageDirty.length) {
      for (let i = 0; i < coverageDirty.length; i++) {
        const plot = coverageDirty[i];
        if (!plot.coverageDirty) continue;
        plot.coverageDirty = false;
        this.uploadCoverage(this.coverage!, plot);
      }
      coverageDirty.length = 0;
    }
    const stateDirty = this.stateDirtyList;
    if (stateDirty.length) {
      const columns = this.layout!.columns;
      for (let i = 0; i < stateDirty.length; i++) {
        const plot = stateDirty[i];
        if (!plot.stateDirty) continue;
        plot.stateDirty = false;
        this.statePixels.set(plot.state, plot.slot * stateSize);
        const row = Math.floor(plot.slot / columns);
        if (!this.dirtyRowFlags[row]) {
          this.dirtyRowFlags[row] = 1;
          this.dirtyRowList.push(row);
        }
      }
      stateDirty.length = 0;
      const dirtyRows = this.dirtyRowList;
      for (let i = 0; i < dirtyRows.length; i++) {
        const row = dirtyRows[i];
        this.dirtyRowFlags[row] = 0;
        const data = this.stateRows[row];
        this.states!.setPixelBuffer(data, 0, 0, row, columns * 3, 1);
        this.stateUploads++;
        this.uploadedBytes += data.byteLength;
      }
      dirtyRows.length = 0;
    }
    if (this.geometryDirtyList.length) this.flushGeometry();
    const visibilityDirty = this.visibilityDirtyList;
    if (visibilityDirty.length) {
      for (let i = 0; i < visibilityDirty.length; i++) {
        const chunk = visibilityDirty[i];
        chunk.visibilityDirty = false;
        const chunkPlots = chunk.plotList;
        if (!chunkPlots.length) continue;
        let enabled = false;
        for (let j = 0; j < chunkPlots.length; j++) {
          if (chunkPlots[j].state[11] > 0) {
            enabled = true;
            break;
          }
        }
        chunk.renderer.enabled = enabled;
      }
      visibilityDirty.length = 0;
    }
  }
  private ensureTextures(): void {
    if (this.layout && this.nextSlot <= this.layout.capacity) return;
    const layout = soilAtlasLayout(this.nextSlot, this.maximum);
    let coverage: Texture2D | undefined, states: Texture2D | undefined;
    const pixels = new Float32Array(layout.columns * layout.rows * stateSize);
    const plotList = this.plotList;
    try {
      coverage = this.texture(
        layout.columns * SOIL_COVERAGE_SIDE,
        layout.rows * SOIL_COVERAGE_SIDE,
        TextureFormat.R8G8,
        TextureFilterMode.Bilinear
      );
      states = this.texture(layout.columns * 3, layout.rows, TextureFormat.R32G32B32A32, TextureFilterMode.Point);
      for (let i = 0; i < plotList.length; i++) {
        const plot = plotList[i];
        pixels.set(plot.state, plot.slot * stateSize);
        this.uploadCoverage(coverage, plot, layout.columns);
      }
      states.setPixelBuffer(pixels);
      this.stateUploads++;
      this.uploadedBytes += pixels.byteLength;
    } catch (error) {
      coverage?.destroy(true);
      states?.destroy(true);
      throw error;
    }
    const oldCoverage = this.coverage,
      oldStates = this.states;
    this.coverage = coverage;
    this.states = states;
    this.layout = layout;
    this.statePixels = pixels;
    this.stateRows.length = layout.rows;
    for (let row = 0; row < layout.rows; row++)
      this.stateRows[row] = pixels.subarray(row * layout.columns * stateSize, (row + 1) * layout.columns * stateSize);
    if (this.dirtyRowFlags.length < layout.rows) this.dirtyRowFlags = new Uint8Array(layout.rows);
    else this.dirtyRowFlags.fill(0);
    this.dirtyRowList.length = 0;
    this.material.shaderData.setTexture("soil_BatchCoverage", coverage);
    this.material.shaderData.setTexture("soil_BatchStates", states);
    this.batchLayout.set(layout.columns, layout.rows, layout.columns * 65, layout.rows * 65);
    this.material.shaderData.setVector4("soil_BatchLayout", this.batchLayout);
    for (let i = 0; i < this.coverageDirtyList.length; i++) this.coverageDirtyList[i].coverageDirty = false;
    this.coverageDirtyList.length = 0;
    for (let i = 0; i < this.stateDirtyList.length; i++) this.stateDirtyList[i].stateDirty = false;
    this.stateDirtyList.length = 0;
    restoreResource(coverage, () => {
      if (coverage!.destroyed) return;
      for (let i = 0; i < this.plotList.length; i++) this.uploadCoverage(coverage!, this.plotList[i], layout.columns);
    });
    restoreResource(states, () => {
      if (!states!.destroyed) states!.setPixelBuffer(pixels);
    });
    oldCoverage?.destroy(true);
    oldStates?.destroy(true);
  }
  private texture(width: number, height: number, format: TextureFormat, filter: TextureFilterMode): Texture2D {
    const texture = new Texture2D(this.engine, width, height, format, false, false);
    texture.filterMode = filter;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    return texture;
  }
  private uploadCoverage(texture: Texture2D, plot: SoilBatchPlot, columns = this.layout!.columns): void {
    if (!plot.coverage) return;
    texture.setPixelBuffer(plot.coverage, 0, (plot.slot % columns) * 65, Math.floor(plot.slot / columns) * 65, 65, 65);
    this.coverageUploads++;
    this.uploadedBytes += plot.coverage.byteLength;
  }
  private ensureWeldScratch(cornerCount: number): number {
    if (this.weldHashNext.length < cornerCount) {
      const capacity = Math.max(cornerCount, 512);
      this.weldVertices = new Float32Array(capacity * VERTEX_FLOATS);
      this.weldVertexInts = new Int32Array(this.weldVertices.buffer);
      this.weldIndices = new Uint32Array(capacity);
      this.weldHashNext = new Int32Array(capacity);
      this.tangentBasis = new Float64Array(capacity * 6);
    }
    let bucketCount = 256;
    const minBuckets = cornerCount * 2;
    while (bucketCount < minBuckets) bucketCount <<= 1;
    if (this.weldHashBuckets.length < bucketCount) this.weldHashBuckets = new Int32Array(bucketCount);
    this.weldHashBuckets.fill(-1, 0, bucketCount);
    return bucketCount;
  }
  private flushGeometry(): void {
    const dirtyChunks = this.geometryDirtyList;
    let processed = 0;
    try {
      for (let cIndex = 0; cIndex < dirtyChunks.length; cIndex++) {
        const chunk = dirtyChunks[cIndex];
        if (!chunk.geometryDirty) {
          processed = cIndex + 1;
          continue;
        }
        const chunkPlots = chunk.plotList;
        if (!chunkPlots.length) {
          // Entity destruction may wait until frame end; retire the renderer before unbinding its mesh.
          chunk.renderer.enabled = false;
          chunk.renderer.mesh = null!;
          chunk.renderer.setMaterial(null!);
          disposeSoilMesh(chunk.mesh);
          chunk.mesh = undefined;
          chunk.entity.destroy();
          this.chunks.delete(chunk.key);
          const listIndex = this.chunkList.indexOf(chunk);
          if (listIndex >= 0) {
            const last = this.chunkList.pop()!;
            if (listIndex < this.chunkList.length) this.chunkList[listIndex] = last;
          }
          chunk.visibilityDirty = false;
          chunk.geometryDirty = false;
          processed = cIndex + 1;
          continue;
        }
        let totalCorners = 0;
        for (let i = 0; i < chunkPlots.length; i++) totalCorners += chunkPlots[i].triangles.length * 3;
        if (!totalCorners) {
          if (chunk.mesh) {
            chunk.renderer.enabled = false;
            chunk.renderer.mesh = null!;
            disposeSoilMesh(chunk.mesh);
            chunk.mesh = undefined;
          }
          chunk.geometryDirty = false;
          processed = cIndex + 1;
          continue;
        }

        const bucketCount = this.ensureWeldScratch(totalCorners);
        const bucketMask = bucketCount - 1;
        const wv = this.weldVertices;
        const iv = this.weldVertexInts;
        const buckets = this.weldHashBuckets;
        const next = this.weldHashNext;
        const weldIndices = this.weldIndices;
        let vertexCount = 0;
        let indexCount = 0;
        let minX = Infinity,
          minY = Infinity,
          minZ = Infinity,
          maxX = -Infinity,
          maxY = -Infinity,
          maxZ = -Infinity;

        Matrix.invert(chunk.entity.transform.worldMatrix, this.scratchInverse);
        for (let pIndex = 0; pIndex < chunkPlots.length; pIndex++) {
          const plot = chunkPlots[pIndex];
          Matrix.multiply(this.scratchInverse, plot.entity.transform.worldMatrix, this.scratchRelative);
          Matrix.invert(this.scratchRelative, this.scratchNormalMatrix);
          Matrix.transpose(this.scratchNormalMatrix, this.scratchNormalMatrix);
          const slot = plot.slot === 0 ? 0 : plot.slot;
          const plotSize = plot.size;
          const triangles = plot.triangles;
          for (let tIndex = 0; tIndex < triangles.length; tIndex++) {
            const tri = triangles[tIndex];
            const a = tri[0],
              b = tri[1],
              c = tri[2];
            this.scratchAB.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
            this.scratchAC.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
            this.scratchNormal.set(0, 0, 0);
            Vector3.cross(this.scratchAB, this.scratchAC, this.scratchNormal);
            Vector3.transformNormal(this.scratchNormal, this.scratchNormalMatrix, this.scratchNormal);
            this.scratchNormal.normalize();
            const nx = this.scratchNormal.x === 0 ? 0 : this.scratchNormal.x;
            const ny = this.scratchNormal.y === 0 ? 0 : this.scratchNormal.y;
            const nz = this.scratchNormal.z === 0 ? 0 : this.scratchNormal.z;

            for (let corner = 0; corner < 3; corner++) {
              const p = tri[corner];
              this.scratchPos.set(p[0], p[1], p[2]);
              Vector3.transformCoordinate(this.scratchPos, this.scratchRelative, this.scratchPos);
              const x = this.scratchPos.x === 0 ? 0 : this.scratchPos.x;
              const y = this.scratchPos.y === 0 ? 0 : this.scratchPos.y;
              const z = this.scratchPos.z === 0 ? 0 : this.scratchPos.z;
              const uRaw = p[0] / plotSize + 0.5;
              const vRaw = p[2] / plotSize + 0.5;
              const u = uRaw === 0 ? 0 : uRaw;
              const v = vRaw === 0 ? 0 : vRaw;

              const base = vertexCount * VERTEX_FLOATS;
              wv[base] = x;
              wv[base + 1] = y;
              wv[base + 2] = z;
              wv[base + 3] = nx;
              wv[base + 4] = ny;
              wv[base + 5] = nz;
              wv[base + 10] = slot;
              wv[base + 11] = 1;
              wv[base + 12] = 1;
              wv[base + 13] = 1;
              wv[base + 14] = u;
              wv[base + 15] = v;

              const k0 = iv[base],
                k1 = iv[base + 1],
                k2 = iv[base + 2],
                k3 = iv[base + 3],
                k4 = iv[base + 4],
                k5 = iv[base + 5],
                k6 = iv[base + 10],
                k7 = iv[base + 14],
                k8 = iv[base + 15];

              let hash = 2166136261;
              hash = Math.imul(hash ^ k0, 16777619);
              hash = Math.imul(hash ^ k1, 16777619);
              hash = Math.imul(hash ^ k2, 16777619);
              hash = Math.imul(hash ^ k3, 16777619);
              hash = Math.imul(hash ^ k4, 16777619);
              hash = Math.imul(hash ^ k5, 16777619);
              hash = Math.imul(hash ^ k6, 16777619);
              hash = Math.imul(hash ^ k7, 16777619);
              hash = Math.imul(hash ^ k8, 16777619);
              const bucket = hash & bucketMask;

              let found = -1;
              let candidate = buckets[bucket];
              while (candidate !== -1) {
                const cBase = candidate * VERTEX_FLOATS;
                if (
                  iv[cBase] === k0 &&
                  iv[cBase + 1] === k1 &&
                  iv[cBase + 2] === k2 &&
                  iv[cBase + 3] === k3 &&
                  iv[cBase + 4] === k4 &&
                  iv[cBase + 5] === k5 &&
                  iv[cBase + 10] === k6 &&
                  iv[cBase + 14] === k7 &&
                  iv[cBase + 15] === k8
                ) {
                  found = candidate;
                  break;
                }
                candidate = next[candidate];
              }

              if (found >= 0) {
                weldIndices[indexCount++] = found;
              } else {
                const idx = vertexCount++;
                next[idx] = buckets[bucket];
                buckets[bucket] = idx;
                weldIndices[indexCount++] = idx;
                const fx = wv[base],
                  fy = wv[base + 1],
                  fz = wv[base + 2];
                if (fx < minX) minX = fx;
                if (fy < minY) minY = fy;
                if (fz < minZ) minZ = fz;
                if (fx > maxX) maxX = fx;
                if (fy > maxY) maxY = fy;
                if (fz > maxZ) maxZ = fz;
              }
            }
          }
        }

        computeInterleavedTangents(wv, vertexCount, weldIndices, indexCount, this.tangentBasis);
        const vertices = wv.slice(0, vertexCount * VERTEX_FLOATS);
        const useUint32 = vertexCount > 65535;
        let indices: Uint16Array | Uint32Array;
        if (useUint32) {
          indices = weldIndices.slice(0, indexCount);
        } else {
          const u16 = new Uint16Array(indexCount);
          for (let i = 0; i < indexCount; i++) u16[i] = weldIndices[i];
          indices = u16;
        }

        let mesh: BufferMesh | undefined;
        let vertexBuffer: Buffer | undefined;
        let indexBuffer: Buffer | undefined;
        try {
          mesh = new BufferMesh(this.engine, "4x4 farming soil");
          vertexBuffer = new Buffer(this.engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static, false);
          indexBuffer = new Buffer(this.engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static, false);
          mesh.setVertexBufferBinding(vertexBuffer, VERTEX_STRIDE);
          mesh.setIndexBufferBinding(indexBuffer, useUint32 ? IndexFormat.UInt32 : IndexFormat.UInt16);
          mesh.setVertexElements(createSoilVertexElements());
          mesh.addSubMesh(0, indexCount, MeshTopology.Triangles);
          mesh.bounds.min.set(minX, minY, minZ);
          mesh.bounds.max.set(maxX, maxY, maxZ);
          restoreResource(mesh, () => {
            if (!vertexBuffer!.destroyed) vertexBuffer!.setData(vertices);
            if (!indexBuffer!.destroyed) indexBuffer!.setData(indices);
          });
          const old = chunk.mesh;
          chunk.renderer.mesh = chunk.mesh = mesh;
          disposeSoilMesh(old);
          this.geometryUploads++;
          chunk.geometryDirty = false;
          processed = cIndex + 1;
        } catch (error) {
          if (mesh && !mesh.destroyed) disposeSoilMesh(mesh);
          if (vertexBuffer && !vertexBuffer.destroyed) vertexBuffer.destroy(true);
          if (indexBuffer && !indexBuffer.destroyed) indexBuffer.destroy(true);
          throw error;
        }
      }
    } finally {
      if (processed === dirtyChunks.length) {
        dirtyChunks.length = 0;
      } else if (processed > 0) {
        const remaining = dirtyChunks.length - processed;
        for (let i = 0; i < remaining; i++) dirtyChunks[i] = dirtyChunks[processed + i];
        dirtyChunks.length = remaining;
      }
    }
  }
  get activeChunkCount(): number {
    let count = 0;
    const chunks = this.chunkList;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk.renderer.enabled && chunk.entity.isActiveInHierarchy) count++;
    }
    return count;
  }
  get diagnostics() {
    return {
      plots: this.plots.size,
      chunks: this.chunks.size,
      slots: this.layout?.capacity ?? 0,
      geometryUploads: this.geometryUploads,
      coverageUploads: this.coverageUploads,
      stateUploads: this.stateUploads,
      uploadedBytes: this.uploadedBytes
    };
  }
  private releaseTextures(): void {
    this.material.shaderData.setTexture("soil_BatchCoverage", null!);
    this.material.shaderData.setTexture("soil_BatchStates", null!);
    this.coverage?.destroy(true);
    this.states?.destroy(true);
    this.coverage = this.states = undefined;
    this.layout = undefined;
    this.statePixels = new Float32Array(0);
    this.stateRows = [];
    this.dirtyRowFlags = new Uint8Array(0);
    this.dirtyRowList.length = 0;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    while (this.plotList.length) this.plotList[this.plotList.length - 1].dispose();
    this.flushGeometry();
    this.releaseTextures();
    this.stateDirtyList.length = 0;
    this.coverageDirtyList.length = 0;
    this.geometryDirtyList.length = 0;
    this.visibilityDirtyList.length = 0;
    this.material.destroy(true);
    // The lifetime callback also enters here while a parent is already destroying this root.
    if (!this.root.destroyed && !this.root.pendingDestroy) this.root.destroy();
  }
}
