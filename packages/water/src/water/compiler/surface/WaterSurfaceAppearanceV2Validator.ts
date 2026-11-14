/** Strict, allocation-bounded validation for the composable V2 surface closure. */
import { WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import {
  WaterDepthResponseCombineV2,
  WaterBoundaryResponseV2,
  WaterPatternBoundaryCombineV2,
  WaterPatternModelV2,
  WaterPatternResponseV2,
  WaterRefractionNormalSourceV2,
  WaterRefractionValidationModeV2,
  WaterSurfaceAppearanceDiagnosticCode,
  WaterSurfaceAppearanceDiagnosticSeverity,
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCompositionV2,
  WaterSurfaceDepthResponseModelV2,
  WaterSurfaceDirectionalHighlightModelV2,
  WaterSurfaceDetailBlend,
  WaterSurfaceDetailSource,
  WaterSurfaceDetailSpace,
  WaterSurfaceNormalConvention,
  WaterSurfaceNormalStrengthModeV2,
  WaterSurfacePrimaryColorClosure,
  type WaterBoundaryEffectV2,
  type WaterSurfaceCausticsV2,
  type WaterBoundaryOutputsV2,
  type WaterPatternV2,
  type WaterSurfaceAppearanceAssetV2,
  type WaterSurfaceAppearanceColor,
  type WaterSurfaceAppearanceDiagnostic,
  type WaterSurfaceAppearanceValidationResult,
  type WaterSurfaceColorStopV2,
  type WaterSurfaceDepthResponseV2,
  type WaterSurfaceDirectionalHighlightV2,
  type WaterExponentialDepthTermV2,
  type WaterSurfaceDetailLayerV2,
  type WaterSurfaceFoamOctaves,
  type WaterRefractionV2
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";

type UnknownRecord = Record<string, unknown>;

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA_256_PATTERN = /^[A-Fa-f0-9]{64}$/;
const MAX_DISTANCE_METERS = 100_000;
const MAX_DETAIL_SCALE = 1_024;
const MAX_DETAIL_VELOCITY = 1_024;
const MAX_DETAIL_STRENGTH = 4;
const MAX_ROTATION_DEGREES = 3_600;
const MAX_DEPTH_EXPONENT = 32;
const MAX_DEPTH_COEFFICIENT_PER_METER = 1_000;
const MAX_PATTERN_SCALE = 100_000;
const MAX_PATTERN_RATE = 1_024;
const MAX_PATTERN_EXPONENT_MAGNITUDE = 32;
const MAX_LACUNARITY = 64;
const MAX_DETAIL_LAYER_COUNT = 2;
const MAX_BOUNDARY_EFFECT_COUNT = 4;
const MAX_COLOR_STOP_COUNT = 4;
const MAX_MACRO_NORMAL_STRENGTH = 8;
const MAX_DIRECTIONAL_HIGHLIGHT_STRENGTH = 64;
const MAX_DIRECTIONAL_HIGHLIGHT_EXPONENT = 8196;
const MAX_DIRECTIONAL_HIGHLIGHT_DISTORTION = 2;

const METER_FIELDS = new Set<WaterFieldSemantic>([
  WaterFieldSemantic.SurfaceHeight,
  WaterFieldSemantic.VerticalDepth,
  WaterFieldSemantic.HorizontalShoreDistance,
  WaterFieldSemantic.SceneEyeDepth,
  WaterFieldSemantic.SceneRayDepth,
  WaterFieldSemantic.SurfaceNormalDepth,
  WaterFieldSemantic.OpticalPath,
  WaterFieldSemantic.ObstacleContact
]);

const COMPOSITE_EXPONENTIAL_FIELDS = new Set<WaterFieldSemantic>([
  WaterFieldSemantic.SceneEyeDepth,
  WaterFieldSemantic.SceneRayDepth,
  WaterFieldSemantic.SurfaceNormalDepth,
  WaterFieldSemantic.VerticalDepth
]);

function isCompositeExponentialField(field: WaterFieldSemantic): field is WaterExponentialDepthTermV2["field"] {
  return COMPOSITE_EXPONENTIAL_FIELDS.has(field);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function addError(
  diagnostics: WaterSurfaceAppearanceDiagnostic[],
  code: WaterSurfaceAppearanceDiagnosticCode,
  path: string,
  message: string
): void {
  diagnostics.push({
    code,
    severity: WaterSurfaceAppearanceDiagnosticSeverity.Error,
    path,
    message
  });
}

function record(
  value: unknown,
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): UnknownRecord | undefined {
  if (isRecord(value)) return value;
  addError(
    diagnostics,
    value === undefined
      ? WaterSurfaceAppearanceDiagnosticCode.MissingField
      : WaterSurfaceAppearanceDiagnosticCode.InvalidType,
    path,
    value === undefined ? "Required object field is missing." : "Expected an object."
  );
  return undefined;
}

function identifier(value: unknown, path: string, diagnostics: WaterSurfaceAppearanceDiagnostic[]): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    value.includes("://") ||
    !STABLE_ID_PATTERN.test(value)
  ) {
    addError(
      diagnostics,
      value === undefined
        ? WaterSurfaceAppearanceDiagnosticCode.MissingField
        : WaterSurfaceAppearanceDiagnosticCode.InvalidIdentifier,
      path,
      "Expected a non-empty stable logical identifier, not a URL."
    );
    return undefined;
  }
  return value;
}

function finite(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  diagnostics: WaterSurfaceAppearanceDiagnostic[],
  exclusiveMinimum = false
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(
      diagnostics,
      value === undefined
        ? WaterSurfaceAppearanceDiagnosticCode.MissingField
        : WaterSurfaceAppearanceDiagnosticCode.InvalidNumber,
      path,
      "Expected a finite number."
    );
    return undefined;
  }
  if ((exclusiveMinimum ? value <= minimum : value < minimum) || value > maximum) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange,
      path,
      `Expected ${exclusiveMinimum ? ">" : ">="} ${minimum} and <= ${maximum}.`
    );
    return undefined;
  }
  return value;
}

