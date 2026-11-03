import {
  BoundingBox,
  Color,
  Entity,
  Matrix,
  MeshRenderer,
  ModelMesh,
  Script,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector2,
  Vector3,
  Vector4,
  type Engine,
  type PBRMaterial
} from "@galacean/engine";
import type { PlotGrid } from "../../domain/FarmingGround";
import type { SoilCell } from "./SoilBoundary";
import type { SurfaceTriangle } from "@galacean/engine-terrain/geometry/SurfaceTriangles";
import { restoreResource, uploadRestorableModelMesh } from "@galacean/engine-modify/rendering/RestorableResources";
import { disposeSoilMesh } from "./disposeSoilMesh";

export const SOIL_BATCH_SIDE = 4;
export const SOIL_COVERAGE_SIDE = 65;
const stateSize = 12;
interface Chunk {
  key: string;
  entity: Entity;
  renderer: MeshRenderer;
  plots: Set<SoilBatchPlot>;
  mesh?: ModelMesh;
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
  private matrix: number[] = [];
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
    if (changed) this.owner.stateDirty.add(this);
  }
  setProgress(index: 3 | 7, value: number): void {
    value = Math.fround(value);
    if (this.state[index] === value) return;
    this.state[index] = value;
    this.owner.stateDirty.add(this);
  }
  refreshVisibility(): void {
    const value = this.enabled && this.entity.isActiveInHierarchy ? 1 : 0;
    if (this.state[11] === value) return;
    this.state[11] = value;
    this.owner.stateDirty.add(this);
    this.owner.visibilityDirty.add(this.chunk);
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
      const point = new Vector3();
      for (const triangle of this.triangles)
        for (const p of triangle) {
          point.set(...p);
          Vector3.transformCoordinate(point, this.entity.transform.worldMatrix, point);
          min.set(Math.min(min.x, point.x), Math.min(min.y, point.y), Math.min(min.z, point.z));
          max.set(Math.max(max.x, point.x), Math.max(max.y, point.y), Math.max(max.z, point.z));
        }
      if (!this.triangles.length) {
        min.set(0, 0, 0);
        max.set(0, 0, 0);
      }
    }
    return this.worldBounds;
  }
  setCoverage(pixels: Uint8Array): void {
    this.coverage = pixels;
    this.owner.coverageDirty.add(this);
  }
  setSurface(triangles: readonly SurfaceTriangle[], size: number): void {
    const matrix = this.entity.transform.worldMatrix.elements;
    const same =
      size === this.size &&
      triangles.length === this.triangles.length &&
      this.matrix.length === 16 &&
      this.matrix.every((value, i) => value === matrix[i]) &&
      triangles.every((triangle, i) => triangle.every((p, j) => p.every((v, k) => v === this.triangles[i][j][k])));
    if (same) return;
    this.triangles = triangles;
    this.boundsDirty = true;
    this.matrix = Array.from(matrix);
    this.size = size;
    this.owner.geometryDirty.add(this.chunk);
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
  readonly stateDirty = new Set<SoilBatchPlot>();
  readonly coverageDirty = new Set<SoilBatchPlot>();
  readonly geometryDirty = new Set<Chunk>();
  readonly visibilityDirty = new Set<Chunk>();
  private readonly root: Entity;
  private readonly chunks = new Map<string, Chunk>();
  private readonly plots = new Set<SoilBatchPlot>();
  private readonly free: number[] = [];
  private nextSlot = 0;
  private layout?: ReturnType<typeof soilAtlasLayout>;
  private coverage?: Texture2D;
  private states?: Texture2D;
  private statePixels = new Float32Array(0);
  private stateRows: Float32Array[] = [];
  private readonly dirtyRows = new Set<number>();
  private readonly maximum: number;
  private disposed = false;
  private geometryUploads = 0;
  private coverageUploads = 0;
  private stateUploads = 0;
  private uploadedBytes = 0;

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
      this.chunks.set(key, (chunk = { key, entity: root, renderer, plots: new Set() }));
    }
    if (this.free.length) this.free.pop();
    else this.nextSlot++;
    const plot = new SoilBatchPlot(entity, slot, chunk, this);
    chunk.plots.add(plot);
    this.plots.add(plot);
    this.stateDirty.add(plot);
    return plot;
  }
  remove(plot: SoilBatchPlot): void {
    if (!this.plots.delete(plot)) return;
    this.free.push(plot.slot);
    this.stateDirty.delete(plot);
    this.coverageDirty.delete(plot);
    plot.chunk.plots.delete(plot);
    this.geometryDirty.add(plot.chunk);
    this.visibilityDirty.add(plot.chunk);
    if (!this.plots.size) {
      this.flushGeometry();
      this.releaseTextures();
      this.free.length = this.nextSlot = 0;
    }
  }
  flush(): void {
    if (this.disposed || !this.plots.size) return;
    this.ensureTextures();
    for (const plot of this.coverageDirty) this.uploadCoverage(this.coverage!, plot);
    this.coverageDirty.clear();
    for (const plot of this.stateDirty) {
      this.statePixels.set(plot.state, plot.slot * stateSize);
      this.dirtyRows.add(Math.floor(plot.slot / this.layout!.columns));
    }
    for (const row of this.dirtyRows) {
      const data = this.stateRows[row];
      this.states!.setPixelBuffer(data, 0, 0, row, this.layout!.columns * 3, 1);
      this.stateUploads++;
      this.uploadedBytes += data.byteLength;
    }
    this.dirtyRows.clear();
    this.stateDirty.clear();
    this.flushGeometry();
    for (const chunk of this.visibilityDirty) {
      if (!chunk.plots.size) continue;
      chunk.renderer.enabled = false;
      for (const plot of chunk.plots)
        if (plot.state[11] > 0) {
          chunk.renderer.enabled = true;
          break;
        }
    }
    this.visibilityDirty.clear();
  }
  private ensureTextures(): void {
    if (this.layout && this.nextSlot <= this.layout.capacity) return;
    const layout = soilAtlasLayout(this.nextSlot, this.maximum);
    let coverage: Texture2D | undefined, states: Texture2D | undefined;
    const pixels = new Float32Array(layout.columns * layout.rows * stateSize);
    try {
      coverage = this.texture(
        layout.columns * SOIL_COVERAGE_SIDE,
        layout.rows * SOIL_COVERAGE_SIDE,
        TextureFormat.R8G8,
        TextureFilterMode.Bilinear
      );
      states = this.texture(layout.columns * 3, layout.rows, TextureFormat.R32G32B32A32, TextureFilterMode.Point);
      for (const plot of this.plots) {
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
    this.stateRows = Array.from({ length: layout.rows }, (_, row) =>
      pixels.subarray(row * layout.columns * stateSize, (row + 1) * layout.columns * stateSize)
    );
    this.material.shaderData.setTexture("soil_BatchCoverage", coverage);
    this.material.shaderData.setTexture("soil_BatchStates", states);
    this.material.shaderData.setVector4(
      "soil_BatchLayout",
      new Vector4(layout.columns, layout.rows, layout.columns * 65, layout.rows * 65)
    );
    this.coverageDirty.clear();
    this.stateDirty.clear();
    restoreResource(coverage, () => {
      for (const plot of this.plots) this.uploadCoverage(coverage!, plot, layout.columns);
    });
    restoreResource(states, () => states!.setPixelBuffer(pixels));
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
  private flushGeometry(): void {
    for (const chunk of this.geometryDirty) {
      if (!chunk.plots.size) {
        // Entity destruction may wait until frame end; retire the renderer before unbinding its mesh.
        chunk.renderer.enabled = false;
        chunk.renderer.mesh = null!;
        disposeSoilMesh(chunk.mesh!);
        chunk.entity.destroy();
        this.chunks.delete(chunk.key);
        this.visibilityDirty.delete(chunk);
        continue;
      }
      const mesh = new ModelMesh(this.engine, "4x4 farming soil"),
        positions: Vector3[] = [],
        normals: Vector3[] = [],
        colors: Color[] = [],
        uvs: Vector2[] = [];
      try {
        const inverse = new Matrix(),
          relative = new Matrix(),
          normalMatrix = new Matrix();
        Matrix.invert(chunk.entity.transform.worldMatrix, inverse);
        for (const plot of chunk.plots) {
          Matrix.multiply(inverse, plot.entity.transform.worldMatrix, relative);
          Matrix.invert(relative, normalMatrix);
          Matrix.transpose(normalMatrix, normalMatrix);
          for (const [a, b, c] of plot.triangles) {
            const ab = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
              ac = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]),
              normal = new Vector3();
            Vector3.cross(ab, ac, normal);
            Vector3.transformNormal(normal, normalMatrix, normal);
            normal.normalize();
            for (const p of [a, b, c]) {
              const position = new Vector3(...p);
              Vector3.transformCoordinate(position, relative, position);
              positions.push(position);
              normals.push(normal.clone());
              colors.push(new Color(plot.slot, 1, 1, 1));
              uvs.push(new Vector2(p[0] / plot.size + 0.5, p[2] / plot.size + 0.5));
            }
          }
        }
        if (!positions.length) {
          mesh.destroy(true);
          continue;
        }
        const indices =
          positions.length > 65535 ? new Uint32Array(positions.length) : new Uint16Array(positions.length);
        for (let i = 0; i < indices.length; i++) indices[i] = i;
        mesh.setPositions(positions);
        mesh.setNormals(normals);
        mesh.setColors(colors);
        mesh.setUVs(uvs);
        mesh.setIndices(indices);
        mesh.addSubMesh(0, indices.length);
        mesh.calculateTangents();
        BoundingBox.fromPoints(positions, mesh.bounds);
        uploadRestorableModelMesh(mesh);
        const old = chunk.mesh;
        chunk.renderer.mesh = chunk.mesh = mesh;
        disposeSoilMesh(old!);
        this.geometryUploads++;
      } catch (error) {
        disposeSoilMesh(mesh);
        throw error;
      }
    }
    this.geometryDirty.clear();
  }
  get activeChunkCount(): number {
    let count = 0;
    for (const chunk of this.chunks.values()) if (chunk.renderer.enabled && chunk.entity.isActiveInHierarchy) count++;
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
    this.dirtyRows.clear();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const plot of [...this.plots]) plot.dispose();
    this.flushGeometry();
    this.releaseTextures();
    this.stateDirty.clear();
    this.coverageDirty.clear();
    this.geometryDirty.clear();
    this.visibilityDirty.clear();
    this.material.destroy(true);
    // The lifetime callback also enters here while a parent is already destroying this root.
    if (!this.root.destroyed && !this.root.pendingDestroy) this.root.destroy();
  }
}
