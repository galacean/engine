/** Strict decoding and semantic validation for Ocean nearshore descriptors. */
import type {
  OceanCircleObstacleDescriptor,
  OceanEllipseObstacleDescriptor,
  OceanObstacleDescriptor,
  OceanObstacleVector2
} from "../../authoring/ocean/OceanObstacleTypes";
import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import {
  OceanNearshoreDiagnosticCode,
  OceanNearshoreDiagnosticSeverity,
  OceanNearshoreOutsidePolicy,
  OceanNearshoreSchemaVersion,
  type OceanNearshoreBudgetConfig,
  type OceanNearshoreDiagnostic,
  type OceanNearshoreGridConfig,
  type OceanNearshoreMaskWetSource,
  type OceanNearshoreOutsidePolicies,
  type OceanNearshoreValidationResult,
  type OceanNearshoreVector2,
  type OceanNearshoreWaterLevelWetSource,
  type OceanNearshoreWetSource,
  type ValidatedOceanNearshoreDescriptor
} from "../../authoring/ocean/OceanNearshoreTypes";
import {
  OCEAN_NEARSHORE_DEFAULT_BUDGET,
  OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH,
  OCEAN_NEARSHORE_HARD_BUDGET,
  OCEAN_NEARSHORE_MAXIMUM_CELL_SIZE,
  OCEAN_NEARSHORE_MAXIMUM_CURRENT_SPEED,
  OCEAN_NEARSHORE_MAXIMUM_DEPTH,
  OCEAN_NEARSHORE_MAXIMUM_OBSTACLE_HEIGHT
} from "./constants";

type UnknownRecord = Record<string, unknown>;

const BUDGET_KEYS = [
  "maxWidth",
  "maxHeight",
  "maxTexelCount",
  "maxObstacleCount",
  "maxAtlasByteLength"
] as const satisfies readonly (keyof OceanNearshoreBudgetConfig)[];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function addError(
  diagnostics: OceanNearshoreDiagnostic[],
  code: OceanNearshoreDiagnosticCode,
  path: string,
  message: string
): void {
  diagnostics.push({
    code,
    severity: OceanNearshoreDiagnosticSeverity.Error,
    path,
    message
  });
}

function hasErrors(diagnostics: readonly OceanNearshoreDiagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) => diagnostic.severity === OceanNearshoreDiagnosticSeverity.Error
  );
}

function readFiniteNumber(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: OceanNearshoreDiagnostic[]
): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(
      diagnostics,
      key in record
        ? OceanNearshoreDiagnosticCode.InvalidNumber
        : OceanNearshoreDiagnosticCode.MissingField,
      path,
      key in record ? "Expected a finite number." : "Required numeric field is missing."
    );
    return undefined;
  }
  return value;
}

function readVector2(
  value: unknown,
  path: string,
  diagnostics: OceanNearshoreDiagnostic[],
  positive: boolean
): OceanNearshoreVector2 | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((component) => typeof component === "number" && Number.isFinite(component))
  ) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.InvalidType,
      path,
      "Expected a two-number finite tuple."
    );
    return undefined;
  }
  const tuple = [value[0] as number, value[1] as number] as const;
  if (positive && tuple.some((component) => component <= 0)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.ValueOutOfRange,
      path,
      "Tuple values must be greater than zero."
    );
  }
  return Object.freeze(tuple);
}

function readGrid(
  value: unknown,
  diagnostics: OceanNearshoreDiagnostic[]
): OceanNearshoreGridConfig | undefined {
  if (!isRecord(value)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.MissingField,
      "$.grid",
      "A grid object is required."
    );
    return undefined;
  }
  const originXZ = readVector2(value.originXZ, "$.grid.originXZ", diagnostics, false);
  const cellSizeXZ = readVector2(value.cellSizeXZ, "$.grid.cellSizeXZ", diagnostics, true);
  const width = readFiniteNumber(value, "width", "$.grid.width", diagnostics);
  const height = readFiniteNumber(value, "height", "$.grid.height", diagnostics);
  if (
    cellSizeXZ &&
    (cellSizeXZ[0] > OCEAN_NEARSHORE_MAXIMUM_CELL_SIZE ||
      cellSizeXZ[1] > OCEAN_NEARSHORE_MAXIMUM_CELL_SIZE)
  ) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.ValueOutOfRange,
      "$.grid.cellSizeXZ",
      `Cell size must not exceed ${OCEAN_NEARSHORE_MAXIMUM_CELL_SIZE} metres.`
    );
  }
  for (const [key, dimension, maximum] of [
    ["width", width, OCEAN_NEARSHORE_HARD_BUDGET.maxWidth],
    ["height", height, OCEAN_NEARSHORE_HARD_BUDGET.maxHeight]
  ] as const) {
    if (
      dimension !== undefined &&
      (!Number.isInteger(dimension) || dimension < 2 || dimension > maximum)
    ) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.ValueOutOfRange,
        `$.grid.${key}`,
        `Expected an integer in [2, ${maximum}].`
      );
    }
  }
  return originXZ && cellSizeXZ && width !== undefined && height !== undefined
    ? Object.freeze({ originXZ, cellSizeXZ, width, height })
    : undefined;
}

