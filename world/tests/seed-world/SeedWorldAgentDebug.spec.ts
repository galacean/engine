import { PointerPhase, type PointerEventData } from "@galacean/engine";
import { AgentTraceStore } from "@galacean/engine-ai-chat/ai-chat/index";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeedWorldAgentDebug } from "../../demos/seed-world/assistant/SeedWorldAgentDebug";
import {
  VOICE_ORB_TRACE_TAP_COUNT,
  VOICE_ORB_TRACE_TAP_WINDOW_MILLISECONDS,
  VoiceOrbPointer
} from "../../demos/seed-world/assistant/SeedWorldChatPanel";

class FakeElement extends EventTarget {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> & { setProperty(name: string, value: string): void };
  parentElement: FakeElement | null = null;
  textContent = "";
  value = "";
  title = "";
  type = "";
  placeholder = "";
  rows = 0;
  spellcheck = false;
  disabled = false;

  constructor(tagName: string) {
    super();
    this.tagName = tagName.toLowerCase();
    const styleMap: Record<string, string> = {};
    this.style = Object.assign(styleMap, {
      setProperty(name: string, value: string) {
        styleMap[name] = value;
      }
    });
  }

  append(...nodes: Array<FakeElement | string>): void {
    for (const node of nodes) {
      if (typeof node === "string") {
        this.textContent += node;
      } else {
        this.appendChild(node);
      }
    }
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(_name: string, _value: string): void {}

  click(): void {
    this.dispatchEvent(new Event("click"));
  }

  findAll(predicate: (el: FakeElement) => boolean, out: FakeElement[] = []): FakeElement[] {
    for (const child of this.children) {
      if (predicate(child)) out.push(child);
      child.findAll(predicate, out);
    }
    return out;
  }
}

let fakeBody: FakeElement;
let fakeWindow: EventTarget & { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };

function installFakeDom(): void {
  fakeBody = new FakeElement("body");
  fakeWindow = Object.assign(new EventTarget(), {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis)
  });
  const fakeDocument = Object.assign(new EventTarget(), {
    body: fakeBody,
    activeElement: null as FakeElement | null,
    createElement: (tag: string) => new FakeElement(tag)
  });
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", fakeDocument);
}

function getTraceElements(): {
  root: FakeElement | null;
  panel: FakeElement | null;
  closeButton: FakeElement | null;
  content: FakeElement | null;
} {
  const root = fakeBody.children.find((el) => el.dataset.seedWorldAgentTrace === "true") ?? null;
  const panel = root?.children.find((el) => el.tagName === "div") ?? null;
  const closeButton = panel?.findAll((el) => el.tagName === "button" && el.textContent === "关闭")[0] ?? null;
  const content = panel?.findAll((el) => el.tagName === "pre")[0] ?? null;
  return { root, panel, closeButton, content };
}

function pointerEvent(id: number, uniqueId = id + 100, phase: PointerPhase = PointerPhase.Up): PointerEventData {
  return {
    pointer: {
      id,
      _uniqueID: uniqueId,
      phase
    }
  } as unknown as PointerEventData;
}

function dispatchWindowPointer(type: "pointerup" | "pointercancel", pointerId: number): void {
  const event = new Event(type);
  Object.defineProperty(event, "pointerId", { value: pointerId });
  fakeWindow.dispatchEvent(event);
}

