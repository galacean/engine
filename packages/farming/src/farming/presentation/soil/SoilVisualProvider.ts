import type { FarmSnapshot } from "../../domain/FarmState";
import { buildMoistureStencils, sampleMoistureInto } from "./SoilMoistureSamples";
import { SOIL_MOISTURE_SHADER } from "./SoilMoistureShader";
import {
  AssetType,
  Shader,
  Color,
  Engine,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  PBRMaterial,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine";

import { DEFAULT_SOIL_VISUAL_CONFIG } from "./SoilVisualConfig";
import { disposeSoilMesh } from "./disposeSoilMesh";
import type { SoilCell } from "./SoilBoundary";
import type { PlotGrid } from "../../domain/FarmingGround";
import { SoilBatchPlot, SoilRenderBatches } from "./SoilRenderBatches";
import type { Entity } from "@galacean/engine";

export type SoilVisualTarget = MeshRenderer | SoilBatchPlot;

/** Eight quads per side: 81 vertices and 128 triangles per bed. */
export const SOIL_MESH_SEGMENTS = 8;

interface SoilAppearance {
  readonly material?: PBRMaterial;
  readonly batch?: SoilBatchPlot;
  moisture: number;
  targetMoisture: number;
  held: boolean;
  dirty: boolean;
  readonly holds: Set<object>;
  readonly samples: number[];
}

interface TopologySnapshotEntry {
  plotId: string;
  groundId: string;
  cellX: number;
  cellZ: number;
  waterMask: number | undefined;
  availability: string;
}

interface FieldEntry {
  id: string;
  renderer: SoilVisualTarget;
  stencil: readonly (readonly string[])[] | undefined;
}

const SOIL_ROW_NAMES = ["soil_Row0", "soil_Row1", "soil_Row2"] as const;

interface SoilTextureFailure {
  readonly error: string;
  retry?: ReturnType<typeof setTimeout>;
}

const FIRST_TEXTURE_RETRY_MS = 1000;
const MAX_TEXTURE_RETRY_MS = 30000;

/**
 * Shared farming soil appearance owner. Farming rules expose plot/crop state; this
 * provider alone decides which mesh, textures and material represent it.
 */
export class SoilVisualProvider {
  private fallbackMesh?: ModelMesh;
  readonly vertexCount = (SOIL_MESH_SEGMENTS + 1) ** 2;

  get mesh(): ModelMesh {
    if (this.disposed) throw new Error("Soil visual provider disposed");
    return (this.fallbackMesh ??= createHandpaintedSoilMesh(this.engine, this.size));
  }

  private readonly appearances = new Map<SoilVisualTarget, SoilAppearance>();
  private readonly perimeterRenderers = new Set<MeshRenderer>();
  private diffuseTexture: Texture2D | null = null;
  private normalTexture: Texture2D | null = null;
  private transitionBlend = 0;
  private topologyInitialized = false;
  private readonly topologyPlots: TopologySnapshotEntry[] = [];
  private topologyPlotCount = 0;
  private topologyPreviewId?: string;
  private topologyPreviewGroundId?: string;
  private topologyPreviewCellX = 0;
  private topologyPreviewCellZ = 0;
  private stencils = new Map<string, readonly (readonly string[])[]>();
  private readonly fieldRenderers = new Map<string, SoilVisualTarget>();
  private readonly fieldRendererIds: string[] = [];
  private readonly fieldRendererTargets: SoilVisualTarget[] = [];
  private readonly fieldEntries: FieldEntry[] = [];
  private readonly displayValues = new Map<string, number>();
  private readonly dirtyList: SoilVisualTarget[] = [];
  private moisturePreview?: { plotId: string; weight: number };
  private readonly dependents = new Map<SoilVisualTarget, SoilVisualTarget[]>();
  private perimeterMaterial?: PBRMaterial;
  private readonly textureStatus = new Map<string, "loading" | "ready" | SoilTextureFailure>();
  private disposed = false;
  private batches?: SoilRenderBatches;
  private readonly recordFieldRenderer = (renderer: SoilVisualTarget, id: string): void => {
    this.fieldRenderers.set(id, renderer);
    this.fieldRendererIds.push(id);
    this.fieldRendererTargets.push(renderer);
  };

  constructor(
    private readonly engine: Engine,
    readonly size: number,
    private readonly shader?: Shader
  ) {}

  /** Only live farming surfaces use chunks; direct editing/animation previews keep their original renderer path. */
  createPlot(parent: Entity, entity: Entity, grid: PlotGrid, cell: SoilCell, moisture: number): SoilVisualTarget {
    this.requestSoilTextures();
    const webgl2 = (this.engine as unknown as { _hardwareRenderer: { isWebGL2: boolean } })._hardwareRenderer.isWebGL2;
    if (!webgl2) {
      const renderer = entity.addComponent(MeshRenderer);
      renderer.castShadows = false;
      renderer.receiveShadows = true;
      this.apply(renderer, moisture);
      this.enableBoundaryBlending(renderer);
      return renderer;
    }
    if (!this.batches) {
      const material = createSoilMaterial(this.engine, this.shader);
      material.baseTexture = this.diffuseTexture!;
      material.normalTexture = this.normalTexture!;
      try {
        this.batches = new SoilRenderBatches(this.engine, parent, material);
      } catch (error) {
        material.destroy(true);
        throw error;
      }
    }
    const batch = this.batches.add(entity, grid, cell);
    moisture = Math.max(0, Math.min(1, moisture));
    const appearance: SoilAppearance = {
      batch,
      moisture,
      targetMoisture: moisture,
      held: false,
      dirty: false,
      holds: new Set(),
      samples: new Array<number>(9).fill(moisture)
    };
    this.appearances.set(batch, appearance);
    updateSoilMaterial(appearance);
    return batch;
  }

  release(renderer: SoilVisualTarget): void {
    if (renderer instanceof MeshRenderer && this.perimeterRenderers.delete(renderer)) {
      if (!renderer.destroyed && renderer.getMaterial() === this.perimeterMaterial) renderer.setMaterial(null!);
    }
    const appearance = this.appearances.get(renderer);
    if (appearance) appearance.dirty = false;
    const material = appearance?.material;
    if (material) {
      if (!(renderer instanceof SoilBatchPlot) && !renderer.destroyed && renderer.getMaterial() === material)
        renderer.setMaterial(null!);
      material.destroy(true);
    }
    if (renderer instanceof SoilBatchPlot) renderer.dispose();
    this.appearances.delete(renderer);
    this.dependents.delete(renderer);
  }

  get batchDiagnostics() {
    return this.batches?.diagnostics;
  }

  get batchPerformanceDiagnostics() {
    return this.batches
      ? { chunks: this.batches.diagnostics.chunks, activeChunks: this.batches.activeChunkCount }
      : undefined;
  }

  get ready(): boolean {
    return !this.disposed && this.loadedTextureCount === this.textureStatus.size;
  }

  get loadedTextureCount(): number {
    let count = 0;
    for (const status of this.textureStatus.values()) if (status === "ready") count++;
    return count;
  }

  get loadError(): string | null {
    const errors = [];
    for (const status of this.textureStatus.values()) if (typeof status === "object") errors.push(status.error);
    return errors.join("；") || null;
  }

  /** Independent geometry follows host terrain; materials/textures remain provider-owned. */
  createEditableMesh(footprint?: { readonly size: number; readonly square: boolean }): ModelMesh {
    return createHandpaintedSoilMesh(this.engine, footprint?.size ?? this.size, true, footprint?.square);
  }

  setCoverageTexture(renderer: SoilVisualTarget, texture: Texture2D | null): void {
    const material = this.appearances.get(renderer)?.material;
    if (!material) return;
    material.shaderData.setTexture("soil_CoverageTexture", texture!);
    if (texture) material.shaderData.enableMacro("FARM_SOIL_COVERAGE");
    else material.shaderData.disableMacro("FARM_SOIL_COVERAGE");
  }

  /** Moisture is normalized to 0..1. New plots initialize immediately; later changes ease over time. */
  apply(renderer: SoilVisualTarget, moisture: number): void {
    if (this.disposed || renderer.destroyed) return;
    const targetMoisture = Math.max(0, Math.min(1, moisture));
    if (renderer instanceof SoilBatchPlot) return;
    this.requestSoilTextures();
    const mesh = this.mesh;
    if (renderer.mesh !== mesh) renderer.mesh = mesh;
    renderer.enableVertexColor = true;
    let appearance = this.appearances.get(renderer);
    if (!appearance) {
      const material = createSoilMaterial(this.engine, this.shader);
      if (this.diffuseTexture) material.baseTexture = this.diffuseTexture;
      if (this.normalTexture) material.normalTexture = this.normalTexture;
      appearance = {
        material,
        moisture: targetMoisture,
        targetMoisture,
        held: false,
        dirty: false,
        holds: new Set(),
        samples: new Array<number>(9).fill(targetMoisture)
      };
      this.appearances.set(renderer, appearance);
      updateSoilMaterial(appearance);
      renderer.setMaterial(material);
    } else {
      appearance.targetMoisture = targetMoisture;
    }
  }

  /** Change water content without rebinding a plot's independently owned worked geometry. */
  setMoisture(renderer: SoilVisualTarget, moisture: number): void {
    if (this.disposed || renderer.destroyed || !Number.isFinite(moisture)) return;
    const appearance = this.appearances.get(renderer);
    if (appearance) appearance.targetMoisture = Math.max(0, Math.min(1, moisture));
  }

  /** Blend the worked mesh's vertex coverage over the actual host terrain. */
  enableBoundaryBlending(renderer: SoilVisualTarget): void {
    const appearance = this.appearances.get(renderer);
    if (appearance?.material) appearance.material.isTransparent = true;
  }

  /** Reveal the cultivated material over the host ground without updating geometry. */
  setCultivationProgress(renderer: SoilVisualTarget, progress: number): void {
    const appearance = this.appearances.get(renderer);
    if (!appearance) return;
    if (appearance.batch) {
      appearance.batch.setProgress(7, progress);
      return;
    }
    appearance.material!.isTransparent = true;
    // The dissolve already supplies local coverage. A second whole-bed fade leaves
    // revealed soil translucent and disagrees with the neighbouring contour mask.
    appearance.material!.baseColor.a = 1;
    appearance.material!.shaderData.setFloat("soil_CultivationProgress", progress);
  }

  setBoundaryProgress(renderer: SoilVisualTarget, progress: number): void {
    const appearance = this.appearances.get(renderer);
    if (appearance?.batch) appearance.batch.setProgress(3, progress);
    else appearance?.material?.shaderData.setFloat("soil_BoundaryProgress", progress);
  }

  private markDirty(renderer: SoilVisualTarget): void {
    const appearance = this.appearances.get(renderer);
    if (!appearance || appearance.dirty) return;
    appearance.dirty = true;
    this.dirtyList.push(renderer);
  }

  /** Rebuild interpolation contributors only when plots or their confirmed connections change. */
  setField(snapshot: FarmSnapshot, renderers: ReadonlyMap<string, SoilVisualTarget>, preview?: SoilCell): void {
    const plots = snapshot.plots;
    const previewId = preview?.plotId;
    if (previewId !== undefined) {
      for (let i = 0; i < plots.length; i++) {
        if (plots[i].plotId === previewId) {
          preview = undefined;
          break;
        }
      }
    }
    let sameTopology =
      this.topologyInitialized &&
      plots.length === this.topologyPlotCount &&
      (preview?.plotId ?? undefined) === this.topologyPreviewId &&
      (!preview ||
        (preview.groundId === this.topologyPreviewGroundId &&
          preview.cellX === this.topologyPreviewCellX &&
          preview.cellZ === this.topologyPreviewCellZ));
    if (sameTopology) {
      for (let i = 0; i < plots.length; i++) {
        const plot = plots[i];
        const cached = this.topologyPlots[i];
        if (
          plot.plotId !== cached.plotId ||
          plot.groundId !== cached.groundId ||
          plot.cellX !== cached.cellX ||
          plot.cellZ !== cached.cellZ ||
          plot.ground.waterMask !== cached.waterMask ||
          plot.ground.availability !== cached.availability
        ) {
          sameTopology = false;
          break;
        }
      }
    }
    if (sameTopology && renderers.size === this.fieldRenderers.size) {
      let sameRenderers = true;
      for (let i = 0; i < this.fieldRendererIds.length; i++) {
        if (renderers.get(this.fieldRendererIds[i]) !== this.fieldRendererTargets[i]) {
          sameRenderers = false;
          break;
        }
      }
      if (sameRenderers) return;
    }

    this.topologyInitialized = true;
    this.topologyPlotCount = plots.length;
    for (let i = 0; i < plots.length; i++) {
      const plot = plots[i];
      let cached = this.topologyPlots[i];
      if (!cached) {
        cached = {
          plotId: plot.plotId,
          groundId: plot.groundId,
          cellX: plot.cellX,
          cellZ: plot.cellZ,
          waterMask: plot.ground.waterMask,
          availability: plot.ground.availability
        };
        this.topologyPlots[i] = cached;
      } else {
        cached.plotId = plot.plotId;
        cached.groundId = plot.groundId;
        cached.cellX = plot.cellX;
        cached.cellZ = plot.cellZ;
        cached.waterMask = plot.ground.waterMask;
        cached.availability = plot.ground.availability;
      }
    }
    this.topologyPreviewId = preview?.plotId;
    this.topologyPreviewGroundId = preview?.groundId;
    this.topologyPreviewCellX = preview?.cellX ?? 0;
    this.topologyPreviewCellZ = preview?.cellZ ?? 0;

    if (this.moisturePreview?.plotId !== preview?.plotId)
      this.moisturePreview = preview ? { plotId: preview.plotId, weight: 0 } : undefined;
    this.fieldRenderers.clear();
    this.fieldRendererIds.length = 0;
    this.fieldRendererTargets.length = 0;
    renderers.forEach(this.recordFieldRenderer);
    this.stencils = buildMoistureStencils(plots, preview);
    this.fieldEntries.length = 0;
    this.dependents.clear();
    for (let i = 0; i < this.dirtyList.length; i++) {
      const appearance = this.appearances.get(this.dirtyList[i]);
      if (appearance) appearance.dirty = false;
    }
    this.dirtyList.length = 0;

    this.stencils.forEach((stencil, id) => {
      const renderer = renderers.get(id);
      if (!renderer) return;
      this.fieldEntries.push({ id, renderer, stencil });
      this.markDirty(renderer);
      for (let s = 0; s < stencil.length; s++) {
        const contributors = stencil[s];
        for (let c = 0; c < contributors.length; c++) {
          const input = renderers.get(contributors[c]);
          if (!input) continue;
          let list = this.dependents.get(input);
          if (!list) {
            list = [];
            this.dependents.set(input, list);
          }
          if (list.indexOf(renderer) < 0) list.push(renderer);
        }
      }
    });
  }

  /** Only display interpolation changes during work; water simulation is not involved. */
  setPreviewProgress(progress: number): void {
    const preview = this.moisturePreview;
    if (!preview || preview.weight === progress) return;
    preview.weight = progress;
    const renderer = this.fieldRenderers.get(preview.plotId);
    if (!renderer) return;
    const dependents = this.dependents.get(renderer);
    if (!dependents) return;
    for (let i = 0; i < dependents.length; i++) this.markDirty(dependents[i]);
  }

  /** Delay visual wetting until the watering effect lands; the confirmed target stays current. */
  holdTransition(renderer: SoilVisualTarget, held: boolean, token?: object): void {
    const appearance = this.appearances.get(renderer);
    if (!appearance) return;
    if (token) {
      if (held) appearance.holds.add(token);
      else appearance.holds.delete(token);
    } else appearance.held = held;
  }

  /** Called once per rendered frame. Stable plots do not allocate or rewrite their material. */
  update(deltaSeconds: number): void {
    if (this.disposed) return;
    this.transitionBlend =
      deltaSeconds > 0 ? 1 - Math.exp(-deltaSeconds / DEFAULT_SOIL_VISUAL_CONFIG.soil.moisture.transitionSeconds) : 0;
    this.appearances.forEach(this.updateAppearance, this);
    const dirtyList = this.dirtyList;
    if (!dirtyList.length) {
      this.batches?.flush();
      return;
    }
    this.displayValues.clear();
    const fieldEntries = this.fieldEntries;
    for (let i = 0; i < fieldEntries.length; i++) {
      const entry = fieldEntries[i];
      const appearance = this.appearances.get(entry.renderer);
      if (appearance) this.displayValues.set(entry.id, appearance.moisture);
    }
    for (let i = 0; i < fieldEntries.length; i++) {
      const entry = fieldEntries[i];
      const appearance = this.appearances.get(entry.renderer);
      if (!appearance || !appearance.dirty || !entry.stencil) continue;
      sampleMoistureInto(entry.stencil, this.displayValues, appearance.samples, this.moisturePreview);
      updateSoilMaterial(appearance);
    }
    for (let i = 0; i < dirtyList.length; i++) {
      const appearance = this.appearances.get(dirtyList[i]);
      if (appearance) appearance.dirty = false;
    }
    dirtyList.length = 0;
    this.batches?.flush();
  }

  getAppearance(renderer: SoilVisualTarget) {
    const appearance = this.appearances.get(renderer);
    if (!appearance) return null;
    const { dry, saturated } = DEFAULT_SOIL_VISUAL_CONFIG.soil.moisture;
    const color = dry.color.map((v, i) => v + (saturated.color[i] - v) * appearance.moisture);
    return {
      moisture: appearance.moisture,
      targetMoisture: appearance.targetMoisture,
      color,
      samples: [...appearance.samples],
      roughness: dry.roughness + (saturated.roughness - dry.roughness) * appearance.moisture
    };
  }

  applyPerimeter(renderer: MeshRenderer): void {
    if (this.disposed || renderer.destroyed) return;
    if (!this.perimeterMaterial) {
      this.perimeterMaterial = createPerimeterMaterial(this.engine);
      this.perimeterMaterial.normalTextureIntensity = DEFAULT_SOIL_VISUAL_CONFIG.perimeter.normalIntensity;
    }
    const material = this.perimeterMaterial;
    if (!material.baseTexture)
      void this.loadTexture("perimeter", "diffuse", "grass-mud-albedo-smoothness", (texture) => {
        material.baseTexture = texture;
      });
    if (!material.normalTexture)
      void this.loadTexture("perimeter", "normal", "grass-mud-normal", (texture) => {
        material.normalTexture = texture;
      });
    this.perimeterRenderers.add(renderer);
    renderer.setMaterial(material);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.batches?.dispose();
    for (const renderer of this.appearances.keys()) {
      if (!(renderer instanceof SoilBatchPlot) && !renderer.destroyed && renderer.mesh === this.fallbackMesh)
        renderer.mesh = null!;
      this.release(renderer);
    }
    this.fieldRenderers.clear();
    this.fieldRendererIds.length = 0;
    this.fieldRendererTargets.length = 0;
    this.fieldEntries.length = 0;
    this.topologyPlots.length = 0;
    this.topologyPlotCount = 0;
    this.topologyInitialized = false;
    this.stencils.clear();
    this.dependents.clear();
    this.displayValues.clear();
    this.dirtyList.length = 0;
    for (const renderer of this.perimeterRenderers) this.release(renderer);
    this.perimeterMaterial?.destroy(true);
    this.perimeterMaterial = undefined;
    if (this.fallbackMesh) disposeSoilMesh(this.fallbackMesh);
    this.fallbackMesh = undefined;
    // ResourceManager caches these borrowed textures across providers and Scenes.
    // Releasing our materials drops our references; the engine owns texture reclamation.
    for (const status of this.textureStatus.values()) if (typeof status === "object") clearTimeout(status.retry);
    this.textureStatus.clear();
    this.diffuseTexture = this.normalTexture = null;
  }

  private updateAppearance(appearance: SoilAppearance, renderer: SoilVisualTarget): void {
    if (renderer.destroyed || (renderer instanceof SoilBatchPlot && renderer.entity.destroyed)) {
      this.release(renderer);
      return;
    }
    appearance.batch?.refreshVisibility();
    const difference = appearance.targetMoisture - appearance.moisture;
    if (appearance.held || appearance.holds.size || this.transitionBlend === 0) return;
    if (difference === 0) return;
    appearance.moisture =
      Math.abs(difference) < 0.0001
        ? appearance.targetMoisture
        : appearance.moisture + difference * this.transitionBlend;
    const dependents = this.dependents.get(renderer);
    if (dependents) {
      for (let i = 0; i < dependents.length; i++) this.markDirty(dependents[i]);
    } else {
      for (let i = 0; i < 9; i++) appearance.samples[i] = appearance.moisture;
      updateSoilMaterial(appearance);
    }
  }

  private requestSoilTextures(): void {
    if (!this.diffuseTexture)
      void this.loadTexture("soil", "diffuse", "juliovii-handpainted-dirt", (texture) => {
        this.diffuseTexture = texture;
        for (const { material } of this.appearances.values()) if (material) material.baseTexture = texture;
        if (this.batches && !this.batches.material.destroyed) this.batches.material.baseTexture = texture;
      });
    if (!this.normalTexture)
      void this.loadTexture("soil", "normal", "juliovii-handpainted-dirt-normal", (texture) => {
        this.normalTexture = texture;
        for (const { material } of this.appearances.values()) if (material) material.normalTexture = texture;
        if (this.batches && !this.batches.material.destroyed) this.batches.material.normalTexture = texture;
      });
  }

  private async loadTexture(
    group: "soil" | "perimeter",
    channel: "diffuse" | "normal",
    name: string,
    apply: (texture: Texture2D) => void,
    retryDelay = FIRST_TEXTURE_RETRY_MS
  ): Promise<void> {
    const status = this.textureStatus.get(name);
    if (this.disposed || this.engine.destroyed || status === "loading" || status === "ready") return;
    if (status?.retry !== undefined) return;
    this.textureStatus.set(name, "loading");
    const { textures, originalTextures } = DEFAULT_SOIL_VISUAL_CONFIG[group];
    try {
      let texture: Texture2D;
      try {
        texture = await this.engine.resourceManager.load<Texture2D>({ type: AssetType.KTX2, url: textures[channel] });
      } catch {
        if (this.disposed || this.engine.destroyed) return;
        texture = await this.engine.resourceManager.load<Texture2D>({
          type: AssetType.Texture,
          url: originalTextures[channel],
          params: { isSRGBColorSpace: channel === "diffuse", mipmap: true }
        });
      }
      if (this.disposed || this.engine.destroyed) return;
      texture.name = name;
      texture.filterMode = TextureFilterMode.Trilinear;
      texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
      texture.anisoLevel = DEFAULT_SOIL_VISUAL_CONFIG.anisoLevel;
      apply(texture);
      this.textureStatus.set(name, "ready");
    } catch (error) {
      if (this.disposed || this.engine.destroyed) return;
      const message = `${name}: ${error instanceof Error ? error.message : String(error)}`;
      const failure: SoilTextureFailure = { error: message };
      failure.retry = setTimeout(() => {
        failure.retry = undefined;
        // Once the last renderer is gone, the next use can request the map again.
        const renderers = group === "soil" ? this.appearances.keys() : this.perimeterRenderers;
        for (const renderer of renderers) {
          if (renderer.destroyed || (renderer instanceof SoilBatchPlot && renderer.entity.destroyed)) continue;
          void this.loadTexture(group, channel, name, apply, Math.min(retryDelay * 2, MAX_TEXTURE_RETRY_MS));
          break;
        }
      }, retryDelay);
      this.textureStatus.set(name, failure);
      if (retryDelay === FIRST_TEXTURE_RETRY_MS) console.warn(`农场贴图加载失败，对应贴图使用基础材质：${message}`);
    }
  }
}

function createSoilMaterial(engine: Engine, shader?: Shader): PBRMaterial {
  const material = new PBRMaterial(engine);
  material.name = "moisture-handpainted-soil";
  material.shader = shader ?? Shader.find("Farming/SoilMoisture") ?? Shader.create(SOIL_MOISTURE_SHADER);
  const { dry, saturated } = DEFAULT_SOIL_VISUAL_CONFIG.soil.moisture;
  material.shaderData.setColor("soil_DryColor", new Color(...dry.color));
  material.shaderData.setColor("soil_WetColor", new Color(...saturated.color));
  material.shaderData.setVector2("soil_Roughness", new Vector2(dry.roughness, saturated.roughness));
  material.shaderData.setFloat("soil_BoundaryProgress", 0);
  material.shaderData.setFloat("soil_CultivationProgress", 1);
  for (let i = 0; i < 3; i++) material.shaderData.setVector3(`soil_Row${i}`, new Vector3());
  material.metallic = 0;
  material.normalTextureIntensity = DEFAULT_SOIL_VISUAL_CONFIG.soil.normalIntensity;
  material.screenSpaceReflectionIntensity = 0;
  material.isGCIgnored = true;
  return material;
}

function updateSoilMaterial({ material, batch, samples }: SoilAppearance): void {
  if (batch) {
    batch.setSamples(samples);
    return;
  }
  for (let i = 0; i < 3; i++)
    material!.shaderData.getVector3(SOIL_ROW_NAMES[i]).set(samples[i * 3], samples[i * 3 + 1], samples[i * 3 + 2]);
}

function createPerimeterMaterial(engine: Engine): PBRMaterial {
  const material = new PBRMaterial(engine);
  material.name = "grass-mud-field-perimeter";
  material.baseColor = new Color(...DEFAULT_SOIL_VISUAL_CONFIG.perimeter.color);
  material.metallic = 0;
  material.roughness = DEFAULT_SOIL_VISUAL_CONFIG.perimeter.roughness;
  material.tilingOffset = new Vector4(...DEFAULT_SOIL_VISUAL_CONFIG.perimeter.tilingOffset);
  material.isGCIgnored = true;
  return material;
}

/** Shared soft-edged beds. Planting never changes soil geometry. */
function createHandpaintedSoilMesh(engine: Engine, size: number, editable = false, square = false): ModelMesh {
  const segments = SOIL_MESH_SEGMENTS;
  const positions: Vector3[] = [];
  const normals: Vector3[] = [];
  const colors: Color[] = [];
  const uvs: Vector2[] = [];
  const indices: number[] = [];
  const half = size / 2;
  for (let row = 0; row <= segments; row++) {
    for (let column = 0; column <= segments; column++) {
      const u = (column / segments) * 2 - 1;
      const v = (row / segments) * 2 - 1;
      // Map a square grid to a rounded square; small edge variation avoids cut tiles.
      const radius = Math.pow(Math.pow(Math.abs(u), 10) + Math.pow(Math.abs(v), 10), 0.1);
      const factor = !square && radius > 0 ? Math.max(Math.abs(u), Math.abs(v)) / radius : 1;
      const angle = Math.atan2(v, u);
      const edge = square ? 1 : soilBoundaryScale(angle);
      const x = u * factor * half * edge;
      const z = v * factor * half * edge;
      const y = 0;
      const normal = new Vector3(0, 1, 0);
      positions.push(new Vector3(x, y, z));
      normals.push(normal);
      const edgeShade = square ? 1 : 0.78 + 0.22 * smoothstep(0, 0.13, 1 - Math.max(Math.abs(u), Math.abs(v)));
      const shade = edgeShade;
      // RGB: shading; A: static outer contour coverage.
      colors.push(new Color(1, shade, 1, 1));
      uvs.push(new Vector2(x / size + 0.5, z / size + 0.5));
    }
  }
  const stride = segments + 1;
  for (let row = 0; row < segments; row++) {
    for (let column = 0; column < segments; column++) {
      const a = row * stride + column;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const mesh = new ModelMesh(engine, "Handpainted Earth Bed");
  mesh.bounds.min.set(-half * 1.025, -0.11, -half * 1.025);
  mesh.bounds.max.set(half * 1.025, 0.14, half * 1.025);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setColors(colors);
  mesh.setUVs(uvs);
  mesh.setIndices(new Uint16Array(indices));
  mesh.calculateTangents();
  mesh.addSubMesh(0, indices.length, MeshTopology.Triangles);
  mesh.uploadData(!editable);
  return mesh;
}

function soilBoundaryScale(angle: number): number {
  return 0.975 + 0.012 * Math.sin(angle * 7 + 0.7) + 0.008 * Math.sin(angle * 11);
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const ratio = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  return ratio * ratio * (3 - 2 * ratio);
}
