import {
  BoundingBox,
  Camera,
  Entity,
  Material,
  MeshRenderer,
  ModelMesh,
  Script,
  ShaderMacro,
  ShaderProperty,
  Vector3
} from "@galacean/engine";
import {
  createTerrainLodRendererSetScratch,
  TerrainLodGroupRuntime,
  type TerrainLodGroupInstance,
  type TerrainLodRendererSetScratch,
  type TerrainLodRendererSetState
} from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRuntime";
import { AssetStageLabels, ASSET_STAGE_CLEARANCE } from "@galacean/engine-vegetation/asset-assembly/AssetStageLabels";
import {
  layoutAssetAssemblyStands,
  resolveAssetAssemblyLodHeights,
  ASSET_SHOWCASE_COLUMNS,
  VEGETATION_AUTHORING_REFERENCE_SCALE
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyRenderProfile";
import type {
  AssetAssemblySourceLibrary,
  ProductionLodGroupProfile,
  ProductionRenderAtom,
  ProductionPrefabAtom,
  TreeRecipeSource
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import {
  resolveSeedWorldSurfaceDetailTransitionHeights,
  SEED_WORLD_TREE_SOURCE_LOD_INDICES,
  SEED_WORLD_TREE_TERMINAL_DISTANCE_METRES
} from "../../world/SeedWorldRuntimeLodProfile.ts";
import {
  createProceduralTreeFoliageGeometryTuning,
  createProceduralTreeMeshesForLods
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeGenerator";
import {
  ProceduralTreeLeafGpuData,
  type ProceduralTreeLeafGpuFrameScale
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeLeafGpuData";
import {
  configureAssetAssemblyRendererInstance,
  createProceduralBarkPbrMaterial,
  createProceduralLeafPbrMaterial,
  expandProceduralTreeWindBounds,
  resolveProceduralTreeLeafFlutterRadius
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyRuntime";

const PROCEDURAL_TREE_LEAF_BILLBOARD_MACRO = ShaderMacro.getByName("RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD");

const LOD_FADE = ShaderProperty.getByName("renderer_LodFade");
const LOD_DITHER_MACRO = "RENDERER_LOD_DITHER";
const LOD_CROSS_FADE_SECONDS = 0.5;

/** Initialization contract for the exact authored Seed World source inventory. */
export interface AtomicAssetPreviewOptions {
  readonly camera: Camera;
  readonly sourceLibrary: AssetAssemblySourceLibrary;
  readonly shadows: boolean;
}

interface PreviewRenderer {
  readonly renderer: MeshRenderer;
  readonly authoredCastShadows: boolean;
}

interface AtomicInventorySource {
  readonly lods: readonly ProductionRenderAtom[];
  readonly lodGroup?: ProductionLodGroupProfile;
}

interface AtomicPreviewLodPolicy {
  readonly screenRelativeTransitionHeights?: readonly number[];
  readonly terminalDistanceMetres?: number;
}

type InventoryEntry =
  | {
      readonly kind: "tree";
      readonly id: string;
      readonly label: string;
      readonly recipe: TreeRecipeSource;
      readonly group: string;
    }
  | {
      readonly kind: "atom";
      readonly id: string;
      readonly label: string;
      readonly source: AtomicInventorySource;
      readonly lodPolicy?: AtomicPreviewLodPolicy;
      readonly group: string;
    };

interface AtomicPreviewLodBinding {
  readonly id: string;
  readonly root: Entity;
  readonly profile: ProductionLodGroupProfile;
  readonly instance: TerrainLodGroupInstance;
  readonly rendererSets: readonly (readonly PreviewRenderer[])[];
  readonly localReferencePoint: Vector3;
  readonly worldReferencePoint: Vector3;
  readonly cameraOffset: Vector3;
  readonly visibleObservation: { timeSeconds: number; readonly visible: true; screenRelativeHeight: number };
  readonly hiddenObservation: { timeSeconds: number; readonly visible: false };
  readonly rendererSetScratch: TerrainLodRendererSetScratch;
  readonly terminalDistanceMetres?: number;
  activeStates: readonly TerrainLodRendererSetState[];
  activeLodCount: number;
  activeLod0: number;
  activeLod1: number;
}

class AtomicAssetLodRuntime extends Script {
  private _camera: Camera | null = null;
  private _bindings: readonly AtomicPreviewLodBinding[] = [];
  private _shadows = true;
  private _elapsedSeconds = 0;
  private _transitioning = false;
  private _lastCameraPosition: [number, number, number] = [Number.NaN, Number.NaN, Number.NaN];
  private _onLodsChanged: ((id: string, lods: readonly number[]) => void) | null = null;

  initialize(camera: Camera, shadows: boolean, onLodsChanged: (id: string, lods: readonly number[]) => void): void {
    this._camera = camera;
    this._shadows = shadows;
    this._onLodsChanged = onLodsChanged;
  }

  setBindings(bindings: readonly AtomicPreviewLodBinding[]): void {
    this._bindings = bindings;
    this._elapsedSeconds = 0;
    this._lastCameraPosition[0] = Number.NaN;
    this._lastCameraPosition[1] = Number.NaN;
    this._lastCameraPosition[2] = Number.NaN;
    this._apply(true);
  }

  setShadows(enabled: boolean): void {
    this._shadows = enabled;
    for (const binding of this._bindings) this._applyRendererSets(binding, binding.activeStates);
  }

  getActiveLods(): Readonly<Record<string, readonly number[]>> {
    return Object.freeze(
      Object.fromEntries(
        this._bindings.map((binding) => [binding.id, binding.activeStates.map((state) => state.lodIndex)])
      )
    );
  }

  override onUpdate(deltaTime: number): void {
    if (!this._camera || this._bindings.length === 0) return;
    this._elapsedSeconds += deltaTime;
    const position = this._camera.entity.transform.worldPosition;
    const cameraMoved =
      position.x !== this._lastCameraPosition[0] ||
      position.y !== this._lastCameraPosition[1] ||
      position.z !== this._lastCameraPosition[2];
    if (!cameraMoved && !this._transitioning) return;
    this._apply(false);
  }

  private _apply(snap: boolean): void {
    const camera = this._camera;
    if (!camera) return;
    const cameraPosition = camera.entity.transform.worldPosition;
    this._lastCameraPosition[0] = cameraPosition.x;
    this._lastCameraPosition[1] = cameraPosition.y;
    this._lastCameraPosition[2] = cameraPosition.z;
    const isOrthographic = camera.isOrthographic;
    const inverseViewHeight = isOrthographic
      ? 1 / (2 * camera.orthographicSize)
      : 1 / (2 * Math.tan((camera.fieldOfView * Math.PI) / 360));
    let transitioning = false;
    for (let bindingIndex = 0; bindingIndex < this._bindings.length; bindingIndex++) {
      const binding = this._bindings[bindingIndex]!;
      const distanceMetres = updateProjection(binding, cameraPosition, isOrthographic, inverseViewHeight);
      const visible = binding.terminalDistanceMetres === undefined || distanceMetres <= binding.terminalDistanceMetres;
      let states: readonly TerrainLodRendererSetState[];
      if (visible) {
        const observation = binding.visibleObservation;
        observation.timeSeconds = this._elapsedSeconds;
        states = snap
          ? binding.instance.snap(observation)
          : binding.instance.updateInto(observation, binding.rendererSetScratch);
      } else {
        const observation = binding.hiddenObservation;
        observation.timeSeconds = this._elapsedSeconds;
        states = binding.instance.updateInto(observation, binding.rendererSetScratch);
      }
      if (!sameActiveLods(binding, states)) {
        rememberActiveLods(binding, states);
        this._onLodsChanged?.(binding.id, copyLodIndices(states));
      }
      const crossFading = hasCrossFadingState(states);
      if (states !== binding.activeStates || crossFading) this._applyRendererSets(binding, states);
      binding.activeStates = states;
      transitioning ||= crossFading;
    }
    this._transitioning = transitioning;
  }

  private _applyRendererSets(binding: AtomicPreviewLodBinding, states: readonly TerrainLodRendererSetState[]): void {
    for (let setIndex = 0; setIndex < binding.rendererSets.length; setIndex++) {
      const rendererSet = binding.rendererSets[setIndex]!;
      for (let rendererIndex = 0; rendererIndex < rendererSet.length; rendererIndex++) {
        setRendererVisible(rendererSet[rendererIndex]!, false, this._shadows, 1);
      }
    }
    binding.root.isActive = states.length > 0;
    for (let stateIndex = 0; stateIndex < states.length; stateIndex++) {
      const state = states[stateIndex]!;
      const rendererSet = binding.rendererSets[state.lodIndex];
      if (!rendererSet) throw new Error(`Atomic preview selected absent LOD ${state.lodIndex}`);
      for (let rendererIndex = 0; rendererIndex < rendererSet.length; rendererIndex++) {
        setRendererVisible(rendererSet[rendererIndex]!, true, this._shadows, state.signedFade);
      }
    }
  }
}

/** Displays every exact authored asset family currently referenced by Seed World. */
export class AtomicAssetPreview {
  private readonly _owner: Entity;
  private readonly _labels: AssetStageLabels;
  private readonly _lodRuntime: AtomicAssetLodRuntime;
  private readonly _entries: readonly InventoryEntry[];
  private _root: Entity | null = null;
  private _renderers: PreviewRenderer[] = [];
  private _ownedMeshes: ModelMesh[] = [];
  private _ownedMaterials: Material[] = [];
  private readonly _previewMaterials = new Map<Material, Material>();
  private _ownedLeafGpuData: ProceduralTreeLeafGpuData[] = [];
  private _shadows: boolean;
  private _previewBounds = new BoundingBox();

  /**
   * Builds the source-inventory surface and its world-space labels.
   * @param owner Parent entity for every inventory Prefab.
   * @param options Production sources, camera, and scene shadow state.
   */
  constructor(owner: Entity, options: AtomicAssetPreviewOptions) {
    this._owner = owner;
    this._shadows = options.shadows;
    this._entries = createInventoryEntries(options.sourceLibrary);
    this._labels = new AssetStageLabels(
      owner,
      options.camera,
      this._entries.map((entry) => ({ id: entry.id, text: entry.label, x: 0, y: 0.22, z: 0 }))
    );
    const entryLabels = new Map(this._entries.map((entry) => [entry.id, entry.label]));
    this._lodRuntime = owner.addComponent(AtomicAssetLodRuntime);
    this._lodRuntime.initialize(options.camera, options.shadows, (id, lods) => {
      const label = entryLabels.get(id);
      if (!label) throw new Error(`Atomic preview source "${id}" is unavailable`);
      this._labels.setText(id, `${label} · ${formatLodState(lods)}`);
    });
    this._rebuildInventory();
  }

  /** @returns Number of exact Seed World authored source families visible in the inventory. */
  get inventoryCount(): number {
    return this._entries.length;
  }

  getPreviewBounds(): BoundingBox {
    return this._previewBounds.clone();
  }

  /**
   * Changes shadow casting without overriding Prefabs that author shadows off.
   * @param enabled Global Demo shadow state.
   */
  setShadows(enabled: boolean): void {
    this._shadows = enabled;
    this._lodRuntime.setShadows(enabled);
  }

  /** @returns Active authored LOD indices for every Seed World source family. */
  getActiveLods(): Readonly<Record<string, readonly number[]>> {
    return this._lodRuntime.getActiveLods();
  }

  /**
   * Shows or hides the complete inventory labels.
   * @param visible Whether world-space labels remain enabled.
   */
  setLabelsVisible(visible: boolean): void {
    this._labels.setVisible(visible);
  }

  /** Releases instantiated Prefabs and the owned GUI label canvas. */
  destroy(): void {
    this._disposeInstances();
    this._labels.destroy();
  }

  private _instantiateAtom(
    parent: Entity,
    id: string,
    source: AtomicInventorySource,
    centerX: number,
    centerZ: number,
    uniformScale: number,
    floorY = 0,
    lodPolicy?: AtomicPreviewLodPolicy
  ): AtomicPreviewLodBinding {
    const root = parent.createChild(`${id} authored LOD preview`);
    const bounds = productionAtomBounds(source.lods[0]);
    const scale = uniformScale;
    root.transform.setScale(scale, scale, scale);
    root.transform.setPosition(
      centerX - (bounds.min.x + bounds.max.x) * 0.5 * scale,
      floorY - bounds.min.y * scale,
      centerZ - (bounds.min.z + bounds.max.z) * 0.5 * scale
    );
    const rendererSets = source.lods.map((atom) => this._instantiatePrefabRenderers(root, atom));
    return createPreviewLodBinding(id, root, rendererSets, source.lodGroup, lodPolicy);
  }

  private _instantiatePrefabRenderers(parent: Entity, atom: ProductionRenderAtom): readonly PreviewRenderer[] {
    if (!("prefab" in atom)) {
      const bindings = atom.renderers.map((binding) => {
        const entity = parent.createChild(atom.label);
        entity.transform.localMatrix = binding.localMatrix;
        const renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = binding.mesh;
        renderer.setMaterial(this._previewMaterial(binding.material));
        renderer.castShadows = binding.castShadows;
        renderer.receiveShadows = binding.receiveShadows;
        renderer.enableVertexColor = binding.enableVertexColor;
        renderer.shaderData.enableMacro(LOD_DITHER_MACRO);
        renderer.shaderData.setFloat(LOD_FADE, 1);
        return { renderer, authoredCastShadows: binding.castShadows };
      });
      this._renderers.push(...bindings);
      return bindings;
    }
    const instance = (atom as ProductionPrefabAtom).prefab.instantiate();
    if (!instance) throw new Error(`Production Prefab "${atom.id}" could not be instantiated`);
    instance.name = `${atom.label} Prefab preview`;
    parent.addChild(instance);
    const renderers: MeshRenderer[] = [];
    instance.getComponentsIncludeChildren(MeshRenderer, renderers);
    if (renderers.length !== atom.renderers.length) {
      instance.destroy();
      throw new Error(
        `Production Prefab "${atom.id}" preview resolved ${renderers.length} MeshRenderers; expected ${atom.renderers.length}`
      );
    }
    const bindings = renderers.map((renderer) => ({ renderer, authoredCastShadows: renderer.castShadows }));
    this._renderers.push(...bindings);
    for (const { renderer } of bindings) {
      renderer.setMaterial(this._previewMaterial(renderer.getMaterial()!));
      renderer.shaderData.enableMacro(LOD_DITHER_MACRO);
      renderer.shaderData.setFloat(LOD_FADE, 1);
    }
    return bindings;
  }

  private _previewMaterial(source: Material): Material {
    let material = this._previewMaterials.get(source);
    if (!material) {
      material = source.clone();
      // The catalog overview keeps every specimen visible while still switching mesh LODs.
      material.shaderData.setFloat("material_GrassDistanceFadeEnable", 0);
      this._previewMaterials.set(source, material);
      this._ownedMaterials.push(material);
    }
    return material;
  }

  private _disposeInstances(): void {
    this._lodRuntime.setBindings([]);
    this._renderers = [];
    this._root?.destroy();
    this._root = null;
    this._ownedMeshes.forEach((mesh) => mesh.destroy());
    this._ownedMeshes = [];
    this._ownedMaterials.forEach((material) => material.destroy());
    this._ownedMaterials = [];
    this._previewMaterials.clear();
    this._ownedLeafGpuData.forEach((data) => data.destroy());
    this._ownedLeafGpuData = [];
  }

  private _rebuildInventory(): void {
    this._disposeInstances();
    const root = (this._root = this._owner.createChild("Seed World authored asset inventory"));
    const lodBindings: AtomicPreviewLodBinding[] = [];
    for (const entry of this._entries) {
      const position = { x: 0, z: 0 };
      if (entry.kind === "tree") {
        lodBindings.push(this._instantiateTree(root, entry, position.x, position.z));
      } else {
        lodBindings.push(
          this._instantiateAtom(
            root,
            entry.id,
            entry.source,
            position.x,
            position.z,
            entry.group === "rock" ? 1 : VEGETATION_AUTHORING_REFERENCE_SCALE,
            0,
            entry.lodPolicy
          )
        );
      }
    }
    // Each family starts a separate row; real dimensions determine the column pitch and row depth.
    const groups = new Map<string, number[]>();
    this._entries.forEach((entry, index) => {
      const indices = groups.get(entry.group) ?? [];
      indices.push(index);
      groups.set(entry.group, indices);
    });
    const bounds = lodBindings.map((binding) => {
      const renderers = binding.rendererSets.flat();
      const value = renderers[0].renderer.bounds.clone();
      for (const part of renderers.slice(1)) BoundingBox.merge(value, part.renderer.bounds, value);
      return value;
    });
    const serialized = (b: BoundingBox) => ({
      min: [b.min.x, b.min.y, b.min.z] as const,
      max: [b.max.x, b.max.y, b.max.z] as const
    });
    const translate = (index: number, x: number, z: number) => {
      const position = lodBindings[index].root.transform.position;
      lodBindings[index].root.transform.setPosition(position.x + x, position.y, position.z + z);
      const offset = new Vector3(x, 0, z);
      bounds[index].min.add(offset);
      bounds[index].max.add(offset);
    };
    const pack = (indices: readonly number[], front: number) => {
      const translations = layoutAssetAssemblyStands(
        indices.map((index) => serialized(bounds[index])),
        ASSET_STAGE_CLEARANCE,
        ASSET_SHOWCASE_COLUMNS
      );
      indices.forEach((index, slot) => translate(index, translations[slot][0], translations[slot][1] + front));
      return Math.min(...indices.map((index) => bounds[index].min.z));
    };
    const plants: number[] = [];
    let front = 0;
    for (const [group, indices] of [...groups.entries()].reverse()) {
      if (group === "tree" || group === "rock") continue;
      front = pack(indices, front) - ASSET_STAGE_CLEARANCE;
      plants.push(...indices);
    }
    const rocks = groups.get("rock") ?? [];
    if (rocks.length) pack(rocks, 0);
    const regions = [rocks, plants].filter((indices) => indices.length);
    const regionBounds = regions.map((indices) => {
      const merged = bounds[indices[0]].clone();
      for (const index of indices.slice(1)) BoundingBox.merge(merged, bounds[index], merged);
      return serialized(merged);
    });
    layoutAssetAssemblyStands(regionBounds, ASSET_STAGE_CLEARANCE).forEach(([x, z], region) =>
      regions[region].forEach((index) => translate(index, x, z))
    );
    const trees = groups.get("tree") ?? [];
    if (trees.length)
      pack(trees, Math.min(0, ...regions.flat().map((index) => bounds[index].min.z)) - ASSET_STAGE_CLEARANCE);
    bounds.forEach((bound, index) =>
      this._labels.setPosition(
        this._entries[index].id,
        (bound.min.x + bound.max.x) * 0.5,
        bound.max.z + ASSET_STAGE_CLEARANCE * 0.5
      )
    );
    this._previewBounds.copyFrom(bounds[0]);
    for (const bound of bounds.slice(1)) BoundingBox.merge(this._previewBounds, bound, this._previewBounds);
    this._lodRuntime.setBindings(lodBindings);
  }

  private _instantiateTree(
    root: Entity,
    entry: Extract<InventoryEntry, { readonly kind: "tree" }>,
    centerX: number,
    centerZ: number
  ): AtomicPreviewLodBinding {
    const previewRoot = root.createChild(`${entry.id} procedural LOD preview`);
    const runtime = entry.recipe.proceduralRuntime;
    const foliageTuning = runtime
      ? {
          ...createProceduralTreeFoliageGeometryTuning(runtime.leafCardTuning, runtime.billboardTuning),
          lodScales: runtime.foliageLodScales
        }
      : undefined;
    const generatedLods = createProceduralTreeMeshesForLods(
      this._owner.engine,
      entry.recipe,
      SEED_WORLD_TREE_SOURCE_LOD_INDICES,
      runtime?.leafCountTuning,
      runtime?.distributionTuning,
      foliageTuning,
      runtime?.triangleBudget
    );
    const trunkBounds = generatedLods[0].trunk.bounds.clone();
    const crownBounds = generatedLods[0].crown.bounds.clone();
    for (const lod of generatedLods) {
      expandProceduralTreeWindBounds(lod.trunk);
      expandProceduralTreeWindBounds(
        lod.crown,
        resolveProceduralTreeLeafFlutterRadius(lod.leafGpuFrames, lod.leafGpuFrameScale)
      );
    }
    this._ownedMeshes.push(...generatedLods.flatMap((lod) => [lod.trunk, lod.crown]));
    const leafGpuData = new ProceduralTreeLeafGpuData(
      this._owner.engine,
      generatedLods[0].leafGpuFrames,
      `${entry.recipe.label} atomic preview`,
      generatedLods[0].leafNormalField
    );
    this._ownedLeafGpuData.push(leafGpuData);
    const minimumX = Math.min(trunkBounds.min.x, crownBounds.min.x);
    const minimumY = Math.min(trunkBounds.min.y, crownBounds.min.y);
    const minimumZ = Math.min(trunkBounds.min.z, crownBounds.min.z);
    const maximumX = Math.max(trunkBounds.max.x, crownBounds.max.x);
    const maximumY = Math.max(trunkBounds.max.y, crownBounds.max.y);
    const maximumZ = Math.max(trunkBounds.max.z, crownBounds.max.z);
    const scale = VEGETATION_AUTHORING_REFERENCE_SCALE;
    previewRoot.transform.setScale(scale, scale, scale);
    previewRoot.transform.setPosition(
      centerX - (minimumX + maximumX) * 0.5 * scale,
      -minimumY * scale,
      centerZ - (minimumZ + maximumZ) * 0.5 * scale
    );
    const rendererSets: PreviewRenderer[][] = generatedLods.map((lod, lodIndex) => [
      this._instantiateProceduralTreeRenderer(
        previewRoot,
        entry.recipe,
        lod.trunk,
        lod.generatedHeight,
        `trunk LOD${lodIndex}`,
        false
      ),
      this._instantiateProceduralTreeRenderer(
        previewRoot,
        entry.recipe,
        lod.crown,
        lod.generatedHeight,
        `leaf cards LOD${lodIndex}`,
        true,
        leafGpuData,
        lod.leafGpuFrameScale
      )
    ]);
    const treeProfile = {
      ...entry.recipe.lodGroup,
      screenRelativeTransitionHeights: [...entry.recipe.lodGroup.screenRelativeTransitionHeights, 0]
    };
    return createPreviewLodBinding(entry.id, previewRoot, rendererSets, treeProfile, {
      terminalDistanceMetres: SEED_WORLD_TREE_TERMINAL_DISTANCE_METRES
    });
  }

  private _instantiateProceduralTreeRenderer(
    parent: Entity,
    recipe: TreeRecipeSource,
    mesh: ModelMesh,
    generatedHeight: number,
    name: string,
    leafCards: boolean,
    leafGpuData?: ProceduralTreeLeafGpuData,
    leafGpuFrameScale?: ProceduralTreeLeafGpuFrameScale
  ): PreviewRenderer {
    const part = parent.createChild(`${recipe.label} procedural ${name} preview`);
    const renderer = part.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    configureAssetAssemblyRendererInstance(renderer);
    const sourceMaterial = leafCards ? recipe.leafMaterial : recipe.trunkMaterial;
    const material = leafCards
      ? createProceduralLeafPbrMaterial(
          sourceMaterial,
          recipe.leafMask,
          generatedHeight,
          recipe.proceduralRuntime?.preserveLeafMaterialFeatures ?? false
        )
      : createProceduralBarkPbrMaterial(sourceMaterial, generatedHeight);
    material.name = `${sourceMaterial.name} procedural ${leafCards ? "leaf PBR alpha-test" : "bark PBR"} preview`;
    if (leafCards) {
      if (!leafGpuData || !leafGpuFrameScale) throw new Error("Procedural leaf preview requires GPU frame data");
      leafGpuData.bind(renderer, leafGpuFrameScale);
      if (recipe.proceduralRuntime?.leafCardFacingMode === "camera-facing") {
        renderer.shaderData.enableMacro(PROCEDURAL_TREE_LEAF_BILLBOARD_MACRO);
      }
    }
    this._ownedMaterials.push(material);
    renderer.setMaterial(material);
    renderer.receiveShadows = true;
    renderer.enableVertexColor = true;
    renderer.shaderData.enableMacro(LOD_DITHER_MACRO);
    renderer.shaderData.setFloat(LOD_FADE, 1);
    const binding = { renderer, authoredCastShadows: true };
    this._renderers.push(binding);
    return binding;
  }
}

function productionAtomBounds(atom: ProductionRenderAtom): BoundingBox {
  const [first, ...rest] = atom.renderers;
  if (!first) throw new Error(`Production Prefab "${atom.id}" has no renderer bounds`);
  const bounds = first.mesh.bounds.clone().transform(first.localMatrix);
  for (const renderer of rest) {
    const rendererBounds = renderer.mesh.bounds.clone().transform(renderer.localMatrix);
    BoundingBox.merge(bounds, rendererBounds, bounds);
  }
  return bounds;
}

function createPreviewLodBinding(
  id: string,
  root: Entity,
  rendererSets: readonly (readonly PreviewRenderer[])[],
  sourceProfile?: ProductionLodGroupProfile,
  policy: AtomicPreviewLodPolicy = {}
): AtomicPreviewLodBinding {
  const profile: ProductionLodGroupProfile = sourceProfile
    ? {
        localReferencePoint: [...sourceProfile.localReferencePoint],
        size: sourceProfile.size,
        screenRelativeTransitionHeights: resolveAssetAssemblyLodHeights(
          policy.screenRelativeTransitionHeights ?? sourceProfile.screenRelativeTransitionHeights,
          false
        )
      }
    : { localReferencePoint: [0, 0, 0], size: 1, screenRelativeTransitionHeights: [0] };
  if (rendererSets.length !== profile.screenRelativeTransitionHeights.length) {
    throw new Error(`Atomic preview "${id}" renderer sets do not match its authored LOD thresholds`);
  }
  const definition = new TerrainLodGroupRuntime(
    {
      fadeMode: "CrossFade",
      animateCrossFading: true,
      localReferencePoint: [...profile.localReferencePoint] as [number, number, number],
      size: profile.size,
      lods: profile.screenRelativeTransitionHeights.map((screenRelativeTransitionHeight) => ({
        screenRelativeTransitionHeight
      }))
    },
    LOD_CROSS_FADE_SECONDS
  );
  return {
    id,
    root,
    profile,
    instance: definition.createInstance(),
    rendererSets,
    localReferencePoint: new Vector3(...profile.localReferencePoint),
    worldReferencePoint: new Vector3(),
    cameraOffset: new Vector3(),
    visibleObservation: { timeSeconds: 0, visible: true, screenRelativeHeight: 0 },
    hiddenObservation: { timeSeconds: 0, visible: false },
    rendererSetScratch: createTerrainLodRendererSetScratch(),
    terminalDistanceMetres: undefined,
    activeStates: [],
    activeLodCount: 0,
    activeLod0: -1,
    activeLod1: -1
  };
}

function updateProjection(
  binding: AtomicPreviewLodBinding,
  cameraPosition: Vector3,
  isOrthographic: boolean,
  inverseViewHeight: number
): number {
  Vector3.transformCoordinate(
    binding.localReferencePoint,
    binding.root.transform.worldMatrix,
    binding.worldReferencePoint
  );
  const scale = binding.root.transform.lossyWorldScale;
  const worldSize = binding.profile.size * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
  Vector3.subtract(binding.worldReferencePoint, cameraPosition, binding.cameraOffset);
  const distanceMetres = binding.cameraOffset.length();
  binding.visibleObservation.screenRelativeHeight = isOrthographic
    ? worldSize * inverseViewHeight
    : distanceMetres <= Number.EPSILON
      ? Number.MAX_SAFE_INTEGER
      : (worldSize * inverseViewHeight) / distanceMetres;
  return distanceMetres;
}

function setRendererVisible(binding: PreviewRenderer, visible: boolean, shadows: boolean, signedFade: number): void {
  binding.renderer.enabled = visible;
  binding.renderer.castShadows = visible && shadows && binding.authoredCastShadows;
  if (visible) binding.renderer.shaderData.setFloat(LOD_FADE, signedFade);
}

function sameActiveLods(binding: AtomicPreviewLodBinding, states: readonly TerrainLodRendererSetState[]): boolean {
  return (
    binding.activeLodCount === states.length &&
    (states.length < 1 || binding.activeLod0 === states[0]!.lodIndex) &&
    (states.length < 2 || binding.activeLod1 === states[1]!.lodIndex)
  );
}

function rememberActiveLods(binding: AtomicPreviewLodBinding, states: readonly TerrainLodRendererSetState[]): void {
  binding.activeLodCount = states.length;
  binding.activeLod0 = states[0]?.lodIndex ?? -1;
  binding.activeLod1 = states[1]?.lodIndex ?? -1;
}

function copyLodIndices(states: readonly TerrainLodRendererSetState[]): number[] {
  const lods = new Array<number>(states.length);
  for (let index = 0; index < states.length; index++) lods[index] = states[index]!.lodIndex;
  return lods;
}

function hasCrossFadingState(states: readonly TerrainLodRendererSetState[]): boolean {
  for (let index = 0; index < states.length; index++) {
    if (states[index]!.crossFading) return true;
  }
  return false;
}

function formatLodState(lods: readonly number[]): string {
  if (lods.length === 0) return "CULLED";
  return lods.map((lod) => `LOD${lod}`).join(" → ");
}

function createInventoryEntries(sourceLibrary: AssetAssemblySourceLibrary): readonly InventoryEntry[] {
  return Object.freeze([
    ...sourceLibrary.treeRecipes.map(treeEntry),
    atomEntry("shrub", `SHRUB · ${sourceLibrary.shrub.label}`, sourceLibrary.shrub, "shrub"),
    ...sourceLibrary.grassFamily.variants.map((source) =>
      atomEntry(`grass-${source.id}`, `GRASS · ${source.label}`, source, "grass")
    ),
    ...sourceLibrary.flowerFamily.variants.map((source) =>
      atomEntry(`flower-${source.id}`, `FLOWER · ${source.label}`, source, "flower")
    ),
    ...(sourceLibrary.largeRockSurfaceFamilies.grass?.variants ?? []).map((source) =>
      atomEntry(`rock-grass-${source.id}`, `PARENT ROCK · GRASS · ${source.label}`, source, "rock")
    ),
    ...(sourceLibrary.largeRockSurfaceFamilies.mud?.variants ?? []).map((source) =>
      atomEntry(`rock-mud-${source.id}`, `PARENT ROCK · MUD · ${source.label}`, source, "rock")
    ),
    ...(sourceLibrary.stoneFamily?.variants ?? []).map((source) =>
      atomEntry(`stone-${source.id}`, `DEBRIS · ${source.label}`, source, "rock")
    ),
    ...(sourceLibrary.debrisSource
      ? [
          atomEntry(
            "debris-cluster",
            `DEBRIS CLUSTER · ${sourceLibrary.debrisSource.label}`,
            sourceLibrary.debrisSource,
            "rock",
            seedWorldSurfaceDetailLodPolicy(sourceLibrary.debrisSource)
          )
        ]
      : []),
    atomEntry(
      "mushroom",
      `MUSHROOM · ${sourceLibrary.mushroom.label}`,
      sourceLibrary.mushroom,
      "mushroom",
      seedWorldSurfaceDetailLodPolicy(sourceLibrary.mushroom)
    ),
    ...sourceLibrary.lotusFamily.variants.map((source) =>
      atomEntry(
        `lotus-${source.id}`,
        `LAKE SHORE LOTUS · ${source.label}`,
        source,
        "lotus",
        seedWorldSurfaceDetailLodPolicy(source)
      )
    )
  ]);
}

function treeEntry(recipe: TreeRecipeSource): InventoryEntry {
  return {
    kind: "tree",
    id: `tree-${recipe.id}`,
    label: `TREE · ${recipe.label}`,
    recipe,
    group: "tree"
  };
}

function atomEntry(
  id: string,
  label: string,
  source: AtomicInventorySource,
  group: string,
  lodPolicy?: AtomicPreviewLodPolicy
): InventoryEntry {
  return { kind: "atom", id, label, source, lodPolicy, group };
}

function seedWorldSurfaceDetailLodPolicy(source: AtomicInventorySource): AtomicPreviewLodPolicy {
  if (!source.lodGroup) throw new Error("Seed World surface detail requires authored LOD metadata");
  return {
    screenRelativeTransitionHeights: resolveSeedWorldSurfaceDetailTransitionHeights(
      source.lodGroup.screenRelativeTransitionHeights
    )
  };
}
