import { Camera, Color, Entity, Script, TextHorizontalAlignment, TextVerticalAlignment } from "@galacean/engine";
import { CanvasRenderMode, HorizontalAlignmentMode, ResolutionAdaptationMode, Text, UICanvas, UITransform, VerticalAlignmentMode } from "@galacean/engine-ui";
import type { SeedWorldSaveStatus } from "@galacean/engine-world-planning/world/SeedWorldSaveScheduler";
import { SeedWorldSaveStatusPresentation } from "./SeedWorldSaveStatusPresentation.ts";

class SaveRetryInput extends Script {
  retry: (() => void) | undefined;
  update: ((deltaSeconds: number) => void) | undefined;
  override onUpdate(deltaTime: number): void { this.update?.(deltaTime); }
  onPointerClick(): void { this.retry?.(); }
}

/** Engine-rendered bottom-right save indicator; no DOM view or pointer interception when idle. */
export class SeedWorldSaveStatusUi {
  private readonly _root: Entity;
  private readonly _text: Text;
  private readonly _input: SaveRetryInput;
  private readonly _presentation = new SeedWorldSaveStatusPresentation();
  private _drawnStatus: SeedWorldSaveStatus | undefined;
  private _drawnOpacity = -1;

  constructor(root: Entity, camera: Camera, private readonly _retry: () => void) {
    this._root = root.createChild("World save status UI");
    const canvas = this._root.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    canvas.camera = camera;
    canvas.referenceResolution.set(720, 720);
    canvas.resolutionAdaptationMode = ResolutionAdaptationMode.ExpandAdaptation;
    canvas.sortOrder = 110;
    const label = this._root.createChild("Save status");
    this._text = label.addComponent(Text);
    const transform = label.transform as UITransform;
    transform.horizontalAlignment = HorizontalAlignmentMode.Right;
    transform.verticalAlignment = VerticalAlignmentMode.Bottom;
    transform.alignRight = 18;
    transform.alignBottom = 18;
    transform.size.set(300, 36);
    this._text.fontSize = 18;
    this._text.horizontalAlignment = TextHorizontalAlignment.Right;
    this._text.verticalAlignment = TextVerticalAlignment.Center;
    this._input = label.addComponent(SaveRetryInput);
    this._input.update = (deltaSeconds) => {
      this._presentation.update(deltaSeconds);
      this._refresh();
    };
    this.setStatus("saved");
  }

  setStatus(status: SeedWorldSaveStatus): void {
    this._presentation.setStatus(status);
    this._refresh();
  }

  private _refresh(): void {
    const { status, opacity } = this._presentation;
    if (status === this._drawnStatus && opacity === this._drawnOpacity) return;
    this._drawnStatus = status;
    this._drawnOpacity = opacity;
    this._text.text = { pending: "", saving: "保存中…", saved: "已保存", "save-error": "保存失败 · 点击重试" }[status];
    this._text.color = status === "save-error" ? new Color(1, 0.55, 0.4, opacity) : new Color(0.85, 0.87, 0.9, 0.9 * opacity);
    this._text.enabled = opacity > 0;
    this._text.raycastEnabled = status === "save-error" && opacity > 0;
    this._input.retry = status === "save-error" && opacity > 0 ? this._retry : undefined;
  }

  destroy(): void { this._root.destroy(); }
}
