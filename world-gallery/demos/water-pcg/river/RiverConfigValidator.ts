/**
 * Strict river input decoding, typed normalization, and graph diagnostics.
 *
 * External JSON is decoded from unknown before it can reach runtime code. Typed
 * normalization is a separate stage: Strict is the default and never mutates bad
 * data; PreviewRepair is opt-in and records every clamp, generated id, or dropped
 * point as a stable diagnostic.
 */
import {
  RIVER_LIMITS,
  RIVER_MATERIAL_PRESET_CONFIG,
  RiverDebugMode,
  RiverDiagnosticCode,
  RiverDiagnosticSeverity,
  RiverDirectionMode,
  RiverMaterialPreset,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPathMode,
  RiverPreviewStage,
  RiverQualityLevel,
  RiverValidationMode
} from "./constants";
import {
  RiverConfig,
  RiverDiagnostic,
  RiverNetworkBudgetConfig,
  RiverNetworkDescriptor,
  RiverPathControlPoint,
  RiverValidationOptions,
  RiverValidationResult,
  Vector3Tuple
} from "./types";

type UnknownRecord = Record<string, unknown>;

const DEFAULT_NETWORK_BUDGET: RiverNetworkBudgetConfig = {
  maxSegmentCount: RIVER_LIMITS.maxNetworkSegmentCount,
  maxSampleCount: RIVER_LIMITS.maxNetworkSampleCount,
  maxVertexCount: RIVER_LIMITS.maxNetworkVertexCount,
  maxChunkCount: RIVER_LIMITS.maxNetworkChunkCount,
  maxMapPixelCount: RIVER_LIMITS.maxNetworkMapPixelCount
};

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
  const debug = requireField(input, "debug", path, diagnostics);
  if (requireRecord(debug, `${path}.debug`, diagnostics)) {
    validateEnum(debug.previewStage, Object.values(RiverPreviewStage), `${path}.debug.previewStage`, diagnostics);
    validateEnum(debug.mode, Object.values(RiverDebugMode), `${path}.debug.mode`, diagnostics);
    validateNumber(debug.queryT, `${path}.debug.queryT`, diagnostics);
  }
}

function validateNetworkShape(input: unknown, diagnostics: RiverDiagnostic[]): void {
  if (!requireRecord(input, "$", diagnostics)) {
    return;
  }
  const schemaVersion = requireField(input, "schemaVersion", "$", diagnostics);
  if (schemaVersion !== RiverNetworkSchemaVersion.V1) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.UnsupportedSchemaVersion,
      RiverDiagnosticSeverity.Error,
      "$.schemaVersion",
      `Expected river network schema version ${RiverNetworkSchemaVersion.V1}.`
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
      quality: defaults.quality,
      debug: input.debug ?? { previewStage: RiverPreviewStage.Full, mode: RiverDebugMode.Off, queryT: 0.5 }
    };
    validateRiverConfigShape(synthetic, "$.defaults", diagnostics);
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
  config: RiverConfig,
  mode: RiverValidationMode,
  diagnostics: RiverDiagnostic[]
): RiverConfig {
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
    },
    debug: {
      ...config.debug,
      queryT: repairNumber(config.debug.queryT, 0, 1, "debug.queryT", diagnostics, mode)
    }
  };
}

export function estimateRiverLength(points: RiverPathControlPoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distanceXZ(points[i - 1], points[i]);
  return length;
}

export function validateRiverConfig(
  config: RiverConfig,
  options: RiverValidationOptions = {}
): RiverValidationResult<RiverConfig> {
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
export function normalizeRiverConfig(config: RiverConfig): RiverConfig {
  const result = validateRiverConfig(config, { mode: RiverValidationMode.PreviewRepair });
  if (!result.value) throw new Error("Preview repair could not produce a river config.");
  return result.value;
}

export function decodeRiverConfig(
  input: unknown,
  options: RiverValidationOptions = {}
): RiverValidationResult<RiverConfig> {
  const diagnostics: RiverDiagnostic[] = [];
  validateRiverConfigShape(input, "$", diagnostics);
  if (hasErrors(diagnostics)) return { diagnostics, valid: false };
  const typedResult = validateRiverConfig(input as RiverConfig, options);
  return {
    value: typedResult.value,
    diagnostics: [...diagnostics, ...typedResult.diagnostics],
    valid: typedResult.valid
  };
}

function positionsMatch(a: Vector3Tuple, b: Vector3Tuple): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= 0.01;
}

