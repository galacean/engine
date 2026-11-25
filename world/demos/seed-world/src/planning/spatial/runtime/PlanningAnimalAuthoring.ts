import { readAnimalInstanceDocument, type AnimalInstanceDocument } from "@galacean/engine-animals/gameplay/animal/AnimalInstanceDocument";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";

/** One explicit animal addition; autonomous movement is not an authoring edit. */
export interface PlanningAnimalAddition {
  requestId: string;
  requestKey: string;
  instance: AnimalInstanceDocument;
  behaviorSeed: number;
  medium?: "ground" | "air" | "water";
}

/** Persistent per-animal property overrides (scale, appearance, placement). */
export interface PlanningAnimalOverride {
  requestId?: string;
  requestKey?: string;
  scale?: number;
  appearanceId?: string;
  position?: readonly [number, number, number];
  heading?: number;
  medium?: "ground" | "air" | "water";
}

export interface PlanningAnimalRemoval {
  id: string;
  requestId: string;
}

/** Project-backed explicit additions, deletions and overrides, isolated by world seed. */
export interface PlanningAnimalAuthoring {
  read(seed: number): PlanningAnimalAddition[];
  save(seed: number, addition: PlanningAnimalAddition): Promise<void>;
  readRemovals?(seed: number): PlanningAnimalRemoval[];
  remove?(seed: number, id: string, requestId: string): Promise<void>;
  readOverrides?(seed: number): ReadonlyMap<string, PlanningAnimalOverride>;
  update?(seed: number, id: string, override: PlanningAnimalOverride): Promise<void>;
  dispose(): void;
}

interface AuthoringDoc {
  additions: PlanningAnimalAddition[];
  removals: PlanningAnimalRemoval[];
  overrides: Record<string, PlanningAnimalOverride>;
}

/** Persist animal identities through the project's existing database checkpoint. */
export class PlanningAnimalProjectAuthoring implements PlanningAnimalAuthoring {
  private readonly owners = new Map<string, ReturnType<RuntimeProjectSession["ownRuntimeAsset"]>>();
  private readonly inFlight = new Map<number, string | Uint8Array | undefined>();

  constructor(private readonly project: Pick<RuntimeProjectSession, "projectPackage" | "ownRuntimeAsset" | "flush">) {
    for (const file of project.projectPackage.project.files)
      if (file.type === "JSON" && /^World\/Animals\/[^/]+\.json$/.test(file.virtualPath)) this.owner(file.virtualPath);
  }

  /** Read detached birth records without loading animal assets. */
  read(seed: number): PlanningAnimalAddition[] {
    return this.decode(this.snapshot(seed)).additions;
  }

  readRemovals(seed: number): PlanningAnimalRemoval[] {
    return this.decode(this.snapshot(seed)).removals;
  }

  readOverrides(seed: number): ReadonlyMap<string, PlanningAnimalOverride> {
    return new Map(Object.entries(this.decode(this.snapshot(seed)).overrides));
  }

  /** Commit one idempotent addition and wait for durable storage. */
  async save(seed: number, addition: PlanningAnimalAddition): Promise<void> {
    const record = this.decode(JSON.stringify({ version: 1, additions: [addition] })).additions[0];
    await this.commit(seed, (doc) => {
      const previous = doc.additions.find((entry) => entry.requestId === record.requestId);
      if (previous && previous.requestKey !== record.requestKey) throw new Error("Animal request identity conflict");
      if (!previous) doc.additions.push(record);
    });
  }

  /** Commit one idempotent deletion (removing any authored addition and recording a tombstone). */
  async remove(seed: number, id: string, requestId: string): Promise<void> {
    await this.commit(seed, (doc) => {
      const previous = doc.removals.find((entry) => entry.requestId === requestId);
      if (previous) {
        if (previous.id !== id) throw new Error("Animal request identity conflict");
        return;
      }
      doc.additions = doc.additions.filter((entry) => entry.instance.id !== id);
      delete doc.overrides[id];
      doc.removals.push({ id, requestId });
    });
  }

