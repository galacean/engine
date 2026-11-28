import type * as dat from "dat.gui";
import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import type { PlanningParameterCommand } from "../../../spatial/PlanningSession.ts";
import {
  ROCK_COLOR_FIELDS,
  readRockColorBlend,
  rockPaletteHexToLinear,
  rockPaletteLinearToHex,
  type RockColorBlend
} from "./ColorPalette.ts";

/** Native authoring for a single Shader Color multiplier. */
export class RockColorControls {
  private readonly draft = { color: rockPaletteLinearToHex(readRockColorBlend().color) };
  private readonly input: HTMLInputElement;
  private readonly controller: dat.GUIController;
  constructor(
    host: DebugInspectorPanelHost,
    parent: dat.GUI,
    submit: (commands: PlanningParameterCommand[]) => Promise<void>
  ) {
    const folder = host.subfolder(parent, "Rock Color / 岩石颜色", false);
    this.controller = folder.add(this.draft, "color").name("Color / 颜色");
    this.input = this.controller.domElement.querySelector("input")!;
    this.input.type = "color";
    this.input.style.width = "100%";
    this.input.dataset.rockColor = "color";
    this.input.setAttribute("aria-label", "Rock Color / 岩石颜色");
    host.addReadout(
      folder,
      "Color guide / 配色说明"
    )("Grayscale × Color. Reset for the source tint. / 灰度贴图 × Color。重置可恢复原图色调。");
    host.addAction(folder, "Apply rock color / 应用岩石颜色", () => {
      if (this.input.value.toLowerCase() === this.input.dataset.displayed) return;
      const displayed = rockPaletteHexToLinear(this.input.dataset.displayed!);
      const values: Record<string, number> = {};
      rockPaletteHexToLinear(this.input.value).forEach((value, i) => {
        if (value !== displayed[i]) values[`color.${["r", "g", "b"][i]}`] = value;
      });
      if (Object.keys(values).length) void submit([{ op: "set", entity: "world", component: "rockFormation", values }]);
    }).dataset.rockColorApply = "";
    host.addAction(
      folder,
      "Reset rock color / 重置岩石颜色",
      () =>
        void submit([
          {
            op: "reset",
            entity: "world",
            component: "rockFormation",
            fields: ROCK_COLOR_FIELDS.map((field) => field.key)
          }
        ])
    ).dataset.rockColorReset = "";
    this.synchronize(readRockColorBlend());
  }
  synchronize(settings: RockColorBlend): void {
    this.draft.color = rockPaletteLinearToHex(settings.color);
    this.controller.updateDisplay();
    this.input.value = this.draft.color;
    this.input.dataset.displayed = this.input.value;
  }
}
