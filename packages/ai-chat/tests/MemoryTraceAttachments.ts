import type { TraceAttachmentStorage, TraceImageMetadata } from "../src/ai-chat/trace-attachments";

/** Test double only; production never falls back to retaining image bytes in RAM. */
export class MemoryTraceAttachments implements TraceAttachmentStorage {
  readonly images = new Map<string, Blob>();
  async save(image: TraceImageMetadata, data: Blob): Promise<void> {
    if (!this.images.has(image.attachmentId)) this.images.set(image.attachmentId, data);
  }
  async read(id: string): Promise<Blob> {
    const image = this.images.get(id);
    if (!image) throw new Error("Attachment missing");
    return image;
  }
}
