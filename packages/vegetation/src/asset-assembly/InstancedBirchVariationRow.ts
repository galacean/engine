import {
  BoundingBox,
  Entity,
  Material,
  MeshRenderer,
  ModelMesh,
  ShaderMacro,
  ShaderProperty,
  Texture2D,
  Vector3,
  Vector4
} from "@galacean/engine";
import type { AssetSeedColor } from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import {
  INSTANCED_BIRCH_VARIATION_LIMITS,
  type InstancedBirchVariationControls
} from "./ProceduralTreeVariationControls";
export {
  INSTANCED_BIRCH_VARIATION_LIMITS,
  type InstancedBirchVariationControls
} from "./ProceduralTreeVariationControls";
import { resolveAssetAppearanceTint } from "./AssetAppearance";
import type { TreeLeafLightingTuning } from "./AssetAssemblyPresetFactory";
import type { TreeRecipeSource } from "./AssetAssemblySourceLibrary";
import {
  createProceduralTreeFoliageGeometryTuning,
  createProceduralTreeMeshes,
  type ProceduralTreeDistributionTuning
} from "./ProceduralTreeGenerator";
import { detachTreeDistributionTuning } from "./ProceduralTreeDistributionToken";
import { ProceduralTreeLeafGpuData, type ProceduralTreeLeafGpuFrameScale } from "./ProceduralTreeLeafGpuData";
import {
  DEFAULT_PROCEDURAL_TREE_CANOPY_OCCLUSION_TUNING,
  type ProceduralTreeCanopyOcclusionTuning
} from "./ProceduralTreeCanopyOcclusion";
import {
  configureAssetAssemblyRendererInstance,
  configureLeafLightingTuning,
  configureProceduralLeafMaterial,
  configureProceduralTreeCanopyOcclusionMaterial,
  configureProceduralTreeWindMaterial,
  createProceduralBarkPbrMaterial,
  createProceduralLeafPbrMaterial,
  createProceduralLeafVertexNormalMaterial,
  createProceduralRawLeafCardMaterial,
  expandProceduralTreeWindBounds,
  resolveProceduralTreeLeafFlutterRadius,
  resolveProceduralTreeWindScaleCompensation,
  type ProceduralTreeLeafDisplayMode
} from "./TreeAssemblyRuntime";

const PROCEDURAL_TREE_LEAF_BILLBOARD_MACRO = ShaderMacro.getByName("RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD");
const PROCEDURAL_TREE_GPU_VARIATION_MACRO = ShaderMacro.getByName("RENDERER_PROCEDURAL_TREE_GPU_VARIATION");
const PROCEDURAL_TREE_GPU_BRANCH_VARIATION_MACRO = ShaderMacro.getByName(
  "RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION"
);
const ASSET_ASSEMBLY_COLOR = ShaderProperty.getByName("renderer_AssetAssemblyColor");
const PROCEDURAL_TREE_VARIATION = ShaderProperty.getByName("renderer_ProceduralTreeVariation");
const PROCEDURAL_TREE_LEAF_COLOR = ShaderProperty.getByName("renderer_ProceduralTreeLeafColor");
const PROCEDURAL_TREE_BRANCH_SHAPE = ShaderProperty.getByName("renderer_ProceduralTreeBranchShape");

const ROW_WIDTH_METERS = 22;
const ROW_DEPTH_METERS = -8;
/** Extends non-trunk foliage toward the branch roots instead of leaving every card at the tips. */
const BRANCH_FOLIAGE_START_SCALE = 0.45;
const BRANCH_TERMINAL_FOLIAGE_SCALE = 0.5;
const MINIMUM_BRANCH_FOLIAGE_PROGRESS_EXPONENT = 1.25;
const UINT32_RANGE = 0x1_0000_0000;

export interface InstancedBirchVariation {
  readonly position: readonly [x: number, y: number, z: number];
  readonly yawRadians: number;
  readonly scale: readonly [x: number, y: number, z: number];
  readonly branchLengthScale: number;
  readonly leafDensity: number;
  readonly leafSizeScale: number;
  readonly trunkThicknessScale: number;
  readonly branchDensity: number;
  /** Signed yaw curvature magnitude accumulated per source-space meter of a primary-branch subtree. */
  readonly branchCurvatureRadiansPerMeter: number;
  readonly branchDirectionSeed: number;
  readonly leafColorRgb: AssetSeedColor;
  readonly barkColorMultiplier: readonly [red: number, green: number, blue: number];
}

