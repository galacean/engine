import { SeedWorldPhotoWorkspace, type PhotoDocument } from "./SeedWorldPhotoWorkspace.ts";
import { SEED_WORLD_PHOTO_CONFIG } from "@galacean/engine-world-planning/world/SeedWorldPhotoConfig";
import type { SeedWorldViewSnapshots } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot";
import { SeedWorldAnnotationHistory } from "./SeedWorldAnnotationHistory.ts";
import type { SeedWorldInstantCamera } from "./SeedWorldInstantCamera.ts";

function raceWithAbort(task: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Photo dismissal cancelled", "AbortError"));
  }
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason ?? new DOMException("Photo dismissal cancelled", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    task.then(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

/** Owns snapshot transactions; the workspace owns all visible photo UI and Engine animation. */
export class SeedWorldLassoPanel {
  readonly button = document.createElement("button");
  private readonly workspace: SeedWorldPhotoWorkspace;
  private captureAbort?: AbortController;
  private releaseView?: () => void;
  private activeSnapshotId?: string;
  private disposed = false;
  private confirming = false;
  private photoSerial = 0;
  private readonly onVoiceSubmitted = (event: Event) => {
    if (this.disposed) return;
    const detail = (event as CustomEvent<{ submittedToAgent?: boolean }>).detail;
    if (detail?.submittedToAgent) {
      this.workspace.markCurrentPhotosSubmitted();
    }
    if (!this.confirming && this.workspace.active) {
      void this.dismissSubmitted();
    }
  };
  private readonly onVoiceTurnEnded = () => {
    if (!this.disposed) {
      this.workspace.clearSubmittedCards(false);
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
        this.close();
      },
      minimize: () => {
        void this.dismissSubmitted();
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
      document.addEventListener("seed-world-voice-submitted", this.onVoiceSubmitted);
      document.addEventListener("seed-world-voice-turn-ended", this.onVoiceTurnEnded);
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
    if (!existing) {
      this.workspace.flushClearingCards();
      if (this.workspace.size >= this.views.maxPhotos) {
        this.workspace.notify(`最多保留 ${this.views.maxPhotos} 张照片，拖走或点开左上角 × 删除后再拍。`);
        return;
      }
    }
    const controller = (this.captureAbort = new AbortController()),
      signal = controller.signal;
    this.workspace.beginCapture();
    this.button.hidden = true;
    try {
      if (existing) {
        this.activeSnapshotId = existing.snapshotId;
        this.releaseView = this.views.pin(existing.snapshotId);
        await this.workspace.open(existing, signal);
      } else {
        await this.workspace.graphics.prepare();
        signal.throwIfAborted();
        const observation = await this.views.capture(signal);
        signal.throwIfAborted();
        this.activeSnapshotId = observation.snapshotId;
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
  private async dismissSubmitted(): Promise<void> {
    if (this.confirming || !this.captureAbort) return;
    this.confirming = true;
    const signal = this.captureAbort.signal;
    const snapshotId = this.activeSnapshotId;
    try {
      // Kick off deferred identity capture immediately so it runs in parallel with the 380ms shrink animation.
      // Only if it is still pending when shrink completes do we keep the world frozen until it settles,
      // guaranteeing 100% pixel alignment with dynamic view-culled batches while keeping normal paths 0ms-delayed.
      const identitiesTask = snapshotId ? this.views.ensureIdentities(snapshotId).catch(() => undefined) : undefined;
      const waitBeforeUnfreeze =
        snapshotId && identitiesTask
          ? {
              isPending: () => !this.views.hasIdentities(snapshotId),
              wait: (waitSignal: AbortSignal) => raceWithAbort(identitiesTask, waitSignal)
            }
          : undefined;
      await this.workspace.dismissSubmitted(signal, waitBeforeUnfreeze);
      if (!signal.aborted) {
        // dismissSubmitted already shrank the screenshot into a docked mini card and unfroze the world.
        this.captureAbort = undefined;
        this.activeSnapshotId = undefined;
        this.releaseView?.();
        this.releaseView = undefined;
        this.button.hidden = false;
      }
    } catch {
      if (!signal.aborted) this.close();
    } finally {
      this.confirming = false;
    }
  }
  close(): void {
    this.captureAbort?.abort();
    this.captureAbort = undefined;
    this.activeSnapshotId = undefined;
    this.instantCamera.hide();
    this.workspace.cancel();
    this.releaseView?.();
    this.releaseView = undefined;
    this.button.hidden = false;
  }
  dispose(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("seed-world-voice-submitted", this.onVoiceSubmitted);
      document.removeEventListener("seed-world-voice-turn-ended", this.onVoiceTurnEnded);
    }
    this.close();
    this.disposed = true;
    this.workspace.dispose();
    this.views.clearAttachments();
    this.button.remove();
    this.instantCamera.dispose();
  }
}
