import grassColorFieldAssetUrl from "@galacean/engine-terrain/data/seed-world/public/textures/grass-color-field.r8?url";
import {
  AssetType,
  Camera,
  Color,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Scene,
  Texture2D,
  TextureFormat,
  TextureFilterMode,
  TextureWrapMode,
  TonemappingMode,
  Vector3,
  WebGLMode,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { registerGUI } from "@galacean/engine-ui";
import {
  ASSET_SIZE_PERCENT_MAX,
  ASSET_SIZE_PERCENT_MIN,
  decodePopulationToken,
  detachPopulationToken,
  encodePopulationToken,
  PopulationLodMetric,
  withPopulationRootSeed,
  type AssetCategory,
  type PopulationTokenV1,
  type TreePopulationTokenV1
} from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import {
  AssetAssemblyLabRuntime,
  type AssetAssemblyLabDiagnostics,
  type AssetAssemblyView,
  type PopulationTokenMap
} from "@galacean/engine-world-planning/integrations/vegetation/AssetAssemblyLabRuntime";
import type { AssetAssemblySourceLibrary } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import { PLANT_SPECIES_CATALOG } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import { plantSpeciesResourceUrl } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import { loadTreeSpeciesCandidates } from "@galacean/engine-vegetation/asset-assembly/TreeSpeciesCandidates";
import { loadCatalogShrubSource } from "@galacean/engine-vegetation/asset-assembly/ProceduralShrubSource";
import { ProceduralPlantLibraryRuntime } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantLibraryRuntime";
import { VegetationLandscapePreview, type LandscapeExample, type LandscapeStory } from "@galacean/engine-world-planning/integrations/vegetation/VegetationLandscapePreview";
import type { LandscapeGrassMode } from "@galacean/engine-world-planning/integrations/vegetation/VegetationLandscapeGrass";
import type { VegetationLandscapePlan, VegetationLandscapeRequest } from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import { compileLandscapeSceneDirection, type LandscapeSceneDirection, type CompiledLandscapeSceneDirection } from "@galacean/engine-vegetation/world/LandscapeSceneDirection";
import { loadProceduralPlantMaterialBindings } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantMaterialBindings";
import { PlantTexturePanel } from "@galacean/engine-vegetation/asset-assembly/PlantTexturePanel";
import { type AssetAssemblyStandBounds } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyRenderProfile";
import { loadSeedWorldAssetSourceLibrary } from "@galacean/engine-vegetation/asset-assembly/SeedWorldAssetSourceLibrary";
import {
  createDefaultPopulationToken,
  isTreeLeafMaskId,
  resolveTreeLeafMaskId,
  withTreePopulationAsset,
  type TreeLeafLightingTuning,
  type TreeLeafMaskId,
  type TreeTrunkMaterialTuning
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyPresetFactory";
import { PROCEDURAL_TREE_LEAF_COUNT_MAX, PROCEDURAL_TREE_LEAF_COUNT_MIN } from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeLeafCount";
import {
  INSTANCED_BIRCH_VARIATION_LIMITS,
  type InstancedBirchVariationControls
} from "@galacean/engine-vegetation/asset-assembly/InstancedBirchVariationRow";
import {
  createCanonicalInstancedBirchVariationControls,
  createCanonicalTreePopulationToken,
  persistInstancedBirchGeometryDistribution,
  persistInstancedBirchVariationControls,
  persistTreePopulationToken
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeAuthoringState";
import {
  PROCEDURAL_TREE_LOD_COUNT,
  type ProceduralTreeDistributionTuning,
  type ProceduralTreeLeafNodeEdit,
  type ProceduralTreeStemNodeEdit,
  type SaplingLeafDistribution
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeGenerator";
import type { ProceduralTreeCanopyOcclusionTuning } from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeCanopyOcclusion";
import { PRODUCTION_ASSET_CATALOGS, resolveProductionAssetCatalog } from "@galacean/engine-vegetation/asset-assembly/ProductionAssetCatalog";
import { createTreeAssemblyGrasslandsLighting } from "@galacean/engine-world-planning/integrations/vegetation/TreeAssemblyGrasslandsLighting";
import type { ProceduralTreeLeafDisplayMode } from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyRuntime";
import { AssetAssemblySkyRuntime } from "@galacean/engine-world-planning/integrations/vegetation/AssetAssemblySkyRuntime";
import type { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import "@galacean/engine-world-planning/runtime/script-registry";

const CATEGORIES: readonly AssetCategory[] = ["tree", "shrub", "grass", "flower", "rock"];
const ASSET_INVENTORY_CAMERA_POSITION = new Vector3(0, 60, 88);
const ASSET_INVENTORY_ORBIT_TARGET = new Vector3(0, 3, -8);
const ASSET_INVENTORY_ORBIT_MAX_DISTANCE = 4_096;
const LOD_PREVIEW_DISTANCES: Readonly<Record<Exclude<AssetCategory, "rock">, readonly number[]>> = {
  tree: [8, 30, 56, 76],
  shrub: [8, 24, 44, 58],
  grass: [20, 60, 90, 95],
  flower: [20, 60, 90, 95]
};
const TREE_DISTRIBUTION_NUMBER_FIELDS = [
  "tree-geometry-seed",
  "tree-trunk-count",
  "tree-height-variation",
  "tree-trunk-clear-height",
  "tree-trunk-radius",
  "tree-trunk-radius-variation",
  "tree-trunk-curve-variation",
  "tree-trunk-split-angle",
  "tree-trunk-split-variation",
  "tree-trunk-rotate",
  "tree-trunk-rotate-variation",
  "tree-branch-count",
  "tree-branch-length",
  "tree-branch-maximum-length",
  "tree-branch-length-variation",
  "tree-branch-curve-variation",
  "tree-branch-attraction-up",
  "tree-branch-rotate",
  "tree-branch-rotate-variation",
  "tree-branch-down-angle",
  "tree-branch-down-variation",
  "tree-twig-count",
  "tree-twig-length",
  "tree-twig-maximum-length",
  "tree-twig-length-variation",
  "tree-twig-curve-variation",
  "tree-twig-attraction-up",
  "tree-twig-attachment-end",
  "tree-twig-rotate",
  "tree-twig-rotate-variation",
  "tree-twig-down-angle",
  "tree-twig-down-variation",
  "tree-leaf-down-angle",
  "tree-leaf-down-variation",
  "tree-leaf-rotate",
  "tree-leaf-rotate-variation",
  "tree-leaf-spacing",
  "tree-leaf-scale-variation",
  "tree-leaf-normal-crown-blend"
] as const;

/** Browser automation contract kept outside the public page surface. */
export interface AssetAssemblyApi {
  readonly ready: true;
  /** @returns Detached Tokens, batches, and LOD evidence. */
  getDiagnostics(): AssetAssemblyBrowserDiagnostics;
  /** @param view Original atoms or all assembled stands. @returns Updated evidence. */
  setView(view: AssetAssemblyView): AssetAssemblyBrowserDiagnostics;
  setMeadowCategory(category: string): AssetAssemblyBrowserDiagnostics;
  setMeadowLod(lod: number): Promise<AssetAssemblyBrowserDiagnostics>;
  focusMeadowAsset(id: string): AssetAssemblyBrowserDiagnostics;
  /** Compile an upstream regional request against the current measured Asset Assembly plant palette. */
  setLandscape(request: VegetationLandscapeRequest): VegetationLandscapePlan;
  getLandscape(): { request: VegetationLandscapeRequest | undefined; plan: VegetationLandscapePlan | undefined };
  /** Apply upstream semantic planting, palette and light parameters without moving the camera or focal objects. */
  applySceneDirection(direction: LandscapeSceneDirection): LandscapeSceneDirectionEvidence;
  getSceneDirection(): LandscapeSceneDirectionEvidence;
  resetSceneDirection(): LandscapeSceneDirectionEvidence;
  /** @param category Category owning the Token. @param token Canonical `pt1` Population Token. */
  setToken(category: AssetCategory, token: string): AssetAssemblyBrowserDiagnostics;
  /** @param category Token owner. @param rootSeed New unsigned 32-bit deterministic root. */
  setRootSeed(category: AssetCategory, rootSeed: number): AssetAssemblyBrowserDiagnostics;
  /** @param category Token owner. @param lod Catalog LOD index. @param value Metric-specific quantity. */
  setLodQuantity(category: AssetCategory, lod: number, value: number): AssetAssemblyBrowserDiagnostics;
  /** @param category Batch Preview category. @param enabled Whether exactly 1,000 instances are submitted. */
  setBatchPreview(category: AssetCategory, enabled: boolean): AssetAssemblyBrowserDiagnostics;
  /** Updates shared final surface folds relative to their authored angles and rebuilds foliage. */
  setTreeLeafFold(adjustmentDegrees: number): AssetAssemblyBrowserDiagnostics;
  /** Rebuilds collision-aware foliage after changing root-pivot card dimensions; leaf budgets stay unchanged. */
  setTreeLeafCardSize(lengthPercent: number, widthPercent: number): AssetAssemblyBrowserDiagnostics;
  /** Rebuilds the crown meshes with exact per-tree card counts for LOD0 through LOD3. */
  setTreeLeafCounts(
    lod0Count: number,
    lod1Count: number,
    lod2Count: number,
    lod3Count: number
  ): AssetAssemblyBrowserDiagnostics;
  /** Toggles only procedural leaf-card shadow casting. */
  setTreeLeafShadows(enabled: boolean): AssetAssemblyBrowserDiagnostics;
  /** Applies the generator-derived canopy optical depth without changing ShadowCaster submissions. */
  setTreeCanopyOcclusion(
    enabled: boolean,
    density: number,
    colorRgb: readonly [number, number, number]
  ): AssetAssemblyBrowserDiagnostics;
  /** Shows production leaf shading or opaque untextured rectangles for orientation validation. */
  setTreeLeafMaterialVisible(visible: boolean): AssetAssemblyBrowserDiagnostics;
  /** Selects production shading, raw opaque cards, or view-space vertex-normal RGB. */
  setTreeLeafDisplayMode(mode: ProceduralTreeLeafDisplayMode): AssetAssemblyBrowserDiagnostics;
  /** Updates color and shape controls for exactly one of the shared-mesh tree instances. */
  setBirchVariation(index: number, controls: InstancedBirchVariationControls): AssetAssemblyBrowserDiagnostics;
  /** Restores exactly one of the stable-random tree instances. */
  resetBirchVariation(index: number): AssetAssemblyBrowserDiagnostics;
  /** Rebuilds the base tree with explicit trunk, branch, twig, and leaf random-distribution controls. */
  setTreeDistributionTuning(tuning: ProceduralTreeDistributionTuning): AssetAssemblyBrowserDiagnostics;
  /** Applies sparse per-card states after procedural placement without changing generator distribution. */
  setTreeLeafNodeEdits(edits: readonly ProceduralTreeLeafNodeEdit[]): AssetAssemblyBrowserDiagnostics;
  /** Inserts or replaces one leaf card without discarding edits on other generated cards. */
  setTreeLeafNodeEdit(edit: ProceduralTreeLeafNodeEdit): AssetAssemblyBrowserDiagnostics;
  /** Removes one persisted leaf-card edit and returns it to the deterministic generated state. */
  resetTreeLeafNode(leafId: string): AssetAssemblyBrowserDiagnostics;
  /** Persists complete parent, attachment, Path, direction, length, and radius records for edited branches. */
  setTreeStemNodeEdits(edits: readonly ProceduralTreeStemNodeEdit[]): AssetAssemblyBrowserDiagnostics;
  /** Inserts or replaces one branch without discarding edits on other generated branches. */
  setTreeStemNodeEdit(edit: ProceduralTreeStemNodeEdit): AssetAssemblyBrowserDiagnostics;
  /** Removes one persisted branch edit and returns it to the deterministic generated state. */
  resetTreeStemNode(stemId: string): AssetAssemblyBrowserDiagnostics;
  /** Restores the active tree recipe's authored procedural distribution. */
  resetTreeDistributionTuning(): AssetAssemblyBrowserDiagnostics;
  /** Rebuilds Pivot/Up/Local leaf frames after applying card width, height, and clearance controls. */
  setTreeBillboardTuning(
    billboardSize: number,
    billboardsScale: number,
    inflate: number
  ): AssetAssemblyBrowserDiagnostics;
  /** Applies the UE-style leaf Base Color and Fresnel-emissive PBR controls. */
  setTreeLeafLightingTuning(tuning: TreeLeafLightingTuning): AssetAssemblyBrowserDiagnostics;
  /** Applies Base Color, UV tiling, normal strength, smoothness, and metallic to every 3D trunk LOD. */
  setTreeTrunkMaterialTuning(tuning: TreeTrunkMaterialTuning): AssetAssemblyBrowserDiagnostics;
  /** Switches the procedural Alpha-Test silhouette without rebuilding tree geometry. */
  setTreeLeafMask(maskId: TreeLeafMaskId): AssetAssemblyBrowserDiagnostics;
  /** Loads a local RGBA image for every assembled tree or shrub LOD. */
  setLeafTexture(category: "tree" | "shrub", file: File): Promise<AssetAssemblyBrowserDiagnostics>;
  /** Restores the selected species' default leaf texture. */
  resetLeafTexture(category: "tree" | "shrub"): AssetAssemblyBrowserDiagnostics;
  /** @param category Assembled category panel. @param enabled Whether camera distance drives every instance. */
  setAutomaticDistance(category: AssetCategory, enabled: boolean): AssetAssemblyBrowserDiagnostics;
  /** Toggles source distance culling for assembled shrubs, grass, flowers, and rocks. */
  setAssetDistanceCulling(enabled: boolean): AssetAssemblyBrowserDiagnostics;
  /** @param category Assembled category panel. @param distanceMeters Shared manual preview distance. */
  setSimulatedDistance(category: AssetCategory, distanceMeters: number): AssetAssemblyBrowserDiagnostics;
  /** @param category Assembled category whose entrance is replayed. @returns Promise resolved when it is visible. */
  playEntranceEffect(category: AssetCategory): Promise<void>;
}

export interface LandscapeSceneDirectionEvidence {
  readonly compiled: CompiledLandscapeSceneDirection | undefined;
  readonly layers: Readonly<Record<string, number>>;
  readonly colorAdjustedRenderers: number;
  readonly lighting: ReturnType<ReturnType<typeof createTreeAssemblyGrasslandsLighting>["lighting"]["getBakeLightingTuning"]>;
}

/** Runtime diagnostics plus canonical category Tokens. */
export type AssetAssemblyBrowserDiagnostics = AssetAssemblyLabDiagnostics & {
  readonly landscape?: VegetationLandscapePlan["diagnostics"];
  readonly tokens: Readonly<Record<AssetCategory, string>>;
  readonly batchPreview: Readonly<Record<AssetCategory, boolean>>;
  readonly rendering: {
    readonly hdr: boolean;
    readonly postProcess: ReturnType<TerrainPostProcessRuntime["getDebugSnapshot"]>;
  };
  readonly sky: ReturnType<AssetAssemblySkyRuntime["getSnapshot"]>;
  readonly camera: {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
  };
};

declare global {
  interface Window {
    assetAssembly?: AssetAssemblyApi;
    assetAssemblyError?: string;
  }
}

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  window.assetAssemblyError = message;
  document.body.dataset.state = "error";
  document.querySelector<HTMLElement>(".loading p")!.textContent = message;
  console.error("[asset-assembly] startup failed", error);
});

async function boot(): Promise<void> {
  if (new URLSearchParams(location.search).get("view") === "procedural-plants") {
    const { bootProceduralPlantPreview } = await import("@galacean/engine-vegetation/asset-assembly/ProceduralPlantPreview");
    await bootProceduralPlantPreview();
    return;
  }
  registerGUI();
  const engine = await WebGLEngine.create({
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  });
  engine.canvas.setAutoResolution();
  const scene = engine.sceneManager.activeScene!;
  const root = scene.createRootEntity("Asset Assembly");

  const cameraEntity = root.createChild("Camera");
  cameraEntity.transform.setPosition(
    ASSET_INVENTORY_CAMERA_POSITION.x,
    ASSET_INVENTORY_CAMERA_POSITION.y,
    ASSET_INVENTORY_CAMERA_POSITION.z
  );
  cameraEntity.transform.lookAt(ASSET_INVENTORY_ORBIT_TARGET);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 45;
  camera.nearClipPlane = 0.1;
  camera.farClipPlane = 12_000;
  const orbit = cameraEntity.addComponent(OrbitControl);
  orbit.target.copyFrom(ASSET_INVENTORY_ORBIT_TARGET);
  orbit.enableDamping = false;
  orbit.enableKeys = false;
  orbit.minDistance = 8;
  orbit.maxDistance = ASSET_INVENTORY_ORBIT_MAX_DISTANCE;

  const grasslandsScene = createTreeAssemblyGrasslandsLighting(scene, root, camera);
  const { lighting, postProcess, wind } = grasslandsScene;
  // Ground wind needs the spectrum texture as well as its tuning uniforms. Without
  // the bridge, the fallback white sampler produces a constant bend for every plant.
  wind.attachSceneBridge(camera.entity.transform.worldPosition);
  wind.setGpuRenderCamera(camera);
  const ground = root.createChild("Preview ground");
  const groundRenderer = ground.addComponent(MeshRenderer);
  groundRenderer.mesh = PrimitiveMesh.createPlane(engine, 1, 1, 1, 1, false);
  const groundMaterial = new PBRMaterial(engine);
  groundMaterial.baseColor = new Color(1, 1, 1, 1);
  // A repeating five-metre grid provides a common scale reference for every specimen.
  const gridResolution = 256;
  const gridPixels = new Uint8Array(gridResolution * gridResolution * 4);
  for (let y = 0; y < gridResolution; y++) for (let x = 0; x < gridResolution; x++) {
    gridPixels.set(x < 2 || y < 2 ? [179, 166, 142, 255] : [213, 199, 175, 255],
      (y * gridResolution + x) * 4);
  }
  const gridTexture = new Texture2D(engine, gridResolution, gridResolution, TextureFormat.R8G8B8A8, true, true);
  gridTexture.setPixelBuffer(gridPixels);
  gridTexture.generateMipmaps();
  gridTexture.filterMode = TextureFilterMode.Trilinear;
  gridTexture.wrapModeU = gridTexture.wrapModeV = TextureWrapMode.Repeat;
  gridTexture.anisoLevel = 8;
  groundMaterial.baseTexture = gridTexture;
  groundMaterial.roughness = 0.94;
  groundRenderer.setMaterial(groundMaterial);
  groundRenderer.receiveShadows = true;
  const fitGround = (bounds: AssetAssemblyStandBounds, exhibitionGrid = true) => {
    const gridMeters = 5;
    const minX = exhibitionGrid ? Math.floor(bounds.min[0] / gridMeters - 1) * gridMeters : bounds.min[0];
    const maxX = exhibitionGrid ? Math.ceil(bounds.max[0] / gridMeters + 1) * gridMeters : bounds.max[0];
    const minZ = exhibitionGrid ? Math.floor(bounds.min[2] / gridMeters - 1) * gridMeters : bounds.min[2];
    const maxZ = exhibitionGrid ? Math.ceil(bounds.max[2] / gridMeters + 1) * gridMeters : bounds.max[2];
    ground.transform.setPosition((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5);
    ground.transform.setScale(maxX - minX, 1, maxZ - minZ);
    groundMaterial.tilingOffset.set((maxX - minX) / gridMeters, (maxZ - minZ) / gridMeters, 0, 0);
    return { min: [minX, bounds.min[1], minZ], max: [maxX, bounds.max[1], maxZ] } as const;
  };

  const selectedCatalog = resolveProductionAssetCatalog(PRODUCTION_ASSET_CATALOGS[0].id);
  populateCatalogStyles(selectedCatalog.id);
  let shrubRecipes: Awaited<ReturnType<typeof loadCatalogShrubSource>>[] = [];
  const acceptedSourceLibrary = await loadSeedWorldAssetSourceLibrary(engine, {
    shrubSourceFactory: async (engine) => {
      shrubRecipes = await Promise.all(PLANT_SPECIES_CATALOG.shrubRecipes.map((entry) => loadCatalogShrubSource(engine, entry)));
      return shrubRecipes[0];
    },
    treeRecipeIds: new Set(),
    loadTreeImpostor: true
  });
  const candidateRecipes = await loadTreeSpeciesCandidates(engine);
  const sourceLibrary = { ...acceptedSourceLibrary, shrubRecipes, treeRecipes: [...acceptedSourceLibrary.treeRecipes, ...candidateRecipes] };
  const visibleSky = await AssetAssemblySkyRuntime.create(scene, camera, lighting, wind);

  const meadowMaterials = await loadProceduralPlantMaterialBindings(engine, sourceLibrary,
    plantSpeciesResourceUrl(PLANT_SPECIES_CATALOG.materialFile));
  const plantLibrary = await ProceduralPlantLibraryRuntime.load({
    owner: root,
    camera,
    indexUrl: plantSpeciesResourceUrl("plant-species.json"),
    materialForSlot: meadowMaterials.materialForSlot,
    colorForSlot: meadowMaterials.colorForSlot,
    normalMapped: true,
    addSizeVariants: true,
    onProgress: (loaded, total) => {
      document.querySelector<HTMLElement>(".loading p")!.textContent = `生成植被 ${loaded} / ${total}`;
    }
  });

  const populationTokens = Object.fromEntries(
    CATEGORIES.map((category) => [category, createDefaultPopulationToken(category, sourceLibrary)])
  ) as Record<AssetCategory, PopulationTokenV1>;
  populationTokens.tree = createCanonicalTreePopulationToken(
    sourceLibrary,
    populationTokens.tree as TreePopulationTokenV1
  );
  const encodedTokens = Object.fromEntries(
    CATEGORIES.map((category) => [category, encodePopulationToken(populationTokens[category])])
  ) as Record<AssetCategory, string>;
  const runtime = new AssetAssemblyLabRuntime({
    owner: root.createChild("Asset Assembly surfaces"),
    camera,
    sourceLibrary,
    tokens: populationTokens as PopulationTokenMap,
    shadows: true,
    plantLibrary,
    onLayoutChanged: fitGround
  });
  createCanonicalInstancedBirchVariationControls().forEach((controls, index) =>
    runtime.setBirchVariation(index, controls)
  );

  const grassColorTemplateResponse = await fetch(grassColorFieldAssetUrl);
  if (!grassColorTemplateResponse.ok) throw new Error("Seed World grass colour field failed to load");
  const grassColorTemplate = new Uint8Array(await grassColorTemplateResponse.arrayBuffer());
  const landscape = new VegetationLandscapePreview(root, plantLibrary, sourceLibrary, grassColorTemplate);

  const pendingTokens = new Map<AssetCategory, PopulationTokenV1>();
  let pendingFrame = 0;

  const diagnostics = (): AssetAssemblyBrowserDiagnostics => ({
    ...runtime.getDiagnostics(),
    landscape: landscape.plan?.diagnostics,
    tokens: { ...encodedTokens },
    batchPreview: Object.fromEntries(
      CATEGORIES.map((category) => [category, populationTokens[category].population.mode === "stress-1000"])
    ) as Record<AssetCategory, boolean>,
    rendering: { hdr: camera.enableHDR, postProcess: postProcess.getDebugSnapshot() },
    sky: visibleSky.getSnapshot(),
    camera: {
      position: [
        camera.entity.transform.worldPosition.x,
        camera.entity.transform.worldPosition.y,
        camera.entity.transform.worldPosition.z
      ],
      target: [orbit.target.x, orbit.target.y, orbit.target.z]
    }
  });
  const frameBounds = (sourceBounds: AssetAssemblyStandBounds, clearance: number, view: AssetAssemblyView) => {
      const min = sourceBounds.min.map((value) => value - clearance);
      const max = sourceBounds.max.map((value) => value + clearance);
      const target = new Vector3((min[0] + max[0]) * 0.5, (min[1] + max[1]) * 0.5, (min[2] + max[2]) * 0.5);
      const back = new Vector3();
      Vector3.subtract(ASSET_INVENTORY_CAMERA_POSITION, ASSET_INVENTORY_ORBIT_TARGET, back);
      back.normalize();
      const right = new Vector3(back.z, 0, -back.x).normalize();
      const up = new Vector3();
      Vector3.cross(back, right, up);
      const tanVertical = Math.tan((camera.fieldOfView * Math.PI) / 360);
      const panelRect = document.querySelector<HTMLElement>(view === "landscape" ? ".landscape-panel" : view === "meadow" ? ".meadow-panel" : ".control-panel")!.getBoundingClientRect();
      const canvasRect = document.querySelector<HTMLCanvasElement>("#canvas")!.getBoundingClientRect();
      // Auto-resolution applies its backing-buffer size on the first engine frame, after this initial fit.
      const tanHorizontal = (tanVertical * canvasRect.width) / canvasRect.height;
      const panelFraction = view === "atoms" ? 0 : Math.min(0.65, (canvasRect.right - panelRect.left) / canvasRect.width);
      let distance = camera.nearClipPlane;
      for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
        const relative = new Vector3(x - target.x, y - target.y, z - target.z);
        const depth = Vector3.dot(relative, back);
        distance = Math.max(distance,
          depth + Math.abs(Vector3.dot(relative, right) / tanHorizontal - panelFraction * depth) / (1 - panelFraction),
          depth + Math.abs(Vector3.dot(relative, up)) / tanVertical
        );
      }
      distance += camera.nearClipPlane;
      // Reserve the right-side control panel without hiding the rightmost stand behind it.
      target.x += right.x * distance * tanHorizontal * panelFraction;
      target.z += right.z * distance * tanHorizontal * panelFraction;
      orbit.target.copyFrom(target);
      camera.entity.transform.setPosition(target.x + back.x * distance, target.y + back.y * distance, target.z + back.z * distance);
      camera.entity.transform.lookAt(target);
      orbit.minDistance = view === "atoms" ? 8 : camera.nearClipPlane * 2;
  };
  const setView = (view: AssetAssemblyView): AssetAssemblyBrowserDiagnostics => {
    if (view === "landscape") {
      plantLibrary.setCategory("");
      meadowCategory.value = "";
      landscape.apply(landscape.request ?? landscape.createExample("building"), landscape.direction);
      updateLandscapePanel();
    } else landscape.clear();
    runtime.setView(view);
    syncView(view);
    const snapshot = runtime.getDiagnostics();
    const bounds = view === "landscape" ? landscape.getBounds() : view === "atoms" ? snapshot.sourceAtomBounds : plantLibrary.getBounds();
    fitGround(bounds, view !== "landscape");
    ground.isActive = view !== "landscape";
    groundRenderer.setMaterial(groundMaterial);
    frameBounds(bounds, 0, view);
    if (view === "landscape") viewLandscape();
    if (view === "landscape" && savedSceneDirection && !compiledSceneDirection) {
      try {
        directionBase = savedSceneDirection.base;
        applySceneDirection(savedSceneDirection.direction);
      } catch (error) {
        directionBase = undefined;
        savedSceneDirection = undefined;
        directionOutput.textContent = `已保存的意图未应用：${error instanceof Error ? error.message : String(error)}`;
      }
    }
    if (view === "meadow") updateMeadowPanel();
    return diagnostics();
  };

  const landscapePanel = document.querySelector<HTMLElement>(".landscape-panel")!;
  const landscapeInput = landscapePanel.querySelector<HTMLTextAreaElement>("[data-landscape-request]")!;
  const landscapeViews = landscapePanel.querySelector<HTMLSelectElement>("[data-landscape-view]")!;
  const landscapeGrass = landscapePanel.querySelector<HTMLSelectElement>("[data-landscape-grass]")!;
  const landscapeError = landscapePanel.querySelector<HTMLElement>("[data-landscape-error]")!;
  const directionInput = landscapePanel.querySelector<HTMLTextAreaElement>("[data-scene-direction]")!;
  const directionOutput = landscapePanel.querySelector<HTMLOutputElement>("[data-scene-direction-evidence]")!;
  const directionStorageKey = "asset-assembly.scene-direction.v1";
  let directionBase: VegetationLandscapeRequest | undefined;
  let compiledSceneDirection: CompiledLandscapeSceneDirection | undefined;
  let directionLightBase: ReturnType<typeof lighting.getVisualTuning> | undefined;
  let directionClockBase: ReturnType<typeof lighting.getSnapshot> | undefined;
  let savedSceneDirection: { base: VegetationLandscapeRequest; direction: LandscapeSceneDirection } | undefined;
  try {
    const saved = localStorage.getItem(directionStorageKey);
    if (saved) savedSceneDirection = JSON.parse(saved);
  } catch { directionOutput.textContent = "无法读取已保存的场景意图。"; }
  const getSceneDirection = (): LandscapeSceneDirectionEvidence => structuredClone({
    compiled: compiledSceneDirection,
    layers: landscape.plan?.diagnostics.layers ?? {},
    colorAdjustedRenderers: landscape.rendering?.colorAdjustedRenderers ?? 0,
    lighting: lighting.getBakeLightingTuning()
  });
  const clearDirectionState = () => {
    if (directionLightBase && directionClockBase) {
      lighting.setTuning({ timeHours: directionClockBase.timeHours, playing: false });
      lighting.applyVisualTuning(directionLightBase);
      lighting.setTuning({ playing: directionClockBase.playing });
    }
    directionBase = undefined;
    compiledSceneDirection = undefined;
    directionLightBase = undefined;
    directionClockBase = undefined;
    savedSceneDirection = undefined;
    try { localStorage.removeItem(directionStorageKey); } catch { /* Runtime reset remains usable without browser storage. */ }
    directionOutput.textContent = "";
  };
  const applySceneDirection = (direction: LandscapeSceneDirection): LandscapeSceneDirectionEvidence => {
    const base = directionBase ?? landscape.request;
    if (!base) throw new Error("请先生成自然植被，再应用场景意图。");
    const compiled = compileLandscapeSceneDirection(base, direction);
    // Compile and allocate the complete new landscape before replacing the currently visible one.
    landscape.apply(compiled.request, compiled.direction);
    directionBase = structuredClone(base);
    directionLightBase ??= lighting.getVisualTuning();
    directionClockBase ??= lighting.getSnapshot();
    lighting.setTuning({ timeHours: directionClockBase.timeHours, playing: false });
    const light = compiled.direction.lighting;
    lighting.applyVisualTuning({
      sunColorR: light.sunlight.color[0], sunColorG: light.sunlight.color[1], sunColorB: light.sunlight.color[2],
      sunIntensity: light.sunlight.intensity,
      ambientIntensity: light.environment.diffuse, iblIntensity: light.environment.specular
    });
    compiledSceneDirection = compiled;
    savedSceneDirection = { base: directionBase, direction: compiled.direction };
    let saved = true;
    try { localStorage.setItem(directionStorageKey, JSON.stringify(savedSceneDirection)); } catch { saved = false; }
    runtime.setView("landscape"); syncView("landscape");
    fitGround(landscape.getBounds(), false); ground.isActive = false;
    updateLandscapePanel();
    directionInput.value = JSON.stringify(compiled.direction, null, 2);
    const evidence = getSceneDirection();
    directionOutput.textContent = `${compiled.direction.intent.theme} · ${compiled.direction.intent.style} · ${compiled.direction.intent.mood}\n` +
      `已应用 ${compiled.zones.length} 个生长区域，${evidence.colorAdjustedRenderers} 个植被部件颜色；草与地皮共享新配色。\n` +
      `日光 ${evidence.lighting.sunIntensity.toFixed(2)} · 环境光 ${evidence.lighting.ambientIntensity.toFixed(2)}。` +
      (saved ? " 刷新后保留。" : " 本次修改已生效，但浏览器未能保存。");
    return evidence;
  };
  const resetSceneDirection = (): LandscapeSceneDirectionEvidence => {
    if (directionBase) landscape.apply(directionBase);
    clearDirectionState();
    updateLandscapePanel();
    directionOutput.textContent = "已恢复应用意图前的布局、配色和光照。";
    return getSceneDirection();
  };
  const updateLandscapePanel = () => {
    const request = landscape.request!, plan = landscape.plan!;
    landscapeInput.value = JSON.stringify(request, null, 2);
    landscapeGrass.value = landscape.grassMode;
    landscapePanel.querySelector<HTMLInputElement>("[data-landscape-seed]")!.value = String(request.seed);
    const selected = landscapeViews.value;
    landscapeViews.replaceChildren(new Option("全景", "overview"), ...request.views.map((v) => new Option(v.id, v.id)));
    if ([...landscapeViews.options].some((option) => option.value === selected)) landscapeViews.value = selected;
    else landscapeViews.value = request.views[0]?.id ?? "overview";
    landscapePanel.querySelector<HTMLOutputElement>("[data-landscape-summary]")!.textContent =
      `植被 ${plan.instances.length} 株 · ${new Set(plan.instances.map((i) => i.assetId)).size} 种素材\n` +
      Object.entries(plan.diagnostics.layers).map(([id, count]) => `${id} ${count}`).join(" · ") + "\n" +
      request.views.map((v) => `${v.id}：近 / 中 / 远 ${plan.diagnostics.views[v.id].join(" / ")}`).join("\n");
    landscapeError.hidden = true;
  };
  const viewLandscape = () => {
    const view = landscape.request?.views.find((v) => v.id === landscapeViews.value);
    if (view) {
      orbit.target.set(...view.lookAt);
      camera.entity.transform.setPosition(...view.eye);
      camera.entity.transform.lookAt(orbit.target);
    } else frameBounds(landscape.getBounds(), 0, "landscape");
  };
  const setLandscape = (request: VegetationLandscapeRequest): VegetationLandscapePlan => {
    // Rebuild library resources only when entering from a category-filtered exhibition.
    if (plantLibrary.getDiagnostics().category) { landscape.clear(); plantLibrary.setCategory(""); meadowCategory.value = ""; }
    const plan = landscape.apply(request);
    clearDirectionState();
    runtime.setView("landscape"); syncView("landscape");
    fitGround(landscape.getBounds(), false);
    ground.isActive = false;
    updateLandscapePanel(); viewLandscape();
    return structuredClone(plan);
  };
  const landscapeAction = (action: () => void) => {
    try { action(); landscapeError.hidden = true; }
    catch (error) { landscapeError.textContent = error instanceof Error ? error.message : String(error); landscapeError.hidden = false; }
  };
  landscapePanel.querySelector("[data-landscape-generate]")!.addEventListener("click", () => landscapeAction(() => {
    const kind = landscapePanel.querySelector<HTMLSelectElement>("[data-landscape-example]")!.value as LandscapeExample;
    const seed = Number(landscapePanel.querySelector<HTMLInputElement>("[data-landscape-seed]")!.value);
    const story = landscapePanel.querySelector<HTMLSelectElement>("[data-landscape-story]")!.value as LandscapeStory;
    setLandscape(landscape.createExample(kind, seed, story, landscapeGrass.value as LandscapeGrassMode));
  }));
  landscapeGrass.addEventListener("change", () => landscapeAction(() => {
    try {
      landscape.apply(landscape.withGrassMode(landscape.request!, landscapeGrass.value as LandscapeGrassMode), landscape.direction);
      if (directionBase && savedSceneDirection) {
        directionBase = landscape.withGrassMode(directionBase, landscapeGrass.value as LandscapeGrassMode);
        savedSceneDirection = { base: directionBase, direction: savedSceneDirection.direction };
        localStorage.setItem(directionStorageKey, JSON.stringify(savedSceneDirection));
      }
      updateLandscapePanel();
      updateDrawCalls();
    } catch (error) { landscapeGrass.value = landscape.grassMode; throw error; }
  }));
  landscapePanel.querySelector("[data-landscape-apply]")!.addEventListener("click", () => landscapeAction(() => setLandscape(JSON.parse(landscapeInput.value))));
  landscapePanel.querySelector("[data-scene-direction-apply]")!.addEventListener("click", () =>
    landscapeAction(() => { applySceneDirection(JSON.parse(directionInput.value)); }));
  landscapePanel.querySelector("[data-scene-direction-reset]")!.addEventListener("click", () =>
    landscapeAction(() => { resetSceneDirection(); }));
  landscapeViews.addEventListener("change", viewLandscape);
  landscapePanel.querySelector<HTMLInputElement>("[data-landscape-vegetation]")!.addEventListener("change", (event) =>
    landscape.setVegetationVisible((event.target as HTMLInputElement).checked));
  landscapePanel.querySelector("[data-landscape-collapse]")!.addEventListener("click", (event) => {
    const collapsed = landscapePanel.classList.toggle("is-collapsed");
    (event.currentTarget as HTMLButtonElement).textContent = collapsed ? "展开规则" : "收起规则";
  });

  const meadowPanel = document.querySelector<HTMLElement>(".meadow-panel")!;
  const meadowCategory = meadowPanel.querySelector<HTMLSelectElement>("[data-meadow-category]")!;
  const meadowAsset = meadowPanel.querySelector<HTMLSelectElement>("[data-meadow-asset]")!;
  const meadowLod = meadowPanel.querySelector<HTMLSelectElement>("[data-meadow-lod]")!;
  const meadowOutput = meadowPanel.querySelector<HTMLOutputElement>("output")!;
  const meadowDrawCalls = meadowPanel.querySelector<HTMLElement>("[data-meadow-drawcalls]")!;
  let drawCallCells = new Map<string, HTMLTableCellElement>();
  const sharedDrawNote = document.createElement("small");
  sharedDrawNote.textContent = "部分主植物共用绘制调用，各行不可直接相加。";
  const updateDrawCalls = () => {
    const snapshot = plantLibrary.getDrawCalls();
    const rendering = landscape.rendering;
    if (rendering) landscapePanel.querySelector<HTMLOutputElement>("[data-landscape-rendering]")!.textContent =
      `铺底：面片草 ${rendering.grass.cards.toLocaleString()} 丛 · 1729 草 ${rendering.grass.mesh.toLocaleString()} 丛\n` +
      `铺底网格合计 ${rendering.grass.triangles.toLocaleString()} 三角形（剔除前）\n` +
      `引擎 GPU Instance · ${rendering.meshes} 个共享 Mesh · ${rendering.materials} 个材质\n` +
      `Renderer ${rendering.componentRenderers.toLocaleString()} → ${rendering.renderers.toLocaleString()}\n` +
      (snapshot.ready ? `当前帧 Draw Call：主画面 ${snapshot.main} · 阴影 ${snapshot.shadow}` : "等待当前帧绘制统计");
    let shared = false;
    for (const [id, cell] of drawCallCells) {
      const count = snapshot.groups[id];
      cell.textContent = snapshot.ready && count ? `${count.main} / ${count.shadow}` : "—";
      cell.title = count ? `主画面 ${count.main} 次，阴影 ${count.shadow} 次${count.shared ? `，其中 ${count.shared} 次与其他植物共享` : ""}` : "等待当前帧绘制";
      shared ||= !!count?.shared;
    }
    sharedDrawNote.hidden = !shared;
  };
  const unsubscribeDrawCalls = plantLibrary.onDrawCallsChanged(updateDrawCalls);
  const meadowDownload = meadowPanel.querySelector<HTMLAnchorElement>("[data-meadow-download]")!;
  const meadowTextures = new PlantTexturePanel(meadowPanel.querySelector<HTMLElement>("[data-meadow-textures]")!);
  const categoryNames: Record<string, string> = {
    Trees: "乔木与灌木", Grass: "草丛", Flowers: "花卉", Plants: "草本植物",
    CoverPlants: "地被", Leaves: "落叶", Mushrooms: "蘑菇"
  };
  let meadowEntries = plantLibrary.entries;
  for (const category of new Set(meadowEntries.map((entry) => entry.category))) {
    meadowCategory.add(new Option(categoryNames[category] ?? category, category));
  }
  const updateMeadowPanel = () => {
    meadowEntries = plantLibrary.entries;
    const selectedId = meadowAsset.value;
    const snapshot = plantLibrary.getDiagnostics();
    const specimens = new Map(snapshot.specimens.map((item) => [item.id, item]));
    const groups = snapshot.rows.map((row) => {
      const base = meadowEntries.find((item) => item.id === row.baseId)!;
      const members = [row.baseId, ...row.instanceIds].map((id) => specimens.get(id)!)
        .filter((item) => item && (!snapshot.category || item.category === snapshot.category));
      return { ...row, members, displayName: base.displayName ?? base.id };
    }).filter((group) => group.members.length > 0);
    meadowAsset.replaceChildren(new Option("全部主植物", ""),
      ...groups.map((group) => new Option(group.displayName, group.baseId)));
    const selected = groups.find((group) => group.baseId === selectedId || group.instanceIds.includes(selectedId));
    meadowAsset.value = selected?.baseId ?? "";
    const displayed = selected ? [selected] : groups;
    const subset = displayed.flatMap((group) => group.members);
    meadowOutput.textContent = `${subset.reduce((sum, item) => sum + item.triangleCount, 0).toLocaleString()} 三角形`;
    const table = document.createElement("table");
    table.createCaption().textContent = "合批后 Draw Call：主画面 / 阴影";
    const header = table.createTHead().insertRow();
    for (const label of ["主植物", "三角形", "Draw Call"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      header.append(th);
    }
    const body = table.createTBody();
    drawCallCells = new Map(displayed.map((group) => {
      const row = body.insertRow();
      row.dataset.plantGroup = group.id;
      row.insertCell().textContent = group.displayName;
      row.insertCell().textContent = group.members.reduce((sum, item) => sum + item.triangleCount, 0).toLocaleString();
      return [group.id, row.insertCell()] as const;
    }));
    meadowDrawCalls.replaceChildren(table, sharedDrawNote);
    updateDrawCalls();
    const entry = meadowEntries.find((item) => item.id === meadowAsset.value);
    meadowDownload.hidden = !entry?.parameterFile;
    if (entry?.parameterFile) {
      meadowDownload.href = `./generated/procedural-trees/${entry.parameterFile}`;
      meadowDownload.download = entry.parameterFile!;
      meadowDownload.textContent = entry.prototypeId ? "下载共用植被参数 JSON" : "下载当前参数 JSON";
    }
    meadowTextures.render(meadowMaterials.getTexturePreviews([...new Set(subset.map((item) =>
      meadowEntries.find((entry) => entry.id === item.id)?.sourceAssetId ?? item.id))]),
      selected?.displayName ?? categoryNames[snapshot.category] ?? "全部主植物");
  };
  const setMeadowCategory = (category: string): AssetAssemblyBrowserDiagnostics => {
    landscape.clear();
    plantLibrary.setCategory(category);
    meadowCategory.value = category;
    meadowAsset.value = "";
    setView("meadow");
    updateMeadowPanel();
    return diagnostics();
  };
  const focusMeadowAsset = (id: string): AssetAssemblyBrowserDiagnostics => {
    if (!id) { setView("meadow"); updateMeadowPanel(); return diagnostics(); }
    const entry = plantLibrary.entries.find((item) => item.id === id);
    if (!entry) throw new Error(`Unknown plant asset: ${id}`);
    if (meadowCategory.value && meadowCategory.value !== entry.category) setMeadowCategory(entry.category);
    landscape.clear();
    ground.isActive = true;
    groundRenderer.setMaterial(groundMaterial);
    runtime.setView("meadow");
    syncView("meadow");
    const row = plantLibrary.getDiagnostics().rows.find((row) => row.baseId === id || row.instanceIds.includes(id))!;
    meadowAsset.value = row.baseId;
    const bounds = plantLibrary.getRowBounds(id);
    frameBounds(bounds, 0, "meadow");
    updateMeadowPanel();
    return diagnostics();
  };
  const setMeadowLod = async (lod: number): Promise<AssetAssemblyBrowserDiagnostics> => {
    if (runtime.getDiagnostics().view === "landscape") setView("meadow");
    meadowLod.disabled = true;
    meadowOutput.textContent = "正在生成所选 LOD…";
    try {
      await plantLibrary.setLod(lod);
      meadowLod.value = String(lod);
      if (runtime.getDiagnostics().view === "meadow") {
        fitGround(plantLibrary.getBounds());
        focusMeadowAsset(meadowAsset.value);
      }
      updateMeadowPanel();
      return diagnostics();
    } finally { meadowLod.disabled = false; }
  };
  meadowCategory.addEventListener("change", () => setMeadowCategory(meadowCategory.value));
  meadowAsset.addEventListener("change", () => focusMeadowAsset(meadowAsset.value));
  meadowLod.replaceChildren(...Array.from({ length: Math.max(...meadowEntries.map((entry) => entry.lodCount ?? 1)) },
    (_, index) => new Option(`LOD${index}`, String(index))));
  meadowLod.addEventListener("change", () => { void setMeadowLod(Number(meadowLod.value)).catch((error) => {
    meadowOutput.textContent = `LOD 生成失败：${String(error)}`;
    console.error(error);
  }); });
  meadowPanel.querySelector<HTMLButtonElement>("[data-meadow-overview]")!.addEventListener("click", () => {
    meadowAsset.value = "";
    focusMeadowAsset("");
  });
  const publishToken = (token: PopulationTokenV1): AssetAssemblyBrowserDiagnostics => {
    const detached = detachPopulationToken(token);
    const result = runtime.setToken(detached);
    populationTokens[token.category] = detached;
    encodedTokens[token.category] = encodePopulationToken(detached);
    if (token.category === "tree") {
      persistTreePopulationToken(encodedTokens.tree);
      persistInstancedBirchGeometryDistribution(result.birchVariationRow.sharedGeometryDistributionTuning);
    }
    syncAssetPanel(token.category, populationTokens, encodedTokens, result, sourceLibrary);
    return diagnostics();
  };
  const publishTreeRuntimeResult = (result: AssetAssemblyLabDiagnostics): AssetAssemblyBrowserDiagnostics => {
    const token = detachPopulationToken(result.populationTokens.tree) as TreePopulationTokenV1;
    populationTokens.tree = token;
    encodedTokens.tree = encodePopulationToken(token);
    persistTreePopulationToken(encodedTokens.tree);
    persistInstancedBirchGeometryDistribution(result.birchVariationRow.sharedGeometryDistributionTuning);
    syncAssetPanel("tree", populationTokens, encodedTokens, result, sourceLibrary);
    return diagnostics();
  };
  const queueToken = (token: PopulationTokenV1): void => {
    const detached = detachPopulationToken(token);
    populationTokens[token.category] = detached;
    encodedTokens[token.category] = encodePopulationToken(detached);
    const panel = document.querySelector<HTMLDetailsElement>(`.asset-panel[data-category="${token.category}"]`)!;
    requiredTextarea(panel, "token").value = encodedTokens[token.category];
    pendingTokens.set(token.category, detached);
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      const values = [...pendingTokens.values()];
      pendingTokens.clear();
      for (const value of values) publishToken(value);
    });
  };
  const setToken = (category: AssetCategory, encoded: string): AssetAssemblyBrowserDiagnostics => {
    const token = decodePopulationToken(encoded.trim());
    if (token.category !== category) throw new Error(`Token category ${token.category} does not match ${category}`);
    return publishToken(token);
  };
  const setRootSeed = (category: AssetCategory, rootSeed: number): AssetAssemblyBrowserDiagnostics => {
    return publishToken(withPopulationRootSeed(populationTokens[category], rootSeed));
  };
  const setLodQuantity = (category: AssetCategory, lod: number, value: number): AssetAssemblyBrowserDiagnostics => {
    return publishToken(updateLodQuantity(populationTokens[category], lod, value));
  };
  const setBatchPreview = (category: AssetCategory, enabled: boolean): AssetAssemblyBrowserDiagnostics => {
    const current = populationTokens[category];
    const result = publishToken({
      ...current,
      population: { ...current.population, mode: enabled ? "stress-1000" : "standard" }
    } as PopulationTokenV1);
    syncBatchControls(populationTokens);
    return result;
  };
  const setTreeLeafFold = (adjustmentDegrees: number): AssetAssemblyBrowserDiagnostics =>
    publishTreeRuntimeResult(runtime.setTreeLeafFold(adjustmentDegrees));
  const setTreeLeafCardSize = (lengthPercent: number, widthPercent: number): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.setTreeLeafCardTuning({ lengthPercent, widthPercent }));
  };
  const setTreeLeafCounts = (
    lod0Count: number,
    lod1Count: number,
    lod2Count: number,
    lod3Count: number
  ): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.setTreeLeafCountTuning({ lod0Count, lod1Count, lod2Count, lod3Count }));
  };
  const setTreeLeafShadows = (enabled: boolean): AssetAssemblyBrowserDiagnostics => {
    const result = runtime.setTreeLeafShadows(enabled);
    syncAssetPanel("tree", populationTokens, encodedTokens, result, sourceLibrary);
    return diagnostics();
  };
  const setTreeCanopyOcclusion = (
    enabled: boolean,
    density: number,
    colorRgb: readonly [number, number, number]
  ): AssetAssemblyBrowserDiagnostics => {
    const tuning: ProceduralTreeCanopyOcclusionTuning = { enabled, density, colorRgb };
    const result = runtime.setTreeCanopyOcclusionTuning(tuning);
    syncAssetPanel("tree", populationTokens, encodedTokens, result, sourceLibrary);
    return diagnostics();
  };
  const setTreeLeafMaterialVisible = (visible: boolean): AssetAssemblyBrowserDiagnostics => {
    const result = runtime.setTreeLeafMaterialVisible(visible);
    syncAssetPanel("tree", populationTokens, encodedTokens, result, sourceLibrary);
    return diagnostics();
  };
  const setTreeLeafDisplayMode = (mode: ProceduralTreeLeafDisplayMode): AssetAssemblyBrowserDiagnostics => {
    const result = runtime.setTreeLeafDisplayMode(mode);
    syncAssetPanel("tree", populationTokens, encodedTokens, result, sourceLibrary);
    return diagnostics();
  };
  const setBirchVariation = (
    index: number,
    controls: InstancedBirchVariationControls
  ): AssetAssemblyBrowserDiagnostics => {
    const result = runtime.setBirchVariation(index, controls);
    persistInstancedBirchVariationControls(result.birchVariationRow.variations);
    syncAssetPanel("tree", populationTokens, encodedTokens, result, sourceLibrary);
    return diagnostics();
  };
  const resetBirchVariation = (index: number): AssetAssemblyBrowserDiagnostics => {
    const result = runtime.resetBirchVariation(index);
    persistInstancedBirchVariationControls(result.birchVariationRow.variations);
    syncAssetPanel("tree", populationTokens, encodedTokens, result, sourceLibrary);
    return diagnostics();
  };
  const setTreeDistributionTuning = (tuning: ProceduralTreeDistributionTuning): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.setTreeDistributionTuning(tuning));
  };
  const setTreeLeafNodeEdits = (
    edits: readonly ProceduralTreeLeafNodeEdit[]
  ): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.setTreeLeafNodeEdits(edits));
  };
  const setTreeLeafNodeEdit = (edit: ProceduralTreeLeafNodeEdit): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.setTreeLeafNodeEdit(edit));
  };
  const resetTreeLeafNode = (leafId: string): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.resetTreeLeafNode(leafId));
  };
  const setTreeStemNodeEdits = (
    edits: readonly ProceduralTreeStemNodeEdit[]
  ): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.setTreeStemNodeEdits(edits));
  };
  const setTreeStemNodeEdit = (edit: ProceduralTreeStemNodeEdit): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.setTreeStemNodeEdit(edit));
  };
  const resetTreeStemNode = (stemId: string): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.resetTreeStemNode(stemId));
  };
  const resetTreeDistributionTuning = (): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.resetTreeDistributionTuning());
  };
  const setTreeBillboardTuning = (
    billboardSize: number,
    billboardsScale: number,
    inflate: number
  ): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.setTreeBillboardTuning({ billboardSize, billboardsScale, inflate }));
  };
  const setTreeLeafLightingTuning = (tuning: TreeLeafLightingTuning): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.setTreeLeafLightingTuning(tuning));
  };
  const setTreeTrunkMaterialTuning = (tuning: TreeTrunkMaterialTuning): AssetAssemblyBrowserDiagnostics => {
    return publishTreeRuntimeResult(runtime.setTreeTrunkMaterialTuning(tuning));
  };
  const leafTextureRequests = { tree: 0, shrub: 0 };
  const setTreeLeafMask = (maskId: TreeLeafMaskId): AssetAssemblyBrowserDiagnostics => {
    if (!isTreeLeafMaskId(maskId)) throw new Error(`Tree leaf mask "${maskId}" is unavailable`);
    leafTextureRequests.tree++;
    return publishTreeRuntimeResult(runtime.setTreeLeafMask(maskId));
  };
  const setLeafTexture = async (category: "tree" | "shrub", file: File): Promise<AssetAssemblyBrowserDiagnostics> => {
    const request = ++leafTextureRequests[category];
    const { texture, dataUrl } = await loadCustomLeafTexture(engine, file);
    if (request !== leafTextureRequests[category]) {
      texture.destroy();
      return diagnostics();
    }
    try {
      const result = category === "tree"
        ? runtime.setTreeCustomLeafMask(texture, file.name)
        : runtime.setShrubLeafTexture(texture, file.name);
      const preview = document.querySelector<HTMLImageElement>(`[data-category="${category}"] [data-leaf-texture-preview]`)!;
      preview.src = dataUrl;
      preview.hidden = false;
      syncAssetPanel(category, populationTokens, encodedTokens, result, sourceLibrary);
      return diagnostics();
    } catch (error) {
      texture.destroy();
      throw error;
    }
  };
  const resetLeafTexture = (category: "tree" | "shrub"): AssetAssemblyBrowserDiagnostics => {
    leafTextureRequests[category]++;
    if (category === "tree") {
      const recipe = sourceLibrary.treeRecipes.find((candidate) => candidate.id === populationTokens.tree.assetId)!;
      return setTreeLeafMask(recipe.leafMaskId);
    }
    const result = runtime.setShrubLeafTexture(null);
    syncAssetPanel(category, populationTokens, encodedTokens, result, sourceLibrary);
    return diagnostics();
  };

  bindPanels({
    tokens: populationTokens,
    encodedTokens,
    sourceLibrary,
    runtime,
    lighting,
    postProcess,
    camera,
    scene,
    setView,
    queueToken,
    publishToken,
    setToken,
    setRootSeed,
    setLodQuantity,
    setBatchPreview,
    setTreeLeafFold,
    setTreeLeafCardSize,
    setTreeLeafCounts,
    setTreeLeafShadows,
    setTreeCanopyOcclusion,
    setTreeLeafMaterialVisible,
    setTreeLeafDisplayMode,
    setBirchVariation,
    resetBirchVariation,
    setTreeDistributionTuning,
    setTreeLeafNodeEdit,
    setTreeStemNodeEdit,
    resetTreeDistributionTuning,
    setTreeBillboardTuning,
    setTreeLeafLightingTuning,
    setTreeTrunkMaterialTuning,
    setTreeLeafMask,
    setLeafTexture,
    resetLeafTexture,
    diagnostics
  });
  populateTreeRecipes(sourceLibrary, populationTokens.tree as TreePopulationTokenV1);
  syncAllPanels(populationTokens, encodedTokens, runtime.getDiagnostics(), sourceLibrary);
  setMeadowCategory("");
  const initialView = new URLSearchParams(location.search).get("view");
  if (initialView === "assembled" || initialView === "atoms" || initialView === "landscape") setView(initialView);
  syncBatchControls(populationTokens);

  engine.run();
  window.assetAssembly = {
    ready: true,
    getDiagnostics: diagnostics,
    setView,
    setMeadowCategory,
    setMeadowLod,
    focusMeadowAsset,
    setLandscape,
    getLandscape: () => structuredClone({ request: landscape.request, plan: landscape.plan }),
    applySceneDirection,
    getSceneDirection,
    resetSceneDirection,
    setToken,
    setRootSeed,
    setLodQuantity,
    setBatchPreview,
    setTreeLeafFold,
    setTreeLeafCardSize,
    setTreeLeafCounts,
    setTreeLeafShadows,
    setTreeCanopyOcclusion,
    setTreeLeafMaterialVisible,
    setTreeLeafDisplayMode,
    setBirchVariation,
    resetBirchVariation,
    setTreeDistributionTuning,
    setTreeLeafNodeEdits,
    setTreeLeafNodeEdit,
    resetTreeLeafNode,
    setTreeStemNodeEdits,
    setTreeStemNodeEdit,
    resetTreeStemNode,
    resetTreeDistributionTuning,
    setTreeBillboardTuning,
    setTreeLeafLightingTuning,
    setTreeTrunkMaterialTuning,
    setTreeLeafMask,
    setLeafTexture,
    resetLeafTexture,
    setAutomaticDistance: (category, enabled) => {
      runtime.setAutomaticDistance(category, enabled);
      syncAssetPanel(category, populationTokens, encodedTokens, runtime.getDiagnostics(), sourceLibrary);
      return diagnostics();
    },
    setAssetDistanceCulling: (enabled) => {
      runtime.setAssetDistanceCulling(enabled);
      document.querySelector<HTMLInputElement>("#asset-distance-culling")!.checked = enabled;
      return diagnostics();
    },
    setSimulatedDistance: (category, distanceMeters) => {
      runtime.setSimulatedDistance(category, distanceMeters);
      syncAssetPanel(category, populationTokens, encodedTokens, runtime.getDiagnostics(), sourceLibrary);
      return diagnostics();
    },
    playEntranceEffect: (category) => runtime.playEntranceEffect(category)
  };
  document.body.dataset.state = "ready";
  window.addEventListener(
    "beforeunload",
    () => {
      unsubscribeDrawCalls();
      meadowTextures.destroy();
      landscape.clear();
      runtime.destroy();
      meadowMaterials.destroy();
      visibleSky.destroy();
      lighting.destroy();
    },
    { once: true }
  );
}

