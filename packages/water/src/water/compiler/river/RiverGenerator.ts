import type { RiverEditablePoint } from "../../authoring/river/RiverEditDocument";
import {
  RIVER_GENERATOR_VERSION,
  RiverGenerationInputError,
  validateRiverGenerationParameters,
  type RiverGenerationParameters,
  type RiverGenerationSource
} from "../../authoring/river/RiverGenerationParameters";
import { hashRiverStableValue } from "../shared/determinism";
import type { RiverEditDiagnostic } from "./RiverEditDiagnostics";
import { RIVER_MAX_WATER_SURFACE_SLOPE } from "./constants";

export type RiverGenerationResult =
  | {
      ok: true;
      points: RiverEditablePoint[];
      generation: RiverGenerationSource;
      length: number;
      diagnostics: RiverEditDiagnostic[];
    }
  | { ok: false; diagnostics: RiverEditDiagnostic[] };

/** Hash authored geometry/flow; changing a UI elevation lock does not change the generated shape. */
export function hashRiverGeneratedPoints(points: readonly RiverEditablePoint[]): string {
  return hashRiverStableValue(points.map(({ id, position, width, flowSpeed }) => ({ id, position, width, flowSpeed })));
}

/** Deterministic authoring only. The edit session additionally validates the production mesh and terrain. */
export function generateRiver(parameters: RiverGenerationParameters): RiverGenerationResult {
  try {
    const p = validateRiverGenerationParameters(parameters);
    const dx = p.mouth[0] - p.source[0],
      dz = p.mouth[2] - p.source[2];
    const distance = Math.hypot(dx, dz);
    if (distance < 0.1 * (p.pointCount - 1))
      throw new RiverGenerationInputError("mouth", "河源与出口过近，请拉开端点或减少控制点");
    if (p.mouth[1] > p.source[1]) throw new RiverGenerationInputError("mouth[1]", "出口水面不能高于河源水面");
    // Mulberry32. Its integer operations, draw order and shape formula are versioned together.
    let state = p.seed >>> 0;
    const random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    };
    const phaseA = random() * Math.PI * 2,
      phaseB = random() * Math.PI * 2;
    // Transcendental operations can differ in the last bits across JS runtimes.
    // Canonicalize generated coordinates to one micrometre; authored endpoints stay exact.
    const coordinate = (value: number) => Math.round(value * 1e6) / 1e6;
    const lengths = [0];
    const points: RiverEditablePoint[] = Array.from({ length: p.pointCount }, (_, i) => {
      const t = i / (p.pointCount - 1);
      const lateral =
        p.meanderAmplitude *
        Math.sin(Math.PI * t) ** 2 *
        (0.7 * Math.sin(2 * Math.PI * p.bendCount * t + phaseA) +
          0.3 * Math.sin(2 * Math.PI * (p.bendCount + 1) * t + phaseB));
      const position: [number, number, number] =
        i === 0
          ? [...p.source]
          : i === p.pointCount - 1
            ? [...p.mouth]
            : [
                coordinate(p.source[0] + dx * t - (dz / distance) * lateral),
                0,
                coordinate(p.source[2] + dz * t + (dx / distance) * lateral)
              ];
      return {
        id: `generated-point-${i + 1}`,
        position,
        width: p.width,
        flowSpeed: p.flowSpeed,
        elevationLocked: true
      };
    });
    for (let i = 1; i < points.length; i++)
      lengths.push(
        lengths[i - 1] +
          Math.hypot(
            points[i].position[0] - points[i - 1].position[0],
            points[i].position[2] - points[i - 1].position[2]
          )
      );
    const length = lengths.at(-1)!;
    if ((p.source[1] - p.mouth[1]) / length > RIVER_MAX_WATER_SURFACE_SLOPE)
      throw new RiverGenerationInputError(
        "mouth[1]",
        `水面坡度超过 ${RIVER_MAX_WATER_SURFACE_SLOPE}，请减小起终点高差`
      );
    for (let i = 1; i < points.length - 1; i++)
      points[i].position[1] = Math.max(
        p.mouth[1],
        Math.min(p.source[1], coordinate(p.source[1] + ((p.mouth[1] - p.source[1]) * lengths[i]) / length))
      );
    return {
      ok: true,
      points,
      length: coordinate(length),
      diagnostics: [],
      generation: {
        generatorVersion: RIVER_GENERATOR_VERSION,
        parameters: p,
        generatedPointsHash: hashRiverGeneratedPoints(points)
      }
    };
  } catch (error) {
    if (!(error instanceof RiverGenerationInputError)) throw error;
    return {
      ok: false,
      diagnostics: [
        { code: "generation-input", severity: "error", path: error.path, message: error.message, pointIndices: [] }
      ]
    };
  }
}
