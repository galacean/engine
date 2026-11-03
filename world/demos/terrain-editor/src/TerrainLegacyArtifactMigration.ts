import { compareTerrainStableValues } from "@galacean/engine-terrain/terrain/TerrainStableOrder";
import { requireTerrainArtifactRelativePath } from "@galacean/engine-terrain/terrain/project/TerrainArtifactPath";
import {
  indexTerrainProjectArtifact,
  type TerrainProjectArtifactEntries
} from "@galacean/engine-terrain/terrain/project/TerrainProjectArtifactAssembler";
import {
  encodeTerrainCanonicalJson,
  hashTerrainProjectClosure,
  importTerrainProject,
  sha256TerrainBytes
} from "@galacean/engine-terrain/terrain/project/TerrainProjectCodec";
import {
  TERRAIN_DETAIL_TRANSFORM_FORMAT,
  TERRAIN_RASTER_LAYOUT,
  TERRAIN_WORLD_INDEX_PATH,
  type TerrainProjectDetailPrototype,
  type TerrainProjectDocument,
  type TerrainProjectFile,
  type TerrainProjectLayer,
  type TerrainProjectRegion,
  type TerrainProjectTreePrototype,
  type TerrainProjectWorldIndex
} from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import { sampleTerrainDocumentHeight } from "@galacean/engine-world-planning/authoring/terrain/TerrainHeightfield";

const textDecoder = new TextDecoder();
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DETAIL_TRANSFORM_STRIDE = 6;

interface LegacyProjectFile {
  readonly scene: string;
  readonly files: readonly LegacyProjectResource[];
}

interface LegacyProjectResource {
  readonly id: string;
  readonly virtualPath: string;
  readonly path: string;
  readonly type: string;
}

interface LegacyTerrainLayer {
  readonly id: string;
  readonly name: string;
  readonly albedo: { readonly url: string };
  readonly tileSize: readonly [number, number];
  readonly tint: readonly [number, number, number, number];
  readonly metallic: number;
  readonly smoothness: number;
}

interface LegacyDetailPrototype {
  readonly id: string;
  readonly name: string;
  readonly density: { readonly url: string; readonly sha256: string };
  readonly healthyColor: readonly [number, number, number, number];
  readonly dryColor: readonly [number, number, number, number];
  readonly minScale: number;
  readonly maxScale: number;
}

interface LegacyTreePrototype {
  readonly id: string;
  readonly name: string;
}

interface LegacyTreeInstance {
  readonly id: string;
  readonly prototypeId: string;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly scale: number;
}

interface LegacyTerrainRegion {
  readonly version: "1.0";
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly resolutions: {
    readonly height: number;
    readonly alphamap: number;
    readonly holes: number;
    readonly detail: number;
  };
  readonly heightmap: {
    readonly url: string;
    readonly format: "r16-unorm-le";
    readonly minMetres: number;
    readonly maxMetres: number;
    readonly sha256: string;
  };
  readonly holes: {
    readonly url: string;
    readonly format: "r8-unorm";
    readonly solidValue: number;
    readonly sha256: string;
  };
  readonly alphamaps: readonly {
    readonly url: string;
    readonly format: "rgba8-unorm";
    readonly layers: readonly string[];
    readonly sha256: string;
  }[];
  readonly layers: readonly LegacyTerrainLayer[];
  readonly detailPrototypes: readonly LegacyDetailPrototype[];
  readonly treePrototypes: readonly LegacyTreePrototype[];
  readonly treeInstances: readonly LegacyTreeInstance[];
  readonly seed: number;
  readonly wind?: {
    readonly speed?: number;
    readonly strength?: number;
  };
}

interface ParsedLegacyArtifact {
  readonly project: LegacyProjectFile;
  readonly entries: ReadonlyMap<string, Uint8Array>;
  readonly declarations: ReadonlyMap<string, LegacyProjectResource>;
  readonly region: LegacyTerrainRegion;
}

/**
 * Identifies the prior editor's single-Region Project declaration without accepting it as canonical data.
 * @param artifact Raw selected-directory entries containing a possible root Project manifest.
 * @returns Whether every declaration uses the recognized prior physical-path form and includes a Terrain resource.
 */