async function loadCustomLeafTexture(engine: WebGLEngine, file: File): Promise<{ texture: Texture2D; dataUrl: string }> {
  const supportedType = file.type === "image/png" || file.type === "image/webp" || /\.(?:png|webp)$/iu.test(file.name);
  if (!supportedType) throw new Error("请选择带透明通道的 PNG 或 WebP 贴图");
  const dataUrl = await readFileAsDataUrl(file);
  const texture = await engine.resourceManager.load<Texture2D>({
    type: AssetType.Texture,
    url: dataUrl,
    params: {
      isSRGBColorSpace: true,
      mipmap: true,
      filterMode: TextureFilterMode.Trilinear,
      wrapModeU: TextureWrapMode.Clamp,
      wrapModeV: TextureWrapMode.Clamp,
      // Match catalog foliage sampling for narrow, obliquely viewed leaf surfaces.
      anisoLevel: 8
    }
  });
  if (!(texture instanceof Texture2D) || texture.width < 1 || texture.height < 1) {
    texture?.destroy();
    throw new Error("无法读取叶片贴图，请检查图片文件");
  }
  texture.name = `Custom leaf texture · ${file.name}`;
  return { texture, dataUrl };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Leaf mask read returned no URL"))
    );
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Leaf mask file could not be read")));
    reader.readAsDataURL(file);
  });
}

