import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const surfaces = new Map<string, FakeSurface>();
  class FakeSurface {
    readonly root = {
      isActive: false,
      isActiveInHierarchy: false,
      transform: { setPosition() {}, setRotation() {}, setScale() {} }
    };
    hasUserMarks = false;
    layoutWidth = 100;
    layoutHeight = 100;
    frameRadius = 0;
    opacity = 1;
    closeOpacity = 0;
    disposed = false;
    disposeCount = 0;
    constructor(public readonly id: string, public readonly image: { width: number; height: number }) {
      surfaces.set(id, this);
    }
    setFrameLayout(width: number, height: number, radius = 0) {
      this.layoutWidth = Math.max(2, width);
      this.layoutHeight = Math.max(2, height);
      this.frameRadius = radius;
    }
    setRimOpacity() {}
    setCloseOpacity(v: number) {
      this.closeOpacity = v;
    }
    isCloseButtonHit(localX: number, localY: number) {
      if (this.closeOpacity < 0.25) return false;
      const cx = -this.layoutWidth * 0.5 + 14 + 17;
      const cy = this.layoutHeight * 0.5 - 14 - 17;
      return Math.hypot(localX - cx, localY - cy) <= 26;
    }
    setHintLoop() {}
    setBrushTime() {}
    setOpacity(v: number) {
      this.opacity = v;
    }
    imagePoint(localX: number, localY: number) {
      if (Math.abs(localX) > this.layoutWidth * 0.5 || Math.abs(localY) > this.layoutHeight * 0.5) return undefined;
      return {
        x: (localX / this.layoutWidth + 0.5) * this.image.width,
        y: (0.5 - localY / this.layoutHeight) * this.image.height
      };
    }
    paintCalls = 0;
    throwOnPaint: Error | null = null;
    paint(marks: readonly unknown[]) {
      this.paintCalls++;
      if (this.throwOnPaint) throw this.throwOnPaint;
      this.hasUserMarks = marks.length > 0;
    }
    dispose() {
      this.disposed = true;
      this.disposeCount++;
    }
  }
  return { surfaces, FakeSurface };
});

vi.mock("@galacean/engine", () => ({
  Keys: { Escape: 27 },
  PointerButton: { Primary: 0 },
  PointerPhase: { Down: 0, Move: 1, Up: 2, Leave: 3 },
  UnlitMaterial: class {}
}));

vi.mock("@galacean/engine-world-planning/world/SeedWorldPhotoGraphics", () => {
  class PhotoGraphics {
    readonly scene = { isActive: true };
    readonly camera = { enabled: false };
    readonly backdrop = { entity: { isActive: false }, getMaterial: () => ({ baseColor: { a: 0 } }) };
    readonly status = { text: "" };
    warmingUp = false;
    shutterCalls = 0;
    constructor(
      public readonly engine: any,
      public readonly canvas: HTMLCanvasElement
    ) {}
    async prepare() {}
    resize() {}
    playShutter() {
      this.shutterCalls++;
    }
    async create(image: { width: number; height: number; __id?: string }) {
      return new mocks.FakeSurface(image.__id ?? `img-${mocks.surfaces.size}`, image);
    }
    dispose() {}
  }
  return { PhotoGraphics, PhotoSurface: mocks.FakeSurface };
});

vi.mock("../../demos/seed-world/src/SeedWorldPhotoInput.ts", () => ({
  SeedWorldPhotoInput: class {
    constructor(_scene: any, public readonly onPointer: (phase: string, event: any) => void) {}
    resize() {}
    setModal() {}
    setPhoto() {}
    remove() {}
    dispose() {}
  }
}));

vi.mock("../../demos/seed-world/src/SeedWorldPhotoInputTrace.ts", () => ({
  SeedWorldPhotoInputTrace: class {
    get enabled() {
      return false;
    }
    record() {}
    sample() {}
    dispose() {}
  }
}));

import { SeedWorldAnnotationHistory } from "../../demos/seed-world/src/SeedWorldAnnotationHistory.ts";
import { SeedWorldLassoPanel } from "../../demos/seed-world/src/SeedWorldLassoPanel.ts";
import { SeedWorldPhotoWorkspace, type PhotoDocument } from "../../demos/seed-world/src/SeedWorldPhotoWorkspace.ts";
import { resolveSeedWorldVoiceOrbLayout } from "../../demos/seed-world/src/SeedWorldHudLayout.ts";

