/**
 * Strict river input decoding and typed value normalization.
 *
 * External JSON is decoded from unknown before it can reach runtime code. Typed
 * normalization is a separate stage: Strict is the default and never mutates bad
 * data; PreviewRepair is opt-in and records every clamp, generated id, or dropped
 * point as a stable diagnostic.
 */
import {
  RiverDirectionMode,
  RiverDisturbanceKind,
  RiverMaterialPreset,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPathMode,
  RiverQualityLevel,
  RiverValidationMode
} from "./RiverAuthoringEnums";
import { RIVER_LIMITS, RIVER_MATERIAL_PRESET_CONFIG } from "./RiverAuthoringLimits";
import {
  RiverAuthoringConfig,
  RiverPathControlPoint,
  RiverValidationOptions,
  RiverValidationResult,
  Vector3Tuple
} from "./RiverAuthoringTypes";
import type { RiverNetworkDescriptor } from "./RiverDescriptor";
import { RiverDiagnosticCode, RiverDiagnosticSeverity, type RiverDiagnostic } from "../../compiler/shared/diagnostics";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pushDiagnostic(
  diagnostics: RiverDiagnostic[],
  code: RiverDiagnosticCode,
  severity: RiverDiagnosticSeverity,
  path: string,
  message: string,
  originalValue?: unknown,
  repairedValue?: unknown
): void {
  diagnostics.push({
    code,
    severity,
    path,
    message,
    repair: arguments.length >= 7 ? { originalValue, repairedValue } : undefined
  });
}

function requireRecord(value: unknown, path: string, diagnostics: RiverDiagnostic[]): value is UnknownRecord {
  if (isRecord(value)) {
    return true;
  }
  pushDiagnostic(
    diagnostics,
    path === "$" ? RiverDiagnosticCode.InvalidRootType : RiverDiagnosticCode.InvalidType,
    RiverDiagnosticSeverity.Error,
    path,
    "Expected an object."
  );
  return false;
}

function requireField(record: UnknownRecord, key: string, path: string, diagnostics: RiverDiagnostic[]): unknown {
  if (Object.prototype.hasOwnProperty.call(record, key)) {
    return record[key];
  }
  pushDiagnostic(
    diagnostics,
    RiverDiagnosticCode.MissingField,
    RiverDiagnosticSeverity.Error,
    `${path}.${key}`,
    "Required field is missing."
  );
  return undefined;
}

function validateString(value: unknown, path: string, diagnostics: RiverDiagnostic[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.InvalidType,
      RiverDiagnosticSeverity.Error,
      path,
      "Expected a non-empty string."
    );
  }
}

function validateNumber(value: unknown, path: string, diagnostics: RiverDiagnostic[], optional = false): void {
  if (optional && value === undefined) {
    return;
  }
  if (!isFiniteNumber(value)) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.InvalidNumber,
      RiverDiagnosticSeverity.Error,
      path,
      "Expected a finite number."
    );
  }
}

function validateEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
  diagnostics: RiverDiagnostic[]
): void {
  if (typeof value !== "string" || !values.includes(value as T)) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.InvalidEnum,
      RiverDiagnosticSeverity.Error,
      path,
      "Unknown enum value."
    );
  }
}

function validateTuple(value: unknown, path: string, diagnostics: RiverDiagnostic[], optional = false): void {
  if (optional && value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.length !== 3) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.InvalidType,
      RiverDiagnosticSeverity.Error,
      path,
      "Expected a three-number tuple."
    );
    return;
  }
  for (let i = 0; i < value.length; i++) {
    validateNumber(value[i], `${path}[${i}]`, diagnostics);
  }
}

function validateControlPointShape(value: unknown, path: string, diagnostics: RiverDiagnostic[]): void {
  if (!requireRecord(value, path, diagnostics)) {
    return;
  }
  validateString(requireField(value, "id", path, diagnostics), `${path}.id`, diagnostics);
  validateTuple(requireField(value, "position", path, diagnostics), `${path}.position`, diagnostics);
  validateTuple(value.in, `${path}.in`, diagnostics, true);
  validateTuple(value.out, `${path}.out`, diagnostics, true);
  validateNumber(value.width, `${path}.width`, diagnostics, true);
  validateNumber(value.depth, `${path}.depth`, diagnostics, true);
  validateNumber(value.flowSpeed, `${path}.flowSpeed`, diagnostics, true);
  validateNumber(value.bankFeather, `${path}.bankFeather`, diagnostics, true);
}