interface PanelBindings {
  readonly tokens: Record<AssetCategory, PopulationTokenV1>;
  readonly encodedTokens: Record<AssetCategory, string>;
  readonly sourceLibrary: AssetAssemblySourceLibrary;
  readonly runtime: AssetAssemblyLabRuntime;
  readonly lighting: ReturnType<typeof createTreeAssemblyGrasslandsLighting>["lighting"];
  readonly postProcess: TerrainPostProcessRuntime;
  readonly camera: Camera;
  readonly scene: Scene;
  readonly setView: (view: AssetAssemblyView) => AssetAssemblyBrowserDiagnostics;
  readonly queueToken: (token: PopulationTokenV1) => void;
  readonly publishToken: (token: PopulationTokenV1) => AssetAssemblyBrowserDiagnostics;
  readonly setToken: (category: AssetCategory, token: string) => AssetAssemblyBrowserDiagnostics;
  readonly setLodQuantity: (category: AssetCategory, lod: number, value: number) => AssetAssemblyBrowserDiagnostics;
  readonly setRootSeed: (category: AssetCategory, seed: number) => AssetAssemblyBrowserDiagnostics;
  readonly setBatchPreview: (category: AssetCategory, enabled: boolean) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeLeafFold: (adjustmentDegrees: number) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeLeafCardSize: (lengthPercent: number, widthPercent: number) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeLeafCounts: (
    lod0Count: number,
    lod1Count: number,
    lod2Count: number,
    lod3Count: number
  ) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeLeafShadows: (enabled: boolean) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeCanopyOcclusion: (
    enabled: boolean,
    density: number,
    colorRgb: readonly [number, number, number]
  ) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeLeafMaterialVisible: (visible: boolean) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeLeafDisplayMode: (mode: ProceduralTreeLeafDisplayMode) => AssetAssemblyBrowserDiagnostics;
  readonly setBirchVariation: (
    index: number,
    controls: InstancedBirchVariationControls
  ) => AssetAssemblyBrowserDiagnostics;
  readonly resetBirchVariation: (index: number) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeDistributionTuning: (tuning: ProceduralTreeDistributionTuning) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeLeafNodeEdit: (edit: ProceduralTreeLeafNodeEdit) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeStemNodeEdit: (edit: ProceduralTreeStemNodeEdit) => AssetAssemblyBrowserDiagnostics;
  readonly resetTreeDistributionTuning: () => AssetAssemblyBrowserDiagnostics;
  readonly setTreeBillboardTuning: (
    billboardSize: number,
    billboardsScale: number,
    inflate: number
  ) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeLeafLightingTuning: (tuning: TreeLeafLightingTuning) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeTrunkMaterialTuning: (tuning: TreeTrunkMaterialTuning) => AssetAssemblyBrowserDiagnostics;
  readonly setTreeLeafMask: (maskId: TreeLeafMaskId) => AssetAssemblyBrowserDiagnostics;
  readonly setLeafTexture: AssetAssemblyApi["setLeafTexture"];
  readonly resetLeafTexture: AssetAssemblyApi["resetLeafTexture"];
  readonly diagnostics: () => AssetAssemblyBrowserDiagnostics;
}