/** Horizontal source-space footprint used to keep validation trees physically disjoint. */
export interface InstancedBirchVariationFootprint {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Position-independent version of the tuned Asset Assembly tree set consumed by world populations. */
export interface InstancedBirchPopulationVariation {
  readonly yawRadians: number;
  readonly horizontalScale: number;
  readonly verticalScale: number;
  readonly branchLengthScale: number;
  readonly leafDensity: number;
  readonly leafSizeScale: number;
  readonly trunkThicknessScale: number;
  readonly branchDensity: number;
  readonly branchCurvatureRadiansPerMeter: number;
  readonly branchDirectionSeed: number;
  readonly leafColorRgb: AssetSeedColor;
  readonly barkColorMultiplier: readonly [red: number, green: number, blue: number];
}

/** Conservative GPU-deformation extent shared by preview bounds and world-population Cell culling. */
export function instancedBirchVariationSilhouetteScale(
  variation: Pick<InstancedBirchPopulationVariation, "branchLengthScale" | "leafSizeScale" | "trunkThicknessScale">
): number {
  return Math.max(1, variation.branchLengthScale, variation.leafSizeScale, variation.trunkThicknessScale);
}

/**
 * Expands one generated tree's local bounds for every GPU shape variation which shares that Mesh.
 * The result remains a single-tree bound; instance positions never participate in it.
 */
export function createInstancedBirchVariationLocalBounds(
  source: BoundingBox,
  variations: readonly Pick<
    InstancedBirchPopulationVariation,
    "branchLengthScale" | "leafSizeScale" | "trunkThicknessScale"
  >[]
): BoundingBox {
  const scale = Math.max(1, ...variations.map(instancedBirchVariationSilhouetteScale));
  return new BoundingBox(
    new Vector3(
      Math.min(source.min.x, source.min.x * scale),
      Math.min(source.min.y, source.min.y * scale),
      Math.min(source.min.z, source.min.z * scale)
    ),
    new Vector3(
      Math.max(source.max.x, source.max.x * scale),
      Math.max(source.max.y, source.max.y * scale),
      Math.max(source.max.z, source.max.z * scale)
    )
  );
}

/** Complete authored inputs needed to project the editable trees into a world-population variation catalog. */
export interface InstancedBirchPopulationVariationCatalogOptions {
  readonly controls?: readonly InstancedBirchVariationControls[];
  /** Assembly Token appearance used by the unmodified source entry. */
  readonly baseAppearanceColor?: AssetSeedColor;
}

/** No authored row variants remain; consumers retain their own recipe's base instance. */
export const INSTANCED_BIRCH_AUTHORED_VARIATION_CONTROLS: readonly InstancedBirchVariationControls[] = Object.freeze(
  []
);
export const INSTANCED_BIRCH_VARIATION_COUNT = INSTANCED_BIRCH_AUTHORED_VARIATION_CONTROLS.length;
export const INSTANCED_BIRCH_POPULATION_VARIATION_COUNT = INSTANCED_BIRCH_VARIATION_COUNT + 1;

export interface InstancedBirchVariationRowDiagnostics {
  readonly instances: typeof INSTANCED_BIRCH_VARIATION_COUNT;
  /** One logical variation set is reused by every material pass. */
  readonly instanceSets: 1;
  readonly sharedGeometryPairs: 1;
  /** Bark and alpha-tested foliage cannot share one render pipeline. */
  readonly materialPasses: 2;
  /** The runtime owns no aggregate instance buffer; the Engine builds generic instance UBOs after culling. */
  readonly instanceBuffers: 0;
  readonly sharedMaterialObjects: 4;
  readonly perInstanceColor: true;
  readonly gpuShapeParameters: true;
  readonly gpuBranchDirection: true;
  readonly gpuBranchCount: true;
  readonly authoredLeafTexture: boolean;
  /** Exact persisted distribution used to build this row's shared trunk and crown meshes. */
  readonly sharedGeometryDistributionTuning: ProceduralTreeDistributionTuning;
  /** Reserved non-overlapping position of the selected recipe's unmodified base tree. */
  readonly baseTreeStageOrigin: readonly [x: number, y: number, z: number];
  readonly variations: readonly InstancedBirchVariationControls[];
}

interface InstancedPart {
  readonly renderers: readonly MeshRenderer[];
}

interface InstancedBirchSourceMeshes {
  readonly trunk: ModelMesh;
  readonly crown: ModelMesh;
  readonly generatedHeight: number;
  readonly leafFlutterRadius: number;
  readonly leafGpuData: ProceduralTreeLeafGpuData;
  readonly leafGpuFrameScale: ProceduralTreeLeafGpuFrameScale;
}

/**
 * Keeps the row positions orderly and the hidden branch-direction channel deterministic while applying the
 * authored variation appearance. Every entry is an ordinary renderer sharing the same source vertices.
 */
export function createInstancedBirchVariationLayout(
  controls: readonly InstancedBirchVariationControls[] = INSTANCED_BIRCH_AUTHORED_VARIATION_CONTROLS
): readonly InstancedBirchVariation[] {
  validateInstancedBirchVariationControls(controls);
  return Object.freeze(
    controls.map((control, index) => {
      const progress = controls.length > 1 ? index / (controls.length - 1) : 0.5;
      return Object.freeze({
        position: [-ROW_WIDTH_METERS * 0.5 + ROW_WIDTH_METERS * progress, 0, ROW_DEPTH_METERS] as const,
        yawRadians: degreesToRadians(control.yawDegrees),
        // Apply the modest authored width change to the whole instance so woody
        // centerlines and leaf anchors stay in the same coordinate system.
        scale: [control.horizontalScale, control.verticalScale, control.horizontalScale] as const,
        branchLengthScale: control.branchLengthScale,
        leafDensity: control.leafDensity,
        leafSizeScale: control.leafSizeScale,
        trunkThicknessScale: control.trunkThicknessScale ?? 1,
        branchDensity: control.branchDensity,
        branchCurvatureRadiansPerMeter: degreesToRadians(control.branchCurvatureDegreesPerMeter),
        branchDirectionSeed: stableRandomUnit(index, "branch-direction"),
        leafColorRgb: [...control.leafColorRgb] as AssetSeedColor,
        barkColorMultiplier: control.barkColorRgb.map(srgb8ToLinear) as [number, number, number]
      });
    })
  );
}

/**
 * Packs the validation row from each variation's conservative transformed footprint.
 *
 * Branch reach expands the generated footprint, while leaf-size variation adds only the
 * generated card reach around its pivot instead of scaling the entire crown. Adjacent trees
 * receive one source-card reach of empty space, keeping the row compact but disjoint.
 */
export function separateInstancedBirchVariationLayout(
  variations: readonly InstancedBirchVariation[],
  sourceFootprint: InstancedBirchVariationFootprint,
  treeUniformScale: number,
  sourceLeafCardReach: number
): readonly InstancedBirchVariation[] {
  validateInstancedBirchVariationFootprint(sourceFootprint);
  if (!(treeUniformScale > 0) || !Number.isFinite(treeUniformScale)) {
    throw new RangeError("Instanced birch row scale must be finite and positive");
  }
  if (sourceLeafCardReach < 0 || !Number.isFinite(sourceLeafCardReach)) {
    throw new RangeError("Instanced birch source leaf-card reach must be finite and non-negative");
  }
  if (variations.length === 0) return [];

  const clearance = sourceLeafCardReach * treeUniformScale;
  const intervals = variations.map((variation) =>
    instancedBirchVariationWorldXInterval(variation, sourceFootprint, treeUniformScale, sourceLeafCardReach)
  );
  const positions: number[] = [];
  let rightEdge = 0;
  intervals.forEach(([minimum, maximum], index) => {
    const positionX = index === 0 ? -minimum : rightEdge + clearance - minimum;
    positions.push(positionX);
    rightEdge = positionX + maximum;
  });
  const leftEdge = positions[0] + intervals[0][0];
  const center = (leftEdge + rightEdge) * 0.5;
  return variations.map((variation, index) =>
    Object.freeze({
      ...variation,
      position: [positions[index] - center, variation.position[1], ROW_DEPTH_METERS] as const
    })
  );
}

/** Complete horizontal packing shared by the unmodified base tree and its editable variations. */
export function separateInstancedBirchVariationLayoutWithBaseTree(
  variations: readonly InstancedBirchVariation[],
  sourceFootprint: InstancedBirchVariationFootprint,
  treeUniformScale: number,
  sourceLeafCardReach: number
): {
  readonly variations: readonly InstancedBirchVariation[];
  readonly baseTreeStageOrigin: readonly [x: number, y: number, z: number];
} {
  const separated = separateInstancedBirchVariationLayout(
    variations,
    sourceFootprint,
    treeUniformScale,
    sourceLeafCardReach
  );
  if (separated.length === 0) {
    return { variations: separated, baseTreeStageOrigin: [0, 0, ROW_DEPTH_METERS] };
  }

  const intervals = separated.map((variation) => {
    const [minimum, maximum] = instancedBirchVariationWorldXInterval(
      variation,
      sourceFootprint,
      treeUniformScale,
      sourceLeafCardReach
    );
    return [variation.position[0] + minimum, variation.position[0] + maximum] as const;
  });
  const rowLeftEdge = Math.min(...intervals.map(([minimum]) => minimum));
  const rowRightEdge = Math.max(...intervals.map(([, maximum]) => maximum));
  const sourceRadius =
    Math.hypot(
      Math.max(Math.abs(sourceFootprint.minX), Math.abs(sourceFootprint.maxX)),
      Math.max(Math.abs(sourceFootprint.minZ), Math.abs(sourceFootprint.maxZ))
    ) * treeUniformScale;
  const clearance = sourceLeafCardReach * treeUniformScale;
  const uncenteredBaseX = rowLeftEdge - clearance - sourceRadius;
  const groupLeftEdge = uncenteredBaseX - sourceRadius;
  const groupCenter = (groupLeftEdge + rowRightEdge) * 0.5;

  return {
    variations: separated.map((variation) =>
      Object.freeze({
        ...variation,
        position: [variation.position[0] - groupCenter, variation.position[1], variation.position[2]] as const
      })
    ),
    baseTreeStageOrigin: [uncenteredBaseX - groupCenter, 0, ROW_DEPTH_METERS]
  };
}

/**
 * Returns the unmodified measured source followed by the tuned row trees without preview-only positions.
 * All scale values stay in the generated mesh's source space so every world consumer receives the same transforms
 * as Asset Assembly. Seed World's Producer scale remains an independent world-placement multiplier.
 */
export function createInstancedBirchPopulationVariationCatalog(
  recipe: TreeRecipeSource,
  options: InstancedBirchPopulationVariationCatalogOptions = {}
): readonly InstancedBirchPopulationVariation[] {
  const runtime = recipe.proceduralRuntime;
  if (!runtime) {
    throw new Error("Procedural-tree population variations require a reconstructed runtime recipe");
  }
  const baseAppearanceColor = options.baseAppearanceColor ?? recipe.defaultColorRgb;
  const identity = createTreePopulationIdentityVariation(recipe, baseAppearanceColor);
  const base: InstancedBirchPopulationVariation = Object.freeze({
    ...identity,
    // The GPU variation leaf channel carries a final governed albedo rather than a multiplier.
    leafColorRgb: [...baseAppearanceColor] as AssetSeedColor
  });
  return Object.freeze([
    base,
    ...createInstancedBirchVariationLayout(options.controls ?? INSTANCED_BIRCH_AUTHORED_VARIATION_CONTROLS).map(
      (variation): InstancedBirchPopulationVariation =>
        Object.freeze({
          yawRadians: variation.yawRadians,
          horizontalScale: variation.scale[0],
          verticalScale: variation.scale[1],
          branchLengthScale: variation.branchLengthScale,
          leafDensity: variation.leafDensity,
          leafSizeScale: variation.leafSizeScale,
          trunkThicknessScale: variation.trunkThicknessScale,
          branchDensity: variation.branchDensity,
          branchCurvatureRadiansPerMeter: variation.branchCurvatureRadiansPerMeter,
          branchDirectionSeed: variation.branchDirectionSeed,
          leafColorRgb: variation.leafColorRgb,
          barkColorMultiplier: variation.barkColorMultiplier
        })
    )
  ]);
}

/** One undeformed recipe entry carrying the exact Assembly Token appearance into world populations. */
export function createTreePopulationIdentityVariation(
  recipe: TreeRecipeSource,
  appearanceColor: AssetSeedColor
): InstancedBirchPopulationVariation {
  if (!recipe.proceduralRuntime) {
    throw new Error("Procedural-tree population variations require a reconstructed runtime recipe");
  }
  const tint = resolveAssetAppearanceTint(appearanceColor, recipe.defaultColorRgb);
  return Object.freeze({
    yawRadians: 0,
    horizontalScale: 1,
    verticalScale: 1,
    branchLengthScale: 1,
    leafDensity: 1,
    leafSizeScale: 1,
    trunkThicknessScale: 1,
    branchDensity: 1,
    branchCurvatureRadiansPerMeter: 0,
    branchDirectionSeed: 0,
    leafColorRgb: [linearToSrgb8(tint[0]), linearToSrgb8(tint[1]), linearToSrgb8(tint[2])] as AssetSeedColor,
    barkColorMultiplier: [...tint] as [number, number, number]
  });
}

/**
 * The reconstructed source intentionally matches tip-heavy Unity foliage. The variation row stretches and removes
 * whole branch subtrees, which amplifies that source distribution into long bare spans. Keep the source topology and
 * card budget, but redistribute the row's existing cards over more of each primary branch and twig.
 */
export function createInstancedBirchFoliageDistribution(
  source: ProceduralTreeDistributionTuning
): ProceduralTreeDistributionTuning {
  return {
    ...source,
    // The measured recipe permits a long invisible petiole offset. Enlarging the
    // billboard cards turns that source-space gap into isolated floating leaf islands, so
    // this variation row keeps every card root on its supporting branch centerline.
    leafAnchorOffsetPercentOfHeight: 0,
    leafAnchorOffsetVariationPercent: 0,
    leafStartProgressPercentByLevel: scaleNonTrunkLevels(
      source.leafStartProgressPercentByLevel,
      BRANCH_FOLIAGE_START_SCALE
    ),
    leafStartProgressMinimumPercentByLevel: scaleNonTrunkLevels(
      source.leafStartProgressMinimumPercentByLevel,
      BRANCH_FOLIAGE_START_SCALE
    ),
    leafStartProgressMaximumPercentByLevel: scaleNonTrunkLevels(
      source.leafStartProgressMaximumPercentByLevel,
      BRANCH_FOLIAGE_START_SCALE
    ),
    leafTerminalFractionPercentByLevel: scaleNonTrunkLevels(
      source.leafTerminalFractionPercentByLevel,
      BRANCH_TERMINAL_FOLIAGE_SCALE
    ),
    leafProgressExponentByLevel: transformNonTrunkLevels(source.leafProgressExponentByLevel, (value) =>
      Math.max(value, MINIMUM_BRANCH_FOLIAGE_PROGRESS_EXPONENT)
    )
  };
}

/** One shared maximum-topology procedural-tree mesh pair rendered as a row of GPU variations. */
export class InstancedBirchVariationRow {
  private readonly _root: Entity;
  private readonly _recipe: TreeRecipeSource;
  private readonly _defaultLayout: readonly InstancedBirchVariation[];
  private readonly _layout: InstancedBirchVariation[];
  private readonly _instanceRoots: readonly Entity[];
  private _trunkMesh: ModelMesh;
  private _crownMesh: ModelMesh;
  private _leafGpuData: ProceduralTreeLeafGpuData;
  private _leafGpuFrameScale: ProceduralTreeLeafGpuFrameScale;
  private _trunkBaseBounds: BoundingBox;
  private _crownBaseBounds: BoundingBox;
  private _leafFlutterRadius: number;
  private _distributionTuning: ProceduralTreeDistributionTuning;
  private readonly _trunkMaterial: Material;
  private readonly _leafMaterial: Material;
  private readonly _rawLeafMaterial: Material;
  private readonly _vertexNormalLeafMaterial: Material;
  private _leafDisplayMode: ProceduralTreeLeafDisplayMode = "material";
  private _trunk: InstancedPart;
  private _crown: InstancedPart;
  private _shadows: boolean;
  private readonly _treeUniformScale: number;
  private _baseTreeStageOrigin: readonly [x: number, y: number, z: number];
  private _barkBaseTint: readonly [number, number, number] = [1, 1, 1];