function validateQualityShape(value: unknown, path: string, diagnostics: RiverDiagnostic[]): void {
  if (!requireRecord(value, path, diagnostics)) {
    return;
  }
  const geometry = requireField(value, "geometry", path, diagnostics);
  if (requireRecord(geometry, `${path}.geometry`, diagnostics)) {
    validateEnum(geometry.level, Object.values(RiverQualityLevel), `${path}.geometry.level`, diagnostics);
    validateNumber(geometry.maxSegmentCount, `${path}.geometry.maxSegmentCount`, diagnostics);
    validateNumber(geometry.maxChordError, `${path}.geometry.maxChordError`, diagnostics);
  }
  for (const key of ["material", "maps", "query"] as const) {
    const tier = requireField(value, key, path, diagnostics);
    if (requireRecord(tier, `${path}.${key}`, diagnostics)) {
      validateEnum(tier.level, Object.values(RiverQualityLevel), `${path}.${key}.level`, diagnostics);
    }
  }
}

function validateSurfaceMotionShape(value: unknown, path: string, diagnostics: RiverDiagnostic[]): void {
  if (!requireRecord(value, path, diagnostics)) return;
  for (const key of [
    "seed",
    "displacementAmplitude",
    "displacementLengthScale",
    "shoreDampingWidth",
    "turbulence",
    "crestIntensity",
    "microNormalStrength"
  ] as const) {
    validateNumber(requireField(value, key, path, diagnostics), `${path}.${key}`, diagnostics);
  }
}

function validateDisturbanceShape(value: unknown, path: string, diagnostics: RiverDiagnostic[]): void {
  if (!requireRecord(value, path, diagnostics)) return;
  validateString(requireField(value, "id", path, diagnostics), `${path}.id`, diagnostics);
  validateEnum(
    requireField(value, "kind", path, diagnostics),
    Object.values(RiverDisturbanceKind),
    `${path}.kind`,
    diagnostics
  );
  validateTuple(requireField(value, "position", path, diagnostics), `${path}.position`, diagnostics);
  validateNumber(requireField(value, "radius", path, diagnostics), `${path}.radius`, diagnostics);
  validateNumber(requireField(value, "strength", path, diagnostics), `${path}.strength`, diagnostics);
}

function validateRiverConfigShape(input: unknown, path: string, diagnostics: RiverDiagnostic[]): void {
  if (!requireRecord(input, path, diagnostics)) {
    return;
  }
  validateString(requireField(input, "id", path, diagnostics), `${path}.id`, diagnostics);
  const riverPath = requireField(input, "path", path, diagnostics);
  if (requireRecord(riverPath, `${path}.path`, diagnostics)) {
    validateEnum(riverPath.mode, Object.values(RiverPathMode), `${path}.path.mode`, diagnostics);
    validateNumber(riverPath.segmentLength, `${path}.path.segmentLength`, diagnostics);
    const points = requireField(riverPath, "points", `${path}.path`, diagnostics);
    if (Array.isArray(points)) {
      for (let i = 0; i < points.length; i++) {
        validateControlPointShape(points[i], `${path}.path.points[${i}]`, diagnostics);
      }
    } else {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.InvalidType,
        RiverDiagnosticSeverity.Error,
        `${path}.path.points`,
        "Expected an array."
      );
    }
  }
  const shape = requireField(input, "shape", path, diagnostics);
  if (requireRecord(shape, `${path}.shape`, diagnostics)) {
    validateNumber(shape.width, `${path}.shape.width`, diagnostics);
    validateNumber(shape.depth, `${path}.shape.depth`, diagnostics);
    validateNumber(shape.bankFeather, `${path}.shape.bankFeather`, diagnostics);
  }
  const flow = requireField(input, "flow", path, diagnostics);
  if (requireRecord(flow, `${path}.flow`, diagnostics)) {
    validateNumber(flow.speed, `${path}.flow.speed`, diagnostics);
    validateEnum(flow.directionMode, Object.values(RiverDirectionMode), `${path}.flow.directionMode`, diagnostics);
  }
  const material = requireField(input, "material", path, diagnostics);
  if (requireRecord(material, `${path}.material`, diagnostics)) {
    validateEnum(material.preset, Object.values(RiverMaterialPreset), `${path}.material.preset`, diagnostics);
    validateString(material.baseColor, `${path}.material.baseColor`, diagnostics);
    validateString(material.foamColor, `${path}.material.foamColor`, diagnostics);
    validateNumber(material.foamIntensity, `${path}.material.foamIntensity`, diagnostics);
    validateNumber(material.clarity, `${path}.material.clarity`, diagnostics);
  }
  validateQualityShape(requireField(input, "quality", path, diagnostics), `${path}.quality`, diagnostics);
}

