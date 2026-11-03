import { compareTerrainStableValues } from "../TerrainStableOrder";
import { requireTerrainArtifactRelativePath } from "./TerrainArtifactPath";
import {
  TERRAIN_DETAIL_TRANSFORM_FORMAT,
  TERRAIN_RASTER_LAYOUT,
  TERRAIN_PROJECT_VERSION,
  TERRAIN_WORLD_INDEX_PATH,
  getTerrainProjectHoleSampleSize,
  type TerrainProjectDocument,
  type TerrainProjectDetailTransforms,
  type TerrainProjectFile,
  type TerrainProjectHeightSeam,
  type TerrainProjectRegion,
  type TerrainProjectSeamSide,
  type TerrainProjectWorldIndex,
  type TerrainProjectWorldRegion
} from "./TerrainProjectContract";
import { collectTerrainProjectRegionDependencies } from "./TerrainProjectRegionDependencies";

/** Canonical exported files keyed by Project virtual path. */
export type TerrainProjectEntries = ReadonlyMap<string, Uint8Array>;

/** Validated Project and decoded Regions returned by an import roundtrip. */
export interface ImportedTerrainProject {
  project: TerrainProjectFile;
  world: TerrainProjectWorldIndex;
  documents: readonly TerrainProjectDocument[];
  /** Optional artifact metadata supplied by an exporter. It is not verified while loading. */
  contentHash?: string;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const WORLD_BOUNDARY_EPSILON_METRES = 1e-6;
const DETAIL_TRANSFORM_HEADER_BYTES = 4;
const DETAIL_TRANSFORM_COMPONENTS = 6;
const DETAIL_TRANSFORM_STRIDE_BYTES = DETAIL_TRANSFORM_COMPONENTS * Float32Array.BYTES_PER_ELEMENT;

/**
 * Imports and validates one exported `public` asset tree.
 * @param entries Files keyed by Project virtual path.
 * @returns Validated Project metadata and decoded Terrain documents.
 */
export async function importTerrainProject(entries: TerrainProjectEntries): Promise<ImportedTerrainProject> {
  const project = parseJson<TerrainProjectFile>(requireEntry(entries, "project.json"), "project.json");
  const projectRecord = project as unknown as Record<string, unknown>;
  for (const forbidden of ["terrain", "metadata", "regionCount", "sceneHash", "sourceDiagnostics"]) {
    if (forbidden in projectRecord) {
      throw new Error(`project.json must not contain Terrain domain field "${forbidden}"`);
    }
  }
  const declarations = validateTerrainProjectDeclaration(project, entries);

  requireDeclaredRef(declarations, TERRAIN_WORLD_INDEX_PATH, "JSON", "project.json");
  const world = parseJson<TerrainProjectWorldIndex>(
    requireEntry(entries, TERRAIN_WORLD_INDEX_PATH),
    TERRAIN_WORLD_INDEX_PATH
  );
  validateTerrainProjectWorldIndex(world);
  for (const descriptor of world.regions) {
    requireDeclaredRef(declarations, descriptor.manifest.url, "JSON", TERRAIN_WORLD_INDEX_PATH);
  }
  const documents = await Promise.all(
    world.regions.map(async (descriptor): Promise<TerrainProjectDocument> => {
      const regionPath = descriptor.manifest.url;
      const manifest = parseJson<TerrainProjectRegion>(requireEntry(entries, regionPath), regionPath);
      validateDeclaredRegionRefs(manifest, declarations, regionPath);
      const heightBytes = requireEntry(entries, manifest.heightmap.data.url);
      const holes = manifest.holes
        ? requireEntry(entries, manifest.holes.data.url).slice()
        : createSolidHoles(getTerrainProjectHoleSampleSize(manifest));
      const alphamaps = manifest.alphamaps.map((alphamap) => requireEntry(entries, alphamap.data.url).slice());
      const detailMaps = new Map<string, Uint8Array>();
      const detailTransforms = new Map<string, TerrainProjectDetailTransforms>();
      for (const prototype of manifest.detailPrototypes) {
        if (prototype.density.kind === "r8-count") {
          detailMaps.set(prototype.id, requireEntry(entries, prototype.density.data.url).slice());
        }
        if (prototype.exactTransforms) {
          detailTransforms.set(
            prototype.id,
            decodeTerrainDetailTransforms(requireEntry(entries, prototype.exactTransforms.data.url))
          );
        }
      }
      const document: TerrainProjectDocument = {
        descriptor,
        manifest,
        heightmap: decodeTerrainHeightmap(heightBytes),
        holes,
        alphamaps,
        detailMaps,
        detailTransforms
      };
      validateTerrainProjectDocument(document);
      return document;
    })
  );
  validateTerrainProjectWorld(world, documents);
  return { project, world, documents, contentHash: world.contentHash };
}

function validateTerrainProjectDeclaration(
  project: TerrainProjectFile,
  entries: TerrainProjectEntries
): ReadonlyMap<string, TerrainProjectFile["files"][number]> {
  if (!project || typeof project !== "object" || !Array.isArray(project.files)) {
    throw new Error("project.json requires a standard files array");
  }
  const scenePath = requireTerrainArtifactRelativePath(project.scene, "Project Scene");
  const declarations = new Map<string, TerrainProjectFile["files"][number]>();
  const ids = new Set<string>();
  for (const file of project.files) {
    if (!file || typeof file.id !== "string" || !file.id || typeof file.type !== "string" || !file.type) {
      throw new Error("project.json file declarations require nonempty id and type strings");
    }
    const virtualPath = requireTerrainArtifactRelativePath(file.virtualPath, `Project file "${file.id}" virtualPath`);
    requireTerrainArtifactRelativePath(file.path, `Project file "${file.id}" path`);
    if (ids.has(file.id)) throw new Error("project.json contains duplicate file ids");
    if (declarations.has(virtualPath)) throw new Error("project.json contains duplicate virtual paths");
    ids.add(file.id);
    declarations.set(virtualPath, file);
  }
  const scene = declarations.get(scenePath);
  if (!scene) throw new Error(`Project Scene "${scenePath}" is not declared`);
  if (scene.type !== "Scene") throw new Error(`Project Scene "${scenePath}" must be declared as Scene`);
  for (const file of project.files) requireEntry(entries, file.virtualPath);
  for (const path of entries.keys()) {
    requireTerrainArtifactRelativePath(path, "Project entry");
    if (path !== "project.json" && !declarations.has(path)) {
      throw new Error(`Export contains undeclared Project entry "${path}"`);
    }
  }
  return declarations;
}

/**
 * Validates the canonical world-index semantics shared by standard Scene loading and offline import.
 * @param world Canonical world index JSON.
 * @returns Nothing.
 * @throws If the world version or seam policy is unsupported.
 */
export function validateTerrainProjectWorldIndex(world: TerrainProjectWorldIndex): void {
  if (world.version !== TERRAIN_PROJECT_VERSION) {
    throw new Error(`Unsupported Terrain world index version "${world.version}"`);
  }
  if (!Array.isArray(world.regions) || !Array.isArray(world.heightSeams)) {
    throw new Error("Terrain world index requires Region and heightSeam arrays");
  }
  if (world.contentHash !== undefined && !isSha256(world.contentHash)) {
    throw new Error("Terrain world contentHash must be a lowercase SHA-256 digest");
  }
  const regionIds = new Set<string>();
  const descriptors = new Map<string, TerrainProjectWorldRegion>();
  for (const descriptor of world.regions) {
    requireStableId(descriptor.id, "Region");
    if (regionIds.has(descriptor.id)) throw new Error(`Duplicate Terrain Region id "${descriptor.id}"`);
    if (!descriptor.manifest?.url) throw new Error(`Terrain Region "${descriptor.id}" requires a manifest ref`);
    requireTerrainArtifactRelativePath(descriptor.manifest.url, `Terrain Region "${descriptor.id}" manifest`);
    if (descriptor.manifest.key !== undefined) {
      throw new Error(`Terrain Region "${descriptor.id}" manifest must reference a top-level JSON resource`);
    }
    requireFiniteVector(descriptor.worldPosition, 3, `Region "${descriptor.id}" worldPosition`);
    requirePositiveVector(descriptor.worldSize, 3, `Region "${descriptor.id}" worldSize`);
    regionIds.add(descriptor.id);
    descriptors.set(descriptor.id, descriptor);
  }
  const seamIds = new Set<string>();
  const seamClaims = new Map<string, Array<{ id: string; start: number; end: number }>>();
  for (const seam of world.heightSeams) {
    requireStableId(seam.id, "height seam");
    if (seamIds.has(seam.id)) throw new Error(`Duplicate Terrain height seam id "${seam.id}"`);
    if (seam.comparison !== "linear-world-space") {
      throw new Error(`Terrain height seam "${seam.id}" has unsupported comparison semantics`);
    }
    const first = descriptors.get(seam.first.regionId);
    const second = descriptors.get(seam.second.regionId);
    if (!first || !second) throw new Error(`Terrain height seam "${seam.id}" references an unknown Region`);
    if (first === second) throw new Error(`Terrain height seam "${seam.id}" must join two different Regions`);
    validateSeamBoundary(seam, first, second);
    registerSeamClaim(seamClaims, seam.id, seam.first);
    registerSeamClaim(seamClaims, seam.id, seam.second);
    seamIds.add(seam.id);
  }
}

function validateDeclaredRegionRefs(
  manifest: TerrainProjectRegion,
  declarations: ReadonlyMap<string, TerrainProjectFile["files"][number]>,
  regionPath: string
): void {
  for (const dependency of collectTerrainProjectRegionDependencies(manifest)) {
    requireDeclaredRef(declarations, dependency.url, dependency.type, regionPath);
  }
}

function requireDeclaredRef(
  declarations: ReadonlyMap<string, TerrainProjectFile["files"][number]>,
  url: string,
  expectedType: string,
  owner: string
): void {
  requireTerrainArtifactRelativePath(url, `Terrain asset "${owner}" resource`);
  const declaration = declarations.get(url);
  if (!declaration) {
    throw new Error(`Terrain asset "${owner}" references undeclared Project resource "${url}"`);
  }
  if (declaration.type !== expectedType) {
    throw new Error(`Terrain asset "${owner}" resource "${url}" is ${declaration.type}; expected ${expectedType}`);
  }
}

/**
 * Validates Terrain 1.0 structural and reference invariants.
 * @param document Fully decoded Region document.
 * @returns Nothing.
 * @throws If Region structure, dimensions, references, or payload invariants are invalid.
 */
export function validateTerrainProjectDocument(document: TerrainProjectDocument): void {
  validateTerrainProjectDocumentPayloads(document, true);
}

/**
 * Validates the render-only Terrain document without requiring authoring density payloads.
 * @param document Runtime Region document containing exact Detail transforms.
 * @returns Nothing.
 * @throws If Region structure, render payloads, or exact transforms are invalid.
 */
export function validateTerrainProjectRuntimeDocument(document: TerrainProjectDocument): void {
  validateTerrainProjectDocumentPayloads(document, false);
}

function validateTerrainProjectDocumentPayloads(document: TerrainProjectDocument, requireDetailDensity: boolean): void {
  const { descriptor, manifest } = document;
  requireStableId(descriptor.id, "Region");
  if (!descriptor.manifest?.url) throw new Error(`Terrain Region "${descriptor.id}" requires a manifest ref`);
  requireFiniteVector(descriptor.worldPosition, 3, `Region "${descriptor.id}" worldPosition`);
  requirePositiveVector(descriptor.worldSize, 3, `Region "${descriptor.id}" worldSize`);
  if (manifest.version !== TERRAIN_PROJECT_VERSION) {
    throw new Error(`Unsupported Terrain Region version "${manifest.version}"`);
  }
  const manifestRecord = manifest as unknown as Record<string, unknown>;
  for (const forbidden of ["id", "location", "worldPosition", "worldSize", "size", "resolutions"]) {
    if (forbidden in manifestRecord) {
      throw new Error(`Terrain Region manifest must not duplicate descriptor field "${forbidden}"`);
    }
  }
  if (typeof manifest.name !== "string" || !manifest.name) throw new Error("Terrain Region requires a name");
  if ((manifest.alphamaps.length === 0) !== (manifest.layers.length === 0)) {
    throw new Error("Terrain Region must declare both painted layers and Alphamaps, or neither");
  }
  if (!manifest.material?.url) throw new Error("Terrain Region requires a Project Material ref");
  validateSampleSize("heightmap", manifest.heightmap.sampleSize, 2);
  if (manifest.holes) validateSampleSize("holes", manifest.holes.sampleSize, 1);
  if (manifest.heightmap.sampleLayout !== "uniform-inclusive") {
    throw new Error('Terrain heightmap sampleLayout must be "uniform-inclusive"');
  }
  if (
    manifest.heightmap.format !== "r16-unorm-le" ||
    (manifest.holes && (manifest.holes.format !== "r8-unorm" || manifest.holes.solidValue !== 255)) ||
    manifest.alphamaps.some((alphamap) => alphamap.format !== "rgba8-unorm")
  ) {
    throw new Error("Terrain Region contains an unsupported canonical raster format");
  }
  if (
    manifest.heightmap.layout !== TERRAIN_RASTER_LAYOUT ||
    (manifest.holes && manifest.holes.layout !== TERRAIN_RASTER_LAYOUT) ||
    manifest.alphamaps.some((alphamap) => alphamap.layout !== TERRAIN_RASTER_LAYOUT)
  ) {
    throw new Error(`Terrain raster payloads must use "${TERRAIN_RASTER_LAYOUT}"`);
  }
  if (
    !Number.isFinite(manifest.heightmap.minMetres) ||
    !Number.isFinite(manifest.heightmap.maxMetres) ||
    manifest.heightmap.minMetres < 0 ||
    manifest.heightmap.maxMetres <= manifest.heightmap.minMetres ||
    manifest.heightmap.maxMetres > descriptor.worldSize[1]
  ) {
    throw new Error("Terrain height range must contain increasing finite metre values");
  }
  for (const [label, digest] of [
    ["heightmap", manifest.heightmap.sha256],
    ...(manifest.holes ? [["holes", manifest.holes.sha256]] : []),
    ...manifest.alphamaps.map((alphamap, index) => [`alphamap ${index}`, alphamap.sha256])
  ] as Array<[string, string]>) {
    if (!isSha256(digest)) throw new Error(`Terrain ${label} declares an invalid SHA-256 digest`);
  }
  const [heightWidth, heightHeight] = manifest.heightmap.sampleSize;
  if (document.heightmap.length !== heightWidth * heightHeight) {
    throw new Error(`Heightmap has ${document.heightmap.length} samples; expected ${heightWidth * heightHeight}`);
  }
  const holesCellCount = rasterLength(getTerrainProjectHoleSampleSize(manifest));
  if (document.holes.length !== holesCellCount) {
    throw new Error(`Holes map has ${document.holes.length} bytes; expected ${holesCellCount}`);
  }
  if (document.alphamaps.length !== manifest.alphamaps.length) {
    throw new Error(`Region declares ${manifest.alphamaps.length} alphamaps, received ${document.alphamaps.length}`);
  }
  for (let index = 0; index < document.alphamaps.length; index++) {
    const sampleSize = manifest.alphamaps[index].sampleSize;
    validateSampleSize(`alphamap ${index}`, sampleSize, 1);
    const expectedAlphamapBytes = rasterLength(sampleSize) * 4;
    const alphamap = document.alphamaps[index];
    if (alphamap.length !== expectedAlphamapBytes) {
      throw new Error(`Alphamap ${index} has ${alphamap.length} bytes; expected ${expectedAlphamapBytes}`);
    }
  }
  const layerIds = new Set(manifest.layers.map((layer) => layer.id));
  if (layerIds.size !== manifest.layers.length) throw new Error("Terrain layer ids must be unique within a Region");
  for (const layer of manifest.layers) {
    requireStableId(layer.id, "Terrain layer");
    if (!layer.diffuse?.url || !layer.normal?.url) {
      throw new Error(`Terrain layer "${layer.id}" requires diffuse and normal Project Texture refs`);
    }
    const numericComponents = [
      ...layer.tileSize,
      ...layer.tileOffset,
      layer.normalScale,
      ...layer.diffuseRemapMin,
      ...layer.diffuseRemapMax,
      ...layer.maskRemapMin,
      ...layer.maskRemapMax,
      layer.metallic,
      layer.smoothness,
      ...(layer.snowResponse === undefined ? [] : [layer.snowResponse]),
      ...layer.specular
    ];
    if (numericComponents.some((component) => !Number.isFinite(component))) {
      throw new Error(`Terrain layer "${layer.id}" contains non-finite source values`);
    }
    if (layer.tileSize.some((component) => component <= 0)) {
      throw new Error(`Terrain layer "${layer.id}" tileSize components must be positive`);
    }
    validateNumericTuple(layer.tileSize, 2, `Terrain layer "${layer.id}" tileSize`);
    validateNumericTuple(layer.tileOffset, 2, `Terrain layer "${layer.id}" tileOffset`);
    validateNumericTuple(layer.diffuseRemapMin, 4, `Terrain layer "${layer.id}" diffuseRemapMin`);
    validateNumericTuple(layer.diffuseRemapMax, 4, `Terrain layer "${layer.id}" diffuseRemapMax`);
    validateNumericTuple(layer.maskRemapMin, 4, `Terrain layer "${layer.id}" maskRemapMin`);
    validateNumericTuple(layer.maskRemapMax, 4, `Terrain layer "${layer.id}" maskRemapMax`);
    validateNumericTuple(layer.specular, 4, `Terrain layer "${layer.id}" specular`);
    if (layer.snowResponse !== undefined && (layer.snowResponse < 0 || layer.snowResponse > 1)) {
      throw new Error(`Terrain layer "${layer.id}" snowResponse must be between 0 and 1`);
    }
  }
  const paintedLayerIds = new Set<string>();
  for (let mapIndex = 0; mapIndex < manifest.alphamaps.length; mapIndex++) {
    const slots = manifest.alphamaps[mapIndex].layers;
    if (slots.length !== 4) throw new Error(`Alphamap ${mapIndex} must declare four physical channel slots`);
    for (const layerId of slots) {
      if (layerId === null) continue;
      if (!layerIds.has(layerId)) throw new Error(`Alphamap ${mapIndex} references unknown layer "${layerId}"`);
      if (paintedLayerIds.has(layerId)) throw new Error(`Terrain layer "${layerId}" occupies multiple channels`);
      paintedLayerIds.add(layerId);
    }
  }
  if (paintedLayerIds.size !== layerIds.size) {
    throw new Error("Every Terrain layer must occupy exactly one alphamap channel");
  }
  for (let mapIndex = 0; mapIndex < document.alphamaps.length; mapIndex++) {
    const pixels = document.alphamaps[mapIndex];
    const slots = manifest.alphamaps[mapIndex].layers;
    const texelCount = rasterLength(manifest.alphamaps[mapIndex].sampleSize);
    for (let texel = 0; texel < texelCount; texel++) {
      const offset = texel * 4;
      for (let channel = 0; channel < 4; channel++) {
        const value = pixels[offset + channel];
        if (slots[channel] === null && value !== 0) {
          throw new Error(`Alphamap ${mapIndex} unused channel ${channel} at texel ${texel} is ${value}`);
        }
      }
    }
  }
  const declaredPlacedPrefabPrototypes = manifest.placedPrefabPrototypes;
  const declaredPlacedPrefabInstances = manifest.placedPrefabInstances;
  if (
    (declaredPlacedPrefabPrototypes === undefined) !== (declaredPlacedPrefabInstances === undefined) ||
    (declaredPlacedPrefabPrototypes !== undefined && !Array.isArray(declaredPlacedPrefabPrototypes)) ||
    (declaredPlacedPrefabInstances !== undefined && !Array.isArray(declaredPlacedPrefabInstances))
  ) {
    throw new Error("Terrain placed Prefab prototypes and instances must be declared together as arrays");
  }
  const placedPrefabPrototypes = declaredPlacedPrefabPrototypes ?? [];
  const placedPrefabInstances = declaredPlacedPrefabInstances ?? [];
  const prototypes = [...manifest.treePrototypes, ...manifest.detailPrototypes, ...placedPrefabPrototypes];
  const prototypeIds = new Set(prototypes.map((prototype) => prototype.id));
  if (prototypeIds.size !== prototypes.length) {
    throw new Error("Terrain tree, detail, and placed Prefab prototype ids must be unique within a Region");
  }
  for (const prototype of manifest.treePrototypes) {
    requireStableId(prototype.id, "Terrain tree prototype");
    if (!prototype.prefab?.url)
      throw new Error(`Terrain tree prototype "${prototype.id}" requires a Project Prefab ref`);
    if (!Number.isFinite(prototype.bendFactor) || !Number.isInteger(prototype.navMeshLod)) {
      throw new Error(`Terrain tree prototype "${prototype.id}" contains invalid source values`);
    }
  }
  const explicitInstanceIds = new Set<string>();
  const treePrototypeIds = new Set(manifest.treePrototypes.map((prototype) => prototype.id));
  for (const instance of manifest.treeInstances) {
    requireStableId(instance.id, "Terrain tree instance");
    if (explicitInstanceIds.has(instance.id)) {
      throw new Error(`Duplicate explicit Terrain instance id "${instance.id}"`);
    }
    explicitInstanceIds.add(instance.id);
    if (!treePrototypeIds.has(instance.prototypeId)) {
      throw new Error(`Tree "${instance.id}" references unknown prototype "${instance.prototypeId}"`);
    }
    requireFiniteVector(instance.localPosition, 3, `Tree "${instance.id}" localPosition`);
    requirePositiveVector(instance.scale, 3, `Tree "${instance.id}" scale`);
    if (instance.scale[0] !== instance.scale[2]) {
      throw new Error(`Tree "${instance.id}" scale must preserve explicit [width, height, width] semantics`);
    }
    if (!Number.isFinite(instance.rotationYRadians)) {
      throw new Error(`Tree "${instance.id}" rotationYRadians must be finite`);
    }
    requireFiniteVector(instance.color, 4, `Tree "${instance.id}" color`);
    requireFiniteVector(instance.lightmapColor, 4, `Tree "${instance.id}" lightmapColor`);
  }
  const placedPrefabPrototypeIds = new Set<string>();
  for (const prototype of placedPrefabPrototypes) {
    requireStableId(prototype.id, "Terrain placed Prefab prototype");
    if (!prototype.prefab?.url) {
      throw new Error(`Terrain placed Prefab prototype "${prototype.id}" requires a Project Prefab ref`);
    }
    placedPrefabPrototypeIds.add(prototype.id);
  }
  for (const instance of placedPrefabInstances) {
    requireStableId(instance.id, "Terrain placed Prefab instance");
    if (explicitInstanceIds.has(instance.id)) {
      throw new Error(`Duplicate explicit Terrain instance id "${instance.id}"`);
    }
    explicitInstanceIds.add(instance.id);
    if (!placedPrefabPrototypeIds.has(instance.prototypeId)) {
      throw new Error(`Placed Prefab "${instance.id}" references unknown prototype "${instance.prototypeId}"`);
    }
    requireFiniteVector(instance.localPosition, 3, `Placed Prefab "${instance.id}" localPosition`);
    requireUnitQuaternion(instance.localRotationQuaternion, `Placed Prefab "${instance.id}" localRotationQuaternion`);
    requireFiniteVector(instance.localScale, 3, `Placed Prefab "${instance.id}" localScale`);
  }
  if (!Number.isInteger(manifest.detailResolutionPerPatch) || manifest.detailResolutionPerPatch <= 0) {
    throw new Error("Terrain detailResolutionPerPatch must be a positive integer");
  }
  for (const prototype of manifest.detailPrototypes) {
    requireStableId(prototype.id, "Terrain detail prototype");
    validateSampleSize(`detail prototype "${prototype.id}"`, prototype.densitySampleSize, 1);
    const hasPrefab = Boolean(prototype.prefab);
    const hasTexture = Boolean(prototype.texture);
    if (!hasPrefab && !hasTexture) {
      if (prototype.density.kind !== "empty" || prototype.usePrototypeMesh) {
        throw new Error(
          `Detail prototype "${prototype.id}" may omit source geometry only when empty and usePrototypeMesh is false`
        );
      }
    } else if (hasPrefab === hasTexture || prototype.usePrototypeMesh !== hasPrefab) {
      throw new Error(
        `Detail prototype "${prototype.id}" must select exactly one source geometry matching usePrototypeMesh`
      );
    }
    if (
      !Number.isInteger(prototype.maximumSourceCount) ||
      prototype.maximumSourceCount < 0 ||
      !Number.isInteger(prototype.noiseSeed) ||
      !Number.isFinite(prototype.noiseSpread)
    ) {
      throw new Error(`Detail prototype "${prototype.id}" contains invalid source density values`);
    }
    const detailNumericValues = [
      ...prototype.healthyColor,
      ...prototype.dryColor,
      prototype.minWidth,
      prototype.maxWidth,
      prototype.minHeight,
      prototype.maxHeight
    ];
    if (
      detailNumericValues.some((value) => !Number.isFinite(value)) ||
      prototype.minWidth <= 0 ||
      prototype.maxWidth < prototype.minWidth ||
      prototype.minHeight <= 0 ||
      prototype.maxHeight < prototype.minHeight ||
      typeof prototype.renderMode !== "string" ||
      !prototype.renderMode
    ) {
      throw new Error(`Detail prototype "${prototype.id}" contains invalid source geometry values`);
    }
    const density = document.detailMaps.get(prototype.id);
    const exactTransforms = document.detailTransforms.get(prototype.id);
    const expected = rasterLength(prototype.densitySampleSize);
    if (prototype.density.kind === "empty") {
      if (density) throw new Error(`Empty detail prototype "${prototype.id}" must not carry a density payload`);
      if (requireDetailDensity && prototype.maximumSourceCount !== 0) {
        throw new Error(`Empty detail prototype "${prototype.id}" must declare zero source instances`);
      }
    } else if (prototype.density.kind === "r8-count") {
      if (prototype.density.layout !== TERRAIN_RASTER_LAYOUT) {
        throw new Error(`Detail map "${prototype.id}" has unsupported raster layout`);
      }
      if (!isSha256(prototype.density.sha256)) {
        throw new Error(`Detail map "${prototype.id}" declares an invalid SHA-256 digest`);
      }
      if (requireDetailDensity) {
        if (!density) throw new Error(`Missing detail map "${prototype.id}"`);
        if (density.length !== expected) {
          throw new Error(`Detail map "${prototype.id}" has ${density.length} bytes; expected ${expected}`);
        }
        const instanceCount = density.reduce((sum, value) => sum + value, 0);
        if (instanceCount !== prototype.maximumSourceCount) {
          throw new Error(
            `Detail map "${prototype.id}" contains ${instanceCount} instances; expected ${prototype.maximumSourceCount}`
          );
        }
      } else if (density) {
        throw new Error(`Runtime Detail prototype "${prototype.id}" must not carry a density payload`);
      }
    } else {
      throw new Error(`Detail prototype "${prototype.id}" has an unsupported density kind`);
    }
    if (!requireDetailDensity && prototype.maximumSourceCount > 0 && exactTransforms === undefined) {
      throw new Error(`Runtime Detail prototype "${prototype.id}" requires exact transforms`);
    }
    if (prototype.exactTransforms === undefined) {
      if (requireDetailDensity && exactTransforms) {
        throw new Error(`Detail prototype "${prototype.id}" must not carry undeclared exact transforms`);
      }
      if (exactTransforms) {
        if (exactTransforms.count !== prototype.maximumSourceCount) {
          throw new Error(
            `Runtime Detail transforms "${prototype.id}" contain ${exactTransforms.count} records; expected ${prototype.maximumSourceCount}`
          );
        }
        if (exactTransforms.values.length !== exactTransforms.count * DETAIL_TRANSFORM_COMPONENTS) {
          throw new Error(`Runtime Detail transforms "${prototype.id}" have an invalid decoded component count`);
        }
        validateTerrainDetailTransformValues(exactTransforms.values, prototype.id);
      }
    } else {
      if (prototype.exactTransforms.format !== TERRAIN_DETAIL_TRANSFORM_FORMAT) {
        throw new Error(`Detail transforms "${prototype.id}" have an unsupported format`);
      }
      if (!isSha256(prototype.exactTransforms.sha256)) {
        throw new Error(`Detail transforms "${prototype.id}" declare an invalid SHA-256 digest`);
      }
      if (
        !Number.isInteger(prototype.exactTransforms.count) ||
        prototype.exactTransforms.count <= 0 ||
        prototype.exactTransforms.count !== prototype.maximumSourceCount
      ) {
        throw new Error(`Detail transforms "${prototype.id}" count must equal the positive maximumSourceCount`);
      }
      if (!exactTransforms) throw new Error(`Missing detail transforms "${prototype.id}"`);
      if (exactTransforms.count !== prototype.exactTransforms.count) {
        throw new Error(
          `Detail transforms "${prototype.id}" contain ${exactTransforms.count} records; expected ${prototype.exactTransforms.count}`
        );
      }
      if (exactTransforms.values.length !== exactTransforms.count * DETAIL_TRANSFORM_COMPONENTS) {
        throw new Error(`Detail transforms "${prototype.id}" have an invalid decoded component count`);
      }
      validateTerrainDetailTransformValues(exactTransforms.values, prototype.id);
    }
  }
  for (const prototypeId of document.detailTransforms.keys()) {
    if (!manifest.detailPrototypes.some((prototype) => prototype.id === prototypeId)) {
      throw new Error(`Unexpected detail transforms "${prototypeId}"`);
    }
  }
  const windValues = [
    manifest.grassWind.speed,
    manifest.grassWind.size,
    manifest.grassWind.bending,
    ...manifest.grassWind.tint
  ];
  if (windValues.some((value) => !Number.isFinite(value))) {
    throw new Error("Terrain grassWind contains non-finite values");
  }
  validateNumericTuple(manifest.grassWind.tint, 4, "Terrain grassWind tint");
}

function createSolidHoles(sampleSize: readonly [number, number]): Uint8Array {
  return new Uint8Array(sampleSize[0] * sampleSize[1]).fill(255);
}

/**
 * Validates a complete canonical world and all explicit height seams.
 * @param world Canonical world index.
 * @param documents Fully decoded Regions that form the world.
 * @returns Nothing.
 * @throws If Regions are missing, duplicated, mismatched, or have invalid seams.
 */
export function validateTerrainProjectWorld(
  world: TerrainProjectWorldIndex,
  documents: readonly TerrainProjectDocument[]
): void {
  validateTerrainProjectWorldIndex(world);
  if (documents.length !== world.regions.length) {
    throw new Error(`Terrain world declares ${world.regions.length} Regions, received ${documents.length}`);
  }
  validateTerrainProjectLoadedSet(world, documents);
  const loadedIds = new Set(documents.map((document) => document.descriptor.id));
  for (const descriptor of world.regions) {
    if (!loadedIds.has(descriptor.id)) throw new Error(`Terrain Region "${descriptor.id}" was not decoded`);
  }
}

/**
 * Validates an arbitrary progressively loaded Region subset and its resolvable seams.
 * @param world Canonical world index.
 * @param documents Decoded Region subset.
 * @returns Nothing.
 * @throws If a loaded Region is unknown, duplicated, mismatched, or violates a loaded seam.
 */
export function validateTerrainProjectLoadedSet(
  world: TerrainProjectWorldIndex,
  documents: readonly TerrainProjectDocument[]
): void {
  validateTerrainProjectLoadedSetWith(world, documents, validateTerrainProjectDocument);
}

/**
 * Validates a progressively loaded runtime Region subset without requiring authoring density payloads.
 * @param world Canonical world index.
 * @param documents Runtime-decoded Region subset.
 * @returns Nothing.
 * @throws If a loaded Region is unknown, duplicated, mismatched, or violates a loaded seam.
 */
export function validateTerrainProjectRuntimeLoadedSet(
  world: TerrainProjectWorldIndex,
  documents: readonly TerrainProjectDocument[]
): void {
  validateTerrainProjectLoadedSetWith(world, documents, validateTerrainProjectRuntimeDocument);
}

function validateTerrainProjectLoadedSetWith(
  world: TerrainProjectWorldIndex,
  documents: readonly TerrainProjectDocument[],
  validateDocument: (document: TerrainProjectDocument) => void
): void {
  validateTerrainProjectWorldIndex(world);
  const descriptors = new Map(world.regions.map((descriptor) => [descriptor.id, descriptor]));
  const loaded = new Map<string, TerrainProjectDocument>();
  for (const document of documents) {
    validateDocument(document);
    const id = document.descriptor.id;
    const expected = descriptors.get(id);
    if (!expected) throw new Error(`Loaded Terrain Region "${id}" is absent from the world index`);
    if (loaded.has(id)) throw new Error(`Duplicate loaded Terrain Region "${id}"`);
    if (!sameDescriptor(expected, document.descriptor)) {
      throw new Error(`Loaded Terrain Region "${id}" descriptor does not match the world index`);
    }
    loaded.set(id, document);
  }
  for (const seam of world.heightSeams) {
    const first = loaded.get(seam.first.regionId);
    const second = loaded.get(seam.second.regionId);
    if (first && second) validateHeightSeam(seam, first, second);
  }
}

/**
 * Validates replacements against one previously accepted progressively loaded set.
 * @param world Canonical world index owning every current and replacement Region.
 * @param currentDocuments Previously validated loaded documents.
 * @param replacements Complete replacement documents with unique loaded Region identities.
 * @returns Nothing after replacement documents and every affected loaded seam are validated.
 * @throws If current identity is inconsistent, a replacement is invalid, or an affected seam is discontinuous.
 */
export function validateTerrainProjectLoadedReplacements(
  world: TerrainProjectWorldIndex,
  currentDocuments: readonly TerrainProjectDocument[],
  replacements: readonly TerrainProjectDocument[]
): void {
  validateTerrainProjectLoadedReplacementsWith(world, currentDocuments, replacements, validateTerrainProjectDocument);
}

/**
 * Validates render-only replacements without requiring or accepting authoring density payloads.
 * @param world Canonical world index owning every current and replacement Region.
 * @param currentDocuments Previously validated runtime documents.
 * @param replacements Complete runtime documents with unique loaded Region identities.
 * @returns Nothing after replacement documents and every affected loaded seam are validated.
 * @throws If current identity is inconsistent, a replacement is invalid, or an affected seam is discontinuous.
 */
export function validateTerrainProjectRuntimeLoadedReplacements(
  world: TerrainProjectWorldIndex,
  currentDocuments: readonly TerrainProjectDocument[],
  replacements: readonly TerrainProjectDocument[]
): void {
  validateTerrainProjectLoadedReplacementsWith(
    world,
    currentDocuments,
    replacements,
    validateTerrainProjectRuntimeDocument
  );
}

function validateTerrainProjectLoadedReplacementsWith(
  world: TerrainProjectWorldIndex,
  currentDocuments: readonly TerrainProjectDocument[],
  replacements: readonly TerrainProjectDocument[],
  validateDocument: (document: TerrainProjectDocument) => void
): void {
  validateTerrainProjectWorldIndex(world);
  const descriptors = new Map(world.regions.map((descriptor) => [descriptor.id, descriptor] as const));
  const candidates = new Map<string, TerrainProjectDocument>();
  for (const document of currentDocuments) {
    const id = document.descriptor.id;
    const expected = descriptors.get(id);
    if (!expected) throw new Error(`Loaded Terrain Region "${id}" is absent from the world index`);
    if (candidates.has(id)) throw new Error(`Duplicate loaded Terrain Region "${id}"`);
    if (!sameDescriptor(expected, document.descriptor)) {
      throw new Error(`Loaded Terrain Region "${id}" descriptor does not match the world index`);
    }
    candidates.set(id, document);
  }

  const replacementIds = new Set<string>();
  for (const document of replacements) {
    validateDocument(document);
    const id = document.descriptor.id;
    const expected = descriptors.get(id);
    if (!expected || !candidates.has(id)) throw new Error(`Terrain Region "${id}" is not loaded`);
    if (replacementIds.has(id)) throw new Error(`Terrain Region replacement contains duplicate id "${id}"`);
    if (!sameDescriptor(expected, document.descriptor)) {
      throw new Error(`Loaded Terrain Region "${id}" descriptor does not match the world index`);
    }
    replacementIds.add(id);
    candidates.set(id, document);
  }

  for (const seam of world.heightSeams) {
    if (!replacementIds.has(seam.first.regionId) && !replacementIds.has(seam.second.regionId)) continue;
    const first = candidates.get(seam.first.regionId);
    const second = candidates.get(seam.second.regionId);
    if (first && second) validateHeightSeam(seam, first, second);
  }
}

/**
 * Resolves a row-major, X-fast raster coordinate.
 * @param x Zero-based X column.
 * @param z Zero-based local positive-Z row.
 * @param width Raster width.
 * @returns Linear sample index.
 */
export function terrainRasterIndex(x: number, z: number, width: number): number {
  return z * width + x;
}

function validateSampleSize(label: string, sampleSize: readonly number[], minimum: number): void {
  if (
    !Array.isArray(sampleSize) ||
    sampleSize.length !== 2 ||
    sampleSize.some((value) => !Number.isInteger(value) || value < minimum)
  ) {
    throw new Error(`Terrain ${label} sampleSize must contain two integers >= ${minimum}`);
  }
}

function validateSeamBoundary(
  seam: TerrainProjectHeightSeam,
  first: TerrainProjectWorldRegion,
  second: TerrainProjectWorldRegion
): void {
  const firstAxis = edgeAxis(seam.first.edge);
  const secondAxis = edgeAxis(seam.second.edge);
  if (firstAxis !== secondAxis || !edgesComplement(seam.first.edge, seam.second.edge)) {
    throw new Error(`Terrain height seam "${seam.id}" must join complementary edges on one axis`);
  }
  validateSeamRange(seam.id, seam.first, first);
  validateSeamRange(seam.id, seam.second, second);
  const firstLine = seamWorldLine(seam.first, first);
  const secondLine = seamWorldLine(seam.second, second);
  if (
    !nearlyEqual(firstLine.constant, secondLine.constant) ||
    !nearlyEqual(firstLine.start, secondLine.start) ||
    !nearlyEqual(firstLine.end, secondLine.end)
  ) {
    throw new Error(`Terrain height seam "${seam.id}" joins non-touching world edge ranges`);
  }
}

function validateHeightSeam(
  seam: TerrainProjectHeightSeam,
  first: TerrainProjectDocument,
  second: TerrainProjectDocument
): void {
  const line = seamWorldLine(seam.first, first.descriptor);
  const positions = collectSeamComparisonPositions(
    line.start,
    line.end,
    seamSampleWorldPositions(seam.first, first),
    seamSampleWorldPositions(seam.second, second)
  );
  const tolerance = mixedResolutionHeightTolerance(first, second);
  for (const worldTangent of positions) {
    const firstHeight = sampleEdgeWorldHeightLinear(first, seam.first.edge, worldTangent);
    const secondHeight = sampleEdgeWorldHeightLinear(second, seam.second.edge, worldTangent);
    if (Math.abs(firstHeight - secondHeight) > tolerance) {
      throw new Error(`Terrain height seam "${seam.id}" mismatch at world position ${worldTangent}`);
    }
  }
}

function validateSeamRange(id: string, side: TerrainProjectSeamSide, descriptor: TerrainProjectWorldRegion): void {
  const [start, end] = side.rangeMetres;
  const extent = edgeAxis(side.edge) === "x" ? descriptor.worldSize[2] : descriptor.worldSize[0];
  if (
    !Array.isArray(side.rangeMetres) ||
    side.rangeMetres.length !== 2 ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > extent ||
    end <= start
  ) {
    throw new Error(`Terrain height seam "${id}" has an invalid partial edge range`);
  }
}

function registerSeamClaim(
  claims: Map<string, Array<{ id: string; start: number; end: number }>>,
  seamId: string,
  side: TerrainProjectSeamSide
): void {
  const key = `${side.regionId}\u0000${side.edge}`;
  const entries = claims.get(key) ?? [];
  const [start, end] = side.rangeMetres;
  for (const existing of entries) {
    const overlap = Math.min(end, existing.end) - Math.max(start, existing.start);
    if (overlap > WORLD_BOUNDARY_EPSILON_METRES) {
      throw new Error(`Terrain height seam "${seamId}" overlaps height seam "${existing.id}" on one Region edge`);
    }
  }
  entries.push({ id: seamId, start, end });
  claims.set(key, entries);
}

function seamWorldLine(side: TerrainProjectSeamSide, descriptor: TerrainProjectWorldRegion) {
  const axis = edgeAxis(side.edge);
  const constant =
    axis === "x"
      ? descriptor.worldPosition[0] + (side.edge === "max-x" ? descriptor.worldSize[0] : 0)
      : descriptor.worldPosition[2] + (side.edge === "max-z" ? descriptor.worldSize[2] : 0);
  const tangentOrigin = axis === "x" ? descriptor.worldPosition[2] : descriptor.worldPosition[0];
  return {
    constant,
    start: tangentOrigin + side.rangeMetres[0],
    end: tangentOrigin + side.rangeMetres[1]
  };
}

function seamSampleWorldPositions(side: TerrainProjectSeamSide, document: TerrainProjectDocument): readonly number[] {
  const total = edgeSampleCount(side.edge, document.manifest.heightmap.sampleSize);
  const line = seamWorldLine(side, document.descriptor);
  const positions: number[] = [];
  for (let index = 0; index < total; index++) {
    const position = sampleWorldTangent(document.descriptor, side.edge, index, total);
    if (
      position >= line.start - WORLD_BOUNDARY_EPSILON_METRES &&
      position <= line.end + WORLD_BOUNDARY_EPSILON_METRES
    ) {
      positions.push(position);
    }
  }
  return positions;
}

function collectSeamComparisonPositions(
  start: number,
  end: number,
  first: readonly number[],
  second: readonly number[]
): readonly number[] {
  const sorted = [start, end, ...first, ...second].sort((left, right) => left - right);
  const positions: number[] = [];
  for (const position of sorted) {
    if (!positions.length || !nearlyEqual(position, positions[positions.length - 1])) positions.push(position);
  }
  return positions;
}

function sampleEdgeWorldHeightLinear(
  document: TerrainProjectDocument,
  edge: TerrainProjectSeamSide["edge"],
  worldTangent: number
): number {
  const total = edgeSampleCount(edge, document.manifest.heightmap.sampleSize);
  const sample = Math.min(
    total - 1,
    Math.max(0, sampleIndexAtWorldTangent(document.descriptor, edge, worldTangent, total))
  );
  const lower = Math.floor(sample);
  const upper = Math.ceil(sample);
  const lowerHeight = decodeWorldHeightMetres(document, edgeHeightSample(document, edge, lower));
  if (lower === upper) return lowerHeight;
  const upperHeight = decodeWorldHeightMetres(document, edgeHeightSample(document, edge, upper));
  return lowerHeight + (upperHeight - lowerHeight) * (sample - lower);
}

function edgeHeightSample(
  document: TerrainProjectDocument,
  edge: TerrainProjectSeamSide["edge"],
  offset: number
): number {
  const [width, height] = document.manifest.heightmap.sampleSize;
  switch (edge) {
    case "min-x":
      return document.heightmap[terrainRasterIndex(0, offset, width)];
    case "max-x":
      return document.heightmap[terrainRasterIndex(width - 1, offset, width)];
    case "min-z":
      return document.heightmap[terrainRasterIndex(offset, 0, width)];
    case "max-z":
      return document.heightmap[terrainRasterIndex(offset, height - 1, width)];
  }
}

function sampleWorldTangent(
  descriptor: TerrainProjectWorldRegion,
  edge: TerrainProjectSeamSide["edge"],
  index: number,
  total: number
): number {
  const axis = edgeAxis(edge);
  const origin = axis === "x" ? descriptor.worldPosition[2] : descriptor.worldPosition[0];
  const extent = axis === "x" ? descriptor.worldSize[2] : descriptor.worldSize[0];
  return origin + (index / (total - 1)) * extent;
}

function sampleIndexAtWorldTangent(
  descriptor: TerrainProjectWorldRegion,
  edge: TerrainProjectSeamSide["edge"],
  worldTangent: number,
  total: number
): number {
  const axis = edgeAxis(edge);
  const origin = axis === "x" ? descriptor.worldPosition[2] : descriptor.worldPosition[0];
  const extent = axis === "x" ? descriptor.worldSize[2] : descriptor.worldSize[0];
  return ((worldTangent - origin) / extent) * (total - 1);
}

function edgeSampleCount(edge: TerrainProjectSeamSide["edge"], sampleSize: readonly [number, number]): number {
  return edgeAxis(edge) === "x" ? sampleSize[1] : sampleSize[0];
}

function edgeAxis(edge: TerrainProjectSeamSide["edge"]): "x" | "z" {
  return edge.endsWith("x") ? "x" : "z";
}

function edgesComplement(first: TerrainProjectSeamSide["edge"], second: TerrainProjectSeamSide["edge"]): boolean {
  return (
    (first === "min-x" && second === "max-x") ||
    (first === "max-x" && second === "min-x") ||
    (first === "min-z" && second === "max-z") ||
    (first === "max-z" && second === "min-z")
  );
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= WORLD_BOUNDARY_EPSILON_METRES;
}

function decodeWorldHeightMetres(document: TerrainProjectDocument, sample: number): number {
  const range = document.manifest.heightmap;
  return (
    document.descriptor.worldPosition[1] + range.minMetres + (sample / 65535) * (range.maxMetres - range.minMetres)
  );
}

function mixedResolutionHeightTolerance(first: TerrainProjectDocument, second: TerrainProjectDocument): number {
  const firstQuantum = (first.manifest.heightmap.maxMetres - first.manifest.heightmap.minMetres) / 65535;
  const secondQuantum = (second.manifest.heightmap.maxMetres - second.manifest.heightmap.minMetres) / 65535;
  return Math.max(firstQuantum, secondQuantum);
}

function sameDescriptor(first: TerrainProjectWorldRegion, second: TerrainProjectWorldRegion): boolean {
  return (
    first.id === second.id &&
    first.manifest.url === second.manifest.url &&
    first.manifest.key === second.manifest.key &&
    first.worldPosition.every((value, index) => value === second.worldPosition[index]) &&
    first.worldSize.every((value, index) => value === second.worldSize[index])
  );
}

function rasterLength(sampleSize: readonly number[]): number {
  return sampleSize[0] * sampleSize[1];
}

function requireStableId(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} id must be a nonempty stable string`);
  }
}

function requireFiniteVector(values: readonly number[], length: number, label: string): void {
  if (!Array.isArray(values) || values.length !== length || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} components must be finite`);
  }
}

