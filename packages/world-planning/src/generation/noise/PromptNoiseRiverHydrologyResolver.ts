/** Single pure-data authority for Prompt Noise River geometry and hydrology. */
import {
  RiverDirectionMode,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPathMode,
  RiverQualityLevel,
  RIVER_QUALITY_PRESET
} from "@galacean/engine-water/water/index";

import type { RiverNetworkDescriptor, RiverPathControlPoint } from "@galacean/engine-water/water/index";

import {
  PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1,
  PROMPT_NOISE_MOUNTAIN_RIVER_HIGH_PROFILE_V1,
  hashRiverWaterProfile,
  requireRiverWaterProfile,
  type RiverWaterProfileV1
} from "@galacean/engine-water/water/presets/river/index";
import {
  RIVER_COMPILER_SEMANTIC_VERSION,
  RIVER_MAX_WATER_SURFACE_SLOPE,
  hashRiverStableValue
} from "@galacean/engine-water/water/compiler/index";

import type { WaterSemanticFieldBodyV1 } from "@galacean/engine-water/water/runtime/index";
import {
  combinePromptNoiseRiverFields,
  PromptNoiseRiverFieldCompiler,
  type PromptNoiseRiverFieldV1
} from "./PromptNoiseRiverFieldCompiler.ts";
import {
  operatorBounds,
  resolvePromptNoiseRiverProfilePoints,
  type PromptNoiseOperatorTemplateId,
  type PromptNoiseRiverControlPointV1,
  type PromptNoiseRiverCurveMode,
  type PromptNoiseRiverOperatorV1,
  type PromptNoiseTerrainOperatorV1,
  type PromptNoiseTerrainProgram,
  type PromptNoiseTemplateRegistryVersion
} from "./PromptNoiseTerrainProgram.ts";

export const PROMPT_NOISE_HYDROLOGY_SEMANTIC_VERSION = "prompt-noise-hydrology-v1" as const;
export const PROMPT_NOISE_RIVER_DESCRIPTOR_SCHEMA_VERSION = 2 as const;
const BODY_ORIGIN_QUANTIZATION_METRES = 256;

const FORMAL_PROFILE_BY_TEMPLATE: Readonly<Partial<Record<PromptNoiseOperatorTemplateId, string>>> = Object.freeze({
  "river-shallow": PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1.id,
  "river-wide": PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1.id,
  "river-canyon": PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1.id
});
const MOUNTAIN_PROFILE_BY_TEMPLATE: Readonly<Partial<Record<PromptNoiseOperatorTemplateId, string>>> = Object.freeze({
  "river-shallow": PROMPT_NOISE_MOUNTAIN_RIVER_HIGH_PROFILE_V1.id,
  "river-wide": PROMPT_NOISE_MOUNTAIN_RIVER_HIGH_PROFILE_V1.id,
  "river-canyon": PROMPT_NOISE_MOUNTAIN_RIVER_HIGH_PROFILE_V1.id
});

export interface ResolvedPromptNoiseRiverGenerationV1 {
  readonly operatorId: number;
  readonly operatorIds: readonly number[];
  readonly networkId: number;
  readonly reachCount: number;
  readonly junctionCount: number;
  readonly bodyId: string;
  readonly assetId: string;
  readonly instanceId: string;
  readonly bodyOrigin: readonly [x: number, z: number];
  readonly logicalBounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
  readonly descriptor: RiverNetworkDescriptor;
  readonly semanticBody: WaterSemanticFieldBodyV1;
  readonly profile: RiverWaterProfileV1;
  readonly canonicalSourceHash: string;
  readonly fieldGenerationHash?: string;
}

export interface ResolvedPromptNoiseRiverSetV1 {
  readonly sourceHash: string;
  readonly rivers: readonly ResolvedPromptNoiseRiverGenerationV1[];
}