function validateNetworkShape(input: unknown, diagnostics: RiverDiagnostic[]): void {
  if (!requireRecord(input, "$", diagnostics)) {
    return;
  }
  const schemaVersion = requireField(input, "schemaVersion", "$", diagnostics);
  if (schemaVersion !== RiverNetworkSchemaVersion.V1 && schemaVersion !== RiverNetworkSchemaVersion.V2) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.UnsupportedSchemaVersion,
      RiverDiagnosticSeverity.Error,
      "$.schemaVersion",
      `Expected river network schema version ${RiverNetworkSchemaVersion.V1} or ${RiverNetworkSchemaVersion.V2}.`
    );
  }
  validateString(requireField(input, "id", "$", diagnostics), "$.id", diagnostics);
  const nodes = requireField(input, "nodes", "$", diagnostics);
  if (Array.isArray(nodes)) {
    for (let i = 0; i < nodes.length; i++) {
      const path = `$.nodes[${i}]`;
      if (!requireRecord(nodes[i], path, diagnostics)) continue;
      validateString(nodes[i].id, `${path}.id`, diagnostics);
      validateEnum(nodes[i].kind, Object.values(RiverNodeKind), `${path}.kind`, diagnostics);
      validateTuple(nodes[i].position, `${path}.position`, diagnostics);
      validateNumber(nodes[i].mergeRadius, `${path}.mergeRadius`, diagnostics, true);
      validateNumber(nodes[i].elevation, `${path}.elevation`, diagnostics, true);
    }
  } else {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.InvalidType,
      RiverDiagnosticSeverity.Error,
      "$.nodes",
      "Expected an array."
    );
  }
  const segments = requireField(input, "segments", "$", diagnostics);
  if (Array.isArray(segments)) {
    for (let i = 0; i < segments.length; i++) {
      const path = `$.segments[${i}]`;
      if (!requireRecord(segments[i], path, diagnostics)) continue;
      validateString(segments[i].id, `${path}.id`, diagnostics);
      validateString(segments[i].from, `${path}.from`, diagnostics);
      validateString(segments[i].to, `${path}.to`, diagnostics);
      const curve = segments[i].curve;
      if (requireRecord(curve, `${path}.curve`, diagnostics)) {
        validateEnum(curve.mode, Object.values(RiverPathMode), `${path}.curve.mode`, diagnostics);
        validateNumber(curve.segmentLength, `${path}.curve.segmentLength`, diagnostics);
        if (Array.isArray(curve.points)) {
          for (let pointIndex = 0; pointIndex < curve.points.length; pointIndex++) {
            validateControlPointShape(curve.points[pointIndex], `${path}.curve.points[${pointIndex}]`, diagnostics);
          }
        } else {
          pushDiagnostic(
            diagnostics,
            RiverDiagnosticCode.InvalidType,
            RiverDiagnosticSeverity.Error,
            `${path}.curve.points`,
            "Expected an array."
          );
        }
      }
      if (segments[i].shape !== undefined && requireRecord(segments[i].shape, `${path}.shape`, diagnostics)) {
        const shape = segments[i].shape;
        validateNumber(shape.width, `${path}.shape.width`, diagnostics, true);
        validateNumber(shape.depth, `${path}.shape.depth`, diagnostics, true);
        validateNumber(shape.bankFeather, `${path}.shape.bankFeather`, diagnostics, true);
      }
      if (segments[i].flow !== undefined && requireRecord(segments[i].flow, `${path}.flow`, diagnostics)) {
        const flow = segments[i].flow;
        validateNumber(flow.speed, `${path}.flow.speed`, diagnostics, true);
        if (flow.directionMode !== undefined) {
          validateEnum(
            flow.directionMode,
            Object.values(RiverDirectionMode),
            `${path}.flow.directionMode`,
            diagnostics
          );
        }
      }
      if (segments[i].material !== undefined && requireRecord(segments[i].material, `${path}.material`, diagnostics)) {
        const material = segments[i].material;
        if (material.preset !== undefined)
          validateEnum(material.preset, Object.values(RiverMaterialPreset), `${path}.material.preset`, diagnostics);
        if (material.baseColor !== undefined)
          validateString(material.baseColor, `${path}.material.baseColor`, diagnostics);
        if (material.foamColor !== undefined)
          validateString(material.foamColor, `${path}.material.foamColor`, diagnostics);
        validateNumber(material.foamIntensity, `${path}.material.foamIntensity`, diagnostics, true);
        validateNumber(material.clarity, `${path}.material.clarity`, diagnostics, true);
      }
      validateNumber(segments[i].order, `${path}.order`, diagnostics, true);
    }
  } else {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.InvalidType,
      RiverDiagnosticSeverity.Error,
      "$.segments",
      "Expected an array."
    );
  }
  const defaults = requireField(input, "defaults", "$", diagnostics);
  if (requireRecord(defaults, "$.defaults", diagnostics)) {
    validateQualityShape(defaults.quality, "$.defaults.quality", diagnostics);
    const synthetic = {
      id: "network-defaults",
      path: {
        mode: RiverPathMode.Polyline,
        segmentLength: 1,
        points: [
          { id: "a", position: [0, 0, 0] },
          { id: "b", position: [1, 0, 0] }
        ]
      },
      shape: defaults.shape,
      flow: defaults.flow,
      material: defaults.material,
      quality: defaults.quality
    };
    validateRiverConfigShape(synthetic, "$.defaults", diagnostics);
    if (schemaVersion === RiverNetworkSchemaVersion.V2) {
      validateSurfaceMotionShape(
        requireField(defaults, "surfaceMotion", "$.defaults", diagnostics),
        "$.defaults.surfaceMotion",
        diagnostics
      );
    } else if (defaults.surfaceMotion !== undefined) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.UnsupportedSchemaVersion,
        RiverDiagnosticSeverity.Error,
        "$.defaults.surfaceMotion",
        "surfaceMotion requires river network schema version 2."
      );
    }
  }
  if (input.disturbances !== undefined) {
    if (schemaVersion !== RiverNetworkSchemaVersion.V2) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.UnsupportedSchemaVersion,
        RiverDiagnosticSeverity.Error,
        "$.disturbances",
        "disturbances require river network schema version 2."
      );
    } else if (Array.isArray(input.disturbances)) {
      for (let index = 0; index < input.disturbances.length; index++) {
        validateDisturbanceShape(input.disturbances[index], `$.disturbances[${index}]`, diagnostics);
      }
    } else {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.InvalidType,
        RiverDiagnosticSeverity.Error,
        "$.disturbances",
        "Expected an array."
      );
    }
  }
  if (input.budget !== undefined && requireRecord(input.budget, "$.budget", diagnostics)) {
    for (const key of [
      "maxSegmentCount",
      "maxSampleCount",
      "maxVertexCount",
      "maxChunkCount",
      "maxMapPixelCount"
    ] as const) {
      validateNumber(input.budget[key], `$.budget.${key}`, diagnostics, true);
    }
  }
}