function readFloat32Buffer(
  value: unknown,
  expectedLength: number | undefined,
  path: string,
  diagnostics: OceanNearshoreDiagnostic[]
): Float32Array | undefined {
  if (!(value instanceof Float32Array)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.InvalidType,
      path,
      "Expected a Float32Array."
    );
    return undefined;
  }
  if (expectedLength !== undefined && value.length !== expectedLength) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.BufferLengthMismatch,
      path,
      `Expected ${expectedLength} values, received ${value.length}.`
    );
  }
  if (!value.every(Number.isFinite)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.InvalidNumber,
      path,
      "Every buffer value must be finite."
    );
  }
  return new Float32Array(value);
}

function readMinimumDepth(
  value: unknown,
  path: string,
  diagnostics: OceanNearshoreDiagnostic[]
): number {
  if (value === undefined) return OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > OCEAN_NEARSHORE_MAXIMUM_DEPTH
  ) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.InvalidDepth,
      path,
      `Expected a finite depth in [0, ${OCEAN_NEARSHORE_MAXIMUM_DEPTH}].`
    );
    return OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH;
  }
  return value;
}

function readWetSource(
  value: unknown,
  texelCount: number | undefined,
  diagnostics: OceanNearshoreDiagnostic[]
): OceanNearshoreWetSource | undefined {
  if (!isRecord(value)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.MissingField,
      "$.wetSource",
      "A wetSource object is required."
    );
    return undefined;
  }
  const minimumDepth = readMinimumDepth(
    value.minimumDepth,
    "$.wetSource.minimumDepth",
    diagnostics
  );
  if (value.kind === "water-level") {
    const source: OceanNearshoreWaterLevelWetSource = { kind: "water-level", minimumDepth };
    return Object.freeze(source);
  }
  if (value.kind === "mask") {
    if (!(value.mask instanceof Uint8Array)) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.InvalidType,
        "$.wetSource.mask",
        "Mask wet source requires a Uint8Array."
      );
      return undefined;
    }
    if (texelCount !== undefined && value.mask.length !== texelCount) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.BufferLengthMismatch,
        "$.wetSource.mask",
        `Expected ${texelCount} occupancy values, received ${value.mask.length}.`
      );
    }
    if (!value.mask.every((entry) => entry === 0 || entry === 1)) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.ValueOutOfRange,
        "$.wetSource.mask",
        "Occupancy entries must be exactly 0 or 1."
      );
    }
    const source: OceanNearshoreMaskWetSource = {
      kind: "mask",
      mask: new Uint8Array(value.mask),
      minimumDepth
    };
    return Object.freeze(source);
  }
  addError(
    diagnostics,
    OceanNearshoreDiagnosticCode.InvalidEnum,
    "$.wetSource.kind",
    'Expected "water-level" or "mask".'
  );
  return undefined;
}

function readOutsidePolicyValue(
  value: unknown,
  path: string,
  diagnostics: OceanNearshoreDiagnostic[]
): OceanNearshoreOutsidePolicy | undefined {
  if (
    value !== OceanNearshoreOutsidePolicy.DeepOcean &&
    value !== OceanNearshoreOutsidePolicy.Dry
  ) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.InvalidEnum,
      path,
      'Expected "deep-ocean" or "dry".'
    );
    return undefined;
  }
  return value;
}

function readOutsidePolicies(
  value: unknown,
  diagnostics: OceanNearshoreDiagnostic[]
): OceanNearshoreOutsidePolicies | undefined {
  if (!isRecord(value)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.MissingField,
      "$.outsidePolicy",
      "Explicit four-edge outside policies are required."
    );
    return undefined;
  }
  const negativeX = readOutsidePolicyValue(
    value.negativeX,
    "$.outsidePolicy.negativeX",
    diagnostics
  );
  const positiveX = readOutsidePolicyValue(
    value.positiveX,
    "$.outsidePolicy.positiveX",
    diagnostics
  );
  const negativeZ = readOutsidePolicyValue(
    value.negativeZ,
    "$.outsidePolicy.negativeZ",
    diagnostics
  );
  const positiveZ = readOutsidePolicyValue(
    value.positiveZ,
    "$.outsidePolicy.positiveZ",
    diagnostics
  );
  return negativeX && positiveX && negativeZ && positiveZ
    ? Object.freeze({ negativeX, positiveX, negativeZ, positiveZ })
    : undefined;
}