  constructor(
    owner: Entity,
    recipe: TreeRecipeSource,
    leafLightingTuning: TreeLeafLightingTuning,
    colorRgb: AssetSeedColor,
    distributionTuning: ProceduralTreeDistributionTuning,

    shadows: boolean,
    treeUniformScale = 1
  ) {
    if (!recipe.proceduralRuntime) {
      throw new Error("Instanced tree variation row requires a procedural runtime recipe");
    }
    if (!(treeUniformScale > 0) || !Number.isFinite(treeUniformScale)) {
      throw new RangeError("Instanced birch variation row uniform scale must be finite and positive");
    }
    this._root = owner.createChild(`Instanced ${recipe.id} scale and color row`);
    this._recipe = recipe;
    this._shadows = shadows;
    this._treeUniformScale = treeUniformScale;

    const runtime = recipe.proceduralRuntime;
    const authoredLayout = createInstancedBirchVariationLayout();
    this._distributionTuning = detachTreeDistributionTuning(distributionTuning);

    const sourceMeshes = this._createSourceMeshes(this._distributionTuning);
    this._trunkMesh = sourceMeshes.trunk;
    this._crownMesh = sourceMeshes.crown;
    this._leafGpuData = sourceMeshes.leafGpuData;
    this._leafGpuFrameScale = sourceMeshes.leafGpuFrameScale;
    this._trunkBaseBounds = this._trunkMesh.bounds.clone();
    this._crownBaseBounds = this._crownMesh.bounds.clone();
    this._leafFlutterRadius = sourceMeshes.leafFlutterRadius;
    this._trunkMaterial = createProceduralBarkPbrMaterial(recipe.trunkMaterial, sourceMeshes.generatedHeight);
    const sceneLayout = separateInstancedBirchVariationLayoutWithBaseTree(
      authoredLayout,
      mergeInstancedBirchVariationFootprints(this._trunkBaseBounds, this._crownBaseBounds),
      this._treeUniformScale,
      maximumInstancedBirchLeafCardReach(this._leafGpuData)
    );
    this._defaultLayout = sceneLayout.variations;
    this._baseTreeStageOrigin = sceneLayout.baseTreeStageOrigin;
    this._layout = [...this._defaultLayout];
    this._instanceRoots = this._layout.map((_, index) => this._root.createChild(`${recipe.id} ${index}`));
    this._leafMaterial = createProceduralLeafPbrMaterial(
      recipe.leafMaterial,
      recipe.leafMask,
      sourceMeshes.generatedHeight,
      runtime.preserveLeafMaterialFeatures ?? false,
      DEFAULT_PROCEDURAL_TREE_CANOPY_OCCLUSION_TUNING
    );
    this._rawLeafMaterial = createProceduralRawLeafCardMaterial(recipe.leafMaterial);
    this._vertexNormalLeafMaterial = createProceduralLeafVertexNormalMaterial(recipe.leafMaterial);
    configureLeafLightingTuning(this._leafMaterial, leafLightingTuning);

    this._syncBounds();
    this._trunk = this._createPart("trunk", this._trunkMesh, false);
    this._crown = this._createPart("crown", this._crownMesh, true);
    this.setColor(colorRgb);
    this.setShadows(shadows);
  }