function hasErrors(diagnostics: RiverDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === RiverDiagnosticSeverity.Error);
}

function sanitizeTuple(point: Vector3Tuple): Vector3Tuple {
  return [
    Number.isFinite(point[0]) ? point[0] : 0,
    Number.isFinite(point[1]) ? point[1] : 0,
    Number.isFinite(point[2]) ? point[2] : 0
  ];
}

function normalizeTuple(
  point: Vector3Tuple,
  path: string,
  diagnostics: RiverDiagnostic[],
  mode: RiverValidationMode
): Vector3Tuple {
  const repaired = sanitizeTuple(point);
  for (let i = 0; i < point.length; i++) {
    if (!Number.isFinite(point[i])) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.InvalidNumber,
        mode === RiverValidationMode.Strict ? RiverDiagnosticSeverity.Error : RiverDiagnosticSeverity.Warning,
        `${path}[${i}]`,
        "Expected a finite coordinate.",
        point[i],
        repaired[i]
      );
    }
  }
  return mode === RiverValidationMode.PreviewRepair ? repaired : [point[0], point[1], point[2]];
}

function distanceXZ(a: RiverPathControlPoint, b: RiverPathControlPoint): number {
  return Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
}

function selectControlPoints(points: RiverPathControlPoint[], diagnostics: RiverDiagnostic[]): RiverPathControlPoint[] {
  if (points.length <= RIVER_LIMITS.maxPointCount) {
    return points;
  }
  const selected: RiverPathControlPoint[] = [points[0]];
  const interiorCapacity = RIVER_LIMITS.maxPointCount - 2;
  for (let i = 1; i <= interiorCapacity; i++) {
    const sourceIndex = Math.round((i * (points.length - 1)) / (interiorCapacity + 1));
    selected.push(points[sourceIndex]);
  }
  selected.push(points[points.length - 1]);
  pushDiagnostic(
    diagnostics,
    RiverDiagnosticCode.ControlPointLimitExceeded,
    RiverDiagnosticSeverity.Warning,
    "path.points",
    `Reduced ${points.length} control points to ${RIVER_LIMITS.maxPointCount} while preserving both topology endpoints.`,
    points.map((point) => point.id),
    selected.map((point) => point.id)
  );
  return selected;
}

