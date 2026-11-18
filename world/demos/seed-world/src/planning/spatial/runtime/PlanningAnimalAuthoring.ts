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

/** Project-backed explicit additions, isolated by world seed. */
export interface PlanningAnimalAuthoring {
  read(seed: number): PlanningAnimalAddition[];
  save(seed: number, addition: PlanningAnimalAddition): Promise<void>;
  dispose(): void;
}

/** Persist animal identities through the project's existing database checkpoint. */
export class PlanningAnimalProjectAuthoring implements PlanningAnimalAuthoring {
  private readonly owners = new Map<string, ReturnType<RuntimeProjectSession["ownRuntimeAsset"]>>();
  private readonly pending = new Set<string>();

  constructor(private readonly project: Pick<RuntimeProjectSession, "projectPackage" | "ownRuntimeAsset" | "flush">) {
    for (const file of project.projectPackage.project.files)
      if (file.type === "JSON" && /^World\/Animals\/[^/]+\.json$/.test(file.virtualPath)) this.owner(file.virtualPath);
  }

  /** Read detached birth records without loading animal assets.
   * @param seed World identity.
   * @returns Explicit additions in authoring order.
   */
  read(seed: number): PlanningAnimalAddition[] {
    return this.decode(this.project.projectPackage.contents[this.path(seed)])
      .filter(record => !this.pending.has(record.instance.id));
  }

  /** Commit one idempotent addition and wait for durable storage.
   * @param seed World identity captured before placement.
   * @param addition Resolved stable identity and birth pose.
   * @throws When storage fails or the request identity conflicts.
   */
  async save(seed: number, addition: PlanningAnimalAddition): Promise<void> {
    const record = this.decode(JSON.stringify({ version: 1, additions: [addition] }))[0];
    const path = this.path(seed);
    const owner = this.owner(path);
    let inserted = false;
    this.pending.add(record.instance.id);
    try {
      await owner.update(content => {
        const additions = this.decode(content);
        const previous = additions.find(entry => entry.requestId === record.requestId);
        if (previous && previous.requestKey !== record.requestKey) throw new Error("Animal request identity conflict");
        inserted = !previous;
        return { content: JSON.stringify({ version: 1, additions: previous ? additions : [...additions, record] }), value: undefined };
      });
      await this.project.flush();
      this.pending.delete(record.instance.id);
    } catch (error) {
      if (inserted) {
        await owner.update(content => {
          const additions = this.decode(content).filter(entry => entry.instance.id !== record.instance.id);
          return { content: JSON.stringify({ version: 1, additions }), value: undefined };
        });
        await this.project.flush().catch(() => undefined);
      }
      this.pending.delete(record.instance.id);
      throw error;
    }
  }

  /** Release ownership while retaining saved additions in the project. */
  dispose(): void {
    for (const owner of this.owners.values()) owner.dispose();
    this.owners.clear();
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

  private decode(source: string | Uint8Array | undefined): PlanningAnimalAddition[] {
    if (source === undefined) return [];
    const document = JSON.parse(typeof source === "string" ? source : new TextDecoder("utf-8", { fatal: true }).decode(source));
    if (document.version !== 1 || !Array.isArray(document.additions)) throw new Error("Invalid animal authoring document");
    const requests = new Set<string>(), ids = new Set<string>();
    return document.additions.map((record: PlanningAnimalAddition) => {
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
  }
}
