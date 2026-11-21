import {
  Matrix,
  MeshRenderer,
  Vector2,
  type Camera,
  type PBRMaterial,
  type Engine,
  type Entity
} from "@galacean/engine";
import { acquireRockVariantMesh } from "./Variants";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import { templateLinearColor, worldTemplate } from "../../../spatial/WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART } from "../../../spatial/WorldTemplateArtDirection";
import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import type { RockFormationMesh, RockVariantAsset } from "@galacean/engine-terrain/rock-formation/types";
import { createRockCollider, disabledRockCollisionOwners } from "./Collider.ts";
import { createRockVariantMaterial } from "./RockMaterial";
import { rockFormationPlacements } from "./Placement.ts";
import { readRockColorBlend, type RockColorBlend } from "./ColorPalette.ts";
import { RockLodView } from "./RockLodView";
import { setRockColorBlend } from "./ColorMaterial.ts";
import {
  playAssetEntranceEffect,
  playAssetExitEffect,
  playAssetUpdateEffect
} from "@galacean/engine-vegetation/asset-assembly/AssetEntranceEffect";
import type { SeedWorldTerrainOcclusionReadPort } from "../../../runtime/SeedWorldTerrainOcclusionCuller.ts";

interface RockViewEntry {
  formation: RockFormationMesh;
  entity: Entity;
  batch?: SeedWorldArrayPickBatch;
  collider?: ReturnType<typeof createRockCollider>;
  collisionKey: string;
  releaseVariant?: () => void;
}

/** Keep unchanged GPU surfaces resident; stage only changed formations before commit. */
export class RockFormationView {
  readonly root: Entity;
  private entries = new Map<string, RockViewEntry>();
  private readonly variantMaterials = new Map<
    RockVariantAsset,
    Map<boolean, { material: PBRMaterial; release?: () => void; users: number }>
  >();
  private disposed = false;
  private initialized = false;
  private readonly rockEffects = new Map<Entity, AbortController>();
  private readonly retiringEntries = new Set<RockViewEntry>();
  private grassCoveragePreview = false;
  private readonly grassTop: boolean;
  private readonly shoreStoneColor?: readonly [number, number, number];
  private readonly cliffBaseColor?: readonly [number, number, number];
  private readonly lod?: RockLodView;
  private readonly fadingPickBatches = new WeakMap<MeshRenderer, SeedWorldArrayPickBatch>();

