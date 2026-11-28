import type * as dat from "dat.gui";
import { Color } from "@galacean/engine-math";

export type LinearRgb = readonly [number, number, number];
export interface HdrColorState {
  color: string;
  intensity: number;
  /** Retain source precision until the artist changes the displayed colour. */
  linear: LinearRgb;
}

export function linearColorToHex(color: LinearRgb): string {
  return (
    "#" +
    color
      .map((channel) =>
        Math.round(Color.linearToGammaSpace(channel) * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

export function hexToLinearColor(hex: string): LinearRgb {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error("颜色必须为六位 HEX");
  return [1, 3, 5].map((offset) =>
    Color.gammaToLinearSpace(parseInt(hex.slice(offset, offset + 2), 16) / 255)
  ) as unknown as LinearRgb;
}

/** Decompose only HDR values; ordinary artist HEX colours retain intensity 1. */
export function createHdrColorState(color: LinearRgb): HdrColorState {
  validateLinearColor(color);
  const intensity = Math.max(1, ...color);
  const linear = color.map((value) => value / intensity) as unknown as LinearRgb;
  return { color: linearColorToHex(linear), intensity, linear };
}

/** Decode sRGB first, then apply the linear gain. Alpha is owned by the caller. */
export function hdrColorToLinear(state: HdrColorState): LinearRgb {
  if (!Number.isFinite(state.intensity) || state.intensity < 0) throw new Error("颜色强度须为有限非负数");
  const linear =
    state.color.toLowerCase() === linearColorToHex(state.linear) ? state.linear : hexToLinearColor(state.color);
  const result = linear.map((value) => value * state.intensity) as unknown as LinearRgb;
  validateLinearColor(result);
  return result;
}

/** Retain the artist's colour/gain split, including zero gain, while values match. */
export function synchronizeHdrColor(state: HdrColorState, color: LinearRgb): void {
  if (hdrColorToLinear(state).every((value, index) => value === color[index])) return;
  Object.assign(state, createHdrColorState(color));
}

function validateLinearColor(color: LinearRgb): void {
  if (color.length !== 3 || !color.every((value) => Number.isFinite(value) && value >= 0))
    throw new Error("HDR 颜色须包含三个有限非负通道");
}

/** A colour picker followed by an unbounded nonnegative linear intensity input. */
export function addHdrColorControl(
  folder: dat.GUI,
  state: HdrColorState,
  label: string,
  onChange: (color: LinearRgb) => void,
  accessibleLabel = label
): readonly dat.GUIController[] {
  const apply = () => onChange(hdrColorToLinear(state));
  const color = folder.addColor(state, "color").name(label).onChange(apply);
  const colorInput = color.domElement.querySelector("input")!;
  colorInput.setAttribute("aria-label", accessibleLabel);
  // dat.gui commits text colours on blur/Enter. Use its controller for complete
  // HEX input too, so typing and pasting have the same immediate path as dragging.
  colorInput.addEventListener("input", () => {
    if (/^#[\da-f]{6}$/i.test(colorInput.value)) color.setValue(colorInput.value.toLowerCase());
  });
  const intensity = folder.add(state, "intensity").min(0).name("Intensity / 强度").onChange(apply);
  const input = intensity.domElement.querySelector("input")!;
  input.type = "number";
  input.min = "0";
  input.step = "any";
  input.setAttribute("aria-label", `${accessibleLabel} Intensity`);
  input.title = "线性颜色 × Intensity；1 保持原色，0 为黑色，大于 1 支持 HDR";
  const update = intensity.updateDisplay.bind(intensity);
  intensity.updateDisplay = () => {
    update();
    input.value = String(state.intensity);
    return intensity;
  };
  input.addEventListener("input", () => {
    if (!input.value.trim() || !Number.isFinite(input.valueAsNumber) || input.valueAsNumber < 0) return;
    state.intensity = input.valueAsNumber;
    apply();
  });
  intensity.updateDisplay();
  return [color, intensity];
}