export function resolvePromptNoiseRiverSet(program: PromptNoiseTerrainProgram): ResolvedPromptNoiseRiverSetV1 {
  const operators = program.recipe.operators.filter(isEnabledRiver);
  const groups = new Map<number, PromptNoiseRiverOperatorV1[]>();
  for (const operator of operators) {
    const networkId = operator.topology?.networkId ?? operator.id;
    const members = groups.get(networkId) ?? [];
    members.push(operator);
    groups.set(networkId, members);
  }
  const rivers = [...groups.entries()].map(([networkId, members]) =>
    members.length === 1
      ? resolvePromptNoiseRiverGeneration(
          members[0],
          profileForTemplate(members[0].templateId, program.recipe.templateRegistryVersion)
        )
      : resolvePromptNoiseRiverNetworkGeneration(
          networkId,
          members,
          members.map((operator) => profileForTemplate(operator.templateId, program.recipe.templateRegistryVersion))
        )
  );
  return deepFreeze({
    sourceHash: hashRiverStableValue({
      recipe: program.recipe,
      profiles: rivers.map(({ profile }) => profile),
      hydrologySemanticVersion: PROMPT_NOISE_HYDROLOGY_SEMANTIC_VERSION,
      compilerSemanticVersion: RIVER_COMPILER_SEMANTIC_VERSION
    }),
    rivers
  });
}

