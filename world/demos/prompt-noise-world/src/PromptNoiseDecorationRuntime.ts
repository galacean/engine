import {
  AssetType,
  type Engine,
  type Entity,
  type GLTFResource,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderFace,
  Renderer,
  type Texture2D
} from "@galacean/engine";
import { Color, Vector3 } from "@galacean/engine-math";
import { createWaterSurfaceSample, type WaterSurfaceProvider } from "@galacean/engine-water/water/runtime/index";
import type { WaterSemanticFieldSnapshotV1 } from "@galacean/engine-water/water/runtime/index";
import { PromptNoiseGenerationWorkerClient } from "./PromptNoiseGenerationWorkerClient.ts";
import type {
  PromptNoiseSceneLayoutV1,
  PromptNoiseScenePlacementKind,
  PromptNoiseScenePlacementV1
} from "./PromptNoiseSceneLayout.ts";
import type { PromptNoiseTerrainProgram } from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";
import type {
  PreparedPromptNoiseSceneRevisionV1,
  PromptNoiseSceneRevisionConsumerV1
} from "./PromptNoiseWorldRevisionCoordinator.ts";

type PromptNoiseDecorationModelKind = Exclude<PromptNoiseScenePlacementKind, "bridge">;

const MODEL_URLS: Readonly<Record<PromptNoiseDecorationModelKind, string>> = Object.freeze({
  tree: new URL("../../../../packages/terrain/src/data/grasslands/public/Models/efd966152697c274.glb", import.meta.url).href,
  shrub: new URL("../../../../packages/terrain/src/data/grasslands/public/Models/6f030beac004c8e7.glb", import.meta.url).href,
  rock: new URL("../../../../packages/terrain/src/data/grasslands/public/Models/094da610ece1906f.glb", import.meta.url).href,
  flower: new URL("../../../../packages/terrain/src/data/grasslands/public/Models/6c6934f5fbae9763.glb", import.meta.url).href,
  grass: new URL("../../../../packages/terrain/src/data/grasslands/public/Models/grass-2-authored.glb", import.meta.url).href
});

const TEXTURE_URLS = Object.freeze({
  treeBark: new URL("../../../../packages/terrain/src/data/grasslands/public/Texture/c7dba986e975bc38.ktx2", import.meta.url).href,
  treeLeaves: new URL("../../../../packages/terrain/src/data/grasslands/public/Texture/989ee6ee7600c0e4.ktx2", import.meta.url).href,
  shrub: new URL("../../../../packages/terrain/src/data/grasslands/public/Texture/c85fafa4b984fdd5.ktx2", import.meta.url).href,
  rock: new URL("../../../../packages/terrain/src/data/grasslands/public/Texture/48f1a2bb394eb4ae.ktx2", import.meta.url).href,
  flower: new URL("../../../../packages/terrain/src/data/grasslands/public/Texture/a00617d5ec5b44ba.ktx2", import.meta.url).href
});

const MODEL_SCALE: Readonly<Record<PromptNoiseDecorationModelKind, number>> = Object.freeze({
  rock: 1.15,
  tree: 0.84,
  shrub: 1.15,
  flower: 0.72,
  grass: 0.82
});

interface DecorationMaterialPalette {
  readonly treeBark: PBRMaterial;
  readonly treeLeaves: PBRMaterial;
  readonly shrub: PBRMaterial;
  readonly rock: PBRMaterial;
  readonly flower: PBRMaterial;
  readonly grass: PBRMaterial;
  readonly bridgeTimber: PBRMaterial;
  readonly bridgeStone: PBRMaterial;
}

export interface PromptNoiseDecorationSnapshotV1 {
  readonly activeRevision: number;
  readonly semanticGeneration: number;
  readonly semanticSourceHash: string;
  readonly layoutHash: string;
  readonly placementCount: number;
  readonly vegetationCount: number;
  readonly ambientRockCount: number;
  readonly riverBankRockCount: number;
  readonly bridgeCount: number;
  readonly treeCount: number;
  readonly detailCount: number;
  readonly prefabCount: number;
  readonly bridgePosition: readonly [x: number, y: number, z: number] | null;
  readonly generatedInstanceBytes: number;
  readonly waterQuerySampleCount: number;
  readonly waterQueryHitCount: number;
  readonly preparedRevisionCount: number;
  readonly retiredRevisionCount: number;
  readonly rolledBackRevisionCount: number;
  readonly liveContentRootCount: 1 | 0;
  readonly destroyed: boolean;
}