  setVisible(visible: boolean): void {
    this._root.isActive = visible;
  }

  setInstanceVisible(index: number, visible: boolean): void {
    this._instanceRoots[index].isActive = visible;
  }

  getInstanceTriangleCount(): number {
    return (this._trunkMesh.subMesh!.count + this._crownMesh.subMesh!.count) / 3;
  }

  getInstanceRenderers(index: number): readonly MeshRenderer[] {
    return this._instanceRoots[index].getComponentsIncludeChildren(MeshRenderer, []);
  }

  /** Position reserved by the shared footprint packer for the unmodified base tree. */
  getBaseTreeStageOrigin(): readonly [x: number, y: number, z: number] {
    return [...this._baseTreeStageOrigin];
  }

  /** Authored stand footprint, measured per variation rather than the shared worst-case culling envelope. */
  getPreviewBounds(): BoundingBox {
    const instances = this.getPreviewInstanceBounds();
    const bounds = instances[0]?.clone() ?? new BoundingBox(new Vector3(), new Vector3());
    for (const instance of instances.slice(1)) BoundingBox.merge(bounds, instance, bounds);
    return bounds;
  }

  /** Individual geometry footprints for the authoring showcase's measured grid. */
  getPreviewInstanceBounds(): readonly BoundingBox[] {
    const source = mergeInstancedBirchVariationFootprints(this._trunkBaseBounds, this._crownBaseBounds);
    const leafReach = maximumInstancedBirchLeafCardReach(this._leafGpuData);
    const sourceMinY = Math.min(this._trunkBaseBounds.min.y, this._crownBaseBounds.min.y);
    const sourceMaxY = Math.max(this._trunkBaseBounds.max.y, this._crownBaseBounds.max.y);
    const offset = this._root.transform.position;
    return this._layout.map((variation) => {
      const x = instancedBirchVariationWorldXInterval(variation, source, this._treeUniformScale, leafReach);
      const z = instancedBirchVariationWorldXInterval(
        { ...variation, yawRadians: variation.yawRadians + Math.PI * 0.5 },
        source,
        this._treeUniformScale,
        leafReach
      );
      const verticalScale = variation.scale[1] * this._treeUniformScale;
      const reachScale = Math.max(1, variation.branchLengthScale);
      const leafExpansion = Math.max(variation.leafSizeScale - 1, 0) * leafReach * verticalScale;
      return new BoundingBox(
        new Vector3(
          offset.x + variation.position[0] + x[0],
          offset.y + variation.position[1] + sourceMinY * reachScale * verticalScale - leafExpansion,
          offset.z + variation.position[2] + z[0]
        ),
        new Vector3(
          offset.x + variation.position[0] + x[1],
          offset.y + variation.position[1] + sourceMaxY * reachScale * verticalScale + leafExpansion,
          offset.z + variation.position[2] + z[1]
        )
      );
    });
  }