export function resolvePromptNoiseRiverGeneration(
  river: PromptNoiseRiverOperatorV1,
  profile: RiverWaterProfileV1 = profileForTemplate(river.templateId, 3)
): ResolvedPromptNoiseRiverGenerationV1 {
  const riverField = river.controlPoints ? PromptNoiseRiverFieldCompiler.compile(river) : undefined;
  const sections = resolvePromptNoiseRiverProfilePoints(river);
  validateResolvedSections(sections, profile);
  const sourceSection = sections[0];
  const mouthSection = sections[sections.length - 1];
  const maximumHalfWidth = Math.max(...sections.map(({ width }) => width * 0.5));
  const maximumShoreWidth = Math.max(...sections.map(({ bankFeather }) => bankFeather));
  const startSurface = riverField
    ? river.controlPoints![0].bedHeight + river.controlPoints![0].depth
    : river.startHeight + sourceSection.depth;
  const lastControlPoint = river.controlPoints?.at(-1);
  const endSurface = lastControlPoint
    ? lastControlPoint.bedHeight + lastControlPoint.depth
    : river.endHeight + mouthSection.depth;
  const elevationDrop = startSurface - endSurface;
  const maximumSlope = Math.min(profile.maximumSurfaceSlope, RIVER_MAX_WATER_SURFACE_SLOPE);
  if (elevationDrop < -1e-5) {
    throw new RangeError(`Prompt Noise River ${river.id} rises downstream by ${(-elevationDrop).toFixed(3)}m.`);
  }
  const resolvedLength = riverField
    ? riverField.segments.reduce(
        (sum, segment) => sum + Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z),
        0
      )
    : river.length;
  const slope = elevationDrop / Math.max(resolvedLength, 1e-5);
  if (slope > maximumSlope + 1e-6) {
    throw new RangeError(
      `Prompt Noise River ${river.id} slope ${slope.toFixed(4)} exceeds the resolved profile limit ${maximumSlope}.`
    );
  }
  if (riverField) validateRiverFieldSurfaceProfile(riverField, maximumSlope);
  else validateIntermediateSurfaceProfile(river, sections, maximumSlope);

  const curve = logicalQuadraticCurve(river, startSurface, endSurface);
  const bodyOrigin = stableBodyOrigin(river);
  const sourcePosition = river.controlPoints?.[0].position ?? curve[0];
  const mouthPosition = river.controlPoints?.[river.controlPoints.length - 1].position ?? curve[2];
  const descriptorCurvePoints: RiverPathControlPoint[] = riverField
    ? createC2BDescriptorCurvePoints(river, bodyOrigin)
    : createV2DescriptorCurvePoints(river, curve, sections, bodyOrigin);
  const descriptorSchemaVersion = RiverNetworkSchemaVersion.V2;
  const profileHash = hashRiverWaterProfile(profile);
  const canonicalSourceHash = hashRiverStableValue({
    operator: river,
    fieldGenerationHash: riverField?.generationHash,
    profile,
    descriptorSchemaVersion,
    hydrologySemanticVersion: PROMPT_NOISE_HYDROLOGY_SEMANTIC_VERSION,
    compilerSemanticVersion: RIVER_COMPILER_SEMANTIC_VERSION
  });
  const bodyId = `prompt-noise-river-${river.id}`;
  const assetId = `${bodyId}-asset`;
  const sourceId = `${bodyId}-source`;
  const mouthId = `${bodyId}-mouth`;
  const qualityPreset = RIVER_QUALITY_PRESET[profile.quality];
  const descriptorBase = {
    id: bodyId,
    surfaceAuthority: "external-resolved" as const,
    derivation: {
      profileId: profile.id,
      profileVersion: profile.version,
      profileHash,
      descriptorSchemaVersion,
      hydrologySemanticVersion: PROMPT_NOISE_HYDROLOGY_SEMANTIC_VERSION,
      compilerSemanticVersion: RIVER_COMPILER_SEMANTIC_VERSION,
      canonicalSourceHash,
      bodyOrigin
    },
    nodes: [
      {
        id: sourceId,
        kind: RiverNodeKind.Source,
        position: [sourcePosition.x - bodyOrigin[0], startSurface, sourcePosition.z - bodyOrigin[1]] as [
          number,
          number,
          number
        ],
        elevation: startSurface
      },
      {
        id: mouthId,
        kind: RiverNodeKind.Mouth,
        position: [mouthPosition.x - bodyOrigin[0], endSurface, mouthPosition.z - bodyOrigin[1]] as [
          number,
          number,
          number
        ],
        elevation: endSurface
      }
    ],
    segments: [
      {
        id: bodyId,
        from: sourceId,
        to: mouthId,
        order: river.id,
        curve: {
          mode: river.curveMode ? descriptorPathMode(river.curveMode) : RiverPathMode.Bezier,
          segmentLength: qualityPreset.segmentLength,
          points: descriptorCurvePoints
        }
      }
    ],
    defaults: {
      shape: {
        width: sections[Math.floor(sections.length * 0.5)].width,
        depth: sections[Math.floor(sections.length * 0.5)].depth,
        bankFeather: sections[Math.floor(sections.length * 0.5)].bankFeather
      },
      flow: {
        speed: sections[Math.floor(sections.length * 0.5)].flowSpeed,
        directionMode: RiverDirectionMode.PathOrder
      },
      material: profile.descriptorV2.material,
      quality: {
        geometry: {
          level: profile.quality,
          maxChordError: qualityPreset.maxChordError
        },
        material: { level: profile.quality },
        maps: { level: profile.quality },
        query: { level: profile.quality }
      }
    }
  };
  const descriptor: RiverNetworkDescriptor = {
    ...descriptorBase,
    schemaVersion: RiverNetworkSchemaVersion.V2,
    defaults: {
      ...descriptorBase.defaults,
      surfaceMotion: profile.descriptorV2.surfaceMotion
    }
  };
  const baseBounds = riverField?.bounds ?? operatorBounds(river);
  const logicalBounds = Object.freeze({
    minX: baseBounds.minX,
    minZ: baseBounds.minZ,
    maxX: baseBounds.maxX,
    maxZ: baseBounds.maxZ
  });
  const semanticBody: WaterSemanticFieldBodyV1 = {
    id: bodyId,
    bounds: logicalBounds,
    halfWidth: maximumHalfWidth,
    shoreWidth: maximumShoreWidth,
    flowSpeed: sections[Math.floor(sections.length * 0.5)].flowSpeed,
    curve: [
      {
        x: curve[0].x,
        z: curve[0].z,
        surfaceHeight: startSurface,
        bedHeight: river.startHeight
      },
      {
        x: curve[1].x,
        z: curve[1].z,
        surfaceHeight: (startSurface + endSurface) * 0.5,
        bedHeight: (river.startHeight + river.endHeight) * 0.5
      },
      {
        x: curve[2].x,
        z: curve[2].z,
        surfaceHeight: endSurface,
        bedHeight: river.endHeight
      }
    ],
    profile: riverField
      ? river.controlPoints!.map((point, index, points) => ({
          factor: index / Math.max(1, points.length - 1),
          x: point.position.x,
          z: point.position.z,
          surfaceHeight: point.bedHeight + point.depth,
          bedHeight: point.bedHeight,
          halfWidth: point.width * 0.5,
          shoreWidth: point.bankFeather,
          flowSpeed: point.flowSpeed
        }))
      : createSemanticProfile(river, curve, sections),
    localField: riverField ? createSemanticLocalField(riverField) : undefined
  };
  return deepFreeze({
    operatorId: river.id,
    operatorIds: [river.id],
    networkId: river.topology?.networkId ?? river.id,
    reachCount: 1,
    junctionCount: 0,
    bodyId,
    assetId,
    instanceId: bodyId,
    bodyOrigin,
    logicalBounds,
    descriptor,
    semanticBody,
    profile,
    canonicalSourceHash,
    fieldGenerationHash: riverField?.generationHash
  });
}