export function isLegacyTerrainEditorArtifact(artifact: ReadonlyMap<string, Uint8Array>): boolean {
  const root = artifact.get("project.json");
  if (!root) return false;
  try {
    const project = JSON.parse(textDecoder.decode(root)) as LegacyProjectFile;
    return (
      Array.isArray(project.files) &&
      project.files.length > 0 &&
      project.files.every((file) => typeof file?.path === "string" && file.path.startsWith("./")) &&
      project.files.some((file) => file.type === "TerrainProject")
    );
  } catch {
    return false;
  }
}

/**
 * Detects and migrates the prior single-Region editor artifact into the current canonical Project contract.
 * @remarks The canonical importer remains strict. This adapter exists only at the editor's file-import boundary and
 * reuses the current preview Project's standard Scene, shaders, materials, and Prefabs.
 * @param artifact Raw selected-directory entries rooted beside the prior `project.json`.
 * @param templateArtifact Current verified single-Region preview Project used for standard runtime resources.
 * @returns A complete current `project.json + public/` artifact preserving authored maps and placements.
 * @throws If the input is not the recognized prior editor contract, resources fail hashes, or migration is invalid.
 */
export async function migrateLegacyTerrainEditorArtifact(
  artifact: ReadonlyMap<string, Uint8Array>,
  templateArtifact: TerrainProjectArtifactEntries
): Promise<TerrainProjectArtifactEntries> {
  const legacy = await parseLegacyArtifact(artifact);
  const templatePhysical = cloneByteEntries(templateArtifact);
  const templateVirtual = new Map(indexTerrainProjectArtifact(templatePhysical));
  const imported = await importTerrainProject(templateVirtual);
  if (imported.documents.length !== 1 || imported.world.regions.length !== 1) {
    throw new Error("Legacy Terrain editor migration requires a single-Region canonical template");
  }

  const project = cloneJson(imported.project);
  const descriptor = cloneJson(imported.world.regions[0]);
  const templateDocument = imported.documents[0];
  const region = legacy.region;
  descriptor.worldPosition = [0, 0, 0];
  descriptor.worldSize = [...region.size];

  const virtual = new Map<string, Uint8Array>();
  for (const [path, bytes] of templateVirtual) virtual.set(path, bytes.slice());
  const heightBytes = requireLegacyEntry(legacy, region.heightmap.url);
  const holesBytes = requireLegacyEntry(legacy, region.holes.url);
  const alphamapSource = requireSingleAlphamap(region);
  const alphamapBytes = requireLegacyEntry(legacy, alphamapSource.url);
  requireByteLength(heightBytes, region.resolutions.height ** 2 * 2, "legacy heightmap");
  requireByteLength(holesBytes, region.resolutions.holes ** 2, "legacy holes");
  requireByteLength(alphamapBytes, region.resolutions.alphamap ** 2 * 4, "legacy Alphamap");
  await Promise.all([
    verifyLegacyHash(heightBytes, region.heightmap.sha256, "heightmap"),
    verifyLegacyHash(holesBytes, region.holes.sha256, "holes"),
    verifyLegacyHash(alphamapBytes, alphamapSource.sha256, "Alphamap")
  ]);

  const layers = await migrateLayers(legacy, project, virtual, region.layers, templateDocument.manifest.layers);
  const heightmap = decodeHeightmap(heightBytes);
  const manifest = await createMigratedManifest(
    legacy,
    project,
    virtual,
    templateDocument,
    descriptor,
    heightmap,
    heightBytes,
    holesBytes,
    alphamapBytes,
    alphamapSource,
    layers
  );
  virtual.set(descriptor.manifest.url, encodeTerrainCanonicalJson(manifest));

  const world: TerrainProjectWorldIndex = {
    version: "1.0",
    regions: [descriptor],
    heightSeams: [],
    contentHash: imported.world.contentHash
  };
  project.files.sort((left, right) => compareTerrainStableValues(left.virtualPath, right.virtualPath));
  virtual.set("project.json", encodeTerrainCanonicalJson(project));
  virtual.set(TERRAIN_WORLD_INDEX_PATH, encodeTerrainCanonicalJson(world));
  world.contentHash = await hashTerrainProjectClosure(virtual);
  virtual.set(TERRAIN_WORLD_INDEX_PATH, encodeTerrainCanonicalJson(world));

  const physical = new Map<string, Uint8Array>([["project.json", virtual.get("project.json")!]]);
  for (const file of project.files) {
    const bytes = virtual.get(file.virtualPath);
    if (!bytes) throw new Error(`Migrated Terrain Project is missing resource "${file.virtualPath}"`);
    physical.set(file.path, bytes);
  }
  const indexed = indexTerrainProjectArtifact(physical);
  await importTerrainProject(indexed);
  return new Map(
    [...physical].sort(([left], [right]) => compareTerrainStableValues(left, right))
  ) as TerrainProjectArtifactEntries;
}