describe("SeedWorldAgentDebug & VoiceOrbPointer 5-tap trigger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T12:00:00.000Z"));
    installFakeDom();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("openPanel enables trace, mounts the overlay, opens the panel immediately, and re-opens after close", () => {
    const store = new AgentTraceStore({ enabled: false });
    const debug = createSeedWorldAgentDebug(store);
    try {
      expect(debug.enabled).toBe(false);
      expect(getTraceElements().root).toBeNull();

      debug.openPanel();
      expect(debug.enabled).toBe(true);
      const { root, panel, closeButton, content } = getTraceElements();
      expect(root).not.toBeNull();
      expect(panel?.style.display).toBe("flex");
      expect(content?.textContent).toContain("等待下一次 ASR / Agent 任务");

      closeButton!.click();
      expect(panel?.style.display).toBe("none");

      const id = store.begin({ input: "现在几点", inputSource: "text" });
      store.finish(id, { status: "completed" });
      debug.openPanel();
      expect(panel?.style.display).toBe("flex");
      expect(content?.textContent).toContain("现在几点");
    } finally {
      debug.destroy();
    }
  });

  function createOrbHarness() {
    const store = new AgentTraceStore({ enabled: false });
    const debug = createSeedWorldAgentDebug(store);
    const openPanelSpy = vi.spyOn(debug, "openPanel");
    const controller = {
      listening: false,
      debug,
      handlePointerDown: vi.fn(),
      handlePointerUp: vi.fn(),
      handlePointerEndDrag: vi.fn(),
      handlePointerCancel: vi.fn()
    };
    const layout = { setOrbPressState: vi.fn() };
    const orb = new VoiceOrbPointer({ _engine: {} } as any);
    orb.controller = controller as any;
    orb.layout = layout as any;

    const shortTap = (id = 0, uniqueId = 100 + id, withWindowPointerUp = true) => {
      const down = pointerEvent(id, uniqueId, PointerPhase.Down);
      const up = pointerEvent(id, uniqueId, PointerPhase.Up);
      orb.onPointerDown(down);
      vi.advanceTimersByTime(40);
      if (withWindowPointerUp) dispatchWindowPointer("pointerup", uniqueId);
      vi.advanceTimersByTime(16);
      orb.onPointerUp(up);
      orb.onPointerClick(up);
      orb.onPointerEndDrag(up);
    };

    return { store, debug, openPanelSpy, controller, layout, orb, shortTap };
  }

  it("opens the Agent Trace panel on 5 consecutive short taps within the window and re-opens on another 5 taps", () => {
    const { debug, openPanelSpy, controller, orb, shortTap } = createOrbHarness();
    try {
      for (let i = 0; i < VOICE_ORB_TRACE_TAP_COUNT - 1; i++) {
        shortTap(i, 100 + i);
        vi.advanceTimersByTime(120);
      }
      expect(openPanelSpy).not.toHaveBeenCalled();
      expect(getTraceElements().root).toBeNull();

      shortTap(4, 104);
      expect(openPanelSpy).toHaveBeenCalledTimes(1);
      expect(controller.handlePointerDown).not.toHaveBeenCalled();
      expect(getTraceElements().panel?.style.display).toBe("flex");

      // Closing and tapping 5 times again (including same-frame taps without intermediate window pointerup) re-opens it.
      getTraceElements().closeButton!.click();
      expect(getTraceElements().panel?.style.display).toBe("none");

      for (let i = 0; i < VOICE_ORB_TRACE_TAP_COUNT; i++) {
        shortTap(0, 200 + i, false);
        vi.advanceTimersByTime(100);
      }
      expect(openPanelSpy).toHaveBeenCalledTimes(2);
      expect(getTraceElements().panel?.style.display).toBe("flex");
    } finally {
      orb.onDestroy();
      debug.destroy();
    }
  });

  it("resets the tap streak when the gap exceeds VOICE_ORB_TRACE_TAP_WINDOW_MILLISECONDS", () => {
    const { debug, openPanelSpy, orb, shortTap } = createOrbHarness();
    try {
      for (let i = 0; i < 4; i++) {
        shortTap(0, 100 + i);
        vi.advanceTimersByTime(100);
      }
      vi.advanceTimersByTime(VOICE_ORB_TRACE_TAP_WINDOW_MILLISECONDS + 1);

      for (let i = 0; i < 4; i++) {
        shortTap(0, 200 + i);
        vi.advanceTimersByTime(100);
      }
      expect(openPanelSpy).not.toHaveBeenCalled();

      shortTap(0, 204);
      expect(openPanelSpy).toHaveBeenCalledTimes(1);
    } finally {
      orb.onDestroy();
      debug.destroy();
    }
  });

  it("resets the tap streak on long-press, off-orb drag, pointercancel, and ignores clicks while listening", () => {
    const { debug, openPanelSpy, controller, orb, shortTap } = createOrbHarness();
    try {
      // 4 taps + long-press released on orb (onPointerClick still fires after long-press) => resets, does not open.
      for (let i = 0; i < 4; i++) {
        shortTap(0, 100 + i);
        vi.advanceTimersByTime(80);
      }
      orb.onPointerDown(pointerEvent(0, 300, PointerPhase.Down));
      vi.advanceTimersByTime(300);
      expect(controller.handlePointerDown).toHaveBeenCalledTimes(1);
      dispatchWindowPointer("pointerup", 300);
      orb.onPointerUp(pointerEvent(0, 300, PointerPhase.Up));
      orb.onPointerClick(pointerEvent(0, 300, PointerPhase.Up));
      orb.onPointerEndDrag(pointerEvent(0, 300, PointerPhase.Up));
      expect(openPanelSpy).not.toHaveBeenCalled();

      // 4 taps + off-orb drag release (no onPointerClick, only onPointerEndDrag) => resets.
      for (let i = 0; i < 4; i++) {
        shortTap(0, 400 + i);
        vi.advanceTimersByTime(80);
      }
      orb.onPointerDown(pointerEvent(0, 450, PointerPhase.Down));
      vi.advanceTimersByTime(40);
      dispatchWindowPointer("pointerup", 450);
      orb.onPointerEndDrag(pointerEvent(0, 450, PointerPhase.Up));
      shortTap(0, 451);
      expect(openPanelSpy).not.toHaveBeenCalled();

      // 3 more taps (total 4 after reset) + pointercancel => resets.
      for (let i = 0; i < 3; i++) {
        shortTap(0, 500 + i);
        vi.advanceTimersByTime(80);
      }
      orb.onPointerDown(pointerEvent(0, 550, PointerPhase.Down));
      vi.advanceTimersByTime(40);
      dispatchWindowPointer("pointercancel", 550);
      orb.onPointerEndDrag(pointerEvent(0, 550, PointerPhase.Leave));
      shortTap(0, 551);
      expect(openPanelSpy).not.toHaveBeenCalled();

      // Taps while listening are ignored.
      controller.listening = true;
      for (let i = 0; i < VOICE_ORB_TRACE_TAP_COUNT; i++) {
        shortTap(0, 600 + i);
        vi.advanceTimersByTime(80);
      }
      expect(openPanelSpy).not.toHaveBeenCalled();

      // onDestroy resets an in-progress streak cleanly.
      controller.listening = false;
      for (let i = 0; i < 4; i++) {
        shortTap(0, 700 + i);
        vi.advanceTimersByTime(80);
      }
      orb.onDestroy();
      shortTap(0, 704);
      expect(openPanelSpy).not.toHaveBeenCalled();
    } finally {
      orb.onDestroy();
      debug.destroy();
    }
  });
});