function bindPanels(bindings: PanelBindings): void {
  document.querySelectorAll<HTMLInputElement>('[data-field="size"]').forEach((input) => {
    input.min = String(ASSET_SIZE_PERCENT_MIN);
    input.max = String(ASSET_SIZE_PERCENT_MAX);
  });
  document.querySelectorAll<HTMLInputElement>('[data-field^="leaf-count-lod"]').forEach((input) => {
    input.min = String(PROCEDURAL_TREE_LEAF_COUNT_MIN);
    input.max = String(PROCEDURAL_TREE_LEAF_COUNT_MAX);
  });
  setInputRange("tree-variation-horizontal-scale", INSTANCED_BIRCH_VARIATION_LIMITS.horizontalScale, 100);
  setInputRange("tree-variation-vertical-scale", INSTANCED_BIRCH_VARIATION_LIMITS.verticalScale, 100);
  setInputRange("tree-variation-yaw", INSTANCED_BIRCH_VARIATION_LIMITS.yawDegrees);
  setInputRange("tree-variation-branch-length", INSTANCED_BIRCH_VARIATION_LIMITS.branchLengthScale, 100);
  setInputRange("tree-variation-branch-curvature", INSTANCED_BIRCH_VARIATION_LIMITS.branchCurvatureDegreesPerMeter);
  setInputRange("tree-variation-branch-density", INSTANCED_BIRCH_VARIATION_LIMITS.branchDensity, 100);
  setInputRange("tree-variation-leaf-density", INSTANCED_BIRCH_VARIATION_LIMITS.leafDensity, 100);
  setInputRange("tree-variation-leaf-size", INSTANCED_BIRCH_VARIATION_LIMITS.leafSizeScale, 100);
  document.querySelectorAll<HTMLButtonElement>("button[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view as AssetAssemblyView;
      bindings.setView(view);
    });
  });
  document.querySelectorAll<HTMLDetailsElement>(".asset-panel").forEach((panel) => {
    const category = panel.dataset.category as AssetCategory;
    const panelToken = bindings.tokens[category];
    if (usesPopulationQuantityControls(category)) {
      populateLodQuantityControls(panel, panelToken);
    }
    const size = requiredInput(panel, "size");
    const color = requiredInput(panel, "color");
    const tokenInput = requiredTextarea(panel, "token");
    const seedError = panel.querySelector<HTMLElement>("[data-seed-error]")!;
    size.addEventListener("input", () => {
      if (size.value === "" || !size.validity.valid) return;
      bindings.queueToken(updateSize(bindings.tokens[category], size.valueAsNumber));
    });
    panel.querySelectorAll<HTMLButtonElement>("[data-size-factor]").forEach((button) => {
      button.addEventListener("click", () => {
        const sizePercent = Math.round(bindings.tokens[category].sizePercent * Number(button.dataset.sizeFactor));
        bindings.queueToken(updateSize(bindings.tokens[category],
          Math.min(ASSET_SIZE_PERCENT_MAX, Math.max(ASSET_SIZE_PERCENT_MIN, sizePercent))));
      });
    });
    panel.querySelector<HTMLButtonElement>('[data-action="reset-size"]')?.addEventListener("click", () => {
      bindings.queueToken(updateSize(bindings.tokens[category], 100));
    });
    color.addEventListener("input", () => bindings.queueToken(updateColor(bindings.tokens[category], color.value)));
    tokenInput.addEventListener("change", () => {
      seedError.hidden = true;
      try {
        bindings.setToken(category, tokenInput.value);
      } catch (error) {
        seedError.textContent = error instanceof Error ? error.message : String(error);
        seedError.hidden = false;
      }
    });
    panel.querySelector<HTMLButtonElement>('[data-action="new-seed"]')!.addEventListener("click", () => {
      const entropy = crypto.getRandomValues(new Uint32Array(1))[0];
      bindings.setRootSeed(category, entropy);
    });
    panel.querySelectorAll<HTMLInputElement>('[data-field="lod-quantity"]').forEach((quantity) => {
      quantity.addEventListener("input", () => {
        const lod = Number(quantity.dataset.lod);
        bindings.queueToken(updateLodQuantity(bindings.tokens[category], lod, quantity.valueAsNumber));
      });
    });
    bindDistancePreview(panel, category, bindings);
    if (category === "tree" || category === "shrub") bindLeafTextureUpload(panel, category, bindings);
    panel.querySelector<HTMLButtonElement>('[data-action="play-entrance"]')!.addEventListener("click", () => {
      void bindings.runtime.playEntranceEffect(category);
    });
    panel.querySelectorAll<HTMLButtonElement>("[data-batch-count]").forEach((button) => {
      button.addEventListener("click", () => {
        bindings.setBatchPreview(category, button.dataset.batchCount === "1000");
      });
    });
    if (category === "tree") {
      const trunkBaseColor = requiredInput(panel, "trunk-base-color");
      const trunkTiling = requiredInput(panel, "trunk-tiling");
      const trunkNormalStrength = requiredInput(panel, "trunk-normal-strength");
      const trunkSmoothness = requiredInput(panel, "trunk-smoothness");
      const trunkMetallic = requiredInput(panel, "trunk-metallic");
      const trunkGradientBottomColor = requiredInput(panel, "trunk-gradient-bottom-color");
      const trunkGradientBottomStrength = requiredInput(panel, "trunk-gradient-bottom-strength");
      const trunkGradientTopColor = requiredInput(panel, "trunk-gradient-top-color");
      const trunkGradientTopStrength = requiredInput(panel, "trunk-gradient-top-strength");
      const trunkMaterialNumericInputs = [
        trunkTiling,
        trunkNormalStrength,
        trunkSmoothness,
        trunkMetallic,
        trunkGradientBottomStrength,
        trunkGradientTopStrength
      ];
      const publishTrunkMaterialTuning = (): void => {
        if (
          trunkMaterialNumericInputs.some(
            (input) => input.value === "" || !input.validity.valid || !Number.isFinite(input.valueAsNumber)
          )
        ) {
          return;
        }
        bindings.setTreeTrunkMaterialTuning({
          baseColorRgb: hexToColor(trunkBaseColor.value),
          tiling: trunkTiling.valueAsNumber,
          normalStrength: trunkNormalStrength.valueAsNumber,
          smoothness: trunkSmoothness.valueAsNumber,
          metallic: trunkMetallic.valueAsNumber,
          verticalGradientBottomColorRgb: hexToColor(trunkGradientBottomColor.value),
          verticalGradientBottomStrength: trunkGradientBottomStrength.valueAsNumber,
          verticalGradientTopColorRgb: hexToColor(trunkGradientTopColor.value),
          verticalGradientTopStrength: trunkGradientTopStrength.valueAsNumber
        });
      };
      trunkMaterialNumericInputs.forEach((input) => input.addEventListener("input", publishTrunkMaterialTuning));
      [trunkBaseColor, trunkGradientBottomColor, trunkGradientTopColor].forEach((input) =>
        input.addEventListener("input", publishTrunkMaterialTuning)
      );
      const leafFold = requiredInput(panel, "leaf-fold");
      let pendingLeafFoldFrame = 0;
      leafFold.addEventListener("input", () => {
        if (pendingLeafFoldFrame || leafFold.value === "" || !leafFold.validity.valid) return;
        pendingLeafFoldFrame = requestAnimationFrame(() => {
          pendingLeafFoldFrame = 0;
          bindings.setTreeLeafFold(leafFold.valueAsNumber);
        });
      });
      panel.querySelector('[data-action="reset-leaf-fold"]')!.addEventListener("click", () => {
        cancelAnimationFrame(pendingLeafFoldFrame);
        pendingLeafFoldFrame = 0;
        bindings.setTreeLeafFold(0);
      });
      const leafLength = requiredInput(panel, "leaf-length");
      const leafWidth = requiredInput(panel, "leaf-width");
      const publishLeafCardSize = (): void => {
        bindings.setTreeLeafCardSize(leafLength.valueAsNumber, leafWidth.valueAsNumber);
      };
      leafLength.addEventListener("input", publishLeafCardSize);
      leafWidth.addEventListener("input", publishLeafCardSize);
      const leafCounts = [
        requiredInput(panel, "leaf-count-lod0"),
        requiredInput(panel, "leaf-count-lod1"),
        requiredInput(panel, "leaf-count-lod2"),
        requiredInput(panel, "leaf-count-lod3")
      ] as const;
      const publishLeafCounts = (): void => {
        if (leafCounts.some((input) => input.value === "" || !input.validity.valid)) return;
        bindings.setTreeLeafCounts(
          leafCounts[0].valueAsNumber,
          leafCounts[1].valueAsNumber,
          leafCounts[2].valueAsNumber,
          leafCounts[3].valueAsNumber
        );
      };
      leafCounts.forEach((input) => input.addEventListener("change", publishLeafCounts));
      requiredInput(panel, "leaf-cast-shadows").addEventListener("change", (event) => {
        bindings.setTreeLeafShadows((event.currentTarget as HTMLInputElement).checked);
      });
      const canopyOcclusionEnabled = requiredInput(panel, "canopy-occlusion-enabled");
      const canopyOcclusionDensity = requiredInput(panel, "canopy-occlusion-density");
      const canopyOcclusionColor = requiredInput(panel, "canopy-occlusion-color");
      const publishCanopyOcclusion = (): void => {
        if (canopyOcclusionDensity.value === "" || !canopyOcclusionDensity.validity.valid) return;
        bindings.setTreeCanopyOcclusion(
          canopyOcclusionEnabled.checked,
          canopyOcclusionDensity.valueAsNumber,
          hexToColor(canopyOcclusionColor.value)
        );
      };
      canopyOcclusionEnabled.addEventListener("change", publishCanopyOcclusion);
      canopyOcclusionDensity.addEventListener("input", publishCanopyOcclusion);
      canopyOcclusionColor.addEventListener("input", publishCanopyOcclusion);
      panel.querySelectorAll<HTMLButtonElement>("[data-leaf-display-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          bindings.setTreeLeafDisplayMode(button.dataset.leafDisplayMode as ProceduralTreeLeafDisplayMode);
        });
      });
      const distributionError = panel.querySelector<HTMLElement>("[data-tree-distribution-error]")!;
      const publishDistributionTuning = (): void => {
        const inputs = TREE_DISTRIBUTION_NUMBER_FIELDS.map((field) => requiredInput(panel, field));
        const hasUnusableValue = inputs.some(
          (input) =>
            input.value === "" ||
            !Number.isFinite(input.valueAsNumber) ||
            input.validity.badInput ||
            input.validity.rangeUnderflow ||
            input.validity.rangeOverflow
        );
        if (hasUnusableValue) return;
        distributionError.hidden = true;
        try {
          bindings.setTreeDistributionTuning(readTreeDistributionTuning(panel));
        } catch (error) {
          distributionError.textContent = error instanceof Error ? error.message : String(error);
          distributionError.hidden = false;
          syncTreeDistributionControls(panel, bindings.diagnostics().tree);
        }
      };
      TREE_DISTRIBUTION_NUMBER_FIELDS.forEach((field) =>
        requiredInput(panel, field).addEventListener("input", publishDistributionTuning)
      );
      requiredSelect(panel, "tree-leaf-distribution").addEventListener("change", publishDistributionTuning);
      panel
        .querySelector<HTMLButtonElement>('[data-action="new-tree-geometry-seed"]')!
        .addEventListener("click", () => {
          requiredInput(panel, "tree-geometry-seed").valueAsNumber = crypto.getRandomValues(new Uint32Array(1))[0];
          publishDistributionTuning();
        });
      panel
        .querySelector<HTMLButtonElement>('[data-action="reset-tree-distribution"]')!
        .addEventListener("click", () => {
          distributionError.hidden = true;
          try {
            bindings.resetTreeDistributionTuning();
          } catch (error) {
            distributionError.textContent = error instanceof Error ? error.message : String(error);
            distributionError.hidden = false;
          }
        });
      bindTreeNodeEditor(panel, bindings);
      const billboardSize = requiredInput(panel, "billboard-size");
      const billboardsScale = requiredInput(panel, "billboards-scale");
      const inflate = requiredInput(panel, "inflate");
      const publishBillboardTuning = (): void => {
        const inputs = [billboardSize, billboardsScale, inflate];
        if (inputs.some((input) => input.value === "" || !Number.isFinite(input.valueAsNumber))) return;
        bindings.setTreeBillboardTuning(
          billboardSize.valueAsNumber,
          billboardsScale.valueAsNumber,
          inflate.valueAsNumber
        );
      };
      billboardSize.addEventListener("input", publishBillboardTuning);
      billboardsScale.addEventListener("input", publishBillboardTuning);
      inflate.addEventListener("input", publishBillboardTuning);
      const leafBaseColor = requiredInput(panel, "leaf-base-color");
      const leafSecondColor = requiredInput(panel, "leaf-second-color");
      const translucencyColor = requiredInput(panel, "translucency-color");
      const secondColorLevel = requiredInput(panel, "second-color-level");
      const secondColorGradient = requiredInput(panel, "second-color-gradient");
      const albedoBrightness = requiredInput(panel, "albedo-brightness");
      const albedoDesaturation = requiredInput(panel, "albedo-desaturation");
      const albedoTextureBlend = requiredInput(panel, "albedo-texture-blend");
      const baseAoInfluence = requiredInput(panel, "base-ao-influence");
      const glancingAngleCut = requiredInput(panel, "glancing-angle-cut");
      const flipBackfaceNormals = requiredInput(panel, "flip-backface-normals");
      const translucencyIntensity = requiredInput(panel, "translucency-intensity");
      const translucencyAoInfluence = requiredInput(panel, "translucency-ao-influence");
      const normalDistortion = requiredInput(panel, "normal-distortion");
      const scatteringExponent = requiredInput(panel, "scattering-exponent");
      const directStrength = requiredInput(panel, "direct-strength");
      const ambientStrength = requiredInput(panel, "ambient-strength");
      const shadowStrength = requiredInput(panel, "shadow-strength");
      const leafLightingNumericInputs = [
        secondColorLevel,
        secondColorGradient,
        albedoBrightness,
        albedoDesaturation,
        albedoTextureBlend,
        baseAoInfluence,
        glancingAngleCut,
        translucencyIntensity,
        translucencyAoInfluence,
        normalDistortion,
        scatteringExponent,
        directStrength,
        ambientStrength,
        shadowStrength
      ];
      const publishLeafLightingTuning = (): void => {
        if (leafLightingNumericInputs.some((input) => input.value === "" || !Number.isFinite(input.valueAsNumber))) {
          return;
        }
        bindings.setTreeLeafLightingTuning({
          baseColorRgb: hexToColor(leafBaseColor.value),
          secondColorRgb: hexToColor(leafSecondColor.value),
          translucencyColorRgb: hexToColor(translucencyColor.value),
          secondColorLevel: secondColorLevel.valueAsNumber,
          secondColorGradient: secondColorGradient.valueAsNumber,
          albedoBrightness: albedoBrightness.valueAsNumber,
          albedoDesaturation: albedoDesaturation.valueAsNumber,
          albedoTextureBlend: albedoTextureBlend.valueAsNumber,
          baseAoInfluence: baseAoInfluence.valueAsNumber,
          glancingAngleCut: glancingAngleCut.valueAsNumber,
          flipBackfaceNormals: flipBackfaceNormals.checked,
          translucencyIntensity: translucencyIntensity.valueAsNumber,
          translucencyAoInfluence: translucencyAoInfluence.valueAsNumber,
          normalDistortion: normalDistortion.valueAsNumber,
          scatteringExponent: scatteringExponent.valueAsNumber,
          directStrength: directStrength.valueAsNumber,
          ambientStrength: ambientStrength.valueAsNumber,
          shadowStrength: shadowStrength.valueAsNumber
        });
      };
      leafLightingNumericInputs.forEach((input) => input.addEventListener("input", publishLeafLightingTuning));
      leafBaseColor.addEventListener("input", publishLeafLightingTuning);
      leafSecondColor.addEventListener("input", publishLeafLightingTuning);
      translucencyColor.addEventListener("input", publishLeafLightingTuning);
      flipBackfaceNormals.addEventListener("change", publishLeafLightingTuning);
      const leafMaskError = panel.querySelector<HTMLElement>("[data-leaf-mask-error]")!;
      requiredSelect(panel, "leaf-mask").addEventListener("change", (event) => {
        const maskId = (event.currentTarget as HTMLSelectElement).value;
        if (!isTreeLeafMaskId(maskId)) throw new Error(`Tree leaf mask "${maskId}" is unavailable`);
        leafMaskError.hidden = true;
        bindings.setTreeLeafMask(maskId);
      });
    }
  });

  document
    .querySelector<HTMLSelectElement>('[data-category="tree"] [data-field="asset"]')!
    .addEventListener("change", (event) => {
      const recipe = bindings.sourceLibrary.treeRecipes.find(
        (candidate) => candidate.id === (event.currentTarget as HTMLSelectElement).value
      );
      if (!recipe) throw new Error("Selected production tree recipe is unavailable");
      // A base-tree change starts visual acceptance at LOD0. Distance stepping remains
      // available below for checking the accepted LOD1-LOD3 transitions afterwards.
      bindings.runtime.setAutomaticDistance("tree", false);
      bindings.runtime.setSimulatedDistance("tree", 0);
      const fallback = withTreePopulationAsset(
        createDefaultPopulationToken("tree", bindings.sourceLibrary) as TreePopulationTokenV1,
        recipe.id,
        bindings.sourceLibrary
      );
      bindings.queueToken(
        createCanonicalTreePopulationToken(bindings.sourceLibrary, fallback)
      );
    });

  const time = document.querySelector<HTMLInputElement>("#time")!;
  const initialLighting = bindings.lighting.getSnapshot();
  time.valueAsNumber = initialLighting.timeHours;
  document.querySelector<HTMLOutputElement>('[data-output="time"]')!.textContent =
    `${initialLighting.timeHours.toFixed(1)} h`;
  document.querySelector<HTMLInputElement>("#time-playing")!.checked = initialLighting.playing;
  time.addEventListener("input", () => {
    bindings.lighting.setTuning({ timeHours: time.valueAsNumber });
    document.querySelector<HTMLOutputElement>('[data-output="time"]')!.textContent =
      `${time.valueAsNumber.toFixed(1)} h`;
  });
  document.querySelector<HTMLInputElement>("#time-playing")!.addEventListener("change", (event) => {
    bindings.lighting.setTuning({ playing: (event.currentTarget as HTMLInputElement).checked });
  });
  document.querySelector<HTMLInputElement>("#shadows")!.addEventListener("change", (event) => {
    const enabled = (event.currentTarget as HTMLInputElement).checked;
    bindings.scene.castShadows = enabled;
    bindings.runtime.setShadows(enabled);
  });
  document.querySelector<HTMLInputElement>("#asset-distance-culling")!.addEventListener("change", (event) => {
    bindings.runtime.setAssetDistanceCulling((event.currentTarget as HTMLInputElement).checked);
  });
  bindPostProcessControls(bindings.camera, bindings.postProcess);
}

