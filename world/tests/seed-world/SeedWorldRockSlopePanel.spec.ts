import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import type { IslandPlan, PlanRockBox } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import type { PlanningParameterCommand } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { RockFormationPanel } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Panel";
import { rockObbId } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Authoring";
import { automaticSlopeRate, DEFAULT_ROCK_SLOPE_VARIATION } from "@galacean/engine-terrain/rock-formation/Slope";

// Exercise the real panel's transaction payload and control state without a browser/renderer.
class Element extends EventTarget {
  children: Element[] = [];
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  classList = { remove() {} };
  value = "";
  textContent = "";
  title = "";
  disabled = false;
  constructor(readonly tag: string) {
    super();
  }
  setAttribute(key: string, value: string) {
    this.attributes[key] = value;
  }
  append(...children: Element[]) {
    this.children.push(...children);
  }
  replaceChildren() {
    this.children = [];
    this.value = "";
  }
  matches(selector: string): boolean {
    if (selector.startsWith("#")) return this.attributes.id === selector.slice(1);
    const data = selector.match(/^\[data-([\w-]+)(?:="([^"]*)")?\]$/);
    if (data) {
      const key = data[1].replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      return key in this.dataset && (data[2] === undefined || this.dataset[key] === data[2]);
    }
    return this.tag === selector;
  }
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap((child) => [
      ...(selector.split(",").some((part) => child.matches(part)) ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  click() {
    this.dispatchEvent(new Event("click"));
  }
}
class Input extends Element {
  type = "text";
  min = "";
  max = "";
  step = "";
  checked = false;
  constructor() {
    super("input");
  }
}
class Select extends Element {
  constructor() {
    super("select");
  }
  get options() {
    return this.children;
  }
  append(...children: Element[]) {
    super.append(...children);
    if (!this.value) this.value = this.children[0]?.value ?? "";
  }
}
class Folder {
  domElement = new Element("div");
  open() {}
  removeFolder() {}
  add(state: Record<string, unknown>, key: string, options?: Record<string, string>) {
    const control = options ? new Select() : new Input();
    if (control instanceof Select)
      for (const [label, value] of Object.entries(options!)) {
        const option = new Element("option");
        option.textContent = label;
        option.value = value;
        control.append(option);
      }
    if (control instanceof Input && typeof state[key] === "boolean") control.type = "checkbox";
    const domElement = new Element("div");
    domElement.append(control);
    this.domElement.append(domElement);
    let changed: () => void = () => {};
    const controller = {
      domElement,
      name: (_name: string) => controller,
      onChange: (callback: () => void) => {
        changed = callback;
        return controller;
      },
      updateDisplay: () => {
        control.value = String(state[key]);
        if (control instanceof Input && control.type === "checkbox") control.checked = Boolean(state[key]);
      }
    };
    for (const event of ["input", "change"])
      control.addEventListener(event, () => {
        state[key] = control instanceof Input && control.type === "checkbox" ? control.checked : control.value;
        changed();
      });
    controller.updateDisplay();
    return controller;
  }
}
function fixture(overrides: Partial<PlanRockBox> = {}) {
  const gui = new Folder(),
    actions = new Map<string, Element>(),
    readouts = new Map<string, string>();
  const folder = (parent: Folder) => {
    const child = new Folder();
    parent.domElement.append(child.domElement);
    return child;
  };
  const host = {
    gui,
    folder: () => folder(gui),
    subfolder: (parent: Folder) => folder(parent),
    refreshLayout() {},
    addAction(parent: Folder, label: string, callback: () => void) {
      const button = new Element("button");
      button.addEventListener("click", callback);
      parent.domElement.append(button);
      actions.set(label, button);
      return button;
    },
    addReadout(parent: Folder, label: string, id?: string) {
      const output = new Element("output");
      if (id) output.setAttribute("id", id);
      parent.domElement.append(output);
      return (text: string) => readouts.set(label, text);
    }
  } as unknown as DebugInspectorPanelHost;
  const apply = vi.fn<(commands: PlanningParameterCommand[]) => Promise<unknown>>(async () => ({ status: "accepted" }));
  const panel = new RockFormationPanel(host, apply);
  const box = { id: "box", sizeX: 20.1234, sizeY: 12.3456, sizeZ: 30, ...overrides } as PlanRockBox;
  const plan = {
    parameters: { seed: 1 },
    rocks: [{ id: "rock", groupId: "group", boxes: [box] }]
  } as unknown as IslandPlan;
  const document = { entities: { world: { components: {} } } } as unknown as PlanningDocument;
  panel.synchronize(plan, document);
  const control = (key: string) => panel.element.querySelector(`[data-${key}]`) as unknown as Input;
  const input = (key: string, value: string) => {
    const target = control(key);
    target.value = value;
    target.dispatchEvent(new Event("input"));
  };
  const automatic = (enabled: boolean) => {
    const target = control("obb-slope-mode");
    target.checked = enabled;
    target.dispatchEvent(new Event("change"));
  };
  return { panel, box, plan, document, apply, control, input, automatic, actions, readouts };
}
beforeEach(() => {
  vi.stubGlobal("HTMLInputElement", Input);
  vi.stubGlobal("HTMLSelectElement", Select);
  vi.stubGlobal("window", { document: { createElement: (tag: string) => new Element(tag) } });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => vi.unstubAllGlobals());
const settled = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

it("shows the bilingual texture control and submits only its changed material value", async () => {
  const f = fixture(),
    texture = f.control('field="textureScale"');
  expect(texture.value).toBe("60");
  expect(texture.attributes["aria-label"]).toBe("Texture scale / 纹理尺寸 (m)");
  f.actions.get("Apply formation settings / 应用形态设置")!.click();
  expect(f.apply).not.toHaveBeenCalled();
  f.input('field="textureScale"', "24");
  f.actions.get("Apply formation settings / 应用形态设置")!.click();
  expect(f.apply).toHaveBeenCalledWith([
    { op: "set", entity: "world", component: "rockFormation", values: { textureScale: 24 } }
  ]);
  await settled();
  f.panel.destroy();
});

it("exposes the default generation profile and submits only edited profile fields", async () => {
  const f = fixture();
  expect(f.control('generation-field="platformShare"').value).toBe("1");
  expect(f.control('generation-field="platformHeightScale"').value).toBe("1");
  expect(f.control('generation-field="platformSlopeRate"').value).toBe("12");
  expect(f.control('generation-field="platformShare"').attributes["aria-label"]).toContain("平台比例");
  f.actions.get("Apply generation profile / 应用生成配置")!.click();
  expect(f.apply).not.toHaveBeenCalled();
  f.input('generation-field="platformShare"', "0");
  f.actions.get("Apply generation profile / 应用生成配置")!.click();
  expect(f.apply).toHaveBeenCalledExactlyOnceWith([
    { op: "set", entity: "world", component: "rockGeneration", values: { platformShare: 0 } }
  ]);
  await settled();
  f.actions.get("Reset generation profile / 重置生成配置")!.click();
  expect(f.apply).toHaveBeenLastCalledWith([{ op: "reset", entity: "world", component: "rockGeneration" }]);
  f.panel.destroy();
});

it("shows upper-height variation in percent, preserves saved fractions and submits only the selected OBB", async () => {
  const f = fixture(),
    input = f.control("obb-height-variation");
  expect(input.value).toBe("0");
  expect([input.min, input.max, input.step]).toEqual(["0", "100", "1"]);
  expect(input.attributes["aria-label"]).toBe("Upper height variation / 上层高度变化 (%)");
  f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
  expect(f.apply).not.toHaveBeenCalled();
  f.box.heightVariation = 0.2;
  f.panel.synchronize(f.plan, f.document);
  expect(input.value).toBe("20");
  f.input("obb-height-variation", "35");
  f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
  expect(f.apply).toHaveBeenCalledExactlyOnceWith([
    { op: "set", entity: rockObbId("rock", "box"), component: "rockObb", values: { heightVariation: 0.35 } }
  ]);
  await settled();
  f.panel.destroy();
});

it("converts platform and peak upper-height percentages without rewriting untouched saved values", async () => {
  const f = fixture();
  for (const key of ["platformHeightVariation", "peakHeightVariation"]) {
    const input = f.control(`generation-field="${key}"`);
    expect(input.value).toBe("0");
    expect([input.min, input.max, input.step]).toEqual(["0", "100", "1"]);
    expect(input.attributes["aria-label"]).toContain("上层高度变化 (%)");
  }
  f.document.entities.world.components.rockGeneration = {
    values: {
      platformHeightVariation: 0.29,
      peakHeightVariation: 0.1234567890123456
    }
  };
  f.panel.synchronize(f.plan, f.document);
  expect(f.control('generation-field="platformHeightVariation"').value).toBe("29");
  f.actions.get("Apply generation profile / 应用生成配置")!.click();
  expect(f.apply).not.toHaveBeenCalled();
  f.input('generation-field="platformHeightVariation"', "0");
  f.actions.get("Apply generation profile / 应用生成配置")!.click();
  expect(f.apply).toHaveBeenCalledExactlyOnceWith([
    { op: "set", entity: "world", component: "rockGeneration", values: { platformHeightVariation: 0 } }
  ]);
  await settled();
  f.apply.mockClear();
  f.panel.synchronize(f.plan, f.document);
  f.input('generation-field="peakHeightVariation"', "20");
  f.actions.get("Apply generation profile / 应用生成配置")!.click();
  expect(f.apply).toHaveBeenCalledExactlyOnceWith([
    { op: "set", entity: "world", component: "rockGeneration", values: { peakHeightVariation: 0.2 } }
  ]);
  await settled();
  f.panel.destroy();
});

it("restores height-mode inheritance without pinning effective defaults or losing other OBB overrides", async () => {
  const f = fixture({ heightMode: "random-ascent", slopeMode: "manual", slopeRate: 3, heightVariation: 0.05 });
  const id = rockObbId("rock", "box");
  f.document.entities[id] = {
    id,
    name: id,
    components: { rockObb: { values: { heightMode: "perlin-ascent", slopeRate: 4 } } }
  };
  f.panel.synchronize(f.plan, f.document);
  expect(f.control("obb-height-mode").value).toBe("perlin-ascent");
  expect(f.control("obb-height-variation").value).toBe("5");
  f.input("obb-height-mode", "inherit");
  f.input("obb-height-variation", "0");
  f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
  expect(f.apply).toHaveBeenCalledExactlyOnceWith([
    { op: "reset", entity: id, component: "rockObb", fields: ["heightMode"] },
    { op: "set", entity: id, component: "rockObb", values: { heightVariation: 0 } }
  ]);
  await settled();
  f.panel.destroy();
});

it("edits a single rock color without quantizing untouched values or including geometry settings", async () => {
  const f = fixture();
  expect(f.control('rock-color="color"').value).toBe("#96967a");
  f.actions.get("Apply rock color / 应用岩石颜色")!.click();
  expect(f.apply).not.toHaveBeenCalled();
  f.input('rock-color="color"', "#00967a");
  f.actions.get("Apply rock color / 应用岩石颜色")!.click();
  expect(f.apply).toHaveBeenCalledExactlyOnceWith([
    {
      op: "set",
      entity: "world",
      component: "rockFormation",
      values: {
        "color.r": 0
      }
    }
  ]);
  await settled();
  f.actions.get("Reset rock color / 重置岩石颜色")!.click();
  expect(f.apply).toHaveBeenLastCalledWith([
    { op: "reset", entity: "world", component: "rockFormation", fields: ["color.r", "color.g", "color.b"] }
  ]);
  await settled();
  f.panel.destroy();
});

describe("individual OBB slope controls", () => {
  it("shows the exact published size ratio by default without authoring it when applying unchanged settings", () => {
    const f = fixture();
    expect(f.control("obb-slope-mode").checked).toBe(true);
    expect(Number(f.control("obb-slope-rate").value)).toBe(automaticSlopeRate([f.box.sizeX, f.box.sizeY, f.box.sizeZ]));
    expect(f.control("obb-slope-rate").disabled).toBe(true);
    expect(f.control("obb-slope-rate").max).toBe("");
    expect(Number(f.control("obb-slope-variation").value)).toBe(DEFAULT_ROCK_SLOPE_VARIATION);
    f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
    expect(f.apply).not.toHaveBeenCalled();
    f.panel.destroy();
  });

  it("updates the automatic preview for size edits but submits only the edited size", async () => {
    const f = fixture();
    f.input('size="height"', "20");
    expect(Number(f.control("obb-slope-rate").value)).toBe(automaticSlopeRate([f.box.sizeX, 20, f.box.sizeZ]));
    f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
    expect(f.apply).toHaveBeenCalledWith([
      { op: "set", entity: rockObbId("rock", "box"), component: "rockObb", values: { height: 20 } }
    ]);
    await settled();
    expect(f.control("obb-slope-rate").disabled).toBe(true);
    f.panel.destroy();
  });

  it("sends slope, zero variation, size, height and surface changes in one transaction without a slope ceiling", async () => {
    const f = fixture();
    f.automatic(false);
    f.input('size="width"', "14");
    f.input("obb-height-mode", "perlin-ascent");
    f.input("obb-surface-mode", "vertex-slabs");
    f.input("obb-slope-rate", "25");
    f.input("obb-slope-variation", "0");
    f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
    expect(f.apply).toHaveBeenCalledWith([
      {
        op: "set",
        entity: rockObbId("rock", "box"),
        component: "rockObb",
        values: {
          width: 14,
          heightMode: "perlin-ascent",
          surfaceMode: "vertex-slabs",
          slopeMode: "manual",
          slopeRate: 25,
          slopeVariation: 0
        }
      }
    ]);
    expect(f.control("obb-slope-rate").disabled).toBe(true);
    await settled();
    expect(f.control("obb-slope-rate").disabled).toBe(false);
    f.panel.destroy();
  });

  it("captures the automatic base when choosing manual and keeps it fixed through subsequent size edits", async () => {
    const f = fixture();
    const base = Number(f.control("obb-slope-rate").value);
    f.automatic(false);
    f.input('size="height"', "20");
    expect(Number(f.control("obb-slope-rate").value)).toBe(base);
    f.input("obb-slope-variation", "0.05");
    f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
    expect(f.apply).toHaveBeenCalledWith([
      {
        op: "set",
        entity: rockObbId("rock", "box"),
        component: "rockObb",
        values: { height: 20, slopeMode: "manual", slopeRate: base, slopeVariation: 0.05 }
      }
    ]);
    await settled();
    f.panel.destroy();
  });

  it("reads resolved per-OBB settings and preserves a dormant manual base through automatic mode", async () => {
    const f = fixture({ slopeMode: "manual", slopeRate: 1.55, slopeVariation: 0.05 });
    expect(f.control("obb-slope-rate").value).toBe("1.55");
    expect(f.control("obb-slope-rate").disabled).toBe(false);
    f.automatic(true);
    expect(Number(f.control("obb-slope-rate").value)).toBe(automaticSlopeRate([f.box.sizeX, f.box.sizeY, f.box.sizeZ]));
    f.automatic(false);
    expect(f.control("obb-slope-rate").value).toBe("1.55");
    f.automatic(true);
    f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
    expect(f.apply).toHaveBeenCalledWith([
      { op: "set", entity: rockObbId("rock", "box"), component: "rockObb", values: { slopeMode: "auto" } }
    ]);
    await settled();
    expect(f.control("obb-slope-rate").disabled).toBe(true);
    f.panel.destroy();
  });

  it("accepts published values after reset and keeps automatic inputs disabled after a failed edit", async () => {
    const f = fixture({ slopeMode: "manual", slopeRate: 1.55 });
    f.actions.get("Reset OBB / 重置包围盒")!.click();
    expect(f.apply).toHaveBeenCalledWith([{ op: "reset", entity: rockObbId("rock", "box"), component: "rockObb" }]);
    delete f.box.slopeMode;
    delete f.box.slopeRate;
    f.panel.synchronize(f.plan, f.document);
    await settled();
    expect(f.control("obb-slope-mode").checked).toBe(true);
    expect(f.control("obb-slope-rate").disabled).toBe(true);
    f.apply.mockRejectedValueOnce(new Error("publication failed"));
    f.input("obb-slope-variation", "0");
    f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
    await settled();
    expect(f.readouts.get("Edit status / 编辑状态")).toContain("publication failed");
    expect(f.control("obb-slope-rate").disabled).toBe(true);
    f.panel.destroy();
  });
});