function repairNumber(
  value: number,
  min: number,
  max: number,
  path: string,
  diagnostics: RiverDiagnostic[],
  mode: RiverValidationMode
): number {
  if (Number.isFinite(value) && value >= min && value <= max) {
    return value;
  }
  const repaired = clamp(Number.isFinite(value) ? value : min, min, max);
  pushDiagnostic(
    diagnostics,
    Number.isFinite(value) ? RiverDiagnosticCode.ValueOutOfRange : RiverDiagnosticCode.InvalidNumber,
    mode === RiverValidationMode.Strict ? RiverDiagnosticSeverity.Error : RiverDiagnosticSeverity.Warning,
    path,
    `Expected a finite value in [${min}, ${max}].`,
    value,
    repaired
  );
  return mode === RiverValidationMode.PreviewRepair ? repaired : value;
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeTypedRiverConfig(
  config: RiverAuthoringConfig,
  mode: RiverValidationMode,
  diagnostics: RiverDiagnostic[]
): RiverAuthoringConfig {
  let points: RiverPathControlPoint[] = config.path.points.map((point, index) => ({
    ...point,
    position: normalizeTuple(point.position, `path.points[${index}].position`, diagnostics, mode),
    in: point.in ? normalizeTuple(point.in, `path.points[${index}].in`, diagnostics, mode) : undefined,
    out: point.out ? normalizeTuple(point.out, `path.points[${index}].out`, diagnostics, mode) : undefined
  }));
  if (points.length < RIVER_LIMITS.minPointCount) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.MissingField,
      RiverDiagnosticSeverity.Error,
      "path.points",
      "At least two control points are required."
    );
  }
  if (points.length > RIVER_LIMITS.maxPointCount) {
    if (mode === RiverValidationMode.PreviewRepair) {
      points = selectControlPoints(points, diagnostics);
    } else {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.ControlPointLimitExceeded,
        RiverDiagnosticSeverity.Error,
        "path.points",
        `At most ${RIVER_LIMITS.maxPointCount} control points are allowed.`
      );
    }
  }
  const usedIds = new Set<string>();
  const normalizedPoints: RiverPathControlPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    let id = point.id.trim();
    if (!id) {
      const repairedId = `river-point-${i}`;
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.ControlPointRepaired,
        mode === RiverValidationMode.Strict ? RiverDiagnosticSeverity.Error : RiverDiagnosticSeverity.Warning,
        `path.points[${i}].id`,
        "Control point id is empty.",
        point.id,
        repairedId
      );
      if (mode === RiverValidationMode.PreviewRepair) id = repairedId;
    }
    if (usedIds.has(id)) {
      const repairedId = `${id}-${i}`;
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.DuplicateId,
        mode === RiverValidationMode.Strict ? RiverDiagnosticSeverity.Error : RiverDiagnosticSeverity.Warning,
        `path.points[${i}].id`,
        "Control point id is duplicated.",
        id,
        repairedId
      );
      if (mode === RiverValidationMode.PreviewRepair) id = repairedId;
    }
    usedIds.add(id);
    if (i > 0 && distanceXZ(points[i - 1], point) <= 0.001) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.DegenerateControlPoint,
        mode === RiverValidationMode.Strict ? RiverDiagnosticSeverity.Error : RiverDiagnosticSeverity.Warning,
        `path.points[${i}].position`,
        "Adjacent control points are coincident."
      );
      if (mode === RiverValidationMode.PreviewRepair && i < points.length - 1) continue;
    }
    normalizedPoints.push({
      ...point,
      id,
      width:
        point.width === undefined
          ? undefined
          : repairNumber(
              point.width,
              RIVER_LIMITS.minWidth,
              RIVER_LIMITS.maxWidth,
              `path.points[${i}].width`,
              diagnostics,
              mode
            ),
      depth:
        point.depth === undefined
          ? undefined
          : repairNumber(
              point.depth,
              RIVER_LIMITS.minDepth,
              RIVER_LIMITS.maxDepth,
              `path.points[${i}].depth`,
              diagnostics,
              mode
            ),
      flowSpeed:
        point.flowSpeed === undefined
          ? undefined
          : repairNumber(
              point.flowSpeed,
              RIVER_LIMITS.minFlowSpeed,
              RIVER_LIMITS.maxFlowSpeed,
              `path.points[${i}].flowSpeed`,
              diagnostics,
              mode
            ),
      bankFeather:
        point.bankFeather === undefined
          ? undefined
          : repairNumber(
              point.bankFeather,
              RIVER_LIMITS.minBankFeather,
              RIVER_LIMITS.maxBankFeather,
              `path.points[${i}].bankFeather`,
              diagnostics,
              mode
            )
    });
  }
  const geometry = config.quality.geometry;
  const baseColor = isHexColor(config.material.baseColor)
    ? config.material.baseColor
    : RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.ClearStream].baseColor;
  const foamColor = isHexColor(config.material.foamColor)
    ? config.material.foamColor
    : RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.ClearStream].foamColor;
  if (!isHexColor(config.material.baseColor)) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.InvalidType,
      mode === RiverValidationMode.Strict ? RiverDiagnosticSeverity.Error : RiverDiagnosticSeverity.Warning,
      "material.baseColor",
      "Expected #RRGGBB color.",
      config.material.baseColor,
      baseColor
    );
  }
  if (!isHexColor(config.material.foamColor)) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.InvalidType,
      mode === RiverValidationMode.Strict ? RiverDiagnosticSeverity.Error : RiverDiagnosticSeverity.Warning,
      "material.foamColor",
      "Expected #RRGGBB color.",
      config.material.foamColor,
      foamColor
    );
  }
  return {
    ...config,
    path: {
      ...config.path,
      points: normalizedPoints,
      segmentLength: repairNumber(
        config.path.segmentLength,
        RIVER_LIMITS.minSegmentLength,
        RIVER_LIMITS.maxSegmentLength,
        "path.segmentLength",
        diagnostics,
        mode
      )
    },
    shape: {
      width: repairNumber(
        config.shape.width,
        RIVER_LIMITS.minWidth,
        RIVER_LIMITS.maxWidth,
        "shape.width",
        diagnostics,
        mode
      ),
      depth: repairNumber(
        config.shape.depth,
        RIVER_LIMITS.minDepth,
        RIVER_LIMITS.maxDepth,
        "shape.depth",
        diagnostics,
        mode
      ),
      bankFeather: repairNumber(
        config.shape.bankFeather,
        RIVER_LIMITS.minBankFeather,
        RIVER_LIMITS.maxBankFeather,
        "shape.bankFeather",
        diagnostics,
        mode
      )
    },
    flow: {
      ...config.flow,
      speed: repairNumber(
        config.flow.speed,
        RIVER_LIMITS.minFlowSpeed,
        RIVER_LIMITS.maxFlowSpeed,
        "flow.speed",
        diagnostics,
        mode
      )
    },
    material: {
      ...config.material,
      baseColor: mode === RiverValidationMode.PreviewRepair ? baseColor : config.material.baseColor,
      foamColor: mode === RiverValidationMode.PreviewRepair ? foamColor : config.material.foamColor,
      foamIntensity: repairNumber(
        config.material.foamIntensity,
        RIVER_LIMITS.minFoamIntensity,
        RIVER_LIMITS.maxFoamIntensity,
        "material.foamIntensity",
        diagnostics,
        mode
      ),
      clarity: repairNumber(
        config.material.clarity,
        RIVER_LIMITS.minClarity,
        RIVER_LIMITS.maxClarity,
        "material.clarity",
        diagnostics,
        mode
      )
    },
    quality: {
      ...config.quality,
      geometry: {
        ...geometry,
        maxSegmentCount: Math.floor(
          repairNumber(
            geometry.maxSegmentCount,
            1,
            RIVER_LIMITS.maxSegmentCount,
            "quality.geometry.maxSegmentCount",
            diagnostics,
            mode
          )
        ),
        maxChordError: repairNumber(
          geometry.maxChordError,
          RIVER_LIMITS.minChordError,
          RIVER_LIMITS.maxChordError,
          "quality.geometry.maxChordError",
          diagnostics,
          mode
        )
      }
    }
  };
}