/** Prompt-owned C2-D scene consumer; it does not import Showcase controllers or create Water/Terrain geometry. */
export class PromptNoiseDecorationRuntime implements PromptNoiseSceneRevisionConsumerV1 {
  private readonly _models: Readonly<Record<PromptNoiseDecorationModelKind, GLTFResource>>;
  private readonly _materials: DecorationMaterialPalette;
  private readonly _unitCube: ReturnType<typeof PrimitiveMesh.createCuboid>;
  private _contentRoot: Entity;
  private _logicalOrigin: readonly [x: number, z: number] = Object.freeze([0, 0]);
  private _activeLayout?: PromptNoiseSceneLayoutV1;
  private _activeRevision = 0;
  private _bridgePosition: readonly [x: number, y: number, z: number] | null = null;
  private _waterQuerySampleCount = 0;
  private _waterQueryHitCount = 0;
  private _preparedRevisionCount = 0;
  private _retiredRevisionCount = 0;
  private _rolledBackRevisionCount = 0;
  private _destroyed = false;

  private constructor(
    private readonly _engine: Engine,
    private readonly _root: Entity,
    models: Readonly<Record<PromptNoiseDecorationModelKind, GLTFResource>>,
    materials: DecorationMaterialPalette,
    private readonly _worker: PromptNoiseGenerationWorkerClient,
    private readonly _waterQuery: WaterSurfaceProvider
  ) {
    this._models = models;
    this._materials = materials;
    this._unitCube = PrimitiveMesh.createCuboid(_engine, 1, 1, 1);
    this._contentRoot = _root.createChild("active-decoration-revision-0");
  }

  /** Loads reusable Prompt assets before the runtime participates in world transactions. */
  static async create(
    engine: Engine,
    root: Entity,
    worker: PromptNoiseGenerationWorkerClient,
    waterQuery: WaterSurfaceProvider
  ): Promise<PromptNoiseDecorationRuntime> {
    const [tree, shrub, rock, flower, grass, materials] = await Promise.all([
      loadModel(engine, MODEL_URLS.tree),
      loadModel(engine, MODEL_URLS.shrub),
      loadModel(engine, MODEL_URLS.rock),
      loadModel(engine, MODEL_URLS.flower),
      loadModel(engine, MODEL_URLS.grass),
      createMaterialPalette(engine)
    ]);
    return new PromptNoiseDecorationRuntime(
      engine,
      root,
      Object.freeze({ tree, shrub, rock, flower, grass }),
      materials,
      worker,
      waterQuery
    );
  }

  async prepare(
    program: PromptNoiseTerrainProgram,
    semanticField: WaterSemanticFieldSnapshotV1,
    revision: number,
    signal: AbortSignal
  ): Promise<PreparedPromptNoiseSceneRevisionV1> {
    this._assertActive();
    const layout = await this._worker.generateSceneLayout(program.recipe, semanticField);
    throwIfAborted(signal);
    if (
      layout.semanticGeneration !== semanticField.generation ||
      layout.semanticSourceHash !== semanticField.sourceHash
    ) {
      throw new Error("Prompt decoration layout does not match the staged Semantic Field generation.");
    }
    const nextRoot = this._root.createChild(`staging-decoration-revision-${revision}`);
    nextRoot.isActive = false;
    this._applyLogicalOrigin(nextRoot);
    const bridges = new Map<string, Entity>();
    try {
      for (const placement of layout.placements) {
        const entity =
          placement.kind === "bridge"
            ? this._instantiateBridge(nextRoot, placement)
            : this._instantiateModel(nextRoot, placement);
        if (placement.kind === "bridge") bridges.set(placement.id, entity);
      }
    } catch (error) {
      nextRoot.destroy();
      throw error;
    }
    throwIfAborted(signal, () => nextRoot.destroy());
    this._preparedRevisionCount++;
    let active = true;
    return Object.freeze({
      revision,
      audit: layout.audit,
      publish: () => {
        if (!active) return;
        active = false;
        this._applyLogicalOrigin(nextRoot);
        this._applySparseWaterQueries(layout, bridges);
        nextRoot.isActive = true;
        const previousRoot = this._contentRoot;
        this._contentRoot = nextRoot;
        this._activeLayout = layout;
        this._activeRevision = revision;
        if (!this._bridgePosition) {
          const bridge = layout.placements.find(({ role }) => role === "bridge");
          this._bridgePosition = bridge ? Object.freeze([...bridge.position] as [number, number, number]) : null;
        }
        previousRoot.destroy();
        this._retiredRevisionCount++;
      },
      rollback: () => {
        if (!active) return;
        active = false;
        this._rolledBackRevisionCount++;
        nextRoot.destroy();
      }
    });
  }

  /** Floating Origin only changes the active scene root; logical placement/hash stay stable. */
  setLogicalOrigin(logicalOrigin: readonly [x: number, z: number]): void {
    this._assertActive();
    this._logicalOrigin = Object.freeze([logicalOrigin[0], logicalOrigin[1]] as const);
    this._applyLogicalOrigin(this._contentRoot);
  }