async function parseLegacyArtifact(artifact: ReadonlyMap<string, Uint8Array>): Promise<ParsedLegacyArtifact> {
  const root = artifact.get("project.json");
  if (!root) throw new Error("Selected Terrain Project directory has no root project.json");
  const project = parseJson<LegacyProjectFile>(root, "legacy project.json");
  if (!Array.isArray(project.files) || typeof project.scene !== "string") {
    throw new Error("Selected artifact is not a recognized legacy Terrain editor Project");
  }
  const entries = new Map<string, Uint8Array>();
  const declarations = new Map<string, LegacyProjectResource>();
  const declaredPhysical = new Set<string>(["project.json"]);
  for (const file of project.files) {
    if (!file || typeof file !== "object" || typeof file.virtualPath !== "string" || typeof file.path !== "string") {
      throw new Error("Legacy Terrain Project contains an invalid resource declaration");
    }
    const virtualPath = requireTerrainArtifactRelativePath(file.virtualPath, "Legacy Terrain virtual path");
    if (!file.path.startsWith("./"))
      throw new Error("Selected artifact is not a recognized legacy Terrain editor Project");
    const physicalPath = requireTerrainArtifactRelativePath(file.path.slice(2), "Legacy Terrain physical path");
    const bytes = artifact.get(physicalPath);
    if (!bytes) throw new Error(`Legacy Terrain Project is missing physical file "${physicalPath}"`);
    if (entries.has(virtualPath)) throw new Error(`Legacy Terrain Project repeats virtual path "${virtualPath}"`);
    entries.set(virtualPath, bytes);
    declarations.set(virtualPath, file);
    declaredPhysical.add(physicalPath);
  }
  for (const path of artifact.keys()) {
    if (path.endsWith("/.DS_Store") || path === ".DS_Store") continue;
    if (!declaredPhysical.has(path)) throw new Error(`Legacy Terrain Project contains undeclared file "${path}"`);
  }
  const regionDeclaration = [...declarations.values()].find((file) => file.type === "TerrainProject");
  if (!regionDeclaration) throw new Error("Selected artifact is not a recognized legacy Terrain editor Project");
  const region = parseJson<LegacyTerrainRegion>(
    requireMapEntry(entries, regionDeclaration.virtualPath, "legacy Region"),
    regionDeclaration.virtualPath
  );
  validateLegacyRegion(region);
  return { project, entries, declarations, region };
}

function validateLegacyRegion(region: LegacyTerrainRegion): void {
  if (region?.version !== "1.0" || !Array.isArray(region.size) || region.size.length !== 3) {
    throw new Error("Selected artifact is not a recognized legacy Terrain editor Project");
  }
  requirePositiveInteger(region.resolutions?.height, "legacy height resolution");
  requirePositiveInteger(region.resolutions?.holes, "legacy holes resolution");
  requirePositiveInteger(region.resolutions?.alphamap, "legacy Alphamap resolution");
  requirePositiveInteger(region.resolutions?.detail, "legacy Detail resolution");
  if (region.heightmap?.format !== "r16-unorm-le" || region.holes?.format !== "r8-unorm") {
    throw new Error("Legacy Terrain Project uses an unsupported height or holes encoding");
  }
  if (region.holes.solidValue !== 255) throw new Error("Legacy Terrain holes solidValue must be 255");
  if (!Array.isArray(region.layers) || region.layers.length === 0 || region.layers.length > 4) {
    throw new Error("Legacy Terrain Project must contain one to four Terrain layers");
  }
  if (
    !Array.isArray(region.detailPrototypes) ||
    !Array.isArray(region.treePrototypes) ||
    !Array.isArray(region.treeInstances)
  ) {
    throw new Error("Legacy Terrain Project has malformed surface prototypes");
  }
  for (const value of region.size) {
    if (!Number.isFinite(value) || value <= 0)
      throw new Error("Legacy Terrain Region size must be finite and positive");
  }
  requireDigest(region.heightmap.sha256, "legacy heightmap");
  requireDigest(region.holes.sha256, "legacy holes");
}

