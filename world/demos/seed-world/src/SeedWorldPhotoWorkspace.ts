import { AgentValueSizeError } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import type { ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import { SeedWorldPhotoInput, type PhotoPointerPhase } from "./SeedWorldPhotoInput.ts";
import { resolveSeedWorldVoiceOrbLayout } from "./SeedWorldHudLayout.ts";
import { DEFAULT_MARKUP_INK, photoDetailLayout } from "@galacean/engine-world-planning/world/SeedWorldPhotoPalette";
import { SeedWorldPhotoInputTrace } from "./SeedWorldPhotoInputTrace.ts";
import {
  Keys,
  PointerButton,
  PointerPhase,
  UnlitMaterial,
  type Camera,
  type Engine,
  type Pointer,
  type PointerEventData
} from "@galacean/engine";
import type { PhotoImage } from "@galacean/engine-world-planning/world/SeedWorldPhotoImage";
import { SeedWorldAnnotationHistory } from "./SeedWorldAnnotationHistory.ts";
import { SEED_WORLD_PHOTO_CONFIG as config } from "@galacean/engine-world-planning/world/SeedWorldPhotoConfig";
import { createViewAnnotation, type ViewAnnotation, type ViewPoint } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot";
import { PhotoGraphics, PhotoSurface } from "@galacean/engine-world-planning/world/SeedWorldPhotoGraphics";

export interface PhotoWorkspaceHost {
  readonly engine: Engine;
  readonly canvas: HTMLCanvasElement;
  readonly worldCamera: Camera;
}

export interface PhotoDocument {
  snapshotId: string;
  image: PhotoImage;
  history: SeedWorldAnnotationHistory;
  capturedAt: Date;
  angle: number;
}
type Pose = { x: number; y: number; width: number; height: number; angle: number; z: number; depth: number };
type Entry = {
  photo: PhotoDocument;
  surface: PhotoSurface;
  pose: Pose;
  target: Pose;
  lift: number;
  liftTarget: number;
  opacity: number;
  opacityTarget: number;
  visible: boolean;
  frameRadius: number;
  closeOpacity: number;
  release(): void;
};
type Drag = { id: string; pointer: number; x: number; y: number; origin: Pose; moved: boolean; remove: boolean };
type Drawing = { pointer: number; points: ViewPoint[]; scale: number; color: string };
type Motion = { start: number; duration: number; update: (t: number) => void; finish: () => void; cancel: () => void };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const interpolate = (a: Pose, b: Pose, t: number): Pose => ({
  x: mix(a.x, b.x, t),
  y: mix(a.y, b.y, t),
  width: mix(a.width, b.width, t),
  height: mix(a.height, b.height, t),
  angle: mix(a.angle, b.angle, t),
  z: mix(a.z, b.z, t),
  depth: mix(a.depth, b.depth, t)
});

/** Engine geometry and UI hit targets share the same poses; InputManager owns gestures. */
export class SeedWorldPhotoWorkspace {
  readonly graphics: PhotoGraphics;
  private readonly trace: SeedWorldPhotoInputTrace;
  private readonly input: SeedWorldPhotoInput;
  private thawAfterFrame?: number;
  private handlingInput = false;
  private readonly entries = new Map<string, Entry>();
  private readonly abort = new AbortController();
  private readonly motions = new Set<Motion>();
  private anchor = { x: innerWidth / 2, top: innerHeight - 130, visible: true };
  private drag?: Drag;
  private drawing?: Drawing;
  private brushColor = DEFAULT_MARKUP_INK;
  private outsideTap?: { pointer: number; x: number; y: number; moved: boolean };
  private closeTap?: { pointer: number; x: number; y: number; moved: boolean };
  private discarding?: { entry: Entry; controller: AbortController };
  private readonly pendingClearIds = new Set<string>();
  private readonly clearingIds = new Set<string>();
  private clearSubmittedAbort?: AbortController;
  private openTransitionAbort?: AbortController;
  private static readonly OPEN_HANDOFF = Symbol("photo-open-handoff");
  private hintAbort?: AbortController;
  private brushVisualTime = 0;
  private static hintShownInSession = false;
  private pointers = new Set<number>();
  private editing?: { entry: Entry; history: SeedWorldAnnotationHistory; existing: boolean };
  private mode: "idle" | "busy" | "editing" = "idle";
  private shade = 0;
  private statusUntil = 0;
  private disposed = false;
  private restoreLayer?: () => void;
  private readonly originalLabel: string | null;
  private readonly originalTabIndex: number;
  get size(): number {
    let count = 0;
    const discardingId = this.discarding?.entry.photo.snapshotId;
    for (const id of this.entries.keys()) {
      if (!this.clearingIds.has(id) && !this.pendingClearIds.has(id) && id !== discardingId) count++;
    }
    return count;
  }
  get isEditing(): boolean {
    return !!this.editing;
  }
  get active(): boolean {
    return this.mode !== "idle" || !!this.drag;
  }
  get phase(): string {
    return this.graphics.canvas.dataset.photoPhase ?? "idle";
  }
  constructor(
    private readonly host: PhotoWorkspaceHost,
    private readonly actions: {
      edit: (photo: PhotoDocument) => void;
      remove: (id: string) => void;
      updateAttachment: (id: string, annotations: readonly ViewAnnotation[]) => void;
      apply: () => void;
      minimize: () => void;
      cancel: () => void;
      freeze: (frozen: boolean) => void;
      retain: (id: string) => () => void;
    },
    budget?: ImageResourceBudget
  ) {
    this.originalLabel = host.canvas.getAttribute("aria-label");
    this.originalTabIndex = host.canvas.tabIndex;
    host.canvas.tabIndex = 0;
    this.graphics = new PhotoGraphics(host.engine, host.canvas, host.worldCamera, (dt) => this.tick(dt), budget);
    this.trace = new SeedWorldPhotoInputTrace(() => this.traceState());
    const signal = this.abort.signal;
    this.input = new SeedWorldPhotoInput(this.graphics.scene, (phase, event) => this.pointer(phase, event));
    const rect = host.canvas.getBoundingClientRect();
    this.input.resize(rect.width, rect.height);
    // Browser default actions must be prevented synchronously. Commands themselves use InputManager.
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          this.active && document.activeElement === this.host.canvas &&
          (event.key === "Tab" ||
            event.key === "Escape" ||
            event.key === "Enter" ||
            ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z"))
        )
          event.preventDefault();
      },
      { capture: true, signal }
    );
    window.addEventListener(
      "blur",
      () => {
        this.trace.record("window-blur");
        this.cancelDrawing("blur");
        this.cancelDrag();
        this.pointers.clear();
      },
      { signal }
    );
    window.addEventListener(
      "resize",
      () => {
        this.trace.record("window-resize");
        this.cancelDrawing("resize");
        this.cancelDrag();
        this.graphics.resize();
        const rect = host.canvas.getBoundingClientRect();
        this.input.resize(rect.width, rect.height);
        this.layout();
        for (const entry of this.entries.values()) {
          if (entry !== this.editing?.entry && entry !== this.discarding?.entry && !this.clearingIds.has(entry.photo.snapshotId)) {
            this.setEntryFrame(entry, entry.target.width, entry.target.height, 10, 0);
          }
        }
        if (this.editing && this.mode === "editing") {
          const targetPose = this.editPose(this.editing.entry.photo);
          const isFullscreen = this.markupMode === "fullscreen";
          this.setEntryFrame(
            this.editing.entry,
            targetPose.width,
            targetPose.height,
            20,
            isFullscreen ? 6 : 0
          );
          this.editing.entry.pose = targetPose;
        }
      },
      { signal }
    );
    this.setPhase("idle");
  }
  playShutter(): void {
    this.graphics.playShutter();
  }
  setPhase(phase: string): void {
    this.input.setModal(this.mode !== "idle");
    this.graphics.canvas.dataset.photoPhase = phase;
    this.trace.record("phase", { phase });
  }
  get(id: string): PhotoDocument | undefined {
    return this.entries.get(id)?.photo;
  }
  setAnchor(x: number, top: number, visible: boolean): void {
    if (x === this.anchor.x && top === this.anchor.top && visible === this.anchor.visible) return;
    if (!visible) this.cancelDrag();
    this.anchor = { x, top, visible };
    this.layout(true);
  }
  beginCapture(): void {
    this.mode = "busy";
    this.setPhase("camera");
    this.freeze(true);
    this.raiseCanvas();
  }
  notify(message: string): void {
    this.graphics.status.text = message;
    this.statusUntil = performance.now() + 4000;
  }
  private raiseCanvas(): void {
    if (this.restoreLayer) return;
    const host = this.host.canvas.closest("main") ?? this.host.canvas;
    const oldPosition = host.style.position,
      oldZ = host.style.zIndex;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.style.zIndex = "2147483646";
    this.restoreLayer = () => {
      host.style.position = oldPosition;
      host.style.zIndex = oldZ;
    };
  }
  private get markupMode(): "inset" | "fullscreen" {
    if (typeof location !== "undefined") {
      const value = new URLSearchParams(location.search).get("markupMode");
      if (value === "fullscreen") return "fullscreen";
    }
    return "inset";
  }
  private editPose(photo: PhotoDocument): Pose {
    const r = this.host.canvas.getBoundingClientRect();
    if (this.markupMode === "fullscreen") {
      return {
        x: r.width / 2,
        y: r.height / 2,
        width: r.width,
        height: r.height,
        angle: 0,
        z: 220,
        depth: 1
      };
    }
    const ratio = photo.image.height / Math.max(1, photo.image.width);
    const area = photoDetailLayout(r.width, r.height).photo;
    const width = Math.min(area.width, area.height / ratio);
    return {
      x: area.x + area.width / 2,
      y: area.y + area.height / 2,
      width,
      height: width * ratio,
      angle: 0,
      z: 220,
      depth: 1
    };
  }
  private dockEntries(includeEntry?: Entry): Entry[] {
    const discarding = this.discarding?.entry;
    return [...this.entries.values()].filter(
      (e) =>
        e === includeEntry ||
        (e !== this.editing?.entry &&
          e !== discarding &&
          !this.clearingIds.has(e.photo.snapshotId) &&
          !(this.drag?.remove && this.drag.id === e.photo.snapshotId))
    );
  }
  private shouldShowOnboardingHint(): boolean {
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("markupHint") === "1") {
      return true;
    }
    if (SeedWorldPhotoWorkspace.hintShownInSession) return false;
    try {
      return localStorage.getItem("seed-world:markup-hint-shown") !== "1";
    } catch {
      return true;
    }
  }
  private markOnboardingHintShown(): void {
    SeedWorldPhotoWorkspace.hintShownInSession = true;
    try {
      localStorage.setItem("seed-world:markup-hint-shown", "1");
    } catch {
      // Ignore storage restrictions in private webviews.
    }
  }
  private stopOnboardingHint(): void {
    this.hintAbort?.abort();
    this.hintAbort = undefined;
    this.editing?.entry.surface.setHintLoop(0, 0);
  }
  private startOnboardingHint(entry: Entry): void {
    if (!this.shouldShowOnboardingHint()) return;
    this.markOnboardingHintShown();
    this.stopOnboardingHint();
    const controller = (this.hintAbort = new AbortController());
    const signal = controller.signal;
    // ~2.8s onboarding animation: brief beat -> trace glowing circle -> soft pulse -> fade out.
    void this.animate(2800, signal, (t) => {
      if (this.editing?.entry !== entry || this.disposed) {
        entry.surface.setHintLoop(0, 0);
        return;
      }
      const elapsed = t * 2.8;
      if (elapsed < 0.16) {
        entry.surface.setHintLoop(0, 0);
      } else if (elapsed < 1.18) {
        const k = (elapsed - 0.16) / 1.02;
        const eased = k < 0.5 ? 4 * k * k * k : 1 - ((-2 * k + 2) ** 3) / 2;
        entry.surface.setHintLoop(eased, Math.min(1, k * 3.5));
      } else if (elapsed < 2.15) {
        const pulse = 0.86 + 0.14 * Math.sin(((elapsed - 1.18) / 0.97) * Math.PI * 2);
        entry.surface.setHintLoop(1, pulse);
      } else {
        const fade = Math.max(0, 1 - (elapsed - 2.15) / 0.65);
        entry.surface.setHintLoop(1, fade * fade);
      }
    }).catch(() => undefined).finally(() => {
      if (this.hintAbort === controller) this.hintAbort = undefined;
      if (!this.disposed) entry.surface.setHintLoop(0, 0);
    });
  }
  /** Immediately dispose any cards currently fading out after a finished voice turn. */
  flushClearingCards(): void {
    if (!this.clearingIds.size && !this.clearSubmittedAbort) return;
    this.clearSubmittedAbort?.abort();
    this.clearSubmittedAbort = undefined;
    const ids = [...this.clearingIds];
    this.clearingIds.clear();
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      entry.surface.dispose();
      entry.release();
      this.input.remove(id);
      this.entries.delete(id);
    }
    if (!this.disposed) this.layout();
  }
  /** Immediately dispose or gracefully fade away all docked cards that were submitted in a voice turn. */
  clearSubmittedCards(snapshotIds: readonly string[]): void {
    const cards: Entry[] = [];
    for (const id of snapshotIds) {
      const entry = this.entries.get(id);
      if (!entry || entry === this.discarding?.entry || this.clearingIds.has(id)) {
        continue;
      }
      if (entry === this.editing?.entry) {
        // Turn ended before dismissSubmitted() finished shrinking/preparing identities:
        // detach immediately so the finished turn's photo can never leak into the next turn,
        // and fade out the card as soon as dismissSubmitted() completes.
        this.pendingClearIds.add(id);
        this.actions.remove(id);
        continue;
      }
      cards.push(entry);
    }
    if (!cards.length) return;
    // Dispose any prior fading batch before replacing clearSubmittedAbort so reentrant clears never strand entries.
    if (this.clearingIds.size > 0 || this.clearSubmittedAbort) {
      this.flushClearingCards();
    }
    for (const entry of cards) {
      const id = entry.photo.snapshotId;
      this.clearingIds.add(id);
      if (this.drag?.id === id) this.cancelDrag();
      // Free the attachment slot immediately; active AI turns already hold their own snapshot leases.
      this.actions.remove(id);
    }
    if (!this.disposed) this.layout();
    const disposeCards = () => {
      for (const card of cards) {
        const id = card.photo.snapshotId;
        if (!this.clearingIds.delete(id)) continue;
        if (this.entries.get(id) !== card) continue;
        card.surface.dispose();
        card.release();
        this.input.remove(id);
        this.entries.delete(id);
      }
      if (!this.disposed) this.layout();
    };
    if (this.disposed) {
      disposeCards();
      return;
    }
    const controller = (this.clearSubmittedAbort = new AbortController());
    const startOpacities = cards.map((card) => card.opacity);
    void this.animate(260, controller.signal, (t) => {
      const factor = 1 - t * t;
      for (let i = 0; i < cards.length; i++) {
        if (!this.clearingIds.has(cards[i].photo.snapshotId)) continue;
        cards[i].opacity = startOpacities[i] * factor;
      }
    })
      .then(() => {
        if (this.clearSubmittedAbort === controller) this.clearSubmittedAbort = undefined;
        disposeCards();
      })
      .catch(() => {
        if (this.clearSubmittedAbort === controller) this.clearSubmittedAbort = undefined;
      });
  }
  private setEntryFrame(entry: Entry, width: number, height: number, radius: number, rimWidth: number): void {
    entry.frameRadius = radius;
    entry.surface.setFrameLayout(width, height, radius, rimWidth);
  }
  private setEntryCloseOpacity(entry: Entry, opacity: number): void {
    entry.closeOpacity = opacity;
    entry.surface.setCloseOpacity(opacity);
  }
  async open(
    photo: PhotoDocument,
    signal: AbortSignal
  ): Promise<void> {
    const wasClearing = this.clearingIds.delete(photo.snapshotId);
    this.pendingClearIds.delete(photo.snapshotId);
    if (wasClearing || !this.entries.has(photo.snapshotId)) {
      this.flushClearingCards();
    }
    let entry = this.entries.get(photo.snapshotId);
    const existing = !!entry;
    if (!entry) {
      const surface = await this.graphics.create(photo.image);
      if (signal.aborted || this.disposed) {
        surface.dispose();
        signal.throwIfAborted();
        throw new DOMException("Disposed", "AbortError");
      }
      const pose = this.editPose(photo);
      entry = {
        photo,
        surface,
        pose: { ...pose },
        target: { ...pose },
        lift: 1,
        liftTarget: 1,
        opacity: 1,
        opacityTarget: 1,
        visible: false,
        frameRadius: 0,
        closeOpacity: 0,
        release: this.actions.retain(photo.snapshotId)
      };
      this.entries.set(photo.snapshotId, entry);
      this.layout();
    }
    const targetPose = this.editPose(photo);
    const isFullscreen = this.markupMode === "fullscreen";
    const targetRadius = 20;
    const targetShade = isFullscreen ? 0 : 0.48;
    entry.opacityTarget = 1;
    this.editing = { entry, history: photo.history.clone(), existing };
    entry.surface.paint(this.editing.history.annotations);
    // Register/sync attachment synchronously before the fly animation so entries and attachments
    // stay consistent if voice submission hands off mid-fly.
    this.actions.updateAttachment(photo.snapshotId, this.editing.history.annotations);
    this.mode = "busy";

    // Dedicated fly-transition abort controller lets dismissSubmitted() cleanly take over mid-fly
    // without cancelling the outer capture session or running competing animations on the same entry.
    this.openTransitionAbort?.abort(SeedWorldPhotoWorkspace.OPEN_HANDOFF);
    const flyAbort = (this.openTransitionAbort = new AbortController());
    const onOuterAbort = () => flyAbort.abort(signal.reason ?? new DOMException("Photo open cancelled", "AbortError"));
    if (signal.aborted) {
      onOuterAbort();
    } else {
      signal.addEventListener("abort", onOuterAbort, { once: true });
    }
    const flySignal = flyAbort.signal;

    try {
      if (isFullscreen) {
        this.setEntryFrame(entry, targetPose.width, targetPose.height, targetRadius, 6);
        this.setEntryCloseOpacity(entry, 0);
        entry.pose = { ...targetPose };
        entry.visible = true;
        entry.liftTarget = 1;
        this.shade = 0;
        this.setPhase("fly");
        await this.animate(220, flySignal, (t) => {
          const e = 1 - (1 - t) ** 3;
          entry!.opacity = 1;
          entry!.surface.setRimOpacity(e);
        });
      } else {
        const r = this.host.canvas.getBoundingClientRect();
        const from: Pose = existing
          ? { ...entry.pose, z: targetPose.z }
          : {
              x: r.width / 2,
              y: r.height / 2,
              width: r.width,
              height: r.height,
              angle: 0,
              z: targetPose.z,
              depth: 1
            };
        const startRadius = existing ? entry.frameRadius : 0;
        const startRim = existing ? 1 : 0;
        const openDuration = existing ? 360 : 480;
        entry.pose = { ...from };
        entry.opacity = 1;
        entry.visible = true;
        entry.liftTarget = 1;
        this.setEntryFrame(entry, from.width, from.height, startRadius, 0);
        entry.surface.setRimOpacity(startRim);
        this.setEntryCloseOpacity(entry, 0);
        this.render(entry);
        this.setPhase("fly");
        await this.animate(openDuration, flySignal, (t) => {
          const e = 1 - Math.pow(1 - t, 3.2);
          const current = interpolate(from, targetPose, e);
          entry!.pose = current;
          this.setEntryFrame(entry!, current.width, current.height, mix(startRadius, targetRadius, e), 0);
          entry!.surface.setRimOpacity(mix(startRim, 1, e));
          this.setEntryCloseOpacity(entry!, e);
          this.shade = targetShade * e;
        });
      }
    } catch (error) {
      if (flySignal.aborted && flySignal.reason === SeedWorldPhotoWorkspace.OPEN_HANDOFF) {
        return;
      }
      throw error;
    } finally {
      signal.removeEventListener("abort", onOuterAbort);
      if (this.openTransitionAbort === flyAbort) this.openTransitionAbort = undefined;
    }

    if (flySignal.aborted || signal.aborted || this.disposed || this.editing?.entry !== entry) return;
    this.mode = "editing";
    entry.opacity = entry.opacityTarget = 1;
    this.setEntryCloseOpacity(entry, 1);
    this.render(entry);
    this.setPhase("editing");
    this.graphics.status.text = "";
    this.host.canvas.focus();
    this.updateAriaLabel();
    this.startOnboardingHint(entry);
  }
  /** After voice dialogue submits or margin tap minimizes, shrink the marked screenshot smoothly into the multi-card dock. */
  async dismissSubmitted(
    signal: AbortSignal,
    waitBeforeUnfreeze?: { readonly isPending: () => boolean; readonly wait: (signal: AbortSignal) => Promise<void> }
  ): Promise<void> {
    const editing = this.editing;
    if (!editing) return;
    // Cancel any in-flight open() fly motion synchronously so only dismissSubmitted() drives this entry.
    this.openTransitionAbort?.abort(SeedWorldPhotoWorkspace.OPEN_HANDOFF);
    this.openTransitionAbort = undefined;
    this.stopOnboardingHint();
    this.cancelDrawing();
    this.mode = "busy";
    const { entry, history } = editing;
    // Commit current strokes onto the document so tapping the docked card reopens them intact.
    entry.photo = { ...entry.photo, history };
    const from = { ...entry.pose };
    // Lay out all docked cards including this entry so peer cards smoothly make room during the shrink animation.
    this.layout(false, entry);
    const cardPose = { ...entry.target };
    const startShade = this.shade;
    const startRadius = entry.frameRadius;
    const startCloseOpacity = entry.closeOpacity;
    const cardRadius = 10;
    this.setPhase("return");
    await this.animate(380, signal, (t) => {
      const e = 1 - (1 - t) ** 3;
      const current = interpolate(from, cardPose, e);
      entry.pose = current;
      this.setEntryFrame(entry, current.width, current.height, mix(startRadius, cardRadius, e), 0);
      entry.surface.setRimOpacity(1);
      this.setEntryCloseOpacity(entry, startCloseOpacity * Math.max(0, 1 - e * 2.5));
      this.shade = startShade * (1 - e);
    });
    signal.throwIfAborted();
    this.setEntryFrame(entry, cardPose.width, cardPose.height, cardRadius, 0);
    this.setEntryCloseOpacity(entry, 0);
    entry.pose = { ...cardPose };
    entry.target = { ...cardPose };
    entry.liftTarget = 0;
    entry.opacity = entry.opacityTarget = 1;
    entry.visible = true;
    if (waitBeforeUnfreeze?.isPending()) {
      // Keep the world camera frozen until deferred ID+depth capture finishes so dynamic view-culled
      // batches stay pixel-aligned with the captured color frame (0ms extra wait when already settled).
      this.setPhase("identities");
      this.graphics.status.text = "正在建立画面拾取索引…";
      this.statusUntil = 0;
      await waitBeforeUnfreeze.wait(signal);
      signal.throwIfAborted();
      if (this.disposed) return;
    }
    const dismissedId = entry.photo.snapshotId;
    this.editing = undefined;
    this.finish();
    if (this.pendingClearIds.delete(dismissedId) && this.entries.get(dismissedId) === entry) {
      this.clearSubmittedCards([dismissedId]);
    }
  }
  cancel(): void {
    this.openTransitionAbort?.abort(new DOMException("Photo open cancelled", "AbortError"));
    this.openTransitionAbort = undefined;
    this.stopOnboardingHint();
    if (this.discarding) {
      const { entry, controller } = this.discarding;
      this.discarding = undefined;
      controller.abort();
      this.remove(entry.photo.snapshotId);
    }
    this.cancelDrawing();
    this.cancelDrag();
    const editing = this.editing;
    this.editing = undefined;
    if (editing) {
      const id = editing.entry.photo.snapshotId;
      if (editing.existing && !this.pendingClearIds.has(id)) {
        this.actions.updateAttachment(id, editing.entry.photo.history.annotations);
        editing.entry.surface.paint(editing.entry.photo.history.annotations);
        this.layout(false, editing.entry);
        editing.entry.pose = { ...editing.entry.target };
        this.setEntryFrame(editing.entry, editing.entry.target.width, editing.entry.target.height, 10, 0);
        this.setEntryCloseOpacity(editing.entry, 0);
        editing.entry.liftTarget = 0;
      } else {
        this.remove(id);
      }
    }
    this.finish();
  }
  private finish(): void {
    this.mode = "idle";
    this.pointers.clear();
    this.shade = 0;
    this.graphics.status.text = "";
    this.restoreLayer?.();
    this.restoreLayer = undefined;
    if (this.originalLabel === null) this.host.canvas.removeAttribute("aria-label");
    else this.host.canvas.setAttribute("aria-label", this.originalLabel);
    this.setPhase("idle");
    this.layout();
    this.freeze(false);
  }
  remove(id: string): void {
    this.pendingClearIds.delete(id);
    this.clearingIds.delete(id);
    const entry = this.entries.get(id);
    if (!entry) return;
    this.actions.remove(id);
    entry.surface.dispose();
    entry.release();
    this.input.remove(id);
    this.entries.delete(id);
    this.layout();
  }
  private layout(followAnchor = false, includeEntry?: Entry): void {
    const r = this.host.canvas.getBoundingClientRect();
    const anchorX = this.anchor.x - r.left;
    const anchorTop = this.anchor.top - r.top;
    const included = this.dockEntries(includeEntry);
    if (included.length > 0 && r.width > 0 && r.height > 0) {
      const { useWideLayout, orbReservedRightPx } = resolveSeedWorldVoiceOrbLayout(r.width, r.height);
      const safeSideMargin = useWideLayout ? orbReservedRightPx : 16;
      const maxRowWidth = Math.max(112, r.width - safeSideMargin * 2);
      const gap = included.length > 2 || r.width < 540 ? 12 : 14;
      const preferredWidth =
        r.width < 540 ? Math.min(120, Math.max(76, r.width * 0.28)) : Math.min(136, Math.max(96, r.width * 0.145));
      const slotMaxWidth = Math.max(48, (maxRowWidth - gap * Math.max(0, included.length - 1)) / included.length);
      const maxCardHeight = Math.max(64, Math.min(r.height > r.width ? 132 : 112, anchorTop - 32));
      const sizes = included.map((entry) => {
        const ratio = entry.photo.image.height / Math.max(1, entry.photo.image.width);
        const width = Math.min(preferredWidth, slotMaxWidth, maxCardHeight / Math.max(0.2, ratio));
        return { width, height: width * ratio };
      });
      const totalWidth = sizes.reduce((sum, s) => sum + s.width, 0) + Math.max(0, included.length - 1) * gap;
      const minCenter = safeSideMargin + totalWidth * 0.5;
      const maxCenter = r.width - safeSideMargin - totalWidth * 0.5;
      const rowCenterX =
        minCenter <= maxCenter ? Math.max(minCenter, Math.min(maxCenter, anchorX)) : r.width * 0.5;
      let left = rowCenterX - totalWidth * 0.5;
      included.forEach((entry, index) => {
        const { width, height } = sizes[index];
        const previousTarget = entry.target;
        const y = Math.max(height * 0.5 + 16, Math.min(r.height - 16 - height * 0.5, anchorTop - 14 - height * 0.5));
        entry.target = {
          x: left + width * 0.5,
          y,
          width,
          height,
          angle: included.length > 1 ? entry.photo.angle : 0,
          z: 24 + index * 2,
          depth: 1
        };
        if (
          followAnchor &&
          entry !== this.editing?.entry &&
          entry !== this.discarding?.entry &&
          entry.photo.snapshotId !== this.drag?.id
        ) {
          const pose = entry.pose;
          const target = entry.target;
          pose.x += target.x - previousTarget.x;
          pose.y += target.y - previousTarget.y;
          pose.width += target.width - previousTarget.width;
          pose.height += target.height - previousTarget.height;
          pose.angle += target.angle - previousTarget.angle;
          pose.z = target.z;
          this.render(entry);
        }
        left += width + gap;
      });
    }
  }
  private freeze(value: boolean): void {
    if (value) {
      this.thawAfterFrame = undefined;
      this.actions.freeze(true);
    } else if (this.handlingInput) {
      // EndDrag runs before scene updates. Keep world controls disabled through the release frame.
      this.thawAfterFrame = this.host.engine.time.frameCount + 1;
    } else {
      this.thawAfterFrame = undefined;
      this.actions.freeze(false);
    }
  }
  private tick(dt: number): void {
    if (this.disposed) return;
    if (this.thawAfterFrame !== undefined && this.host.engine.time.frameCount >= this.thawAfterFrame) {
      this.thawAfterFrame = undefined;
      if (!this.active) this.actions.freeze(false);
    }
    this.handlingInput = true;
    try {
      this.key();
    } finally {
      this.handlingInput = false;
    }
    const now = performance.now();
    for (const motion of [...this.motions]) {
      // Latch start on the first actual rendered frame so capture/upload latency never skips the opening frames.
      if (motion.start < 0) motion.start = now;
      const t = Math.min(1, (now - motion.start) / motion.duration);
      try {
        motion.update(t);
        if (t === 1) motion.finish();
      } catch {
        motion.cancel();
      }
    }
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion) {
      this.brushVisualTime = (this.brushVisualTime + Math.min(Math.max(dt, 0), 0.1)) % 3600;
    }
    const t = reducedMotion ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 18);
    for (const entry of this.entries.values()) {
      const id = entry.photo.snapshotId;
      const clearing = this.clearingIds.has(id);
      if (entry !== this.editing?.entry && entry !== this.discarding?.entry && !clearing && id !== this.drag?.id)
        entry.pose = interpolate(entry.pose, entry.target, t);
      entry.lift = mix(entry.lift, entry.liftTarget, t);
      if (entry !== this.discarding?.entry && !clearing) {
        entry.opacity = mix(entry.opacity, entry.opacityTarget, t);
        if (Math.abs(entry.opacity - entry.opacityTarget) < 0.001) entry.opacity = entry.opacityTarget;
      }
      entry.surface.setBrushTime(this.brushVisualTime);
      this.render(entry);
    }
    const backdrop = this.graphics.backdrop;
    backdrop.entity.isActive = this.shade > 0.001;
    (backdrop.getMaterial() as UnlitMaterial).baseColor.a = this.shade;
    if (this.statusUntil && now > this.statusUntil) {
      this.statusUntil = 0;
      this.graphics.status.text = "";
    }
    this.graphics.camera.enabled =
      !this.graphics.warmingUp && (this.entries.size > 0 || this.mode !== "idle" || !!this.graphics.status.text);
    if (this.editing && this.trace.enabled)
      this.trace.sample("frame", {
        dt,
        cameraEnabled: this.graphics.camera.enabled,
        sceneActive: this.graphics.scene.isActive,
        rootActive: this.editing.entry.surface.root.isActiveInHierarchy,
        hasUserMarks: this.editing.entry.surface.hasUserMarks
      });
  }
  private render(entry: Entry): void {
    const { surface, pose: p } = entry;
    surface.setOpacity(entry.opacity);
    const id = entry.photo.snapshotId;
    const isEditingOrDiscarding = entry === this.editing?.entry || entry === this.discarding?.entry;
    const showSurface = entry.visible && (isEditingOrDiscarding || this.anchor.visible);
    surface.root.isActive = showSurface;
    const cardInteractive =
      !isEditingOrDiscarding &&
      entry.visible &&
      this.anchor.visible &&
      this.mode === "idle" &&
      !this.clearingIds.has(id);
    this.input.setPhoto(id, p, cardInteractive);
    if (!showSurface) return;
    surface.root.transform.setPosition(p.x, -p.y, p.z);
    surface.root.transform.setRotation(0, 0, -p.angle);
    surface.root.transform.setScale(
      p.width / Math.max(1, surface.layoutWidth),
      p.height / Math.max(1, surface.layoutHeight),
      1
    );
  }
  private animate(duration: number, signal: AbortSignal, update: (t: number) => void): Promise<void> {
    signal.throwIfAborted();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update(1);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.motions.delete(motion);
        signal.removeEventListener("abort", motion.cancel);
      };
      const motion: Motion = {
        start: -1,
        duration,
        update,
        finish: () => {
          cleanup();
          resolve();
        },
        cancel: () => {
          cleanup();
          reject(signal.reason ?? new DOMException("Photo animation cancelled", "AbortError"));
        }
      };
      this.motions.add(motion);
      signal.addEventListener("abort", motion.cancel, { once: true });
      update(0);
    });
  }
  private local(pointer: Pointer): ViewPoint {
    const r = this.host.canvas.getBoundingClientRect();
    return {
      x: (pointer.position.x * r.width) / this.host.canvas.width,
      y: (pointer.position.y * r.height) / this.host.canvas.height
    };
  }
  private hit(p: ViewPoint): Entry | undefined {
    if (this.discarding || !this.anchor.visible) return undefined;
    return [...this.entries.values()].reverse().find((entry) => {
      const id = entry.photo.snapshotId;
      if (!entry.visible || entry === this.editing?.entry || this.clearingIds.has(id)) return false;
      const q = this.localPaper(entry, p);
      const sx = entry.pose.width / Math.max(1, entry.surface.layoutWidth);
      const sy = entry.pose.height / Math.max(1, entry.surface.layoutHeight);
      const padX = 12 / Math.max(0.0001, sx);
      const padY = 12 / Math.max(0.0001, sy);
      return (
        Math.abs(q.x) <= entry.surface.layoutWidth * 0.5 + padX &&
        Math.abs(q.y) <= entry.surface.layoutHeight * 0.5 + padY
      );
    });
  }
  private localPaper(entry: Entry, p: ViewPoint): ViewPoint {
    const a = (entry.pose.angle * Math.PI) / 180,
      dx = p.x - entry.pose.x,
      dy = p.y - entry.pose.y;
    const sx = entry.pose.width / Math.max(1, entry.surface.layoutWidth);
    const sy = entry.pose.height / Math.max(1, entry.surface.layoutHeight);
    return {
      x: (dx * Math.cos(a) + dy * Math.sin(a)) / Math.max(0.0001, sx),
      y: -(-dx * Math.sin(a) + dy * Math.cos(a)) / Math.max(0.0001, sy)
    };
  }
  private imagePoint(p: ViewPoint): ViewPoint | undefined {
    const entry = this.editing!.entry,
      q = this.localPaper(entry, p);
    return entry.surface.imagePoint(q.x, q.y);
  }
  private traceState(): Record<string, unknown> {
    const entry = this.editing?.entry,
      rect = this.host.canvas.getBoundingClientRect();
    return {
      mode: this.mode,
      phase: this.host.canvas.dataset.photoPhase,
      pointers: [...this.pointers],
      snapshotId: entry?.photo.snapshotId,
      drawing: this.drawing
        ? { pointer: this.drawing.pointer, points: this.drawing.points.length, last: this.drawing.points.at(-1) }
        : null,
      strokes: this.editing?.history.annotations.length,
      brushColor: this.brushColor,
      pose: entry ? { ...entry.pose } : null,
      canvas: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        bufferWidth: this.host.canvas.width,
        bufferHeight: this.host.canvas.height
      },
      focused: document.hasFocus(),
      visibility: document.visibilityState
    };
  }
  private pointer(phase: PhotoPointerPhase, event: PointerEventData): void {
    const pointer = event.pointer;
    const detail = {
      phase,
      pointerId: pointer.id,
      enginePhase: pointer.phase,
      button: pointer.button,
      buttons: pointer.pressedButtons,
      x: pointer.position.x,
      y: pointer.position.y
    };
    this.handlingInput = true;
    try {
      this.handlePointer(phase, pointer);
    } catch (error) {
      this.trace.record("input-error", { ...detail, error: String(error instanceof Error ? error.stack : error) });
      throw error;
    } finally {
      this.handlingInput = false;
      if (phase === "move") this.trace.sample("engine-drag", detail);
      else this.trace.record("engine-" + phase, detail);
    }
  }
  private handlePointer(type: PhotoPointerPhase, event: Pointer): void {
    const p = this.local(event),
      isDown = type === "begin",
      isUp = type === "end" && event.phase === PointerPhase.Up,
      cancel = type === "end" && !isUp;
    if (type === "end") this.pointers.delete(event.id);
    if (this.mode === "busy") {
      if (isDown)
        this.trace.record("rejected-busy", { pointerId: event.id, enginePhase: event.phase, button: event.button });
      return;
    }
    if (this.mode === "editing") {
      if (isDown) {
        this.pointers.add(event.id);
        if (this.pointers.size > 1) {
          this.trace.record("rejected-multiple-pointers", {
            pointerId: event.id,
            enginePhase: event.phase,
            button: event.button
          });
          this.cancelDrawing("multiple-pointers");
          return;
        }
        if (event.button !== PointerButton.Primary) {
          this.trace.record("rejected-non-primary", {
            pointerId: event.id,
            enginePhase: event.phase,
            button: event.button
          });
          return;
        }
        this.outsideTap = undefined;
        this.closeTap = undefined;
        this.stopOnboardingHint();
        const entry = this.editing!.entry;
        const q = this.localPaper(entry, p);
        if (entry.surface.isCloseButtonHit(q.x, q.y)) {
          this.closeTap = { pointer: event.id, x: p.x, y: p.y, moved: false };
          return;
        }
        const point = this.imagePoint(p);
        if (!point) {
          if (Math.abs(q.x) > entry.surface.layoutWidth * 0.5 || Math.abs(q.y) > entry.surface.layoutHeight * 0.5)
            this.outsideTap = { pointer: event.id, x: p.x, y: p.y, moved: false };
          return;
        }
        this.trace.record("stroke-start", {
          imagePoint: point,
          ...{ pointerId: event.id, enginePhase: event.phase, button: event.button }
        });
        const scale = this.editing!.entry.photo.image.width / Math.max(1, this.editing!.entry.pose.width);
        this.drawing = { pointer: event.id, points: [point], scale, color: this.brushColor };
        if (!this.tryPaintDrawing()) {
          this.drawing = undefined;
        }
      } else if (isUp || cancel) {
        const closeTap = this.closeTap;
        if (closeTap?.pointer === event.id) {
          this.closeTap = undefined;
          const editing = this.editing;
          if (isUp && editing) {
            const q = this.localPaper(editing.entry, p);
            if (!closeTap.moved || editing.entry.surface.isCloseButtonHit(q.x, q.y)) {
              void this.discard(editing.entry);
            }
          }
          return;
        }
        const outside = this.outsideTap;
        if (outside?.pointer === event.id) {
          this.outsideTap = undefined;
          if (isUp && !outside.moved && Math.hypot(p.x - outside.x, p.y - outside.y) <= config.tapSlop) {
            // Tapping the blank dark margin minimizes the canvas into a docked bottom card (preserving strokes).
            this.actions.minimize();
          }
          return;
        }
        if (this.drawing?.pointer !== event.id) return;
        if (isUp) {
          const point = this.imagePoint(p);
          if (point) this.drawing.points.push(point);
          try {
            const annotation = createViewAnnotation(this.drawing.points, this.drawing.scale, this.drawing.color);
            this.updateHistory(history => history.add(annotation));
            this.trace.record("stroke-committed", { type, pointCount: this.drawing.points.length });
          } catch (error) {
            const rawError = String(error);
            this.trace.record("history-error", { error: rawError });
            if (error instanceof AgentValueSizeError) {
              this.notify(this.editing?.history.annotations.length
                ? "本笔未保存。请先发送当前照片，或重拍。"
                : "本笔过长，未保存。请缩短笔画后重试。");
            } else {
              this.notify(error instanceof Error ? error.message : rawError);
            }
          }
        } else {
          this.trace.record("stroke-cancelled", { type, pointCount: this.drawing.points.length });
        }
        this.cancelDrawing(type);
      } else if (type === "move" && this.closeTap?.pointer === event.id) {
        this.closeTap.moved ||= Math.hypot(p.x - this.closeTap.x, p.y - this.closeTap.y) > config.tapSlop;
      } else if (type === "move" && this.outsideTap?.pointer === event.id) {
        this.outsideTap.moved ||= Math.hypot(p.x - this.outsideTap.x, p.y - this.outsideTap.y) > config.tapSlop;
      } else if (type === "move" && this.drawing?.pointer === event.id) {
        const point = this.imagePoint(p),
          last = this.drawing.points.at(-1)!;
        if (!point)
          this.trace.sample("move-image-miss", {
            local: p,
            paper: this.localPaper(this.editing!.entry, p),
            ...{ pointerId: event.id, enginePhase: event.phase, button: event.button }
          });
        if (point && Math.hypot(point.x - last.x, point.y - last.y) > this.drawing.scale * 2) {
          this.drawing.points.push(point);
          if (!this.tryPaintDrawing()) {
            this.drawing = undefined;
          }
        }
      }
      return;
    }
    if (isDown) {
      if (this.drag) {
        this.cancelDrag();
        return;
      }
      if (event.button !== PointerButton.Primary) return;
      const entry = this.hit(p);
      if (!entry) return;
      this.drag = {
        id: entry.photo.snapshotId,
        pointer: event.id,
        x: p.x,
        y: p.y,
        origin: { ...entry.pose },
        moved: false,
        remove: false
      };
      entry.liftTarget = 1;
      this.freeze(true);
      this.setPhase("drag");
    } else if (this.drag && event.id === this.drag.pointer) {
      const drag = this.drag,
        entry = this.entries.get(drag.id)!;
      if (cancel) {
        this.cancelDrag();
        return;
      }
      if (isUp) {
        const remove = drag.remove && drag.moved,
          edit = !drag.moved;
        this.drag = undefined;
        this.graphics.status.text = "";
        this.layout();
        if (remove) {
          void this.discard(entry);
        } else if (edit) {
          this.freeze(false);
          this.actions.edit(entry.photo);
        } else {
          entry.liftTarget = 0;
          entry.opacityTarget = 1;
          this.freeze(false);
          this.setPhase("idle");
        }
      } else if (type === "move") {
        const dx = p.x - drag.x,
          dy = p.y - drag.y,
          distance = Math.hypot(dx, dy);
        drag.moved ||= distance > config.tapSlop;
        drag.remove = distance >= (drag.remove ? config.returnDistance : config.removeDistance);
        entry.pose = { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy, z: 60 };
        const fade = Math.max(0, Math.min(1, (distance - config.tapSlop) / (config.removeDistance - config.tapSlop)));
        entry.opacityTarget = mix(1, config.dragMinOpacity, fade);
        this.graphics.status.text = "";
        this.setPhase(drag.remove ? "remove-preview" : "drag");
        this.layout();
      }
    }
  }
  private cancelDrag(): void {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = undefined;
    const entry = this.entries.get(drag.id);
    if (entry) {
      entry.liftTarget = 0;
      entry.opacityTarget = 1;
    }
    this.graphics.status.text = "";
    this.layout();
    this.freeze(this.mode !== "idle");
    this.setPhase(this.mode);
  }
  private cancelDrawing(reason = "state-or-tool"): void {
    this.outsideTap = undefined;
    this.closeTap = undefined;
    if (this.drawing) this.trace.record("drawing-ended", { reason, pointCount: this.drawing.points.length });
    this.drawing = undefined;
    if (this.editing) this.tryPaintDrawing();
  }
  private tryPaintDrawing(): boolean {
    try {
      this.paint();
      return true;
    } catch {
      this.notify("画面标记渲染失败，请重试。");
      return false;
    }
  }
  private paint(): void {
    const { entry, history } = this.editing!;
    const started = this.trace.enabled ? performance.now() : 0;
    try {
      const activeStrokeIndex = this.drawing ? history.annotations.length : undefined;
      entry.surface.paint(
        [
          ...history.annotations,
          ...(this.drawing ? [createViewAnnotation(this.drawing.points, this.drawing.scale, this.drawing.color)] : [])
        ],
        { activeStrokeIndex }
      );
      if (this.trace.enabled)
        this.trace.sample("paint", {
          elapsedMs: performance.now() - started,
          rootActive: entry.surface.root.isActiveInHierarchy,
          hasUserMarks: entry.surface.hasUserMarks,
          cameraEnabled: this.graphics.camera.enabled
        });
    } catch (error) {
      this.trace.record("paint-error", { error: String(error instanceof Error ? error.stack : error) });
      throw error;
    }
    this.updateAriaLabel();
  }
  private updateHistory(change: (history: SeedWorldAnnotationHistory) => void): void {
    const editing = this.editing;
    if (!editing) return;
    const next = editing.history.clone();
    change(next);
    // Publish only completed gestures. A rejected attachment leaves the visible history unchanged.
    this.actions.updateAttachment(editing.entry.photo.snapshotId, next.annotations);
    editing.history = next;
  }
  private updateAriaLabel(): void {
    const history = this.editing?.history;
    this.host.canvas.setAttribute(
      "aria-label",
      `画面圈画标记：直接圈画标记修改区域，长按语音球说话，点击空白处收起为卡片，点击左上角 × 删除。已画 ${history?.annotations.length ?? 0} 笔。`
    );
  }
  private async discard(entry: Entry): Promise<void> {
    if (this.discarding) return;
    const fromCard = entry !== this.editing?.entry;
    if (!fromCard) {
      this.openTransitionAbort?.abort(SeedWorldPhotoWorkspace.OPEN_HANDOFF);
      this.openTransitionAbort = undefined;
    }
    this.pendingClearIds.delete(entry.photo.snapshotId);
    this.clearingIds.delete(entry.photo.snapshotId);
    this.stopOnboardingHint();
    this.cancelDrawing();
    // Delete the attachment immediately; the remaining geometry is only the smooth exit animation.
    this.actions.remove(entry.photo.snapshotId);
    this.editing = undefined;
    this.drag = undefined;
    const controller = new AbortController();
    this.discarding = { entry, controller };
    this.mode = "busy";
    this.freeze(true);
    this.graphics.status.text = "";
    entry.liftTarget = 1;
    this.setPhase("discard");
    this.layout();
    const r = this.host.canvas.getBoundingClientRect();
    const from = { ...entry.pose };
    const fullPose: Pose = fromCard
      ? {
          ...from,
          width: from.width * 0.58,
          height: from.height * 0.58
        }
      : {
          x: r.width / 2,
          y: r.height / 2,
          width: r.width,
          height: r.height,
          angle: 0,
          z: from.z,
          depth: 1
        };
    const isFullscreen = this.markupMode === "fullscreen";
    const opacity = entry.opacity,
      shade = this.shade;
    const startRadius = entry.frameRadius;
    const startCloseOpacity = fromCard ? 0 : entry.closeOpacity;
    try {
      await this.animate(fromCard ? 220 : 260, controller.signal, (t) => {
        const e = 1 - (1 - t) ** 3;
        if (fromCard) {
          const current = interpolate(from, fullPose, e);
          entry.pose = current;
          this.setEntryFrame(entry, current.width, current.height, startRadius * (1 - e * 0.4), 0);
        } else if (!isFullscreen) {
          const current = interpolate(from, fullPose, e);
          entry.pose = current;
          this.setEntryFrame(entry, current.width, current.height, startRadius * (1 - e), 0);
        }
        entry.surface.setRimOpacity(1 - e);
        this.setEntryCloseOpacity(entry, startCloseOpacity * (1 - e));
        entry.opacity = opacity * (1 - e);
        this.shade = shade * (1 - e);
        this.render(entry);
      });
    } catch (error) {
      if (!controller.signal.aborted && !this.disposed) this.notify(String(error));
    } finally {
      if (this.discarding?.entry === entry) {
        this.discarding = undefined;
        this.remove(entry.photo.snapshotId);
        if (!this.disposed) {
          if (fromCard) this.finish();
          else this.actions.cancel();
        }
      }
    }
  }
  private key(): void {
    if (!this.active || document.activeElement !== this.host.canvas) return;
    const input = this.host.engine.inputManager;
    if (input.isKeyDown(Keys.Escape)) {
      if (this.drawing) this.cancelDrawing("escape");
      else if (this.drag) this.cancelDrag();
      else if (this.mode === "editing" && this.editing) this.actions.minimize();
      else if (this.phase !== "return" && this.phase !== "discard") this.actions.cancel();
    }
  }
  dispose(): void {
    this.disposed = true;
    this.openTransitionAbort?.abort(new DOMException("Disposed", "AbortError"));
    this.openTransitionAbort = undefined;
    this.stopOnboardingHint();
    this.clearSubmittedAbort?.abort();
    this.clearSubmittedAbort = undefined;
    this.pendingClearIds.clear();
    this.clearingIds.clear();
    this.discarding?.controller.abort();
    this.discarding = undefined;
    this.thawAfterFrame = undefined;
    this.actions.freeze(false);
    this.host.canvas.tabIndex = this.originalTabIndex;
    this.abort.abort();
    for (const motion of [...this.motions]) motion.cancel();
    this.restoreLayer?.();
    for (const entry of this.entries.values()) { entry.surface.dispose(); entry.release(); }
    this.entries.clear();
    this.trace.dispose();
    this.input.dispose();
    this.graphics.dispose();
  }
}
