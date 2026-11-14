import {
  Color,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  IndexFormat,
  VertexElement,
  VertexElementFormat,
  CompareFunction,
  Entity,
  MeshRenderer,
  MeshTopology,
  PBRMaterial
} from "@galacean/engine";
import type { GroundBounds } from "@galacean/engine-farming/farming/api/index";
import type { FarmingSoilWorkPresentation } from "@galacean/engine-farming/farming/presentation/soil/SoilWorkReveal";
import { disposeSoilMesh } from "@galacean/engine-farming/farming/presentation/soil/disposeSoilMesh";
import { DEFAULT_SOIL_VISUAL_CONFIG } from "@galacean/engine-farming/farming/presentation/soil/SoilVisualConfig";
import { restoreResource } from "@galacean/engine-modify/rendering/RestorableResources";
import { getPlanningFarmLandShader } from "./PlanningFarmLandShader.ts";
import {
  bakeFarmLandCoverage,
  FARM_LAND_MARGIN_M,
  FARM_LAND_MASK_SPACING_M,
  FARM_LAND_CONTAINER_EDGE_M,
  farmLandChunks,
  type FarmLandChunk
} from "./PlanningFarmLandCoverage.ts";
import {
  buildFarmLandGeometry,
  captureFarmLandHeights,
  farmLandGrid,
  sameFarmLandHeights,
  FARM_LAND_HEIGHT_SAMPLE_COUNT,
  type FarmLandGrid
} from "./PlanningFarmLandGeometry.ts";
import type { PlanningFarmingTerrain } from "./PlanningPublishedFarmingGround.ts";
import type { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";

import { PlanningFarmGrassOverlay, type FarmGrassTile } from "./PlanningFarmGrassOverlay.ts";

import { loadPlanningFarmDirtTexture } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmDirtTexture";

/** Planner-owned middle surface: terrain < flat dirt < worked beds. No colliders, farm state or per-frame work. */
export class PlanningFarmLandLayer implements FarmingSoilWorkPresentation {
  /** Texture-backed scene macros must settle before startup shader collection. */
  readonly whenReady: Promise<void>;
  private readonly margin = FARM_LAND_MARGIN_M;
  readonly root: Entity;
  private readonly material: PBRMaterial;
  private readonly chunks = new Map<
    string,
    { entity: Entity; mesh: BufferMesh; signature: string; heights: Float64Array }
  >();
  private readonly grassOverlay: PlanningFarmGrassOverlay;
  private readonly grassTiles = new Map<string, FarmGrassTile>();
  private releaseAppearance: () => void;
  private grid: FarmLandGrid;
  private readonly heightScratch = new Float64Array(FARM_LAND_HEIGHT_SAMPLE_COUNT);
  private bounds: readonly GroundBounds[] = [];
  private grass: readonly GroundBounds[] = [];
  private disposed = false;
  private ready = false;
  private error?: string;
  private preview?: GroundBounds;

  constructor(
    parent: Entity,
    private fields: PlanningFarmingTerrain,
    private readonly world: Pick<SeedWorldTerrainRuntime, "registerGrassAppearanceMaterial">
  ) {
    this.root = parent.createChild("Farm land transition");
    this.grid = farmLandGrid(fields);
    const material = (this.material = new PBRMaterial(parent.engine));
    let releaseAppearance: (() => void) | undefined;
    try {
      material.name = "Farmlands flat dirt underlay";
      material.shader = getPlanningFarmLandShader();
      // Bias the nearly coplanar surface according to its screen-space depth slope.
      // Keep the physical height and depth writes unchanged so worked beds remain above the land.
      material.shaderData.setFloat("landDepthBias", -4);
      material.shaderData.setFloat("landSlopeScaledDepthBias", -1);
      material.isGCIgnored = true;
      material.isTransparent = true;
      material.metallic = 0;
      material.baseColor = new Color(1, 1, 1, 1);
      material.roughness = 1;
      material.shaderData.setFloat("material_WorldPickDepthCompare", CompareFunction.LessEqual);
      this.releaseAppearance = releaseAppearance = world.registerGrassAppearanceMaterial(material);
      this.grassOverlay = new PlanningFarmGrassOverlay(parent.scene!);
    } catch (error) {
      releaseAppearance?.();
      material.destroy(true);
      this.root.destroy();
      throw error;
    }
    this.whenReady = this.loadTextures();
  }

  get diagnostics() {
    return { ready: this.ready, error: this.error, chunks: this.chunks.size };
  }

  refreshTerrain(fields: PlanningFarmingTerrain): void {
    if (this.disposed || fields === this.fields) return;
    const grid = farmLandGrid(fields);
    if (grid.key !== this.grid.key) this.planChunks(this.bounds, grid, fields.sizeMetres);
    this.fields = fields;
    this.releaseAppearance();
    this.releaseAppearance = this.world.registerGrassAppearanceMaterial(this.material);
    if (grid.key !== this.grid.key) {
      this.clearChunks();
      this.grassOverlay.update([], grid.size);
      this.grid = grid;
      this.setBounds(this.bounds, this.grass);
      return;
    }
    // Layout is unchanged: coverage and atlas remain untouched. A tiny per-chunk height snapshot
    // detects local edits (including normal neighbours) without cloning or walking the whole world.
    for (const chunk of this.chunks.values()) {
      const position = chunk.entity.transform.worldPosition;
      const domain = { x: position.x, z: position.z };
      captureFarmLandHeights(fields, grid, domain, this.heightScratch);
      if (sameFarmLandHeights(chunk.heights, this.heightScratch)) continue;
      const heights = this.heightScratch.slice();
      const mesh = this.createMesh(domain, heights);
      chunk.entity.getComponent(MeshRenderer)!.mesh = mesh;
      disposeSoilMesh(chunk.mesh);
      chunk.mesh = mesh;
      chunk.heights = heights;
    }
  }

  setBounds(bounds: readonly GroundBounds[], grass: readonly GroundBounds[] = []): void {
    if (this.disposed) return;
    const displayed = this.preview ? [...bounds, this.preview] : bounds;
    const next = this.planChunks(displayed, this.grid, this.fields.sizeMetres);
    this.bounds = bounds;
    this.grass = grass;
    const size = this.grid.size;
    const retained = new Set(next.map((chunk) => chunk.key));
    let changed = false;
    for (const [key, chunk] of this.chunks)
      if (!retained.has(key)) {
        chunk.entity.destroy();
        disposeSoilMesh(chunk.mesh);
        this.chunks.delete(key);
        this.grassTiles.delete(key);
        changed = true;
      }
    for (const chunk of next) {
      const previous = this.chunks.get(chunk.key);
      const holes = grass.filter(
        (b) =>
          b.maximumX + FARM_LAND_CONTAINER_EDGE_M >= chunk.x &&
          b.minimumX - FARM_LAND_CONTAINER_EDGE_M <= chunk.x + size &&
          b.maximumZ + FARM_LAND_CONTAINER_EDGE_M >= chunk.z &&
          b.minimumZ - FARM_LAND_CONTAINER_EDGE_M <= chunk.z + size
      );
      const affected =
        this.preview &&
        this.preview.maximumX + this.margin >= chunk.x &&
        this.preview.minimumX - this.margin <= chunk.x + size &&
        this.preview.maximumZ + this.margin >= chunk.z &&
        this.preview.minimumZ - this.margin <= chunk.z + size;
      const before = affected
        ? bounds.filter(
            (b) =>
              b.maximumX + this.margin >= chunk.x &&
              b.minimumX - this.margin <= chunk.x + size &&
              b.maximumZ + this.margin >= chunk.z &&
              b.minimumZ - this.margin <= chunk.z + size
          )
        : undefined;
      const signature = `${chunk.signature}/${JSON.stringify(holes)}${before ? `/preview:${JSON.stringify(before)}` : ""}`;
      if (previous?.signature === signature) continue;
      const field = bakeFarmLandCoverage(chunk, size, holes);
      this.grassTiles.set(chunk.key, {
        x: chunk.x,
        z: chunk.z,
        ...field,
        ...(before ? { beforePixels: bakeFarmLandCoverage({ ...chunk, bounds: before }, size, holes).pixels } : {})
      });
      changed = true;
      const heights = previous?.heights ?? captureFarmLandHeights(this.fields, this.grid, chunk);
      const mesh = previous?.mesh ?? this.createMesh(chunk, heights);
      const entity = previous?.entity ?? this.root.createChild(`Farm land ${chunk.key}`);
      const renderer = entity.getComponent(MeshRenderer) ?? entity.addComponent(MeshRenderer);
      entity.transform.setWorldPosition(chunk.x, 0, chunk.z);
      renderer.mesh = mesh;
      renderer.castShadows = false;
      renderer.receiveShadows = true;
      // Both surfaces blend; submit the dirt underlay before the worked-bed layer regardless of camera distance.
      renderer.priority = -1;
      renderer.setMaterial(this.material);
      this.chunks.set(chunk.key, { entity, mesh, signature, heights });
    }
    if (changed) this.grassOverlay.update([...this.grassTiles.values()], size);
  }

  begin(bounds: GroundBounds): void {
    if (this.disposed) return;
    this.preview = bounds;
    try {
      this.setBounds(this.bounds, this.grass);
    } catch (error) {
      this.preview = undefined;
      throw error;
    }
    this.grassOverlay.beginReveal();
  }

  seek(progress: number): void {
    if (this.preview) this.grassOverlay.seek(progress);
  }

  end(committed: boolean): void {
    if (!this.preview || this.disposed) return;
    const preview = this.preview;
    const bounds =
      committed &&
      !this.bounds.some(
        (b) =>
          b.minimumX === preview.minimumX &&
          b.maximumX === preview.maximumX &&
          b.minimumZ === preview.minimumZ &&
          b.maximumZ === preview.maximumZ
      )
        ? [...this.bounds, this.preview]
        : this.bounds;
    this.preview = undefined;
    this.setBounds(bounds, this.grass);
    this.grassOverlay.seek(1);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseAppearance();
    this.grassOverlay.dispose();
    this.clearChunks();
    this.root.destroy();
    this.material.destroy(true);
    // ResourceManager owns cached KTX2 textures; only release this layer's material references.
  }

  private clearChunks(): void {
    for (const chunk of this.chunks.values()) {
      chunk.entity.destroy();
      disposeSoilMesh(chunk.mesh);
    }
    this.chunks.clear();
    this.grassTiles.clear();
  }

  private planChunks(bounds: readonly GroundBounds[], grid: FarmLandGrid, extent: number): FarmLandChunk[] {
    const next = farmLandChunks(bounds, grid.size, grid.x, grid.z, FARM_LAND_MARGIN_M).filter(
      (chunk) =>
        chunk.x < grid.x + extent &&
        chunk.z < grid.z + extent &&
        chunk.x + grid.size > grid.x &&
        chunk.z + grid.size > grid.z
    );
    this.grassOverlay.validateLayout(next, grid.size, Math.ceil(grid.size / FARM_LAND_MASK_SPACING_M) + 1);
    return next;
  }

  private createMesh(chunk: Pick<FarmLandChunk, "x" | "z">, heights: Float64Array): BufferMesh {
    const grid = this.grid,
      domain = { x: chunk.x, z: chunk.z };
    const offset = DEFAULT_SOIL_VISUAL_CONFIG.soil.edge.surfaceOffset / 2;
    const data = buildFarmLandGeometry(grid, domain, heights, offset);
    const mesh = new BufferMesh(this.root.engine, `Farm land ${chunk.x},${chunk.z}`);
    const vertices = new Buffer(this.root.engine, BufferBindFlag.VertexBuffer, data.vertices, BufferUsage.Static);
    const indices = new Buffer(this.root.engine, BufferBindFlag.IndexBuffer, data.indices, BufferUsage.Static);
    mesh.setVertexBufferBinding(vertices, 24);
    mesh.setIndexBufferBinding(indices, IndexFormat.UInt16);
    mesh.setVertexElements([
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0)
    ]);
    mesh.addSubMesh(0, data.indices.length, MeshTopology.Triangles);
    mesh.bounds.min.set(0, data.minimumY, 0);
    mesh.bounds.max.set(data.width, data.maximumY, data.depth);
    // Reuse the existing tiny height snapshot, not another retained copy of packed vertex/index arrays.
    restoreResource(mesh, () => {
      const restored = buildFarmLandGeometry(grid, domain, heights, offset);
      vertices.setData(restored.vertices);
      indices.setData(restored.indices);
    });
    return mesh;
  }

  private async loadTextures(): Promise<void> {
    try {
      const texture = await loadPlanningFarmDirtTexture(this.root.engine);
      if (this.disposed) return;
      this.material.baseTexture = texture;
      this.grassOverlay.setColor(texture);
      this.ready = true;
    } catch (error) {
      if (!this.disposed) this.error = String(error);
    }
  }
}
