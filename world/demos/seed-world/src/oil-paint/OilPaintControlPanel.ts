import { Vector4, type PostProcessPass, type Scene, type VolumetricLightEffect } from "@galacean/engine";
import type { OilPaintPostEffect } from "./OilPaintPostEffect";

export interface OilPaintControlsHost {
  readonly oilPaintEffect: OilPaintPostEffect;
  readonly oilPaintPass: PostProcessPass;
  readonly volumetricLightEffect: VolumetricLightEffect;
  readonly scene: Scene;
  setVolumetricLightEnabled?: (enabled: boolean) => void;
  getShaderMacroEnabled(): boolean;
  setShaderMacroEnabled(enabled: boolean): void;
  initiallyExpanded?: boolean;
}

export interface OilPaintControlPanelHandle {
  setVisible(visible: boolean): void;
  destroy(): void;
}

interface SliderSpec {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly read: () => number;
  readonly write: (value: number) => void;
}

const OIL_DEFAULTS = {
  painterlyStrength: 0.5,
  brushRadius: 2.9,
  strokeAnisotropy: 1.45,
  colorStylize: 0.42,
  screenImpasto: 0.3,
  impasto: 1.0,
  brushScale: 1.0,
  compareSplit: 0
} as const;

const VL_DEFAULTS = {
  intensity: 0.6,
  density: 0.72,
  decay: 0.93
} as const;

/**
 * Compact collapsible floating panel for live-tuning `OilPaintPostEffect`,
 * `VolumetricLightEffect`, and the scene-wide `SCENE_OIL_PAINT_STYLE` shader macro.
 */