function requireSingleAlphamap(region: LegacyTerrainRegion): LegacyTerrainRegion["alphamaps"][number] {
  if (
    !Array.isArray(region.alphamaps) ||
    region.alphamaps.length !== 1 ||
    region.alphamaps[0].format !== "rgba8-unorm"
  ) {
    throw new Error("Legacy Terrain migration supports exactly one RGBA8 Alphamap");
  }
  requireDigest(region.alphamaps[0].sha256, "legacy Alphamap");
  return region.alphamaps[0];
}

async function migrateLayers(
  legacy: ParsedLegacyArtifact,
  project: TerrainProjectFile,
  virtual: Map<string, Uint8Array>,
  sourceLayers: readonly LegacyTerrainLayer[],
  templateLayers: readonly TerrainProjectLayer[]
): Promise<TerrainProjectLayer[]> {
  if (templateLayers.length === 0) throw new Error("Canonical template has no Terrain layer normal resources");
  const layers: TerrainProjectLayer[] = [];
  for (let index = 0; index < sourceLayers.length; index++) {
    const source = sourceLayers[index];
    const textureBytes = requireLegacyEntry(legacy, source.albedo.url);
    const extension = imageExtension(source.albedo.url);
    const textureUrl = `Imported/Texture/layer-${index.toString().padStart(2, "0")}.${extension}`;
    virtual.set(textureUrl, textureBytes.slice());
    addProjectFile(project, {
      id: `asset-imported-layer-${index.toString().padStart(2, "0")}`,
      virtualPath: textureUrl,
      path: `public/${textureUrl}`,
      type: "Texture",
      params: {
        isSRGBColorSpace: true,
        mipmap: true,
        filterMode: 2,
        wrapModeU: 1,
        wrapModeV: 1,
        anisoLevel: 8
      }
    });
    layers.push({
      id: requireStableString(source.id, "legacy Terrain layer id"),
      name: requireStableString(source.name, "legacy Terrain layer name"),
      diffuse: { url: textureUrl },
      normal: cloneJson(templateLayers[index % templateLayers.length].normal),
      tileSize: requireFiniteTuple(source.tileSize, 2, "legacy Terrain layer tileSize"),
      tileOffset: [0, 0],
      normalScale: 1,
      diffuseRemapMin: [0, 0, 0, 0],
      diffuseRemapMax: requireFiniteTuple(source.tint, 4, "legacy Terrain layer tint"),
      maskRemapMin: [0, 0, 0, 0],
      maskRemapMax: [1, 1, 1, 1],
      metallic: requireUnitInterval(source.metallic, "legacy Terrain layer metallic"),
      smoothness: requireUnitInterval(source.smoothness, "legacy Terrain layer smoothness"),
      specular: [0, 0, 0, 0]
    });
  }
  return layers;
}