function installDomGlobals(reducedMotion = false) {
  const listeners = new Map<string, Set<EventListener>>();
  const add = (type: string, fn: EventListener) => {
    let set = listeners.get(type);
    if (!set) listeners.set(type, (set = new Set()));
    set.add(fn);
  };
  const remove = (type: string, fn: EventListener) => listeners.get(type)?.delete(fn);
  const canvas: any = {
    width: 1280,
    height: 800,
    tabIndex: -1,
    dataset: {},
    style: { position: "", zIndex: "" },
    attributes: new Map<string, string>(),
    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    },
    setAttribute(name: string, val: string) {
      this.attributes.set(name, val);
    },
    removeAttribute(name: string) {
      this.attributes.delete(name);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
    closest: () => null,
    focus() {}
  };
  const dispatch = (event: Event) => {
    for (const fn of [...(listeners.get(event.type) ?? [])]) {
      fn(event);
    }
    return true;
  };
  vi.stubGlobal("innerWidth", 1280);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("window", { addEventListener: add, removeEventListener: remove, dispatchEvent: dispatch });
  vi.stubGlobal("document", {
    addEventListener: add,
    removeEventListener: remove,
    dispatchEvent: dispatch,
    createElement: () => ({
      type: "",
      id: "",
      title: "",
      hidden: false,
      disabled: false,
      onclick: null as (() => void) | null,
      setAttribute() {},
      remove() {}
    }),
    activeElement: null,
    hasFocus: () => true,
    visibilityState: "visible"
  });
  vi.stubGlobal("getComputedStyle", () => ({ position: "relative" }));
  vi.stubGlobal("matchMedia", () => ({ matches: reducedMotion }));
  vi.stubGlobal("localStorage", {
    getItem: () => "1",
    setItem() {}
  });
  return { canvas };
}

function makeDoc(id: string, width = 768, height = 480): PhotoDocument {
  return {
    snapshotId: id,
    image: {
      __id: id,
      texture: {} as any,
      width,
      height,
      export: async () => {
        throw new Error("unused");
      },
      dispose() {}
    } as any,
    history: new SeedWorldAnnotationHistory(),
    capturedAt: new Date(),
    angle: 0
  };
}

function createWorkspace(options: { reducedMotion?: boolean; updateAttachment?: (id: string, marks: any) => void } = {}) {
  const { canvas } = installDomGlobals(options.reducedMotion ?? false);
  const released: string[] = [];
  const removed: string[] = [];
  const freezeCalls: boolean[] = [];
  let frameCount = 0;
  const host: any = {
    canvas,
    worldCamera: {},
    engine: {
      time: {
        get frameCount() {
          return frameCount;
        }
      },
      inputManager: { isKeyDown: () => false }
    }
  };
  const ws = new SeedWorldPhotoWorkspace(host, {
    edit() {},
    remove(id) {
      removed.push(id);
    },
    updateAttachment: options.updateAttachment ?? (() => {}),
    apply() {},
    minimize() {},
    cancel() {
      ws.cancel();
    },
    freeze(frozen) {
      freezeCalls.push(frozen);
    },
    retain(id) {
      return () => released.push(id);
    }
  });
  const advanceMs = (ms: number, nowRef: { now: number }) => {
    const steps = Math.max(1, Math.ceil(ms / 16));
    const stepMs = ms / steps;
    for (let i = 0; i < steps; i++) {
      nowRef.now += stepMs;
      frameCount++;
      (ws as any).tick(stepMs / 1000);
    }
  };
  return { ws, canvas, released, removed, freezeCalls, advanceMs };
}

