import { toAgentValue } from "./agent-values";
import type { AgentValue, AgentViewImage, AgentViewObservation } from "./agent-types";
import { ImageResourceBudget, validateImage, type ConversationImageResources } from "./image-resources";
import { SNAPSHOT_DIRECTORY, isSnapshotPath, snapshotError, type SnapshotPickInput } from "./agent-snapshots";
import type { ProjectFileProvider } from "@galacean/engine-project/project-files/virtual-project-files";

export type AgentImageReference = {
  imagePath: string;
  capturedAt?: string;
  width: number;
  height: number;
  available?: boolean;
};
export type SavedAgentImage = { reference: AgentImageReference; metadata: AgentValue; image: AgentViewImage };
function imageMetadata(reference: AgentImageReference, metadata: AgentValue): AgentValue {
  return (toAgentValue({ contextKind: "user_visual_reference", ...reference, metadata }) as { metadata: AgentValue })
    .metadata;
}
export class AgentImageStorageLimitError extends Error {
  readonly code = "IMAGE_STORAGE_LIMIT";
  constructor() {
    super("Snapshot storage is full; resources in use were retained");
  }
}

/** Task leases on the host snapshot service. Blobs and identity textures have one owner. */
export class AgentImageStore {
  readonly #images = new Map<
    string,
    { reference: AgentImageReference; metadata: AgentValue; image: AgentViewImage; release(): void }
  >();
  readonly #history = new Map<string, AgentImageReference>();
  #disposed = false;
  readonly budget: ImageResourceBudget;
  constructor(
    private readonly resources?: ConversationImageResources,
    references: readonly AgentImageReference[] = []
  ) {
    this.budget = resources?.budget ?? new ImageResourceBudget();
    for (const reference of references) this.#history.set(reference.imagePath, structuredClone(reference));
  }
  get size(): number {
    return this.references().filter((ref) => ref.available).length;
  }
  get bytes(): number {
    return [...this.#images.values()].reduce((n, v) => n + v.image.blob.size, 0);
  }
  references(): AgentImageReference[] {
    const refs = new Map(this.#history);
    for (const [id, saved] of this.#images) refs.set(id, saved.reference);
    return [...refs.values()].map((ref) => ({
      ...structuredClone(ref),
      available: this.#images.has(ref.imagePath) || !!this.resources?.hasImage(ref.imagePath)
    }));
  }
  readonly provider: ProjectFileProvider = {
    paths: () => new Set([...this.#images.keys(), ...(this.resources?.paths?.() ?? [])]),
    directories: () => [SNAPSHOT_DIRECTORY],
    read: () => undefined,
    open: async (path) => {
      if (!isSnapshotPath(path)) return undefined;
      const saved = this.#images.get(path);
      if (!saved && !this.resources?.hasImage(path)) this.read(path); // Preserve missing/expiry errors.
      // File searches need only a descriptor; they must not acquire a lease or renew image age.
      return { kind: "binary", ...(saved ? { byteLength: saved.image.blob.size } : {}) };
    },
    missing: (path) => {
      if (isSnapshotPath(path)) this.read(path);
    }
  };
  save(observation: AgentViewObservation): SavedAgentImage {
    if (this.#disposed) throw new Error("Task image store has been released");
    validateImage(observation.image);
    const imagePath =
      observation.imagePath ??
      `${SNAPSHOT_DIRECTORY}/${crypto.randomUUID()}.${observation.image.blob.type === "image/png" ? "png" : "jpg"}`;
    if (!isSnapshotPath(imagePath)) throw new Error("Snapshot images must use .ai/snapshots/ paths");
    if (this.#images.has(imagePath)) return this.read(imagePath);
    const capturedAt = (observation.metadata as { capturedAt?: unknown } | null)?.capturedAt;
    const reference: AgentImageReference = {
      imagePath,
      ...(typeof capturedAt === "string" ? { capturedAt } : {}),
      width: observation.image.width,
      height: observation.image.height
    };
    const metadata = imageMetadata(reference, observation.metadata);
    const borrowed = this.resources?.hasImage(imagePath) ? this.resources.acquireImage(imagePath) : undefined;
    let release: () => void;
    try {
      release = borrowed?.release ?? this.budget.reserve("image", observation.image.blob.size);
    } catch {
      borrowed?.release();
      throw new AgentImageStorageLimitError();
    }
    this.#images.set(imagePath, { reference, metadata, image: { ...observation.image }, release });
    return this.read(imagePath);
  }
  read(imagePath: string): SavedAgentImage {
    if (this.#disposed) throw new Error("Task image store has been released");
    let saved = this.#images.get(imagePath);
    if (!saved && this.resources) {
      const lease = this.resources.acquireImage(imagePath);
      try {
        this.save(lease.observation);
      } finally {
        lease.release();
      }
      saved = this.#images.get(imagePath);
    }
    if (!saved) throw snapshotError("SNAPSHOT_UNAVAILABLE", `Snapshot is unavailable: '${imagePath}'`);
    return {
      reference: structuredClone(saved.reference),
      metadata: structuredClone(saved.metadata),
      image: { ...saved.image }
    };
  }
  pick(input: SnapshotPickInput): AgentValue {
    this.read(input.file_path); // Pin the frame for this task before querying it.
    if (!this.resources?.pick)
      throw snapshotError("PICK_UNSUPPORTED", "This host does not support snapshot object queries");
    return this.resources.pick(input);
  }
  dispose(): void {
    if (this.#disposed) return;
    for (const image of this.#images.values()) image.release();
    this.#images.clear();
    this.#history.clear();
    this.#disposed = true;
  }
}