/** Resolves one explicit connected Prompt Network into one Water Body and one Semantic authority. */
export function resolvePromptNoiseRiverNetworkGeneration(
  networkId: number,
  rivers: readonly PromptNoiseRiverOperatorV1[],
  profiles: readonly RiverWaterProfileV1[]
): ResolvedPromptNoiseRiverGenerationV1 {
  if (rivers.length < 2 || rivers.length !== profiles.length || rivers.some((river) => !river.topology)) {
    throw new RangeError(`Prompt Noise River Network ${networkId} is incomplete`);
  }
  const ordered = rivers
    .map((river, index) => ({ river, profile: profiles[index] }))
    .sort((left, right) => left.river.id - right.river.id);
  const profile = ordered[0].profile;
  const profileHash = hashRiverWaterProfile(profile);
  if (ordered.some((entry) => hashRiverWaterProfile(entry.profile) !== profileHash)) {
    throw new RangeError(`Prompt Noise River Network ${networkId} mixes incompatible Water profiles`);
  }
  const singles = ordered.map(({ river, profile: reachProfile }) =>
    resolvePromptNoiseRiverGeneration(river, reachProfile)
  );
  if (singles.some(({ descriptor }) => descriptor.schemaVersion !== RiverNetworkSchemaVersion.V2)) {
    throw new RangeError(`Prompt Noise River Network ${networkId} requires Descriptor V2`);
  }
  const bodyOrigin = stableBodyOrigin(ordered[0].river);
  const fields = ordered.map(({ river }) => PromptNoiseRiverFieldCompiler.compile(river));
  const networkField = combinePromptNoiseRiverFields(networkId, fields);
  const nodeFacts = resolveNetworkNodeFacts(
    networkId,
    ordered.map(({ river }) => river)
  );
  const junctionCount = nodeFacts.filter(({ kind }) => kind === RiverNodeKind.Confluence).length;
  if (junctionCount === 0) {
    throw new RangeError(`Prompt Noise River Network ${networkId} has no explicit confluence`);
  }
  const bodyId = `prompt-noise-river-network-${networkId}`;
  const assetId = `${bodyId}-asset`;
  const canonicalSourceHash = hashRiverStableValue({
    networkId,
    reaches: ordered.map(({ river }, index) => ({
      operator: river,
      fieldGenerationHash: fields[index].generationHash
    })),
    networkFieldGenerationHash: networkField.generationHash,
    profile,
    hydrologySemanticVersion: `${PROMPT_NOISE_HYDROLOGY_SEMANTIC_VERSION}-network-v1`,
    compilerSemanticVersion: RIVER_COMPILER_SEMANTIC_VERSION
  });
  const baseDefaults = singles[0].descriptor.defaults;
  const descriptor: RiverNetworkDescriptor = {
    schemaVersion: RiverNetworkSchemaVersion.V2,
    id: bodyId,
    surfaceAuthority: "external-resolved",
    derivation: {
      profileId: profile.id,
      profileVersion: profile.version,
      profileHash,
      descriptorSchemaVersion: RiverNetworkSchemaVersion.V2,
      hydrologySemanticVersion: `${PROMPT_NOISE_HYDROLOGY_SEMANTIC_VERSION}-network-v1`,
      compilerSemanticVersion: RIVER_COMPILER_SEMANTIC_VERSION,
      canonicalSourceHash,
      bodyOrigin
    },
    nodes: nodeFacts.map((node) => ({
      id: networkNodeId(networkId, node.id),
      kind: node.kind,
      position: [node.x - bodyOrigin[0], node.surfaceHeight, node.z - bodyOrigin[1]],
      elevation: node.surfaceHeight,
      ...(node.kind === RiverNodeKind.Confluence ? { mergeRadius: node.mergeRadius } : {})
    })),
    segments: ordered.map(({ river }, index) => {
      const sourceSegment = singles[index].descriptor.segments[0];
      const origin = singles[index].bodyOrigin;
      return {
        ...sourceSegment,
        id: `prompt-noise-river-reach-${river.id}`,
        from: networkNodeId(networkId, river.topology!.fromNodeId),
        to: networkNodeId(networkId, river.topology!.toNodeId),
        order: river.id,
        curve: {
          ...sourceSegment.curve,
          points: sourceSegment.curve.points.map((point) => ({
            ...point,
            position: [
              point.position[0] + origin[0] - bodyOrigin[0],
              point.position[1],
              point.position[2] + origin[1] - bodyOrigin[1]
            ]
          }))
        }
      };
    }),
    defaults: {
      ...baseDefaults,
      quality: {
        ...baseDefaults.quality,
        // C2 excludes LocalMap hydrodynamics. Junction geometry remains compiled, but atlas allocation stays zero.
        maps: { level: RiverQualityLevel.High }
      },
      surfaceMotion: profile.descriptorV2.surfaceMotion
    },
    disturbances: []
  };
  const source = nodeFacts.find(({ kind }) => kind === RiverNodeKind.Source)!;
  const junction = nodeFacts.find(({ kind }) => kind === RiverNodeKind.Confluence)!;
  const mouth = nodeFacts.find(({ kind }) => kind === RiverNodeKind.Mouth)!;
  const maximumHalfWidth = Math.max(
    ...ordered.flatMap(({ river }) => river.controlPoints!.map((point) => point.width * 0.5)),
    ...nodeFacts.map((node) => node.mergeRadius)
  );
  const maximumShoreWidth = Math.max(
    ...ordered.flatMap(({ river }) => river.controlPoints!.map((point) => point.bankFeather))
  );
  const semanticBody: WaterSemanticFieldBodyV1 = {
    id: bodyId,
    bounds: networkField.bounds,
    halfWidth: maximumHalfWidth,
    shoreWidth: maximumShoreWidth,
    flowSpeed: ordered.reduce((sum, { river }) => sum + river.controlPoints![0].flowSpeed, 0) / ordered.length,
    curve: [semanticNode(source), semanticNode(junction), semanticNode(mouth)],
    localField: createSemanticLocalField(networkField)
  };
  return deepFreeze({
    operatorId: ordered[0].river.id,
    operatorIds: ordered.map(({ river }) => river.id),
    networkId,
    reachCount: ordered.length,
    junctionCount,
    bodyId,
    assetId,
    instanceId: bodyId,
    bodyOrigin,
    logicalBounds: networkField.bounds,
    descriptor,
    semanticBody,
    profile,
    canonicalSourceHash,
    fieldGenerationHash: networkField.generationHash
  });
}

