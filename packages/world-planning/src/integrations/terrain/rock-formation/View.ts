import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Color,
  MeshRenderer,
  PBRMaterial,
  Shader,
  ShaderFactory,
  VertexElement,
  VertexElementFormat,
  type Engine,
  type Entity
} from "@galacean/engine";
import selectionShader from "@galacean/engine-terrain/shaders/shared/WorldSelection.glsl?raw";
import shader from "@galacean/engine-terrain/rock-formation/RockFormation.shader?raw";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import { createRockCollider, disabledRockCollisionOwners } from "./Collider.ts";
import { rockSurfaceAttributes } from "@galacean/engine-terrain/rock-formation/SurfaceAttributes";
import {
  bindPaintedRockMaterial,
  registerRockSurfaceIncludes,
  setPaintedRockTextureScale
} from "./PaintedRockMaterial.ts";
import { DEFAULT_ROCK_TEXTURE_SCALE } from "./Settings.ts";
import { rockFormationPlacements } from "./Placement.ts";
import { readRockColorBlend, SMALL_ROCK_COLOR, type RockColorBlend } from "./ColorPalette.ts";
import { setRockColorBlend } from "./ColorMaterial.ts";

interface RockViewEntry {
  formation: RockFormationMesh;
  smallRock: boolean;
  entity: Entity;
  mesh?: BufferMesh;
  buffer?: Buffer;
  batch?: SeedWorldArrayPickBatch;
  collider?: ReturnType<typeof createRockCollider>;
  collisionKey: string;
}

export interface RockFormationSurface {
  renderer: MeshRenderer;
  mesh: BufferMesh;
  buffer: Buffer;
  ids: string[];
}

/** One rock material for formations and streamed companion surfaces. */
export function createRockFormationMaterial(
  engine: Engine,
  painted = false,
  textureScale = DEFAULT_ROCK_TEXTURE_SCALE,
  colorBlend = readRockColorBlend()
): PBRMaterial {
  if (!ShaderFactory.includeMap["shared/WorldSelection.glsl"])
    ShaderFactory.registerInclude("shared/WorldSelection.glsl", selectionShader);
  const material = new PBRMaterial(engine);
  try {
    registerRockSurfaceIncludes();
    material.shader = Shader.find("SeedWorld/RockSurface") ?? Shader.create(shader);
    material.baseColor = new Color(1, 1, 1, 1);
    material.roughness = 0.88;
    material.metallic = 0;
    material.shaderData.setFloat("material_RockGrassCoveragePreview", 0);
    setRockColorBlend(material, colorBlend);
    bindPaintedRockMaterial(engine, material, textureScale, painted);
    return material;
  } catch (error) {
    material.destroy();
    throw error;
  }
}

/** Upload the generator's triangles without fitting or replacing their geometry.
 * The caller owns the returned mesh/buffer and the entity; materials are borrowed. */
export function uploadRockFormationSurface(
  engine: Engine,
  entity: Entity,
  formation: RockFormationMesh,
  material: PBRMaterial | ((painted: boolean) => PBRMaterial)
): RockFormationSurface | undefined {
  const source = formation.mesh;
  if (!source.indices.length) return undefined;
  const { data, ids, stride, painted, ranges } = rockSurfaceAttributes(formation);
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
    if (painted)
      elements.push(
        new VertexElement("TEXCOORD_2", 40, VertexElementFormat.Vector4, 0),
        new VertexElement("TEXCOORD_3", 56, VertexElementFormat.Vector4, 0),
        new VertexElement("TEXCOORD_4", 72, VertexElementFormat.Vector4, 0),
        new VertexElement("TEXCOORD_5", 88, VertexElementFormat.Vector4, 0),
        new VertexElement("TEXCOORD_6", 104, VertexElementFormat.Vector2, 0),
        new VertexElement("TEXCOORD_7", 112, VertexElementFormat.Vector3, 0)
      );
    mesh.setVertexElements(elements);
    mesh.setVertexBufferBinding(buffer, stride * Float32Array.BYTES_PER_ELEMENT);
    ranges.forEach((range) => mesh.addSubMesh(range.start, range.count));
    mesh.bounds.min.set(minimumX, minimumY, minimumZ);
    mesh.bounds.max.set(maximumX, maximumY, maximumZ);
    renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterials(ranges.map((range) => (typeof material === "function" ? material(range.painted) : material)));
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
  private readonly materials = new Map<boolean, PBRMaterial>();
  private readonly smallRockMaterials = new Map<boolean, PBRMaterial>();
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
    this.root = parent.createChild("Rock formations · Perlin ascent");
    try {
      this.prepareFormations(plan, formations).commit();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private upload(
    formation: RockFormationMesh,
    disabled: ReadonlySet<string>,
    collisionKey: string,
    smallRock: boolean
  ): RockViewEntry {
    const entity = this.root.createChild(`Rock surface · ${formation.id}`);
    entity.isActive = false;
    const entry: RockViewEntry = { formation, entity, collisionKey, smallRock };
    const materials = smallRock ? this.smallRockMaterials : this.materials;
    try {
      const surface = uploadRockFormationSurface(this.engine, entity, formation, (painted) => {
        let material = materials.get(painted);
        if (!material) {
          material = createRockFormationMaterial(
            this.engine,
            painted,
            this.textureScale,
            smallRock ? SMALL_ROCK_COLOR : this.colorBlend
          );
          materials.set(painted, material);
          if (this.grassCoveragePreview) material.shaderData.setFloat("material_RockGrassCoveragePreview", 1);
          if (this.registerGrassAppearance) {
            material.shaderData.enableMacro("MATERIAL_GRASS_SHARED_COLOR_FIELD");
            this.releaseAppearance.push(this.registerGrassAppearance(material));
          }
        }
        return material;
      });
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

  prepareFormations(plan: IslandPlan, formations: readonly RockFormationMesh[]) {
    if (this.disposed) throw Error("Rock formation view disposed");
    const started = performance.now(),
      base = this.entries,
      next = new Map<string, RockViewEntry>(),
      created: RockViewEntry[] = [];
    const disabled = disabledRockCollisionOwners(plan);
    const smallRockIds = new Set(plan.landscapes?.filter((item) => item.kind === "rock").map((item) => item.id));
    try {
      for (const formation of formations) {
        const current = base.get(formation.id);
        const smallRock = smallRockIds.has(formation.id);
        const collisionKey = JSON.stringify([...new Set(formation.owners.filter((id) => disabled.has(id)))].sort());
        if (
          current?.formation === formation &&
          current.collisionKey === collisionKey &&
          current.smallRock === smallRock
        )
          next.set(formation.id, current);
        else {
          const entry = this.upload(formation, disabled, collisionKey, smallRock);
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
  private *allMaterials() {
    yield* this.materials.values();
    yield* this.smallRockMaterials.values();
  }
  setTextureScale(textureScale: number): void {
    this.textureScale = textureScale;
    for (const material of this.allMaterials()) setPaintedRockTextureScale(material, textureScale);
  }
  setGrassCoveragePreview(enabled: boolean): void {
    this.grassCoveragePreview = enabled;
    for (const material of this.allMaterials())
      material.shaderData.setFloat("material_RockGrassCoveragePreview", Number(enabled));
  }
  setColorBlend(settings: RockColorBlend): void {
    this.colorBlend = settings;
    for (const material of this.materials.values()) setRockColorBlend(material, settings);
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
    for (const material of this.allMaterials()) material.destroy();
    this.materials.clear();
    this.smallRockMaterials.clear();
  }
}