function bindPostProcessControls(camera: Camera, postProcess: TerrainPostProcessRuntime): void {
  const snapshot = postProcess.getDebugSnapshot();
  const hdr = document.querySelector<HTMLInputElement>("#camera-hdr")!;
  const enabled = document.querySelector<HTMLInputElement>("#post-process-enabled")!;
  const tonemapping = document.querySelector<HTMLInputElement>("#tonemapping-enabled")!;
  const mode = document.querySelector<HTMLSelectElement>("#tonemapping-mode")!;
  const bloom = document.querySelector<HTMLInputElement>("#bloom-enabled")!;
  const threshold = document.querySelector<HTMLInputElement>("#bloom-threshold")!;
  const intensity = document.querySelector<HTMLInputElement>("#bloom-intensity")!;
  const scatter = document.querySelector<HTMLInputElement>("#bloom-scatter")!;
  hdr.checked = true;
  camera.enableHDR = true;
  enabled.checked = snapshot.enabled;
  tonemapping.checked = snapshot.tonemapping;
  mode.value = snapshot.tonemappingMode === TonemappingMode.ACES ? "aces" : "neutral";
  bloom.checked = snapshot.bloom.enabled;
  threshold.valueAsNumber = snapshot.bloom.threshold;
  intensity.valueAsNumber = snapshot.bloom.intensity;
  scatter.valueAsNumber = snapshot.bloom.scatter;
  syncPostProcessOutputs(snapshot.bloom.threshold, snapshot.bloom.intensity, snapshot.bloom.scatter);

  hdr.addEventListener("change", () => (camera.enableHDR = hdr.checked));
  enabled.addEventListener("change", () => postProcess.setProfileEnabled(enabled.checked));
  tonemapping.addEventListener("change", () => postProcess.setTonemappingEnabled(tonemapping.checked));
  mode.addEventListener("change", () =>
    postProcess.setTonemappingMode(mode.value === "aces" ? TonemappingMode.ACES : TonemappingMode.Neutral)
  );
  bloom.addEventListener("change", () => postProcess.setBloomEnabled(bloom.checked));
  threshold.addEventListener("input", () => {
    postProcess.setBloomThreshold(threshold.valueAsNumber);
    syncPostProcessOutputs(threshold.valueAsNumber, intensity.valueAsNumber, scatter.valueAsNumber);
  });
  intensity.addEventListener("input", () => {
    postProcess.setBloomIntensity(intensity.valueAsNumber);
    syncPostProcessOutputs(threshold.valueAsNumber, intensity.valueAsNumber, scatter.valueAsNumber);
  });
  scatter.addEventListener("input", () => {
    postProcess.setBloomScatter(scatter.valueAsNumber);
    syncPostProcessOutputs(threshold.valueAsNumber, intensity.valueAsNumber, scatter.valueAsNumber);
  });
}