interface PromptNoiseResolvedNetworkNodeV1 {
  readonly id: number;
  readonly kind: RiverNodeKind;
  readonly x: number;
  readonly z: number;
  readonly surfaceHeight: number;
  readonly bedHeight: number;
  readonly mergeRadius: number;
}

function resolveNetworkNodeFacts(
  networkId: number,
  rivers: readonly PromptNoiseRiverOperatorV1[]
): readonly PromptNoiseResolvedNetworkNodeV1[] {
  const facts = new Map<
    number,
    {
      x: number;
      z: number;
      surfaceHeight: number;
      bedHeight: number;
      mergeRadius: number;
      incoming: number;
      outgoing: number;
    }
  >();
  const register = (
    nodeId: number,
    point: PromptNoiseRiverControlPointV1,
    mergeRadius: number,
    incoming: number,
    outgoing: number
  ): void => {
    const surfaceHeight = point.bedHeight + point.depth;
    const previous = facts.get(nodeId);
    if (
      previous &&
      (Math.hypot(previous.x - point.position.x, previous.z - point.position.z) > 1e-4 ||
        Math.abs(previous.surfaceHeight - surfaceHeight) > 1e-4 ||
        Math.abs(previous.mergeRadius - mergeRadius) > 1e-4)
    ) {
      throw new RangeError(`Prompt Noise River Network ${networkId} node ${nodeId} endpoints are discontinuous`);
    }
    facts.set(nodeId, {
      x: previous?.x ?? point.position.x,
      z: previous?.z ?? point.position.z,
      surfaceHeight: previous?.surfaceHeight ?? surfaceHeight,
      bedHeight: previous?.bedHeight ?? point.bedHeight,
      mergeRadius,
      incoming: (previous?.incoming ?? 0) + incoming,
      outgoing: (previous?.outgoing ?? 0) + outgoing
    });
  };
  for (const river of rivers) {
    if (river.topology!.networkId !== networkId) {
      throw new RangeError(`Prompt Noise River Reach ${river.id} belongs to another Network`);
    }
    register(river.topology!.fromNodeId, river.controlPoints![0], river.topology!.fromMergeRadius, 0, 1);
    register(river.topology!.toNodeId, river.controlPoints!.at(-1)!, river.topology!.toMergeRadius, 1, 0);
  }
  return Object.freeze(
    [...facts.entries()].map(([id, fact]) => {
      const kind =
        fact.incoming === 0 && fact.outgoing >= 1
          ? RiverNodeKind.Source
          : fact.incoming >= 1 && fact.outgoing === 0
            ? RiverNodeKind.Mouth
            : fact.incoming >= 2 && fact.outgoing >= 1
              ? RiverNodeKind.Confluence
              : null;
      if (!kind) {
        throw new RangeError(
          `Prompt Noise River Network ${networkId} node ${id} has unsupported degree ${fact.incoming}:${fact.outgoing}`
        );
      }
      if (kind === RiverNodeKind.Confluence && fact.mergeRadius <= 0) {
        throw new RangeError(`Prompt Noise River Network ${networkId} junction ${id} has no merge radius`);
      }
      return Object.freeze({ id, kind, ...fact });
    })
  );
}