  getSnapshot(): PromptNoiseDecorationSnapshotV1 {
    const layout = this._activeLayout;
    const treeCount = layout?.placements.filter(({ kind }) => kind === "tree").length ?? 0;
    const detailCount =
      layout?.placements.filter(
        ({ kind }) => kind === "shrub" || kind === "flower" || kind === "grass" || kind === "rock"
      ).length ?? 0;
    return Object.freeze({
      activeRevision: this._activeRevision,
      semanticGeneration: layout?.semanticGeneration ?? 0,
      semanticSourceHash: layout?.semanticSourceHash ?? "empty-prompt-decoration-layout-v1",
      layoutHash: layout?.layoutHash ?? "0000000000000000",
      placementCount: layout?.placements.length ?? 0,
      vegetationCount: layout?.vegetationCount ?? 0,
      ambientRockCount: layout?.ambientRockCount ?? 0,
      riverBankRockCount: layout?.riverBankRockCount ?? 0,
      bridgeCount: layout?.bridgeCount ?? 0,
      treeCount,
      detailCount,
      prefabCount: layout?.bridgeCount ?? 0,
      bridgePosition: this._bridgePosition,
      generatedInstanceBytes: layout?.transientBytes ?? 0,
      waterQuerySampleCount: this._waterQuerySampleCount,
      waterQueryHitCount: this._waterQueryHitCount,
      preparedRevisionCount: this._preparedRevisionCount,
      retiredRevisionCount: this._retiredRevisionCount,
      rolledBackRevisionCount: this._rolledBackRevisionCount,
      liveContentRootCount: this._destroyed ? 0 : 1,
      destroyed: this._destroyed
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._contentRoot.destroy();
    this._root.destroy();
    this._unitCube.destroy();
    for (const material of Object.values(this._materials)) material.destroy();
    this._activeLayout = undefined;
    this._bridgePosition = null;
  }

  private _instantiateModel(parent: Entity, placement: PromptNoiseScenePlacementV1): Entity {
    if (placement.kind === "bridge") throw new Error("Bridge placement requires the Prompt prefab builder.");
    const entity = this._models[placement.kind].instantiateSceneRoot();
    entity.name = placement.id;
    entity.transform.setPosition(...placement.position);
    entity.transform.setRotation(0, (placement.rotationYRadians * 180) / Math.PI, 0);
    const categoryScale = MODEL_SCALE[placement.kind];
    entity.transform.setScale(
      placement.scale[0] * categoryScale,
      placement.scale[1] * categoryScale,
      placement.scale[2] * categoryScale
    );
    const renderers: Renderer[] = [];
    entity.getComponentsIncludeChildren(Renderer, renderers);
    for (const renderer of renderers) {
      renderer.castShadows = placement.kind !== "grass" && placement.kind !== "flower";
      renderer.receiveShadows = true;
      if (placement.kind === "grass" && renderer instanceof MeshRenderer) renderer.enableVertexColor = true;
      if (placement.kind === "tree") {
        renderer.setMaterial(0, this._materials.treeBark);
        renderer.setMaterial(1, this._materials.treeLeaves);
      } else {
        renderer.setMaterial(this._materials[placement.kind]);
      }
    }
    disablePrototypeLodDuplicates(entity);
    parent.addChild(entity);
    return entity;
  }

  private _instantiateBridge(parent: Entity, placement: PromptNoiseScenePlacementV1): Entity {
    const bridge = parent.createChild(placement.id);
    bridge.transform.setPosition(...placement.position);
    bridge.transform.setRotation(0, (placement.rotationYRadians * 180) / Math.PI, 0);
    const [length, deckHeight, width] = placement.scale;
    this._createBridgePart(bridge, "timber-deck", [0, 0, 0], [length, deckHeight, width], this._materials.bridgeTimber);
    this._createBridgePart(
      bridge,
      "left-rail",
      [0, deckHeight * 0.5 + 0.58, -width * 0.43],
      [length, 0.16, 0.14],
      this._materials.bridgeTimber
    );
    this._createBridgePart(
      bridge,
      "right-rail",
      [0, deckHeight * 0.5 + 0.58, width * 0.43],
      [length, 0.16, 0.14],
      this._materials.bridgeTimber
    );
    for (const side of [-1, 1] as const) {
      this._createBridgePart(
        bridge,
        `stone-abutment-${side}`,
        [side * length * 0.46, -0.72, 0],
        [1.2, 1.7, width * 1.05],
        this._materials.bridgeStone
      );
    }
    return bridge;
  }

  private _createBridgePart(
    bridge: Entity,
    name: string,
    position: readonly [number, number, number],
    scale: readonly [number, number, number],
    material: PBRMaterial
  ): void {
    const part = bridge.createChild(name);
    part.transform.setPosition(...position);
    part.transform.setScale(...scale);
    const renderer = part.addComponent(MeshRenderer);
    renderer.mesh = this._unitCube;
    renderer.setMaterial(material);
    renderer.castShadows = true;
    renderer.receiveShadows = true;
  }

  private _applySparseWaterQueries(layout: PromptNoiseSceneLayoutV1, bridges: ReadonlyMap<string, Entity>): void {
    const position = new Vector3();
    const sample = createWaterSurfaceSample();
    this._bridgePosition = null;
    for (const placement of layout.placements) {
      if (placement.role !== "bridge") continue;
      const bridge = bridges.get(placement.id);
      if (!bridge) continue;
      this._waterQuerySampleCount++;
      position.set(placement.position[0], placement.position[1], placement.position[2]);
      if (!this._waterQuery.sampleSurface(position, sample)) continue;
      if (placement.waterBodyId && sample.waterBodyId !== placement.waterBodyId) continue;
      this._waterQueryHitCount++;
      bridge.transform.setPosition(placement.position[0], sample.surfacePosition.y + 1.15, placement.position[2]);
      this._bridgePosition = Object.freeze([
        placement.position[0],
        sample.surfacePosition.y + 1.15,
        placement.position[2]
      ] as const);
    }
  }

  private _applyLogicalOrigin(root: Entity): void {
    root.transform.setPosition(-this._logicalOrigin[0], 0, -this._logicalOrigin[1]);
  }

  private _assertActive(): void {
    if (this._destroyed) throw new Error("PromptNoiseDecorationRuntime has been destroyed.");
  }
}

async function loadModel(engine: Engine, url: string): Promise<GLTFResource> {
  return engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url });
}