function syncPostProcessOutputs(threshold: number, intensity: number, scatter: number): void {
  document.querySelector<HTMLOutputElement>('[data-output="bloom-threshold"]')!.textContent = threshold.toFixed(2);
  document.querySelector<HTMLOutputElement>('[data-output="bloom-intensity"]')!.textContent = intensity.toFixed(2);
  document.querySelector<HTMLOutputElement>('[data-output="bloom-scatter"]')!.textContent = scatter.toFixed(2);
}

function syncAllPanels(
  tokens: Record<AssetCategory, PopulationTokenV1>,
  encodedTokens: Record<AssetCategory, string>,
  diagnostics: AssetAssemblyLabDiagnostics,
  sourceLibrary: AssetAssemblySourceLibrary
): void {
  for (const category of CATEGORIES) {
    syncAssetPanel(category, tokens, encodedTokens, diagnostics, sourceLibrary);
  }
}

function syncAssetPanel(
  category: AssetCategory,
  tokens: Record<AssetCategory, PopulationTokenV1>,
  encodedTokens: Record<AssetCategory, string>,
  diagnostics: AssetAssemblyLabDiagnostics,
  sourceLibrary: AssetAssemblySourceLibrary
): void {
  const panel = document.querySelector<HTMLDetailsElement>(`.asset-panel[data-category="${category}"]`)!;
  const token = tokens[category];
  requiredTextarea(panel, "token").value = encodedTokens[category];
  requiredInput(panel, "size").valueAsNumber = token.sizePercent;
  requiredOutput(panel, "size").textContent = `${token.sizePercent}%`;
  requiredInput(panel, "color").value = colorToHex(token.colorRgb);
  if (usesPopulationQuantityControls(category)) {
    panel.querySelectorAll<HTMLInputElement>('[data-field="lod-quantity"]').forEach((input) => {
      const lod = Number(input.dataset.lod);
      const value = token.lodProfile.values[lod];
      input.valueAsNumber = value;
      requiredOutput(panel, `lod-quantity-${lod}`).textContent =
        token.lodProfile.metric === PopulationLodMetric.DensityPercent ? `${value}%` : String(value);
    });
  }
  const automatic =
    category === "tree" ? diagnostics.tree.lod.automaticDistance : diagnostics.vegetation[category].automaticDistance;
  const distance =
    category === "tree" ? diagnostics.tree.lod.simulatedDistance : diagnostics.vegetation[category].simulatedDistance;
  requiredInput(panel, "auto-lod").checked = automatic;
  requiredInput(panel, "lod-distance").disabled = automatic;
  requiredInput(panel, "lod-distance").valueAsNumber = distance;
  requiredOutput(panel, "lod-distance").textContent = `${distance.toFixed(1)} m`;
  if (category === "tree") {
    requiredSelect(panel, "asset").value = token.assetId;
    const recipe = sourceLibrary.treeRecipes.find((candidate) => candidate.id === token.assetId)!;
    for (const mask of sourceLibrary.treeLeafMasks) {
      const option = requiredSelect(panel, "leaf-mask").querySelector<HTMLOptionElement>(`option[value="${mask.id}"]`);
      if (option) option.textContent = mask.id === recipe.leafMaskId && recipe.leafMaskLabel
        ? `${recipe.leafMaskLabel} · 默认`
        : mask.label;
    }
    panel.querySelector<HTMLOutputElement>("[data-summary]")!.textContent = `${recipe.label} · ${token.sizePercent}%`;
    const tree = diagnostics.tree;
    requiredInput(panel, "leaf-fold").valueAsNumber = tree.proceduralLeafFoldAdjustmentDegrees;
    requiredInput(panel, "leaf-fold").disabled = tree.proceduralLeafNodeParameters.length === 0;
    requiredInput(panel, "leaf-length").valueAsNumber = tree.proceduralLeafCardSizePercent.lengthPercent;
    requiredInput(panel, "leaf-width").valueAsNumber = tree.proceduralLeafCardSizePercent.widthPercent;
    requiredInput(panel, "leaf-count-lod0").valueAsNumber = tree.proceduralLeafCountTuning.lod0Count;
    requiredInput(panel, "leaf-count-lod1").valueAsNumber = tree.proceduralLeafCountTuning.lod1Count;
    requiredInput(panel, "leaf-count-lod2").valueAsNumber = tree.proceduralLeafCountTuning.lod2Count;
    requiredInput(panel, "leaf-count-lod3").valueAsNumber = tree.proceduralLeafCountTuning.lod3Count;
    requiredInput(panel, "leaf-cast-shadows").checked = tree.proceduralLeafCastShadows;
    requiredInput(panel, "canopy-occlusion-enabled").checked = tree.proceduralCanopyOcclusion.enabled;
    requiredInput(panel, "canopy-occlusion-density").valueAsNumber = tree.proceduralCanopyOcclusion.density;
    requiredInput(panel, "canopy-occlusion-color").value = colorToHex(tree.proceduralCanopyOcclusion.colorRgb);
    requiredOutput(panel, "canopy-occlusion-color").textContent = colorToHex(
      tree.proceduralCanopyOcclusion.colorRgb
    );
    requiredOutput(panel, "canopy-occlusion-density").textContent = formatMaterialValue(
      tree.proceduralCanopyOcclusion.density
    );
    const canopyDepth = tree.proceduralCanopyOcclusion.opticalDepth;
    const canopyVisibility = tree.proceduralCanopyOcclusion.ambientVisibility;
    panel.querySelector<HTMLElement>("[data-procedural-canopy-occlusion-metrics]")!.textContent =
      `${tree.proceduralCanopyOcclusion.leafCount} retained LOD cards · ` +
      `optical depth min/mean/max ${canopyDepth.map(formatMaterialValue).join(" / ")} · ` +
      `ambient visibility ${canopyVisibility.map(formatMaterialValue).join(" / ")}`;
    panel.querySelectorAll<HTMLButtonElement>("[data-leaf-display-mode]").forEach((button) => {
      button.dataset.active = String(button.dataset.leafDisplayMode === tree.proceduralLeafDisplayMode);
    });
    panel.querySelector<HTMLElement>("[data-leaf-material-status]")!.textContent =
      tree.proceduralLeafDisplayMode === "material"
        ? "Textured Alpha-Test leaf material is visible."
        : tree.proceduralLeafDisplayMode === "raw-cards"
          ? "RAW CARDS · untextured opaque rectangles · material WPO disabled."
          : "VERTEX NORMALS · view-space XYZ encoded as RGB · no texture or lighting.";
    requiredInput(panel, "trunk-base-color").value = colorToHex(tree.proceduralTrunkMaterial.baseColorRgb);
    requiredInput(panel, "trunk-tiling").valueAsNumber = tree.proceduralTrunkMaterial.tiling;
    requiredInput(panel, "trunk-normal-strength").valueAsNumber = tree.proceduralTrunkMaterial.normalStrength;
    requiredInput(panel, "trunk-smoothness").valueAsNumber = tree.proceduralTrunkMaterial.smoothness;
    requiredInput(panel, "trunk-metallic").valueAsNumber = tree.proceduralTrunkMaterial.metallic;
    requiredInput(panel, "trunk-gradient-bottom-color").value = colorToHex(
      tree.proceduralTrunkMaterial.verticalGradientBottomColorRgb
    );
    requiredInput(panel, "trunk-gradient-bottom-strength").valueAsNumber =
      tree.proceduralTrunkMaterial.verticalGradientBottomStrength;
    requiredInput(panel, "trunk-gradient-top-color").value = colorToHex(
      tree.proceduralTrunkMaterial.verticalGradientTopColorRgb
    );
    requiredInput(panel, "trunk-gradient-top-strength").valueAsNumber =
      tree.proceduralTrunkMaterial.verticalGradientTopStrength;
    for (const field of [
      ["trunk-tiling", tree.proceduralTrunkMaterial.tiling],
      ["trunk-normal-strength", tree.proceduralTrunkMaterial.normalStrength],
      ["trunk-smoothness", tree.proceduralTrunkMaterial.smoothness],
      ["trunk-metallic", tree.proceduralTrunkMaterial.metallic],
      ["trunk-gradient-bottom-strength", tree.proceduralTrunkMaterial.verticalGradientBottomStrength],
      ["trunk-gradient-top-strength", tree.proceduralTrunkMaterial.verticalGradientTopStrength]
    ] as const) {
      requiredOutput(panel, field[0]).textContent = formatMaterialValue(field[1]);
    }
    panel.querySelector<HTMLElement>("[data-procedural-trunk-material-metrics]")!.textContent =
      `Base ${colorToHex(tree.proceduralTrunkMaterial.baseColorRgb)} · ` +
      `UV ${formatMaterialValue(tree.proceduralTrunkMaterial.tiling)} · ` +
      `Normal ${formatMaterialValue(tree.proceduralTrunkMaterial.normalStrength)} · ` +
      `Smooth ${formatMaterialValue(tree.proceduralTrunkMaterial.smoothness)} · ` +
      `Metal ${formatMaterialValue(tree.proceduralTrunkMaterial.metallic)} · ` +
      `Bottom ${colorToHex(tree.proceduralTrunkMaterial.verticalGradientBottomColorRgb)} × ` +
      `${formatMaterialValue(tree.proceduralTrunkMaterial.verticalGradientBottomStrength)} · ` +
      `Top ${colorToHex(tree.proceduralTrunkMaterial.verticalGradientTopColorRgb)} × ` +
      `${formatMaterialValue(tree.proceduralTrunkMaterial.verticalGradientTopStrength)}`;
    syncTreeDistributionControls(panel, tree);
    syncTreeNodeEditor(panel, tree);
    requiredInput(panel, "billboard-size").valueAsNumber = tree.proceduralBillboard.billboardSize;
    requiredInput(panel, "billboards-scale").valueAsNumber = tree.proceduralBillboard.billboardsScale;
    requiredInput(panel, "inflate").valueAsNumber = tree.proceduralBillboard.inflate;
    requiredInput(panel, "leaf-base-color").value = colorToHex(tree.proceduralLeafLighting.baseColorRgb);
    requiredInput(panel, "leaf-second-color").value = colorToHex(tree.proceduralLeafLighting.secondColorRgb);
    requiredInput(panel, "translucency-color").value = colorToHex(tree.proceduralLeafLighting.translucencyColorRgb);
    requiredInput(panel, "second-color-level").valueAsNumber = tree.proceduralLeafLighting.secondColorLevel;
    requiredInput(panel, "second-color-gradient").valueAsNumber = tree.proceduralLeafLighting.secondColorGradient;
    requiredInput(panel, "albedo-brightness").valueAsNumber = tree.proceduralLeafLighting.albedoBrightness;
    requiredInput(panel, "albedo-desaturation").valueAsNumber = tree.proceduralLeafLighting.albedoDesaturation;
    requiredInput(panel, "albedo-texture-blend").valueAsNumber = tree.proceduralLeafLighting.albedoTextureBlend;
    requiredInput(panel, "base-ao-influence").valueAsNumber = tree.proceduralLeafLighting.baseAoInfluence;
    requiredInput(panel, "glancing-angle-cut").valueAsNumber = tree.proceduralLeafLighting.glancingAngleCut;
    requiredInput(panel, "flip-backface-normals").checked = tree.proceduralLeafLighting.flipBackfaceNormals;
    requiredInput(panel, "translucency-intensity").valueAsNumber = tree.proceduralLeafLighting.translucencyIntensity;
    requiredInput(panel, "translucency-ao-influence").valueAsNumber =
      tree.proceduralLeafLighting.translucencyAoInfluence;
    requiredInput(panel, "normal-distortion").valueAsNumber = tree.proceduralLeafLighting.normalDistortion;
    requiredInput(panel, "scattering-exponent").valueAsNumber = tree.proceduralLeafLighting.scatteringExponent;
    requiredInput(panel, "direct-strength").valueAsNumber = tree.proceduralLeafLighting.directStrength;
    requiredInput(panel, "ambient-strength").valueAsNumber = tree.proceduralLeafLighting.ambientStrength;
    requiredInput(panel, "shadow-strength").valueAsNumber = tree.proceduralLeafLighting.shadowStrength;
    syncLeafMaskControl(panel, tree);
    requiredOutput(panel, "leaf-fold").textContent = `${tree.proceduralLeafFoldAdjustmentDegrees}°`;
    requiredOutput(panel, "leaf-length").textContent = `${tree.proceduralLeafCardSizePercent.lengthPercent}%`;
    requiredOutput(panel, "leaf-width").textContent = `${tree.proceduralLeafCardSizePercent.widthPercent}%`;
    requiredOutput(panel, "billboard-size").textContent = `${formatBillboardValue(
      tree.proceduralBillboard.billboardSize
    )} cm`;
    requiredOutput(panel, "billboards-scale").textContent = `${formatBillboardValue(
      tree.proceduralBillboard.billboardsScale
    )}×`;
    requiredOutput(panel, "inflate").textContent = `${formatBillboardValue(tree.proceduralBillboard.inflate)} cm`;
    for (const field of [
      ["second-color-level", tree.proceduralLeafLighting.secondColorLevel],
      ["second-color-gradient", tree.proceduralLeafLighting.secondColorGradient],
      ["albedo-brightness", tree.proceduralLeafLighting.albedoBrightness],
      ["albedo-desaturation", tree.proceduralLeafLighting.albedoDesaturation],
      ["albedo-texture-blend", tree.proceduralLeafLighting.albedoTextureBlend],
      ["base-ao-influence", tree.proceduralLeafLighting.baseAoInfluence],
      ["glancing-angle-cut", tree.proceduralLeafLighting.glancingAngleCut],
      ["translucency-intensity", tree.proceduralLeafLighting.translucencyIntensity],
      ["translucency-ao-influence", tree.proceduralLeafLighting.translucencyAoInfluence],
      ["normal-distortion", tree.proceduralLeafLighting.normalDistortion],
      ["scattering-exponent", tree.proceduralLeafLighting.scatteringExponent],
      ["direct-strength", tree.proceduralLeafLighting.directStrength],
      ["ambient-strength", tree.proceduralLeafLighting.ambientStrength],
      ["shadow-strength", tree.proceduralLeafLighting.shadowStrength]
    ] as const) {
      requiredOutput(panel, field[0]).textContent = formatMaterialValue(field[1]);
    }
    panel.querySelector<HTMLElement>("[data-procedural-leaf-lighting-metrics]")!.textContent =
      `Base ${colorToHex(tree.proceduralLeafLighting.baseColorRgb)} · ` +
      `Second ${colorToHex(tree.proceduralLeafLighting.secondColorRgb)} · ` +
      `Level ${formatMaterialValue(tree.proceduralLeafLighting.secondColorLevel)} · ` +
      `Gradient ${formatMaterialValue(tree.proceduralLeafLighting.secondColorGradient)} · ` +
      `Overlay ${formatMaterialValue(tree.proceduralLeafLighting.albedoTextureBlend)} · ` +
      `Base AO ${formatMaterialValue(tree.proceduralLeafLighting.baseAoInfluence)} · ` +
      `Glancing ${formatMaterialValue(tree.proceduralLeafLighting.glancingAngleCut)} · ` +
      `Transmission ${colorToHex(tree.proceduralLeafLighting.translucencyColorRgb)} × ` +
      `${formatMaterialValue(tree.proceduralLeafLighting.translucencyIntensity)} · ` +
      `Scatter ${formatMaterialValue(tree.proceduralLeafLighting.scatteringExponent)} · ` +
      `Direct ${formatMaterialValue(tree.proceduralLeafLighting.directStrength)} · ` +
      `Ambient ${formatMaterialValue(tree.proceduralLeafLighting.ambientStrength)} · ` +
      `Shadow ${formatMaterialValue(tree.proceduralLeafLighting.shadowStrength)} · Emission 0`;
    panel.querySelector<HTMLElement>("[data-procedural-tree-metrics]")!.textContent =
      `Sapling ${tree.proceduralProfile} · Density ${tree.proceduralLeafDensity} · ` +
      `Leaf ${tree.proceduralLeafCardSizePercent.lengthPercent}% L × ` +
      `${tree.proceduralLeafCardSizePercent.widthPercent}% W · ` +
      `Local card sizing ${formatBillboardValue(tree.proceduralBillboard.billboardSize)} cm / ` +
      `${formatBillboardValue(tree.proceduralBillboard.billboardsScale)}× / ` +
      `${formatBillboardValue(tree.proceduralBillboard.inflate)} cm / ` +
      `Explicit Pivot/Up/Local leaf frames + camera-facing vertex rebuild · LOD preserves coverage by resizing retained cards · ` +
      `Leaf spacing ${formatBillboardValue(tree.proceduralDistributionTuning.leafSpacingPercent)}% · ` +
      `terminal leaf clusters · petiole Pivot remains attached · camera-facing normals · ` +
      `LOD0 stems ${tree.proceduralBranchCountsByLod[0].join("+")} · ` +
      `leaves ${tree.proceduralLeafCounts.join(" / ")} · ` +
      `triangles ${tree.proceduralTrianglesByLod.join(" / ")} · ` +
      `${tree.proceduralLeafMaskId} · ${
        tree.proceduralLeafDisplayMode === "material"
          ? `Base Color + Alpha Test ${tree.proceduralLeafAlphaCutoff.toFixed(2)}`
          : tree.proceduralLeafDisplayMode === "raw-cards"
            ? "RAW CARDS · no texture / Alpha cutout / leaf WPO"
            : "VERTEX NORMALS · view-space XYZ encoded as RGB · no Position or PBR"
      }`;
  } else {
    if (category === "shrub") syncLeafTextureControl(panel, diagnostics.vegetation.shrub.baseTexture);
    const sourceLabel =
      category === "grass"
        ? sourceLibrary.grassFamily.variants.find((candidate) => candidate.id === token.assetId)?.label
        : category === "shrub" ? sourceLibrary.shrub.label : undefined;
    panel.querySelector<HTMLOutputElement>("[data-summary]")!.textContent =
      `${sourceLabel ? `${sourceLabel} · ` : ""}${token.sizePercent}%`;
  }
  if (category === "grass" || category === "flower") {
    if (token.category !== category) throw new Error(`${category} Population Token is unavailable`);
    const metrics = diagnostics.populations[category];
    panel.querySelector<HTMLElement>("[data-population-metrics]")!.textContent =
      `${metrics.areaSquareMeters.toFixed(1)} m² · ${metrics.instances} instances · ${metrics.instancedDraws} batch`;
  } else if (category === "rock") {
    if (token.category !== "rock") throw new Error("Rock Population Token is unavailable");
    const metrics = diagnostics.populations.rock;
    panel.querySelector<HTMLElement>("[data-population-metrics]")!.textContent =
      `${metrics.areaSquareMeters.toFixed(1)} m² · ${metrics.instances} instances · ${metrics.instancedDraws} batch`;
  }
}