describe("SeedWorldPhotoWorkspace multi-photo lifecycle and reentrancy", () => {
  beforeEach(() => {
    mocks.surfaces.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("traces the surface's user marks during paint and on subsequent frames", async () => {
    const { ws } = createWorkspace({ reducedMotion: true });
    const trace = ws["trace"];
    vi.spyOn(trace, "sample");
    vi.spyOn(trace, "enabled", "get").mockReturnValue(true);
    try {
      await ws.open(makeDoc("trace"), new AbortController().signal);
      ws["tick"](1 / 60);
      expect(trace.sample).toHaveBeenCalledWith("frame", expect.objectContaining({ hasUserMarks: false }));

      const { x, y } = ws["editing"]!.entry.pose;
      const pointer = { id: 1, button: 0, position: { x, y } };
      ws["handlePointer"]("begin", { ...pointer, phase: 0 } as any);
      ws["handlePointer"]("end", { ...pointer, phase: 2 } as any);
      expect(trace.sample).toHaveBeenCalledWith("paint", expect.objectContaining({ hasUserMarks: true }));
      ws["tick"](1 / 60);
      expect(trace.sample).toHaveBeenLastCalledWith("frame", expect.objectContaining({ hasUserMarks: true }));
    } finally {
      ws.dispose();
    }
  });

  it("flushes prior fading batch on overlapping submission completions without leaking entries, pins, or camera", async () => {
    const nowRef = { now: 1000 };
    vi.spyOn(performance, "now").mockImplementation(() => nowRef.now);
    const { ws, released, removed, advanceMs } = createWorkspace({ reducedMotion: false });

    for (const id of ["photo-A", "photo-B"]) {
      const opening = ws.open(makeDoc(id), new AbortController().signal);
      await Promise.resolve();
      advanceMs(520, nowRef);
      await opening;
      const dismissing = ws.dismissSubmitted(new AbortController().signal);
      advanceMs(420, nowRef);
      await dismissing;
    }

    ws.clearSubmittedCards(["photo-A"]);
    expect(removed).toEqual(["photo-A"]);
    advanceMs(48, nowRef);
    ws.clearSubmittedCards(["photo-B"]);
    advanceMs(320, nowRef);
    await Promise.resolve();
    advanceMs(32, nowRef);

    expect((ws as any).entries.size).toBe(0);
    expect((ws as any).clearingIds.size).toBe(0);
    expect(ws.size).toBe(0);
    expect(mocks.surfaces.get("photo-A")?.disposeCount).toBe(1);
    expect(mocks.surfaces.get("photo-B")?.disposeCount).toBe(1);
    expect(released.sort()).toEqual(["photo-A", "photo-B"]);
    expect(removed).toContain("photo-A");
    expect(removed).toContain("photo-B");
    expect(ws.graphics.camera.enabled).toBe(false);

    ws.dispose();
  });

  it("rescues a card reopened while clearing without disposing it after the old fade window elapses", async () => {
    const nowRef = { now: 1000 };
    vi.spyOn(performance, "now").mockImplementation(() => nowRef.now);
    const { ws, released, advanceMs } = createWorkspace({ reducedMotion: false });

    const docA = makeDoc("photo-A");
    const docB = makeDoc("photo-B");
    for (const doc of [docA, docB]) {
      const pOpen = ws.open(doc, new AbortController().signal);
      await Promise.resolve();
      advanceMs(520, nowRef);
      await pOpen;
      const pDismiss = ws.dismissSubmitted(new AbortController().signal);
      advanceMs(420, nowRef);
      await pDismiss;
    }

    ws.clearSubmittedCards(["photo-A", "photo-B"]);
    advanceMs(60, nowRef);

    // Reopen photo-A mid-fade; photo-B should be flushed cleanly while photo-A remains live and editable.
    const reopenA = ws.open(docA, new AbortController().signal);
    await Promise.resolve();
    advanceMs(450, nowRef);
    await reopenA;
    advanceMs(350, nowRef);
    await Promise.resolve();

    expect((ws as any).entries.has("photo-A")).toBe(true);
    expect((ws as any).entries.has("photo-B")).toBe(false);
    expect(mocks.surfaces.get("photo-A")?.disposeCount).toBe(0);
    expect(mocks.surfaces.get("photo-B")?.disposeCount).toBe(1);
    expect(released).toEqual(["photo-B"]);
    ws.dispose();
  });

  it("docks 3+ photos cleanly within wide-layout orb clearance and deletes only the active photo via top-left close button", async () => {
    const nowRef = { now: 1000 };
    vi.spyOn(performance, "now").mockImplementation(() => nowRef.now);
    const { ws, released, advanceMs } = createWorkspace({ reducedMotion: true });

    const docs = [makeDoc("p1"), makeDoc("p2"), makeDoc("p3"), makeDoc("p4")];
    for (const doc of docs) {
      await ws.open(doc, new AbortController().signal);
      await ws.dismissSubmitted(new AbortController().signal);
    }

    expect(ws.size).toBe(4);
    const orb = resolveSeedWorldVoiceOrbLayout(1280, 800);
    const targets = docs.map((d) => (ws as any).entries.get(d.snapshotId).target);
    // All 4 docked cards must be ordered left-to-right, non-overlapping, and clear of the expanded Voice Orb reserve.
    for (let i = 0; i < targets.length; i++) {
      expect(targets[i].x - targets[i].width * 0.5).toBeGreaterThanOrEqual(orb.orbReservedRightPx - 0.5);
      expect(targets[i].x + targets[i].width * 0.5).toBeLessThanOrEqual(1280 - orb.orbReservedRightPx + 0.5);
      if (i > 0) {
        expect(targets[i].x - targets[i].width * 0.5).toBeGreaterThan(targets[i - 1].x + targets[i - 1].width * 0.5);
      }
    }

    // Reopen p3 (3rd photo) and tap its top-left close button to delete it; p1, p2, p4 must remain intact.
    await ws.open(docs[2], new AbortController().signal);
    const p3Entry = (ws as any).entries.get("p3");
    const closeScreenX = p3Entry.pose.x - p3Entry.pose.width * 0.5 + 31;
    const closeScreenY = p3Entry.pose.y - p3Entry.pose.height * 0.5 + 31;
    (ws as any).handlePointer("begin", { id: 1, phase: 0, button: 0, position: { x: closeScreenX, y: closeScreenY } });
    (ws as any).handlePointer("end", { id: 1, phase: 2, button: 0, position: { x: closeScreenX, y: closeScreenY } });
    await Promise.resolve();
    advanceMs(320, nowRef);
    await Promise.resolve();

    expect(ws.size).toBe(3);
    expect([...(ws as any).entries.keys()]).toEqual(["p1", "p2", "p4"]);
    expect(released).toEqual(["p3"]);
    expect(mocks.surfaces.get("p3")?.disposeCount).toBe(1);
    ws.dispose();
  });

  it.each([
    [0, "本笔过长，未保存。请缩短笔画后重试。"],
    [1, "本笔未保存，请缩短笔画后重试。\n也可以发送当前照片，或重拍。"],
    [64, "已达 64 笔，本笔未保存。\n请先发送当前照片，或重拍。"]
  ] as const)("preserves %i prior strokes and offers an available action when a limit is reached", async (count, message) => {
    let callCount = 0;
    const { ws } = createWorkspace({
      reducedMotion: true,
      updateAttachment: () => {
        callCount++;
        if (callCount > 1) {
          toAgentValue("x".repeat(65536));
        }
      }
    });
    const doc = makeDoc("p-big");
    for (let i = 0; i < count; i++) doc.history.add({ points: [{ x: 10, y: 20 }], width: 3, color: "#ff453a" });
    await ws.open(doc, new AbortController().signal);
    const entry = (ws as any).entries.get("p-big");
    const cx = entry.pose.x;
    const cy = entry.pose.y;
    (ws as any).handlePointer("begin", { id: 1, phase: 0, button: 0, position: { x: cx, y: cy } });
    (ws as any).handlePointer("move", { id: 1, phase: 1, button: 0, position: { x: cx + 20, y: cy + 10 } });
    (ws as any).handlePointer("end", { id: 1, phase: 2, button: 0, position: { x: cx + 25, y: cy + 12 } });
    expect(ws.graphics.status.text).toBe(message);
    expect(ws["editing"]!.history.annotations).toEqual(doc.history.annotations);
    ws.dispose();
  });

  it("keeps the world frozen during dismissSubmitted until pending deferred identities settle, and skips the wait when already ready", async () => {
    const nowRef = { now: 1000 };
    vi.spyOn(performance, "now").mockImplementation(() => nowRef.now);
    const { ws, freezeCalls, advanceMs } = createWorkspace({ reducedMotion: false });

    // Case 1: Identities already settled before shrink completes -> 0 extra delay, no status hint, unfreezes immediately.
    const docReady = makeDoc("p-ready");
    ws.beginCapture();
    const openReady = ws.open(docReady, new AbortController().signal);
    await Promise.resolve();
    advanceMs(520, nowRef);
    await openReady;
    const dismissReady = ws.dismissSubmitted(new AbortController().signal, {
      isPending: () => false,
      wait: async () => {
        throw new Error("should not wait when already ready");
      }
    });
    advanceMs(420, nowRef);
    await dismissReady;
    expect(ws.phase).toBe("idle");
    expect(ws.graphics.status.text).toBe("");
    expect(freezeCalls.at(-1)).toBe(false);

    // Case 2: Identities still pending when 380ms shrink finishes -> stays frozen in "identities" phase until resolved.
    const docPending = makeDoc("p-pending");
    ws.beginCapture();
    const openPending = ws.open(docPending, new AbortController().signal);
    await Promise.resolve();
    advanceMs(520, nowRef);
    await openPending;

    let pending = true;
    let resolveIdentities!: () => void;
    const identitiesPromise = new Promise<void>((resolve) => {
      resolveIdentities = () => {
        pending = false;
        resolve();
      };
    });
    const dismissPending = ws.dismissSubmitted(new AbortController().signal, {
      isPending: () => pending,
      wait: () => identitiesPromise
    });
    advanceMs(420, nowRef);
    await Promise.resolve();

    expect(ws.phase).toBe("identities");
    expect(ws.graphics.status.text).toBe("正在建立画面拾取索引…");
    expect(freezeCalls.at(-1)).toBe(true);

    resolveIdentities();
    await dismissPending;

    expect(ws.phase).toBe("idle");
    expect(ws.graphics.status.text).toBe("");
    expect(freezeCalls.at(-1)).toBe(false);

    // Case 3: Cancelling/aborting while waiting in "identities" phase drops the unready photo and unfreezes cleanly.
    const docAbort = makeDoc("p-abort");
    const abortCtrl = new AbortController();
    ws.beginCapture();
    const openAbort = ws.open(docAbort, abortCtrl.signal);
    await Promise.resolve();
    advanceMs(520, nowRef);
    await openAbort;

    const dismissAbort = ws.dismissSubmitted(abortCtrl.signal, {
      isPending: () => true,
      wait: (waitSignal) =>
        new Promise<void>((_, reject) => {
          waitSignal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        })
    });
    advanceMs(420, nowRef);
    await Promise.resolve();
    expect(ws.phase).toBe("identities");
    expect(freezeCalls.at(-1)).toBe(true);

    abortCtrl.abort();
    ws.cancel();
    await expect(dismissAbort).rejects.toMatchObject({ name: "AbortError" });
    expect((ws as any).entries.has("p-abort")).toBe(false);
    expect(ws.phase).toBe("idle");
    expect(ws.graphics.status.text).toBe("");
    expect(freezeCalls.at(-1)).toBe(false);
    ws.dispose();
  });

  it("rolls back drawing state and shows a localized warning instead of throwing repeatedly when paint fails", async () => {
    const { ws } = createWorkspace({ reducedMotion: true });
    const doc = makeDoc("p-paint-fail");
    await ws.open(doc, new AbortController().signal);
    const entry = (ws as any).entries.get("p-paint-fail");
    const surface = mocks.surfaces.get("p-paint-fail")!;
    const cx = entry.pose.x;
    const cy = entry.pose.y;

    surface.throwOnPaint = new Error("WebGL FBO incomplete");
    const paintCallsBefore = surface.paintCalls;

    expect(() =>
      (ws as any).handlePointer("begin", { id: 7, phase: 0, button: 0, position: { x: cx, y: cy } })
    ).not.toThrow();
    expect((ws as any).drawing).toBeUndefined();
    expect(ws.graphics.status.text).toBe("画面标记渲染失败，请重试。");
    expect(surface.paintCalls).toBe(paintCallsBefore + 1);

    // Subsequent move and up events must be clean no-ops with zero errors and zero additional paint attempts.
    for (let i = 1; i <= 3; i++) {
      expect(() =>
        (ws as any).handlePointer("move", { id: 7, phase: 1, button: 0, position: { x: cx + i * 25, y: cy + i * 10 } })
      ).not.toThrow();
    }
    expect(() =>
      (ws as any).handlePointer("end", { id: 7, phase: 2, button: 0, position: { x: cx + 80, y: cy + 35 } })
    ).not.toThrow();
    expect(surface.paintCalls).toBe(paintCallsBefore + 1);

    ws.dispose();
  });

  it("detaches immediately and clears a submitted photo when voice turn ends mid-dismissSubmitted shrink", async () => {
    const nowRef = { now: 1000 };
    vi.spyOn(performance, "now").mockImplementation(() => nowRef.now);
    const { ws, released, removed, advanceMs } = createWorkspace({ reducedMotion: false });

    const doc = makeDoc("p-fast-turn");
    ws.beginCapture();
    const openP = ws.open(doc, new AbortController().signal);
    await Promise.resolve();
    advanceMs(520, nowRef);
    await openP;

    expect(ws.isEditing).toBe(true);
    const dismissP = ws.dismissSubmitted(new AbortController().signal);
    advanceMs(80, nowRef);

    // Voice turn ends rapidly (e.g. user hit Stop or fast error) while 380ms shrink is still running.
    ws.clearSubmittedCards([doc.snapshotId]);
    // Attachment slot must be freed immediately so the finished turn's photo cannot leak into Turn 2.
    expect(removed).toContain("p-fast-turn");
    expect(ws.size).toBe(0);

    // Finish the remaining shrink animation + deferred 260ms fade-out.
    advanceMs(360, nowRef);
    await dismissP;
    advanceMs(320, nowRef);
    await Promise.resolve();

    expect((ws as any).entries.size).toBe(0);
    expect(released).toEqual(["p-fast-turn"]);
    expect(mocks.surfaces.get("p-fast-turn")?.disposeCount).toBe(1);
    ws.dispose();
  });

  it("hands off cleanly from open() fly animation to dismissSubmitted() at both early (<100ms) and mid (~320ms) windows without errors or state regression", async () => {
    const nowRef = { now: 1000 };
    vi.spyOn(performance, "now").mockImplementation(() => nowRef.now);
    const attached: string[] = [];
    const { ws, advanceMs } = createWorkspace({
      reducedMotion: false,
      updateAttachment: (id) => attached.push(id)
    });

    // Early fly handoff (48ms into 480ms fly): dismissSubmitted finishes BEFORE original 480ms would have elapsed.
    const docEarly = makeDoc("p-fly-early");
    const ctrlEarly = new AbortController();
    ws.beginCapture();
    const openEarly = ws.open(docEarly, ctrlEarly.signal);
    await Promise.resolve();
    expect(ws.phase).toBe("fly");
    // Attachment is already registered synchronously before fly begins (single source of truth).
    expect(attached).toEqual(["p-fly-early"]);

    advanceMs(48, nowRef);
    const dismissEarly = ws.dismissSubmitted(ctrlEarly.signal);
    expect(ws.phase).toBe("return");

    // open() exits silently on handoff without throwing TypeError or clobbering return/idle state.
    await expect(openEarly).resolves.toBeUndefined();
    advanceMs(420, nowRef);
    await dismissEarly;

    const surfaceEarly = mocks.surfaces.get("p-fly-early")!;
    expect(ws.phase).toBe("idle");
    expect(ws.isEditing).toBe(false);
    expect(ws.graphics.status.text).toBe("");
    expect(surfaceEarly.closeOpacity).toBe(0);
    expect(surfaceEarly.frameRadius).toBe(10);

    // Advance past the original 480ms fly window: stale fly callbacks must never fire or corrupt docked card visuals.
    advanceMs(240, nowRef);
    expect(ws.phase).toBe("idle");
    expect(surfaceEarly.closeOpacity).toBe(0);
    expect(surfaceEarly.frameRadius).toBe(10);

    // Mid fly handoff (320ms into 480ms fly, matching single-finger Voice Orb long-press release).
    const docMid = makeDoc("p-fly-mid");
    const ctrlMid = new AbortController();
    const phases: string[] = [];
    const origSetPhase = ws.setPhase.bind(ws);
    vi.spyOn(ws, "setPhase").mockImplementation((phase: string) => {
      phases.push(phase);
      origSetPhase(phase);
    });
    ws.beginCapture();
    const openMid = ws.open(docMid, ctrlMid.signal);
    await Promise.resolve();
    advanceMs(320, nowRef);
    const dismissMid = ws.dismissSubmitted(ctrlMid.signal);
    await expect(openMid).resolves.toBeUndefined();

    // Advance through the 480ms mark while dismissSubmitted is still shrinking: phase must NOT regress to "editing".
    advanceMs(220, nowRef);
    expect(ws.phase).toBe("return");
    expect(phases).not.toContain("editing");

    advanceMs(220, nowRef);
    await dismissMid;
    const surfaceMid = mocks.surfaces.get("p-fly-mid")!;
    expect(ws.phase).toBe("idle");
    expect(surfaceMid.closeOpacity).toBe(0);
    expect(surfaceMid.frameRadius).toBe(10);
    expect(ws.size).toBe(2);
    ws.dispose();
  });

  it("removes pre-registered attachment cleanly when a new photo is cancelled mid-fly", async () => {
    const nowRef = { now: 1000 };
    vi.spyOn(performance, "now").mockImplementation(() => nowRef.now);
    const attached: string[] = [];
    const { ws, released, removed, advanceMs } = createWorkspace({
      reducedMotion: false,
      updateAttachment: (id) => attached.push(id)
    });

    const doc = makeDoc("p-cancel-fly");
    const ctrl = new AbortController();
    ws.beginCapture();
    const openP = ws.open(doc, ctrl.signal);
    await Promise.resolve();
    expect(attached).toEqual(["p-cancel-fly"]);
    advanceMs(64, nowRef);

    ctrl.abort();
    ws.cancel();
    await expect(openP).rejects.toMatchObject({ name: "AbortError" });
    expect(removed).toContain("p-cancel-fly");
    expect(released).toEqual(["p-cancel-fly"]);
    expect(ws.size).toBe(0);
    expect((ws as any).entries.size).toBe(0);
    expect(ws.phase).toBe("idle");
    ws.dispose();
  });

  it("does not resurrect a finished-turn reopened card when cancel() runs while it is in pendingClearIds", async () => {
    const nowRef = { now: 1000 };
    vi.spyOn(performance, "now").mockImplementation(() => nowRef.now);
    const attached: string[] = [];
    const { ws, released, removed, advanceMs } = createWorkspace({
      reducedMotion: false,
      updateAttachment: (id) => attached.push(id)
    });

    // Create and dock an existing photo.
    const doc = makeDoc("p-reopen-pending");
    const open1 = ws.open(doc, new AbortController().signal);
    await Promise.resolve();
    advanceMs(520, nowRef);
    await open1;
    const dismiss1 = ws.dismissSubmitted(new AbortController().signal);
    advanceMs(420, nowRef);
    await dismiss1;

    // Reopen existing card, submit voice, and end voice turn while shrink/identities is still running.
    const ctrl2 = new AbortController();
    const open2 = ws.open(doc, ctrl2.signal);
    await Promise.resolve();
    advanceMs(400, nowRef);
    await open2;
    const attachCountBeforeCancel = attached.length;

    const dismiss2 = ws.dismissSubmitted(ctrl2.signal, {
      isPending: () => true,
      wait: (waitSignal) =>
        new Promise<void>((_, reject) => {
          waitSignal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        })
    });
    advanceMs(420, nowRef);
    await Promise.resolve();
    expect(ws.phase).toBe("identities");

    // Turn finishes -> moves p-reopen-pending into pendingClearIds and detaches immediately.
    ws.clearSubmittedCards([doc.snapshotId]);
    expect(removed).toContain("p-reopen-pending");
    expect((ws as any).pendingClearIds.has("p-reopen-pending")).toBe(true);

    // User cancels during identities wait -> must remove card instead of resurrecting attachment.
    ctrl2.abort();
    ws.cancel();
    await expect(dismiss2).rejects.toMatchObject({ name: "AbortError" });
    expect(attached.length).toBe(attachCountBeforeCancel);
    expect((ws as any).entries.size).toBe(0);
    expect((ws as any).pendingClearIds.size).toBe(0);
    expect(ws.size).toBe(0);
    expect(released).toEqual(["p-reopen-pending"]);
    expect(mocks.surfaces.get("p-reopen-pending")?.disposeCount).toBe(1);
    ws.dispose();
  });

  it("SeedWorldLassoPanel handles seed-world-voice-submitted mid-fly without error banner or stuck close button", async () => {
    const nowRef = { now: 1000 };
    vi.spyOn(performance, "now").mockImplementation(() => nowRef.now);
    const { canvas } = installDomGlobals(false);
    let frameCount = 0;
    const attachments = new Map<string, any>();
    let captureSeq = 0;
    const views: any = {
      maxPhotos: 4,
      budget: undefined,
      capture: vi.fn(async () => {
        const id = `snap-${++captureSeq}`;
        return {
          snapshotId: id,
          image: makeDoc(id).image
        };
      }),
      pin: vi.fn(() => () => {}),
      setAttachment: vi.fn((id: string, annotations: readonly any[]) => {
        const att = { snapshotId: id, annotations };
        attachments.set(id, att);
        return att;
      }),
      removeAttachment: vi.fn((id: string) => attachments.delete(id)),
      clearAttachments: vi.fn(() => attachments.clear()),
      ensureIdentities: vi.fn(async () => {}),
      hasIdentities: vi.fn(() => true)
    };
    const host: any = {
      canvas,
      worldCamera: {},
      engine: {
        time: {
          get frameCount() {
            return frameCount;
          }
        },
        inputManager: { isKeyDown: () => false }
      }
    };
    const panel = new SeedWorldLassoPanel(views, () => {}, host);
    const ws: SeedWorldPhotoWorkspace = (panel as any).workspace;
    const advanceMs = (ms: number) => {
      const steps = Math.max(1, Math.ceil(ms / 16));
      const stepMs = ms / steps;
      for (let i = 0; i < steps; i++) {
        nowRef.now += stepMs;
        frameCount++;
        (ws as any).tick(stepMs / 1000);
      }
    };

    // Trigger open(), let capture resolve and enter fly (48ms), then request dismissal mid-fly.
    const openPromise = panel.open();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(ws.phase).toBe("fly");
    expect(attachments.has("snap-1")).toBe(true);

    advanceMs(48);
    document.dispatchEvent(new CustomEvent("seed-world-voice-submitted"));
    expect(ws.phase).toBe("return");

    await openPromise;
    advanceMs(440);
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(ws.phase).toBe("idle");
    expect(panel.button.hidden).toBe(false);
    expect(ws.graphics.status.text).toBe("");
    const surface = mocks.surfaces.get("snap-1")!;
    expect(surface.closeOpacity).toBe(0);
    expect(surface.frameRadius).toBe(10);

    // Voice turn ends -> submitted card fades out and disposes completely.
    document.dispatchEvent(new CustomEvent("seed-world-voice-turn-ended", { detail: { snapshotIds: ["snap-1"] } }));
    advanceMs(320);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(ws.size).toBe(0);
    expect(attachments.size).toBe(0);
    expect(surface.disposeCount).toBe(1);

    panel.dispose();
  });

  it("skips matchMedia queries and redundant backdrop writes on idle ticks", () => {
    const { ws } = createWorkspace({ reducedMotion: false });
    const matchMediaSpy = vi.fn(() => ({ matches: false }));
    vi.stubGlobal("matchMedia", matchMediaSpy);
    const backdropColor = (ws.graphics.backdrop.getMaterial() as any).baseColor;
    let alphaWrites = 0;
    let currentAlpha = backdropColor.a;
    Object.defineProperty(backdropColor, "a", {
      configurable: true,
      get: () => currentAlpha,
      set: (value: number) => {
        alphaWrites++;
        currentAlpha = value;
      }
    });

    for (let i = 0; i < 30; i++) {
      (ws as any).tick(1 / 60);
    }

    expect(matchMediaSpy).not.toHaveBeenCalled();
    expect(alphaWrites).toBe(0);
    ws.dispose();
  });
});
