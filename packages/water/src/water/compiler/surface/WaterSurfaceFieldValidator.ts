import {
  WATER_FIELD_DERIVED_INPUTS,
  findWaterFieldDependencyCycle
} from "../../authoring/surface/WaterSurfaceFieldDerivation";
/** Fail-closed validation and normalization for Water Surface V2 field dependencies. */
import {
  WaterFieldFallback,
  WaterFieldConsumerActivation,
  WaterFieldProviderKind,
  WaterFieldRequirement,
  WaterFieldSemantic,
  WaterFieldUnit,
  WaterSurfaceFieldDiagnosticCode,
  WaterSurfaceFieldDiagnosticSeverity,
  WaterSurfaceFieldSchemaVersion,
  type WaterSurfaceFieldDependencyAssetV2,
  type WaterSurfaceFieldDependencyV2,
  type WaterSurfaceFieldDiagnostic,
  type WaterSurfaceFieldValidationResult
} from "../../authoring/surface/WaterSurfaceFieldTypes";

type UnknownRecord = Record<string, unknown>;

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_BINDING_COUNT = 32;
const SEMANTICS = new Set<string>(Object.values(WaterFieldSemantic));
const PROVIDERS = new Set<string>(Object.values(WaterFieldProviderKind));
const REQUIREMENTS = new Set<string>(Object.values(WaterFieldRequirement));
const ACTIVATIONS = new Set<string>(Object.values(WaterFieldConsumerActivation));
const FALLBACKS = new Set<string>(Object.values(WaterFieldFallback));
const UNITS = new Set<string>(Object.values(WaterFieldUnit));

const EXPECTED_UNITS: Readonly<Record<WaterFieldSemantic, WaterFieldUnit>> = Object.freeze({
  [WaterFieldSemantic.Coverage]: WaterFieldUnit.Normalized,
  [WaterFieldSemantic.SurfaceHeight]: WaterFieldUnit.Meter,
  [WaterFieldSemantic.VerticalDepth]: WaterFieldUnit.Meter,
  [WaterFieldSemantic.HorizontalShoreDistance]: WaterFieldUnit.Meter,
  [WaterFieldSemantic.SceneEyeDepth]: WaterFieldUnit.Meter,
  [WaterFieldSemantic.SceneRayDepth]: WaterFieldUnit.Meter,
  [WaterFieldSemantic.SurfaceNormalDepth]: WaterFieldUnit.Meter,
  [WaterFieldSemantic.OpticalPath]: WaterFieldUnit.Meter,
  [WaterFieldSemantic.ObstacleContact]: WaterFieldUnit.Meter,
  [WaterFieldSemantic.Flow]: WaterFieldUnit.MeterPerSecond,
  [WaterFieldSemantic.SceneColor]: WaterFieldUnit.LinearRgb
});

const PROVIDER_SEMANTICS: Readonly<Record<WaterFieldProviderKind, ReadonlySet<WaterFieldSemantic>>> = Object.freeze({
  [WaterFieldProviderKind.CompiledSpatialField]: new Set([
    WaterFieldSemantic.Coverage,
    WaterFieldSemantic.SurfaceHeight,
    WaterFieldSemantic.VerticalDepth,
    WaterFieldSemantic.HorizontalShoreDistance,
    WaterFieldSemantic.Flow
  ]),
  [WaterFieldProviderKind.CameraDepth]: new Set([
    WaterFieldSemantic.SceneEyeDepth,
    WaterFieldSemantic.SceneRayDepth,
    WaterFieldSemantic.SurfaceNormalDepth,
    WaterFieldSemantic.ObstacleContact
  ]),
  [WaterFieldProviderKind.CameraOpaqueColor]: new Set([WaterFieldSemantic.SceneColor]),
  [WaterFieldProviderKind.Derived]: new Set([
    WaterFieldSemantic.SceneEyeDepth,
    WaterFieldSemantic.SceneRayDepth,
    WaterFieldSemantic.SurfaceNormalDepth,
    WaterFieldSemantic.OpticalPath
  ]),
  [WaterFieldProviderKind.Constant]: new Set([
    WaterFieldSemantic.Coverage,
    WaterFieldSemantic.SurfaceHeight,
    WaterFieldSemantic.VerticalDepth,
    WaterFieldSemantic.HorizontalShoreDistance,
    WaterFieldSemantic.Flow
  ])
});

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function addError(
  diagnostics: WaterSurfaceFieldDiagnostic[],
  code: WaterSurfaceFieldDiagnosticCode,
  path: string,
  message: string
): void {
  diagnostics.push(Object.freeze({ code, severity: WaterSurfaceFieldDiagnosticSeverity.Error, path, message }));
}