function boolean(value: unknown, path: string, diagnostics: WaterSurfaceAppearanceDiagnostic[]): boolean | undefined {
  if (typeof value === "boolean") return value;
  addError(
    diagnostics,
    value === undefined
      ? WaterSurfaceAppearanceDiagnosticCode.MissingField
      : WaterSurfaceAppearanceDiagnosticCode.InvalidType,
    path,
    "Expected a boolean."
  );
  return undefined;
}

function tuple2(
  value: unknown,
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[],
  minimum: number,
  maximum: number,
  exclusiveMinimum = false
): readonly [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) {
    addError(
      diagnostics,
      Array.isArray(value)
        ? WaterSurfaceAppearanceDiagnosticCode.TupleLengthMismatch
        : WaterSurfaceAppearanceDiagnosticCode.InvalidType,
      path,
      "Expected a two-number tuple."
    );
    return undefined;
  }
  const first = finite(value[0], `${path}[0]`, minimum, maximum, diagnostics, exclusiveMinimum);
  const second = finite(value[1], `${path}[1]`, minimum, maximum, diagnostics, exclusiveMinimum);
  return first === undefined || second === undefined ? undefined : Object.freeze([first, second]);
}

function color4(
  value: unknown,
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceAppearanceColor | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    addError(
      diagnostics,
      Array.isArray(value)
        ? WaterSurfaceAppearanceDiagnosticCode.TupleLengthMismatch
        : WaterSurfaceAppearanceDiagnosticCode.InvalidType,
      path,
      "Expected a four-number linear RGBA tuple."
    );
    return undefined;
  }
  const components = value.map((component, index) => finite(component, `${path}[${index}]`, 0, 1, diagnostics));
  return components.some((component) => component === undefined)
    ? undefined
    : Object.freeze([
        components[0] as number,
        components[1] as number,
        components[2] as number,
        components[3] as number
      ]);
}

function color3(
  value: unknown,
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): readonly [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3) {
    addError(
      diagnostics,
      Array.isArray(value)
        ? WaterSurfaceAppearanceDiagnosticCode.TupleLengthMismatch
        : WaterSurfaceAppearanceDiagnosticCode.InvalidType,
      path,
      "Expected a three-number linear RGB tuple."
    );
    return undefined;
  }
  const components = value.map((component, index) => finite(component, `${path}[${index}]`, 0, 1, diagnostics));
  return components.some((component) => component === undefined)
    ? undefined
    : Object.freeze([components[0] as number, components[1] as number, components[2] as number]);
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): T | undefined {
  if (typeof value === "string" && values.includes(value as T)) return value as T;
  addError(
    diagnostics,
    value === undefined
      ? WaterSurfaceAppearanceDiagnosticCode.MissingField
      : WaterSurfaceAppearanceDiagnosticCode.InvalidEnum,
    path,
    `Expected one of: ${values.join(", ")}.`
  );
  return undefined;
}

function sha256(value: unknown, path: string, diagnostics: WaterSurfaceAppearanceDiagnostic[]): string | undefined {
  if (typeof value === "string" && SHA_256_PATTERN.test(value)) return value.toLowerCase();
  addError(
    diagnostics,
    value === undefined
      ? WaterSurfaceAppearanceDiagnosticCode.MissingField
      : WaterSurfaceAppearanceDiagnosticCode.InvalidContentHash,
    path,
    "Expected a 64-digit hexadecimal SHA-256."
  );
  return undefined;
}

