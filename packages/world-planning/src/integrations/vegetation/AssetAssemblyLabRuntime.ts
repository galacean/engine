import {
  resolveTreeStructureRecipe,
  withTreeStructureParameters
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeStructureToken";
import {
  editProceduralTreeLeafFold,
  editProceduralTreeStructureParameters,
  treeStructureStemNodes,
  treeStructureLeafNodes
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeGenerator";
import { BoundingBox, Camera, Entity, MeshRenderer, Texture2D } from "@galacean/engine";
import {
  detachPopulationToken,
  type AssetCategory,
  type PopulationTokenV1,
  type TreePopulationTokenV1
} from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import { assetPopulationMetrics } from "@galacean/engine-vegetation/asset-assembly/AssetPopulation";
import {
  ASSET_STAGE_CATEGORIES,
  ASSET_STAGE_CLEARANCE,
  AssetStageLabels
} from "@galacean/engine-vegetation/asset-assembly/AssetStageLabels";
import {
  createDefaultPopulationToken,
  resolveTreeLeafLightingTuning,
  validatePopulationTokenSource,
  withTreeBillboardTuning,
  withTreeLeafCardTuning,
  withTreeLeafCountTuning,
  withTreeLeafLightingTuning,
  withTreeLeafMask,
  withTreeTrunkMaterialTuning,
  type TreeBillboardTuning,
  type TreeLeafCardTuning,
  type TreeLeafCountTuning,
  type TreeLeafLightingTuning,
  type TreeLeafMaskId,
  type TreeTrunkMaterialTuning
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyPresetFactory";
import { addMissingPlantSizeVariants } from "@galacean/engine-vegetation/asset-assembly/PlantExhibitionInstances";
import { AtomicAssetPreview } from "./AtomicAssetPreview.ts";
import type {
  PlantExhibitionStand,
  ProceduralPlantLibraryRuntime
} from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantLibraryRuntime";
import type {
  AssetAssemblySourceLibrary,
  TreeRecipeSource
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import { TREE_SPECIES_CATALOG } from "@galacean/engine-vegetation/asset-assembly/TreeSpeciesCatalog";
import {
  InstancedBirchVariationRow,
  INSTANCED_BIRCH_VARIATION_COUNT,
  type InstancedBirchVariationControls,
  type InstancedBirchVariationRowDiagnostics
} from "@galacean/engine-vegetation/asset-assembly/InstancedBirchVariationRow";
import type {
  ProceduralTreeDistributionTuning,
  ProceduralTreeLeafNodeEdit,
  ProceduralTreeStemNodeEdit
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeGenerator";
import type { ProceduralTreeCanopyOcclusionTuning } from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeCanopyOcclusion";
import {
  resolveTreeDistributionTuning,
  withoutTreeDistributionTuning,
  withTreeDistributionTuning
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeDistributionToken";
import {
  TreeAssemblyRuntime,
  type ProceduralTreeLeafDisplayMode,
  type TreeAssemblyDiagnostics
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyRuntime";
import { treeAssemblyControls } from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyPlan";
import {
  VegetationAssemblyRuntime,
  type VegetationAssemblyDiagnostics,
  type VegetationPopulationToken
} from "@galacean/engine-vegetation/asset-assembly/VegetationAssemblyRuntime";

import {
  layoutAssetAssemblyStands,
  ASSET_SHOWCASE_COLUMNS,
  VEGETATION_AUTHORING_REFERENCE_SCALE,
  type AssetAssemblyStandBounds
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyRenderProfile";

/** Visible product surface selected by the page toolbar. */
export type AssetAssemblyView = "atoms" | "assembled" | "meadow" | "landscape";

/** Complete local Population Tokens retained independently for all five production categories. */
export type PopulationTokenMap = Readonly<Record<AssetCategory, PopulationTokenV1>>;

/** Runtime evidence for all simultaneously visible assembled stands. */
export interface AssetAssemblyLabDiagnostics {
  readonly view: AssetAssemblyView;
  readonly meadow?: ReturnType<ProceduralPlantLibraryRuntime["getDiagnostics"]>;
  readonly populationTokens: PopulationTokenMap;
  readonly populations: Readonly<Record<AssetCategory, ReturnType<typeof assetPopulationMetrics>>>;
  readonly tree: TreeAssemblyDiagnostics;
  readonly birchVariationRow: InstancedBirchVariationRowDiagnostics;
  readonly vegetation: Readonly<Record<Exclude<AssetCategory, "tree">, VegetationAssemblyDiagnostics>>;
  readonly labelsVisible: boolean;
  readonly layout: {
    readonly bounds: AssetAssemblyStandBounds;
    readonly stands: Readonly<Record<AssetCategory, AssetAssemblyStandBounds>>;
    readonly treeVariations: AssetAssemblyStandBounds;
    readonly treeStands: readonly AssetAssemblyStandBounds[];
    readonly clearance: number;
  };
  /** Number of current Seed World authored source families shown by the source-inventory view. */
  readonly sourceAtomStands: number;
  readonly sourceAtomBounds: AssetAssemblyStandBounds;
  /** Active camera-selected authored LOD indices keyed by source-family id. */
  readonly sourceAtomLods: Readonly<Record<string, readonly number[]>>;
  readonly originalSourceGlbRequests: 0;
  readonly generatedGlbRequests: number;
  readonly generatedPrefabRequests: number;
  /** Population roots in the editable stands, excluding catalog and exhibition variants. */
  readonly perInstanceEntities: number;
  readonly perInstanceTokenStrings: 0;
}

/** Construction contract for the five-stand production validation surface. */
export interface AssetAssemblyLabRuntimeOptions {
  readonly owner: Entity;
  readonly camera: Camera;
  readonly sourceLibrary: AssetAssemblySourceLibrary;
  readonly tokens: PopulationTokenMap;
  readonly shadows: boolean;
  readonly plantLibrary?: ProceduralPlantLibraryRuntime;
  readonly onLayoutChanged?: (bounds: AssetAssemblyStandBounds) => void;
}

/** Owns the Original and Assembled surfaces while keeping appearance and population updates independent. */
export class AssetAssemblyLabRuntime {
  private readonly _sourceLibrary: AssetAssemblySourceLibrary;
  private readonly _plantLibrary?: ProceduralPlantLibraryRuntime;
  private readonly _catalogTrees: TreeAssemblyRuntime[] = [];
  private readonly _atomicOwner: Entity;
  private readonly _assemblyOwner: Entity;
  private readonly _atomicPreview: AtomicAssetPreview;
  private readonly _sourceAtomStands: number;
  private readonly _assembledLabels: AssetStageLabels;
  private _treeVariationRow: InstancedBirchVariationRow;
  private _treeVariationRecipeId: string;
  private readonly _treeRuntime: TreeAssemblyRuntime;
  private readonly _vegetationRuntimes: Record<Exclude<AssetCategory, "tree">, VegetationAssemblyRuntime>;
  private readonly _tokens: Record<AssetCategory, PopulationTokenV1>;
  private _view: AssetAssemblyView = "atoms";
  private _shadows: boolean;
  private _treeStageOrigin: readonly [number, number, number] = [0, 0, 0];
  private _layout!: AssetAssemblyLabDiagnostics["layout"];
  private readonly _onLayoutChanged: AssetAssemblyLabRuntimeOptions["onLayoutChanged"];

  /**
   * Builds the five Original atom stands and all five Assembled category renderers once.
   * @param options Engine resources, category presets, populations, and scene state.
   */
  constructor(options: AssetAssemblyLabRuntimeOptions) {
    this._sourceLibrary = options.sourceLibrary;
    this._plantLibrary = options.plantLibrary;
    this._tokens = detachTokenMap(options.tokens);
    this._shadows = options.shadows;
    this._onLayoutChanged = options.onLayoutChanged;
    for (const token of Object.values(this._tokens)) {
      validatePopulationTokenSource(token, this._sourceLibrary);
    }

    this._atomicOwner = options.owner.createChild("Original production atoms");
    this._atomicPreview = new AtomicAssetPreview(this._atomicOwner, {
      camera: options.camera,
      sourceLibrary: options.sourceLibrary,
      shadows: options.shadows
    });
    this._sourceAtomStands = this._atomicPreview.inventoryCount;

    this._assemblyOwner = options.owner.createChild("Assembled production assets");
    this._assembledLabels = new AssetStageLabels(this._assemblyOwner, options.camera, [
      { id: "tree", text: "TREE" },
      { id: "shrub", text: "SHRUB" },
      { id: "grass", text: "GRASS" },
      { id: "flower", text: "FLOWER" },
      { id: "rock", text: "ROCK" },
      ...Array.from({ length: INSTANCED_BIRCH_VARIATION_COUNT }, (_, index) => ({
        id: `tree-variant-${index}`,
        text: `TREE VARIANT ${index + 1}`,
        x: 0
      }))
    ]);
    const treeToken = this._treeToken();
    const treeRecipe = this._treeRecipe(treeToken);
    this._treeVariationRecipeId = treeRecipe.id;
    this._treeVariationRow = this._createTreeVariationRow(treeRecipe, treeToken);

    const treeEntity = this._assemblyOwner.createChild("Tree instanced assembly");
    this._treeRuntime = treeEntity.addComponent(TreeAssemblyRuntime);
    this._treeRuntime.initialize({
      sourceLibrary: options.sourceLibrary,
      controls: this._treeAssemblyControls(this._treeToken()),
      shadows: options.shadows,
      camera: options.camera,
      treeUniformScale: VEGETATION_AUTHORING_REFERENCE_SCALE,
      sourceScalePreview: true
    });
    this._treeVariationRow.setLeafTexture(this._treeRuntime.getLeafTexture());

    this._vegetationRuntimes = {
      shrub: createVegetationRuntime(this._assemblyOwner, "shrub", options, this._tokens),
      grass: createVegetationRuntime(this._assemblyOwner, "grass", options, this._tokens),
      flower: createVegetationRuntime(this._assemblyOwner, "flower", options, this._tokens),
      rock: createVegetationRuntime(this._assemblyOwner, "rock", options, this._tokens)
    };
    if (this._plantLibrary) this._registerExhibitionStands(options);
    this._relayoutStands();
    this._assemblyOwner.isActive = false;
    this._assembledLabels.setVisible(false);
  }

  /**
   * Publishes one category's complete Population Token atomically.
   * @param token Complete validated appearance, density, and local population payload.
   * @returns Updated all-category evidence.
   */
  setToken(token: PopulationTokenV1): AssetAssemblyLabDiagnostics {
    validatePopulationTokenSource(token, this._sourceLibrary);
    if (token.category === "tree") {
      this._publishTreeToken(token);
      this._treeVariationRow.setColor(token.colorRgb);
      this._treeVariationRow.setLeafLightingTuning(resolveTreeLeafLightingTuning(token));
      this._treeVariationRow.setVisible(this._view !== "atoms");
    } else {
      this._tokens[token.category] = detachToken(token);
      this._vegetationRuntimes[token.category].setToken(token);
      this._relayoutStands();
    }
    return this.getDiagnostics();
  }

  /** Serializes procedural leaf dimensions into pt1 and updates only crown renderer uniforms. */
  setTreeLeafCardTuning(tuning: TreeLeafCardTuning): AssetAssemblyLabDiagnostics {
    const token = withTreeLeafCardTuning(this._treeToken(), tuning);
    validatePopulationTokenSource(token, this._sourceLibrary);
    this._tokens.tree = detachToken(token);
    this._treeRuntime.setLeafCardTuning(this._treeAssemblyControls(token));
    this._relayoutStands();
    return this.getDiagnostics();
  }

  /** Toggles production leaf shading versus opaque raw rectangles for orientation validation. */
  setTreeLeafMaterialVisible(visible: boolean): AssetAssemblyLabDiagnostics {
    return this.setTreeLeafDisplayMode(visible ? "material" : "raw-cards");
  }

  /** Shows production shading, opaque cards, or Blender-style view-space vertex-normal RGB. */
  setTreeLeafDisplayMode(mode: ProceduralTreeLeafDisplayMode): AssetAssemblyLabDiagnostics {
    this._treeRuntime.setLeafDisplayMode(mode);
    this._treeVariationRow.setLeafDisplayMode(mode);
    return this.getDiagnostics();
  }

  /** Updates one of the random-tree instance records without rebuilding their shared geometry. */
  setBirchVariation(index: number, controls: InstancedBirchVariationControls): AssetAssemblyLabDiagnostics {
    this._treeVariationRow.setVariation(index, controls);
    this._relayoutStands();
    return this.getDiagnostics();
  }

  /** Restores only the selected random tree to its deterministic initial values. */
  resetBirchVariation(index: number): AssetAssemblyLabDiagnostics {
    this._treeVariationRow.resetVariation(index);
    this._relayoutStands();
    return this.getDiagnostics();
  }

  /** Rebuilds both visible procedural-tree surfaces from one artist-edited distribution. */
  setTreeDistributionTuning(tuning: ProceduralTreeDistributionTuning): AssetAssemblyLabDiagnostics {
    const token = withTreeDistributionTuning(this._treeToken(), tuning);
    validatePopulationTokenSource(token, this._sourceLibrary);
    this._publishTreeToken(token);
    return this.getDiagnostics();
  }

  /** Edits shared final leaf surfaces and publishes both the base tree and its variations. */
  setTreeLeafFold(adjustmentDegrees: number): AssetAssemblyLabDiagnostics {
    const structure = this._treeRecipe(this._treeToken()).structureParameters!;
    const next = editProceduralTreeLeafFold(structure, adjustmentDegrees);
    if (next === structure) return this.getDiagnostics();
    const token = withTreeStructureParameters(this._treeToken(), next);
    validatePopulationTokenSource(token, this._sourceLibrary);
    this._publishTreeToken(token);
    return this.getDiagnostics();
  }

  /** Applies leaf edits to the final structure and publishes both shared tree surfaces. */
  setTreeLeafNodeEdits(edits: readonly ProceduralTreeLeafNodeEdit[]): AssetAssemblyLabDiagnostics {
    const structure = this._treeRecipe(this._treeToken()).structureParameters!;
    const token = withTreeStructureParameters(
      this._treeToken(),
      editProceduralTreeStructureParameters(structure, [], edits)
    );
    validatePopulationTokenSource(token, this._sourceLibrary);
    this._publishTreeToken(token);
    return this.getDiagnostics();
  }

  /** Inserts or replaces exactly one generated leaf-card record while retaining every other manual edit. */
  setTreeLeafNodeEdit(edit: ProceduralTreeLeafNodeEdit): AssetAssemblyLabDiagnostics {
    const record: ProceduralTreeLeafNodeEdit = {
      leafId: edit.leafId,
      stemId: edit.stemId,
      progressPercent: edit.progressPercent,
      positionOffsetPercentOfHeight: [...edit.positionOffsetPercentOfHeight],
      right: [...edit.right],
      up: [...edit.up],
      widthPercentOfHeight: edit.widthPercentOfHeight,
      heightPercentOfHeight: edit.heightPercentOfHeight
    };
    return this.setTreeLeafNodeEdits([record]);
  }

  /** Removes exactly one manual leaf-card record so that card returns to its deterministic generated state. */
  resetTreeLeafNode(leafId: string): AssetAssemblyLabDiagnostics {
    const source = this._sourceLibrary.treeRecipes.find(
      (recipe) => recipe.id === this._treeToken().assetId
    )?.structureParameters;
    if (source) {
      const leaf = treeStructureLeafNodes(source).find((leaf) => leaf.leafId === leafId);
      if (!leaf) throw new RangeError(`Tree leaf ${leafId} is absent`);
      return this.setTreeLeafNodeEdits([leaf]);
    }
    throw new Error("Tree recipe requires structure parameters");
  }

  /** Applies branch edits to the final structure and rebuilds its dependent foliage. */
  setTreeStemNodeEdits(edits: readonly ProceduralTreeStemNodeEdit[]): AssetAssemblyLabDiagnostics {
    const structure = this._treeRecipe(this._treeToken()).structureParameters!;
    const token = withTreeStructureParameters(
      this._treeToken(),
      editProceduralTreeStructureParameters(structure, edits)
    );
    validatePopulationTokenSource(token, this._sourceLibrary);
    this._publishTreeToken(token);
    return this.getDiagnostics();
  }

  /** Inserts or replaces exactly one generated branch record while retaining every other manual edit. */
  setTreeStemNodeEdit(edit: ProceduralTreeStemNodeEdit): AssetAssemblyLabDiagnostics {
    // Select the closed persisted schema explicitly so callers may edit and submit a generated diagnostics snapshot
    // without accidentally storing its transient world-space points or sampled radii.
    const record: ProceduralTreeStemNodeEdit = {
      stemId: edit.stemId,
      parentStemId: edit.parentStemId,
      attachmentProgressPercent: edit.attachmentProgressPercent,
      directionInParentFrame: [...edit.directionInParentFrame],
      lengthPercentOfHeight: edit.lengthPercentOfHeight,
      startRadiusPercentOfHeight: edit.startRadiusPercentOfHeight,
      endRadiusPercentOfStart: edit.endRadiusPercentOfStart,
      pathControlPointsPercentOfLength: edit.pathControlPointsPercentOfLength.map((point) => [...point]),
      radiusProfilePercentOfStart: [...edit.radiusProfilePercentOfStart],
      radialSegments: edit.radialSegments,
      axialSubdivisions: [...edit.axialSubdivisions],
      tipCap: edit.tipCap,
      ...(edit.rootPositionPercentOfHeight
        ? { rootPositionPercentOfHeight: [...edit.rootPositionPercentOfHeight] }
        : {})
    };
    return this.setTreeStemNodeEdits([record]);
  }

  /** Removes exactly one manual branch record so that branch returns to its deterministic generated state. */
  resetTreeStemNode(stemId: string): AssetAssemblyLabDiagnostics {
    const source = this._sourceLibrary.treeRecipes.find(
      (recipe) => recipe.id === this._treeToken().assetId
    )?.structureParameters;
    if (source) {
      const stem = treeStructureStemNodes(source).find((stem) => stem.stemId === stemId);
      if (!stem) throw new RangeError(`Tree stem ${stemId} is absent`);
      return this.setTreeStemNodeEdits([stem]);
    }
    throw new Error("Tree recipe requires structure parameters");
  }

  /** Restores the active tree recipe's authored distribution values. */
  resetTreeDistributionTuning(): AssetAssemblyLabDiagnostics {
    const token = withoutTreeDistributionTuning(this._treeToken());
    validatePopulationTokenSource(token, this._sourceLibrary);
    this._publishTreeToken(token);
    return this.getDiagnostics();
  }

  /** Serializes exact crown LOD card counts and atomically rebuilds only the procedural tree batch. */
  setTreeLeafCountTuning(tuning: TreeLeafCountTuning): AssetAssemblyLabDiagnostics {
    const token = withTreeLeafCountTuning(this._treeToken(), tuning);
    validatePopulationTokenSource(token, this._sourceLibrary);
    this._tokens.tree = detachToken(token);
    this._treeRuntime.setControls(this._treeAssemblyControls(token));
    this._relayoutStands();
    return this.getDiagnostics();
  }

  /** Toggles only leaf-card casting so shading and shadow overlap can be compared independently. */
  setTreeLeafShadows(enabled: boolean): AssetAssemblyLabDiagnostics {
    this._treeRuntime.setLeafShadows(enabled);
    return this.getDiagnostics();
  }

  /** Applies the shared-tree canopy coefficient to both assembled tree validation surfaces. */
  setTreeCanopyOcclusionTuning(tuning: ProceduralTreeCanopyOcclusionTuning): AssetAssemblyLabDiagnostics {
    this._treeRuntime.setCanopyOcclusionTuning(tuning);
    this._treeVariationRow.setCanopyOcclusionTuning(tuning);
    return this.getDiagnostics();
  }

  /** Serializes and applies a new Alpha-Test silhouette without rebuilding procedural geometry. */
  setTreeLeafMask(maskId: TreeLeafMaskId): AssetAssemblyLabDiagnostics {
    const token = withTreeLeafMask(this._treeToken(), maskId);
    validatePopulationTokenSource(token, this._sourceLibrary);
    this._tokens.tree = detachToken(token);
    // Release the row's old reference before the base tree disposes its previous custom texture.
    this._treeVariationRow.setLeafTexture(this._treeRuntime.getLeafTexture(maskId));
    this._treeRuntime.setLeafMask(this._treeAssemblyControls(token));
    return this.getDiagnostics();
  }

  /** Applies a runtime-owned local Alpha-Test image while leaving the portable Population Token unchanged. */
  setTreeCustomLeafMask(texture: Texture2D, label: string): AssetAssemblyLabDiagnostics {
    this._treeVariationRow.setLeafTexture(texture);
    this._treeRuntime.setCustomLeafMask(texture, label);
    return this.getDiagnostics();
  }

  /** Replaces every shrub LOD material while retaining the source recipe and generated geometry. */
  setShrubLeafTexture(texture: Texture2D | null, label = ""): AssetAssemblyLabDiagnostics {
    this._vegetationRuntimes.shrub.setBaseTexture(texture, label);
    return this.getDiagnostics();
  }

  /** Serializes and applies the UE-style fixed-frame leaf-card growth controls. */
  setTreeBillboardTuning(tuning: TreeBillboardTuning): AssetAssemblyLabDiagnostics {
    const token = withTreeBillboardTuning(this._treeToken(), tuning);
    validatePopulationTokenSource(token, this._sourceLibrary);
    this._tokens.tree = detachToken(token);
    this._treeRuntime.setBillboardTuning(this._treeAssemblyControls(token));
    this._relayoutStands();
    return this.getDiagnostics();
  }

  /** Serializes and applies the authored leaf color layers and zero-emission transmission controls. */
  setTreeLeafLightingTuning(tuning: TreeLeafLightingTuning): AssetAssemblyLabDiagnostics {
    const token = withTreeLeafLightingTuning(this._treeToken(), tuning);
    validatePopulationTokenSource(token, this._sourceLibrary);
    this._tokens.tree = detachToken(token);
    this._treeRuntime.setLeafLightingTuning(this._treeAssemblyControls(token));
    this._treeVariationRow.setLeafLightingTuning(tuning);
    return this.getDiagnostics();
  }

  /** Serializes and applies the effective procedural trunk PBR controls to every 3D LOD. */
  setTreeTrunkMaterialTuning(tuning: TreeTrunkMaterialTuning): AssetAssemblyLabDiagnostics {
    const token = withTreeTrunkMaterialTuning(this._treeToken(), tuning);
    validatePopulationTokenSource(token, this._sourceLibrary);
    this._tokens.tree = detachToken(token);
    this._treeRuntime.setTrunkMaterialTuning(this._treeAssemblyControls(token));
    return this.getDiagnostics();
  }

  /**
   * Switches between the five Original atoms and five Assembled results.
   * @param view Product surface to display.
   * @returns Updated all-category evidence.
   */
  setView(view: AssetAssemblyView): AssetAssemblyLabDiagnostics {
    if (view === "meadow" && !this._plantLibrary) throw new Error("Plant library is unavailable");
    this._view = view;
    const exhibition = view === "meadow" || view === "assembled";
    this._plantLibrary?.setVisible(exhibition);
    this._atomicOwner.isActive = view === "atoms";
    this._assemblyOwner.isActive = exhibition;
    this._atomicPreview.setLabelsVisible(view === "atoms");
    // Show the selected recipe's unmodified base tree beside its editable variations.
    // Switching Base tree updates both surfaces from the same Population Token.
    this._treeVariationRow.setVisible(exhibition);
    if (this._plantLibrary) {
      this._plantLibrary.setVisible(exhibition);
      this._vegetationRuntimes.rock.entity.isActive = false;
      this._vegetationRuntimes.flower.entity.isActive = false;
      this._assembledLabels.setVisible(false);
    } else {
      this._treeRuntime.entity.isActive = view === "assembled";
      this._assembledLabels.setVisible(view === "assembled");
    }
    return this.getDiagnostics();
  }

  /**
   * Enables camera-driven or manual distance preview for one assembled category.
   * @param category Any assembled category panel.
   * @param enabled Whether live per-instance camera distance is active.
   * @returns Updated all-category evidence.
   */
  setAutomaticDistance(category: AssetCategory, enabled: boolean): AssetAssemblyLabDiagnostics {
    category === "tree"
      ? this._treeRuntime.setAutomaticDistance(enabled)
      : this._vegetationRuntimes[category].setAutomaticDistance(enabled);
    return this.getDiagnostics();
  }

  /** Enables source distance culling for assembled shrubs, grass, flowers, and rocks during range validation. */
  setAssetDistanceCulling(enabled: boolean): AssetAssemblyLabDiagnostics {
    Object.values(this._vegetationRuntimes).forEach((runtime) => runtime.setDistanceCulling(enabled));
    return this.getDiagnostics();
  }

  /**
   * Sets the manual preview distance for one assembled category.
   * @param category Any assembled category panel.
   * @param distanceMeters Non-negative preview distance.
   * @returns Updated all-category evidence.
   */
  setSimulatedDistance(category: AssetCategory, distanceMeters: number): AssetAssemblyLabDiagnostics {
    category === "tree"
      ? this._treeRuntime.setSimulatedDistance(distanceMeters)
      : this._vegetationRuntimes[category].setSimulatedDistance(distanceMeters);
    return this.getDiagnostics();
  }

  /**
   * Changes shadows across Original atoms and all Assembled batches.
   * @param enabled Global scene shadow state.
   * @returns Updated all-category evidence.
   */
  setShadows(enabled: boolean): AssetAssemblyLabDiagnostics {
    this._shadows = enabled;
    this._plantLibrary?.setShadows(enabled);
    this._atomicPreview.setShadows(enabled);
    this._treeRuntime.setShadows(enabled);
    this._catalogTrees.forEach((tree) => tree.setShadows(enabled));
    this._treeVariationRow.setShadows(enabled);
    Object.values(this._vegetationRuntimes).forEach((runtime) => runtime.setShadows(enabled));
    return this.getDiagnostics();
  }

  /**
   * Replays one category without coupling independent asset previews.
   * @param category Assembled category selected by its own panel.
   * @returns Promise resolved after the category finishes its reveal.
   */
  playEntranceEffect(category: AssetCategory): Promise<void> {
    return category === "tree"
      ? this._treeRuntime.playEntranceEffect()
      : this._vegetationRuntimes[category].playEntranceEffect();
  }

  /** @returns Detached catalog, appearance, population, draw, and LOD evidence. */
  getDiagnostics(): AssetAssemblyLabDiagnostics {
    return {
      view: this._view,
      meadow: this._plantLibrary?.getDiagnostics(),
      populationTokens: detachTokenMap(this._tokens),
      populations: {
        tree: assetPopulationMetrics(this._tokens.tree),
        shrub: assetPopulationMetrics(this._tokens.shrub),
        grass: assetPopulationMetrics(this._tokens.grass),
        flower: assetPopulationMetrics(this._tokens.flower),
        rock: assetPopulationMetrics(this._tokens.rock)
      },
      tree: this._treeRuntime.getDiagnostics(),
      birchVariationRow: {
        ...this._treeVariationRow.getDiagnostics(),
        baseTreeStageOrigin: [...this._treeStageOrigin]
      },
      vegetation: {
        shrub: this._vegetationRuntimes.shrub.getDiagnostics(),
        grass: this._vegetationRuntimes.grass.getDiagnostics(),
        flower: this._vegetationRuntimes.flower.getDiagnostics(),
        rock: this._vegetationRuntimes.rock.getDiagnostics()
      },
      labelsVisible: true,
      layout: this._layout,
      sourceAtomStands: this._sourceAtomStands,
      sourceAtomBounds: serializeStandBounds(this._atomicPreview.getPreviewBounds()),
      sourceAtomLods: this._atomicPreview.getActiveLods(),
      originalSourceGlbRequests: this._sourceLibrary.originalSourceGlbRequests,
      generatedGlbRequests: this._sourceLibrary.generatedGlbRequests,
      generatedPrefabRequests: this._sourceLibrary.generatedPrefabRequests,
      perInstanceEntities: ASSET_STAGE_CATEGORIES.reduce(
        (count, category) => count + assetPopulationMetrics(this._tokens[category]).instances,
        0
      ),
      perInstanceTokenStrings: 0
    };
  }

  /** Releases both surfaces and every runtime-owned GPU resource. */
  destroy(): void {
    this._plantLibrary?.destroy();
    this._atomicPreview.destroy();
    this._treeVariationRow.destroy();
    this._assembledLabels.destroy();
    this._atomicOwner.destroy();
    this._assemblyOwner.destroy();
  }

  /** Layout is owned by this preview composition; recipes and world Population placement are unchanged. */
  private _relayoutStands(): void {
    if (this._plantLibrary) {
      this._plantLibrary.relayout();
      const stands = Object.fromEntries(
        ASSET_STAGE_CATEGORIES.map((category) => [
          category,
          serializeStandBounds(
            category === "tree"
              ? this._treeRuntime.getPreviewBounds()
              : this._vegetationRuntimes[category].getPreviewBounds()
          )
        ])
      ) as Record<AssetCategory, AssetAssemblyStandBounds>;
      this._layout = {
        bounds: this._plantLibrary.getBounds(),
        stands,
        treeVariations: serializeStandBounds(this._treeVariationRow.getPreviewBounds()),
        treeStands: [stands.tree, ...this._treeVariationRow.getPreviewInstanceBounds().map(serializeStandBounds)],
        clearance: ASSET_STAGE_CLEARANCE
      };
      this._onLayoutChanged?.(this._layout.bounds);
      return;
    }
    // Short plants have their own front row; the rock occupies a separate end stand.
    const frontCategories = ["rock", "shrub", "grass", "flower"] as const;
    const frontBounds = frontCategories.map((category) => this._vegetationRuntimes[category].getPreviewBounds());
    const frontTranslations = layoutAssetAssemblyStands(frontBounds.map(serializeStandBounds), ASSET_STAGE_CLEARANCE);
    frontCategories.forEach((category, index) => {
      const runtime = this._vegetationRuntimes[category];
      const origin = runtime.getStageOrigin();
      const [x, z] = frontTranslations[index];
      runtime.setStageOrigin([origin[0] + x, origin[1], origin[2] + z]);
    });
    const frontBack = Math.min(
      ...frontCategories.map((category) => this._vegetationRuntimes[category].getPreviewBounds().min.z)
    );
    // Base tree and variants share a compact grid, keeping exact authored dimensions.
    const treeBounds = [this._treeRuntime.getPreviewBounds(), ...this._treeVariationRow.getPreviewInstanceBounds()];
    const treeTranslations = layoutAssetAssemblyStands(
      treeBounds.map(serializeStandBounds),
      ASSET_STAGE_CLEARANCE,
      ASSET_SHOWCASE_COLUMNS
    ).map(([x, z]) => [x, z + frontBack - ASSET_STAGE_CLEARANCE] as const);
    this._treeStageOrigin = [
      this._treeStageOrigin[0] + treeTranslations[0][0],
      this._treeStageOrigin[1],
      this._treeStageOrigin[2] + treeTranslations[0][1]
    ];
    this._treeRuntime.setStageOrigin(this._treeStageOrigin);
    this._treeVariationRow.translatePreviewInstances(treeTranslations.slice(1));

    const measured = ASSET_STAGE_CATEGORIES.map((category) =>
      category === "tree" ? this._treeRuntime.getPreviewBounds() : this._vegetationRuntimes[category].getPreviewBounds()
    );
    const rowBounds = measured[0].clone();
    measured.forEach((bounds, index) => {
      BoundingBox.merge(rowBounds, bounds, rowBounds);
      const category = ASSET_STAGE_CATEGORIES[index];
      const token = this._tokens[category];
      this._assembledLabels.setText(
        category,
        `${category.toUpperCase()} · ${token.population.mode === "stress-1000" ? "BATCH" : "BASE"} · ${token.sizePercent}%`
      );
      this._assembledLabels.setPosition(
        category,
        (bounds.min.x + bounds.max.x) * 0.5,
        bounds.max.z + ASSET_STAGE_CLEARANCE * 0.5
      );
    });
    const variations = this._treeVariationRow.getPreviewInstanceBounds();
    variations.forEach((bounds, index) =>
      this._assembledLabels.setPosition(
        `tree-variant-${index}`,
        (bounds.min.x + bounds.max.x) * 0.5,
        bounds.max.z + ASSET_STAGE_CLEARANCE * 0.5
      )
    );
    const variationBounds = this._treeVariationRow.getPreviewBounds();
    BoundingBox.merge(rowBounds, variationBounds, rowBounds);
    this._layout = {
      bounds: serializeStandBounds(rowBounds),
      stands: Object.fromEntries(
        ASSET_STAGE_CATEGORIES.map((category, index) => [category, serializeStandBounds(measured[index])])
      ) as Record<AssetCategory, AssetAssemblyStandBounds>,
      treeVariations: serializeStandBounds(variationBounds),
      treeStands: [serializeStandBounds(measured[0]), ...variations.map(serializeStandBounds)],
      clearance: ASSET_STAGE_CLEARANCE
    };
    this._onLayoutChanged?.(this._layout.bounds);
  }

  private _registerExhibitionStands(options: AssetAssemblyLabRuntimeOptions): void {
    const runtime = this;
    const libraryEntries = this._plantLibrary!.entries;
    const treeFamily = (recipe: TreeRecipeSource) =>
      TREE_SPECIES_CATALOG.find((entry) => entry.assetId === recipe.id)?.exhibitionFamily ?? recipe.label;
    const treeBaseAssetId = (recipe: TreeRecipeSource) =>
      TREE_SPECIES_CATALOG.find((entry) => entry.geometryIdentity === recipe.proceduralGeometryIdentity)?.assetId ??
      recipe.id;
    const editableFamily = () => treeFamily(runtime._treeRecipe(runtime._treeToken()));
    const stands: PlantExhibitionStand[] = [
      {
        entry: {
          id: "production/tree/editable",
          category: "Trees",
          geometryAccepted: true,
          exhibitionOrder: 0,
          get family() {
            return editableFamily();
          },
          get prototypeId() {
            return treeBaseAssetId(runtime._treeRecipe(runtime._treeToken()));
          },
          get displayName() {
            return `${runtime._treeRecipe(runtime._treeToken()).label} · 可编辑基础株`;
          }
        },
        getBounds: () => serializeStandBounds(this._treeRuntime.getPreviewBounds()),
        translate: (x, z) => {
          this._treeStageOrigin = [
            this._treeStageOrigin[0] + x,
            this._treeStageOrigin[1],
            this._treeStageOrigin[2] + z
          ];
          this._treeRuntime.setStageOrigin(this._treeStageOrigin);
        },
        setVisible: (visible) => {
          this._treeRuntime.entity.isActive = visible;
        },
        getTriangleCount: () => this._treeRuntime.getDiagnostics().proceduralTrianglesByLod[0],
        getRenderers: () => this._treeRuntime.entity.getComponentsIncludeChildren(MeshRenderer, [])
      }
    ];
    // The editable row and the catalog share the same exhibition placement contract.
    for (let index = 0; index < INSTANCED_BIRCH_VARIATION_COUNT; index++) {
      const runtime = this;
      stands.push({
        entry: {
          id: `production/tree/variation-${index}`,
          category: "Trees",
          geometryAccepted: true,
          exhibitionOrder: index + 1,
          get family() {
            return editableFamily();
          },
          get prototypeId() {
            return treeBaseAssetId(runtime._treeRecipe(runtime._treeToken()));
          },
          get displayName() {
            return `${runtime._treeRecipe(runtime._treeToken()).label} · 变体 ${index + 1}`;
          }
        },
        getBounds: () => serializeStandBounds(this._treeVariationRow.getPreviewInstanceBounds()[index]),
        translate: (x, z) =>
          this._treeVariationRow.translatePreviewInstances(
            Array.from({ length: INSTANCED_BIRCH_VARIATION_COUNT }, (_, i) => (i === index ? [x, z] : [0, 0]))
          ),
        setVisible: (visible) => this._treeVariationRow.setInstanceVisible(index, visible),
        getTriangleCount: () => this._treeVariationRow.getInstanceTriangleCount(),
        getRenderers: () => this._treeVariationRow.getInstanceRenderers(index)
      });
    }
    for (const recipe of this._sourceLibrary.treeRecipes) {
      const library = { ...this._sourceLibrary, treeRecipes: [recipe] };
      const token = createDefaultPopulationToken("tree", library) as TreePopulationTokenV1;
      const tree = this._assemblyOwner.createChild(recipe.label).addComponent(TreeAssemblyRuntime);
      let origin: readonly [number, number, number] = [0, 0, 0];
      tree.initialize({
        sourceLibrary: library,
        controls: treeAssemblyControls(token, origin),
        camera: options.camera,
        shadows: this._shadows,
        treeUniformScale: VEGETATION_AUTHORING_REFERENCE_SCALE,
        sourceScalePreview: true
      });
      this._catalogTrees.push(tree);
      stands.push({
        entry: {
          id: recipe.id,
          category: "Trees",
          displayName: recipe.label,
          family: treeFamily(recipe),
          prototypeId: treeBaseAssetId(recipe),
          exhibitionOrder: 0,
          geometryAccepted: !recipe.id.includes("candidate")
        },
        isEnabled: () => this._treeToken().assetId !== recipe.id,
        getBounds: () => serializeStandBounds(tree.getPreviewBounds()),
        translate: (x, z) => {
          origin = [origin[0] + x, origin[1], origin[2] + z];
          tree.setStageOrigin(origin);
        },
        setVisible: (visible) => {
          tree.entity.isActive = visible;
        },
        getTriangleCount: () => tree.getDiagnostics().proceduralTrianglesByLod[0],
        getRenderers: () => tree.entity.getComponentsIncludeChildren(MeshRenderer, [])
      });
    }
    for (const source of this._sourceLibrary.shrubRecipes ?? [this._sourceLibrary.shrub]) {
      const library = { ...this._sourceLibrary, shrub: source };
      const shrub =
        source === this._sourceLibrary.shrub
          ? this._vegetationRuntimes.shrub
          : createVegetationRuntime(
              this._assemblyOwner,
              "shrub",
              { ...options, sourceLibrary: library },
              { ...this._tokens, shrub: createDefaultPopulationToken("shrub", library) }
            );
      stands.push({
        entry: {
          id: source.id,
          category: "Trees",
          displayName: source.label,
          family: source.label,
          exhibitionOrder: 0,
          geometryAccepted: false,
          geometryEdited: true
        },
        getBounds: () => serializeStandBounds(shrub.getPreviewBounds()),
        translate: (x, z) => {
          const p = shrub.getStageOrigin();
          shrub.setStageOrigin([p[0] + x, p[1], p[2] + z]);
        },
        setVisible: (visible) => {
          shrub.entity.isActive = visible;
        },
        getTriangleCount: () =>
          (source.lods[0].renderer.mesh.subMesh!.count / 3) *
          shrub.getDiagnostics().instancesByLod.reduce((a, b) => a + b, 0),
        getRenderers: () => shrub.entity.getComponentsIncludeChildren(MeshRenderer, [])
      });
    }
    for (const category of ["grass"] as const) {
      const vegetation = this._vegetationRuntimes[category];
      const source = this._sourceLibrary[category];
      stands.push({
        entry: {
          id: source.id,
          category: "Grass",
          displayName: "密簇细叶草",
          family: "丛生草",
          exhibitionOrder: 0,
          geometryAccepted: true
        },
        getBounds: () => serializeStandBounds(vegetation.getPreviewBounds()),
        translate: (x, z) => {
          const p = vegetation.getStageOrigin();
          vegetation.setStageOrigin([p[0] + x, p[1], p[2] + z]);
        },
        setVisible: (visible) => {
          vegetation.entity.isActive = visible;
        },
        getTriangleCount: () =>
          source.lods[0].renderers.reduce((sum, part) => sum + part.mesh.subMesh!.count / 3, 0) *
          vegetation.getDiagnostics().instancesByLod.reduce((a, b) => a + b, 0),
        getRenderers: () => vegetation.entity.getComponentsIncludeChildren(MeshRenderer, [])
      });
    }
    this._plantLibrary!.registerStands(addMissingPlantSizeVariants(this._assemblyOwner, stands, libraryEntries));
  }

  private _treeToken(): TreePopulationTokenV1 {
    return this._tokens.tree as TreePopulationTokenV1;
  }

  private _treeRecipe(token: TreePopulationTokenV1) {
    const recipe = this._sourceLibrary.treeRecipes.find((candidate) => candidate.id === token.assetId);
    if (!recipe) throw new Error("Tree Population Token does not resolve to one immutable production recipe");
    if (!recipe.proceduralRuntime) {
      throw new Error(`Tree variation row requires procedural runtime data for ${recipe.id}`);
    }
    return resolveTreeStructureRecipe(recipe, token);
  }

  private _createTreeVariationRow(recipe: TreeRecipeSource, token: TreePopulationTokenV1): InstancedBirchVariationRow {
    return new InstancedBirchVariationRow(
      this._assemblyOwner,
      recipe,
      resolveTreeLeafLightingTuning(token),
      token.colorRgb,
      resolveTreeDistributionTuning(token, recipe),

      this._shadows,
      VEGETATION_AUTHORING_REFERENCE_SCALE
    );
  }

  private _treeAssemblyControls(token: TreePopulationTokenV1) {
    return treeAssemblyControls(token, this._treeStageOrigin);
  }

  private _publishTreeToken(token: TreePopulationTokenV1): void {
    const recipe = this._treeRecipe(token);
    const nextToken = detachToken(token) as TreePopulationTokenV1;
    const nextTuning = resolveTreeDistributionTuning(nextToken, recipe);
    const previousToken = this._treeToken();
    const previousRecipe = this._treeRecipe(previousToken);
    const previousTuning = resolveTreeDistributionTuning(previousToken, previousRecipe);
    const recipeChanged =
      recipe.id !== this._treeVariationRecipeId || recipe.structureParameters !== previousRecipe.structureParameters;
    let replacementRow: InstancedBirchVariationRow | undefined;
    if (recipeChanged) {
      replacementRow = this._createTreeVariationRow(recipe, nextToken);
      const retainedVariations = this._treeVariationRow.getDiagnostics().variations;
      retainedVariations.forEach((controls, index) => replacementRow!.setVariation(index, controls));
      replacementRow.setVisible(this._view !== "atoms");
    }
    let currentRowUpdated = false;
    try {
      if (!replacementRow) {
        this._treeVariationRow.setDistributionTuning(nextTuning);
        currentRowUpdated = true;
      }
      this._treeRuntime.setControls(this._treeAssemblyControls(nextToken));
    } catch (error) {
      replacementRow?.destroy();
      if (currentRowUpdated) {
        this._treeVariationRow.setDistributionTuning(previousTuning);
      }
      this._treeRuntime.setControls(this._treeAssemblyControls(previousToken));
      throw error;
    }
    if (replacementRow) {
      this._treeVariationRow.destroy();
      this._treeVariationRow = replacementRow;
      this._treeVariationRecipeId = recipe.id;
    }
    this._tokens.tree = nextToken;
    this._treeVariationRow.setLeafTexture(this._treeRuntime.getLeafTexture());
    this._relayoutStands();
  }
}

function serializeStandBounds(bounds: BoundingBox): AssetAssemblyStandBounds {
  return { min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] };
}

function createVegetationRuntime(
  owner: Entity,
  category: Exclude<AssetCategory, "tree">,
  options: AssetAssemblyLabRuntimeOptions,
  tokens: Record<AssetCategory, PopulationTokenV1>
): VegetationAssemblyRuntime {
  const entity = owner.createChild(`${category} instanced assembly`);
  const runtime = entity.addComponent(VegetationAssemblyRuntime);
  runtime.initialize({
    camera: options.camera,
    sourceLibrary: options.sourceLibrary,
    token: tokens[category] as VegetationPopulationToken,
    stageOrigin: [0, category === "shrub" ? 0.25 : category === "rock" ? 0.22 : 0.03, 0],
    shadows: options.shadows,
    uniformScale: category === "rock" ? 1 : VEGETATION_AUTHORING_REFERENCE_SCALE,
    sourceScalePreview: true,
    // The overview must show small assets beside full-size trees; retain their lowest LOD for inspection.
    distanceCulling: false
  });
  return runtime;
}

function detachToken(token: PopulationTokenV1): PopulationTokenV1 {
  return detachPopulationToken(token);
}

function treeDistributionTuningsEqual(
  left: ProceduralTreeDistributionTuning,
  right: ProceduralTreeDistributionTuning
): boolean {
  return canonicalValuesEqual(left, right);
}

function canonicalValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => canonicalValuesEqual(entry, right[index]))
    );
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Object.keys(leftRecord).filter((key) => leftRecord[key] !== undefined);
    const rightKeys = Object.keys(rightRecord).filter((key) => rightRecord[key] !== undefined);
    return (
      keys.length === rightKeys.length &&
      keys.every((key) => key in rightRecord && canonicalValuesEqual(leftRecord[key], rightRecord[key]))
    );
  }
  return false;
}

function detachTokenMap(tokens: PopulationTokenMap): Record<AssetCategory, PopulationTokenV1> {
  return {
    tree: detachToken(tokens.tree),
    shrub: detachToken(tokens.shrub),
    grass: detachToken(tokens.grass),
    flower: detachToken(tokens.flower),
    rock: detachToken(tokens.rock)
  };
}