function readStableId(value: unknown, path: string, diagnostics: WaterSurfaceFieldDiagnostic[]): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || !STABLE_ID_PATTERN.test(value)) {
    addError(
      diagnostics,
      value === undefined
        ? WaterSurfaceFieldDiagnosticCode.MissingField
        : WaterSurfaceFieldDiagnosticCode.InvalidIdentifier,
      path,
      "Expected a non-empty stable logical identifier."
    );
    return undefined;
  }
  return value;
}

function readEnum<T extends string>(
  value: unknown,
  values: ReadonlySet<string>,
  path: string,
  diagnostics: WaterSurfaceFieldDiagnostic[]
): T | undefined {
  if (typeof value !== "string" || !values.has(value)) {
    addError(
      diagnostics,
      value === undefined ? WaterSurfaceFieldDiagnosticCode.MissingField : WaterSurfaceFieldDiagnosticCode.InvalidEnum,
      path,
      "Expected a supported enum value."
    );
    return undefined;
  }
  return value as T;
}

function decodeBinding(
  value: unknown,
  index: number,
  diagnostics: WaterSurfaceFieldDiagnostic[]
): WaterSurfaceFieldDependencyV2 | undefined {
  const path = `$.bindings[${index}]`;
  if (!isRecord(value)) {
    addError(diagnostics, WaterSurfaceFieldDiagnosticCode.InvalidType, path, "Expected a field dependency object.");
    return undefined;
  }
  const consumerId = readStableId(value.consumerId, `${path}.consumerId`, diagnostics);
  const semantic = readEnum<WaterFieldSemantic>(value.semantic, SEMANTICS, `${path}.semantic`, diagnostics);
  const requirement = readEnum<WaterFieldRequirement>(
    value.requirement,
    REQUIREMENTS,
    `${path}.requirement`,
    diagnostics
  );
  const activation = readEnum<WaterFieldConsumerActivation>(
    value.activation,
    ACTIVATIONS,
    `${path}.activation`,
    diagnostics
  );
  const fallback = readEnum<WaterFieldFallback>(value.fallback, FALLBACKS, `${path}.fallback`, diagnostics);
  const unit = readEnum<WaterFieldUnit>(value.unit, UNITS, `${path}.unit`, diagnostics);
  const providers: WaterFieldProviderKind[] = [];
  if (!Array.isArray(value.providers) || value.providers.length === 0) {
    addError(
      diagnostics,
      value.providers === undefined
        ? WaterSurfaceFieldDiagnosticCode.MissingField
        : WaterSurfaceFieldDiagnosticCode.InvalidType,
      `${path}.providers`,
      "Expected at least one ordered provider."
    );
  } else {
    const seen = new Set<WaterFieldProviderKind>();
    value.providers.forEach((provider, providerIndex) => {
      const decoded = readEnum<WaterFieldProviderKind>(
        provider,
        PROVIDERS,
        `${path}.providers[${providerIndex}]`,
        diagnostics
      );
      if (!decoded) return;
      if (seen.has(decoded)) {
        addError(
          diagnostics,
          WaterSurfaceFieldDiagnosticCode.DuplicateProvider,
          `${path}.providers[${providerIndex}]`,
          `Provider '${decoded}' is duplicated.`
        );
        return;
      }
      seen.add(decoded);
      providers.push(decoded);
    });
  }
  if (semantic && unit && EXPECTED_UNITS[semantic] !== unit) {
    addError(
      diagnostics,
      WaterSurfaceFieldDiagnosticCode.UnitSemanticMismatch,
      `${path}.unit`,
      `${semantic} requires ${EXPECTED_UNITS[semantic]}.`
    );
  }
  if (semantic) {
    providers.forEach((provider, providerIndex) => {
      if (!PROVIDER_SEMANTICS[provider].has(semantic)) {
        addError(
          diagnostics,
          WaterSurfaceFieldDiagnosticCode.ProviderSemanticMismatch,
          `${path}.providers[${providerIndex}]`,
          `${provider} cannot provide ${semantic}.`
        );
      }
    });
  }
  if (requirement === WaterFieldRequirement.Required && fallback === WaterFieldFallback.DisableEffect) {
    addError(
      diagnostics,
      WaterSurfaceFieldDiagnosticCode.InvalidFallback,
      `${path}.fallback`,
      "A required field cannot disable its consumer."
    );
  }
  if (requirement === WaterFieldRequirement.Optional && fallback === WaterFieldFallback.FailActivation) {
    addError(
      diagnostics,
      WaterSurfaceFieldDiagnosticCode.InvalidFallback,
      `${path}.fallback`,
      "An optional field cannot fail activation."
    );
  }
  if (fallback === WaterFieldFallback.UseNextProvider && providers.length < 2) {
    addError(
      diagnostics,
      WaterSurfaceFieldDiagnosticCode.InvalidFallback,
      `${path}.fallback`,
      "use-next-provider requires at least two distinct providers."
    );
  }
  if (providers.length > 1 && fallback !== WaterFieldFallback.UseNextProvider) {
    addError(
      diagnostics,
      WaterSurfaceFieldDiagnosticCode.InvalidFallback,
      `${path}.fallback`,
      "Multiple ordered providers require use-next-provider."
    );
  }
  if (!consumerId || !semantic || !activation || !requirement || !fallback || !unit || providers.length === 0) {
    return undefined;
  }
  return Object.freeze({
    consumerId,
    semantic,
    providers: Object.freeze(providers),
    activation,
    requirement,
    fallback,
    unit
  });
}