async function createMaterialPalette(engine: Engine): Promise<DecorationMaterialPalette> {
  const [treeBark, treeLeaves, shrub, rock, flower, grass] = await Promise.all([
    createMaterial(engine, TEXTURE_URLS.treeBark, new Color(0.374, 0.247, 0.198, 1), 0, 0.85, false),
    createMaterial(engine, TEXTURE_URLS.treeLeaves, new Color(0.28, 0.72, 0.2, 1), 0.2, 0.9, true),
    createMaterial(engine, TEXTURE_URLS.shrub, new Color(0.24, 0.7, 0.22, 1), 0.35, 0.85, true),
    createMaterial(engine, TEXTURE_URLS.rock, new Color(0.82, 0.8, 0.75, 1), 0, 0.84, false),
    createMaterial(engine, TEXTURE_URLS.flower, new Color(0.8, 1, 0.72, 1), 0.15, 0.8, true),
    createMaterial(engine, null, new Color(0.3, 0.78, 0.26, 1), 0, 0.9, true)
  ]);
  const bridgeTimber = new PBRMaterial(engine);
  bridgeTimber.name = "Prompt river bridge timber";
  bridgeTimber.baseColor = new Color(0.31, 0.19, 0.095, 1);
  bridgeTimber.roughness = 0.86;
  bridgeTimber.metallic = 0;
  const bridgeStone = new PBRMaterial(engine);
  bridgeStone.name = "Prompt river bridge stone";
  bridgeStone.baseColor = new Color(0.42, 0.43, 0.39, 1);
  bridgeStone.roughness = 0.92;
  bridgeStone.metallic = 0;
  return Object.freeze({ treeBark, treeLeaves, shrub, rock, flower, grass, bridgeTimber, bridgeStone });
}

async function createMaterial(
  engine: Engine,
  textureUrl: string | null,
  baseColor: Color,
  alphaCutoff: number,
  roughness: number,
  doubleSided: boolean
): Promise<PBRMaterial> {
  const material = new PBRMaterial(engine);
  if (textureUrl) {
    material.baseTexture = await engine.resourceManager.load<Texture2D>({ type: AssetType.KTX2, url: textureUrl });
  }
  material.baseColor = baseColor;
  material.alphaCutoff = alphaCutoff;
  material.roughness = roughness;
  material.metallic = 0;
  material.renderFace = doubleSided ? RenderFace.Double : RenderFace.Front;
  return material;
}

function disablePrototypeLodDuplicates(entity: Entity): void {
  const pending = [...entity.children];
  while (pending.length > 0) {
    const child = pending.pop()!;
    if (/_LOD\d+$/iu.test(child.name)) child.isActive = false;
    pending.push(...child.children);
  }
}

function throwIfAborted(signal: AbortSignal, cleanup?: () => void): void {
  if (!signal.aborted) return;
  cleanup?.();
  throw new DOMException("Prompt decoration revision is stale.", "AbortError");
}