export function estimateRiverLength(points: RiverPathControlPoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distanceXZ(points[i - 1], points[i]);
  return length;
}

export function validateRiverConfig(
  config: RiverAuthoringConfig,
  options: RiverValidationOptions = {}
): RiverValidationResult<RiverAuthoringConfig> {
  const mode = options.mode ?? RiverValidationMode.Strict;
  const diagnostics: RiverDiagnostic[] = [];
  const value = normalizeTypedRiverConfig(config, mode, diagnostics);
  const length = estimateRiverLength(value.path.points);
  if (length < value.shape.width * RIVER_LIMITS.minRiverLengthFactor) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.ShortRiver,
      RiverDiagnosticSeverity.Warning,
      "path.points",
      `River length ${length.toFixed(1)} is short for width ${value.shape.width.toFixed(1)}.`
    );
  }
  return {
    value: hasErrors(diagnostics) && mode === RiverValidationMode.Strict ? undefined : value,
    diagnostics,
    valid: !hasErrors(diagnostics)
  };
}

/** Explicit preview-only repair retained for GUI authoring. Runtime ingestion should use validateRiverConfig. */
export function normalizeRiverConfig(config: RiverAuthoringConfig): RiverAuthoringConfig {
  const result = validateRiverConfig(config, { mode: RiverValidationMode.PreviewRepair });
  if (!result.value) throw new Error("Preview repair could not produce a river config.");
  return result.value;
}

