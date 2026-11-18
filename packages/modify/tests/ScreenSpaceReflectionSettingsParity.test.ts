import baseline from "./fixtures/ssr-settings-baseline.json";
import { ScreenSpaceReflection as SSR, ScreenSpaceReflectionSettings as Settings } from "@galacean/engine";
import { expect, it } from "vitest";

const VALUES = [undefined, NaN, Infinity, -Infinity, -1, 0, 0.00001, 0.25, 0.5, 1, 2, 3, 5, 32.5, 64, 100];
it("preserves defaults, presets and all normalization boundaries", () => {
  const trace = (SSR as unknown as { _sanitizeTraceSettingsOverride(value: object): object })
    ._sanitizeTraceSettingsOverride;
  const rows = Object.keys(Settings.defaults).flatMap((key) =>
    VALUES.map((value, index) => {
      const input = { [key]: value };
      return {
        key,
        index,
        author: Settings.normalize(input),
        consumer: SSR._sanitizeConsumerRequest(input),
        trace: trace(input)
      };
    })
  );
  const result = {
    defaults: Settings.defaults,
    presets: [0, 1, 2, -1, NaN].map((quality) => SSR.getQualityPreset(quality)),
    rows
  };
  expect(JSON.parse(JSON.stringify(result))).toEqual(baseline);
  expect(rows.length).toBe(Object.keys(Settings.defaults).length * VALUES.length);
});
