import type { PhotoImage } from "./SeedWorldPhotoImage";
import {
  ImageResourceBudget,
  validateImage,
  type ConversationImageResources
} from "@galacean/engine-ai-chat/ai-chat/image-resources";
import { SEED_WORLD_PHOTO_CONFIG } from "./SeedWorldPhotoConfig";
import { DEFAULT_PHOTO_INK } from "./SeedWorldPhotoPalette";
import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import type { AgentViewImage, AgentViewObservation } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import type { RuntimePickIdentity } from "@galacean/engine-runtime-editor/runtime-inspection/runtime-scene-inspection";

/** Session-scoped Engine identities, never authoring or business IDs. */
export type ViewRef = RuntimePickIdentity;

export interface ViewPoint {
  x: number;
  y: number;
}
/** Coordinates are pixels of the returned image, top-left origin. */
export type ViewRegion =
  | { kind: "polygon"; points: ViewPoint[] }
  | { kind: "stroke"; points: ViewPoint[]; radius: number };
/** Freehand visual hints, never a geometric selection or an object list. */
export interface ViewAnnotation {
  points: ViewPoint[];
  width: number;
  /** Opaque sRGB hex; no alpha channel. */
  color: string;
}
export interface ViewHit {
  ref: ViewRef;
}
export interface ViewFrame {
  image: PhotoImage;
  width: number;
  height: number;
  /** Frozen GPU identity texture; no CPU full-image cache or historical scene graph. */
  identities: ViewIdentityBuffer;
}
export interface ViewIdentityBuffer {
  readonly byteLength: number;
  /** Engine RT pixels use the same top-left convention as the delivered photo. */
  read(x: number, y: number, width: number, height: number): Uint8Array;
  resolve(id: number): ViewRef | undefined;
  dispose(): void;
}
export function decodeViewIdentity(pixels: Uint8Array, offset: number): number {
  return pixels[offset]! | (pixels[offset + 1]! << 8) | (pixels[offset + 2]! << 16);
}

export interface ViewFilter {
  componentTypes?: string[];
}
export interface RegionItem extends ViewHit {
  visiblePixels: number;
}
export interface ViewAttachment {
  snapshotId: string;
  annotations: ViewAnnotation[];
}

export function createViewAnnotation(points: ViewPoint[], scale = 1, color = DEFAULT_PHOTO_INK): ViewAnnotation {
  if (!points.length) throw new Error("Empty annotation");
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Invalid annotation color");
  return { points: structuredClone(points), width: 3 * scale, color };
}

/** Rasterize the exact declared mask, including self-intersections (even/odd). */
export function rasterizeViewRegion(
  region: ViewRegion,
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number
): Uint8Array {
  if (
    !region.points.length ||
    region.points.some(
      (p) =>
        !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > imageWidth || p.y > imageHeight
    )
  )
    throw new Error("Invalid image coordinates");
  if (region.kind === "polygon" && region.points.length < 3) throw new Error("Polygon needs three points");
  if (region.kind === "stroke" && (!Number.isFinite(region.radius) || region.radius <= 0))
    throw new Error("Invalid brush radius");
  const mask = new Uint8Array(width * height),
    points = region.points;
  if (region.kind === "polygon") {
    const intersections: number[] = [];
    for (let y = 0; y < height; y++) {
      const py = ((y + 0.5) * imageHeight) / height;
      intersections.length = 0;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[j]!,
          b = points[i]!;
        if (a.y > py !== b.y > py) intersections.push(a.x + ((py - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const start = Math.max(0, Math.ceil((intersections[i]! * width) / imageWidth - 0.5));
        const end = Math.min(width, Math.ceil((intersections[i + 1]! * width) / imageWidth - 0.5));
        if (end > start) mask.fill(1, y * width + start, y * width + end);
      }
    }
  } else {
    const r = region.radius;
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)]!,
        b = points[i]!;
      const x0 = Math.max(0, Math.floor(((Math.min(a.x, b.x) - r) * width) / imageWidth));
      const x1 = Math.min(width, Math.ceil(((Math.max(a.x, b.x) + r) * width) / imageWidth));
      const y0 = Math.max(0, Math.floor(((Math.min(a.y, b.y) - r) * height) / imageHeight));
      const y1 = Math.min(height, Math.ceil(((Math.max(a.y, b.y) + r) * height) / imageHeight));
      const dx = b.x - a.x,
        dy = b.y - a.y,
        len2 = dx * dx + dy * dy;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const px = ((x + 0.5) * imageWidth) / width - a.x,
            py = ((y + 0.5) * imageHeight) / height - a.y;
          const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
          if ((px - t * dx) ** 2 + (py - t * dy) ** 2 <= r * r) mask[y * width + x] = 1;
        }
    }
  }
  return mask;
}

