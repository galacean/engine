import { compareTerrainStableValues } from "../TerrainStableOrder";
import { requireTerrainArtifactRelativePath } from "./TerrainArtifactPath";
import {
  assembleTerrainProjectArtifact,
  indexTerrainProjectArtifact,
  type TerrainProjectArtifactEntries
} from "./TerrainProjectArtifactAssembler";
import {
  encodeTerrainCanonicalJson,
  importTerrainProject,
  sha256TerrainBytes,
  type TerrainProjectEntries
} from "./TerrainProjectCodec";
import type { TerrainProjectFile } from "./TerrainProjectContract";
import type {
  TerrainProjectExportAsset,
  TerrainProjectExportCatalog,
  TerrainProjectExportDependency
} from "./TerrainProjectExportCatalog";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PROJECT_ROOT_PATH = "project.json";
const PUBLIC_ROOT_PREFIX = "public/";
const textDecoder = new TextDecoder();

type TerrainProjectOutputFile = TerrainProjectFile["files"][number];

/** Stable build-only identity for one independently emitted Project output role. */
export interface TerrainProjectBuildIdentity {
  /** Producer-neutral category of the source asset or generated input. */
  readonly sourceKind: string;
  /** Full lowercase SHA-256 of the stable source authoring identity. */
  readonly sourceIdentitySha256: string;
  /** Producer-neutral role of this output within the source asset. */
  readonly outputRole: string;
}

/** Request to reserve one standard Project output before compilation begins. */
export interface TerrainProjectBuildClaimInput extends TerrainProjectBuildIdentity {
  /** Complete standard Project file declaration reserved for this output. */
  readonly file: TerrainProjectOutputFile;
}

/** Immutable claimed Project output and its standard virtual resource reference. */
export interface TerrainProjectBuildClaim extends TerrainProjectBuildIdentity {
  /** Complete immutable standard Project file declaration. */
  readonly file: Readonly<TerrainProjectOutputFile>;
  /** Standard Project reference derived from the claimed virtual path. */
  readonly ref: Readonly<{ url: string }>;
}

/** Exact compiler result used to fulfill one prior Project output claim. */
export interface TerrainProjectBuildFulfillment extends TerrainProjectBuildIdentity {
  /** File declaration carried by the compiler result and matched against the claim. */
  readonly file: TerrainProjectOutputFile;
  /** Full lowercase SHA-256 of the exact emitted bytes. */
  readonly outputContentSha256: string;
  /** Complete direct typed dependency list of the emitted Project resource. */
  readonly dependencies: readonly TerrainProjectExportDependency[];
  /** Exact emitted resource bytes. */
  readonly bytes: Uint8Array;
  /** Full lowercase SHA-256 of the exact private source evidence bytes. */
  readonly sourceContentSha256: string;
  /** Exact private source evidence bytes keyed by the stable source identity. */
  readonly sourceBytes: Uint8Array;
}

/** Final settings that select the Project Scene root and standard Project metadata. */
export interface TerrainProjectBuildFinalizeOptions {
  /** Previously claimed and fulfilled standard Scene output used as the Project root. */
  readonly scene: TerrainProjectBuildClaim;
  /** Optional stock Project engine version metadata. */
  readonly engineVersion?: string;
}

/** Immutable verified build snapshot ready for atomic publication. */
export interface TerrainProjectBuildSnapshot {
  /** Build-only catalog that proves the Scene-rooted typed dependency closure. */
  readonly catalog: Readonly<TerrainProjectExportCatalog>;
  /** Exact compiled bytes keyed by standard Project virtual path. */
  readonly outputEntries: TerrainProjectEntries;
  /** Exact private evidence bytes keyed by source authoring identity SHA-256. */
  readonly sourceEntries: TerrainProjectEntries;
  /** Verified physical `project.json + public` artifact returned by the existing assembler. */
  readonly artifactEntries: TerrainProjectArtifactEntries;
}

interface ClaimRecord {
  claim: TerrainProjectBuildClaim;
  fulfillment?: FulfillmentSnapshot;
  fulfilling: boolean;
}

interface FulfillmentSnapshot {
  outputContentSha256: string;
  dependencies: TerrainProjectExportDependency[];
  bytes: Uint8Array;
  sourceContentSha256: string;
  sourceBytes: Uint8Array;
}

interface SourceSnapshot {
  contentSha256: string;
  bytes: Uint8Array;
}

