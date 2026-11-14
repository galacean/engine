import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { loadOfficialBrotliDecoder } from "@galacean/engine-terrain/terrain/compression/OfficialBrotliDecoder";
import {
  TerrainBrotliResultType,
  TerrainCompressionAssetType,
  type TerrainBrotliHeightmapLoaderParams,
  type TerrainBrotliLoaderParams
} from "@galacean/engine-terrain/terrain/compression/TerrainCompressionAssetType";
import {
  prepareTerrainHeightForBrotli,
  restoreTerrainHeightFromBrotli
} from "@galacean/engine-terrain/terrain/compression/TerrainHeightBrotliTransform";
import {
  TERRAIN_WORLD_INDEX_PATH,
  type TerrainProjectFile,
  type TerrainProjectRegion,
  type TerrainProjectWorldIndex
} from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import { loadOfficialBrotliEncoder } from "./OfficialBrotliEncoder.ts";
import { restoreTerrainCompressionSourceProject } from "./TerrainCompressionProjectSource.ts";

const BROTLI_SOURCE_COMMIT = "028fb5a23661f123017c060daa546b55cf4bde29";
const EMCC_VERSION = "6.0.6";
const PROFILE_VERSION = 1;

/** Terrain resource roles understood by the offline Project packer. */
export const TerrainCompressionResourceKind = {
  /** Canonical Region document, including tree and placed-Prefab instances. */
  RegionJSON: "region-json",
  /** Canonical little-endian unsigned 16-bit Height raster. */
  HeightR16: "height-r16",
  /** Canonical four-channel unsigned 8-bit Alphamap raster. */
  AlphamapRGBA8: "alphamap-rgba8"
} as const;

/** Resource role accepted by a Terrain compression profile. */
export type TerrainCompressionResourceKind =
  (typeof TerrainCompressionResourceKind)[keyof typeof TerrainCompressionResourceKind];

/** Demo-private AssetType selected by the offline profile and written to Project. */
export type TerrainCompressionProfileAssetType =
  (typeof TerrainCompressionAssetType)[keyof typeof TerrainCompressionAssetType];

/** Declarative offline selection of Terrain resource encoding pipelines. */
export interface TerrainProjectCompressionProfile {
  /** Profile schema version. */
  readonly version: typeof PROFILE_VERSION;
  /** Official Brotli encoder settings shared by selected resources. */
  readonly brotli: {
    /** Compression quality in the official Brotli range 0 through 11. */
    readonly quality: number;
    /** Base-2 sliding-window size in the official Brotli range 10 through 24. */
    readonly lgwin: number;
  };
  /** AssetType selected for each semantic resource role; omitted roles remain unchanged. */
  readonly resources: Partial<Record<TerrainCompressionResourceKind, TerrainCompressionProfileAssetType>>;
}

/** File-system inputs and output report used by one offline Project packing operation. */
export interface PackTerrainProjectCompressionOptions {
  /** Existing exported Project whose declared raw files are encoder inputs. */
  readonly projectPath: string;
  /** Validated compression policy applied to resources discovered from the Terrain contract. */
  readonly profile: TerrainProjectCompressionProfile;
  /** Destination for the deterministic build report; defaults beside `project.json`. */
  readonly manifestPath?: string;
}

/** Aggregate result from one verified offline Project packing operation. */
export interface TerrainProjectCompressionPackSummary {
  /** Number of Project declarations replaced by compressed declarations. */
  readonly replacementFiles: number;
  /** Total canonical source size before optional transforms. */
  readonly rawBytes: number;
  /** Total intermediate size passed to the official Brotli encoder. */
  readonly preparedBytes: number;
  /** Total standard Brotli stream size written to disk. */
  readonly encodedBytes: number;
  /** Fraction of canonical source bytes removed by the complete configured pipeline. */
  readonly savingsRatio: number;
  /** Number of entries whose decoded SHA-256 matches the source SHA-256. */
  readonly verifiedFiles: number;
}

interface DiscoveredResource {
  readonly kind: TerrainCompressionResourceKind;
  readonly virtualPath: string;
  readonly width?: number;
  readonly height?: number;
}

interface PreparedResource {
  readonly assetType: TerrainCompressionProfileAssetType;
  readonly params: TerrainBrotliLoaderParams | TerrainBrotliHeightmapLoaderParams;
  readonly bytes: Uint8Array;
  restore(decoded: Uint8Array): Uint8Array;
}