export function createOilPaintControlPanel(
  container: HTMLElement,
  host: OilPaintControlsHost
): OilPaintControlPanelHandle {
  const root = document.createElement("div");
  root.dataset.oilPaintControls = "true";
  Object.assign(root.style, {
    position: "fixed",
    left: "50%",
    bottom: "16px",
    transform: "translateX(-50%)",
    zIndex: "100",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: "12px",
    color: "#f8f4ea",
    userSelect: "none",
    display: "none",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px"
  });

  const panel = document.createElement("div");
  let expanded = Boolean(host.initiallyExpanded);
  Object.assign(panel.style, {
    width: "282px",
    maxHeight: "76vh",
    overflowY: "auto",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "rgba(24, 19, 16, 0.86)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255, 228, 176, 0.26)",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
    display: expanded ? "flex" : "none",
    flexDirection: "column",
    gap: "7px"
  });

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.textContent = expanded ? "收起油画参数" : "油画 & 体积光调优";
  Object.assign(toggleBtn.style, {
    padding: "7px 12px",
    borderRadius: "999px",
    border: "1px solid rgba(255, 228, 176, 0.35)",
    background: "rgba(38, 28, 20, 0.86)",
    color: "#ffecd0",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    backdropFilter: "blur(8px)",
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.28)"
  });

  toggleBtn.addEventListener("click", () => {
    expanded = !expanded;
    panel.style.display = expanded ? "flex" : "none";
    toggleBtn.textContent = expanded ? "收起油画参数" : "油画 & 体积光调优";
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: "6px",
    borderBottom: "1px solid rgba(255, 228, 176, 0.16)"
  });
  const title = document.createElement("span");
  title.textContent = "Oil Paint & Volumetric Light";
  title.style.fontWeight = "600";
  title.style.color = "#ffe6b8";

  const rightGroup = document.createElement("div");
  Object.assign(rightGroup.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px"
  });

  const fpsBadge = document.createElement("span");
  fpsBadge.dataset.oilPaintFps = "true";
  fpsBadge.textContent = "-- FPS";
  Object.assign(fpsBadge.style, {
    fontSize: "11px",
    fontVariantNumeric: "tabular-nums",
    color: "#9ef0a8",
    background: "rgba(0, 0, 0, 0.32)",
    padding: "2px 6px",
    borderRadius: "6px"
  });

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.textContent = "重置";
  Object.assign(resetBtn.style, {
    padding: "2px 8px",
    borderRadius: "6px",
    border: "1px solid rgba(255, 228, 176, 0.25)",
    background: "rgba(255, 228, 176, 0.1)",
    color: "#ffecd0",
    fontSize: "11px",
    cursor: "pointer"
  });

  rightGroup.append(fpsBadge, resetBtn);
  header.append(title, rightGroup);
  panel.appendChild(header);

  const updaters: Array<() => void> = [];

  const addSection = (text: string) => {
    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, {
      marginTop: "4px",
      paddingTop: "4px",
      borderTop: "1px solid rgba(255, 228, 176, 0.12)",
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.04em",
      color: "#f2c572"
    });
    panel.appendChild(el);
  };

  const addCheckbox = (labelText: string, read: () => boolean, write: (v: boolean) => void) => {
    const row = document.createElement("label");
    Object.assign(row.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      cursor: "pointer"
    });
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = read();
    input.addEventListener("change", () => write(input.checked));
    row.append(label, input);
    panel.appendChild(row);
    updaters.push(() => {
      input.checked = read();
    });
  };

  const addSlider = (spec: SliderSpec) => {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      flexDirection: "column",
      gap: "2px"
    });
    const top = document.createElement("div");
    Object.assign(top.style, {
      display: "flex",
      justifyContent: "space-between",
      fontSize: "11px",
      color: "rgba(255, 240, 215, 0.9)"
    });
    const label = document.createElement("span");
    label.textContent = spec.label;
    const valEl = document.createElement("span");
    valEl.style.fontVariantNumeric = "tabular-nums";
    valEl.textContent = spec.read().toFixed(spec.step < 0.01 ? 3 : 2);
    top.append(label, valEl);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(spec.read());
    input.style.width = "100%";
    input.style.accentColor = "#f0b95b";
    input.addEventListener("input", () => {
      const value = Number.parseFloat(input.value);
      spec.write(value);
      valEl.textContent = value.toFixed(spec.step < 0.01 ? 3 : 2);
    });

    row.append(top, input);
    panel.appendChild(row);
    updaters.push(() => {
      const current = spec.read();
      input.value = String(current);
      valEl.textContent = current.toFixed(spec.step < 0.01 ? 3 : 2);
    });
  };

  addCheckbox(
    "油画后处理 (OilPaintPass)",
    () => host.oilPaintPass.isActive,
    (v) => {
      host.oilPaintPass.isActive = v;
    }
  );
  addCheckbox(
    "体积光 (VolumetricLightEffect)",
    () => host.volumetricLightEffect.enabled,
    (v) => {
      if (host.setVolumetricLightEnabled) {
        host.setVolumetricLightEnabled(v);
      } else {
        host.volumetricLightEffect.enabled = v;
      }
    }
  );
  addCheckbox(
    "场景材质宏 (SCENE_OIL_PAINT_STYLE)",
    () => host.getShaderMacroEnabled(),
    (v) => {
      host.setShaderMacroEnabled(v);
    }
  );

  addSection("油画笔触后处理 (Anisotropic Kuwahara)");
  addSlider({
    label: "笔触油画强度",
    min: 0,
    max: 1,
    step: 0.01,
    read: () => host.oilPaintEffect.painterlyStrength.value,
    write: (v) => {
      host.oilPaintEffect.painterlyStrength.value = v;
    }
  });
  addSlider({
    label: "笔触采样半径 (短边等比)",
    min: 0,
    max: 14,
    step: 0.01,
    read: () => host.oilPaintEffect.brushRadius.value,
    write: (v) => {
      host.oilPaintEffect.brushRadius.value = v;
    }
  });
  addSlider({
    label: "笔触沿边缘拉长 (各向异性)",
    min: 0,
    max: 2.5,
    step: 0.01,
    read: () => host.oilPaintEffect.strokeAnisotropy.value,
    write: (v) => {
      host.oilPaintEffect.strokeAnisotropy.value = v;
    }
  });
  addSlider({
    label: "油画色阶与冷暖分色",
    min: 0,
    max: 1,
    step: 0.01,
    read: () => host.oilPaintEffect.colorStylize.value,
    write: (v) => {
      host.oilPaintEffect.colorStylize.value = v;
    }
  });
  addSlider({
    label: "画面笔触浮雕高光",
    min: 0,
    max: 1.5,
    step: 0.01,
    read: () => host.oilPaintEffect.screenImpasto.value,
    write: (v) => {
      host.oilPaintEffect.screenImpasto.value = v;
    }
  });
  addSlider({
    label: "A/B 分屏对比 (左原画 | 右油画)",
    min: 0,
    max: 1,
    step: 0.01,
    read: () => host.oilPaintEffect.compareSplit.value,
    write: (v) => {
      host.oilPaintEffect.compareSplit.value = v;
    }
  });

  addSection("3D 表面笔触材质 (SCENE_OIL_PAINT_STYLE)");
  addSlider({
    label: "3D 厚涂笔触 (Impasto)",
    min: 0,
    max: 2,
    step: 0.01,
    read: () => host.oilPaintEffect.impasto.value,
    write: (v) => {
      host.oilPaintEffect.impasto.value = v;
      host.scene.shaderData.setFloat("scene_OilPaintImpasto", v);
    }
  });
  addSlider({
    label: "3D 笔触密度",
    min: 0.2,
    max: 2.5,
    step: 0.01,
    read: () => host.oilPaintEffect.brushScale.value,
    write: (v) => {
      host.oilPaintEffect.brushScale.value = v;
      host.scene.shaderData.setFloat("scene_OilPaintBrushScale", v);
    }
  });

  addSection("屏幕空间体积光 (1/4 分辨率 2-FBO)");
  addSlider({
    label: "体积光强度",
    min: 0,
    max: 2.5,
    step: 0.01,
    read: () => host.volumetricLightEffect.intensity.value,
    write: (v) => {
      host.volumetricLightEffect.intensity.value = v;
    }
  });
  addSlider({
    label: "光束延伸密度",
    min: 0.2,
    max: 1.5,
    step: 0.01,
    read: () => host.volumetricLightEffect.density.value,
    write: (v) => {
      host.volumetricLightEffect.density.value = v;
    }
  });
  addSlider({
    label: "光束衰减系数",
    min: 0.75,
    max: 0.99,
    step: 0.01,
    read: () => host.volumetricLightEffect.decay.value,
    write: (v) => {
      host.volumetricLightEffect.decay.value = v;
    }
  });

  addSection("植被风动高度阈值 (下段锁根)");
  let windHeightStartRatio = 0.5;
  const applyWindHeightStart = (v: number) => {
    windHeightStartRatio = v;
    const shape = host.scene.shaderData.getVector4("scene_GroundWindShape");
    if (shape) {
      shape.w = v;
      host.scene.shaderData.setVector4("scene_GroundWindShape", shape);
    } else {
      host.scene.shaderData.setVector4("scene_GroundWindShape", new Vector4(1, 0.35, 0, v));
    }
    const stack = [...host.scene.rootEntities];
    while (stack.length > 0) {
      const ent = stack.pop()!;
      for (const child of ent.children) stack.push(child);
      const comps = (ent as unknown as { _components?: Array<{ constructor?: { name?: string }; windHeightStartRatio?: number }> })._components;
      if (!comps) continue;
      for (const comp of comps) {
        if (comp.constructor?.name === "PlanningGroundWind") {
          comp.windHeightStartRatio = v;
        }
      }
    }
  };
  addSlider({
    label: "风动起始高度 (>50%才动)",
    min: 0,
    max: 0.85,
    step: 0.05,
    read: () => {
      const shape = host.scene.shaderData.getVector4("scene_GroundWindShape");
      return shape ? shape.w : windHeightStartRatio;
    },
    write: applyWindHeightStart
  });

  resetBtn.addEventListener("click", () => {
    host.oilPaintPass.isActive = true;
    if (host.setVolumetricLightEnabled) {
      host.setVolumetricLightEnabled(true);
    } else {
      host.volumetricLightEffect.enabled = true;
    }
    host.setShaderMacroEnabled(true);
    host.oilPaintEffect.painterlyStrength.value = OIL_DEFAULTS.painterlyStrength;
    host.oilPaintEffect.brushRadius.value = OIL_DEFAULTS.brushRadius;
    host.oilPaintEffect.strokeAnisotropy.value = OIL_DEFAULTS.strokeAnisotropy;
    host.oilPaintEffect.colorStylize.value = OIL_DEFAULTS.colorStylize;
    host.oilPaintEffect.screenImpasto.value = OIL_DEFAULTS.screenImpasto;
    host.oilPaintEffect.impasto.value = OIL_DEFAULTS.impasto;
    host.oilPaintEffect.brushScale.value = OIL_DEFAULTS.brushScale;
    host.oilPaintEffect.compareSplit.value = OIL_DEFAULTS.compareSplit;
    host.volumetricLightEffect.intensity.value = VL_DEFAULTS.intensity;
    host.volumetricLightEffect.density.value = VL_DEFAULTS.density;
    host.volumetricLightEffect.decay.value = VL_DEFAULTS.decay;
    host.scene.shaderData.setFloat("scene_OilPaintImpasto", OIL_DEFAULTS.impasto);
    host.scene.shaderData.setFloat("scene_OilPaintBrushScale", OIL_DEFAULTS.brushScale);
    applyWindHeightStart(0.5);
    for (const update of updaters) update();
  });

  root.append(panel, toggleBtn);
  container.appendChild(root);

  let visible = false;
  let rafId = 0;
  let sampleFrames = 0;
  let sampleStart = 0;
  const tickFps = (now: number) => {
    if (!visible) {
      rafId = 0;
      return;
    }
    if (sampleStart === 0) {
      sampleStart = now;
      sampleFrames = 0;
    } else {
      sampleFrames++;
      const elapsed = now - sampleStart;
      if (elapsed >= 500) {
        const fps = (sampleFrames * 1000) / elapsed;
        const ms = elapsed / sampleFrames;
        const fpsText = `${fps.toFixed(0)} FPS (${ms.toFixed(1)}ms)`;
        fpsBadge.textContent = fpsText;
        root.dataset.fps = fps.toFixed(1);
        root.dataset.frameMs = ms.toFixed(1);
        sampleStart = now;
        sampleFrames = 0;
      }
    }
    rafId = requestAnimationFrame(tickFps);
  };

  return {
    setVisible(nextVisible: boolean) {
      visible = nextVisible;
      root.style.display = nextVisible ? "flex" : "none";
      if (nextVisible) {
        for (const update of updaters) update();
        if (!rafId) {
          sampleStart = 0;
          sampleFrames = 0;
          rafId = requestAnimationFrame(tickFps);
        }
      } else if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    destroy() {
      visible = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      root.remove();
    }
  };
}