/**
 * Coordinates exact source-to-Project output registration and publishes one verified in-memory artifact snapshot.
 * @remarks Claims and fulfillments remain build-only; only the assembled standard Project files enter the artifact.
 */
export class TerrainProjectBuildTransaction {
  private readonly _claims = new Map<string, ClaimRecord>();
  private readonly _fileIds = new Map<string, string>();
  private readonly _virtualPaths = new Map<string, string>();
  private readonly _physicalPaths = new Map<string, string>();
  private readonly _sources = new Map<string, SourceSnapshot>();
  private _phase: "open" | "finalizing" | "finalized" | "failed" = "open";

  /** Creates an empty build transaction with no reserved outputs. */
  constructor() {}

  /**
   * Reserves one unique standard Project output for an exact source identity and output role.
   * @param input Source identity, output role, and complete target Project file declaration.
   * @returns An immutable claim whose standard ref can be passed to upstream compilers.
   * @throws If the transaction is sealed, the identity was already claimed, or a target id or path aliases another claim.
   */
  claim(input: TerrainProjectBuildClaimInput): TerrainProjectBuildClaim {
    this._requireOpen("claim");
    const identity = validateIdentity(input, "Project build claim");
    const key = identityKey(identity);
    if (this._claims.has(key)) throw new Error("Project build output identity is already claimed");
    const file = cloneAndValidateFile(input.file, "Project build claim");
    const virtualPathKey = pathAliasKey(file.virtualPath);
    const physicalPathKey = pathAliasKey(file.path);
    this._requireUnclaimedTarget(this._fileIds, file.id, "file id");
    this._requireUnclaimedTarget(this._virtualPaths, virtualPathKey, "virtual path");
    this._requireUnclaimedTarget(this._physicalPaths, physicalPathKey, "physical path");

    const claim = deepFreeze({
      ...identity,
      file,
      ref: { url: file.virtualPath }
    }) as TerrainProjectBuildClaim;
    this._claims.set(key, { claim, fulfilling: false });
    this._fileIds.set(file.id, key);
    this._virtualPaths.set(virtualPathKey, key);
    this._physicalPaths.set(physicalPathKey, key);
    return claim;
  }

  /**
   * Atomically attaches one exact compiler result to its prior output claim.
   * @param fulfillment Source identity, claimed file, dependency closure, hashes, and detached output/source bytes.
   * @returns A promise that resolves after both supplied content hashes are verified and the claim is fulfilled exactly once.
   * @throws If the claim is absent, already fulfilled, inconsistent, aliased at the source ledger, or has invalid bytes or hashes.
   */
  async fulfill(fulfillment: TerrainProjectBuildFulfillment): Promise<void> {
    this._requireOpen("fulfill");
    const identity = validateIdentity(fulfillment, "Project build fulfillment");
    const record = this._claims.get(identityKey(identity));
    if (!record) throw new Error("Project build fulfillment has no matching claim");
    if (record.fulfillment || record.fulfilling) {
      throw new Error("Project build output claim is already fulfilled");
    }
    const file = cloneAndValidateFile(fulfillment.file, "Project build fulfillment");
    if (!canonicalJsonEquals(file, record.claim.file)) {
      throw new Error("Project build fulfillment file does not match its claim");
    }
    requireDigest(fulfillment.outputContentSha256, "Project build output content");
    requireDigest(fulfillment.sourceContentSha256, "Project build source content");
    if (!(fulfillment.bytes instanceof Uint8Array)) {
      throw new Error("Project build fulfillment requires exact Uint8Array output bytes");
    }
    if (!(fulfillment.sourceBytes instanceof Uint8Array)) {
      throw new Error("Project build fulfillment requires exact Uint8Array source bytes");
    }
    const snapshot: FulfillmentSnapshot = {
      outputContentSha256: fulfillment.outputContentSha256,
      dependencies: cloneAndValidateDependencies(fulfillment.dependencies),
      bytes: fulfillment.bytes.slice(),
      sourceContentSha256: fulfillment.sourceContentSha256,
      sourceBytes: fulfillment.sourceBytes.slice()
    };

    record.fulfilling = true;
    try {
      const [outputHash, sourceHash] = await Promise.all([
        sha256TerrainBytes(snapshot.bytes),
        sha256TerrainBytes(snapshot.sourceBytes)
      ]);
      if (outputHash !== snapshot.outputContentSha256) {
        throw new Error("Project build fulfillment output SHA-256 mismatch");
      }
      if (sourceHash !== snapshot.sourceContentSha256) {
        throw new Error("Project build fulfillment source SHA-256 mismatch");
      }
      const existingSource = this._sources.get(identity.sourceIdentitySha256);
      if (
        existingSource &&
        (existingSource.contentSha256 !== snapshot.sourceContentSha256 ||
          !bytesEqual(existingSource.bytes, snapshot.sourceBytes))
      ) {
        throw new Error("Project build source identity resolves to conflicting evidence bytes");
      }
      if (!existingSource) {
        this._sources.set(identity.sourceIdentitySha256, {
          contentSha256: snapshot.sourceContentSha256,
          bytes: snapshot.sourceBytes.slice()
        });
      }
      record.fulfillment = snapshot;
    } finally {
      record.fulfilling = false;
    }
  }