async function createMigratedManifest(
  legacy: ParsedLegacyArtifact,
  project: TerrainProjectFile,
  virtual: Map<string, Uint8Array>,
  templateDocument: TerrainProjectDocument,
  descriptor: TerrainProjectDocument["descriptor"],
  heightmap: Uint16Array,
  heightBytes: Uint8Array,
  holesBytes: Uint8Array,
  alphamapBytes: Uint8Array,
  alphamapSource: LegacyTerrainRegion["alphamaps"][number],
  layers: readonly TerrainProjectLayer[]
): Promise<TerrainProjectRegion> {
  const source = legacy.region;
  const manifest = cloneJson(templateDocument.manifest);
  const heightDataUrl = manifest.heightmap.data.url;
  const holesDataUrl = manifest.holes?.data.url ?? `Payloads/${descriptor.id}/holes.r8`;
  const alphamapDataUrl = manifest.alphamaps[0].data.url;
  virtual.set(heightDataUrl, heightBytes.slice());
  virtual.set(holesDataUrl, holesBytes.slice());
  virtual.set(alphamapDataUrl, alphamapBytes.slice());

  manifest.name = source.name;
  manifest.heightmap = {
    data: { url: heightDataUrl },
    format: "r16-unorm-le",
    layout: TERRAIN_RASTER_LAYOUT,
    sampleLayout: "uniform-inclusive",
    sampleSize: [source.resolutions.height, source.resolutions.height],
    minMetres: source.heightmap.minMetres,
    maxMetres: source.heightmap.maxMetres,
    sha256: await sha256TerrainBytes(heightBytes)
  };
  manifest.holes = {
    data: { url: holesDataUrl },
    format: "r8-unorm",
    layout: TERRAIN_RASTER_LAYOUT,
    sampleSize: [source.resolutions.holes, source.resolutions.holes],
    solidValue: 255,
    sha256: await sha256TerrainBytes(holesBytes)
  };
  manifest.alphamaps = [
    {
      data: { url: alphamapDataUrl },
      format: "rgba8-unorm",
      layout: TERRAIN_RASTER_LAYOUT,
      sampleSize: [source.resolutions.alphamap, source.resolutions.alphamap],
      layers: [layers[0]?.id ?? null, layers[1]?.id ?? null, layers[2]?.id ?? null, layers[3]?.id ?? null],
      sha256: await sha256TerrainBytes(alphamapBytes)
    }
  ];
  if (alphamapSource.layers.length !== layers.length) {
    throw new Error("Legacy Alphamap channels do not match its Terrain layer declarations");
  }
  manifest.layers = [...layers];
  manifest.detailResolutionPerPatch = Math.min(16, source.resolutions.detail);
  manifest.placedPrefabPrototypes = [];
  manifest.placedPrefabInstances = [];
  manifest.grassWind = {
    speed: source.wind?.speed ?? templateDocument.manifest.grassWind.speed,
    size: templateDocument.manifest.grassWind.size,
    bending: source.wind?.strength ?? templateDocument.manifest.grassWind.bending,
    tint: templateDocument.manifest.grassWind.tint
  };

  const documentForSampling: TerrainProjectDocument = {
    ...templateDocument,
    descriptor,
    manifest,
    heightmap,
    holes: holesBytes,
    alphamaps: [alphamapBytes],
    detailMaps: new Map(),
    detailTransforms: new Map()
  };
  const detailMigration = await migrateDetails(legacy, project, virtual, templateDocument, documentForSampling);
  manifest.detailPrototypes = detailMigration.prototypes;
  manifest.treePrototypes = migrateTreePrototypes(source.treePrototypes, templateDocument.manifest.treePrototypes);
  manifest.treeInstances = source.treeInstances.map((instance) => {
    const prototype = manifest.treePrototypes.find((candidate) => candidate.id === instance.prototypeId);
    if (!prototype) throw new Error(`Legacy tree instance references unknown prototype "${instance.prototypeId}"`);
    const position = requireFiniteTuple(instance.position, 3, "legacy tree position");
    const worldY = sampleTerrainDocumentHeight(documentForSampling, position[0], position[2]);
    const scale = requirePositiveFinite(instance.scale, "legacy tree scale");
    return {
      id: requireStableString(instance.id, "legacy tree instance id"),
      prototypeId: prototype.id,
      localPosition: [position[0], worldY ?? position[1], position[2]],
      rotationYRadians: requireFinite(instance.rotationY, "legacy tree rotation"),
      scale: [scale, scale, scale],
      color: [1, 1, 1, 1],
      lightmapColor: [1, 1, 1, 1]
    };
  });
  return manifest;
}

