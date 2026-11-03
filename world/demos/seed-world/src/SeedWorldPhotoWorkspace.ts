import type { ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import { SeedWorldPhotoInput, type PhotoPointerPhase } from "./SeedWorldPhotoInput.ts";
import { DEFAULT_PHOTO_INK, PHOTO_TOOLBAR, PHOTO_PALETTE, PHOTO_INK_COLORS, photoDetailLayout } from "@galacean/engine-world-planning/world/SeedWorldPhotoPalette";
import { SeedWorldPhotoInputTrace } from "./SeedWorldPhotoInputTrace.ts";
import {
  Color,
  Keys,
  PointerButton,
  PointerPhase,
  UnlitMaterial,
  type ModelMesh,
  type Pointer,
  type PointerEventData
} from "@galacean/engine";
import type { PhotoImage } from "@galacean/engine-world-planning/world/SeedWorldPhotoImage";
import { SeedWorldAnnotationHistory } from "./SeedWorldAnnotationHistory.ts";
import { SEED_WORLD_PHOTO_CONFIG as config } from "@galacean/engine-world-planning/world/SeedWorldPhotoConfig";
import { createViewAnnotation, type ViewPoint } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot";
import { PhotoGraphics, PhotoSurface, PAPER_HEIGHT } from "@galacean/engine-world-planning/world/SeedWorldPhotoGraphics";
import type { SeedWorldInstantCamera } from "./SeedWorldInstantCamera.ts";

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
  private brushColor = DEFAULT_PHOTO_INK;
  private outsideTap?: { pointer: number; x: number; y: number; moved: boolean };
  private discarding?: { entry: Entry; controller: AbortController };
  private pointers = new Set<number>();
  private editing?: { entry: Entry; history: SeedWorldAnnotationHistory; existing: boolean };
  private mode: "idle" | "busy" | "editing" = "idle";
  private shade = 0;
  private statusUntil = 0;
  private disposed = false;
  private restoreLayer?: () => void;
  private focused = 4;
  private readonly originalLabel: string | null;
  private readonly originalTabIndex: number;
  get size(): number {
    return this.entries.size;
  }
  get active(): boolean {
    return this.mode !== "idle" || !!this.drag;
  }
  get phase(): string {
    return this.graphics.canvas.dataset.photoPhase ?? "idle";
  }
  constructor(
    private readonly camera: SeedWorldInstantCamera,
    private readonly actions: {
      edit: (photo: PhotoDocument) => void;
      remove: (id: string) => void;
      apply: () => void;
      cancel: () => void;
      freeze: (frozen: boolean) => void;
      retain: (id: string) => () => void;
    },
    budget?: ImageResourceBudget
  ) {
    this.originalLabel = camera.canvas.getAttribute("aria-label");
    this.originalTabIndex = camera.canvas.tabIndex;
    camera.canvas.tabIndex = 0;
    this.graphics = new PhotoGraphics(camera.engine, camera.canvas, camera.worldCamera, (dt) => this.tick(dt), budget);
    this.trace = new SeedWorldPhotoInputTrace(() => this.traceState());
    const signal = this.abort.signal;
    this.input = new SeedWorldPhotoInput(this.graphics.scene, (phase, event) => this.pointer(phase, event));
    const rect = camera.canvas.getBoundingClientRect();
    this.input.resize(rect.width, rect.height);
    // Browser default actions must be prevented synchronously. Commands themselves use InputManager.
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          this.active &&
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
        const rect = camera.canvas.getBoundingClientRect();
        this.input.resize(rect.width, rect.height);
        this.layout();
        if (this.editing && this.mode === "editing") this.editing.entry.pose = this.editPose(this.editing.entry.photo);
      },
      { signal }
    );
    this.setPhase("idle");
  }
  setPhase(phase: string): void {
    this.input.setModal(this.mode !== "idle");
    if (this.mode !== "editing") this.graphics.palette.isActive = false;
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
    const host = this.camera.canvas.closest("main") ?? this.camera.canvas;
    const oldPosition = host.style.position,
      oldZ = host.style.zIndex;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.style.zIndex = "2147483646";
    this.restoreLayer = () => {
      host.style.position = oldPosition;
      host.style.zIndex = oldZ;
    };
  }
  editRect(photo: PhotoDocument): DOMRect {
    const p = this.editPose(photo),
      r = this.camera.canvas.getBoundingClientRect();
    return new DOMRect(r.left + p.x - p.width / 2, r.top + p.y - p.height / 2, p.width, p.height);
  }
  private editPose(photo: PhotoDocument): Pose {
    const r = this.camera.canvas.getBoundingClientRect(),
      ratio = ((photo.image.height / photo.image.width) * 0.875 * PAPER_HEIGHT) / 0.903223;
    const area = photoDetailLayout(r.width, r.height).photo;
    const width = Math.min(area.width, area.height / ratio);
    return {
      x: area.x + area.width / 2,
      y: area.y + area.height / 2,
      width,
      height: width * ratio,
      angle: 0,
      z: 220,
      depth: width * 0.12
    };
  }
  async open(
    photo: PhotoDocument,
    signal: AbortSignal,
    print?: (target: () => DOMRect) => Promise<void>
  ): Promise<void> {
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
      surface.caption.text = "SEED WORLD · " + photo.capturedAt.toLocaleDateString("en-GB");
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
        release: this.actions.retain(photo.snapshotId)
      };
      this.entries.set(photo.snapshotId, entry);
      this.layout();
    }
    entry.opacityTarget = 1;
    this.editing = { entry, history: photo.history.clone(), existing };
    entry.surface.paint(this.editing.history.annotations);
    this.mode = "busy";
    if (print) {
      await print(() => this.editRect(photo));
      signal.throwIfAborted();
      entry.pose = this.editPose(photo);
      entry.visible = true;
      this.shade = config.backdropOpacity;
      this.render(entry);
      this.camera.hide();
    } else {
      const from = { ...entry.pose };
      entry.visible = true;
      entry.liftTarget = 1;
      this.setPhase("reopen");
      await this.animate(320, signal, (t) => {
        const e = 1 - (1 - t) ** 3;
        entry!.pose = interpolate(from, this.editPose(photo), e);
        this.shade = config.backdropOpacity * e;
      });
    }
    this.mode = "editing";
    entry.opacity = entry.opacityTarget = 1;
    this.render(entry);
    this.focused = 4;
    this.setPhase("editing");
    this.graphics.toolbar.isActive = true;
    this.graphics.status.text = "";
    this.camera.canvas.focus();
    this.refreshToolbar();
  }
  async confirm(signal: AbortSignal): Promise<PhotoDocument> {
    const editing = this.editing!;
    this.cancelDrawing();
    this.mode = "busy";
    this.graphics.toolbar.isActive = false;
    const { entry, history } = editing;
    const updated = { ...entry.photo, history };
    signal.throwIfAborted();
    const from = { ...entry.pose };
    this.setPhase("return");
    await this.animate(440, signal, (t) => {
      const e = 1 - (1 - t) ** 3;
      entry.pose = interpolate(from, entry.target, e);
      this.shade = config.backdropOpacity * (1 - e);
    });
    signal.throwIfAborted();
    return updated;
  }
  commit(photo: PhotoDocument): void {
    const entry = this.entries.get(photo.snapshotId)!;
    entry.photo = photo;
    entry.pose = { ...entry.target };
    entry.liftTarget = 0;
    this.editing = undefined;
    this.finish();
  }
  recover(message: string): void {
    if (!this.editing) return;
    this.editing.entry.pose = this.editPose(this.editing.entry.photo);
    this.shade = config.backdropOpacity;
    this.mode = "editing";
    this.graphics.toolbar.isActive = true;
    this.setPhase("editing");
    this.refreshToolbar();
    this.notify(message);
  }
  cancel(): void {
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
      if (editing.existing) {
        editing.entry.surface.paint(editing.entry.photo.history.annotations);
        editing.entry.pose = { ...editing.entry.target };
        editing.entry.liftTarget = 0;
      } else this.remove(editing.entry.photo.snapshotId);
    }
    this.finish();
  }
  private finish(): void {
    this.mode = "idle";
    this.pointers.clear();
    this.shade = 0;
    this.graphics.toolbar.isActive = false;
    this.graphics.status.text = "";
    this.restoreLayer?.();
    this.restoreLayer = undefined;
    if (this.originalLabel === null) this.camera.canvas.removeAttribute("aria-label");
    else this.camera.canvas.setAttribute("aria-label", this.originalLabel);
    this.setPhase("idle");
    this.layout();
    this.freeze(false);
  }
  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.surface.dispose();
    entry.release();
    this.input.remove(id);
    this.entries.delete(id);
    this.layout();
  }
  private layout(followAnchor = false): void {
    const rect = this.camera.canvas.getBoundingClientRect(),
      x = this.anchor.x - rect.left,
      top = this.anchor.top - rect.top;
    const included = [...this.entries.values()].filter(
      (e) => e !== this.discarding?.entry && !(this.drag?.remove && this.drag.id === e.photo.snapshotId)
    );
    const gap = 14,
      width = Math.max(16, Math.min(144, (rect.width - 48 - gap * (this.size - 1)) / Math.max(1, this.size)));
    const widths = included.map((e) =>
      Math.min(
        width,
        Math.max(40, top - 64) / (((e.photo.image.height / e.photo.image.width) * 0.875 * PAPER_HEIGHT) / 0.903223)
      )
    );
    let left = x - (widths.reduce((a, b) => a + b, 0) + Math.max(0, included.length - 1) * gap) / 2;
    included.forEach((entry, i) => {
      const w = widths[i],
        height = (((w * entry.photo.image.height) / entry.photo.image.width) * 0.875 * PAPER_HEIGHT) / 0.903223;
      const previousTarget = entry.target;
      entry.target = {
        x: left + w / 2,
        y: top - 18 - height / 2,
        width: w,
        height,
        angle: entry.photo.angle,
        z: 20,
        depth: w * 0.12
      };
      if (followAnchor && entry !== this.editing?.entry && entry.photo.snapshotId !== this.drag?.id) {
        // Carry only the anchor delta. Preserve any in-progress reflow/snap-back offset.
        // A held photo keeps its pointer-down pose; only its eventual return target moves.
        const pose = entry.pose, target = entry.target;
        pose.x += target.x - previousTarget.x;
        pose.y += target.y - previousTarget.y;
        pose.width += target.width - previousTarget.width;
        pose.height += target.height - previousTarget.height;
        pose.depth += target.depth - previousTarget.depth;
        // HUD publishes in LateUpdate, after the workspace tick: update render and hit poses now.
        this.render(entry);
      }
      left += w + gap;
    });
  }
  private freeze(value: boolean): void {
    if (value) {
      this.thawAfterFrame = undefined;
      this.actions.freeze(true);
    } else if (this.handlingInput) {
      // EndDrag runs before scene updates. Keep world controls disabled through the release frame.
      this.thawAfterFrame = this.camera.engine.time.frameCount + 1;
    } else {
      this.thawAfterFrame = undefined;
      this.actions.freeze(false);
    }
  }
  private tick(dt: number): void {
    if (this.disposed) return;
    if (this.thawAfterFrame !== undefined && this.camera.engine.time.frameCount >= this.thawAfterFrame) {
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
      const t = Math.min(1, (now - motion.start) / motion.duration);
      try {
        motion.update(t);
        if (t === 1) motion.finish();
      } catch {
        motion.cancel();
      }
    }
    const t = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 18);
    for (const entry of this.entries.values()) {
      if (entry !== this.editing?.entry && entry !== this.discarding?.entry && entry.photo.snapshotId !== this.drag?.id)
        entry.pose = interpolate(entry.pose, entry.target, t);
      entry.lift = mix(entry.lift, entry.liftTarget, t);
      if (entry !== this.discarding?.entry) {
        entry.opacity = mix(entry.opacity, entry.opacityTarget, t);
        if (Math.abs(entry.opacity - entry.opacityTarget) < 0.001) entry.opacity = entry.opacityTarget;
      }
      this.render(entry);
    }
    const backdrop = this.graphics.backdrop;
    backdrop.entity.isActive = this.shade > 0.001;
    (backdrop.getMaterial() as UnlitMaterial).baseColor.a = this.shade;
    if (this.statusUntil && now > this.statusUntil) {
      this.statusUntil = 0;
      this.graphics.status.text = "";
    }
    this.graphics.camera.enabled = this.size > 0 || this.mode !== "idle" || !!this.graphics.status.text;
    if (this.editing && this.trace.enabled)
      this.trace.sample("frame", {
        dt,
        cameraEnabled: this.graphics.camera.enabled,
        sceneActive: this.graphics.scene.isActive,
        rootActive: this.editing.entry.surface.root.isActiveInHierarchy,
        inkActive: this.editing.entry.surface.ink.entity.isActiveInHierarchy,
        vertices: (this.editing.entry.surface.ink.mesh as ModelMesh | null)?.vertexCount
      });
  }
  private render(entry: Entry): void {
    const { surface, pose: p, lift } = entry;
    surface.setOpacity(entry.opacity);
    surface.root.isActive = entry.visible && (this.anchor.visible || entry === this.editing?.entry);
    this.input.setPhoto(entry.photo.snapshotId, p, surface.root.isActive);
    surface.root.transform.setPosition(p.x, -p.y, p.z);
    surface.root.transform.setRotation(0, 0, -p.angle);
    surface.root.transform.setScale(p.width, p.height / PAPER_HEIGHT, p.depth);
    surface.caption.entity.transform.setScale(0.1, (0.1 * p.width) / (p.height / PAPER_HEIGHT), 0.1);
    // The pin's tip is anchored to the top paper border. Pull along +Z, then lift away in Y.
    const angle = (p.angle * Math.PI) / 180,
      offset = -p.height * 0.45;
    const x = p.x - Math.sin(angle) * offset,
      y = p.y + Math.cos(angle) * offset;
    const size = Math.min(42, Math.max(24, p.width * 0.24));
    surface.pin.isActive = surface.root.isActive && lift < 0.995;
    const travel = Math.max(0, (lift - 0.25) / 0.75);
    surface.pin.transform.setPosition(x + lift * 18, -y + (y + size) * travel, p.z - 18 + Math.min(1, lift * 4) * 100);
    surface.pin.transform.setRotation(-lift * 24, lift * 25, -p.angle + lift * 12);
    surface.pin.transform.setScale(size, size, size);
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
        start: performance.now(),
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
    const r = this.camera.canvas.getBoundingClientRect();
    return {
      x: (pointer.position.x * r.width) / this.camera.canvas.width,
      y: (pointer.position.y * r.height) / this.camera.canvas.height
    };
  }
  private hit(p: ViewPoint): Entry | undefined {
    return [...this.entries.values()].reverse().find((entry) => {
      if (!entry.visible || !this.anchor.visible) return false;
      const q = this.localPaper(entry, p);
      return Math.abs(q.x) <= 0.5 && Math.abs(q.y) <= PAPER_HEIGHT / 2;
    });
  }
  private localPaper(entry: Entry, p: ViewPoint): ViewPoint {
    const a = (entry.pose.angle * Math.PI) / 180,
      dx = p.x - entry.pose.x,
      dy = p.y - entry.pose.y;
    return {
      x: (dx * Math.cos(a) + dy * Math.sin(a)) / entry.pose.width,
      y: -(-dx * Math.sin(a) + dy * Math.cos(a)) / (entry.pose.height / PAPER_HEIGHT)
    };
  }
  private imagePoint(p: ViewPoint): ViewPoint | undefined {
    const entry = this.editing!.entry,
      q = this.localPaper(entry, p);
    return entry.surface.imagePoint(q.x, q.y);
  }
  private traceState(): Record<string, unknown> {
    const entry = this.editing?.entry,
      rect = this.camera.canvas.getBoundingClientRect();
    return {
      mode: this.mode,
      phase: this.camera.canvas.dataset.photoPhase,
      pointers: [...this.pointers],
      snapshotId: entry?.photo.snapshotId,
      drawing: this.drawing
        ? { pointer: this.drawing.pointer, points: this.drawing.points.length, last: this.drawing.points.at(-1) }
        : null,
      strokes: this.editing?.history.annotations.length,
      brushColor: this.brushColor,
      paletteOpen: this.graphics.palette.isActive,
      pose: entry ? { ...entry.pose } : null,
      canvas: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        bufferWidth: this.camera.canvas.width,
        bufferHeight: this.camera.canvas.height
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
        const rect = this.camera.canvas.getBoundingClientRect();
        const { toolbar: t, palette, scale: uiScale } = photoDetailLayout(rect.width, rect.height);
        if (p.y >= t.y && p.y <= t.y + t.height && p.x >= t.x && p.x <= t.x + t.width) {
          const index = Math.max(0, Math.min(4, Math.floor(((p.y - t.y) / uiScale - PHOTO_TOOLBAR.padding) / PHOTO_TOOLBAR.step)));
          this.trace.record("toolbar-hit", { index, pointerId: event.id });
          this.tool(index);
          return;
        }
        if (
          this.graphics.palette.isActive &&
          p.x >= palette.x &&
          p.x <= palette.x + palette.width &&
          p.y >= palette.y &&
          p.y <= palette.y + palette.height
        ) {
          const col = Math.floor(((p.x - palette.x) / uiScale - PHOTO_PALETTE.padding) / PHOTO_PALETTE.cell);
          const row = Math.floor(((p.y - palette.y) / uiScale - PHOTO_PALETTE.padding) / PHOTO_PALETTE.cell);
          if (col >= 0 && col < PHOTO_PALETTE.columns && row >= 0 && row < PHOTO_PALETTE.rows) {
            this.brushColor = PHOTO_INK_COLORS[row * PHOTO_PALETTE.columns + col];
            this.graphics.setInkColor(this.brushColor);
            this.graphics.palette.isActive = false;
            this.trace.record("ink-color", { color: this.brushColor });
          }
          return;
        }
        this.graphics.palette.isActive = false;
        const point = this.imagePoint(p);
        if (!point) {
          const q = this.localPaper(this.editing!.entry, p);
          if (Math.abs(q.x) > 0.5 || Math.abs(q.y) > PAPER_HEIGHT / 2)
            this.outsideTap = { pointer: event.id, x: p.x, y: p.y, moved: false };
          return;
        }
        this.trace.record("stroke-start", {
          imagePoint: point,
          ...{ pointerId: event.id, enginePhase: event.phase, button: event.button }
        });
        const scale = this.editing!.entry.photo.image.width / (this.editing!.entry.pose.width * 0.875);
        this.drawing = { pointer: event.id, points: [point], scale, color: this.brushColor };
        this.paint();
      } else if (isUp || cancel) {
        const outside = this.outsideTap;
        if (outside?.pointer === event.id) {
          this.outsideTap = undefined;
          if (isUp && !outside.moved && Math.hypot(p.x - outside.x, p.y - outside.y) <= config.tapSlop)
            this.actions.apply();
          return;
        }
        if (this.drawing?.pointer !== event.id) return;
        if (isUp) {
          const point = this.imagePoint(p);
          if (point) this.drawing.points.push(point);
          try {
            this.editing!.history.add(
              createViewAnnotation(this.drawing.points, this.drawing.scale, this.drawing.color)
            );
          } catch (error) {
            this.trace.record("history-error", { error: String(error) });
            this.notify(String(error));
          }
        }
        this.trace.record(isUp ? "stroke-committed" : "stroke-cancelled", {
          type,
          pointCount: this.drawing.points.length
        });
        this.cancelDrawing(type);
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
          this.paint();
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
          void this.discard(entry, p.x - drag.x, p.y - drag.y);
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
    if (this.drawing) this.trace.record("drawing-ended", { reason, pointCount: this.drawing.points.length });
    this.drawing = undefined;
    if (this.editing) this.paint();
  }
  private paint(): void {
    const { entry, history } = this.editing!;
    const started = this.trace.enabled ? performance.now() : 0;
    try {
      entry.surface.paint([
        ...history.annotations,
        ...(this.drawing ? [createViewAnnotation(this.drawing.points, this.drawing.scale, this.drawing.color)] : [])
      ]);
      if (this.trace.enabled)
        this.trace.sample("paint", {
          elapsedMs: performance.now() - started,
          vertices: (entry.surface.ink.mesh as ModelMesh | null)?.vertexCount,
          rootActive: entry.surface.root.isActiveInHierarchy,
          inkActive: entry.surface.ink.entity.isActiveInHierarchy,
          cameraEnabled: this.graphics.camera.enabled,
          inkWorldMatrix: Array.from(entry.surface.ink.entity.transform.worldMatrix.elements)
        });
    } catch (error) {
      this.trace.record("paint-error", { error: String(error instanceof Error ? error.stack : error) });
      throw error;
    }
    this.refreshToolbar();
  }
  private refreshToolbar(): void {
    const history = this.editing?.history;
    this.graphics.icons.forEach((icon, i) => {
      const enabled = i === 1 ? history?.canUndo : i === 2 ? history?.canRedo : true;
      (icon.getMaterial() as UnlitMaterial).baseColor = new Color(
        1, 1, 1, enabled ? 1 : 0.45
      );
    });
    this.camera.canvas.setAttribute(
      "aria-label",
      `照片标记：丢弃照片、撤销、重做、画笔颜色、确认。${history?.annotations.length ?? 0} 笔。Enter 操作当前按钮，Escape 关闭调色板或收起照片，Ctrl Z 撤销笔迹。`
    );
  }
  private async discard(entry: Entry, dx = 1, dy = 1): Promise<void> {
    if (this.discarding) return;
    this.cancelDrawing();
    // Delete the attachment immediately; the remaining geometry is only the exit animation.
    this.actions.remove(entry.photo.snapshotId);
    this.editing = undefined;
    this.drag = undefined;
    const controller = new AbortController();
    this.discarding = { entry, controller };
    this.mode = "busy";
    this.freeze(true);
    this.graphics.toolbar.isActive = false;
    this.graphics.status.text = "";
    entry.liftTarget = 1;
    this.setPhase("discard");
    this.layout();
    const from = { ...entry.pose },
      opacity = entry.opacity,
      shade = this.shade;
    const rect = this.camera.canvas.getBoundingClientRect();
    const length = Math.max(1, Math.hypot(dx, dy));
    const travel = Math.max(rect.width, rect.height) * 0.9;
    const to = {
      ...from,
      x: from.x + (dx / length) * travel,
      y: from.y + (dy / length) * travel,
      width: from.width * 0.35,
      height: from.height * 0.35,
      depth: from.depth * 0.35,
      angle: from.angle + (dx < 0 ? -38 : 38),
      z: 260
    };
    try {
      await this.animate(config.discardDuration, controller.signal, (t) => {
        entry.pose = interpolate(from, to, t * t);
        entry.pose.y -= Math.sin(t * Math.PI) * Math.min(100, rect.height * 0.12);
        entry.opacity = opacity * (1 - t) ** 1.5;
        this.shade = shade * (1 - t);
        this.render(entry);
      });
    } catch (error) {
      if (!controller.signal.aborted && !this.disposed) this.notify(String(error));
    } finally {
      if (this.discarding?.entry === entry) {
        this.discarding = undefined;
        this.remove(entry.photo.snapshotId);
        if (!this.disposed) this.actions.cancel();
      }
    }
  }
  private tool(index: number): void {
    this.cancelDrawing();
    if (index === 0) {
      const editing = this.editing;
      if (!editing) return;
      void this.discard(editing.entry);
    } else if (index === 4) this.actions.apply();
    else if (index === 3) this.graphics.palette.isActive = !this.graphics.palette.isActive;
    else {
      if (index === 1) this.editing?.history.undo();
      else this.editing?.history.redo();
      this.paint();
    }
  }
  private key(): void {
    if (!this.active) return;
    const input = this.camera.engine.inputManager;
    // A quick shortcut can press and release its modifier within one Engine frame.
    const pressed = (key: Keys) => input.isKeyHeldDown(key) || input.isKeyDown(key);
    const shift = pressed(Keys.ShiftLeft) || pressed(Keys.ShiftRight);
    const command =
      pressed(Keys.ControlLeft) || pressed(Keys.ControlRight) || pressed(Keys.MetaLeft) || pressed(Keys.MetaRight);
    if (input.isKeyDown(Keys.Escape)) {
      if (this.drawing) this.cancelDrawing("escape");
      else if (this.drag) this.cancelDrag();
      else if (this.graphics.palette.isActive) this.graphics.palette.isActive = false;
      else if (this.mode === "editing") this.actions.apply();
      else if (this.phase !== "return" && this.phase !== "discard") this.actions.cancel();
      return;
    }
    if (this.mode !== "editing") return;
    if (command && input.isKeyDown(Keys.KeyZ)) this.tool(shift ? 2 : 1);
    else if (input.isKeyDown(Keys.Enter)) this.tool(this.focused);
    else if (input.isKeyDown(Keys.Tab)) {
      this.focused = (this.focused + (shift ? 4 : 1)) % 5;
      this.notify(["丢弃当前照片及附件", "撤销上一笔", "重做上一笔", "选择画笔颜色", "确认并附加截图"][this.focused]);
    }
  }
  dispose(): void {
    this.disposed = true;
    this.discarding?.controller.abort();
    this.discarding = undefined;
    this.thawAfterFrame = undefined;
    this.actions.freeze(false);
    this.camera.canvas.tabIndex = this.originalTabIndex;
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