  /** Scene-only translations; authored scale, geometry, colors, and species parameters stay intact. */
  translatePreviewInstances(translations: readonly (readonly [number, number])[]): void {
    if (translations.length !== this._layout.length || translations.some((value) => !value.every(Number.isFinite))) {
      throw new RangeError("Tree preview translations must match the variation count and be finite");
    }
    this._layout.forEach((variation, index) => {
      const [x, z] = translations[index];
      this._layout[index] = {
        ...variation,
        position: [variation.position[0] + x, variation.position[1], variation.position[2] + z]
      };
      this._syncRenderer(index);
    });
  }

  /** Updates renderer-group colors; the Engine packs them into its generic instance UBO at draw time. */
  setColor(colorRgb: AssetSeedColor): void {
    this._barkBaseTint = resolveAssetAppearanceTint(colorRgb, this._recipe.defaultColorRgb);
    this._layout.forEach((_, index) => this._syncRenderer(index));
  }

  /** Updates one ordinary renderer pair while retaining the shared source meshes and materials. */
  setVariation(index: number, controls: InstancedBirchVariationControls): void {
    validateVariationIndex(index);
    validateVariationControls(controls);
    const current = this._layout[index];
    this._layout[index] = applyInstancedBirchVariationControls(current, controls, this._barkBaseTint);
    this._relayoutVariations();
    this._syncBounds();
    this._layout.forEach((_, variationIndex) => this._syncRenderer(variationIndex));
  }

  /** Restores the selected stable-random record without disturbing edits made to the other six trees. */
  resetVariation(index: number): void {
    validateVariationIndex(index);
    this._layout[index] = this._defaultLayout[index];
    this._relayoutVariations();
    this._syncBounds();
    this._layout.forEach((_, variationIndex) => this._syncRenderer(variationIndex));
  }

  /** Keeps this row's owned leaf material aligned with the active tree Population Token. */
  setLeafLightingTuning(tuning: TreeLeafLightingTuning): void {
    configureLeafLightingTuning(this._leafMaterial, tuning);
  }

  /** Borrows the base tree's active leaf texture for all shared-material crowns. */
  setLeafTexture(texture: Texture2D): void {
    configureProceduralLeafMaterial(this._leafMaterial, texture);
  }

  setCanopyOcclusionTuning(tuning: ProceduralTreeCanopyOcclusionTuning): void {
    configureProceduralTreeCanopyOcclusionMaterial(this._leafMaterial, tuning);
  }

  /** Keeps all variation crowns on the same inspection surface as the unmodified base tree. */
  setLeafDisplayMode(mode: ProceduralTreeLeafDisplayMode): void {
    if (mode !== "material" && mode !== "raw-cards" && mode !== "vertex-normals") {
      throw new RangeError(`Unknown procedural leaf display mode ${mode}`);
    }
    this._leafDisplayMode = mode;
    const material = this._activeLeafMaterial();
    this._crown.renderers.forEach((renderer) => renderer.setMaterial(material));
  }

  /** Rebuilds the one shared topology pair while retaining all renderer transforms and colors. */
  setDistributionTuning(tuning: ProceduralTreeDistributionTuning): void {
    const nextTuning = detachTreeDistributionTuning(tuning);
    const nextMeshes = this._createSourceMeshes(nextTuning);
    const previousTrunkMesh = this._trunkMesh;
    const previousCrownMesh = this._crownMesh;
    const previousLeafGpuData = this._leafGpuData;
    this._trunkMesh = nextMeshes.trunk;
    this._crownMesh = nextMeshes.crown;
    this._leafGpuData = nextMeshes.leafGpuData;
    this._leafGpuFrameScale = nextMeshes.leafGpuFrameScale;
    this._leafFlutterRadius = nextMeshes.leafFlutterRadius;
    configureProceduralTreeWindMaterial(this._trunkMaterial, nextMeshes.generatedHeight, false);
    configureProceduralTreeWindMaterial(this._leafMaterial, nextMeshes.generatedHeight, true);
    this._trunkBaseBounds = nextMeshes.trunk.bounds.clone();
    this._crownBaseBounds = nextMeshes.crown.bounds.clone();
    this._relayoutVariations();
    this._syncBounds();
    this._trunk.renderers.forEach((renderer) => (renderer.mesh = this._trunkMesh));
    this._crown.renderers.forEach((renderer) => {
      renderer.mesh = this._crownMesh;
      this._leafGpuData.bind(renderer, this._leafGpuFrameScale);
    });
    this._layout.forEach((_, index) => this._syncRenderer(index));
    this._distributionTuning = nextTuning;

    previousTrunkMesh.destroy();
    previousCrownMesh.destroy();
    previousLeafGpuData.destroy();
  }