export function validateWaterSurfaceFieldDependencyAsset(value: unknown): WaterSurfaceFieldValidationResult {
  const diagnostics: WaterSurfaceFieldDiagnostic[] = [];
  if (!isRecord(value)) {
    addError(
      diagnostics,
      WaterSurfaceFieldDiagnosticCode.InvalidRootType,
      "$",
      "Expected a field dependency asset object."
    );
    return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
  }
  if (value.schemaVersion !== WaterSurfaceFieldSchemaVersion.V2) {
    addError(
      diagnostics,
      WaterSurfaceFieldDiagnosticCode.UnsupportedSchemaVersion,
      "$.schemaVersion",
      `Expected schemaVersion ${WaterSurfaceFieldSchemaVersion.V2}.`
    );
  }
  const id = readStableId(value.id, "$.id", diagnostics);
  const bindings: WaterSurfaceFieldDependencyV2[] = [];
  if (!Array.isArray(value.bindings) || value.bindings.length === 0 || value.bindings.length > MAX_BINDING_COUNT) {
    addError(
      diagnostics,
      WaterSurfaceFieldDiagnosticCode.InvalidType,
      "$.bindings",
      `Expected between 1 and ${MAX_BINDING_COUNT} field bindings.`
    );
  } else {
    value.bindings.forEach((binding, index) => {
      const decoded = decodeBinding(binding, index, diagnostics);
      if (decoded) bindings.push(decoded);
    });
  }
  const consumers = new Set<string>();
  bindings.forEach((binding, index) => {
    if (consumers.has(binding.consumerId)) {
      addError(
        diagnostics,
        WaterSurfaceFieldDiagnosticCode.DuplicateConsumer,
        `$.bindings[${index}].consumerId`,
        `Consumer '${binding.consumerId}' is duplicated.`
      );
    }
    consumers.add(binding.consumerId);
  });
  for (const [index, binding] of bindings.entries()) {
    if (!binding.providers.includes(WaterFieldProviderKind.Derived)) continue;
    const cycle = findWaterFieldDependencyCycle(binding.semantic, WATER_FIELD_DERIVED_INPUTS);
    if (cycle) {
      addError(
        diagnostics,
        WaterSurfaceFieldDiagnosticCode.DerivedDependencyCycle,
        `$.bindings[${index}]`,
        `Derived dependency cycle: ${cycle.join(" -> ")}.`
      );
    }
    const inputs = WATER_FIELD_DERIVED_INPUTS[binding.semantic] ?? [];
    // A concrete alternative may legitimately satisfy the field without any derived input.
    if (
      binding.providers.length === 1 &&
      !inputs.some((input) => bindings.some((candidate) => candidate.semantic === input))
    ) {
      addError(
        diagnostics,
        WaterSurfaceFieldDiagnosticCode.MissingDerivedInput,
        `$.bindings[${index}]`,
        `Derived ${binding.semantic} requires one of: ${inputs.join(", ")}.`
      );
    }
  }
  if (diagnostics.length > 0 || !id || bindings.length === 0) {
    return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
  }
  const normalized = Object.freeze({
    schemaVersion: WaterSurfaceFieldSchemaVersion.V2,
    id,
    bindings: Object.freeze([...bindings].sort((left, right) => left.consumerId.localeCompare(right.consumerId)))
  });
  return Object.freeze({ valid: true, value: normalized, diagnostics: Object.freeze(diagnostics) });
}
