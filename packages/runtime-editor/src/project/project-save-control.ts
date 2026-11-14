import { PointerButton, Script, TextHorizontalAlignment, type PointerEventData, type Scene } from "@galacean/engine";
import {
  CanvasRenderMode,
  HorizontalAlignmentMode,
  ResolutionAdaptationMode,
  Text,
  UICanvas,
  UITransform,
  VerticalAlignmentMode
} from "@galacean/engine-ui";
import type { RuntimeProjectSession } from "./runtime-project-session.ts";

/** Projects persistence state; InputManager owns hover and retry hit testing. */
class ProjectSaveIndicator extends Script {
  private project?: RuntimeProjectSession;
  private label!: Text;
  private hovered = false;
  private targetAlpha = 0.42;
  private startAlpha = 0.42;
  private fadeTime = 0.2;
  private readonly reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  private unsubscribe?: () => void;
  private observer?: ResizeObserver;
  private safeArea?: HTMLDivElement;
  private abort?: AbortController;

  initialize(project: RuntimeProjectSession, canvasElement: HTMLCanvasElement): void {
    this.project = project;
    const canvas = this.entity.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    canvas.resolutionAdaptationMode = ResolutionAdaptationMode.BothAdaptation;
    // Below photo/voice modal input, above the world's fallback drag surface.
    canvas.sortOrder = 100;
    const labelEntity = this.entity.createChild("Project save status");
    this.label = labelEntity.addComponent(Text);
    this.label.fontSize = 11;
    this.label.horizontalAlignment = TextHorizontalAlignment.Left;
    this.label.color.set(0.93, 0.96, 0.94, 0.42);
    // Events are dispatched on the hit entity, not on its canvas parent.
    labelEntity.addComponent(ProjectSavePointer).owner = this;
    const transform = labelEntity.transform as UITransform;
    transform.horizontalAlignment = HorizontalAlignmentMode.Left;
    transform.verticalAlignment = VerticalAlignmentMode.Bottom;
    transform.size.set(132, 32);

    // CSS env() is a browser inset measurement only; all visible UI is engine Text.
    const safeArea = (this.safeArea = document.createElement("div"));
    safeArea.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-bottom:env(safe-area-inset-bottom)";
    document.body.append(safeArea);
    const resize = () => {
      canvas.referenceResolution.set(Math.max(canvasElement.clientWidth, 1), Math.max(canvasElement.clientHeight, 1));
      const insets = getComputedStyle(safeArea);
      transform.alignLeft = 20 + (parseFloat(insets.paddingLeft) || 0);
      transform.alignBottom = 12 + (parseFloat(insets.paddingBottom) || 0);
    };
    this.observer = new ResizeObserver(resize);
    this.observer.observe(canvasElement);
    this.abort = new AbortController();
    const signal = this.abort.signal;
    window.addEventListener("resize", resize, { signal });
    window.addEventListener("blur", () => this.setHovered(false), { signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") this.flush();
      },
      { signal }
    );
    window.addEventListener(
      "beforeunload",
      (event) => {
        const status = project.persistenceStatus;
        if (status.commitSeq > status.savedSeq) {
          event.preventDefault();
          event.returnValue = "";
        }
      },
      { signal }
    );
    this.unsubscribe = project.subscribePersistence(() => this.updateStatus());
    resize();
    this.updateStatus();
  }

  setHovered(value: boolean): void {
    this.hovered = value;
    this.updateStatus();
  }

  retry(): void {
    if (this.project?.persistenceStatus.state === "failed") this.flush();
  }

  private flush(): void {
    void this.project?.flush().catch(() => {
      /* Persistence owns failure and publishes it to this view. */
    });
  }

  private updateStatus(): void {
    if (!this.project) return;
    const state = this.project.persistenceStatus.state;
    this.label.text =
      state === "disposed"
        ? ""
        : state === "failed"
          ? "保存失败 · 点击重试"
          : state === "saving"
            ? "保存中…"
            : state === "pending"
              ? "待保存"
              : "已保存";
    // Keep the hit region local to the text, while allowing a comfortable vertical target.
    (this.label.entity.transform as UITransform).size.x = Math.max(44, this.label.text.length * 11);
    this.label.raycastEnabled = state !== "disposed";
    const targetAlpha = this.hovered ? 0.9 : state === "failed" ? 0.8 : state === "saved" ? 0.42 : 0.6;
    if (targetAlpha !== this.targetAlpha) {
      this.startAlpha = this.label.color.a;
      this.targetAlpha = targetAlpha;
      this.fadeTime = 0;
    }
    const alpha = this.label.color.a;
    if (state === "failed") this.label.color.set(0.96, 0.83, 0.64, alpha);
    else this.label.color.set(0.93, 0.96, 0.94, alpha);
  }

  override onUpdate(deltaTime: number): void {
    if (!this.label || this.label.color.a === this.targetAlpha) return;
    this.fadeTime = Math.min(0.2, this.fadeTime + deltaTime);
    this.label.color.a =
      this.reducedMotion.matches || this.fadeTime === 0.2
        ? this.targetAlpha
        : this.startAlpha + (this.targetAlpha - this.startAlpha) * (this.fadeTime / 0.2);
  }

  override onDestroy(): void {
    this.unsubscribe?.();
    this.observer?.disconnect();
    this.abort?.abort();
    this.safeArea?.remove();
    this.project = undefined;
  }
}

class ProjectSavePointer extends Script {
  owner?: ProjectSaveIndicator;
  override onPointerEnter(): void {
    this.owner?.setHovered(true);
  }
  override onPointerExit(): void {
    this.owner?.setHovered(false);
  }
  override onPointerClick(event: PointerEventData): void {
    if (event.pointer.button === PointerButton.Primary) this.owner?.retry();
  }
  override onDestroy(): void {
    this.owner = undefined;
  }
}

/** The scene owns the UI entity; unmount before disposing the project or engine. */
export function mountProjectSaveControl(
  project: RuntimeProjectSession,
  scene: Scene,
  canvas: HTMLCanvasElement
): () => void {
  const root = scene.createRootEntity("Project persistence HUD");
  try {
    root.addComponent(ProjectSaveIndicator).initialize(project, canvas);
  } catch (error) {
    root.destroy();
    throw error;
  }
  return () => root.destroy();
}
