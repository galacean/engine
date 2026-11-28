import { describe, expect, it, vi } from "vitest";
import {
  addHdrColorControl,
  createHdrColorState,
  hdrColorToLinear,
  hexToLinearColor,
  synchronizeHdrColor
} from "@galacean/engine-world-planning/integrations/terrain/debug/HdrColorControl";

describe("HDR colour and linear intensity", () => {
  it("commits a complete typed HEX through the colour controller before blur, retaining the current intensity", () => {
    const input = () => ({
      value: "",
      events: {} as Record<string, () => void>,
      setAttribute() {},
      addEventListener(name: string, callback: () => void) {
        this.events[name] = callback;
      }
    });
    const colourInput = input(),
      intensityInput = input(),
      state = createHdrColorState(hexToLinearColor("#ff8ea0"));
    state.intensity = 2.5;
    const controller = (element: ReturnType<typeof input>, set?: (value: string) => void) => ({
      change: () => {},
      domElement: { querySelector: () => element },
      name() {
        return this;
      },
      min() {
        return this;
      },
      updateDisplay() {
        return this;
      },
      onChange(callback: () => void) {
        this.change = callback;
        return this;
      },
      setValue(value: string) {
        set?.(value);
        this.change();
        return this;
      }
    });
    const colour = controller(colourInput, (value) => {
        state.color = value;
      }),
      gain = controller(intensityInput),
      changed = vi.fn();
    addHdrColorControl({ addColor: () => colour, add: () => gain } as never, state, "Colour", changed);
    colourInput.value = "#00ff00";
    colourInput.events.input();
    expect(changed).toHaveBeenLastCalledWith([0, 2.5, 0]);
    colourInput.value = "#ff";
    colourInput.events.input();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(state.intensity).toBe(2.5);
  });

  it("multiplies decoded linear RGB rather than the HEX channels, preserving colour ratios above one", () => {
    const state = createHdrColorState(hexToLinearColor("#ff8ea0"));
    const original = hdrColorToLinear(state);
    state.intensity = 3.5;
    hdrColorToLinear(state).forEach((value, channel) => expect(value).toBe(original[channel] * 3.5));
    expect(state.color).toBe("#ff8ea0");
    expect(hdrColorToLinear(state)[0]).toBeGreaterThan(1);
  });

  it("reads existing HDR energy without clipping and preserves source precision", () => {
    for (const rgb of [
      [0, 0, 0],
      [0.123456789, 0.039, 0.71],
      [8, 2.5, 0.02]
    ] as const) {
      const state = createHdrColorState(rgb);
      hdrColorToLinear(state).forEach((value, channel) => expect(value).toBeCloseTo(rgb[channel], 14));
      state.intensity *= 2;
      hdrColorToLinear(state).forEach((value, channel) => expect(value).toBeCloseTo(rgb[channel] * 2, 14));
    }
  });

  it("retains the picked hue and gain while switching away and back, including zero intensity", () => {
    const state = createHdrColorState(hexToLinearColor("#f78f95"));
    for (const intensity of [0, 0.25, 4]) {
      state.intensity = intensity;
      synchronizeHdrColor(state, hdrColorToLinear(state));
      expect(state).toMatchObject({ color: "#f78f95", intensity });
    }
    synchronizeHdrColor(state, [4, 2, 1]);
    expect(state.intensity).toBe(4);
    expect(hdrColorToLinear(state)).toEqual([4, 2, 1]);
  });

  it("rejects negative or nonfinite colour energy", () => {
    const state = createHdrColorState([1, 0.5, 0]);
    for (const intensity of [-1, NaN, Infinity]) expect(() => hdrColorToLinear({ ...state, intensity })).toThrow();
    for (const rgb of [
      [-1, 0, 0],
      [Infinity, 0, 0],
      [NaN, 0, 0]
    ] as const)
      expect(() => createHdrColorState(rgb)).toThrow();
  });
});
