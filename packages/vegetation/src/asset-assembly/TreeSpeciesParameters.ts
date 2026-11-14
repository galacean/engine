import type { TreeBillboardTuning, TreeLeafCardTuning } from "./AssetAssemblyPresetFactory";
import {
  validateProceduralTreeDistributionTuning,
  type ProceduralTreeDistributionTuning
} from "./ProceduralTreeGenerator";
import { validateTreeLeafCountTuning, type TreeLeafCountTuning } from "./ProceduralTreeLeafCount";

/** Exact distribution fields editable in the Asset Assembly tree panel. */
export const TREE_SPECIES_EXPOSED_DISTRIBUTION_KEYS = Object.freeze([
  "geometrySeed",
  "trunkCount",
  "treeHeightVariationPercent",
  "trunkClearHeightPercentOfHeight",
  "trunkRadiusPercentOfHeight",
  "trunkRadiusVariationPercent",
  "trunkCurveVariationDegrees",
  "trunkSplitAngleDegrees",
  "trunkSplitAngleVariationDegrees",
  "trunkRotateDegrees",
  "trunkRotateVariationDegrees",
  "branchCount",
  "branchLengthPercentOfParent",
  "branchMaximumLengthPercentOfHeight",
  "branchLengthVariationPercent",
  "branchCurveVariationDegrees",
  "branchAttractionUp",
  "branchRotateDegrees",
  "branchRotateVariationDegrees",
  "branchDownAngleDegrees",
  "branchDownAngleVariationDegrees",
  "twigCount",
  "twigLengthPercentOfParent",
  "twigMaximumLengthPercentOfHeight",
  "twigLengthVariationPercent",
  "twigCurveVariationDegrees",
  "twigAttractionUp",
  "twigAttachmentEndPercentOfParent",
  "twigRotateDegrees",
  "twigRotateVariationDegrees",
  "twigDownAngleDegrees",
  "twigDownAngleVariationDegrees",
  "leafDistribution",
  "leafDownAngleDegrees",
  "leafDownAngleVariationDegrees",
  "leafRotateDegrees",
  "leafRotateVariationDegrees",
  "leafSpacingPercent",
  "leafScaleVariationPercent",
  "leafNormalCrownBlendPercent"
] as const satisfies readonly (keyof ProceduralTreeDistributionTuning)[]);

/** Runtime-editable tree geometry inputs. No catalog, material, or LOD data belongs here. */
export interface TreeSpeciesParameters {
  readonly size: number;
  readonly distributionTuning: ProceduralTreeDistributionTuning;
  readonly leafCountTuning: TreeLeafCountTuning;
  readonly leafCardTuning: TreeLeafCardTuning;
  readonly billboardTuning: TreeBillboardTuning;
  readonly expectedBranchCounts: readonly [trunks: number, branches: number, twigs: number];
}

interface TreeSpeciesParameterDefinition extends TreeSpeciesParameters {
  readonly key: string;
}

const definitions: readonly TreeSpeciesParameterDefinition[] = Object.freeze([
  defineParameters({
    key: "dead-tree",
    size: 12.64336245,
    distributionTuning: exposedDistribution({
      geometrySeed: 3790738686,
      trunkCount: 1,
      treeHeightVariationPercent: 0,
      trunkClearHeightPercentOfHeight: 41,
      trunkRadiusPercentOfHeight: 1.8,
      trunkRadiusVariationPercent: 0,
      trunkCurveVariationDegrees: 0,
      trunkSplitAngleDegrees: 12,
      trunkSplitAngleVariationDegrees: 2,
      trunkRotateDegrees: 137.5,
      trunkRotateVariationDegrees: 0,
      branchCount: 6,
      branchLengthPercentOfParent: 35.5,
      branchMaximumLengthPercentOfHeight: 52,
      branchLengthVariationPercent: 0,
      branchCurveVariationDegrees: 10,
      branchAttractionUp: 0,
      branchRotateDegrees: -40,
      branchRotateVariationDegrees: 52,
      branchDownAngleDegrees: 33,
      branchDownAngleVariationDegrees: 11,
      twigCount: 21,
      twigLengthPercentOfParent: 51.5,
      twigMaximumLengthPercentOfHeight: 25.5,
      twigLengthVariationPercent: 34,
      twigCurveVariationDegrees: 25,
      twigAttractionUp: 0,
      twigAttachmentEndPercentOfParent: 80,
      twigRotateDegrees: -170.5,
      twigRotateVariationDegrees: 48,
      twigDownAngleDegrees: 53,
      twigDownAngleVariationDegrees: 13,
      leafDistribution: 6,
      leafDownAngleDegrees: 45,
      leafDownAngleVariationDegrees: 10,
      leafRotateDegrees: 137.5,
      leafRotateVariationDegrees: 4,
      leafSpacingPercent: 0,
      leafScaleVariationPercent: 0,
      leafNormalCrownBlendPercent: 100
    }),
    leafCountTuning: { lod0Count: 0, lod1Count: 0, lod2Count: 0, lod3Count: 0 },
    leafCardTuning: { lengthPercent: 100, widthPercent: 100 },
    billboardTuning: { billboardSize: 0, billboardsScale: 1, inflate: 0 },
    expectedBranchCounts: [1, 6, 21]
  })
]);

export const TREE_SPECIES_PARAMETER_KEYS = Object.freeze(definitions.map((definition) => definition.key));

export const TREE_SPECIES_PARAMETERS: Readonly<Record<string, TreeSpeciesParameters>> = Object.freeze(
  definitions.reduce<Record<string, TreeSpeciesParameters>>((parametersByKey, definition) => {
    const parameters = Object.freeze({
      size: definition.size,
      distributionTuning: definition.distributionTuning,
      leafCountTuning: definition.leafCountTuning,
      leafCardTuning: definition.leafCardTuning,
      billboardTuning: definition.billboardTuning,
      expectedBranchCounts: definition.expectedBranchCounts
    });
    validateParameters(definition.key, parameters);
    parametersByKey[definition.key] = parameters;
    return parametersByKey;
  }, {})
);

function exposedDistribution(tuning: ProceduralTreeDistributionTuning): ProceduralTreeDistributionTuning {
  const keys = Object.keys(tuning).sort();
  const exposed = [...TREE_SPECIES_EXPOSED_DISTRIBUTION_KEYS].sort();
  if (keys.length !== exposed.length || keys.some((key, index) => key !== exposed[index])) {
    throw new Error("Tree species tree reconstruction must contain exactly the Asset Assembly exposed parameters");
  }
  validateProceduralTreeDistributionTuning(tuning);
  return Object.freeze({ ...tuning });
}

function defineParameters(definition: TreeSpeciesParameterDefinition): TreeSpeciesParameterDefinition {
  exposedDistribution(definition.distributionTuning);
  validateTreeLeafCountTuning(definition.leafCountTuning);
  return Object.freeze(definition);
}

function validateParameters(key: string, parameters: TreeSpeciesParameters): void {
  exposedDistribution(parameters.distributionTuning);
  validateTreeLeafCountTuning(parameters.leafCountTuning);
  if (parameters.expectedBranchCounts[0] !== parameters.distributionTuning.trunkCount) {
    throw new Error(`${key} trunk count does not match its exposed parameter set`);
  }
  if (
    parameters.expectedBranchCounts[1] !== parameters.distributionTuning.branchCount ||
    parameters.expectedBranchCounts[2] !== parameters.distributionTuning.twigCount
  ) {
    throw new Error(`${key} branch counts do not match its exposed parameter set`);
  }
}
