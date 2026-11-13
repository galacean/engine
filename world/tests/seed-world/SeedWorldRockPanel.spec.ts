import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import type { IslandPlan, PlanRockBox } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import type { PlanningParameterCommand } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { RockFormationPanel } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Panel";
import { rockObbId } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Authoring";

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
  add(state: Record<string, unknown>, key: string, options?: Record<string, string> | number) {
    const control = options && typeof options === "object" ? new Select() : new Input();
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
  return { panel, box, plan, document, apply, control, input, actions, readouts };
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

it("submits independent mountain toggles and a zero fracture depth through native authoring", async () => {
  const f = fixture();
  const arrangement = f.control('field="ridgeArrangement"');
  const shaping = f.control('field="rockShaping"');
  expect(arrangement.type).toBe("checkbox");
  expect(shaping.checked).toBe(false);
  arrangement.checked = true;
  arrangement.dispatchEvent(new Event("change"));
  f.input('field="fractureDepth"', "0");
  f.actions.get("Apply formation settings / 应用形态设置")!.click();
  expect(f.apply).toHaveBeenCalledWith([
    { op: "set", entity: "world", component: "rockFormation", values: { ridgeArrangement: true, fractureDepth: 0 } }
  ]);
  await settled();
  f.panel.destroy();
});

it("shows the bilingual texture control and submits only its changed material value", async () => {
  const f = fixture(),
    texture = f.control('field="textureScale"');
  expect(texture.value).toBe("0");
  expect(texture.attributes["aria-label"]).toBe("Texture repeat / 纹理平铺米数（0 自动）");
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

it("edits a single rock color without quantizing untouched values or including geometry settings", async () => {
  const f = fixture();
  expect(f.control('rock-color="color"').value).toBe("#b8bcc2");
  f.actions.get("Apply rock color / 应用岩石颜色")!.click();
  expect(f.apply).not.toHaveBeenCalled();
  f.input('rock-color="color"', "#00bcc2");
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

it("preserves unchanged dimensions and submits only an edited OBB dimension", async () => {
  const f = fixture();
  f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
  expect(f.apply).not.toHaveBeenCalled();
  f.input('size="height"', "20");
  f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
  expect(f.apply).toHaveBeenCalledExactlyOnceWith([
    { op: "set", entity: rockObbId("rock", "box"), component: "rockObb", values: { height: 20 } }
  ]);
  await settled();
  f.panel.destroy();
});

it("submits one changed shape value without changing the published OBB", async () => {
  const f = fixture();
  f.input('field="wallCount"', "20");
  f.actions.get("Apply formation settings / 应用形态设置")!.click();
  expect(f.apply).toHaveBeenCalledExactlyOnceWith([
    { op: "set", entity: "world", component: "rockFormation", values: { wallCount: 20 } }
  ]);
  expect(f.box.sizeY).toBe(12.3456);
  await settled();
  f.panel.destroy();
});

it("resets one OBB and reports failed edits without disabling future edits", async () => {
  const f = fixture();
  f.actions.get("Reset OBB / 重置包围盒")!.click();
  expect(f.apply).toHaveBeenCalledWith([{ op: "reset", entity: rockObbId("rock", "box"), component: "rockObb" }]);
  await settled();
  f.apply.mockRejectedValueOnce(new Error("publication failed"));
  f.input('size="height"', "24");
  f.actions.get("Apply OBB settings / 应用包围盒设置")!.click();
  await settled();
  expect(f.readouts.get("Edit status / 编辑状态")).toContain("publication failed");
  expect(f.control('size="height"').disabled).toBe(false);
  f.panel.destroy();
});

it("submits fracture normal smoothing as an independent shaping control", async () => {
  const f = fixture();
  f.input('field="fractureSmoothing"', "0.8");
  f.actions.get("Apply formation settings / 应用形态设置")!.click();
  expect(f.apply).toHaveBeenCalledExactlyOnceWith([
    { op: "set", entity: "world", component: "rockFormation", values: { fractureSmoothing: 0.8 } }
  ]);
  await settled();
  f.panel.destroy();
});