interface BrotliManifestEntry {
  readonly virtualPath: string;
  readonly sourcePath: string;
  readonly encodedPath: string;
  readonly kind: TerrainCompressionResourceKind;
  readonly assetType: TerrainCompressionProfileAssetType;
  readonly params: TerrainBrotliLoaderParams | TerrainBrotliHeightmapLoaderParams;
  readonly rawBytes: number;
  readonly preparedBytes: number;
  readonly encodedBytes: number;
  readonly rawSha256: string;
  readonly decodedSha256: string;
  readonly encodedSha256: string;
  readonly verified: true;
}

/**
 * Parses and validates one JSON-compatible Terrain compression profile.
 * @param value Untrusted value read from a profile file or exporter configuration.
 * @returns Detached normalized profile.
 * @throws If the schema, Brotli settings, resource role, or AssetType combination is invalid.
 */
export function parseTerrainProjectCompressionProfile(value: unknown): TerrainProjectCompressionProfile {
  if (!isRecord(value)) throw new Error("Terrain compression profile must be an object");
  if (value.version !== PROFILE_VERSION) {
    throw new Error(`Terrain compression profile version must be ${PROFILE_VERSION}`);
  }
  if (!isRecord(value.brotli)) throw new Error("Terrain compression profile requires brotli settings");
  const quality = requireIntegerInRange(value.brotli.quality, 0, 11, "Brotli quality");
  const lgwin = requireIntegerInRange(value.brotli.lgwin, 10, 24, "Brotli lgwin");
  if (!isRecord(value.resources)) throw new Error("Terrain compression profile requires a resources object");

  const resources: TerrainProjectCompressionProfile["resources"] = {};
  for (const [kind, assetType] of Object.entries(value.resources)) {
    if (!isTerrainCompressionResourceKind(kind)) {
      throw new Error(`Unsupported Terrain compression resource kind "${kind}"`);
    }
    if (!isTerrainCompressionAssetType(assetType)) {
      throw new Error(`Unsupported Terrain compression AssetType "${String(assetType)}" for "${kind}"`);
    }
    if (
      assetType === TerrainCompressionAssetType.BrotliHeightmap &&
      kind !== TerrainCompressionResourceKind.HeightR16
    ) {
      throw new Error(`AssetType BrotliHeightmap is only valid for "${TerrainCompressionResourceKind.HeightR16}"`);
    }
    resources[kind] = assetType;
  }

  return { version: PROFILE_VERSION, brotli: { quality, lgwin }, resources };
}

/**
 * Encodes the resources selected by a Terrain profile and rewrites Project routing in place.
 * @param options Project path, validated profile, and optional report destination.
 * @returns Aggregate byte and verification measurements for the generated resources.
 * @throws If the Project graph is incomplete, a selected source is invalid, or a roundtrip differs.
 */