function decodeLayer(
  value: unknown,
  index: number,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceDetailLayerV2 | undefined {
  const path = `$.detailLayers[${index}]`;
  const source = record(value, path, diagnostics);
  if (!source) return undefined;
  const id = identifier(source.id, `${path}.id`, diagnostics);
  const detailSource = enumValue(source.source, Object.values(WaterSurfaceDetailSource), `${path}.source`, diagnostics);
  const space = enumValue(source.space, Object.values(WaterSurfaceDetailSpace), `${path}.space`, diagnostics);
  const scale = tuple2(source.scale, `${path}.scale`, diagnostics, 0, MAX_DETAIL_SCALE, true);
  const velocity = tuple2(source.velocity, `${path}.velocity`, diagnostics, -MAX_DETAIL_VELOCITY, MAX_DETAIL_VELOCITY);
  const rotationDegrees = finite(
    source.rotationDegrees,
    `${path}.rotationDegrees`,
    -MAX_ROTATION_DEGREES,
    MAX_ROTATION_DEGREES,
    diagnostics
  );
  const strength = finite(source.strength, `${path}.strength`, 0, MAX_DETAIL_STRENGTH, diagnostics, true);
  const normalConvention = enumValue(
    source.normalConvention,
    Object.values(WaterSurfaceNormalConvention),
    `${path}.normalConvention`,
    diagnostics
  );
  const strengthMode = enumValue(
    source.strengthMode,
    Object.values(WaterSurfaceNormalStrengthModeV2),
    `${path}.strengthMode`,
    diagnostics
  );
  const blend = enumValue(source.blend, Object.values(WaterSurfaceDetailBlend), `${path}.blend`, diagnostics);
  let textureAssetId: string | undefined;
  let textureContentHash: string | undefined;
  const hasTexture = source.textureAssetId !== undefined || source.textureContentHash !== undefined;
  if (detailSource === WaterSurfaceDetailSource.NormalTexture && hasTexture) {
    textureAssetId = identifier(source.textureAssetId, `${path}.textureAssetId`, diagnostics);
    textureContentHash = sha256(source.textureContentHash, `${path}.textureContentHash`, diagnostics);
  }
  if (
    id === undefined ||
    detailSource === undefined ||
    space === undefined ||
    scale === undefined ||
    velocity === undefined ||
    rotationDegrees === undefined ||
    strength === undefined ||
    normalConvention === undefined ||
    strengthMode === undefined ||
    blend === undefined ||
    (detailSource === WaterSurfaceDetailSource.NormalTexture &&
      hasTexture &&
      (textureAssetId === undefined || textureContentHash === undefined))
  ) {
    return undefined;
  }
  return Object.freeze({
    id,
    source: detailSource,
    ...(textureAssetId ? { textureAssetId, textureContentHash } : {}),
    space,
    scale,
    velocity,
    rotationDegrees,
    strength,
    normalConvention,
    strengthMode,
    blend
  });
}

function decodeOctaves(
  value: unknown,
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceFoamOctaves | undefined {
  const source = record(value, path, diagnostics);
  if (!source) return undefined;
  const count = source.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 3) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange,
      `${path}.count`,
      "Expected an integer octave count in [1, 3]."
    );
    return undefined;
  }
  if (!Array.isArray(source.weights) || source.weights.length !== count) {
    addError(
      diagnostics,
      Array.isArray(source.weights)
        ? WaterSurfaceAppearanceDiagnosticCode.TupleLengthMismatch
        : WaterSurfaceAppearanceDiagnosticCode.InvalidType,
      `${path}.weights`,
      `Expected ${count} non-negative octave weights.`
    );
    return undefined;
  }
  const weights = source.weights.map((weight, index) =>
    finite(weight, `${path}.weights[${index}]`, 0, Number.MAX_VALUE, diagnostics)
  );
  if (weights.some((weight) => weight === undefined)) return undefined;
  if (weights.every((weight) => weight === 0)) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange,
      `${path}.weights`,
      "Expected at least one positive octave weight."
    );
    return undefined;
  }
  if (count === 1) {
    const normalizedWeights: readonly [number] = Object.freeze([weights[0] as number]);
    return Object.freeze({ count: 1, weights: normalizedWeights });
  }
  if (count === 2) {
    const normalizedWeights: readonly [number, number] = Object.freeze([weights[0] as number, weights[1] as number]);
    return Object.freeze({ count: 2, weights: normalizedWeights });
  }
  const normalizedWeights: readonly [number, number, number] = Object.freeze([
    weights[0] as number,
    weights[1] as number,
    weights[2] as number
  ]);
  return Object.freeze({
    count: 3,
    weights: normalizedWeights
  });
}