async function migrateDetails(
  legacy: ParsedLegacyArtifact,
  project: TerrainProjectFile,
  virtual: Map<string, Uint8Array>,
  templateDocument: TerrainProjectDocument,
  documentForSampling: TerrainProjectDocument
): Promise<{ prototypes: TerrainProjectDetailPrototype[] }> {
  const templates = templateDocument.manifest.detailPrototypes.filter(
    (prototype) => prototype.useInstancing && prototype.usePrototypeMesh && prototype.prefab
  );
  if (templates.length < legacy.region.detailPrototypes.length) {
    throw new Error("Canonical template does not provide enough renderable Detail prototypes for legacy migration");
  }
  const prototypes: TerrainProjectDetailPrototype[] = [];
  for (let index = 0; index < legacy.region.detailPrototypes.length; index++) {
    const source = legacy.region.detailPrototypes[index];
    const template = templates[index];
    const legacyDensity = requireLegacyEntry(legacy, source.density.url);
    requireByteLength(legacyDensity, legacy.region.resolutions.detail ** 2, `legacy Detail density "${source.id}"`);
    await verifyLegacyHash(legacyDensity, source.density.sha256, `Detail density "${source.id}"`);
    const density = convertCoverageToCounts(legacyDensity, legacy.region.seed, index);
    const transforms = generateDetailTransforms(
      density,
      legacy.region.resolutions.detail,
      documentForSampling,
      source,
      legacy.region.seed,
      index
    );
    const densityUrl =
      template.density.kind === "r8-count"
        ? template.density.data.url
        : `Imported/Payloads/detail-${index.toString().padStart(2, "0")}.r8`;
    const transformsUrl =
      template.exactTransforms?.data.url ?? `Imported/Payloads/detail-${index.toString().padStart(2, "0")}.f32le`;
    if (template.density.kind !== "r8-count") {
      addProjectFile(project, {
        id: `asset-imported-detail-density-${index.toString().padStart(2, "0")}`,
        virtualPath: densityUrl,
        path: `public/${densityUrl}`,
        type: "Buffer"
      });
    }
    if (!template.exactTransforms) {
      addProjectFile(project, {
        id: `asset-imported-detail-transforms-${index.toString().padStart(2, "0")}`,
        virtualPath: transformsUrl,
        path: `public/${transformsUrl}`,
        type: "Buffer"
      });
    }
    const transformBytes = encodeDetailTransforms(transforms);
    virtual.set(densityUrl, density);
    virtual.set(transformsUrl, transformBytes);
    prototypes.push({
      ...cloneJson(template),
      id: requireStableString(source.id, "legacy Detail prototype id"),
      name: requireStableString(source.name, "legacy Detail prototype name"),
      densitySampleSize: [legacy.region.resolutions.detail, legacy.region.resolutions.detail],
      density: {
        kind: "r8-count",
        data: { url: densityUrl },
        layout: TERRAIN_RASTER_LAYOUT,
        sha256: await sha256TerrainBytes(density)
      },
      exactTransforms: {
        data: { url: transformsUrl },
        format: TERRAIN_DETAIL_TRANSFORM_FORMAT,
        count: transforms.length / DETAIL_TRANSFORM_STRIDE,
        sha256: await sha256TerrainBytes(transformBytes)
      },
      healthyColor: requireFiniteTuple(source.healthyColor, 4, "legacy Detail healthyColor"),
      dryColor: requireFiniteTuple(source.dryColor, 4, "legacy Detail dryColor"),
      minWidth: requirePositiveFinite(source.minScale, "legacy Detail minScale"),
      maxWidth: requirePositiveFinite(source.maxScale, "legacy Detail maxScale"),
      minHeight: requirePositiveFinite(source.minScale, "legacy Detail minScale"),
      maxHeight: requirePositiveFinite(source.maxScale, "legacy Detail maxScale"),
      maximumSourceCount: transforms.length / DETAIL_TRANSFORM_STRIDE
    });
  }
  return { prototypes };
}

function migrateTreePrototypes(
  sources: readonly LegacyTreePrototype[],
  templates: readonly TerrainProjectTreePrototype[]
): TerrainProjectTreePrototype[] {
  if (templates.length < sources.length) {
    throw new Error("Canonical template does not provide enough renderable tree prototypes for legacy migration");
  }
  return sources.map((source, index) => ({
    ...cloneJson(templates[index]),
    id: requireStableString(source.id, "legacy tree prototype id"),
    name: requireStableString(source.name, "legacy tree prototype name")
  }));
}

function convertCoverageToCounts(source: Uint8Array, seed: number, prototypeIndex: number): Uint8Array {
  const density = new Uint8Array(source.length);
  for (let index = 0; index < source.length; index++) {
    density[index] = (hash32(seed, prototypeIndex, index) & 0xff) < source[index] ? 1 : 0;
  }
  return density;
}

function generateDetailTransforms(
  density: Uint8Array,
  resolution: number,
  document: TerrainProjectDocument,
  prototype: LegacyDetailPrototype,
  seed: number,
  prototypeIndex: number
): Float32Array {
  const values: number[] = [];
  const size = document.descriptor.worldSize;
  const minScale = requirePositiveFinite(prototype.minScale, "legacy Detail minScale");
  const maxScale = requirePositiveFinite(prototype.maxScale, "legacy Detail maxScale");
  if (maxScale < minScale) throw new Error("Legacy Detail scale range must be increasing");
  for (let cell = 0; cell < density.length; cell++) {
    if (density[cell] === 0) continue;
    const random = createRandom(hash32(seed, prototypeIndex, cell));
    const localX = (((cell % resolution) + random()) / resolution) * size[0];
    const localZ = ((Math.floor(cell / resolution) + random()) / resolution) * size[2];
    const worldY = sampleTerrainDocumentHeight(
      document,
      document.descriptor.worldPosition[0] + localX,
      document.descriptor.worldPosition[2] + localZ
    );
    if (worldY === null) continue;
    const scale = minScale + random() * (maxScale - minScale);
    values.push(localX, worldY - document.descriptor.worldPosition[1], localZ, random() * Math.PI * 2, scale, scale);
  }
  return Float32Array.from(values);
}