  setShadows(enabled: boolean): void {
    this._shadows = enabled;
    this._trunk.renderers.forEach((renderer) => (renderer.castShadows = enabled));
    this._crown.renderers.forEach((renderer) => (renderer.castShadows = enabled));
  }

  getDiagnostics(): InstancedBirchVariationRowDiagnostics {
    return {
      instances: INSTANCED_BIRCH_VARIATION_COUNT,
      instanceSets: 1,
      sharedGeometryPairs: 1,
      materialPasses: 2,
      instanceBuffers: 0,
      sharedMaterialObjects: 4,
      perInstanceColor: true,
      gpuShapeParameters: true,
      gpuBranchDirection: true,
      gpuBranchCount: true,
      authoredLeafTexture: this._leafMaterial.shaderData.getTexture("material_BaseTexture") === this._recipe.leafMask,
      sharedGeometryDistributionTuning: detachTreeDistributionTuning(this._distributionTuning),
      baseTreeStageOrigin: this.getBaseTreeStageOrigin(),
      variations: this._layout.map((variation) => variationControls(variation, this._barkBaseTint))
    };
  }

  destroy(): void {
    for (const part of [this._trunk, this._crown]) {
      part.renderers.forEach((renderer) => {
        renderer.mesh = null!;
        renderer.setMaterials([]);
      });
    }
    this._trunkMesh.destroy();
    this._crownMesh.destroy();
    this._leafGpuData.destroy();
    this._trunkMaterial.destroy();
    this._leafMaterial.destroy();
    this._rawLeafMaterial.destroy();
    this._vertexNormalLeafMaterial.destroy();
    this._root.destroy();
  }

  private _createPart(name: string, sourceMesh: ModelMesh, crown: boolean): InstancedPart {
    const renderers = this._instanceRoots.map((root) => {
      const renderer = root.createChild(name).addComponent(MeshRenderer);
      renderer.mesh = sourceMesh;
      renderer.setMaterial(crown ? this._activeLeafMaterial() : this._trunkMaterial);
      renderer.receiveShadows = true;
      renderer.enableVertexColor = true;
      configureAssetAssemblyRendererInstance(renderer);
      renderer.shaderData.enableMacro(PROCEDURAL_TREE_GPU_VARIATION_MACRO);
      renderer.shaderData.setVector4(ASSET_ASSEMBLY_COLOR, new Vector4(1, 1, 1, 1));
      renderer.shaderData.setVector4(PROCEDURAL_TREE_VARIATION, new Vector4(1, 1, 1, 0));
      renderer.shaderData.setVector4(PROCEDURAL_TREE_LEAF_COLOR, new Vector4(1, 1, 1, 1));
      renderer.shaderData.setVector4(PROCEDURAL_TREE_BRANCH_SHAPE, new Vector4(0, 1, 0, 0));
      if (crown) {
        this._leafGpuData.bind(renderer, this._leafGpuFrameScale);
        if (this._recipe.proceduralRuntime?.leafCardFacingMode === "camera-facing") {
          renderer.shaderData.enableMacro(PROCEDURAL_TREE_LEAF_BILLBOARD_MACRO);
        }
      } else {
        renderer.shaderData.enableMacro(PROCEDURAL_TREE_GPU_BRANCH_VARIATION_MACRO);
      }
      return renderer;
    });
    return { renderers };
  }

  private _activeLeafMaterial(): Material {
    return this._leafDisplayMode === "material"
      ? this._leafMaterial
      : this._leafDisplayMode === "raw-cards"
        ? this._rawLeafMaterial
        : this._vertexNormalLeafMaterial;
  }

  private _createSourceMeshes(tuning: ProceduralTreeDistributionTuning): InstancedBirchSourceMeshes {
    const runtime = this._recipe.proceduralRuntime!;
    const foliageTuning = {
      ...createProceduralTreeFoliageGeometryTuning(runtime.leafCardTuning, runtime.billboardTuning),
      lodScales: runtime.foliageLodScales
    };
    const generatedLods = createProceduralTreeMeshes(
      this._root.engine,
      this._recipe,
      runtime.leafCountTuning,
      tuning,
      foliageTuning,
      runtime.triangleBudget
    );
    try {
      const leafGpuData = new ProceduralTreeLeafGpuData(
        this._root.engine,
        generatedLods[0].leafGpuFrames,
        `${this._recipe.label} Asset Assembly variation row`,
        generatedLods[0].leafNormalField
      );
      const sourceMeshes = {
        trunk: generatedLods[0].trunk,
        crown: generatedLods[0].crown,
        generatedHeight: generatedLods[0].generatedHeight,
        leafFlutterRadius: resolveProceduralTreeLeafFlutterRadius(
          generatedLods[0].leafGpuFrames,
          generatedLods[0].leafGpuFrameScale
        ),
        leafGpuData,
        leafGpuFrameScale: generatedLods[0].leafGpuFrameScale
      };
      generatedLods.slice(1).forEach((lod) => {
        lod.trunk.destroy();
        lod.crown.destroy();
      });
      return sourceMeshes;
    } catch (error) {
      generatedLods.forEach((lod) => {
        lod.trunk.destroy();
        lod.crown.destroy();
      });
      throw error;
    }
  }