function resolveNetworkBudget(network: RiverNetworkDescriptor): RiverNetworkBudgetConfig {
  return { ...DEFAULT_NETWORK_BUDGET, ...network.budget };
}

export function validateRiverNetworkDescriptor(
  network: RiverNetworkDescriptor
): RiverValidationResult<RiverNetworkDescriptor> {
  const diagnostics: RiverDiagnostic[] = [];
  if (network.schemaVersion !== RiverNetworkSchemaVersion.V1) {
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.UnsupportedSchemaVersion,
      RiverDiagnosticSeverity.Error,
      "schemaVersion",
      `Expected river network schema version ${RiverNetworkSchemaVersion.V1}.`
    );
  }
  const nodeIds = new Set<string>();
  const segmentIds = new Set<string>();
  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (let i = 0; i < network.nodes.length; i++) {
    const node = network.nodes[i];
    if (nodeIds.has(node.id))
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.DuplicateId,
        RiverDiagnosticSeverity.Error,
        `nodes[${i}].id`,
        "Node id is duplicated."
      );
    nodeIds.add(node.id);
    incoming.set(node.id, 0);
    outgoing.set(node.id, 0);
    adjacency.set(node.id, []);
    if (
      (node.kind === RiverNodeKind.Confluence || node.kind === RiverNodeKind.Bifurcation) &&
      (!isFiniteNumber(node.mergeRadius) || node.mergeRadius <= 0)
    ) {
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.InvalidMergeRadius,
        RiverDiagnosticSeverity.Error,
        `nodes[${i}].mergeRadius`,
        "Junction nodes require a positive mergeRadius."
      );
    }
  }
  let estimatedSamples = 0;
  for (let i = 0; i < network.segments.length; i++) {
    const segment = network.segments[i];
    if (segmentIds.has(segment.id))
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.DuplicateId,
        RiverDiagnosticSeverity.Error,
        `segments[${i}].id`,
        "Segment id is duplicated."
      );
    segmentIds.add(segment.id);
    const from = nodeById.get(segment.from);
    const to = nodeById.get(segment.to);
    if (!from)
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.MissingNodeReference,
        RiverDiagnosticSeverity.Error,
        `segments[${i}].from`,
        "Upstream node does not exist."
      );
    if (!to)
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.MissingNodeReference,
        RiverDiagnosticSeverity.Error,
        `segments[${i}].to`,
        "Downstream node does not exist."
      );
    if (from && to) {
      incoming.set(to.id, (incoming.get(to.id) ?? 0) + 1);
      outgoing.set(from.id, (outgoing.get(from.id) ?? 0) + 1);
      adjacency.get(from.id)?.push(to.id);
      adjacency.get(to.id)?.push(from.id);
      const first = segment.curve.points[0];
      const last = segment.curve.points[segment.curve.points.length - 1];
      if (!first || !positionsMatch(first.position, from.position))
        pushDiagnostic(
          diagnostics,
          RiverDiagnosticCode.SegmentEndpointMismatch,
          RiverDiagnosticSeverity.Warning,
          `segments[${i}].curve.points[0]`,
          "Curve start does not match its from node and will be snapped by the compiler.",
          first?.position,
          from.position
        );
      if (!last || !positionsMatch(last.position, to.position))
        pushDiagnostic(
          diagnostics,
          RiverDiagnosticCode.SegmentEndpointMismatch,
          RiverDiagnosticSeverity.Warning,
          `segments[${i}].curve.points[-1]`,
          "Curve end does not match its to node and will be snapped by the compiler.",
          last?.position,
          to.position
        );
      if (isFiniteNumber(from.elevation) && isFiniteNumber(to.elevation) && to.elevation > from.elevation + 0.001)
        pushDiagnostic(
          diagnostics,
          RiverDiagnosticCode.ReversedElevation,
          RiverDiagnosticSeverity.Warning,
          `segments[${i}]`,
          "Segment rises in its declared downstream direction."
        );
    }
    const length = estimateRiverLength(segment.curve.points);
    estimatedSamples += Math.max(
      segment.curve.points.length,
      Math.ceil(length / Math.max(segment.curve.segmentLength, RIVER_LIMITS.minSegmentLength)) + 1
    );
  }
  for (let i = 0; i < network.nodes.length; i++) {
    const node = network.nodes[i];
    const inDegree = incoming.get(node.id) ?? 0;
    const outDegree = outgoing.get(node.id) ?? 0;
    const validDegree =
      (node.kind === RiverNodeKind.Source && inDegree === 0 && outDegree >= 1) ||
      (node.kind === RiverNodeKind.Mouth && inDegree >= 1 && outDegree === 0) ||
      (node.kind === RiverNodeKind.Confluence && inDegree >= 2 && outDegree >= 1) ||
      (node.kind === RiverNodeKind.Bifurcation && inDegree >= 1 && outDegree >= 2);
    if (!validDegree)
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.InvalidNodeDegree,
        RiverDiagnosticSeverity.Error,
        `nodes[${i}].kind`,
        `Node kind ${node.kind} does not match in/out degree ${inDegree}/${outDegree}.`
      );
  }
  if (network.nodes.length > 0) {
    const visited = new Set<string>();
    const queue = [network.nodes[0].id];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      for (const neighbor of adjacency.get(id) ?? []) if (!visited.has(neighbor)) queue.push(neighbor);
    }
    if (visited.size !== network.nodes.length)
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.DisconnectedNetwork,
        RiverDiagnosticSeverity.Error,
        "nodes",
        "Network contains disconnected components."
      );
  }
  const directed = new Map<string, string[]>();
  for (const node of network.nodes) directed.set(node.id, []);
  for (const segment of network.segments) directed.get(segment.from)?.push(segment.to);
  const visiting = new Set<string>();
  const visitedDirected = new Set<string>();
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visitedDirected.has(id)) return false;
    visiting.add(id);
    for (const next of directed.get(id) ?? []) if (hasCycle(next)) return true;
    visiting.delete(id);
    visitedDirected.add(id);
    return false;
  };
  if (network.nodes.some((node) => hasCycle(node.id)))
    pushDiagnostic(
      diagnostics,
      RiverDiagnosticCode.NetworkCycle,
      RiverDiagnosticSeverity.Error,
      "segments",
      "Directed river graph contains a cycle."
    );
  const budget = resolveNetworkBudget(network);
  const estimatedVertices = estimatedSamples * 4;
  const estimatedChunks = Math.max(1, Math.ceil(estimatedVertices / RIVER_LIMITS.maxChunkVertexCount));
  const budgetChecks: Array<[number, number, string]> = [
    [network.segments.length, budget.maxSegmentCount, "budget.maxSegmentCount"],
    [estimatedSamples, budget.maxSampleCount, "budget.maxSampleCount"],
    [estimatedVertices, budget.maxVertexCount, "budget.maxVertexCount"],
    [estimatedChunks, budget.maxChunkCount, "budget.maxChunkCount"],
    [0, budget.maxMapPixelCount, "budget.maxMapPixelCount"]
  ];
  for (const [actual, limit, path] of budgetChecks)
    if (actual > limit)
      pushDiagnostic(
        diagnostics,
        RiverDiagnosticCode.NetworkBudgetExceeded,
        RiverDiagnosticSeverity.Error,
        path,
        `Estimated value ${actual} exceeds budget ${limit}.`
      );
  return { value: hasErrors(diagnostics) ? undefined : network, diagnostics, valid: !hasErrors(diagnostics) };
}

export function decodeRiverNetworkDescriptor(input: unknown): RiverValidationResult<RiverNetworkDescriptor> {
  const diagnostics: RiverDiagnostic[] = [];
  validateNetworkShape(input, diagnostics);
  if (hasErrors(diagnostics)) return { diagnostics, valid: false };
  const typedResult = validateRiverNetworkDescriptor(input as RiverNetworkDescriptor);
  return {
    value: typedResult.value,
    diagnostics: [...diagnostics, ...typedResult.diagnostics],
    valid: typedResult.valid
  };
}

/** @deprecated Use validateRiverNetworkDescriptor. */
export const validateRiverNetworkConfig = validateRiverNetworkDescriptor;

/** @deprecated Use decodeRiverNetworkDescriptor. */
export const decodeRiverNetworkConfig = decodeRiverNetworkDescriptor;

export function getRiverConfigWarnings(config: RiverConfig): string[] {
  return validateRiverConfig(config)
    .diagnostics.filter((diagnostic) => diagnostic.severity !== RiverDiagnosticSeverity.Info)
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`);
}