  /** Commit one idempotent property override for an existing animal identity. */
  async update(seed: number, id: string, override: PlanningAnimalOverride): Promise<void> {
    await this.commit(seed, (doc) => {
      const previous = doc.overrides[id];
      if (override.requestId && previous?.requestId === override.requestId) {
        if (previous.requestKey !== override.requestKey) throw new Error("Animal request identity conflict");
        return;
      }
      doc.overrides[id] = { ...(previous ?? {}), ...override };
    });
  }

  /** Release ownership while retaining saved additions in the project. */
  dispose(): void {
    for (const owner of this.owners.values()) owner.dispose();
    this.owners.clear();
  }

  private async commit(seed: number, mutate: (doc: AuthoringDoc) => void): Promise<void> {
    const path = this.path(seed);
    const owner = this.owner(path);
    const previousRaw = this.project.projectPackage.contents[path];
    let mutated = false;
    this.inFlight.set(seed, previousRaw);
    try {
      await owner.update((content) => {
        const doc = this.decode(content);
        const before = this.encode(doc);
        mutate(doc);
        const next = this.encode(doc);
        mutated = next !== before;
        return { content: next, value: undefined };
      });
      await this.project.flush();
    } catch (error) {
      if (mutated) {
        const fallback = this.encode(this.decode(previousRaw));
        await owner.update(() => ({ content: fallback, value: undefined }));
        await this.project.flush().catch(() => undefined);
      }
      throw error;
    } finally {
      this.inFlight.delete(seed);
    }
  }

  private snapshot(seed: number): string | Uint8Array | undefined {
    return this.inFlight.has(seed) ? this.inFlight.get(seed) : this.project.projectPackage.contents[this.path(seed)];
  }

  private owner(path: string): ReturnType<RuntimeProjectSession["ownRuntimeAsset"]> {
    let owner = this.owners.get(path);
    if (!owner) {
      owner = this.project.ownRuntimeAsset({ virtualPath: path, path: `runtime-world:animals:${path}`, type: "JSON" }, "project");
      this.owners.set(path, owner);
    }
    return owner;
  }

  private path(seed: number): string {
    return `World/Animals/${seed}.json`;
  }

  private encode(doc: AuthoringDoc): string {
    return JSON.stringify({
      version: 1,
      additions: doc.additions,
      ...(doc.removals.length ? { removals: doc.removals } : {}),
      ...(Object.keys(doc.overrides).length ? { overrides: doc.overrides } : {})
    });
  }

  private decode(source: string | Uint8Array | undefined): AuthoringDoc {
    if (source === undefined) return { additions: [], removals: [], overrides: {} };
    const document = JSON.parse(typeof source === "string" ? source : new TextDecoder("utf-8", { fatal: true }).decode(source));
    if (document.version !== 1 || !Array.isArray(document.additions)) throw new Error("Invalid animal authoring document");
    const requests = new Set<string>(), ids = new Set<string>();
    const additions: PlanningAnimalAddition[] = document.additions.map((record: PlanningAnimalAddition) => {
      if (typeof record.requestId !== "string" || !record.requestId || typeof record.requestKey !== "string" ||
        !Number.isSafeInteger(record.behaviorSeed) ||
        record.medium !== undefined && !["ground", "air", "water"].includes(record.medium))
        throw new Error("Invalid animal addition");
      const instance = readAnimalInstanceDocument(record.instance);
      if (requests.has(record.requestId) || ids.has(instance.id)) throw new Error("Duplicate animal authoring identity");
      requests.add(record.requestId);
      ids.add(instance.id);
      return { requestId: record.requestId, requestKey: record.requestKey, instance, behaviorSeed: record.behaviorSeed,
        ...(record.medium ? { medium: record.medium } : {}) };
    });
    const removals: PlanningAnimalRemoval[] = Array.isArray(document.removals)
      ? document.removals.map((r: PlanningAnimalRemoval) => ({ id: r.id, requestId: r.requestId }))
      : [];
    const overrides: Record<string, PlanningAnimalOverride> =
      document.overrides && typeof document.overrides === "object" ? { ...document.overrides } : {};
    return { additions, removals, overrides };
  }
}