export async function packTerrainProjectCompression(
  options: PackTerrainProjectCompressionOptions
): Promise<TerrainProjectCompressionPackSummary> {
  const projectPath = resolve(options.projectPath);
  const projectRoot = dirname(projectPath);
  const manifestPath = resolve(options.manifestPath ?? resolve(projectRoot, "brotli-manifest.json"));
  const profile = parseTerrainProjectCompressionProfile(options.profile);
  const project = restoreTerrainCompressionSourceProject(parseJsonFile<TerrainProjectFile>(projectPath));
  const projectFiles = new Map(project.files.map((file) => [file.virtualPath, file]));
  if (projectFiles.size !== project.files.length) throw new Error("Terrain Project contains duplicate virtual paths");

  const resolveProjectPath = (virtualPath: string): string => {
    const file = projectFiles.get(virtualPath);
    if (!file) throw new Error(`Terrain Project is missing "${virtualPath}"`);
    return resolveInside(projectRoot, file.path);
  };
  const world = parseJsonFile<TerrainProjectWorldIndex>(resolveProjectPath(TERRAIN_WORLD_INDEX_PATH));
  const discovered = discoverTerrainResources(world, resolveProjectPath);
  const selected = discovered.filter((resource) => profile.resources[resource.kind] !== undefined);
  const decoderWasm = new Uint8Array(
    readFileSync(new URL("../../../../../packages/terrain/src/terrain/compression/generated/decoder-only.wasm", import.meta.url))
  );
  const encoderWasm = new Uint8Array(readFileSync(new URL("./generated/encoder-only.wasm", import.meta.url)));
  const [encoder, decoder] = await Promise.all([loadOfficialBrotliEncoder(), loadOfficialBrotliDecoder(decoderWasm)]);
  const entries: BrotliManifestEntry[] = [];
  const encodedPaths = new Set<string>();

  for (const resource of selected) {
    const file = projectFiles.get(resource.virtualPath)!;
    const assetType = profile.resources[resource.kind]!;
    const raw = new Uint8Array(readFileSync(resolveProjectPath(resource.virtualPath)));
    const prepared = prepareResource(resource, file.type, assetType, raw);
    const encodedPath = `${file.path}.br`;
    if (!encodedPaths.add(encodedPath)) throw new Error(`Compressed output path is not unique: "${encodedPath}"`);
    const encoded = encoder.compress(prepared.bytes, profile.brotli);
    const decoded = decoder.decompress(encoded, prepared.bytes.byteLength);
    const restored = prepared.restore(decoded);
    const rawSha256 = sha256(raw);
    const decodedSha256 = sha256(restored);
    if (rawSha256 !== decodedSha256 || !bytesEqual(raw, restored)) {
      throw new Error(`Terrain compression roundtrip failed for "${resource.virtualPath}"`);
    }
    const outputPath = resolveInside(projectRoot, encodedPath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, encoded);
    entries.push({
      virtualPath: resource.virtualPath,
      sourcePath: file.path,
      encodedPath,
      kind: resource.kind,
      assetType,
      params: prepared.params,
      rawBytes: raw.byteLength,
      preparedBytes: prepared.bytes.byteLength,
      encodedBytes: encoded.byteLength,
      rawSha256,
      decodedSha256,
      encodedSha256: sha256(encoded),
      verified: true
    });
  }

  const compressedEntries = new Map(entries.map((entry) => [entry.virtualPath, entry]));
  const runtimeProject: TerrainProjectFile = {
    ...project,
    files: project.files.map((file) => {
      const entry = compressedEntries.get(file.virtualPath);
      const runtimeFile = stripRedundantKtx2Params(file);
      return entry
        ? { ...runtimeFile, path: entry.encodedPath, type: entry.assetType, params: { ...entry.params } }
        : runtimeFile;
    })
  };
  const summary = summarize(entries);
  const manifest = {
    version: 4,
    codec: "official-brotli-v1.2.0",
    profile,
    source: {
      repository: "https://github.com/google/brotli",
      commit: BROTLI_SOURCE_COMMIT,
      emcc: EMCC_VERSION,
      decoder: {
        optimization: "-O3",
        wasmBytes: decoderWasm.byteLength,
        wasmSha256: sha256(decoderWasm)
      },
      encoder: {
        optimization: "-O3",
        wasmBytes: encoderWasm.byteLength,
        wasmSha256: sha256(encoderWasm)
      }
    },
    summary,
    entries
  };
  removeStaleGeneratedStreams(projectRoot, manifestPath, encodedPaths);
  writeFileSync(projectPath, `${JSON.stringify(runtimeProject)}\n`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return summary;
}

function stripRedundantKtx2Params(file: TerrainProjectFile["files"][number]): TerrainProjectFile["files"][number] {
  if (file.type !== "KTX2") return file;
  const { params: _params, ...runtimeFile } = file;
  return runtimeFile;
}

function discoverTerrainResources(
  world: TerrainProjectWorldIndex,
  resolveProjectPath: (virtualPath: string) => string
): DiscoveredResource[] {
  if (!Array.isArray(world.regions)) throw new Error("Terrain world index requires a regions array");
  const resources = new Map<string, DiscoveredResource>();
  for (const descriptor of world.regions) {
    addDiscoveredResource(resources, {
      kind: TerrainCompressionResourceKind.RegionJSON,
      virtualPath: descriptor.manifest.url
    });
    const region = parseJsonFile<TerrainProjectRegion>(resolveProjectPath(descriptor.manifest.url));
    addDiscoveredResource(resources, {
      kind: TerrainCompressionResourceKind.HeightR16,
      virtualPath: region.heightmap.data.url,
      width: region.heightmap.sampleSize[0],
      height: region.heightmap.sampleSize[1]
    });
    for (const alphamap of region.alphamaps) {
      addDiscoveredResource(resources, {
        kind: TerrainCompressionResourceKind.AlphamapRGBA8,
        virtualPath: alphamap.data.url
      });
    }
  }
  return [...resources.values()].sort((left, right) => left.virtualPath.localeCompare(right.virtualPath));
}

function addDiscoveredResource(resources: Map<string, DiscoveredResource>, resource: DiscoveredResource): void {
  const existing = resources.get(resource.virtualPath);
  if (!existing) {
    resources.set(resource.virtualPath, resource);
    return;
  }
  if (existing.kind !== resource.kind || existing.width !== resource.width || existing.height !== resource.height) {
    throw new Error(`Terrain resource "${resource.virtualPath}" has conflicting semantic declarations`);
  }
}

function prepareResource(
  resource: DiscoveredResource,
  sourceAssetType: string,
  assetType: TerrainCompressionProfileAssetType,
  raw: Uint8Array
): PreparedResource {
  if (assetType === TerrainCompressionAssetType.Brotli) {
    if (sourceAssetType !== TerrainBrotliResultType.Buffer && sourceAssetType !== TerrainBrotliResultType.JSON) {
      throw new Error(`Pure Brotli cannot restore Project AssetType "${sourceAssetType}"`);
    }
    return {
      assetType,
      params: { decodedBytes: raw.byteLength, resultType: sourceAssetType },
      bytes: raw,
      restore: (decoded) => decoded
    };
  }
  if (resource.kind !== TerrainCompressionResourceKind.HeightR16) {
    throw new Error(`AssetType BrotliHeightmap cannot encode "${resource.virtualPath}"`);
  }
  const width = requirePositiveInteger(resource.width, "Height R16 width");
  const height = requirePositiveInteger(resource.height, "Height R16 height");
  const bytes = prepareTerrainHeightForBrotli({ width, height, bytes: raw });
  return {
    assetType,
    params: { decodedBytes: bytes.byteLength, width, height },
    bytes,
    restore: (decoded) => restoreTerrainHeightFromBrotli(width, height, decoded)
  };
}

function summarize(entries: readonly BrotliManifestEntry[]): TerrainProjectCompressionPackSummary {
  const rawBytes = entries.reduce((sum, entry) => sum + entry.rawBytes, 0);
  const preparedBytes = entries.reduce((sum, entry) => sum + entry.preparedBytes, 0);
  const encodedBytes = entries.reduce((sum, entry) => sum + entry.encodedBytes, 0);
  return {
    replacementFiles: entries.length,
    rawBytes,
    preparedBytes,
    encodedBytes,
    savingsRatio: rawBytes === 0 ? 0 : 1 - encodedBytes / rawBytes,
    verifiedFiles: entries.filter((entry) => entry.verified).length
  };
}

function parseJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function removeStaleGeneratedStreams(
  projectRoot: string,
  manifestPath: string,
  encodedPaths: ReadonlySet<string>
): void {
  if (!existsSync(manifestPath)) return;
  const previous = parseJsonFile<unknown>(manifestPath);
  if (!isRecord(previous) || !Array.isArray(previous.entries)) return;
  for (const value of previous.entries) {
    if (!isRecord(value) || typeof value.encodedPath !== "string") continue;
    if (!value.encodedPath.endsWith(".br")) {
      throw new Error(`Previous Terrain compression output is not a .br stream: "${value.encodedPath}"`);
    }
    if (!encodedPaths.has(value.encodedPath)) rmSync(resolveInside(projectRoot, value.encodedPath), { force: true });
  }
}

function resolveInside(root: string, relativePath: string): string {
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Terrain Project path escapes its root: "${relativePath}"`);
  }
  return target;
}

function isTerrainCompressionResourceKind(value: string): value is TerrainCompressionResourceKind {
  return Object.values(TerrainCompressionResourceKind).includes(value as TerrainCompressionResourceKind);
}

function isTerrainCompressionAssetType(value: unknown): value is TerrainCompressionProfileAssetType {
  return value === TerrainCompressionAssetType.Brotli || value === TerrainCompressionAssetType.BrotliHeightmap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireIntegerInRange(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${label} must be an integer from ${min} through ${max}`);
  }
  return value as number;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive integer`);
  return value as number;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}