function decodePattern(
  value: unknown,
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterPatternV2 | undefined {
  if (value === undefined) return undefined;
  const source = record(value, path, diagnostics);
  if (!source) return undefined;
  const model = enumValue(source.model, Object.values(WaterPatternModelV2), `${path}.model`, diagnostics);
  const worldScale = finite(source.worldScale, `${path}.worldScale`, 0, MAX_PATTERN_SCALE, diagnostics, true);
  const timeRate = finite(source.timeRate, `${path}.timeRate`, 0, MAX_PATTERN_RATE, diagnostics, true);
  const opacity = finite(source.opacity, `${path}.opacity`, 0, 1, diagnostics);
  const octaves = decodeOctaves(source.octaves, `${path}.octaves`, diagnostics);
  const lacunarity = finite(source.lacunarity, `${path}.lacunarity`, 0, MAX_LACUNARITY, diagnostics, true);
  const response = enumValue(source.response, Object.values(WaterPatternResponseV2), `${path}.response`, diagnostics);
  const invert = boolean(source.invert, `${path}.invert`, diagnostics);
  let exponent: number | undefined;
  if (response === WaterPatternResponseV2.Power) {
    exponent = finite(
      source.exponent,
      `${path}.exponent`,
      -MAX_PATTERN_EXPONENT_MAGNITUDE,
      MAX_PATTERN_EXPONENT_MAGNITUDE,
      diagnostics
    );
    if (exponent === 0) {
      addError(
        diagnostics,
        WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange,
        `${path}.exponent`,
        "A power-pattern exponent must be non-zero."
      );
      exponent = undefined;
    }
  }
  const combine = enumValue(
    source.combine,
    Object.values(WaterPatternBoundaryCombineV2),
    `${path}.combine`,
    diagnostics
  );
  return model === undefined ||
    worldScale === undefined ||
    timeRate === undefined ||
    opacity === undefined ||
    !octaves ||
    lacunarity === undefined ||
    response === undefined ||
    invert === undefined ||
    (response === WaterPatternResponseV2.Power && exponent === undefined) ||
    combine === undefined
    ? undefined
    : Object.freeze({
        model,
        worldScale,
        timeRate,
        opacity,
        octaves,
        lacunarity,
        response,
        invert,
        ...(exponent !== undefined ? { exponent } : {}),
        combine
      });
}

function decodeOutputs(
  value: unknown,
  path: string,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterBoundaryOutputsV2 | undefined {
  const source = record(value, path, diagnostics);
  if (!source) return undefined;
  const colorMode =
    source.colorMode === undefined
      ? undefined
      : enumValue(source.colorMode, ["additive", "albedo"] as const, `${path}.colorMode`, diagnostics);
  const alpha = source.alpha === undefined ? undefined : finite(source.alpha, `${path}.alpha`, 0, 1, diagnostics);
  const color = source.color === undefined ? undefined : color3(source.color, `${path}.color`, diagnostics);
  const roughness =
    source.roughness === undefined ? undefined : finite(source.roughness, `${path}.roughness`, 0, 1, diagnostics);
  const refractionSuppression =
    source.refractionSuppression === undefined
      ? undefined
      : finite(source.refractionSuppression, `${path}.refractionSuppression`, 0, 1, diagnostics);
  if (alpha === undefined && color === undefined && roughness === undefined && refractionSuppression === undefined) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.MissingField,
      path,
      "A boundary effect must write at least one material output."
    );
    return undefined;
  }
  return Object.freeze({
    ...(alpha !== undefined ? { alpha } : {}),
    ...(color ? { color } : {}),
    ...(colorMode ? { colorMode } : {}),
    ...(roughness !== undefined ? { roughness } : {}),
    ...(refractionSuppression !== undefined ? { refractionSuppression } : {})
  });
}

function decodeBoundary(
  value: unknown,
  index: number,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterBoundaryEffectV2 | undefined {
  const path = `$.boundaryEffects[${index}]`;
  const source = record(value, path, diagnostics);
  if (!source) return undefined;
  const id = identifier(source.id, `${path}.id`, diagnostics);
  const field = enumValue(source.field, Object.values(WaterFieldSemantic), `${path}.field`, diagnostics);
  if (field !== undefined && !METER_FIELDS.has(field)) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidEnum,
      `${path}.field`,
      "Boundary rangeMeters requires a meter-valued field semantic."
    );
  }
  const response = enumValue(source.response, Object.values(WaterBoundaryResponseV2), `${path}.response`, diagnostics);
  const rangeMeters = finite(source.rangeMeters, `${path}.rangeMeters`, 0, MAX_DISTANCE_METERS, diagnostics, true);
  const invert = boolean(source.invert, `${path}.invert`, diagnostics);
  const exponent =
    response === WaterBoundaryResponseV2.Power
      ? finite(source.exponent, `${path}.exponent`, 0, MAX_DEPTH_EXPONENT, diagnostics, true)
      : undefined;
  const pattern = decodePattern(source.pattern, `${path}.pattern`, diagnostics);
  if (
    pattern?.combine === WaterPatternBoundaryCombineV2.SignedBoundaryAddSaturate &&
    (response !== WaterBoundaryResponseV2.Linear || invert !== true)
  ) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidEnum,
      `${path}.pattern.combine`,
      "signed-boundary-add-saturate requires an inverted linear boundary response."
    );
  }
  const outputs = decodeOutputs(source.outputs, `${path}.outputs`, diagnostics);
  if (
    id === undefined ||
    field === undefined ||
    !METER_FIELDS.has(field) ||
    response === undefined ||
    rangeMeters === undefined ||
    invert === undefined ||
    (response === WaterBoundaryResponseV2.Power && exponent === undefined) ||
    (source.pattern !== undefined && pattern === undefined) ||
    outputs === undefined
  ) {
    return undefined;
  }
  return Object.freeze({
    id,
    field,
    response,
    rangeMeters,
    invert,
    ...(exponent !== undefined ? { exponent } : {}),
    ...(pattern ? { pattern } : {}),
    outputs
  });
}

