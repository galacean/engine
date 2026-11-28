import { afterEach, expect, it, vi } from "vitest";
import { PlanningSeedWorldSession } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningSeedWorldSession";
import { mountSeedWorldChatPanel } from "../../demos/seed-world/assistant/SeedWorldChatPanel";

vi.mock("../../demos/seed-world/assistant/SeedWorldChatPanel", () => ({
  mountSeedWorldChatPanel: vi.fn()
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("prepares hidden UI once and exposes interaction and trace only after the world is active", () => {
  vi.stubGlobal("window", {});
  const panel = { show: vi.fn(), hide: vi.fn(), debug: { enable: vi.fn() } };
  vi.mocked(mountSeedWorldChatPanel).mockReturnValue(panel as any);
  let active = false;
  const session = Object.assign(Object.create(PlanningSeedWorldSession.prototype), {
    options: { readPublished: () => ({}), isActive: () => active, traceEnabled: true }
  }) as PlanningSeedWorldSession;
  expect(session.preparePresentation()).toBe(panel);
  expect(session.preparePresentation()).toBe(panel);
  expect(mountSeedWorldChatPanel).toHaveBeenCalledOnce();
  expect(mountSeedWorldChatPanel).toHaveBeenCalledWith(
    expect.objectContaining({
      initiallyOpen: false,
      traceEnabled: false
    })
  );
  expect(window.seedWorldAI).toBeUndefined();
  expect(() => session.show()).toThrow("not published");
  expect(panel.show).not.toHaveBeenCalled();
  expect(panel.debug.enable).not.toHaveBeenCalled();
  active = true;
  session.show();
  expect(window.seedWorldAI).toBe(panel);
  expect(panel.debug.enable).toHaveBeenCalledOnce();
  session.hide();
  session.show();
  // Showing the HUD again must not override a user's later trace preference.
  expect(panel.debug.enable).toHaveBeenCalledOnce();
  expect(mountSeedWorldChatPanel).toHaveBeenCalledOnce();
});

it("cannot create presentation resources after disposal", () => {
  const session = Object.assign(Object.create(PlanningSeedWorldSession.prototype), { disposed: true });
  expect(() => session.preparePresentation()).toThrow("disposed");
  expect(mountSeedWorldChatPanel).not.toHaveBeenCalled();
});