/** Owns frozen GPU observations; only requested pixels cross the GPU/CPU boundary. */
type ImageVersion = {
  key: string;
  annotations: ViewAnnotation[];
  image?: AgentViewImage;
  pending?: Promise<AgentViewImage>;
  used: boolean;
  leases: number;
  release?: () => void;
};
type SnapshotEntry = {
  frame: ViewFrame;
  state: string;
  pins: number;
  lastUsedTurn: number | null;
  versions: Map<string, ImageVersion>;
  release(): void;
};

export class SeedWorldViewSnapshots implements ConversationImageResources {
  private readonly frames = new Map<string, SnapshotEntry>();
  private serial = 0;
  private disposed = false;
  private readonly session = crypto.randomUUID();
  readonly budget: ImageResourceBudget;
  private turn = 0;
  readonly maxPhotos: number;
  private readonly attachments = new Map<string, { attachment: ViewAttachment; imageId: string }>();
  constructor(
    private readonly captureFrame: (
      signal?: AbortSignal,
      budget?: ImageResourceBudget
    ) => ViewFrame | Promise<ViewFrame>,
    private readonly currentState: () => string,
    private readonly options: {
      maxPhotos?: number;
      memoryLimit?: number;
      observe?: (signal: AbortSignal, budget: ImageResourceBudget) => Promise<AgentViewImage>;
    } = {}
  ) {
    this.maxPhotos = options.maxPhotos ?? SEED_WORLD_PHOTO_CONFIG.maxPhotos;
    if (!Number.isSafeInteger(this.maxPhotos) || this.maxPhotos < 1 || this.maxPhotos > 32)
      throw new Error("maxPhotos must be an integer from 1 to 32");
    this.budget = new ImageResourceBudget(options.memoryLimit);
  }