function readBudget(
  value: unknown,
  diagnostics: OceanNearshoreDiagnostic[]
): Readonly<OceanNearshoreBudgetConfig> {
  if (value !== undefined && !isRecord(value)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.InvalidType,
      "$.budget",
      "Expected a budget object."
    );
    return OCEAN_NEARSHORE_DEFAULT_BUDGET;
  }
  const overrides = isRecord(value) ? value : undefined;
  const resolved: Record<keyof OceanNearshoreBudgetConfig, number> = {
    ...OCEAN_NEARSHORE_DEFAULT_BUDGET
  };
  for (const key of BUDGET_KEYS) {
    if (!overrides || !(key in overrides)) continue;
    const number = readFiniteNumber(overrides, key, `$.budget.${key}`, diagnostics);
    const hardMaximum = OCEAN_NEARSHORE_HARD_BUDGET[key];
    if (number === undefined) continue;
    if (!Number.isInteger(number) || number <= 0 || number > hardMaximum) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.ValueOutOfRange,
        `$.budget.${key}`,
        `Expected a positive integer no greater than ${hardMaximum}.`
      );
      continue;
    }
    resolved[key] = number;
  }
  return Object.freeze(resolved);
}

function readObstacleVector(
  value: unknown,
  path: string,
  diagnostics: OceanNearshoreDiagnostic[],
  positive: boolean
): OceanObstacleVector2 | undefined {
  return readVector2(value, path, diagnostics, positive);
}

function obstacleBounds(
  obstacle: OceanObstacleDescriptor
): readonly [number, number, number, number] {
  if (obstacle.shape === "circle") {
    return [
      obstacle.centerXZ[0] - obstacle.radius,
      obstacle.centerXZ[1] - obstacle.radius,
      obstacle.centerXZ[0] + obstacle.radius,
      obstacle.centerXZ[1] + obstacle.radius
    ];
  }
  const cosine = Math.cos(obstacle.rotationRadians);
  const sine = Math.sin(obstacle.rotationRadians);
  const extentX = Math.hypot(
    obstacle.radiiXZ[0] * cosine,
    obstacle.radiiXZ[1] * sine
  );
  const extentZ = Math.hypot(
    obstacle.radiiXZ[0] * sine,
    obstacle.radiiXZ[1] * cosine
  );
  return [
    obstacle.centerXZ[0] - extentX,
    obstacle.centerXZ[1] - extentZ,
    obstacle.centerXZ[0] + extentX,
    obstacle.centerXZ[1] + extentZ
  ];
}