/** Removes IEEE-754 display noise without changing artist-authored decimal precision. */
function stableControlNumber(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}

function readTreeDistributionTuning(panel: ParentNode): ProceduralTreeDistributionTuning {
  return {
    geometrySeed: requiredInput(panel, "tree-geometry-seed").valueAsNumber,
    trunkCount: requiredInput(panel, "tree-trunk-count").valueAsNumber,
    treeHeightVariationPercent: requiredInput(panel, "tree-height-variation").valueAsNumber,
    trunkClearHeightPercentOfHeight: requiredInput(panel, "tree-trunk-clear-height").valueAsNumber,
    trunkRadiusPercentOfHeight: requiredInput(panel, "tree-trunk-radius").valueAsNumber,
    trunkRadiusVariationPercent: requiredInput(panel, "tree-trunk-radius-variation").valueAsNumber,
    trunkCurveVariationDegrees: requiredInput(panel, "tree-trunk-curve-variation").valueAsNumber,
    trunkSplitAngleDegrees: requiredInput(panel, "tree-trunk-split-angle").valueAsNumber,
    trunkSplitAngleVariationDegrees: requiredInput(panel, "tree-trunk-split-variation").valueAsNumber,
    trunkRotateDegrees: requiredInput(panel, "tree-trunk-rotate").valueAsNumber,
    trunkRotateVariationDegrees: requiredInput(panel, "tree-trunk-rotate-variation").valueAsNumber,
    branchCount: requiredInput(panel, "tree-branch-count").valueAsNumber,
    branchLengthPercentOfParent: requiredInput(panel, "tree-branch-length").valueAsNumber,
    branchMaximumLengthPercentOfHeight: requiredInput(panel, "tree-branch-maximum-length").valueAsNumber,
    branchLengthVariationPercent: requiredInput(panel, "tree-branch-length-variation").valueAsNumber,
    branchCurveVariationDegrees: requiredInput(panel, "tree-branch-curve-variation").valueAsNumber,
    branchAttractionUp: requiredInput(panel, "tree-branch-attraction-up").valueAsNumber,
    branchRotateDegrees: requiredInput(panel, "tree-branch-rotate").valueAsNumber,
    branchRotateVariationDegrees: requiredInput(panel, "tree-branch-rotate-variation").valueAsNumber,
    branchDownAngleDegrees: requiredInput(panel, "tree-branch-down-angle").valueAsNumber,
    branchDownAngleVariationDegrees: requiredInput(panel, "tree-branch-down-variation").valueAsNumber,
    twigCount: requiredInput(panel, "tree-twig-count").valueAsNumber,
    twigLengthPercentOfParent: requiredInput(panel, "tree-twig-length").valueAsNumber,
    twigMaximumLengthPercentOfHeight: requiredInput(panel, "tree-twig-maximum-length").valueAsNumber,
    twigLengthVariationPercent: requiredInput(panel, "tree-twig-length-variation").valueAsNumber,
    twigCurveVariationDegrees: requiredInput(panel, "tree-twig-curve-variation").valueAsNumber,
    twigAttractionUp: requiredInput(panel, "tree-twig-attraction-up").valueAsNumber,
    twigAttachmentEndPercentOfParent: requiredInput(panel, "tree-twig-attachment-end").valueAsNumber,
    twigRotateDegrees: requiredInput(panel, "tree-twig-rotate").valueAsNumber,
    twigRotateVariationDegrees: requiredInput(panel, "tree-twig-rotate-variation").valueAsNumber,
    twigDownAngleDegrees: requiredInput(panel, "tree-twig-down-angle").valueAsNumber,
    twigDownAngleVariationDegrees: requiredInput(panel, "tree-twig-down-variation").valueAsNumber,
    leafDistribution: Number(requiredSelect(panel, "tree-leaf-distribution").value) as SaplingLeafDistribution,
    leafDownAngleDegrees: requiredInput(panel, "tree-leaf-down-angle").valueAsNumber,
    leafDownAngleVariationDegrees: requiredInput(panel, "tree-leaf-down-variation").valueAsNumber,
    leafRotateDegrees: requiredInput(panel, "tree-leaf-rotate").valueAsNumber,
    leafRotateVariationDegrees: requiredInput(panel, "tree-leaf-rotate-variation").valueAsNumber,
    leafSpacingPercent: requiredInput(panel, "tree-leaf-spacing").valueAsNumber,
    leafScaleVariationPercent: requiredInput(panel, "tree-leaf-scale-variation").valueAsNumber,
    leafNormalCrownBlendPercent: requiredInput(panel, "tree-leaf-normal-crown-blend").valueAsNumber
  };
}

function bindTreeNodeEditor(panel: HTMLDetailsElement, bindings: PanelBindings): void {
  const select = requiredSelect(panel, "tree-node-id");
  const textarea = requiredTextarea(panel, "tree-node-json");
  const error = panel.querySelector<HTMLElement>("[data-tree-node-error]")!;
  select.addEventListener("change", () => {
    error.hidden = true;
    syncTreeNodeEditor(panel, bindings.diagnostics().tree);
  });
  panel.querySelector<HTMLButtonElement>('[data-action="apply-tree-node"]')!.addEventListener("click", () => {
    error.hidden = true;
    try {
      const parsed = JSON.parse(textarea.value) as ProceduralTreeLeafNodeEdit | ProceduralTreeStemNodeEdit;
      const [kind, expectedId] = select.value.split(":", 2);
      if (kind === "stem") {
        if (!("stemId" in parsed) || parsed.stemId !== expectedId) {
          throw new Error("枝干节点 JSON 的 stemId 不得改变；请通过节点选择器切换目标");
        }
        bindings.setTreeStemNodeEdit(parsed as ProceduralTreeStemNodeEdit);
      } else if (kind === "leaf") {
        if (!("leafId" in parsed) || parsed.leafId !== expectedId) {
          throw new Error("叶片节点 JSON 的 leafId 不得改变；请通过节点选择器切换目标");
        }
        bindings.setTreeLeafNodeEdit(parsed as ProceduralTreeLeafNodeEdit);
      } else {
        throw new Error("请选择一个可编辑的枝干或叶片节点");
      }
    } catch (caught) {
      error.textContent = caught instanceof Error ? caught.message : String(caught);
      error.hidden = false;
      syncTreeNodeEditor(panel, bindings.diagnostics().tree);
    }
  });
}

function syncTreeNodeEditor(panel: ParentNode, tree: AssetAssemblyLabDiagnostics["tree"]): void {
  const select = requiredSelect(panel, "tree-node-id");
  const previous = select.value;
  const stems = [...tree.proceduralStemNodeParameters].sort(
    (left, right) => stemNodeOrder(left.stemId) - stemNodeOrder(right.stemId)
  );
  const leaves = [...tree.proceduralLeafNodeParameters];
  const groups = [
    createTreeNodeOptionGroup(
      "TRUNK / 主干",
      stems.filter((stem) => stem.stemId.startsWith("stem-v1/0/")).map((stem) => ["stem", stem.stemId] as const)
    ),
    createTreeNodeOptionGroup(
      "PRIMARY BRANCHES / 一级枝",
      stems.filter((stem) => stem.stemId.startsWith("stem-v1/1/")).map((stem) => ["stem", stem.stemId] as const)
    ),
    createTreeNodeOptionGroup(
      "SECONDARY BRANCHES / 二级枝",
      stems.filter((stem) => stem.stemId.startsWith("stem-v1/2/")).map((stem) => ["stem", stem.stemId] as const)
    ),
    createTreeNodeOptionGroup(
      "LEAVES / 每片叶子",
      leaves.map((leaf) => ["leaf", leaf.leafId] as const)
    )
  ].filter((group) => group.children.length > 0);
  select.replaceChildren(...groups);
  const available = [...select.options].some((option) => option.value === previous);
  if (available) select.value = previous;
  const [kind, id] = select.value.split(":", 2);
  const state = kind === "stem" ? stems.find((stem) => stem.stemId === id) : leaves.find((leaf) => leaf.leafId === id);
  requiredTextarea(panel, "tree-node-json").value = state ? JSON.stringify(state, null, 2) : "";
  const trunkCount = stems.filter((stem) => stem.stemId.startsWith("stem-v1/0/")).length;
  const primaryCount = stems.filter((stem) => stem.stemId.startsWith("stem-v1/1/")).length;
  const secondaryCount = stems.filter((stem) => stem.stemId.startsWith("stem-v1/2/")).length;
  panel.querySelector<HTMLElement>("[data-tree-node-counts]")!.textContent =
    trunkCount + " 主干 · " + primaryCount + " 一级枝 · " + secondaryCount + " 二级枝 · " + leaves.length + " 叶片";
}

