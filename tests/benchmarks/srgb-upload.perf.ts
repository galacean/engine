import { expect, it } from "vitest";
import { benchmarkSRGBUploads } from "./srgb-upload";

it("measures validated sRGB uploads across three alternating repeats", async () => {
  const result = await benchmarkSRGBUploads();
  expect(result.samples).toHaveLength(2025);
  // Keep every sample; derive medians and tail statistics after the run, outside the measured interval.
  console.log("SRGB_BENCHMARK_JSON=" + JSON.stringify(result));
});
