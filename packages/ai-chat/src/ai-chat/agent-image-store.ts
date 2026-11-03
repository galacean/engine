import { toAgentValue } from "./agent-values";
import type { AgentValue, AgentViewImage, AgentViewObservation, AgentViewPointer } from "./agent-types";
import { ImageResourceBudget, validateImage, type ConversationImageResources } from "./image-resources";

export type AgentImageReference = {
  imageId: string;
  capturedAt: string;
  width: number;
  height: number;
  available?: boolean;
  pointerState?: "available" | "released" | "over_budget";
};
export type SavedAgentImage = { reference: AgentImageReference; metadata: AgentValue; image: AgentViewImage };

/** Validate the actual largest image-message envelope at the common admission boundary. */
function imageMetadata(reference: AgentImageReference, metadata: AgentValue): AgentValue {
  const envelope = toAgentValue({ contextKind: "user_visual_reference", ...reference, metadata }) as {
    metadata: AgentValue;
  };
  return envelope.metadata;
}
export class AgentImageStorageLimitError extends Error {
  constructor() {
    super("Image storage budget exhausted; retained screenshots have not been deleted");
  }
}

/** Task-local observations and borrowed conversation images. Only resources actually read are leased. */
export class AgentImageStore {
  readonly #images = new Map<
    string,
    { reference: AgentImageReference; metadata: AgentValue; image: AgentViewImage; release(): void }
  >();
  readonly #history = new Map<string, AgentImageReference>();
  #disposed = false;
  readonly #pointers = new Map<string, { pointer: AgentViewPointer; release(): void }>();
  readonly budget: ImageResourceBudget;
  constructor(
    private readonly resources?: ConversationImageResources,
    references: readonly AgentImageReference[] = [],
    private readonly pointerOptions = { maxBytes: 32 * 1024 * 1024, maxCount: 3 }
  ) {
    this.budget = resources?.budget ?? new ImageResourceBudget();
    for (const reference of references) this.#history.set(reference.imageId, structuredClone(reference));
  }
  get size(): number {
    return new Set(
      [...this.#images.keys(), ...this.#history.keys()].filter(
        (id) => this.#images.has(id) || this.resources?.hasImage(id)
      )
    ).size;
  }
  get pointerBytes(): number {
    return [...this.#pointers.values()].reduce((n, v) => n + v.pointer.byteLength, 0);
  }
  get pointerCount(): number {
    return this.#pointers.size;
  }
  get bytes(): number {
    return this.pointerBytes + [...this.#images.values()].reduce((n, v) => n + v.image.blob.size, 0);
  }
  references(): AgentImageReference[] {
    const refs = new Map(this.#history);
    for (const [id, saved] of this.#images) refs.set(id, saved.reference);
    return [...refs.values()].map((ref) => ({
      ...structuredClone(ref),
      available: this.#images.has(ref.imageId) || !!this.resources?.hasImage(ref.imageId)
    }));
  }
  save(observation: AgentViewObservation): SavedAgentImage {
    let admitted = false;
    try {
      if (this.#disposed) throw new Error("Task image store has been released");
      if (
        observation.pointer &&
        (!Number.isSafeInteger(observation.pointer.byteLength) || observation.pointer.byteLength < 0)
      )
        throw new Error("Invalid pointer storage size");
      validateImage(observation.image);
      const imageId = observation.imageId ?? crypto.randomUUID();
      if (this.#images.has(imageId)) {
        observation.pointer?.dispose();
        admitted = true;
        return this.read(imageId);
      }
      const reference: AgentImageReference = {
        imageId,
        capturedAt: new Date().toISOString(),
        width: observation.image.width,
        height: observation.image.height
      };
      const metadata = imageMetadata(reference, observation.metadata);
      const borrowed =
        observation.imageId && this.resources?.hasImage(imageId) ? this.resources.acquireImage(imageId) : undefined;
      if (!borrowed) this.evictPointersFor(observation.image.blob.size);
      let release: () => void;
      try {
        release = borrowed?.release ?? this.budget.reserve("image", observation.image.blob.size);
      } catch {
        borrowed?.release();
        throw new AgentImageStorageLimitError();
      }
      // Blob is immutable. Preserve the shared binary allocation; copy only its small descriptor.
      this.#images.set(imageId, { reference, metadata, image: { ...observation.image }, release });
      admitted = true;
      if (observation.pointer) this.savePointer(imageId, observation.pointer);
      return this.read(imageId);
    } catch (error) {
      if (!admitted) observation.pointer?.dispose();
      throw error;
    }
  }
  read(imageId: string): SavedAgentImage {
    if (this.#disposed) throw new Error("Task image store has been released");
    let saved = this.#images.get(imageId);
    if (!saved && this.#history.has(imageId) && this.resources) {
      const lease = this.resources.acquireImage(imageId);
      const reference = this.#history.get(imageId)!;
      try {
        saved = {
          reference,
          metadata: imageMetadata(reference, lease.observation.metadata),
          image: lease.observation.image,
          release: lease.release
        };
        this.#images.set(imageId, saved);
      } catch (error) {
        lease.release();
        throw error;
      }
    }
    if (!saved) throw new Error(`IMAGE_EXPIRED: Image '${imageId}' is no longer available`);
    return {
      reference: structuredClone(saved.reference),
      metadata: structuredClone(saved.metadata),
      image: { ...saved.image }
    };
  }
  private releasePointer(imageId: string): void {
    const saved = this.#pointers.get(imageId);
    if (!saved) return;
    this.#pointers.delete(imageId);
    const reference = this.#images.get(imageId)?.reference;
    if (reference) reference.pointerState = "released";
    try {
      saved.pointer.dispose();
    } finally {
      saved.release();
    }
  }
  private evictPointersFor(bytes: number): void {
    while (this.#pointers.size && this.budget.stats.total + bytes > this.budget.limit)
      this.releasePointer(this.#pointers.keys().next().value!);
  }
  private savePointer(imageId: string, pointer: AgentViewPointer): void {
    const reference = this.#images.get(imageId)!.reference;
    if (pointer.byteLength <= this.pointerOptions.maxBytes) {
      while (
        this.#pointers.size &&
        (this.pointerBytes + pointer.byteLength > this.pointerOptions.maxBytes ||
          this.pointerCount >= this.pointerOptions.maxCount)
      )
        this.releasePointer(this.#pointers.keys().next().value!);
      this.evictPointersFor(pointer.byteLength);
      if (this.budget.stats.total + pointer.byteLength <= this.budget.limit) {
        const release = this.budget.reserve("identity", pointer.byteLength);
        this.#pointers.set(imageId, { pointer, release });
        reference.pointerState = "available";
        return;
      }
    }
    reference.pointerState = "over_budget";
    pointer.dispose();
  }
  point(imageId: string, x: number, y: number): AgentValue {
    const saved = this.#images.get(imageId);
    if (!saved)
      throw Object.assign(new Error("Image is not available in this task; observe_view again"), {
        code: "IMAGE_NOT_AVAILABLE"
      });
    if (
      !Number.isSafeInteger(x) ||
      !Number.isSafeInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= saved.image.width ||
      y >= saved.image.height
    )
      throw Object.assign(new Error("Pointer coordinates are outside the saved image"), {
        code: "POINTER_OUT_OF_BOUNDS"
      });
    if (saved.reference.pointerState === "over_budget")
      throw Object.assign(
        new Error(
          "Pointer snapshot exceeds the available image storage budget; release retained photos before recapturing"
        ),
        { code: "POINTER_STORAGE_LIMIT" }
      );
    const pointer = this.#pointers.get(imageId)?.pointer;
    if (!pointer)
      throw Object.assign(new Error("Pointer snapshot is unavailable or released; observe_view again"), {
        code: "POINTER_SNAPSHOT_UNAVAILABLE"
      });
    return pointer.point(x, y);
  }
  dispose(): void {
    if (this.#disposed) return;
    for (const id of this.#pointers.keys()) this.releasePointer(id);
    for (const image of this.#images.values()) image.release();
    this.#images.clear();
    this.#history.clear();
    this.#disposed = true;
  }
}
