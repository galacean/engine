import type { AgentViewImage, AgentViewObservation } from "./agent-types";

export type ImageMemoryKind = "identity" | "display" | "image" | "temporary";
export class ImageMemoryLimitError extends Error {
  readonly code = "IMAGE_MEMORY_LIMIT";
  constructor(readonly releasePending = false) {
    super("IMAGE_MEMORY_LIMIT: Image resources in use exceed the available budget");
  }
}
/** Logical allocated bytes; GPU driver padding and model-provider storage are outside this ledger. */
export class ImageResourceBudget {
  private readonly used = { identity: 0, display: 0, image: 0, temporary: 0 };
  private peak = 0;
  constructor(
    readonly limit = 64 * 1024 * 1024,
    private readonly reclaim?: (bytes: number) => boolean
  ) {}
  get stats() {
    return {
      ...this.used,
      total: Object.values(this.used).reduce((a, b) => a + b, 0),
      peak: this.peak,
      limit: this.limit
    };
  }
  reserve(kind: ImageMemoryKind, bytes: number): () => void {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Invalid image memory reservation");
    const releasePending = this.stats.total + bytes > this.limit ? (this.reclaim?.(bytes) ?? false) : false;
    if (this.stats.total + bytes > this.limit) throw new ImageMemoryLimitError(releasePending);
    this.used[kind] += bytes;
    this.peak = Math.max(this.peak, this.stats.total);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.used[kind] -= bytes;
      }
    };
  }
}

/** One retry only when eviction has queued GPU-accounting release, never for pinned exhaustion. */
export async function afterImageReclamation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof ImageMemoryLimitError) || !error.releasePending) throw error;
    await Promise.resolve();
    return operation();
  }
}

/** Runtime resource ownership. Conversation order comes from ConversationHistory, not a second turn index. */
export interface ConversationImageResources {
  readonly budget: ImageResourceBudget;
  readonly diagnostics: import("./agent-types").AgentValue;
  beginTurn(turn: number): void;
  acquireImage(imagePath: string): { observation: AgentViewObservation; release(): void };
  hasImage(imagePath: string): boolean;
  paths?(): Iterable<string>;
  resetConversation(): void;
  /** Same immutable frames as capture/read; no second pick cache. */
  pick?(input: import("./agent-snapshots").SnapshotPickInput): import("./agent-types").AgentValue;
}

export function validateImage(image: AgentViewImage): void {
  if (
    !(image.blob instanceof Blob) ||
    !/^image\/(jpeg|png)$/.test(image.blob.type) ||
    image.blob.size <= 0 ||
    image.blob.size > 1536 * 1024 ||
    !Number.isSafeInteger(image.width) ||
    image.width <= 0 ||
    !Number.isSafeInteger(image.height) ||
    image.height <= 0
  )
    throw new Error("Image must be a JPEG/PNG Blob under 1.5 MiB with positive integer dimensions");
}

/** Only transport/export boundaries convert binary image storage to the provider wire representation. */
export async function imageDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/** Import boundary for existing portable trace archives. Runtime images never use this representation. */
export function imageFromDataUrl(dataUrl: string, width: number, height: number): AgentViewImage {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error("Invalid imported image");
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return { blob: new Blob([bytes], { type: match[1] }), width, height };
}

export async function encodeImage(canvas: HTMLCanvasElement): Promise<AgentViewImage> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("JPEG encoding failed"))), "image/jpeg", 0.8)
  );
  const image = { blob, width: canvas.width, height: canvas.height };
  validateImage(image);
  return image;
}

export async function loadImage(image: AgentViewImage): Promise<{ element: HTMLImageElement; release(): void }> {
  const url = URL.createObjectURL(image.blob),
    element = new Image();
  element.src = url;
  try {
    await element.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return {
    element,
    release: () => {
      element.src = "";
      URL.revokeObjectURL(url);
    }
  };
}