  constructor(
    private readonly engine: Engine,
    parent: Entity,
    plan: IslandPlan,
    formations: readonly RockFormationMesh[],
    private readonly registerGrassAppearance?: (material: PBRMaterial) => () => void,
    private colorBlend: RockColorBlend = readRockColorBlend(),
    camera?: Camera,
    terrainOcclusion?: SeedWorldTerrainOcclusionReadPort
  ) {
    const template = worldTemplate(plan.parameters.worldTemplate?.id);
    const art = template ? WORLD_TEMPLATE_ART[template.id] : undefined;
    this.grassTop = (template?.rockTopCover ?? (template?.vegetation ? "ground" : "grass")) === "grass";
    this.shoreStoneColor = art?.shoreStone ? templateLinearColor(art.shoreStone) : undefined;
    this.cliffBaseColor = art?.stone ? templateLinearColor(art.stone) : undefined;
    this.root = parent.createChild("Rock formations");
    if (camera) {
      this.lod = this.root.addComponent(RockLodView);
      this.lod.camera = camera;
      this.lod.terrainOcclusion = terrainOcclusion;
    }
    try {
      this.prepareFormations(plan, formations).commit();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private upload(formation: RockFormationMesh, disabled: ReadonlySet<string>, collisionKey: string): RockViewEntry {
    const entity = this.root.createChild(`Rock surface · ${formation.id}`);
    entity.isActive = false;
    const entry: RockViewEntry = { formation, entity, collisionKey };
    try {
      this.uploadVariant(entry);
      entry.collider = createRockCollider(this.engine, entity, formation, disabled);
      return entry;
    } catch (error) {
      this.release(entry);
      throw error;
    }
  }

  private effectiveColorBlend(grass: boolean, settings: RockColorBlend): RockColorBlend {
    if (grass) {
      if (this.grassTop || !this.cliffBaseColor) return settings;
      // Sandstone cliff formations on ground-covered templates brighten the dark shared rock albedo into sunlit terracotta.
      const cliffBoost = 3.65;
      return {
        color: settings.color.map((channel) =>
          Math.max(0, Math.min(5.2, channel * cliffBoost))
        ) as RockColorBlend["color"]
      };
    }
    if (!this.shoreStoneColor) return settings;
    const base = this.cliffBaseColor;
    // Scale pale travertine/limestone shore boulders evenly by user brightness ratio without cliff red-orange channel bias.
    const luma = (rgb: readonly [number, number, number]) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    const baseLuma = base ? luma(base) : 0;
    const gain = baseLuma > 1e-4 ? Math.max(0.4, Math.min(3, luma(settings.color) / baseLuma)) : 1;
    const boost = 4.25 * gain;
    const color = this.shoreStoneColor.map((stone) =>
      Math.max(0, Math.min(5.4, stone * boost))
    ) as RockColorBlend["color"];
    return { color };
  }

  private uploadVariant(entry: RockViewEntry): void {
    const { asset, matrix } = entry.formation.variant!;
    const grass = !!entry.formation.grass;
    let roles = this.variantMaterials.get(asset);
    if (!roles) this.variantMaterials.set(asset, (roles = new Map()));
    let shared = roles.get(grass);
    if (!shared) {
      const material = createRockVariantMaterial(this.engine, asset, this.effectiveColorBlend(grass, this.colorBlend));
      try {
        if (grass && this.grassTop) material.shaderData.enableMacro("MATERIAL_ROCK_TOP_GRASS");
        if (grass && !this.grassTop && this.cliffBaseColor)
          material.shaderData.setVector2("material_TerrainCoverageSlope", new Vector2(0.7, 0.2));
        const release = grass ? this.registerGrassAppearance?.(material) : undefined;
        material.shaderData.setFloat("material_SurfaceCoveragePreview", Number(this.grassCoveragePreview));
        roles.set(grass, (shared = { material, release, users: 0 }));
      } catch (error) {
        material.destroy();
        throw error;
      }
    }
    const materialEntry = shared;
    materialEntry.users++;
    const releaseMaterial = () => {
      if (--materialEntry.users !== 0) return;
      materialEntry.release?.();
      materialEntry.material.destroy();
      roles.delete(grass);
      if (!roles.size) this.variantMaterials.delete(asset);
    };
    entry.releaseVariant = releaseMaterial;
    const geometry = acquireRockVariantMesh(this.engine, asset);
    let unregisterLod: (() => void) | undefined;
    entry.releaseVariant = () => {
      unregisterLod?.();
      geometry.release();
      releaseMaterial();
    };
    const child = entry.entity.createChild(asset.id);
    const transform = new Matrix();
    transform.elements.set(matrix);
    child.transform.localMatrix = transform;
    const renderer = child.addComponent(MeshRenderer);
    renderer.mesh = geometry.mesh;
    renderer.setMaterial(materialEntry.material);
    renderer.castShadows = renderer.receiveShadows = true;
    unregisterLod = this.lod?.add(renderer, geometry.mesh, asset);
    entry.batch = new SeedWorldArrayPickBatch(renderer);
    entry.batch.id = entry.formation.owners[0];
    entry.batch.count = 1;
  }

  prepareFormations(plan: IslandPlan, formations: readonly RockFormationMesh[]) {
    if (this.disposed) throw Error("Rock formation view disposed");
    const started = performance.now(),
      base = this.entries,
      next = new Map<string, RockViewEntry>(),
      created: RockViewEntry[] = [];
    const disabled = disabledRockCollisionOwners(plan);
    try {
      for (const formation of formations) {
        const current = base.get(formation.id);
        const collisionKey = JSON.stringify([...new Set(formation.owners.filter((id) => disabled.has(id)))].sort());
        if (current?.formation === formation && current.collisionKey === collisionKey) next.set(formation.id, current);
        else {
          const entry = this.upload(formation, disabled, collisionKey);
          created.push(entry);
          next.set(formation.id, entry);
        }
      }
    } catch (error) {
      created.forEach((entry) => this.release(entry));
      throw error;
    }
    const placement = this.placement(plan, next);
    let consumed = false;
    return {
      metrics: {
        uploaded: created.length,
        retained: next.size - created.length,
        meshSetupMs: performance.now() - started
      },
      commit: () => {
        if (consumed || this.disposed || this.entries !== base) throw Error("Stale rock formation frame");
        consumed = true;
        const animate = this.initialized;
        this.initialized = true;
        placement();
        const deleted: RockViewEntry[] = [];
        for (const [id, entry] of base) {
          if (next.get(id) === entry) continue;
          if (animate && !next.has(id) && entry.entity.isActive && !entry.entity.destroyed) {
            entry.collider?.dispose();
            entry.collider = undefined;
            entry.batch = undefined;
            deleted.push(entry);
          } else {
            this.release(entry);
          }
        }
        this.entries = next;
        for (const entry of created) {
          entry.entity.isActive = true;
          if (animate) {
            this.playRockEffect(entry.entity, base.has(entry.formation.id) ? "update" : "enter");
          }
        }
        for (const entry of deleted) {
          this.retiringEntries.add(entry);
          this.playRockEffect(entry.entity, "exit", () => {
            this.retiringEntries.delete(entry);
            this.release(entry);
          });
        }
      },
      discard: () => {
        if (!consumed) {
          consumed = true;
          created.forEach((entry) => this.release(entry));
        }
      }
    };
  }
  private placement(plan: IslandPlan, entries = this.entries): () => void {
    const placements = rockFormationPlacements(
      plan,
      [...entries.values()].map((entry) => entry.formation)
    );
    return () => {
      placements.forEach(({ formation, origin }) => entries.get(formation.id)!.entity.transform.setPosition(...origin));
      this.lod?.invalidate();
    };
  }
  /** Resident formation entities for the optional research preview's replacement layer. */
  get groups(): ReadonlyMap<string, Entity> {
    return new Map(Array.from(this.entries, ([id, entry]) => [id, entry.entity]));
  }
  setGrassCoveragePreview(enabled: boolean): void {
    this.grassCoveragePreview = enabled;
    for (const roles of this.variantMaterials.values())
      for (const { material } of roles.values())
        material.shaderData.setFloat("material_SurfaceCoveragePreview", Number(enabled));
  }
  setColorBlend(settings: RockColorBlend): void {
    this.colorBlend = settings;
    for (const roles of this.variantMaterials.values())
      for (const [grass, { material }] of roles) setRockColorBlend(material, this.effectiveColorBlend(grass, settings));
  }
  prepare(plan: IslandPlan) {
    return { commit: this.placement(plan) };
  }
  visitPickBatches(visitor: SeedWorldPickVisitor): void {
    for (const { batch } of this.entries.values()) {
      if (!batch?.renderer.entity.isActiveInHierarchy) continue;
      visitor(batch);
      const fading = this.lod?.fadingRenderer(batch.renderer);
      if (!fading) continue;
      let fadingBatch = this.fadingPickBatches.get(fading);
      if (!fadingBatch) {
        fadingBatch = new SeedWorldArrayPickBatch(fading);
        fadingBatch.id = batch.id;
        fadingBatch.count = batch.count;
        this.fadingPickBatches.set(fading, fadingBatch);
      }
      visitor(fadingBatch);
    }
  }
  private playRockEffect(entity: Entity, kind: "enter" | "exit" | "update", onComplete?: () => void): void {
    const previous = this.rockEffects.get(entity);
    if (previous) {
      this.rockEffects.delete(entity);
      previous.abort();
    }
    if (this.disposed || entity.destroyed || entity.pendingDestroy) {
      onComplete?.();
      return;
    }
    const controller = new AbortController();
    this.rockEffects.set(entity, controller);
    const play =
      kind === "enter"
        ? playAssetEntranceEffect([entity], { durationMs: 1350, signal: controller.signal, onComplete })
        : kind === "exit"
          ? playAssetExitEffect([entity], { durationMs: 750, signal: controller.signal, onComplete })
          : playAssetUpdateEffect([entity], { durationMs: 850, signal: controller.signal, onComplete });
    void play
      .catch(() => {})
      .finally(() => {
        if (this.rockEffects.get(entity) === controller) this.rockEffects.delete(entity);
      });
  }
  private release(entry: RockViewEntry): void {
    const active = this.rockEffects.get(entry.entity);
    if (active) {
      this.rockEffects.delete(entry.entity);
      active.abort();
    }
    entry.collider?.dispose();
    if (!entry.entity.destroyed) entry.entity.destroy();
    entry.releaseVariant?.();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.rockEffects.values()) controller.abort();
    this.rockEffects.clear();
    for (const entry of this.retiringEntries) this.release(entry);
    this.retiringEntries.clear();
    for (const entry of this.entries.values()) this.release(entry);
    this.entries.clear();
    this.root.destroy();
  }
}