function readObstacles(
  value: unknown,
  grid: OceanNearshoreGridConfig | undefined,
  diagnostics: OceanNearshoreDiagnostic[]
): readonly OceanObstacleDescriptor[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.InvalidType,
      "$.obstacles",
      "Expected an obstacle array."
    );
    return Object.freeze([]);
  }
  const obstacles: OceanObstacleDescriptor[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const path = `$.obstacles[${index}]`;
    const entry = value[index];
    if (!isRecord(entry)) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.InvalidType,
        path,
        "Expected an obstacle object."
      );
      continue;
    }
    const id =
      typeof entry.id === "string" && entry.id.trim().length > 0 && entry.id.length <= 128
        ? entry.id
        : undefined;
    if (!id) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.InvalidType,
        `${path}.id`,
        "Obstacle id must be a non-empty string of at most 128 characters."
      );
    } else if (ids.has(id)) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.DuplicateObstacleId,
        `${path}.id`,
        `Obstacle id "${id}" is duplicated.`
      );
    } else {
      ids.add(id);
    }
    const centerXZ = readObstacleVector(entry.centerXZ, `${path}.centerXZ`, diagnostics, false);
    const height = readFiniteNumber(entry, "height", `${path}.height`, diagnostics);
    if (
      height !== undefined &&
      (height <= 0 || height > OCEAN_NEARSHORE_MAXIMUM_OBSTACLE_HEIGHT)
    ) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.ValueOutOfRange,
        `${path}.height`,
        `Obstacle height must be in (0, ${OCEAN_NEARSHORE_MAXIMUM_OBSTACLE_HEIGHT}].`
      );
    }
    let obstacle: OceanObstacleDescriptor | undefined;
    if (entry.shape === "circle") {
      const radius = readFiniteNumber(entry, "radius", `${path}.radius`, diagnostics);
      if (radius !== undefined && radius <= 0) {
        addError(
          diagnostics,
          OceanNearshoreDiagnosticCode.ValueOutOfRange,
          `${path}.radius`,
          "Circle radius must be greater than zero."
        );
      }
      if (id && centerXZ && height !== undefined && radius !== undefined) {
        const circle: OceanCircleObstacleDescriptor = {
          id,
          shape: "circle",
          centerXZ,
          height,
          radius
        };
        obstacle = Object.freeze(circle);
      }
    } else if (entry.shape === "ellipse") {
      const radiiXZ = readObstacleVector(
        entry.radiiXZ,
        `${path}.radiiXZ`,
        diagnostics,
        true
      );
      const rotationRadians = readFiniteNumber(
        entry,
        "rotationRadians",
        `${path}.rotationRadians`,
        diagnostics
      );
      if (id && centerXZ && height !== undefined && radiiXZ && rotationRadians !== undefined) {
        const ellipse: OceanEllipseObstacleDescriptor = {
          id,
          shape: "ellipse",
          centerXZ,
          height,
          radiiXZ,
          rotationRadians
        };
        obstacle = Object.freeze(ellipse);
      }
    } else {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.InvalidEnum,
        `${path}.shape`,
        'Expected "circle" or "ellipse".'
      );
    }
    if (!obstacle) continue;
    if (grid) {
      const [minimumX, minimumZ, maximumX, maximumZ] = obstacleBounds(obstacle);
      const gridMinimumX = grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5;
      const gridMinimumZ = grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5;
      const gridMaximumX =
        grid.originXZ[0] + (grid.width - 0.5) * grid.cellSizeXZ[0];
      const gridMaximumZ =
        grid.originXZ[1] + (grid.height - 0.5) * grid.cellSizeXZ[1];
      if (
        minimumX < gridMinimumX ||
        maximumX > gridMaximumX ||
        minimumZ < gridMinimumZ ||
        maximumZ > gridMaximumZ
      ) {
        addError(
          diagnostics,
          OceanNearshoreDiagnosticCode.ObstacleOutOfBounds,
          path,
          "The complete obstacle footprint must remain inside the authored nearshore grid."
        );
      }
    }
    obstacles.push(obstacle);
  }
  return Object.freeze(obstacles);
}

function validatePhysicalFields(
  waterLevel: number | undefined,
  bedHeights: Float32Array | undefined,
  baseCurrentsXZ: Float32Array | undefined,
  wetSource: OceanNearshoreWetSource | undefined,
  diagnostics: OceanNearshoreDiagnostic[]
): void {
  if (
    waterLevel === undefined ||
    !bedHeights ||
    !baseCurrentsXZ ||
    !wetSource ||
    baseCurrentsXZ.length !== bedHeights.length * 2
  ) {
    return;
  }
  let wetTexelCount = 0;
  const minimumDepth = wetSource.minimumDepth ?? OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH;
  for (let index = 0; index < bedHeights.length; index++) {
    const depth = waterLevel - bedHeights[index];
    const explicitlyWet = wetSource.kind === "mask" && wetSource.mask[index] === 1;
    const wet =
      wetSource.kind === "water-level"
        ? depth > minimumDepth
        : explicitlyWet && depth > minimumDepth;
    if (
      depth > OCEAN_NEARSHORE_MAXIMUM_DEPTH ||
      (explicitlyWet && depth < 0)
    ) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.InvalidDepth,
        `$.bedHeights[${index}]`,
        `Wet-source depth ${depth} is outside [0, ${OCEAN_NEARSHORE_MAXIMUM_DEPTH}].`
      );
    }
    if (explicitlyWet && !wet) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.InvalidDepth,
        `$.wetSource.mask[${index}]`,
        `Masked wet texel depth must exceed minimumDepth ${minimumDepth}.`
      );
    }
    if (wet) wetTexelCount++;
    const currentX = baseCurrentsXZ[index * 2];
    const currentZ = baseCurrentsXZ[index * 2 + 1];
    if (Math.hypot(currentX, currentZ) > OCEAN_NEARSHORE_MAXIMUM_CURRENT_SPEED) {
      addError(
        diagnostics,
        OceanNearshoreDiagnosticCode.ValueOutOfRange,
        `$.baseCurrentsXZ[${index * 2}]`,
        `Current speed must not exceed ${OCEAN_NEARSHORE_MAXIMUM_CURRENT_SPEED} m/s.`
      );
    }
  }
  if (wetTexelCount === 0) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.NoWetTexels,
      "$.wetSource",
      "The nearshore field must contain at least one wet texel."
    );
  }
}

