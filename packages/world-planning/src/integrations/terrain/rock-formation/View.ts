import { Matrix, MeshRenderer, type PBRMaterial, type Engine, type Entity } from "@galacean/engine";
import { acquireRockVariantMesh } from "./Variants";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import type { RockFormationMesh, RockVariantAsset } from "@galacean/engine-terrain/rock-formation/types";
import { createRockCollider, disabledRockCollisionOwners } from "./Collider.ts";
import { createRockVariantMaterial } from "./RockMaterial";
import { rockFormationPlacements } from "./Placement.ts";
import { readRockColorBlend, type RockColorBlend } from "./ColorPalette.ts";
import { setRockColorBlend } from "./ColorMaterial.ts";

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
  private grassCoveragePreview = false;

  constructor(
    private readonly engine: Engine,
    parent: Entity,
    plan: IslandPlan,
    formations: readonly RockFormationMesh[],
    private readonly registerGrassAppearance?: (material: PBRMaterial) => () => void,
    private colorBlend: RockColorBlend = readRockColorBlend()
  ) {
    this.root = parent.createChild("Rock formations");
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

  private uploadVariant(entry: RockViewEntry): void {
    const { asset, matrix } = entry.formation.variant!;
    const grass = !!entry.formation.grass;
    let roles = this.variantMaterials.get(asset);
    if (!roles) this.variantMaterials.set(asset, (roles = new Map()));
    let shared = roles.get(grass);
    if (!shared) {
      const material = createRockVariantMaterial(this.engine, asset, this.colorBlend);
      try {
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
    entry.releaseVariant = () => {
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
        placement();
        for (const [id, entry] of base) if (next.get(id) !== entry) this.release(entry);
        this.entries = next;
        for (const entry of created) entry.entity.isActive = true;
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
    return () =>
      placements.forEach(({ formation, origin }) => entries.get(formation.id)!.entity.transform.setPosition(...origin));
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
      for (const { material } of roles.values()) setRockColorBlend(material, settings);
  }
  prepare(plan: IslandPlan) {
    return { commit: this.placement(plan) };
  }
  visitPickBatches(visitor: SeedWorldPickVisitor): void {
    for (const { batch } of this.entries.values()) if (batch?.renderer.entity.isActiveInHierarchy) visitor(batch);
  }
  private release(entry: RockViewEntry): void {
    entry.collider?.dispose();
    entry.entity.destroy();
    entry.releaseVariant?.();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) this.release(entry);
    this.entries.clear();
    this.root.destroy();
  }
}
