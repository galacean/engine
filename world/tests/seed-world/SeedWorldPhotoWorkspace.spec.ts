import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const surfaces = new Map<string, FakeSurface>();
  class FakeSurface {
    readonly root = {
      isActive: false,
      isActiveInHierarchy: false,
      transform: { setPosition() {}, setRotation() {}, setScale() {} }
    };
    readonly ink = { entity: { isActive: false, isActiveInHierarchy: false, transform: { worldMatrix: { elements: [] } } }, mesh: null };
    layoutWidth = 100;
    layoutHeight = 100;
    opacity = 1;
    closeOpacity = 0;
    disposed = false;
    disposeCount = 0;
    constructor(public readonly id: string, public readonly image: { width: number; height: number }) {
      surfaces.set(id, this);
    }
    setFrameLayout(width: number, height: number) {
      this.layoutWidth = Math.max(2, width);
      this.layoutHeight = Math.max(2, height);
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
    paint() {
      this.paintCalls++;
      if (this.throwOnPaint) throw this.throwOnPaint;
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
    readonly toolbar = { isActive: false };
    readonly palette = { isActive: false };
    readonly status = { text: "" };
    warmingUp = false;
    constructor(
      public readonly engine: any,
      public readonly canvas: HTMLCanvasElement
    ) {}
    async prepare() {}
    resize() {}
    setBadge() {}
    setInkColor() {}
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
    setBadge() {}
    setPhoto() {}
    remove() {}
    dispose() {}
  }
}));

vi.mock("../../demos/seed-world/src/SeedWorldPhotoInputTrace.ts", () => ({
  SeedWorldPhotoInputTrace: class {
    enabled = false;
    record() {}
    sample() {}
    dispose() {}
  }
}));

import { SeedWorldAnnotationHistory } from "../../demos/seed-world/src/SeedWorldAnnotationHistory.ts";
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
  vi.stubGlobal("innerWidth", 1280);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("window", { addEventListener: add, removeEventListener: remove });
  vi.stubGlobal("document", {
    addEventListener: add,
    removeEventListener: remove,
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
  const instantCamera: any = {
    canvas,
    worldCamera: {},
    engine: {
      time: {
        get frameCount() {
          return frameCount;
        }
      },
      inputManager: { isKeyDown: () => false }
    },
    hide() {}
  };
  const ws = new SeedWorldPhotoWorkspace(instantCamera, {
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

  it("flushes prior fading batch on reentrant clearSubmittedCards(false) without leaking entries, pins, or camera", async () => {
    const nowRef = { now: 1000 };
    vi.spyOn(performance, "now").mockImplementation(() => nowRef.now);
    const { ws, released, removed, advanceMs } = createWorkspace({ reducedMotion: false });

    const docA = makeDoc("photo-A");
    const openA = ws.open(docA, new AbortController().signal);
    await Promise.resolve();
    advanceMs(520, nowRef);
    await openA;
    const dismissA = ws.dismissSubmitted(new AbortController().signal);
    advanceMs(420, nowRef);
    await dismissA;

    ws.markCurrentPhotosSubmitted();

    // Open B while A is docked, mark B submitted too, then end Turn 1 while B is still editing.
    const docB = makeDoc("photo-B");
    const openB = ws.open(docB, new AbortController().signal);
    await Promise.resolve();
    advanceMs(520, nowRef);
    await openB;
    ws.markCurrentPhotosSubmitted();

    // Batch 1 starts fading A (260ms) while skipping editing B.
    ws.clearSubmittedCards(false);
    advanceMs(48, nowRef);

    // B finishes dismissing and Turn 2 ends mid-fade -> reentrant clearSubmittedCards(false).
    const dismissB = ws.dismissSubmitted(new AbortController().signal);
    advanceMs(420, nowRef);
    await dismissB;
    // Trigger a fresh overlapping fade scenario with C to test exact mid-260ms abort reentrancy as well:
    const docC = makeDoc("photo-C");
    const openC = ws.open(docC, new AbortController().signal);
    await Promise.resolve();
    advanceMs(520, nowRef);
    await openC;
    const dismissC = ws.dismissSubmitted(new AbortController().signal);
    advanceMs(420, nowRef);
    await dismissC;

    // Now B and C are both docked; put B in submittedIds -> start 260ms fade; at 48ms put C in submittedIds -> reentrant clear!
    (ws as any).submittedIds.add("photo-B");
    ws.clearSubmittedCards(false);
    advanceMs(48, nowRef);
    (ws as any).submittedIds.add("photo-C");
    ws.clearSubmittedCards(false);
    advanceMs(320, nowRef);
    await Promise.resolve();
    advanceMs(32, nowRef);

    expect((ws as any).entries.size).toBe(0);
    expect((ws as any).clearingIds.size).toBe(0);
    expect(ws.size).toBe(0);
    expect(mocks.surfaces.get("photo-A")?.disposeCount).toBe(1);
    expect(mocks.surfaces.get("photo-B")?.disposeCount).toBe(1);
    expect(mocks.surfaces.get("photo-C")?.disposeCount).toBe(1);
    expect(released.sort()).toEqual(["photo-A", "photo-B", "photo-C"]);
    expect(removed).toContain("photo-A");
    expect(removed).toContain("photo-B");
    expect(removed).toContain("photo-C");
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

    ws.markCurrentPhotosSubmitted();
    ws.clearSubmittedCards(false);
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

  it("shows a friendly localized warning when an annotation exceeds the 64 KiB AgentValue cap", async () => {
    let callCount = 0;
    const { ws } = createWorkspace({
      reducedMotion: true,
      updateAttachment: () => {
        callCount++;
        if (callCount > 1) {
          const err = new Error("Agent context, script input, or result exceeds 65536 bytes");
          err.name = "AgentValueError";
          throw err;
        }
      }
    });
    const doc = makeDoc("p-big");
    await ws.open(doc, new AbortController().signal);
    const entry = (ws as any).entries.get("p-big");
    const cx = entry.pose.x;
    const cy = entry.pose.y;
    (ws as any).handlePointer("begin", { id: 1, phase: 0, button: 0, position: { x: cx, y: cy } });
    (ws as any).handlePointer("move", { id: 1, phase: 1, button: 0, position: { x: cx + 20, y: cy + 10 } });
    (ws as any).handlePointer("end", { id: 1, phase: 2, button: 0, position: { x: cx + 25, y: cy + 12 } });
    expect(ws.graphics.status.text).toBe("标记线条过多，请先删掉部分或重画。");
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
    ws.markCurrentPhotosSubmitted();
    const dismissP = ws.dismissSubmitted(new AbortController().signal);
    advanceMs(80, nowRef);

    // Voice turn ends rapidly (e.g. user hit Stop or fast error) while 380ms shrink is still running.
    ws.clearSubmittedCards(false);
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
});
