import { acquireRockVariantMesh } from "./Variants";
import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Matrix,
  MeshRenderer,
  PBRMaterial,
  VertexElement,
  VertexElementFormat,
  type Engine,
  type Entity
} from "@galacean/engine";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import type { RockFormationMesh, RockVariantAsset } from "@galacean/engine-terrain/rock-formation/types";
import { createRockCollider, disabledRockCollisionOwners } from "./Collider.ts";
import { rockSurfaceAttributes } from "@galacean/engine-terrain/rock-formation/SurfaceAttributes";
import { createRockFormationMaterial, createRockVariantMaterial, setRockTextureScale } from "./RockMaterial";
export { createRockFormationMaterial } from "./RockMaterial";
import { DEFAULT_ROCK_TEXTURE_SCALE } from "./Settings.ts";
import { rockFormationPlacements } from "./Placement.ts";
import { readRockColorBlend, type RockColorBlend } from "./ColorPalette.ts";
import { setRockColorBlend } from "./ColorMaterial.ts";

interface RockViewEntry {
  formation: RockFormationMesh;
  entity: Entity;
  mesh?: BufferMesh;
  buffer?: Buffer;
  batch?: SeedWorldArrayPickBatch;
  collider?: ReturnType<typeof createRockCollider>;
  collisionKey: string;
  releaseVariant?: () => void;
}

export interface RockFormationSurface {
  renderer: MeshRenderer;
  mesh: BufferMesh;
  buffer: Buffer;
  ids: string[];
}

/** Upload the generator's triangles without fitting or replacing their geometry.
 * The caller owns the returned mesh/buffer and the entity; materials are borrowed. */
export function uploadRockFormationSurface(
  engine: Engine,
  entity: Entity,
  formation: RockFormationMesh,
  material: PBRMaterial
): RockFormationSurface | undefined {
  const source = formation.mesh;
  if (!source.indices.length) return undefined;
  const { data, ids, stride } = rockSurfaceAttributes(formation);
  let minimumX = Infinity,
    minimumY = Infinity,
    minimumZ = Infinity;
  let maximumX = -Infinity,
    maximumY = -Infinity,
    maximumZ = -Infinity;
  for (let i = 0; i < source.indices.length; i++) {
    const p = i * stride;
    minimumX = Math.min(minimumX, data[p]);
    maximumX = Math.max(maximumX, data[p]);
    minimumY = Math.min(minimumY, data[p + 1]);
    maximumY = Math.max(maximumY, data[p + 1]);
    minimumZ = Math.min(minimumZ, data[p + 2]);
    maximumZ = Math.max(maximumZ, data[p + 2]);
  }
  const mesh = new BufferMesh(engine, `Rock surface · ${formation.id}`);
  let buffer: Buffer | undefined, renderer: MeshRenderer | undefined;
  try {
    buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, data, BufferUsage.Static);
    const elements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 24, VertexElementFormat.Vector2, 0),
      new VertexElement("TEXCOORD_1", 32, VertexElementFormat.Vector2, 0)
    ];
    mesh.setVertexElements(elements);
    mesh.setVertexBufferBinding(buffer, stride * Float32Array.BYTES_PER_ELEMENT);
    mesh.addSubMesh(0, source.indices.length);
    mesh.bounds.min.set(minimumX, minimumY, minimumZ);
    mesh.bounds.max.set(maximumX, maximumY, maximumZ);
    renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
    renderer.shaderData.enableMacro("RENDERER_SURFACE_TEXTURE_SIZE");
    renderer.shaderData.setFloat("renderer_SurfaceTextureSize", formation.textureScale ?? 1);
    renderer.castShadows = true;
    renderer.receiveShadows = true;
    return { renderer, mesh, buffer, ids };
  } catch (error) {
    renderer?.destroy();
    mesh.destroy();
    if (buffer && !buffer.destroyed) buffer.destroy();
    throw error;
  }
}

/** Keep unchanged GPU surfaces resident; stage only changed formations before commit. */
export class RockFormationView {
  readonly root: Entity;
  private entries = new Map<string, RockViewEntry>();
  private material?: PBRMaterial;
  private readonly variantMaterials = new Map<
    RockVariantAsset,
    Map<boolean, { material: PBRMaterial; release?: () => void; users: number }>
  >();
  private readonly releaseAppearance: Array<() => void> = [];
  private disposed = false;
  private grassCoveragePreview = false;

  constructor(
    private readonly engine: Engine,
    parent: Entity,
    plan: IslandPlan,
    formations: readonly RockFormationMesh[],
    private textureScale = DEFAULT_ROCK_TEXTURE_SCALE,
    private readonly registerGrassAppearance?: (material: PBRMaterial) => () => void,
    private colorBlend: RockColorBlend = readRockColorBlend()
  ) {
    this.root = parent.createChild("Procedural rock formations");
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
      if (formation.variant) {
        this.uploadVariant(entry);
        entry.collider = createRockCollider(this.engine, entity, formation, disabled);
        return entry;
      }
      if (!this.material) {
        this.material = createRockFormationMaterial(this.engine, this.textureScale, this.colorBlend);
        if (this.grassCoveragePreview) this.material.shaderData.setFloat("material_SurfaceCoveragePreview", 1);
        if (this.registerGrassAppearance) {
          this.material.shaderData.enableMacro("MATERIAL_GRASS_SHARED_COLOR_FIELD");
          this.releaseAppearance.push(this.registerGrassAppearance(this.material));
        }
      }
      const surface = uploadRockFormationSurface(this.engine, entity, formation, this.material);
      if (!surface) return entry;
      entry.mesh = surface.mesh;
      entry.buffer = surface.buffer;
      const batch = (entry.batch = new SeedWorldArrayPickBatch(surface.renderer));
      batch.ids = surface.ids;
      batch.count = surface.ids.length;
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
  setTextureScale(textureScale: number): void {
    this.textureScale = textureScale;
    if (this.material) setRockTextureScale(this.material, textureScale);
  }
  setGrassCoveragePreview(enabled: boolean): void {
    this.grassCoveragePreview = enabled;
    if (this.material) this.material.shaderData.setFloat("material_SurfaceCoveragePreview", Number(enabled));
    for (const roles of this.variantMaterials.values())
      for (const { material } of roles.values())
        material.shaderData.setFloat("material_SurfaceCoveragePreview", Number(enabled));
  }
  setColorBlend(settings: RockColorBlend): void {
    this.colorBlend = settings;
    if (this.material) setRockColorBlend(this.material, settings);
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
    entry.mesh?.destroy();
    if (entry.buffer && !entry.buffer.destroyed) entry.buffer.destroy();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) this.release(entry);
    this.entries.clear();
    this.root.destroy();
    for (const release of this.releaseAppearance) release();
    this.releaseAppearance.length = 0;
    this.material?.destroy();
    this.material = undefined;
  }
}