  /** Keeps one conservative tree-local bound shared by every ordinary renderer. */
  private _syncBounds(): void {
    const windScaleCompensation = resolveProceduralTreeWindScaleCompensation(
      this._layout.map((variation) => variation.scale)
    );
    const maximumLeafSizeScale = Math.max(1, ...this._layout.map((variation) => variation.leafSizeScale));
    this._trunkMesh.bounds = createInstancedBirchVariationLocalBounds(this._trunkBaseBounds, this._layout);
    this._crownMesh.bounds = createInstancedBirchVariationLocalBounds(this._crownBaseBounds, this._layout);
    expandProceduralTreeWindBounds(this._trunkMesh, 0, windScaleCompensation);
    expandProceduralTreeWindBounds(
      this._crownMesh,
      this._leafFlutterRadius * maximumLeafSizeScale,
      windScaleCompensation
    );
  }

  private _relayoutVariations(): void {
    const sceneLayout = separateInstancedBirchVariationLayoutWithBaseTree(
      this._layout,
      mergeInstancedBirchVariationFootprints(this._trunkBaseBounds, this._crownBaseBounds),
      this._treeUniformScale,
      maximumInstancedBirchLeafCardReach(this._leafGpuData)
    );
    sceneLayout.variations.forEach((variation, index) => (this._layout[index] = variation));
    this._baseTreeStageOrigin = sceneLayout.baseTreeStageOrigin;
  }

  private _syncRenderer(index: number): void {
    const variation = this._layout[index];
    const root = this._instanceRoots[index];
    root.transform.setPosition(...variation.position);
    root.transform.setRotationQuaternion(
      0,
      Math.sin(variation.yawRadians * 0.5),
      0,
      Math.cos(variation.yawRadians * 0.5)
    );
    root.transform.setScale(
      variation.scale[0] * this._treeUniformScale,
      variation.scale[1] * this._treeUniformScale,
      variation.scale[2] * this._treeUniformScale
    );
    const trunk = this._trunk.renderers[index];
    const crown = this._crown.renderers[index];
    // A sub-100% branch control is a woody tip prune: foliage remains in its authored position.
    // Values above 100% retain the existing whole-subtree growth behavior.
    const crownBranchLengthScale = variation.branchLengthScale < 1 ? 1 : variation.branchLengthScale;
    const barkRed = clamp01(this._barkBaseTint[0] * variation.barkColorMultiplier[0]);
    const barkGreen = clamp01(this._barkBaseTint[1] * variation.barkColorMultiplier[1]);
    const barkBlue = clamp01(this._barkBaseTint[2] * variation.barkColorMultiplier[2]);
    for (const renderer of [trunk, crown]) {
      setRendererVector4(renderer, ASSET_ASSEMBLY_COLOR, barkRed, barkGreen, barkBlue, 1);
      setRendererVector4(
        renderer,
        PROCEDURAL_TREE_VARIATION,
        renderer === trunk ? variation.branchLengthScale : crownBranchLengthScale,
        variation.leafDensity,
        variation.leafSizeScale,
        variation.branchDirectionSeed
      );
      setRendererVector4(
        renderer,
        PROCEDURAL_TREE_LEAF_COLOR,
        srgb8ToLinear(variation.leafColorRgb[0]),
        srgb8ToLinear(variation.leafColorRgb[1]),
        srgb8ToLinear(variation.leafColorRgb[2]),
        1
      );
      setRendererVector4(
        renderer,
        PROCEDURAL_TREE_BRANCH_SHAPE,
        variation.branchCurvatureRadiansPerMeter,
        variation.branchDensity,
        variation.trunkThicknessScale,
        0
      );
    }
  }
}

/** Applies every artist-facing shape control to one stable tree record without changing its row identity or seed. */
export function applyInstancedBirchVariationControls(
  current: InstancedBirchVariation,
  controls: InstancedBirchVariationControls,
  barkBaseTint: readonly [number, number, number]
): InstancedBirchVariation {
  validateVariationControls(controls);
  return Object.freeze({
    ...current,
    yawRadians: degreesToRadians(controls.yawDegrees),
    // Horizontal scale is an instance-space whole-mesh transform: trunk, branches,
    // leaf anchors, and cards remain in one coordinate system.
    scale: [controls.horizontalScale, controls.verticalScale, controls.horizontalScale] as const,
    branchLengthScale: controls.branchLengthScale,
    leafDensity: controls.leafDensity,
    leafSizeScale: controls.leafSizeScale,
    trunkThicknessScale: controls.trunkThicknessScale ?? current.trunkThicknessScale,
    branchDensity: controls.branchDensity,
    branchCurvatureRadiansPerMeter: degreesToRadians(controls.branchCurvatureDegreesPerMeter),
    leafColorRgb: [controls.leafColorRgb[0], controls.leafColorRgb[1], controls.leafColorRgb[2]] as AssetSeedColor,
    barkColorMultiplier: controls.barkColorRgb.map((channel, colorChannel) => {
      const desiredLinear = srgb8ToLinear(channel);
      const base = barkBaseTint[colorChannel];
      return base > Number.EPSILON ? desiredLinear / base : desiredLinear;
    }) as [number, number, number]
  });
}

function setRendererVector4(
  renderer: MeshRenderer,
  property: ShaderProperty,
  x: number,
  y: number,
  z: number,
  w: number
): void {
  renderer.shaderData.getVector4(property).set(x, y, z, w);
}

function variationControls(
  variation: InstancedBirchVariation,
  barkBaseTint: readonly [number, number, number]
): InstancedBirchVariationControls {
  return {
    horizontalScale: variation.scale[0],
    verticalScale: variation.scale[1],
    yawDegrees: radiansToDegrees(variation.yawRadians),
    branchLengthScale: variation.branchLengthScale,
    leafDensity: variation.leafDensity,
    leafSizeScale: variation.leafSizeScale,
    trunkThicknessScale: variation.trunkThicknessScale,
    branchDensity: variation.branchDensity,
    branchCurvatureDegreesPerMeter: radiansToDegrees(variation.branchCurvatureRadiansPerMeter),
    leafColorRgb: [variation.leafColorRgb[0], variation.leafColorRgb[1], variation.leafColorRgb[2]],
    barkColorRgb: [
      linearToSrgb8(clamp01(barkBaseTint[0] * variation.barkColorMultiplier[0])),
      linearToSrgb8(clamp01(barkBaseTint[1] * variation.barkColorMultiplier[1])),
      linearToSrgb8(clamp01(barkBaseTint[2] * variation.barkColorMultiplier[2]))
    ]
  };
}

function validateVariationIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= INSTANCED_BIRCH_VARIATION_COUNT) {
    throw new RangeError(`Instanced birch index must be between 0 and ${INSTANCED_BIRCH_VARIATION_COUNT - 1}`);
  }
}

