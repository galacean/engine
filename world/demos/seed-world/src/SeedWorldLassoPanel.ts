import { SeedWorldPhotoWorkspace, type PhotoDocument } from "./SeedWorldPhotoWorkspace.ts";
import { SEED_WORLD_PHOTO_CONFIG } from "@galacean/engine-world-planning/world/SeedWorldPhotoConfig";
import type { SeedWorldViewSnapshots } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot";
import { SeedWorldAnnotationHistory } from "./SeedWorldAnnotationHistory.ts";
import type { SeedWorldInstantCamera } from "./SeedWorldInstantCamera.ts";

/** Owns snapshot transactions; the workspace owns all visible photo UI and Engine animation. */
export class SeedWorldLassoPanel {
  readonly button = document.createElement("button");
  private readonly workspace: SeedWorldPhotoWorkspace;
  private captureAbort?: AbortController;
  private releaseView?: () => void;
  private disposed = false;
  private confirming = false;
  private photoSerial = 0;
  private readonly onVoiceEngaged = () => {
    if (!this.disposed && !this.confirming && this.workspace.phase === "editing") {
      void this.confirm();
    }
  };
  get active(): boolean {
    return !!this.captureAbort || this.workspace.active;
  }
  constructor(
    private readonly views: SeedWorldViewSnapshots,
    setFrozen: (frozen: boolean) => void,
    private readonly instantCamera: SeedWorldInstantCamera
  ) {
    this.button.type = "button";
    this.button.id = "world-screenshot";
    this.button.title = "截屏并标记";
    this.button.setAttribute("aria-label", "截屏并标记");
    // Unmounted command handle; SeedWorldCameraButton renders and receives Engine input.
    this.workspace = new SeedWorldPhotoWorkspace(instantCamera, {
      edit: (photo) => {
        void this.open(photo);
      },
      remove: (id) => this.views.removeAttachment(id),
      updateAttachment: (id, annotations) => {
        const attachment = this.views.setAttachment(id, annotations);
        document.dispatchEvent(new CustomEvent("seed-world-screenshot-attached", { detail: attachment }));
      },
      apply: () => {
        void this.confirm();
      },
      cancel: () => this.close(),
      retain: id => views.pin(id),
      freeze: setFrozen
    }, views.budget);
    this.button.onclick = () => {
      if (!this.active) {
        instantCamera.unlockAudio();
        void this.open();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("seed-world-voice-engaged", this.onVoiceEngaged);
    }
  }
  /** Startup preparation finishes before the screenshot command becomes available. */
  async prepare(): Promise<void> {
    this.button.disabled = true;
    try {
      await this.workspace.graphics.prepare();
      if (this.disposed) throw new DOMException("Photo workspace disposed", "AbortError");
    } finally { if (!this.disposed) this.button.disabled = false; }
  }
  /** Silent background preload so the first camera click opens immediately without stalling. */
  prewarm(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.workspace.graphics.prepare().catch(() => undefined);
  }
  setAttachmentAnchor(x: number, top: number, visible: boolean): void {
    this.workspace.setAnchor(x, top, visible);
  }
  async open(existing?: PhotoDocument): Promise<void> {
    if (this.active || this.disposed) return;
    if (!existing && this.workspace.size >= this.views.maxPhotos) {
      this.workspace.notify(`最多钉 ${this.views.maxPhotos} 张照片，先扯掉一张再拍。`);
      return;
    }
    const controller = (this.captureAbort = new AbortController()),
      signal = controller.signal;
    this.workspace.beginCapture();
    this.button.hidden = true;
    try {
      if (existing) {
        this.releaseView = this.views.pin(existing.snapshotId);
        await this.workspace.open(existing, signal);
      } else {
        await this.workspace.graphics.prepare();
        signal.throwIfAborted();
        const observation = await this.views.capture(signal);
        signal.throwIfAborted();
        this.releaseView = this.views.pin(observation.snapshotId);
        const photo: PhotoDocument = {
          snapshotId: observation.snapshotId,
          image: observation.image,
          history: new SeedWorldAnnotationHistory(),
          capturedAt: new Date(),
          angle: SEED_WORLD_PHOTO_CONFIG.tiltDegrees[this.photoSerial++ % SEED_WORLD_PHOTO_CONFIG.tiltDegrees.length]
        };
        await this.workspace.open(photo, signal);
      }
    } catch (error) {
      if (!signal.aborted) {
        this.close();
        this.workspace.notify(`截屏失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  private async confirm(): Promise<void> {
    if (this.confirming || !this.captureAbort) return;
    this.confirming = true;
    const signal = this.captureAbort.signal;
    try {
      const photo = await this.workspace.confirm(signal);
      signal.throwIfAborted();
      this.workspace.commit(photo);
      this.close();
    } catch (error) {
      if (!signal.aborted)
        this.workspace.recover(`无法收起照片：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.confirming = false;
    }
  }
  close(): void {
    this.captureAbort?.abort();
    this.captureAbort = undefined;
    this.instantCamera.hide();
    this.workspace.cancel();
    this.releaseView?.();
    this.releaseView = undefined;
    this.button.hidden = false;
  }
  dispose(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("seed-world-voice-engaged", this.onVoiceEngaged);
    }
    this.close();
    this.disposed = true;
    this.workspace.dispose();
    this.views.clearAttachments();
    this.button.remove();
    this.instantCamera.dispose();
  }
}