function decodeDepthResponse(
  value: unknown,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceDepthResponseV2 | undefined {
  const path = "$.depthResponse";
  const source = record(value, path, diagnostics);
  if (!source) return undefined;
  const model = enumValue(source.model, Object.values(WaterSurfaceDepthResponseModelV2), `${path}.model`, diagnostics);
  if (model === WaterSurfaceDepthResponseModelV2.CompositeExponential) {
    if (!Array.isArray(source.terms) || source.terms.length < 1 || source.terms.length > 2) {
      addError(
        diagnostics,
        Array.isArray(source.terms)
          ? WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange
          : WaterSurfaceAppearanceDiagnosticCode.InvalidType,
        `${path}.terms`,
        "Composite exponential depth response requires one or two terms."
      );
      return undefined;
    }
    const terms: WaterExponentialDepthTermV2[] = [];
    const fields = new Set<WaterFieldSemantic>();
    for (let index = 0; index < source.terms.length; index++) {
      const termPath = `${path}.terms[${index}]`;
      const term = record(source.terms[index], termPath, diagnostics);
      if (!term) continue;
      const termField = enumValue(term.field, Object.values(WaterFieldSemantic), `${termPath}.field`, diagnostics);
      if (termField !== undefined && !isCompositeExponentialField(termField)) {
        addError(
          diagnostics,
          WaterSurfaceAppearanceDiagnosticCode.InvalidEnum,
          `${termPath}.field`,
          "Composite exponential terms require SceneRayDepth, SurfaceNormalDepth, or VerticalDepth."
        );
      }
      if (termField !== undefined && fields.has(termField)) {
        addError(
          diagnostics,
          WaterSurfaceAppearanceDiagnosticCode.InvalidEnum,
          `${termPath}.field`,
          "Composite exponential term fields must be unique."
        );
      }
      const coefficientPerMeter = finite(
        term.coefficientPerMeter,
        `${termPath}.coefficientPerMeter`,
        0,
        MAX_DEPTH_COEFFICIENT_PER_METER,
        diagnostics,
        true
      );
      if (
        termField === undefined ||
        !isCompositeExponentialField(termField) ||
        fields.has(termField) ||
        coefficientPerMeter === undefined
      ) {
        continue;
      }
      fields.add(termField);
      terms.push(Object.freeze({ field: termField, coefficientPerMeter }));
    }
    const combine = enumValue(
      source.combine,
      Object.values(WaterDepthResponseCombineV2),
      `${path}.combine`,
      diagnostics
    );
    const shallowColor = color4(source.shallowColor, `${path}.shallowColor`, diagnostics);
    const deepColor = color4(source.deepColor, `${path}.deepColor`, diagnostics);
    if (
      terms.length !== source.terms.length ||
      combine !== WaterDepthResponseCombineV2.Maximum ||
      !shallowColor ||
      !deepColor
    ) {
      return undefined;
    }
    return Object.freeze({
      model,
      terms: Object.freeze(terms) as readonly [WaterExponentialDepthTermV2, WaterExponentialDepthTermV2?],
      combine,
      shallowColor,
      deepColor
    });
  }
  const field = enumValue(source.field, Object.values(WaterFieldSemantic), `${path}.field`, diagnostics);
  if (model === WaterSurfaceDepthResponseModelV2.BeerLambert) {
    if (field !== WaterFieldSemantic.OpticalPath) {
      addError(
        diagnostics,
        WaterSurfaceAppearanceDiagnosticCode.InvalidEnum,
        `${path}.field`,
        "Beer-Lambert requires the optical-path semantic."
      );
      return undefined;
    }
    if (source.scatteringTint !== undefined) {
      const tint = record(source.scatteringTint, `${path}.scatteringTint`, diagnostics);
      if (!tint) return undefined;
      const coefficientPerMeter = finite(
        tint.coefficientPerMeter,
        `${path}.scatteringTint.coefficientPerMeter`,
        0,
        1000,
        diagnostics
      );
      const shallowColor = color4(tint.shallowColor, `${path}.scatteringTint.shallowColor`, diagnostics);
      const deepColor = color4(tint.deepColor, `${path}.scatteringTint.deepColor`, diagnostics);
      if (coefficientPerMeter === undefined || !shallowColor || !deepColor) return undefined;
      return Object.freeze({
        model,
        field,
        scatteringTint: Object.freeze({ coefficientPerMeter, shallowColor, deepColor })
      });
    }
    return Object.freeze({ model, field });
  }
  if (field !== undefined && !METER_FIELDS.has(field)) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidEnum,
      `${path}.field`,
      "Depth response distanceMeters requires a meter-valued field semantic."
    );
  }
  if (model === WaterSurfaceDepthResponseModelV2.LinearColorOpacity) {
    const colorCoefficientPerMeter = finite(
      source.colorCoefficientPerMeter,
      `${path}.colorCoefficientPerMeter`,
      0,
      1000,
      diagnostics
    );
    const opacityCoefficientPerMeter = finite(
      source.opacityCoefficientPerMeter,
      `${path}.opacityCoefficientPerMeter`,
      0,
      1000,
      diagnostics
    );
    const maximumOpacity = finite(source.maximumOpacity, `${path}.maximumOpacity`, 0, 1, diagnostics);
    const shallowColor = color4(source.shallowColor, `${path}.shallowColor`, diagnostics);
    const deepColor = color4(source.deepColor, `${path}.deepColor`, diagnostics);
    if (
      field === undefined ||
      !METER_FIELDS.has(field) ||
      colorCoefficientPerMeter === undefined ||
      opacityCoefficientPerMeter === undefined ||
      maximumOpacity === undefined ||
      !shallowColor ||
      !deepColor
    )
      return undefined;
    return Object.freeze({
      model,
      field,
      colorCoefficientPerMeter,
      opacityCoefficientPerMeter,
      maximumOpacity,
      shallowColor,
      deepColor
    });
  }
  const distanceMeters = finite(
    source.distanceMeters,
    `${path}.distanceMeters`,
    0,
    MAX_DISTANCE_METERS,
    diagnostics,
    true
  );
  if (model === WaterSurfaceDepthResponseModelV2.PowerRamp) {
    const exponent = finite(source.exponent, `${path}.exponent`, 0, MAX_DEPTH_EXPONENT, diagnostics, true);
    const color = color4(source.color, `${path}.color`, diagnostics);
    return field === undefined ||
      !METER_FIELDS.has(field) ||
      distanceMeters === undefined ||
      exponent === undefined ||
      !color
      ? undefined
      : Object.freeze({ model, field, distanceMeters, exponent, color });
  }
  if (model !== WaterSurfaceDepthResponseModelV2.ColorRamp) return undefined;
  if (!Array.isArray(source.colors) || source.colors.length < 2 || source.colors.length > MAX_COLOR_STOP_COUNT) {
    addError(
      diagnostics,
      Array.isArray(source.colors)
        ? WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange
        : WaterSurfaceAppearanceDiagnosticCode.InvalidType,
      `${path}.colors`,
      `Expected 2-${MAX_COLOR_STOP_COUNT} ordered color stops.`
    );
    return undefined;
  }
  const stops: WaterSurfaceColorStopV2[] = [];
  let previous = -1;
  for (let index = 0; index < source.colors.length; index++) {
    const stopPath = `${path}.colors[${index}]`;
    const stop = record(source.colors[index], stopPath, diagnostics);
    if (!stop) continue;
    const position = finite(stop.position, `${stopPath}.position`, 0, 1, diagnostics);
    const color = color4(stop.color, `${stopPath}.color`, diagnostics);
    if (position === undefined || !color) continue;
    if (position <= previous) {
      addError(
        diagnostics,
        WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange,
        `${stopPath}.position`,
        "Color stop positions must be strictly increasing."
      );
      continue;
    }
    previous = position;
    stops.push(Object.freeze({ position, color }));
  }
  if (stops[0]?.position !== 0 || stops.at(-1)?.position !== 1) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange,
      `${path}.colors`,
      "Color ramps must start at 0 and end at 1."
    );
  }
  return field === undefined ||
    !METER_FIELDS.has(field) ||
    distanceMeters === undefined ||
    stops.length !== source.colors.length
    ? undefined
    : Object.freeze({ model, field, distanceMeters, colors: Object.freeze(stops) });
}