/** Validates one complete persisted tree-variation control set at the owning variation boundary. */
export function validateInstancedBirchVariationControls(controls: readonly InstancedBirchVariationControls[]): void {
  controls.forEach(validateVariationControls);
}

function validateVariationControls(controls: InstancedBirchVariationControls): void {
  validateVariationNumber(
    "Horizontal scale",
    controls.horizontalScale,
    INSTANCED_BIRCH_VARIATION_LIMITS.horizontalScale
  );
  validateVariationNumber("Vertical scale", controls.verticalScale, INSTANCED_BIRCH_VARIATION_LIMITS.verticalScale);
  validateVariationNumber("Yaw", controls.yawDegrees, INSTANCED_BIRCH_VARIATION_LIMITS.yawDegrees);
  validateVariationNumber(
    "Branch length scale",
    controls.branchLengthScale,
    INSTANCED_BIRCH_VARIATION_LIMITS.branchLengthScale
  );
  validateVariationNumber("Leaf density", controls.leafDensity, INSTANCED_BIRCH_VARIATION_LIMITS.leafDensity);
  validateVariationNumber("Leaf size", controls.leafSizeScale, INSTANCED_BIRCH_VARIATION_LIMITS.leafSizeScale);
  if (controls.trunkThicknessScale !== undefined) {
    validateVariationNumber(
      "Trunk thickness",
      controls.trunkThicknessScale,
      INSTANCED_BIRCH_VARIATION_LIMITS.trunkThicknessScale
    );
  }
  validateVariationNumber("Branch density", controls.branchDensity, INSTANCED_BIRCH_VARIATION_LIMITS.branchDensity);
  validateVariationNumber(
    "Branch curvature",
    controls.branchCurvatureDegreesPerMeter,
    INSTANCED_BIRCH_VARIATION_LIMITS.branchCurvatureDegreesPerMeter
  );
  validateAssetSeedColor("Leaf color", controls.leafColorRgb);
  validateAssetSeedColor("Bark color", controls.barkColorRgb);
}

function instancedBirchVariationWorldXInterval(
  variation: InstancedBirchVariation,
  source: InstancedBirchVariationFootprint,
  treeUniformScale: number,
  sourceLeafCardReach: number
): readonly [minimum: number, maximum: number] {
  const branchReachScale = Math.max(1, variation.branchLengthScale);
  const horizontalScale = variation.scale[0] * treeUniformScale;
  const minimumX = source.minX * horizontalScale * branchReachScale;
  const maximumX = source.maxX * horizontalScale * branchReachScale;
  const minimumZ = source.minZ * horizontalScale * branchReachScale;
  const maximumZ = source.maxZ * horizontalScale * branchReachScale;
  const cosine = Math.cos(variation.yawRadians);
  const sine = Math.sin(variation.yawRadians);
  const projected = [
    cosine * minimumX + sine * minimumZ,
    cosine * minimumX + sine * maximumZ,
    cosine * maximumX + sine * minimumZ,
    cosine * maximumX + sine * maximumZ
  ];
  const leafExpansion = Math.max(variation.leafSizeScale - 1, 0) * sourceLeafCardReach * horizontalScale;
  return [Math.min(...projected) - leafExpansion, Math.max(...projected) + leafExpansion];
}

function maximumInstancedBirchLeafCardReach(leafGpuData: ProceduralTreeLeafGpuData): number {
  return leafGpuData.frames.reduce((maximum, frame) => Math.max(maximum, Math.hypot(frame.width, frame.height)), 0);
}

function mergeInstancedBirchVariationFootprints(
  trunkBounds: BoundingBox,
  crownBounds: BoundingBox
): InstancedBirchVariationFootprint {
  return {
    minX: Math.min(trunkBounds.min.x, crownBounds.min.x),
    maxX: Math.max(trunkBounds.max.x, crownBounds.max.x),
    minZ: Math.min(trunkBounds.min.z, crownBounds.min.z),
    maxZ: Math.max(trunkBounds.max.z, crownBounds.max.z)
  };
}

function validateInstancedBirchVariationFootprint(footprint: InstancedBirchVariationFootprint): void {
  const values = [footprint.minX, footprint.maxX, footprint.minZ, footprint.maxZ];
  if (!values.every(Number.isFinite) || !(footprint.maxX > footprint.minX) || !(footprint.maxZ > footprint.minZ)) {
    throw new RangeError("Instanced birch source footprint must contain finite positive X/Z extents");
  }
}

function validateVariationNumber(label: string, value: number, range: readonly [number, number]): void {
  if (!Number.isFinite(value) || value < range[0] || value > range[1]) {
    throw new RangeError(`${label} must be between ${range[0]} and ${range[1]}; received ${value}`);
  }
}

function validateAssetSeedColor(label: string, color: AssetSeedColor): void {
  if (color.length !== 3 || color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    throw new RangeError(`${label} must contain three sRGB8 channels`);
  }
}

/** FNV-1a plus an integer avalanche turns an instance/channel pair into a reproducible uniform sample. */
function stableRandomUnit(index: number, channel: string): number {
  let hash = 0x811c9dc5;
  const key = `${channel}:${index}`;
  for (let characterIndex = 0; characterIndex < key.length; characterIndex++) {
    hash ^= key.charCodeAt(characterIndex);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / UINT32_RANGE;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function srgb8ToLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb8(channel: number): number {
  const srgb = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(clamp01(srgb) * 255);
}

function scaleNonTrunkLevels(
  values: readonly [trunk: number, branches: number, twigs: number] | undefined,
  scale: number
): readonly [trunk: number, branches: number, twigs: number] | undefined {
  return transformNonTrunkLevels(values, (value) => value * scale);
}

function transformNonTrunkLevels(
  values: readonly [trunk: number, branches: number, twigs: number] | undefined,
  transform: (value: number) => number
): readonly [trunk: number, branches: number, twigs: number] | undefined {
  return values ? [values[0], transform(values[1]), transform(values[2])] : undefined;
}