  async capture(signal?: AbortSignal): Promise<{ snapshotId: string; imageId: string; image: PhotoImage }> {
    signal?.throwIfAborted();
    if (this.disposed) throw new Error("Snapshot store is disposed");
    const frame = await this.captureFrame(signal, this.budget);
    if (this.disposed || signal?.aborted) {
      frame.identities.dispose();
      frame.image.dispose();
      signal?.throwIfAborted();
      throw new Error("Snapshot store is disposed");
    }
    const snapshotId = `view-${this.session}-${++this.serial}`;
    let release: () => void;
    try {
      release = this.budget.reserve("identity", frame.identities.byteLength);
    } catch (error) {
      frame.identities.dispose();
      frame.image.dispose();
      throw error;
    }
    const imageId = `${snapshotId}/original`;
    const entry: SnapshotEntry = {
      frame,
      state: this.currentState(),
      pins: 0,
      lastUsedTurn: null,
      versions: new Map([[imageId, { key: "[]", annotations: [], used: false, leases: 0 }]]),
      release
    };
    this.frames.set(snapshotId, entry);
    this.prune(snapshotId);
    return { snapshotId, imageId, image: frame.image };
  }
  async observe(signal: AbortSignal): Promise<AgentViewObservation> {
    if (!this.options.observe) throw new Error("Ordinary observation is unavailable");
    const image = await this.options.observe(signal, this.budget);
    signal.throwIfAborted();
    return {
      image,
      metadata: { capturedAt: new Date().toISOString(), scope: "visual-only; no retained identity texture" }
    };
  }
  beginTurn(turn: number): void {
    this.turn = turn;
    this.prune();
  }
  resetConversation(): void {
    for (const entry of this.frames.values()) entry.lastUsedTurn = null;
    this.prune();
  }
  hasImage(imageId: string): boolean {
    return [...this.frames.values()].some((entry) => !!entry.versions.get(imageId)?.image);
  }
  acquireImage(imageId: string): { observation: AgentViewObservation; release(): void } {
    for (const [id, entry] of this.frames) {
      const version = entry.versions.get(imageId);
      if (!version?.image) continue;
      entry.lastUsedTurn = this.turn;
      version.used = true;
      return {
        observation: {
          imageId,
          image: { ...version.image },
          metadata: this.attachmentMetadata(
            { snapshotId: id, annotations: version.annotations },
            version.annotations.length > 0
          )
        },
        release: this.pin(id)
      };
    }
    throw new Error(`IMAGE_EXPIRED: ${imageId}`);
  }
  get diagnostics() {
    return toAgentValue(this.resourceStats);
  }
  get resourceStats() {
    return {
      ...this.budget.stats,
      turn: this.turn,
      snapshots: [...this.frames].map(([snapshotId, entry]) => ({
        snapshotId,
        pinned: this.attachments.has(snapshotId),
        leases: entry.pins - (this.attachments.has(snapshotId) ? 1 : 0),
        lastUsedTurn: entry.lastUsedTurn,
        imageVersions: entry.versions.size
      }))
    };
  }
  private get(id: string) {
    const entry = this.frames.get(id);
    if (!entry) throw new Error("SNAPSHOT_EXPIRED: Capture a new view; never reuse coordinates on another snapshot");
    return entry;
  }
  pin(id: string): () => void {
    const entry = this.get(id);
    entry.pins++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        entry.pins--;
        this.prune();
      }
    };
  }
  private prune(except?: string): void {
    for (const [id, entry] of this.frames) {
      if (id !== except && entry.pins === 0 && (entry.lastUsedTurn === null || this.turn - entry.lastUsedTurn > 2))
        this.drop(id);
    }
  }
  private drop(id: string): void {
    const entry = this.frames.get(id);
    this.frames.delete(id);
    if (!entry) return;
    entry.frame.identities.dispose();
    entry.frame.image.dispose();
    // Identity destruction may be deferred until the current engine frame ends.
    queueMicrotask(entry.release);
    for (const version of entry.versions.values()) version.release?.();
    entry.versions.clear();
  }
  hitPoints(id: string, points: ViewPoint[]) {
    const entry = this.get(id);
    entry.lastUsedTurn = this.turn;
    const { frame, state } = entry;
    const releaseReadback = this.budget.reserve(
      "temporary",
      Math.min(points.length * 16 * 16 * 4, frame.width * frame.height * 4)
    );
    try {
      // Nearby pointers share one small readback. Dispersed points never force a full-frame read.
      const tiles = new Map<string, { pixels: Uint8Array; x: number; y: number; width: number }>();
      const hits = points.map((p) => {
        if (
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < 0 ||
          p.y < 0 ||
          p.x >= frame.image.width ||
          p.y >= frame.image.height
        )
          return { status: "outside-image" as const, hit: null };
        const x = Math.floor((p.x * frame.width) / frame.image.width),
          y = Math.floor((p.y * frame.height) / frame.image.height);
        const tx = Math.floor(x / 16) * 16,
          ty = Math.floor(y / 16) * 16,
          key = `${tx}:${ty}`;
        let tile = tiles.get(key);
        if (!tile) {
          const width = Math.min(16, frame.width - tx),
            height = Math.min(16, frame.height - ty);
          tile = { pixels: frame.identities.read(tx, ty, width, height), x: tx, y: ty, width };
          tiles.set(key, tile);
        }
        const identity = decodeViewIdentity(tile.pixels, ((y - tile.y) * tile.width + x - tile.x) * 4);
        const ref = frame.identities.resolve(identity);
        return {
          status: ref ? ("hit" as const) : ("no-registered-hit" as const),
          hit: ref ? { ref: { ...ref } } : null
        };
      });
      return { snapshotId: id, currentScene: state === this.currentState(), hits };
    } finally {
      releaseReadback();
    }
  }
  queryRegion(id: string, region: ViewRegion, filter?: ViewFilter, offset = 0, limit = 100) {
    const entry = this.get(id);
    entry.lastUsedTurn = this.turn;
    const { frame, state } = entry;
    const releaseReadback = this.budget.reserve("temporary", frame.width * frame.height * 5);
    try {
      const mask = rasterizeViewRegion(region, frame.width, frame.height, frame.image.width, frame.image.height);
      let x0 = frame.width,
        y0 = frame.height,
        x1 = 0,
        y1 = 0,
        selectedPixels = 0,
        unregisteredPixels = 0;
      for (let i = 0; i < mask.length; i++)
        if (mask[i]) {
          const x = i % frame.width,
            y = Math.floor(i / frame.width);
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x + 1);
          y1 = Math.max(y1, y + 1);
          selectedPixels++;
        }
      const found = new Map<string, RegionItem>();
      if (selectedPixels) {
        const width = x1 - x0,
          pixels = frame.identities.read(x0, y0, width, y1 - y0);
        const resolved = new Map<number, ViewRef | undefined>();
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            if (!mask[y * frame.width + x]) continue;
            const identity = decodeViewIdentity(pixels, ((y - y0) * width + x - x0) * 4);
            if (!resolved.has(identity)) resolved.set(identity, frame.identities.resolve(identity));
            const ref = resolved.get(identity);
            if (!ref) {
              unregisteredPixels++;
              continue;
            }
            if (filter?.componentTypes && !filter.componentTypes.includes(ref.componentType)) continue;
            const key = JSON.stringify(ref),
              item = found.get(key);
            if (item) item.visiblePixels++;
            else found.set(key, { ref: { ...ref }, visiblePixels: 1 });
          }
      }
      const all = [...found.values()].sort((a, b) => b.visiblePixels - a.visiblePixels);
      const items = all.slice(offset, offset + limit);
      return {
        snapshotId: id,
        currentScene: state === this.currentState(),
        items,
        matchedCount: all.length,
        selectedPixels,
        unregisteredPixels,
        complete: offset + items.length >= all.length,
        nextOffset: offset + items.length < all.length ? offset + items.length : undefined
      };
    } finally {
      releaseReadback();
    }
  }
  setAttachment(id: string, annotations: readonly ViewAnnotation[]): ViewAttachment {
    const original = this.get(id).frame.image;
    if (
      annotations.length > 64 ||
      annotations.some(
        (mark) =>
          !Number.isFinite(mark.width) ||
          mark.width <= 0 ||
          !/^#[0-9a-f]{6}$/i.test(mark.color) ||
          !mark.points.length ||
          mark.points.some(
            (p) =>
              !Number.isFinite(p.x) ||
              !Number.isFinite(p.y) ||
              p.x < 0 ||
              p.y < 0 ||
              p.x > original.width ||
              p.y > original.height
          )
      )
    )
      throw new Error("Invalid screenshot annotations");
    const attachment = structuredClone({ snapshotId: id, annotations: [...annotations] });
    // Bound local vector history independently of the model message budget.
    // Full points belong to immutable photo versions, never conversation references.
    toAgentValue(attachment);
    if (!this.attachments.has(id)) {
      if (this.attachments.size >= this.maxPhotos) throw new Error(`最多保留 ${this.maxPhotos} 张照片，请先扯掉一张。`);
    }
    const entry = this.get(id);
    const previous = this.attachments.get(id);
    const key = JSON.stringify(attachment.annotations);
    const same = [...entry.versions].find(([, version]) => version.key === key);
    const imageId = same?.[0] ?? `${id}/image-${crypto.randomUUID()}`;
    if (!same) entry.versions.set(imageId, { key, annotations: attachment.annotations, used: false, leases: 0 });
    if (!previous) entry.pins++;
    this.attachments.set(id, { attachment, imageId });
    this.pruneVersions(id, entry);
    return structuredClone(attachment);
  }
  removeAttachment(id: string): void {
    if (this.attachments.delete(id)) {
      const entry = this.get(id);
      entry.pins--;
      this.pruneVersions(id, entry);
      this.prune();
    }
  }
  clearAttachments(): void {
    for (const id of this.attachments.keys()) this.removeAttachment(id);
  }
  private attachmentMetadata(a: ViewAttachment, annotated: boolean) {
    const entry = this.get(a.snapshotId);
    return toAgentValue({
      snapshotId: a.snapshotId,
      imageWidth: entry.frame.image.width,
      imageHeight: entry.frame.image.height,
      queryApi: ["world.view.hitPoints"],
      queryDeclarations: [
        "editor/declare/world/tools/world.view.hitPoints.d.ts",
        "editor/declare/world/tools/runtime.entity.inspect.d.ts",
        "editor/declare/world/tools/runtime.component.query.d.ts",
        "editor/declare/world/tools/runtime.component.read.d.ts"
      ],
      pointerInput: "{ snapshotId, pointers: [{ x, y }, ...] }; x/y are pixels of this image, origin top-left",
      coverage: "registered-visible-surfaces",
      coordinateSpace: "image-pixels-top-left",
      currentScene: entry.state === this.currentState(),
      imageAnnotation: annotated ? "colored freehand marks; queries use original pixels, never the ink" : "none",
      scope:
        "Marks are visual hints, not closed regions or selected objects. Interpret the screenshot, freehand marks and user text together; query world.view.hitPoints with pointers on the intended objects to obtain their captured identities. Targets may have moved; resolve returned references in the current world before editing. Never infer targets by treating every mark as a filled region."
    });
  }
  private pruneVersions(id: string, entry: SnapshotEntry): void {
    const current = this.attachments.get(id)?.imageId;
    for (const [imageId, version] of entry.versions) {
      if (imageId !== current && !version.used && !version.leases && !version.pending) {
        version.release?.();
        entry.versions.delete(imageId);
      }
    }
  }
  private async exportVersion(entry: SnapshotEntry, version: ImageVersion): Promise<AgentViewImage> {
    if (version.image) return version.image;
    if (!version.pending) {
      version.pending = entry.frame.image
        .export(version.annotations)
        .then((image) => {
          if (this.disposed) throw new Error("Snapshot store is disposed");
          validateImage(image);
          version.release = this.budget.reserve("image", image.blob.size);
          version.image = image;
          return image;
        })
        .finally(() => {
          version.pending = undefined;
        });
    }
    return version.pending;
  }
  /** Freeze versions immediately; exporting is explicit and occurs only at the send boundary. */
  acquireAttachments():
    | {
        references: { imageId: string; metadata: AgentViewObservation["metadata"] }[];
        export(): Promise<AgentViewObservation[]>;
        release(): void;
      }
    | undefined {
    if (!this.attachments.size) return;
    const selected = [...this.attachments.values()]
      .map(({ attachment, imageId }) => {
        const entry = this.get(attachment.snapshotId),
          version = entry.versions.get(imageId)!;
        const metadata = this.attachmentMetadata(attachment, version.annotations.length > 0);
        return { entry, version, imageId, metadata, id: attachment.snapshotId };
      })
      .map((item) => {
        // Validate every image before acquiring any task ownership.
        item.version.leases++;
        return { ...item, unpin: this.pin(item.id) };
      });
    let released = false;
    return {
      references: selected.map(({ imageId, metadata }) => ({ imageId, metadata })),
      export: async () => {
        if (released || this.disposed) throw new Error("Screenshot submission was released");
        // Each in-flight export keeps its snapshot alive even if its submission is cancelled.
        const leases = selected.map(({ id }) => this.pin(id));
        try {
          const observations: AgentViewObservation[] = [];
          // Bound temporary GPU/CPU peak when several photos are attached.
          for (const item of selected) {
            const image = await this.exportVersion(item.entry, item.version);
            if (released || this.disposed) throw new Error("Screenshot submission was released");
            observations.push({ imageId: item.imageId, metadata: structuredClone(item.metadata), image: { ...image } });
          }
          return observations;
        } finally {
          for (const release of leases) release();
          for (const item of selected) this.pruneVersions(item.id, item.entry);
        }
      },
      release: () => {
        if (released) return;
        released = true;
        for (const item of selected) {
          item.version.leases--;
          item.unpin();
          this.pruneVersions(item.id, item.entry);
        }
      }
    };
  }

  dispose(): void {
    this.disposed = true;
    this.attachments.clear();
    for (const id of this.frames.keys()) this.drop(id);
  }
}