function decodeHeightmap(bytes: Uint8Array): Uint16Array {
  const result = new Uint16Array(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < result.length; index++) result[index] = view.getUint16(index * 2, true);
  return result;
}

function encodeDetailTransforms(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(4 + values.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, values.length / DETAIL_TRANSFORM_STRIDE, true);
  for (let index = 0; index < values.length; index++) view.setFloat32(4 + index * 4, values[index], true);
  return bytes;
}

function addProjectFile(project: TerrainProjectFile, file: TerrainProjectFile["files"][number]): void {
  if (project.files.some((candidate) => candidate.id === file.id)) {
    throw new Error(`Migrated Terrain Project repeats resource id "${file.id}"`);
  }
  if (project.files.some((candidate) => candidate.virtualPath === file.virtualPath || candidate.path === file.path)) {
    throw new Error(`Migrated Terrain Project repeats resource path "${file.virtualPath}"`);
  }
  project.files.push(file);
}

function requireLegacyEntry(legacy: ParsedLegacyArtifact, virtualPath: string): Uint8Array {
  const path = requireTerrainArtifactRelativePath(virtualPath, "Legacy Terrain resource path");
  const declaration = legacy.declarations.get(path);
  if (!declaration) throw new Error(`Legacy Terrain Project does not declare resource "${path}"`);
  return requireMapEntry(legacy.entries, path, "legacy Terrain resource");
}

async function verifyLegacyHash(bytes: Uint8Array, expected: string, label: string): Promise<void> {
  requireDigest(expected, `legacy ${label}`);
  if ((await sha256TerrainBytes(bytes)) !== expected) throw new Error(`Legacy Terrain ${label} SHA-256 mismatch`);
}

function requireByteLength(bytes: Uint8Array, expected: number, label: string): void {
  if (bytes.byteLength !== expected) throw new Error(`${label} byte length must be ${expected}`);
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 2) throw new Error(`${label} must be an integer of at least 2`);
  return value;
}

function requireDigest(value: string, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new Error(`${label} must be a SHA-256 digest`);
  return value;
}

function requireStableString(value: string, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim()) throw new Error(`${label} must be nonempty`);
  return value;
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function requirePositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be finite and positive`);
  return value;
}

function requireUnitInterval(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be in [0,1]`);
  return value;
}

function requireFiniteTuple(value: readonly number[], length: 2, label: string): [number, number];
function requireFiniteTuple(value: readonly number[], length: 3, label: string): [number, number, number];
function requireFiniteTuple(value: readonly number[], length: 4, label: string): [number, number, number, number];
function requireFiniteTuple(value: readonly number[], length: number, label: string): number[] {
  if (!Array.isArray(value) || value.length !== length || value.some((component) => !Number.isFinite(component))) {
    throw new Error(`${label} must contain ${length} finite values`);
  }
  return [...value];
}

function imageExtension(path: string): "png" | "jpg" | "jpeg" | "webp" {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "png" || extension === "jpg" || extension === "jpeg" || extension === "webp") return extension;
  throw new Error(`Legacy Terrain texture "${path}" uses an unsupported image extension`);
}

function hash32(first: number, second: number, third: number): number {
  let value = (first ^ Math.imul(second + 1, 0x9e3779b1) ^ Math.imul(third + 1, 0x85ebca6b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function createRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function parseJson<T>(bytes: Uint8Array, label: string): T {
  try {
    return JSON.parse(textDecoder.decode(bytes)) as T;
  } catch (error) {
    throw new Error(`${label} is invalid JSON`, { cause: error });
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(textDecoder.decode(encodeTerrainCanonicalJson(value))) as T;
}

function cloneByteEntries(entries: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> {
  return new Map([...entries].map(([path, bytes]) => [path, bytes.slice()]));
}

function requireMapEntry(entries: ReadonlyMap<string, Uint8Array>, path: string, label: string): Uint8Array {
  const bytes = entries.get(path);
  if (!bytes) throw new Error(`${label} "${path}" is missing`);
  return bytes;
}