function networkNodeId(networkId: number, nodeId: number): string {
  return `prompt-noise-river-network-${networkId}-node-${nodeId}`;
}

function semanticNode(node: PromptNoiseResolvedNetworkNodeV1) {
  return {
    x: node.x,
    z: node.z,
    surfaceHeight: node.surfaceHeight,
    bedHeight: node.bedHeight
  };
}

export function profileForTemplate(
  templateId: PromptNoiseOperatorTemplateId,
  registryVersion: PromptNoiseTemplateRegistryVersion = 3
): RiverWaterProfileV1 {
  const profiles = registryVersion <= 2 ? FORMAL_PROFILE_BY_TEMPLATE : MOUNTAIN_PROFILE_BY_TEMPLATE;
  const profileId = profiles[templateId];
  if (!profileId) throw new Error(`Prompt Noise template '${templateId}' does not map to a River water profile.`);
  return requireRiverWaterProfile(profileId);
}

function stableBodyOrigin(river: PromptNoiseRiverOperatorV1): readonly [number, number] {
  return Object.freeze([
    Math.floor(river.anchor.x / BODY_ORIGIN_QUANTIZATION_METRES) * BODY_ORIGIN_QUANTIZATION_METRES,
    Math.floor(river.anchor.z / BODY_ORIGIN_QUANTIZATION_METRES) * BODY_ORIGIN_QUANTIZATION_METRES
  ] as const);
}

function logicalQuadraticCurve(
  river: PromptNoiseRiverOperatorV1,
  startSurface: number,
  endSurface: number
): readonly [
  { readonly x: number; readonly y: number; readonly z: number },
  { readonly x: number; readonly y: number; readonly z: number },
  { readonly x: number; readonly y: number; readonly z: number }
] {
  const halfLength = river.length * 0.5;
  const rightX = -river.forward.z;
  const rightZ = river.forward.x;
  return Object.freeze([
    Object.freeze({
      x: river.anchor.x - river.forward.x * halfLength,
      y: startSurface,
      z: river.anchor.z - river.forward.z * halfLength
    }),
    Object.freeze({
      x: river.anchor.x + rightX * river.bend,
      y: (startSurface + endSurface) * 0.5,
      z: river.anchor.z + rightZ * river.bend
    }),
    Object.freeze({
      x: river.anchor.x + river.forward.x * halfLength,
      y: endSurface,
      z: river.anchor.z + river.forward.z * halfLength
    })
  ]);
}

function validateResolvedSections(
  sections: readonly ReturnType<typeof resolvePromptNoiseRiverProfilePoints>[number][],
  profile: RiverWaterProfileV1
): void {
  if (sections.length < 2 || sections[0].factor !== 0 || sections[sections.length - 1].factor !== 1) {
    throw new RangeError("Prompt Noise River profile must contain source and mouth endpoints.");
  }
  for (let index = 0; index < sections.length; index++) {
    const point = sections[index];
    if (
      !Number.isFinite(point.factor) ||
      point.factor < 0 ||
      point.factor > 1 ||
      (index > 0 && point.factor <= sections[index - 1].factor) ||
      !Number.isFinite(point.width) ||
      point.width <= 0 ||
      point.width > 50 ||
      !Number.isFinite(point.depth) ||
      point.depth < profile.depth.minimum ||
      point.depth > profile.depth.maximum ||
      !Number.isFinite(point.flowSpeed) ||
      point.flowSpeed < 0 ||
      point.flowSpeed > 10 ||
      !Number.isFinite(point.bankFeather) ||
      point.bankFeather < 0 ||
      point.bankFeather > profile.maximumBankFeather
    ) {
      throw new RangeError(`Prompt Noise River profile point ${index} is outside Water's supported range.`);
    }
  }
}