function decodeRefraction(
  value: unknown,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterRefractionV2 | undefined {
  const path = "$.refraction";
  const source = record(value, path, diagnostics);
  if (!source) return undefined;
  const enabled = boolean(source.enabled, `${path}.enabled`, diagnostics);
  const uvScale = finite(source.uvScale, `${path}.uvScale`, 0, 8, diagnostics);
  const normalSource = enumValue(
    source.normalSource,
    Object.values(WaterRefractionNormalSourceV2),
    `${path}.normalSource`,
    diagnostics
  );
  const validation = enumValue(
    source.validation,
    Object.values(WaterRefractionValidationModeV2),
    `${path}.validation`,
    diagnostics
  );
  return enabled === undefined || uvScale === undefined || normalSource === undefined || validation === undefined
    ? undefined
    : Object.freeze({ enabled, uvScale, normalSource, validation });
}

function decodeDirectionalHighlight(
  value: unknown,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceDirectionalHighlightV2 | undefined {
  const path = "$.directionalHighlight";
  const source = record(value, path, diagnostics);
  if (!source) return undefined;
  const model = enumValue(
    source.model,
    Object.values(WaterSurfaceDirectionalHighlightModelV2),
    `${path}.model`,
    diagnostics
  );
  const strength = finite(source.strength, `${path}.strength`, 0, MAX_DIRECTIONAL_HIGHLIGHT_STRENGTH, diagnostics);
  const exponent = finite(source.exponent, `${path}.exponent`, 1, MAX_DIRECTIONAL_HIGHLIGHT_EXPONENT, diagnostics);
  const distortion = finite(
    source.distortion,
    `${path}.distortion`,
    0,
    MAX_DIRECTIONAL_HIGHLIGHT_DISTORTION,
    diagnostics
  );
  const sharp = boolean(source.sharp, `${path}.sharp`, diagnostics);
  return model === undefined ||
    strength === undefined ||
    exponent === undefined ||
    distortion === undefined ||
    sharp === undefined
    ? undefined
    : Object.freeze({ model, strength, exponent, distortion, sharp });
}

function decodeCaustics(
  value: unknown,
  diagnostics: WaterSurfaceAppearanceDiagnostic[]
): WaterSurfaceCausticsV2 | undefined {
  const path = "$.caustics",
    s = record(value, path, diagnostics);
  if (!s) return undefined;
  const id = identifier(s.id, `${path}.id`, diagnostics);
  const textureAssetId = identifier(s.textureAssetId, `${path}.textureAssetId`, diagnostics);
  const textureContentHash = sha256(s.textureContentHash, `${path}.textureContentHash`, diagnostics);
  const scale = tuple2(s.scale, `${path}.scale`, diagnostics, 0.000001, 10000);
  const velocity = tuple2(s.velocity, `${path}.velocity`, diagnostics, -1000, 1000);
  const intensity = finite(s.intensity, `${path}.intensity`, 0, 1000, diagnostics);
  const distortion = finite(s.distortion, `${path}.distortion`, -8, 8, diagnostics);
  const parallaxOffset = finite(s.parallaxOffset, `${path}.parallaxOffset`, -100, 100, diagnostics);
  const parallaxBias = finite(s.parallaxBias, `${path}.parallaxBias`, 0.0001, 100, diagnostics);
  const fadeCoefficientPerMeter = finite(
    s.fadeCoefficientPerMeter,
    `${path}.fadeCoefficientPerMeter`,
    0,
    1000,
    diagnostics
  );
  const opacityContribution = finite(s.opacityContribution, `${path}.opacityContribution`, 0, 1, diagnostics);
  if (
    !id ||
    !textureAssetId ||
    !textureContentHash ||
    !scale ||
    !velocity ||
    intensity === undefined ||
    distortion === undefined ||
    parallaxOffset === undefined ||
    parallaxBias === undefined ||
    fadeCoefficientPerMeter === undefined ||
    opacityContribution === undefined
  )
    return undefined;
  return Object.freeze({
    id,
    textureAssetId,
    textureContentHash,
    scale,
    velocity,
    intensity,
    distortion,
    parallaxOffset,
    parallaxBias,
    fadeCoefficientPerMeter,
    opacityContribution
  });
}

export function validateWaterSurfaceAppearanceV2Asset(source: unknown): WaterSurfaceAppearanceValidationResult {
  const diagnostics: WaterSurfaceAppearanceDiagnostic[] = [];
  if (!isRecord(source)) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidRootType,
      "$",
      "Expected a surface appearance object."
    );
    return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
  }
  if (source.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V2) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.UnsupportedSchemaVersion,
      "$.schemaVersion",
      "Expected surface appearance schema version 2."
    );
  }
  const id = identifier(source.id, "$.id", diagnostics);
  const primaryColorClosure = enumValue(
    source.primaryColorClosure,
    Object.values(WaterSurfacePrimaryColorClosure),
    "$.primaryColorClosure",
    diagnostics
  );
  const macroNormalStrength =
    source.macroNormalStrength === undefined
      ? undefined
      : finite(source.macroNormalStrength, "$.macroNormalStrength", 0, MAX_MACRO_NORMAL_STRENGTH, diagnostics);
  const flowNormalStrength =
    source.flowNormalStrength === undefined
      ? undefined
      : finite(source.flowNormalStrength, "$.flowNormalStrength", 0, 8, diagnostics);
  const detailNormalStrength =
    source.detailNormalStrength === undefined
      ? undefined
      : finite(source.detailNormalStrength, "$.detailNormalStrength", 0, 8, diagnostics);
  const directionalHighlight =
    source.directionalHighlight === undefined
      ? undefined
      : decodeDirectionalHighlight(source.directionalHighlight, diagnostics);
  if (!Array.isArray(source.detailLayers) || source.detailLayers.length > MAX_DETAIL_LAYER_COUNT) {
    addError(
      diagnostics,
      Array.isArray(source.detailLayers)
        ? WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange
        : WaterSurfaceAppearanceDiagnosticCode.InvalidType,
      "$.detailLayers",
      `Expected at most ${MAX_DETAIL_LAYER_COUNT} detail layers.`
    );
  }
  const detailLayers = Array.isArray(source.detailLayers)
    ? source.detailLayers
        .map((layer, index) => decodeLayer(layer, index, diagnostics))
        .filter((layer): layer is WaterSurfaceDetailLayerV2 => layer !== undefined)
    : [];
  const layerIds = new Set<string>();
  for (const layer of detailLayers) {
    if (layerIds.has(layer.id)) {
      addError(
        diagnostics,
        WaterSurfaceAppearanceDiagnosticCode.InvalidIdentifier,
        "$.detailLayers",
        `Duplicate detail layer id '${layer.id}'.`
      );
    }
    layerIds.add(layer.id);
  }
  const caustics = source.caustics === undefined ? undefined : decodeCaustics(source.caustics, diagnostics);
  if (caustics && (detailLayers.length === 0 || layerIds.has(caustics.id))) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidIdentifier,
      "$.caustics.id",
      "Caustics requires a detail normal and its own distinct resource binding id."
    );
  }
  const depthResponse = decodeDepthResponse(source.depthResponse, diagnostics);
  if (
    primaryColorClosure === WaterSurfacePrimaryColorClosure.PhysicalVolume &&
    depthResponse?.model !== WaterSurfaceDepthResponseModelV2.BeerLambert
  ) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidEnum,
      "$.depthResponse.model",
      "physical-volume requires beer-lambert; complete physical and stylized closures cannot be stacked."
    );
  }
  if (
    (primaryColorClosure === WaterSurfacePrimaryColorClosure.StylizedDepthRamp ||
      primaryColorClosure === WaterSurfacePrimaryColorClosure.RefractedAlbedoDepthRamp ||
      primaryColorClosure === WaterSurfacePrimaryColorClosure.LitSceneColorDepthRamp ||
      primaryColorClosure === WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp) &&
    depthResponse?.model === WaterSurfaceDepthResponseModelV2.BeerLambert
  ) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidEnum,
      "$.depthResponse.model",
      "stylized-depth-ramp requires power-ramp or color-ramp."
    );
  }
  if (!Array.isArray(source.boundaryEffects) || source.boundaryEffects.length > MAX_BOUNDARY_EFFECT_COUNT) {
    addError(
      diagnostics,
      Array.isArray(source.boundaryEffects)
        ? WaterSurfaceAppearanceDiagnosticCode.ValueOutOfRange
        : WaterSurfaceAppearanceDiagnosticCode.InvalidType,
      "$.boundaryEffects",
      `Expected at most ${MAX_BOUNDARY_EFFECT_COUNT} boundary effects.`
    );
  }
  const boundaryEffects = Array.isArray(source.boundaryEffects)
    ? source.boundaryEffects
        .map((effect, index) => decodeBoundary(effect, index, diagnostics))
        .filter((effect): effect is WaterBoundaryEffectV2 => effect !== undefined)
    : [];
  const effectIds = new Set<string>();
  for (const effect of boundaryEffects) {
    if (effectIds.has(effect.id)) {
      addError(
        diagnostics,
        WaterSurfaceAppearanceDiagnosticCode.InvalidIdentifier,
        "$.boundaryEffects",
        `Duplicate boundary effect id '${effect.id}'.`
      );
    }
    effectIds.add(effect.id);
  }
  const refraction = decodeRefraction(source.refraction, diagnostics);
  if (refraction?.normalSource === WaterRefractionNormalSourceV2.FirstDetailLayer && detailLayers.length === 0) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.MissingField,
      "$.detailLayers",
      "First-detail-layer refraction requires a detail normal layer."
    );
  }
  const composition = enumValue(
    source.composition,
    Object.values(WaterSurfaceCompositionV2),
    "$.composition",
    diagnostics
  );
  if (
    primaryColorClosure === WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp &&
    composition !== WaterSurfaceCompositionV2.PrecomposedReplace
  ) {
    addError(
      diagnostics,
      WaterSurfaceAppearanceDiagnosticCode.InvalidEnum,
      "$.composition",
      "scene-color-composite-depth-ramp requires precomposed-replace because it already resolves Scene Color."
    );
  }
  const frozenDiagnostics = Object.freeze(diagnostics);
  if (
    diagnostics.length > 0 ||
    source.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V2 ||
    id === undefined ||
    primaryColorClosure === undefined ||
    (source.macroNormalStrength !== undefined && macroNormalStrength === undefined) ||
    (source.flowNormalStrength !== undefined && flowNormalStrength === undefined) ||
    (source.directionalHighlight !== undefined && directionalHighlight === undefined) ||
    !Array.isArray(source.detailLayers) ||
    detailLayers.length !== source.detailLayers.length ||
    !depthResponse ||
    !Array.isArray(source.boundaryEffects) ||
    boundaryEffects.length !== source.boundaryEffects.length ||
    !refraction ||
    composition === undefined
  ) {
    return Object.freeze({ valid: false, diagnostics: frozenDiagnostics });
  }
  const value: WaterSurfaceAppearanceAssetV2 = Object.freeze({
    schemaVersion: WaterSurfaceAppearanceSchemaVersion.V2,
    id,
    primaryColorClosure,
    ...(macroNormalStrength !== undefined ? { macroNormalStrength } : {}),
    ...(flowNormalStrength !== undefined ? { flowNormalStrength } : {}),
    ...(detailNormalStrength !== undefined ? { detailNormalStrength } : {}),
    ...(caustics ? { caustics } : {}),
    ...(directionalHighlight ? { directionalHighlight } : {}),
    detailLayers: Object.freeze(detailLayers),
    depthResponse,
    boundaryEffects: Object.freeze(boundaryEffects),
    refraction,
    composition
  });
  return Object.freeze({ valid: true, value, diagnostics: frozenDiagnostics });
}