function requirePositiveVector(values: readonly number[], length: number, label: string): void {
  if (
    !Array.isArray(values) ||
    values.length !== length ||
    values.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new Error(`${label} components must be positive and finite`);
  }
}

function requireUnitQuaternion(values: readonly number[], label: string): void {
  requireFiniteVector(values, 4, label);
  const squaredLength = values.reduce((sum, component) => sum + component * component, 0);
  if (Math.abs(squaredLength - 1) > 1e-5) {
    throw new Error(`${label} must be a unit quaternion`);
  }
}

function validateNumericTuple(values: readonly number[], length: number, label: string): void {
  if (!Array.isArray(values) || values.length !== length || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} must contain ${length} finite components`);
  }
}

function isSha256(value: string): boolean {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Decodes explicit little-endian R16 samples.
 * @param bytes R16 payload.
 * @returns Detached normalized height samples.
 */
export function decodeTerrainHeightmap(bytes: Uint8Array): Uint16Array {
  if (bytes.byteLength % 2 !== 0) throw new Error(`R16 payload has odd byte length ${bytes.byteLength}`);
  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Uint16Array(bytes.byteLength / 2);
  for (let index = 0; index < samples.length; index++) samples[index] = source.getUint16(index * 2, true);
  return samples;
}

/**
 * Decodes the canonical counted exact-detail transform payload.
 * @param bytes Bytes containing a uint32 count followed by six float32 components per record, all little-endian.
 * @returns Detached interleaved transform values and their record count.
 * @throws If the header, byte length, or transform values are invalid.
 */
export function decodeTerrainDetailTransforms(bytes: Uint8Array): TerrainProjectDetailTransforms {
  if (bytes.byteLength < DETAIL_TRANSFORM_HEADER_BYTES) {
    throw new Error(`Detail transform payload has ${bytes.byteLength} bytes; expected at least 4`);
  }
  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = source.getUint32(0, true);
  const expectedBytes = DETAIL_TRANSFORM_HEADER_BYTES + count * DETAIL_TRANSFORM_STRIDE_BYTES;
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(`Detail transform payload has ${bytes.byteLength} bytes; header requires ${expectedBytes}`);
  }
  const values = new Float32Array(count * DETAIL_TRANSFORM_COMPONENTS);
  for (let index = 0; index < values.length; index++) {
    values[index] = source.getFloat32(DETAIL_TRANSFORM_HEADER_BYTES + index * Float32Array.BYTES_PER_ELEMENT, true);
  }
  validateTerrainDetailTransformValues(values, "payload");
  return { count, values };
}

function validateTerrainDetailTransformValues(values: Float32Array, label: string): void {
  for (let offset = 0; offset < values.length; offset += DETAIL_TRANSFORM_COMPONENTS) {
    for (let component = 0; component < DETAIL_TRANSFORM_COMPONENTS; component++) {
      if (!Number.isFinite(values[offset + component])) {
        throw new Error(`Detail transforms "${label}" record ${offset / DETAIL_TRANSFORM_COMPONENTS} is non-finite`);
      }
    }
    if (values[offset + 4] <= 0 || values[offset + 5] <= 0) {
      throw new Error(`Detail transforms "${label}" record ${offset / DETAIL_TRANSFORM_COMPONENTS} has invalid scale`);
    }
  }
}

/**
 * Computes the canonical byte identity of an arbitrary Project entry set.
 * @param entries Project entries excluding or including `project.json`.
 * @returns Lowercase SHA-256 digest.
 */
export async function hashTerrainProjectEntries(entries: TerrainProjectEntries): Promise<string> {
  return hashTerrainPathEntries(entries, true);
}

/**
 * Computes the offline identity of a complete exported Terrain Project closure.
 * @param entries Root project metadata and exact resource bytes keyed by Project virtual path.
 * @returns Lowercase SHA-256 over canonical Project and world declarations plus every closure payload.
 * @throws If Project declarations, paths, or canonical JSON roots are incomplete.
 */
export async function hashTerrainProjectClosure(entries: TerrainProjectEntries): Promise<string> {
  const project = parseJson<TerrainProjectFile>(requireEntry(entries, "project.json"), "project.json");
  const declarations = validateTerrainProjectDeclaration(project, entries);
  requireDeclaredRef(declarations, TERRAIN_WORLD_INDEX_PATH, "JSON", "project.json");
  const world = parseJson<TerrainProjectWorldIndex>(
    requireEntry(entries, TERRAIN_WORLD_INDEX_PATH),
    TERRAIN_WORLD_INDEX_PATH
  );
  return hashTerrainProjectClosureFromDecoded(project, world, entries);
}

async function hashTerrainProjectClosureFromDecoded(
  project: TerrainProjectFile,
  world: TerrainProjectWorldIndex,
  entries: TerrainProjectEntries
): Promise<string> {
  const identityEntries = new Map(entries);
  identityEntries.set("project.json", encodeTerrainCanonicalJson(canonicalProjectIdentity(project)));
  identityEntries.set(TERRAIN_WORLD_INDEX_PATH, encodeTerrainCanonicalJson(canonicalWorldIdentity(world)));
  for (const descriptor of world.regions) {
    const regionPath = descriptor.manifest.url;
    const manifest = parseJson<TerrainProjectRegion>(requireEntry(entries, regionPath), regionPath);
    if (manifest.placedPrefabPrototypes !== undefined || manifest.placedPrefabInstances !== undefined) {
      identityEntries.set(regionPath, encodeTerrainCanonicalJson(canonicalRegionIdentity(manifest)));
    }
  }
  return hashTerrainPathEntries(identityEntries, false);
}

async function hashTerrainPathEntries(entries: TerrainProjectEntries, omitProjectRoot: boolean): Promise<string> {
  const chunks: Uint8Array[] = [];
  const sortedEntries = Array.from(entries).sort(([left], [right]) => compareTerrainStableValues(left, right));
  for (const [path, bytes] of sortedEntries) {
    requireTerrainArtifactRelativePath(path, "Project hash entry");
    if (omitProjectRoot && path === "project.json") continue;
    const pathBytes = textEncoder.encode(path);
    chunks.push(uint32Bytes(pathBytes.length), pathBytes, uint32Bytes(bytes.byteLength), bytes);
  }
  return sha256TerrainBytes(concatenate(chunks));
}

function canonicalProjectIdentity(project: TerrainProjectFile): Record<string, unknown> {
  return {
    ...(project as unknown as Record<string, unknown>),
    files: [...project.files].sort((left, right) => compareTerrainStableValues(left.virtualPath, right.virtualPath))
  };
}

function canonicalWorldIdentity(world: TerrainProjectWorldIndex): Record<string, unknown> {
  const { contentHash: _contentHash, ...identity } = world;
  return {
    ...identity,
    regions: [...world.regions].sort((left, right) => compareTerrainStableValues(left.id, right.id)),
    heightSeams: [...world.heightSeams].sort((left, right) => compareTerrainStableValues(left.id, right.id))
  };
}

function canonicalRegionIdentity(region: TerrainProjectRegion): Record<string, unknown> {
  return {
    ...region,
    placedPrefabPrototypes: [...(region.placedPrefabPrototypes ?? [])].sort((left, right) =>
      compareTerrainStableValues(left.id, right.id)
    ),
    placedPrefabInstances: [...(region.placedPrefabInstances ?? [])].sort((left, right) =>
      compareTerrainStableValues(left.id, right.id)
    )
  };
}

/**
 * Encodes one JSON value with deterministic object-key ordering and normalized finite numbers.
 * @param value JSON-compatible value to encode.
 * @returns Canonical UTF-8 JSON bytes detached from the input value.
 * @throws If the value contains unsupported types or non-finite numbers.
 */
export function encodeTerrainCanonicalJson(value: unknown): Uint8Array {
  return textEncoder.encode(canonicalJsonString(value));
}

function canonicalJsonString(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Terrain Project identity contains a non-finite number");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => (entry === undefined ? "null" : canonicalJsonString(entry))).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const properties = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort(compareTerrainStableValues)
      .map((key) => `${JSON.stringify(key)}:${canonicalJsonString(record[key])}`);
    return `{${properties.join(",")}}`;
  }
  throw new Error(`Terrain Project identity contains unsupported JSON value type "${typeof value}"`);
}

/**
 * Computes SHA-256 in secure and ordinary HTTP browser contexts.
 * @param bytes Exact bytes to hash.
 * @returns Lowercase hexadecimal digest.
 */
export async function sha256TerrainBytes(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const copy = bytes.slice();
      return bytesToHex(new Uint8Array(await subtle.digest("SHA-256", copy.buffer)));
    } catch {
      // Some embedded browsers expose SubtleCrypto where digest is unavailable.
    }
  }
  return sha256Portable(bytes);
}

function parseJson<T>(bytes: Uint8Array, label: string): T {
  try {
    return JSON.parse(textDecoder.decode(bytes)) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

function requireEntry(entries: TerrainProjectEntries, path: string | undefined): Uint8Array {
  if (!path) throw new Error("Terrain Project contains an empty resource path");
  const bytes = entries.get(path);
  if (!bytes) throw new Error(`Project entry "${path}" is missing`);
  return bytes;
}

async function verifyTerrainPayload(bytes: Uint8Array, expected: string, label: string): Promise<void> {
  const actual = await sha256TerrainBytes(bytes);
  if (actual !== expected) throw new Error(`${label} SHA-256 mismatch: expected ${expected}, received ${actual}`);
}

/**
 * Verifies one canonical binary payload against its declared digest.
 * @param bytes Exact payload bytes.
 * @param expected Declared lowercase SHA-256 digest.
 * @param label Resource label used in validation errors.
 * @returns Nothing after successful verification.
 * @throws If the declaration is malformed or the digest differs.
 */
export async function verifyTerrainProjectPayload(bytes: Uint8Array, expected: string, label: string): Promise<void> {
  if (!isSha256(expected)) throw new Error(`${label} declares an invalid SHA-256 digest`);
  await verifyTerrainPayload(bytes, expected, label);
}

function uint32Bytes(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

const SHA256_INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);

const SHA256_ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function sha256Portable(source: Uint8Array): string {
  const paddedLength = Math.ceil((source.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(source);
  padded[source.byteLength] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(source.byteLength / 0x20000000), false);
  view.setUint32(paddedLength - 4, (source.byteLength * 8) >>> 0, false);

  const hash = SHA256_INITIAL_HASH.slice();
  const words = new Uint32Array(64);
  for (let blockOffset = 0; blockOffset < paddedLength; blockOffset += 64) {
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(blockOffset + index * 4, false);
    for (let index = 16; index < 64; index++) {
      const value15 = words[index - 15];
      const value2 = words[index - 2];
      const sigma0 = rotateRight(value15, 7) ^ rotateRight(value15, 18) ^ (value15 >>> 3);
      const sigma1 = rotateRight(value2, 17) ^ rotateRight(value2, 19) ^ (value2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];
    for (let index = 0; index < 64; index++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choose + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return Array.from(hash, (value) => value.toString(16).padStart(8, "0")).join("");
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}