function validateIntermediateSurfaceProfile(
  river: PromptNoiseRiverOperatorV1,
  sections: readonly ReturnType<typeof resolvePromptNoiseRiverProfilePoints>[number][],
  maximumSlope: number
): void {
  let previousSurface = river.startHeight + sections[0].depth;
  for (let index = 1; index < sections.length; index++) {
    const previous = sections[index - 1];
    const current = sections[index];
    const bedHeight = river.startHeight + (river.endHeight - river.startHeight) * current.factor;
    const surfaceHeight = bedHeight + current.depth;
    const drop = previousSurface - surfaceHeight;
    if (drop < -1e-5) {
      throw new RangeError(`Prompt Noise River ${river.id} profile rises downstream at point ${index}.`);
    }
    const distance = Math.max(1e-5, river.length * (current.factor - previous.factor));
    if (drop / distance > maximumSlope + 1e-6) {
      throw new RangeError(
        `Prompt Noise River ${river.id} profile slope exceeds the resolved limit at point ${index}.`
      );
    }
    previousSurface = surfaceHeight;
  }
}

function validateRiverFieldSurfaceProfile(field: PromptNoiseRiverFieldV1, maximumSlope: number): void {
  for (let index = 0; index < field.segments.length; index++) {
    const segment = field.segments[index];
    const startSurface = segment.startBedHeight + segment.startDepth;
    const endSurface = segment.endBedHeight + segment.endDepth;
    const drop = startSurface - endSurface;
    if (drop < -1e-4) {
      throw new RangeError(
        `Prompt Noise River ${field.operatorId} profile rises downstream at field segment ${index}.`
      );
    }
    const distance = Math.max(1e-5, Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z));
    if (drop / distance > maximumSlope + 1e-5) {
      throw new RangeError(
        `Prompt Noise River ${field.operatorId} profile slope exceeds the resolved limit at field segment ${index}.`
      );
    }
  }
}

function createC2BDescriptorCurvePoints(
  river: PromptNoiseRiverOperatorV1,
  bodyOrigin: readonly [number, number]
): RiverPathControlPoint[] {
  const points = river.controlPoints!;
  return points.map((point, index) => {
    const previous = points[index - 1];
    const next = points[index + 1];
    const surfaceHeight = point.bedHeight + point.depth;
    const incomingSurface = previous ? previous.bedHeight + previous.depth : surfaceHeight;
    const outgoingSurface = next ? next.bedHeight + next.depth : surfaceHeight;
    return {
      id: `prompt-noise-river-${river.id}-point-${point.id}`,
      position: [point.position.x - bodyOrigin[0], surfaceHeight, point.position.z - bodyOrigin[1]],
      in:
        river.curveMode === "bezier" && previous
          ? [
              point.inHandle.x - point.position.x,
              (incomingSurface - surfaceHeight) / 3,
              point.inHandle.z - point.position.z
            ]
          : undefined,
      out:
        river.curveMode === "bezier" && next
          ? [
              point.outHandle.x - point.position.x,
              (outgoingSurface - surfaceHeight) / 3,
              point.outHandle.z - point.position.z
            ]
          : undefined,
      width: point.width,
      depth: point.depth,
      flowSpeed: point.flowSpeed,
      bankFeather: point.bankFeather
    };
  });
}

function createSemanticLocalField(field: PromptNoiseRiverFieldV1) {
  return {
    generationHash: field.generationHash,
    originX: field.grid.originX,
    originZ: field.grid.originZ,
    cellSizeX: field.grid.cellSizeX,
    cellSizeZ: field.grid.cellSizeZ,
    gridWidth: field.grid.width,
    gridHeight: field.grid.height,
    maxSegmentsPerCell: field.grid.maxSegmentsPerCell,
    segmentIndices: field.grid.segmentIndices,
    segments: field.segments.map((segment) => ({
      startX: segment.start.x,
      startZ: segment.start.z,
      endX: segment.end.x,
      endZ: segment.end.z,
      startFactor: segment.startFactor,
      endFactor: segment.endFactor,
      startSurfaceHeight: segment.startBedHeight + segment.startDepth,
      endSurfaceHeight: segment.endBedHeight + segment.endDepth,
      startBedHeight: segment.startBedHeight,
      endBedHeight: segment.endBedHeight,
      startHalfWidth: segment.startWidth * 0.5,
      endHalfWidth: segment.endWidth * 0.5,
      startShoreWidth: segment.startBankFeather,
      endShoreWidth: segment.endBankFeather,
      startFlowSpeed: segment.startFlowSpeed,
      endFlowSpeed: segment.endFlowSpeed
    }))
  };
}