function validateBudgetUsage(
  grid: OceanNearshoreGridConfig | undefined,
  obstacleCount: number,
  budget: Readonly<OceanNearshoreBudgetConfig>,
  diagnostics: OceanNearshoreDiagnostic[]
): void {
  if (!grid) return;
  const values: Array<[keyof OceanNearshoreBudgetConfig, number]> = [
    ["maxWidth", grid.width],
    ["maxHeight", grid.height],
    ["maxTexelCount", grid.width * grid.height],
    ["maxObstacleCount", obstacleCount],
    ["maxAtlasByteLength", grid.width * grid.height * 4]
  ];
  for (const [key, actual] of values) {
    if (actual <= budget[key]) continue;
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.BudgetExceeded,
      `$.budget.${key}`,
      `Compiled value ${actual} exceeds budget ${budget[key]}.`
    );
  }
}

export function validateOceanNearshoreDescriptor(
  source: unknown
): OceanNearshoreValidationResult<ValidatedOceanNearshoreDescriptor> {
  const diagnostics: OceanNearshoreDiagnostic[] = [];
  if (!isRecord(source)) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.InvalidRootType,
      "$",
      "Ocean nearshore descriptor must be an object."
    );
    return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
  }
  if (source.schemaVersion !== OceanNearshoreSchemaVersion.V1) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.UnsupportedSchemaVersion,
      "$.schemaVersion",
      `Expected schema version ${OceanNearshoreSchemaVersion.V1}.`
    );
  }
  const id =
    typeof source.id === "string" && source.id.trim().length > 0 && source.id.length <= 128
      ? source.id
      : undefined;
  if (!id) {
    addError(
      diagnostics,
      OceanNearshoreDiagnosticCode.InvalidType,
      "$.id",
      "Id must be a non-empty string of at most 128 characters."
    );
  }
  const waterLevel = readFiniteNumber(source, "waterLevel", "$.waterLevel", diagnostics);
  const grid = readGrid(source.grid, diagnostics);
  const texelCount = grid ? grid.width * grid.height : undefined;
  const bedHeights = readFloat32Buffer(
    source.bedHeights,
    texelCount,
    "$.bedHeights",
    diagnostics
  );
  const baseCurrentsXZ =
    source.baseCurrentsXZ === undefined
      ? texelCount === undefined
        ? undefined
        : new Float32Array(texelCount * 2)
      : readFloat32Buffer(
          source.baseCurrentsXZ,
          texelCount === undefined ? undefined : texelCount * 2,
          "$.baseCurrentsXZ",
          diagnostics
        );
  const wetSource = readWetSource(source.wetSource, texelCount, diagnostics);
  const outsidePolicy = readOutsidePolicies(source.outsidePolicy, diagnostics);
  const obstacles = readObstacles(source.obstacles, grid, diagnostics);
  const budget = readBudget(source.budget, diagnostics);

  validatePhysicalFields(
    waterLevel,
    bedHeights,
    baseCurrentsXZ,
    wetSource,
    diagnostics
  );
  validateBudgetUsage(grid, obstacles.length, budget, diagnostics);

  const frozenDiagnostics = Object.freeze(diagnostics);
  if (
    hasErrors(diagnostics) ||
    !id ||
    waterLevel === undefined ||
    !grid ||
    !bedHeights ||
    !baseCurrentsXZ ||
    !wetSource ||
    !outsidePolicy
  ) {
    return Object.freeze({ valid: false, diagnostics: frozenDiagnostics });
  }
  const value: ValidatedOceanNearshoreDescriptor = Object.freeze({
    schemaVersion: OceanNearshoreSchemaVersion.V1,
    id,
    waterLevel,
    grid,
    bedHeights,
    baseCurrentsXZ,
    wetSource,
    outsidePolicy,
    obstacles,
    budget
  });
  return Object.freeze({ valid: true, value, diagnostics: frozenDiagnostics });
}

/** Convenience type guard for callers constructing descriptors in TypeScript. */
export function isOceanNearshoreDescriptorV1(
  value: unknown
): value is OceanNearshoreDescriptorV1 {
  return validateOceanNearshoreDescriptor(value).valid;
}
