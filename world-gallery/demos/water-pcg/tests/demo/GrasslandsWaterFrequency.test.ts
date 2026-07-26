import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frequencyModuleUrl = new URL("../../e2e/grasslands-water-frequency.mjs", import.meta.url).href;

interface FrequencyProbeResult {
  readonly algorithm: string;
  readonly targetPeak: number;
  readonly candidatePeak: number;
  readonly gateStatus: string;
  readonly relativeError: number;
  readonly constantDegraded: boolean;
}

function runFrequencyProbe(): FrequencyProbeResult {
  const script = `
    import {
      analyzeGrasslandsDetailFrequency,
      evaluateGrasslandsDetailFrequencyParity
    } from ${JSON.stringify(frequencyModuleUrl)};

    const createChannels = (redCycles, weakCycles) => {
      const width = 128;
      const height = 128;
      const rgbaBytes = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const red = Math.round(127.5 + 100 * Math.sin(2 * Math.PI * redCycles * x / width));
          const weak = Math.round(127.5 + Math.sin(2 * Math.PI * weakCycles * x / width));
          rgbaBytes.push(red, weak, weak, 255);
        }
      }
      return { width, height, rgbaBytes };
    };

    const target = analyzeGrasslandsDetailFrequency(createChannels(12, 40));
    const candidate = analyzeGrasslandsDetailFrequency(createChannels(18, 40));
    const gate = evaluateGrasslandsDetailFrequencyParity(target, candidate, 0.1);
    const constant = analyzeGrasslandsDetailFrequency({
      width: 128,
      height: 128,
      rgbaBytes: Array.from({ length: 128 * 128 * 4 }, (_value, index) => index % 4 === 3 ? 255 : 128)
    });
    process.stdout.write(JSON.stringify({
      algorithm: target.algorithm,
      targetPeak: target.primaryPeak.cyclesPerPixel,
      candidatePeak: candidate.primaryPeak.cyclesPerPixel,
      gateStatus: gate.status,
      relativeError: gate.relativeError,
      constantDegraded: constant.degraded
    }));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: fileURLToPath(new URL("../../../..", import.meta.url)),
      encoding: "utf8"
    })
  ) as FrequencyProbeResult;
}

describe("Grasslands detail-normal frequency Gate", () => {
  it("weights RGB spectra by residual energy so weak shared noise cannot hide a changed dominant ripple", () => {
    const result = runFrequencyProbe();
    expect(result.algorithm).toBe("grasslands-detail-frequency-v3-banded-energy-weighted-derivative");
    expect(result.targetPeak).toBe(12 / 128);
    expect(result.candidatePeak).toBe(18 / 128);
    expect(result.relativeError).toBe(0.5);
    expect(result.gateStatus).toBe("unmet");
    expect(result.constantDegraded).toBe(true);
  });
});