  /**
   * Seals the complete claim set and creates one verified immutable Project build snapshot.
   * @param options Fulfilled standard Scene root and optional stock Project metadata.
   * @returns A promise resolving to the deterministic catalog, detached entry maps, and assembled artifact.
   * @throws If any claim is pending, missing, not fulfilled exactly once, the Scene root is invalid, or assembler/import validation fails.
   */
  async finalize(options: TerrainProjectBuildFinalizeOptions): Promise<TerrainProjectBuildSnapshot> {
    this._requireOpen("finalize");
    const records = [...this._claims.values()];
    const incomplete = records.find((record) => record.fulfilling || !record.fulfillment);
    if (incomplete) throw new Error("Project build cannot finalize before every claim is fulfilled");
    const sceneRecord = this._resolveClaim(options?.scene, "Project build Scene root");
    if (!sceneRecord.fulfillment) throw new Error("Project build Scene root is not fulfilled");
    if (sceneRecord.claim.file.type !== "Scene") {
      throw new Error("Project build root must be a fulfilled standard Scene");
    }
    if (options.engineVersion !== undefined && (typeof options.engineVersion !== "string" || !options.engineVersion)) {
      throw new Error("Project build engine version must be a nonempty string");
    }
    this._phase = "finalizing";
    try {
      const ordered = records.sort((left, right) =>
        compareTerrainStableValues(left.claim.file.virtualPath, right.claim.file.virtualPath)
      );
      const assets: TerrainProjectExportAsset[] = ordered.map(({ claim, fulfillment }) => ({
        file: cloneJson(claim.file),
        authoringIdentitySha256: claim.sourceIdentitySha256,
        sourceContentSha256: fulfillment!.sourceContentSha256,
        outputContentSha256: fulfillment!.outputContentSha256,
        dependencies: cloneJson(fulfillment!.dependencies)
      }));
      const catalog = deepFreeze({
        version: "1" as const,
        ...(options.engineVersion === undefined ? {} : { engineVersion: options.engineVersion }),
        scene: sceneRecord.claim.file.virtualPath,
        assets
      }) as Readonly<TerrainProjectExportCatalog>;
      const outputEntries = new ImmutableBuildEntries(
        ordered.map(({ claim, fulfillment }) => [claim.file.virtualPath, fulfillment!.bytes] as const)
      );
      const sourceEntries = new ImmutableBuildEntries(
        [...this._sources]
          .sort(([left], [right]) => compareTerrainStableValues(left, right))
          .map(([identity, source]) => [identity, source.bytes] as const)
      );
      const artifactEntries = await assembleTerrainProjectArtifact(catalog, outputEntries, sourceEntries);
      await importTerrainProject(indexTerrainProjectArtifact(artifactEntries));
      const snapshot = Object.freeze({ catalog, outputEntries, sourceEntries, artifactEntries });
      this._phase = "finalized";
      return snapshot;
    } catch (error) {
      this._phase = "failed";
      throw error;
    }
  }

  private _resolveClaim(claim: TerrainProjectBuildClaim, label: string): ClaimRecord {
    const identity = validateIdentity(claim, label);
    const record = this._claims.get(identityKey(identity));
    if (!record || record.claim !== claim) {
      throw new Error(`${label} is not a claim from this transaction`);
    }
    return record;
  }

  private _requireUnclaimedTarget(owners: ReadonlyMap<string, string>, target: string, label: string): void {
    if (owners.has(target)) throw new Error(`Project build ${label} aliases another output claim`);
  }

  private _requireOpen(action: string): void {
    if (this._phase !== "open") throw new Error(`Project build transaction cannot ${action} after it is sealed`);
  }
}