function descriptorPathMode(mode: PromptNoiseRiverCurveMode): RiverPathMode {
  if (mode === "linear") return RiverPathMode.Polyline;
  if (mode === "catmull-rom") return RiverPathMode.CatmullRom;
  return RiverPathMode.Bezier;
}

function createV2DescriptorCurvePoints(
  river: PromptNoiseRiverOperatorV1,
  curve: ReturnType<typeof logicalQuadraticCurve>,
  sections: readonly ReturnType<typeof resolvePromptNoiseRiverProfilePoints>[number][],
  bodyOrigin: readonly [number, number]
): RiverPathControlPoint[] {
  return sections.map((section, index) => {
    const worldPoint = quadraticPoint(curve, section.factor);
    const derivative = quadraticDerivative(curve, section.factor);
    const bedHeight = river.startHeight + (river.endHeight - river.startHeight) * section.factor;
    const surfaceHeight = bedHeight + section.depth;
    const previousFactor = sections[index - 1]?.factor;
    const nextFactor = sections[index + 1]?.factor;
    const incomingScale = previousFactor === undefined ? 0 : (section.factor - previousFactor) / 3;
    const outgoingScale = nextFactor === undefined ? 0 : (nextFactor - section.factor) / 3;
    return {
      id: `prompt-noise-river-${river.id}-${index === 0 ? "source" : index === sections.length - 1 ? "mouth" : `section-${index}`}`,
      position: [worldPoint.x - bodyOrigin[0], surfaceHeight, worldPoint.z - bodyOrigin[1]] as [number, number, number],
      in:
        previousFactor === undefined
          ? undefined
          : ([
              -derivative.x * incomingScale,
              -(curve[2].y - curve[0].y) * incomingScale,
              -derivative.z * incomingScale
            ] as [number, number, number]),
      out:
        nextFactor === undefined
          ? undefined
          : ([
              derivative.x * outgoingScale,
              (curve[2].y - curve[0].y) * outgoingScale,
              derivative.z * outgoingScale
            ] as [number, number, number]),
      width: section.width,
      depth: section.depth,
      flowSpeed: section.flowSpeed,
      bankFeather: section.bankFeather
    };
  });
}

function createSemanticProfile(
  river: PromptNoiseRiverOperatorV1,
  curve: ReturnType<typeof logicalQuadraticCurve>,
  sections: readonly ReturnType<typeof resolvePromptNoiseRiverProfilePoints>[number][]
) {
  return Object.freeze(
    sections.map((section) => {
      const point = quadraticPoint(curve, section.factor);
      const bedHeight = river.startHeight + (river.endHeight - river.startHeight) * section.factor;
      return Object.freeze({
        factor: section.factor,
        x: point.x,
        z: point.z,
        surfaceHeight: bedHeight + section.depth,
        bedHeight,
        halfWidth: section.width * 0.5,
        shoreWidth: section.bankFeather,
        flowSpeed: section.flowSpeed
      });
    })
  );
}

function quadraticPoint(
  curve: ReturnType<typeof logicalQuadraticCurve>,
  factor: number
): Readonly<{ x: number; z: number }> {
  const inverse = 1 - factor;
  return {
    x: inverse * inverse * curve[0].x + 2 * inverse * factor * curve[1].x + factor * factor * curve[2].x,
    z: inverse * inverse * curve[0].z + 2 * inverse * factor * curve[1].z + factor * factor * curve[2].z
  };
}

function quadraticDerivative(
  curve: ReturnType<typeof logicalQuadraticCurve>,
  factor: number
): Readonly<{ x: number; z: number }> {
  const inverse = 1 - factor;
  return {
    x: 2 * inverse * (curve[1].x - curve[0].x) + 2 * factor * (curve[2].x - curve[1].x),
    z: 2 * inverse * (curve[1].z - curve[0].z) + 2 * factor * (curve[2].z - curve[1].z)
  };
}

function isEnabledRiver(operator: PromptNoiseTerrainOperatorV1): operator is PromptNoiseRiverOperatorV1 {
  return operator.enabled && operator.kind === "river";
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  for (const child of Object.values(value as Readonly<Record<string, unknown>>)) deepFreeze(child);
  return Object.freeze(value);
}