function createTreeNodeOptionGroup(
  label: string,
  nodes: readonly (readonly [kind: "stem" | "leaf", id: string])[]
): HTMLOptGroupElement {
  const group = document.createElement("optgroup");
  group.label = label;
  group.replaceChildren(
    ...nodes.map(([kind, id], index) => {
      const option = document.createElement("option");
      option.value = kind + ":" + id;
      option.textContent = index + 1 + " · " + id;
      return option;
    })
  );
  return group;
}

function stemNodeOrder(stemId: string): number {
  const [, , level, ordinal] = stemId.split("/");
  return Number(level) * 1_000_000 + Number(ordinal);
}

function syncTreeDistributionControls(panel: ParentNode, tree: AssetAssemblyLabDiagnostics["tree"]): void {
  const tuning = tree.proceduralDistributionTuning;
  const values: ReadonlyArray<readonly [field: string, value: number]> = [
    ["tree-geometry-seed", tuning.geometrySeed],
    ["tree-trunk-count", tuning.trunkCount],
    ["tree-height-variation", tuning.treeHeightVariationPercent],
    ["tree-trunk-clear-height", tuning.trunkClearHeightPercentOfHeight],
    ["tree-trunk-radius", tuning.trunkRadiusPercentOfHeight],
    ["tree-trunk-radius-variation", tuning.trunkRadiusVariationPercent],
    ["tree-trunk-curve-variation", tuning.trunkCurveVariationDegrees],
    ["tree-trunk-split-angle", tuning.trunkSplitAngleDegrees],
    ["tree-trunk-split-variation", tuning.trunkSplitAngleVariationDegrees],
    ["tree-trunk-rotate", tuning.trunkRotateDegrees],
    ["tree-trunk-rotate-variation", tuning.trunkRotateVariationDegrees],
    ["tree-branch-count", tuning.branchCount],
    ["tree-branch-length", tuning.branchLengthPercentOfParent],
    ["tree-branch-maximum-length", tuning.branchMaximumLengthPercentOfHeight],
    ["tree-branch-length-variation", tuning.branchLengthVariationPercent],
    ["tree-branch-curve-variation", tuning.branchCurveVariationDegrees],
    ["tree-branch-attraction-up", tuning.branchAttractionUp],
    ["tree-branch-rotate", tuning.branchRotateDegrees],
    ["tree-branch-rotate-variation", tuning.branchRotateVariationDegrees],
    ["tree-branch-down-angle", tuning.branchDownAngleDegrees],
    ["tree-branch-down-variation", tuning.branchDownAngleVariationDegrees],
    ["tree-twig-count", tuning.twigCount],
    ["tree-twig-length", tuning.twigLengthPercentOfParent],
    ["tree-twig-maximum-length", tuning.twigMaximumLengthPercentOfHeight],
    ["tree-twig-length-variation", tuning.twigLengthVariationPercent],
    ["tree-twig-curve-variation", tuning.twigCurveVariationDegrees],
    ["tree-twig-attraction-up", tuning.twigAttractionUp],
    ["tree-twig-attachment-end", tuning.twigAttachmentEndPercentOfParent],
    ["tree-twig-rotate", tuning.twigRotateDegrees],
    ["tree-twig-rotate-variation", tuning.twigRotateVariationDegrees],
    ["tree-twig-down-angle", tuning.twigDownAngleDegrees],
    ["tree-twig-down-variation", tuning.twigDownAngleVariationDegrees],
    ["tree-leaf-down-angle", tuning.leafDownAngleDegrees],
    ["tree-leaf-down-variation", tuning.leafDownAngleVariationDegrees],
    ["tree-leaf-rotate", tuning.leafRotateDegrees],
    ["tree-leaf-rotate-variation", tuning.leafRotateVariationDegrees],
    ["tree-leaf-spacing", tuning.leafSpacingPercent],
    ["tree-leaf-scale-variation", tuning.leafScaleVariationPercent],
    ["tree-leaf-normal-crown-blend", tuning.leafNormalCrownBlendPercent ?? 0]
  ];
  values.forEach(([field, value]) => (requiredInput(panel, field).valueAsNumber = value));
  requiredSelect(panel, "tree-leaf-distribution").value = String(tuning.leafDistribution);
  for (let lod = 0; lod < PROCEDURAL_TREE_LOD_COUNT; lod++) {
    requiredOutput(panel, `tree-faces-lod${lod}-trunk`).textContent =
      tree.proceduralTrunkTrianglesByLod[lod].toLocaleString();
    requiredOutput(panel, `tree-faces-lod${lod}-leaf`).textContent =
      tree.proceduralLeafTrianglesByLod[lod].toLocaleString();
    requiredOutput(panel, `tree-faces-lod${lod}-total`).textContent =
      tree.proceduralTrianglesByLod[lod].toLocaleString();
  }
}

function populateTreeRecipes(sourceLibrary: AssetAssemblySourceLibrary, token: TreePopulationTokenV1): void {
  const select = document.querySelector<HTMLSelectElement>('[data-category="tree"] [data-field="asset"]')!;
  select.replaceChildren(
    ...sourceLibrary.treeRecipes.map((recipe) => {
      const option = document.createElement("option");
      option.value = recipe.id;
      option.textContent = recipe.label;
      option.selected = recipe.id === token.assetId;
      return option;
    })
  );
  const leafMaskSelect = document.querySelector<HTMLSelectElement>('[data-category="tree"] [data-field="leaf-mask"]')!;
  const selectedLeafMaskId = resolveTreeLeafMaskId(token);
  const customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "Custom upload";
  customOption.disabled = true;
  customOption.hidden = true;
  leafMaskSelect.replaceChildren(
    ...sourceLibrary.treeLeafMasks.map((source) => {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = source.label;
      option.selected = source.id === selectedLeafMaskId;
      return option;
    }),
    customOption
  );
}

function syncLeafMaskControl(panel: HTMLDetailsElement, diagnostics: AssetAssemblyLabDiagnostics["tree"]): void {
  const select = requiredSelect(panel, "leaf-mask");
  const customOption = select.querySelector<HTMLOptionElement>('option[value="custom"]');
  if (!customOption) throw new Error("Tree custom leaf-mask option is unavailable");
  const custom = diagnostics.proceduralLeafMaskSource === "custom";
  customOption.hidden = !custom;
  customOption.textContent = custom ? `Custom · ${diagnostics.proceduralLeafMaskLabel}` : "Custom upload";
  select.value = custom ? "custom" : diagnostics.proceduralLeafMaskId;
  syncLeafTextureControl(panel, {
    source: diagnostics.proceduralLeafMaskSource,
    label: diagnostics.proceduralLeafMaskLabel,
    width: diagnostics.proceduralLeafMaskResolution[0],
    height: diagnostics.proceduralLeafMaskResolution[1]
  });
}

function syncLeafTextureControl(
  panel: HTMLDetailsElement,
  texture: AssetAssemblyLabDiagnostics["vegetation"]["shrub"]["baseTexture"]
): void {
  const custom = texture.source === "custom";
  const status = panel.querySelector<HTMLElement>("[data-leaf-mask-status]")!;
  status.dataset.custom = String(custom);
  status.textContent = `${custom ? "自定义" : "默认"} · ${texture.label} · ${texture.width} × ${texture.height}`;
  if (!custom) {
    requiredInput(panel, "leaf-mask-file").value = "";
    const preview = panel.querySelector<HTMLImageElement>("[data-leaf-texture-preview]")!;
    preview.hidden = true;
    preview.removeAttribute("src");
  }
}

function bindLeafTextureUpload(panel: HTMLDetailsElement, category: "tree" | "shrub", bindings: PanelBindings): void {
  const input = requiredInput(panel, "leaf-mask-file");
  const error = panel.querySelector<HTMLElement>("[data-leaf-mask-error]")!;
  const status = panel.querySelector<HTMLElement>("[data-leaf-mask-status]")!;
  const reset = panel.querySelector<HTMLButtonElement>('[data-action="reset-leaf-texture"]')!;
  const sync = (): void => syncAssetPanel(
    category, bindings.tokens, bindings.encodedTokens, bindings.runtime.getDiagnostics(), bindings.sourceLibrary
  );
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    error.hidden = true;
    status.textContent = `正在加载 ${file.name}…`;
    input.disabled = reset.disabled = true;
    try {
      await bindings.setLeafTexture(category, file);
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : String(reason);
      error.hidden = false;
    } finally {
      input.disabled = reset.disabled = false;
      input.value = "";
      sync();
    }
  });
  reset.addEventListener("click", () => {
    error.hidden = true;
    bindings.resetLeafTexture(category);
  });
}

function populateCatalogStyles(selectedId: string): void {
  const select = document.querySelector<HTMLSelectElement>("#style")!;
  select.replaceChildren(
    ...PRODUCTION_ASSET_CATALOGS.map((catalog) => {
      const option = document.createElement("option");
      option.value = catalog.id;
      option.textContent = catalog.label;
      option.selected = catalog.id === selectedId;
      return option;
    })
  );
}

function syncView(view: AssetAssemblyView): void {
  document.body.dataset.view = view;
  const signal = document.querySelector<HTMLElement>(".hero__signal");
  if (signal) signal.replaceChildren(document.createElement("span"), document.createTextNode(view === "landscape"
    ? "自然生长 · 接缝融合 · 近密远疏" : "左侧基础株 · 前矮后高 · 右侧同排实例"));
  document.querySelectorAll<HTMLButtonElement>("button[data-view]").forEach((button) => {
    button.dataset.active = String(button.dataset.view === view);
  });
}

function syncBatchControls(tokens: Record<AssetCategory, PopulationTokenV1>): void {
  document.querySelectorAll<HTMLDetailsElement>(".asset-panel").forEach((panel) => {
    const category = panel.dataset.category as AssetCategory;
    const panelEnabled = tokens[category].population.mode === "stress-1000";
    panel.querySelectorAll<HTMLButtonElement>("[data-batch-count]").forEach((button) => {
      button.dataset.active = String((button.dataset.batchCount === "1000") === panelEnabled);
    });
  });
}

function updateSize(token: PopulationTokenV1, sizePercent: number): PopulationTokenV1 {
  return { ...token, sizePercent } as PopulationTokenV1;
}

function updateColor(token: PopulationTokenV1, hex: string): PopulationTokenV1 {
  return { ...token, colorRgb: hexToColor(hex) } as PopulationTokenV1;
}

function updateLodQuantity(token: PopulationTokenV1, lod: number, value: number): PopulationTokenV1 {
  const values = [...token.lodProfile.values];
  if (!Number.isInteger(lod) || lod < 0 || lod >= values.length) throw new RangeError("Population LOD is unavailable");
  values[lod] = value;
  return { ...token, lodProfile: { ...token.lodProfile, values } } as PopulationTokenV1;
}

function usesPopulationQuantityControls(category: AssetCategory): boolean {
  return category !== "tree" && category !== "shrub";
}

function populateLodQuantityControls(panel: HTMLDetailsElement, token: PopulationTokenV1): void {
  const owner = panel.querySelector<HTMLElement>("[data-lod-quantity-controls]")!;
  const [label, minimum, maximum] =
    token.lodProfile.metric === PopulationLodMetric.DensityPercent
      ? ["Internal density", 1, 100]
      : token.lodProfile.metric === PopulationLodMetric.CountPerCell
        ? ["Count / Cell", 0, 255]
        : ["Instances", 0, 1000];
  owner.replaceChildren(
    ...token.lodProfile.values.map((_, lod) => {
      const control = document.createElement("label");
      control.className = "control";
      control.innerHTML = `<span>${label} LOD${lod} <output data-output="lod-quantity-${lod}"></output></span><input data-field="lod-quantity" data-lod="${lod}" type="range" min="${minimum}" max="${maximum}" step="1">`;
      return control;
    })
  );
}

function bindDistancePreview(panel: HTMLDetailsElement, category: AssetCategory, bindings: PanelBindings): void {
  const automatic = requiredInput(panel, "auto-lod");
  const distance = requiredInput(panel, "lod-distance");
  const previewDistances = lodPreviewDistances(category, bindings.sourceLibrary, bindings.camera.fieldOfView);
  distance.max = String(Math.ceil(Math.max(...previewDistances)));
  const sync = (): void =>
    syncAssetPanel(
      category,
      bindings.tokens,
      bindings.encodedTokens,
      bindings.runtime.getDiagnostics(),
      bindings.sourceLibrary
    );
  automatic.addEventListener("change", () => {
    distance.disabled = automatic.checked;
    bindings.runtime.setAutomaticDistance(category, automatic.checked);
    sync();
  });
  distance.addEventListener("input", () => {
    bindings.runtime.setSimulatedDistance(category, distance.valueAsNumber);
    sync();
  });
  panel.querySelector<HTMLButtonElement>('[data-action="step-lod"]')!.addEventListener("click", () => {
    const wasAutomatic = automatic.checked;
    automatic.checked = false;
    distance.disabled = false;
    const current = distance.valueAsNumber;
    const currentIndex = wasAutomatic ? -1 : previewDistances.findIndex((value) => Math.abs(value - current) < 0.1);
    const next = wasAutomatic
      ? previewDistances[0]
      : currentIndex >= 0
        ? previewDistances[(currentIndex + 1) % previewDistances.length]
        : (previewDistances.find((value) => value > current + 0.1) ?? previewDistances[0]);
    distance.valueAsNumber = next;
    bindings.runtime.setSimulatedDistance(category, next);
    sync();
  });
}

function lodPreviewDistances(
  category: AssetCategory,
  sourceLibrary: AssetAssemblySourceLibrary,
  fieldOfViewDegrees: number
): readonly number[] {
  if (category !== "shrub" && category !== "rock") return LOD_PREVIEW_DISTANCES[category];
  const source = category === "shrub" ? sourceLibrary.shrub : sourceLibrary.rock;
  if (!source) throw new Error("No loaded rock source");
  const profile = source.lodGroup!;
  const tangent = Math.tan((fieldOfViewDegrees * Math.PI) / 360);
  const transitions = profile.screenRelativeTransitionHeights.map((height) => profile.size / (2 * tangent * height));
  return Array.from({ length: source.lods.length }, (_, lodIndex) =>
    lodIndex === 0 ? transitions[0] * 0.7 : Math.sqrt(transitions[lodIndex - 1] * transitions[lodIndex])
  );
}

function setInputRange(field: string, range: readonly [number, number], displayScale = 1): void {
  document.querySelectorAll<HTMLInputElement>(`[data-field="${field}"]`).forEach((input) => {
    input.min = String(range[0] * displayScale);
    input.max = String(range[1] * displayScale);
  });
}

function requiredInput(parent: ParentNode, field: string): HTMLInputElement {
  return parent.querySelector<HTMLInputElement>(`[data-field="${field}"]`)!;
}

function requiredTextarea(parent: ParentNode, field: string): HTMLTextAreaElement {
  return parent.querySelector<HTMLTextAreaElement>(`[data-field="${field}"]`)!;
}

function requiredSelect(parent: ParentNode, field: string): HTMLSelectElement {
  return parent.querySelector<HTMLSelectElement>(`[data-field="${field}"]`)!;
}

function requiredOutput(parent: ParentNode, field: string): HTMLOutputElement {
  return parent.querySelector<HTMLOutputElement>(`[data-output="${field}"]`)!;
}

function formatBillboardValue(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function formatMaterialValue(value: number): string {
  return Number(value.toPrecision(8)).toString();
}

function colorToHex(color: readonly [number, number, number]): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function hexToColor(hex: string): readonly [number, number, number] {
  if (!/^#[0-9a-f]{6}$/iu.test(hex)) throw new Error("Population color must be a six-digit RGB value");
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  ];
}