function validateIdentity(identity: TerrainProjectBuildIdentity, label: string): TerrainProjectBuildIdentity {
  return {
    sourceKind: requireStableLabel(identity?.sourceKind, `${label} source kind`),
    sourceIdentitySha256: requireDigest(identity?.sourceIdentitySha256, `${label} source identity`),
    outputRole: requireStableLabel(identity?.outputRole, `${label} output role`)
  };
}

function identityKey(identity: TerrainProjectBuildIdentity): string {
  return JSON.stringify([identity.sourceKind, identity.sourceIdentitySha256, identity.outputRole]);
}

function pathAliasKey(path: string): string {
  // Case conversion can introduce combining sequences, so keep the folded key canonically composed.
  return path.normalize("NFC").toLowerCase().normalize("NFC");
}

function cloneAndValidateFile(file: TerrainProjectOutputFile, label: string): TerrainProjectOutputFile {
  if (!file || typeof file !== "object") throw new Error(`${label} requires a standard Project file`);
  requireStableLabel(file.id, `${label} file id`);
  requireStableLabel(file.type, `${label} file type`);
  const virtualPath = requireTerrainArtifactRelativePath(file.virtualPath, `${label} virtual path`);
  const physicalPath = requireTerrainArtifactRelativePath(file.path, `${label} physical path`);
  if (virtualPath === PROJECT_ROOT_PATH) throw new Error(`${label} must not claim project.json`);
  if (!physicalPath.startsWith(PUBLIC_ROOT_PREFIX)) throw new Error(`${label} physical path must stay inside public/`);
  return cloneJson(file);
}

function cloneAndValidateDependencies(
  dependencies: readonly TerrainProjectExportDependency[]
): TerrainProjectExportDependency[] {
  if (!Array.isArray(dependencies)) throw new Error("Project build fulfillment requires a dependency array");
  const cloned = dependencies.map((dependency) => {
    if (!dependency || typeof dependency !== "object") {
      throw new Error("Project build fulfillment contains an invalid dependency");
    }
    requireTerrainArtifactRelativePath(dependency.url, "Project build dependency");
    requireStableLabel(dependency.type, "Project build dependency type");
    if (dependency.key !== undefined && (typeof dependency.key !== "string" || !dependency.key)) {
      throw new Error("Project build dependency key must be a nonempty string");
    }
    return cloneJson(dependency);
  });
  return cloned.sort(
    (left, right) =>
      compareTerrainStableValues(left.url, right.url) ||
      compareTerrainStableValues(left.type, right.type) ||
      compareTerrainStableValues(left.key ?? "", right.key ?? "")
  );
}

function requireStableLabel(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${label} must be a nonempty trimmed string`);
  }
  return value;
}

function requireDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(textDecoder.decode(encodeTerrainCanonicalJson(value))) as T;
}

function canonicalJsonEquals(left: unknown, right: unknown): boolean {
  return bytesEqual(encodeTerrainCanonicalJson(left), encodeTerrainCanonicalJson(right));
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

class ImmutableBuildEntries implements TerrainProjectEntries {
  private readonly _entries: ReadonlyMap<string, Uint8Array>;

  constructor(entries: Iterable<readonly [string, Uint8Array]>) {
    this._entries = new Map(
      [...entries]
        .sort(([left], [right]) => compareTerrainStableValues(left, right))
        .map(([path, bytes]) => [path, bytes.slice()] as const)
    );
  }

  get size(): number {
    return this._entries.size;
  }

  get(path: string): Uint8Array | undefined {
    return this._entries.get(path)?.slice();
  }

  has(path: string): boolean {
    return this._entries.has(path);
  }

  entries(): MapIterator<[string, Uint8Array]> {
    return this._copyEntries().entries();
  }

  keys(): MapIterator<string> {
    return this._entries.keys();
  }

  values(): MapIterator<Uint8Array> {
    return this._copyEntries().values();
  }

  forEach(
    callback: (value: Uint8Array, key: string, map: ReadonlyMap<string, Uint8Array>) => void,
    thisArg?: unknown
  ): void {
    for (const [path, bytes] of this._entries) callback.call(thisArg, bytes.slice(), path, this);
  }

  [Symbol.iterator](): MapIterator<[string, Uint8Array]> {
    return this.entries();
  }

  private _copyEntries(): Map<string, Uint8Array> {
    return new Map([...this._entries].map(([path, bytes]) => [path, bytes.slice()] as const));
  }
}