export function decodeRiverConfig(
  input: unknown,
  options: RiverValidationOptions = {}
): RiverValidationResult<RiverAuthoringConfig> {
  const diagnostics: RiverDiagnostic[] = [];
  validateRiverConfigShape(input, "$", diagnostics);
  if (hasErrors(diagnostics)) return { diagnostics, valid: false };
  const typedResult = validateRiverConfig(input as RiverAuthoringConfig, options);
  return {
    value: typedResult.value,
    diagnostics: [...diagnostics, ...typedResult.diagnostics],
    valid: typedResult.valid
  };
}

export function decodeRiverNetworkDescriptor(input: unknown): RiverValidationResult<RiverNetworkDescriptor> {
  const diagnostics: RiverDiagnostic[] = [];
  validateNetworkShape(input, diagnostics);
  return {
    value: hasErrors(diagnostics) ? undefined : (input as RiverNetworkDescriptor),
    diagnostics,
    valid: !hasErrors(diagnostics)
  };
}

/** @deprecated Use decodeRiverNetworkDescriptor. */
export const decodeRiverNetworkConfig = decodeRiverNetworkDescriptor;

export function getRiverConfigWarnings(config: RiverAuthoringConfig): string[] {
  return validateRiverConfig(config)
    .diagnostics.filter((diagnostic) => diagnostic.severity !== RiverDiagnosticSeverity.Info)
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`);
}
