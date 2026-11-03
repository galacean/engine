import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  deriveLeafNodeParameters,
  deriveStemNodeParameters,
  materializeLeafNodePositions
} from "./reconstruct-procedural-tree-nodes.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(directory, "../../../../..");
const argumentsByName = parseArguments(process.argv.slice(2));
const assetId = requiredArgument("asset-id");
const label = argumentsByName.get("label") ?? assetId;
const profile = argumentsByName.get("profile") ?? "white-birch";
const sourceAnalysisPath = path.resolve(requiredArgument("source-analysis"));
requiredArgument("source-fbx");
const outputDirectory = path.resolve(requiredArgument("output"));
const triangleLimit = Number(argumentsByName.get("triangle-limit") ?? 4000);
const PREFERRED_LOD0_TRIANGLES = 3000;
const MAXIMUM_STAGE_ERROR = 0.05;
const PARENT_CURVE_KNOTS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
const COMPARISON_ORDER = Object.freeze(["trunk", "primaryBranches", "secondaryBranches", "leaves"]);
const STAGE_PARAMETER_PREFIXES = Object.freeze({
  primaryBranches: ["branch"],
  secondaryBranches: ["twig"],
  leaves: ["leaf", "crown"]
});
const PUBLIC_RECONSTRUCTION_DISTRIBUTION_KEYS = Object.freeze([
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
]);

if (!new Set(["white-birch", "small-maple"]).has(profile)) throw new Error(`Unsupported tree profile ${profile}`);
if (!Number.isInteger(triangleLimit) || triangleLimit < 100) throw new Error("Triangle limit must be an integer ≥ 100");

const sourceAnalysis = JSON.parse(await readFile(sourceAnalysisPath, "utf8"));

globalThis.window = {};
const vite = await createServer({
  root: engineRoot,
  configFile: path.join(engineRoot, "world/vite.config.mjs"),
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "silent"
});

try {
  const generator = await vite.ssrLoadModule("/packages/vegetation/src/asset-assembly/ProceduralTreeGenerator.ts");
  const source = {
    id: assetId,
    label,
    size: Number(sourceAnalysis.height),
    proceduralProfile: profile
  };
  const defaultDistribution = generator.createDefaultProceduralTreeDistributionTuning(source);
  const initialDistribution = inferDistributionTuning(sourceAnalysis, defaultDistribution);
  const maximumTrianglesPerLod = [
    triangleLimit,
    Math.min(triangleLimit, 2400),
    Math.min(triangleLimit, 1200),
    Math.min(triangleLimit, 100)
  ];
  const sourceHasLeaves = Number(sourceAnalysis.inferredRules?.leaves?.cards ?? 0) > 0;
  const fittingLeafCounts = sourceHasLeaves ? [1, 1, 1, 1] : [0, 0, 0, 0];
  const leafCounts = [
    ...deriveLeafCounts(sourceAnalysis, maximumTrianglesPerLod),
    sourceHasLeaves ? generator.PROCEDURAL_TREE_LOD_LEAF_COUNTS[3] : 0
  ];
  // Coarse search uses a bounded deterministic proxy, then the winning recipe
  // is refined against the exact final LOD0 card budget below.
  const optimizationLeafCounts = leafCounts.map((count, lodIndex) =>
    Math.min(count, [250, 160, 80, generator.PROCEDURAL_TREE_LOD_LEAF_COUNTS[3]][lodIndex])
  );
  // Leaf cards have an irreducible two-triangle cost. Spend the remaining LOD0
  // allowance on the centerline/radial combination with the lowest measured geometric
  // loss; forcing a lower soft target here can erase the curvature that is under test.
  const triangleBudget = {
    maxTrianglesPerLod: maximumTrianglesPerLod,
    preferredTrianglesPerLod: [
      Math.min(maximumTrianglesPerLod[0], PREFERRED_LOD0_TRIANGLES),
      maximumTrianglesPerLod[1],
      maximumTrianglesPerLod[2],
      maximumTrianglesPerLod[3]
    ]
  };
  const neutralFoliage = { widthScale: 1, heightScale: 1, additiveHalfExtent: 0, lodScales: [1, 1, 1, 1] };
  const trunkFit = fitTrunkParameters(
    generator,
    source,
    sourceAnalysis,
    initialDistribution,
    fittingLeafCounts,
    neutralFoliage,
    triangleBudget
  );
  const primaryBranchFit = fitPrimaryBranchParameters(
    generator,
    source,
    sourceAnalysis,
    trunkFit.distributionTuning,
    fittingLeafCounts,
    neutralFoliage,
    triangleBudget
  );
  assertOnlyStageParametersChanged(trunkFit.distributionTuning, primaryBranchFit.distributionTuning, "primaryBranches");
  const secondaryBranchFit = fitSecondaryBranchParameters(
    generator,
    source,
    sourceAnalysis,
    primaryBranchFit.distributionTuning,
    fittingLeafCounts,
    neutralFoliage,
    triangleBudget
  );
  assertOnlyStageParametersChanged(
    primaryBranchFit.distributionTuning,
    secondaryBranchFit.distributionTuning,
    "secondaryBranches"
  );
  const leafFit = fitLeafParameters(
    generator,
    source,
    sourceAnalysis,
    secondaryBranchFit.distributionTuning,
    optimizationLeafCounts,
    neutralFoliage,
    triangleBudget
  );
  const foliageProbe = generator.generateProceduralTreeGeometry(
    source,
    toLeafCountTuning(leafCounts),
    leafFit.distributionTuning,
    neutralFoliage,
    triangleBudget
  );
  const foliageTuning = inferFoliageTuning(sourceAnalysis, foliageProbe);
  const finalLeafFit = refineLeafParametersWithFinalBudget(
    generator,
    source,
    sourceAnalysis,
    leafFit.distributionTuning,
    leafCounts,
    foliageTuning,
    triangleBudget
  );
  assertOnlyStageParametersChanged(secondaryBranchFit.distributionTuning, leafFit.distributionTuning, "leaves");
  assertOnlyStageParametersChanged(leafFit.distributionTuning, finalLeafFit.distributionTuning, "leaves");
  const publicDistributionTuning = publicReconstructionDistributionTuning(finalLeafFit.distributionTuning);
  const topologyGeometry = generator.generateProceduralTreeGeometry(
    source,
    toLeafCountTuning(leafCounts),
    publicDistributionTuning,
    foliageTuning,
    triangleBudget
  );
  const stemNodeParameters = deriveStemNodeParameters(sourceAnalysis, topologyGeometry);
  const generatedStructure = generator.generateProceduralTreeStructureParameters(source, toLeafCountTuning(leafCounts), publicDistributionTuning, foliageTuning);
  const stemStructure = generator.editProceduralTreeStructureParameters(generatedStructure, stemNodeParameters);
  const stemGeometry = generator.generateProceduralTreeGeometry(
    { ...source, structureParameters: stemStructure },
    toLeafCountTuning(leafCounts),
    publicDistributionTuning,
    foliageTuning,
    triangleBudget
  );
  const leafNodeParameters = deriveLeafNodeParameters(sourceAnalysis, stemGeometry);
  const recipe = {
    schema: "galacean/procedural-tree-recipe-v4",
    assetId,
    profile,
    size: source.size,
    distributionTuning: publicDistributionTuning,
    structureParameters: generator.editProceduralTreeStructureParameters(stemStructure, [], leafNodeParameters),
    leafCountTuning: toLeafCountTuning(leafCounts),
    foliageTuning,
    triangleBudget
  };
  assertFiniteParameterRecipe(recipe);
  const geometry = generator.generateProceduralTreeGeometry(
    { ...source, structureParameters: recipe.structureParameters },
    recipe.leafCountTuning,
    recipe.distributionTuning,
    recipe.foliageTuning,
    recipe.triangleBudget
  );

  if (geometry.lods[0].triangleCount > triangleLimit) {
    throw new Error(`LOD0 has ${geometry.lods[0].triangleCount} triangles; limit is ${triangleLimit}`);
  }
  if (
    !geometry.lods.every(
      (lod, lodIndex) => lodIndex === 0 || lod.triangleCount < geometry.lods[lodIndex - 1].triangleCount
    )
  ) {
    throw new Error("LOD triangle counts must decrease strictly after LOD0");
  }

  const reconstructionLods = geometry.lods.map((lod, level) => ({
    level,
    branchCounts: lod.branchCounts,
    leafCards: lod.leafCount,
    trunkTriangles: lod.trunkTriangleCount,
    leafTriangles: lod.leafTriangleCount,
    triangles: lod.triangleCount,
    radialSegments: lod.radialSegments,
    curveSegments: lod.curveSegments,
    trunkBounds: lod.trunk.bounds,
    crownBounds: lod.crown.bounds
  }));
  const sourceHeight = Number(sourceAnalysis.height);
  const reconstructedHeight = reconstructionLods[0].trunkBounds[1][1] - reconstructionLods[0].trunkBounds[0][1];
  const parityChecks = {
    treeHeight: relativeError(sourceHeight, reconstructedHeight),
    stemComponents: relativeError(
      sourceAnalysis.branchCounts.reduce(sum, 0),
      reconstructionLods[0].branchCounts.reduce(sum, 0)
    ),
    leafCards: relativeError(sourceAnalysis.inferredRules.leaves.cards, reconstructionLods[0].leafCards)
  };
  const maximumQuantitativeError = Math.max(...Object.values(parityChecks));
  const stageRuleComparisons = createStageRuleComparisons(sourceAnalysis, geometry, source.size);
  const analysis = {
    schema: "galacean/procedural-tree-reconstruction-analysis-v2",
    assetId,
    label,
    createdAt: new Date().toISOString(),
    proceduralAlgorithm: geometry.algorithm,
    proceduralProfile: profile,
    runtimeGeometryInput: "finite procedural parameters only",
    runtimeBlueprintAllowed: false,
    hiddenFittedCurvesAllowed: false,
    comparisonOrder: COMPARISON_ORDER,
    stageRuleComparisons,
    triangleLimit,
    source: {
      height: sourceHeight,
      branchCounts: sourceAnalysis.branchCounts,
      leafCards: sourceAnalysis.inferredRules.leaves.cards
    },
    inverseFit: {
      method: "strict trunk, primary branch, secondary branch, then per-leaf parameter reconstruction",
      parameterOwnership: {
        trunk: "tree and trunk parameters",
        primaryBranches: "branch* parameters and level-1 node Paths only",
        secondaryBranches: "twig* parameters and level-2 node Paths only",
        leaves: "leaf* and crown* parameters only"
      },
      evaluatedCandidates:
        trunkFit.evaluatedCandidates +
        primaryBranchFit.evaluatedCandidates +
        secondaryBranchFit.evaluatedCandidates +
        leafFit.evaluatedCandidates +
        finalLeafFit.evaluatedCandidates,
      objective: finalLeafFit.objective,
      stages: [
        { stage: "trunk", objective: trunkFit.objective, evaluatedCandidates: trunkFit.evaluatedCandidates },
        {
          stage: "primaryBranches",
          objective: primaryBranchFit.objective,
          evaluatedCandidates: primaryBranchFit.evaluatedCandidates
        },
        {
          stage: "secondaryBranches",
          objective: secondaryBranchFit.objective,
          evaluatedCandidates: secondaryBranchFit.evaluatedCandidates
        },
        {
          stage: "leaves",
          objective: finalLeafFit.objective,
          evaluatedCandidates: leafFit.evaluatedCandidates + finalLeafFit.evaluatedCandidates
        }
      ],
      parameterCount:
        Object.keys(recipe.distributionTuning).length +
        recipe.structureParameters.stems.length +
        recipe.structureParameters.leaves.length +
        10
    },
    reconstruction: { structure: geometry.structure, lods: reconstructionLods },
    parity: {
      checks: parityChecks,
      maximumError: maximumQuantitativeError,
      passesFivePercent: maximumQuantitativeError <= MAXIMUM_STAGE_ERROR
    }
  };
  const sourceReport = {
    schema: "galacean/procedural-tree-source-analysis-v1",
    assetId,
    source: sourceAnalysis.source,
    coordinateSystem: sourceAnalysis.coordinateSystem,
    height: sourceAnalysis.height,
    branchCounts: sourceAnalysis.branchCounts,
    lodBranchCounts: sourceAnalysis.lodBranchCounts,
    lodLeafCounts: sourceAnalysis.lodLeafCounts,
    inferredRules: sourceAnalysis.inferredRules
  };
  await Promise.all([
    writeJson(path.join(outputDirectory, "procedural-recipe.json"), recipe),
    writeJson(path.join(outputDirectory, "source-analysis.json"), sourceReport),
    writeJson(path.join(outputDirectory, "analysis.json"), analysis)
  ]);
  process.stdout.write(
    `\nGALACEAN_PROCEDURAL_TREE_GEOMETRY_BEGIN\n${JSON.stringify({
      schema: "galacean/procedural-tree-runtime-geometry-stream-v1",
      trunk: {
        positions: geometry.lods[0].trunk.positions,
        indices: Array.from(geometry.lods[0].trunk.indices)
      },
      crown: {
        positions: materializeLeafNodePositions(geometry, recipe.foliageTuning),
        indices: Array.from(geometry.lods[0].crown.indices)
      }
    })}\nGALACEAN_PROCEDURAL_TREE_GEOMETRY_END\n`
  );
} finally {
  await vite.close();
}

function inferDistributionTuning(source, defaults) {
  const branches = Array.isArray(source.branches) ? source.branches : [];
  const byId = new Map(branches.map((branch) => [branch.id, branch]));
  const trunk = branches.find((branch) => branch.level === 0);
  const primary = branches.filter((branch) => branch.level === 1);
  const twigs = branches.filter((branch) => branch.level === 2);
  const directPrimary = primary.filter((branch) => byId.get(branch.support)?.level !== branch.level);
  const directTwigs = twigs.filter((branch) => byId.get(branch.support)?.level !== branch.level);
  const rules = source.inferredRules;
  const height = Number(source.height);
  const primaryLengths = directPrimary.map(pathLength);
  const twigLengths = directTwigs.map(pathLength);
  const primaryParentRatios = directPrimary.map(
    (branch) => pathLength(branch) / Math.max(pathLength(byId.get(branch.support)), 1e-9)
  );
  const twigParentRatios = directTwigs.map(
    (branch) => pathLength(branch) / Math.max(pathLength(byId.get(branch.support)), 1e-9)
  );
  const primaryChordAngles = absoluteBranchUpAngles(directPrimary);
  const twigChordAngles = absoluteBranchUpAngles(directTwigs);
  const primaryParentAngles = relativeBranchAngles(directPrimary, byId);
  const twigParentAngles = relativeBranchAngles(directTwigs, byId);
  const primaryRootRatios = directPrimary.map((branch) => branch.points[0][1] / height);
  const leafSizes = source.leaves?.map((leaf) => magnitude(leaf.up)) ?? [];
  const branchSeed = mixSeed(defaults.geometrySeed, "branches");
  const twigSeed = mixSeed(defaults.geometrySeed, "twigs");
  const leafSeed = mixSeed(defaults.geometrySeed, "leaves");
  const primaryLengthCurve = fitParentValueCurve(
    directPrimary.map((branch) => [branch.points[0][1] / height, pathLength(branch) / height])
  );
  const twigLengthCurve = fitParentValueCurve(
    directTwigs.map((branch) => [branch.points[0][1] / height, pathLength(branch) / height])
  );
  const primaryAngleCurve = fitParentValueCurve(
    directPrimary.map((branch, index) => [branch.points[0][1] / height, primaryParentAngles[index]])
  );
  const twigAngleCurve = fitParentValueCurve(
    directTwigs.map((branch, index) => [branch.points[0][1] / height, twigParentAngles[index]])
  );
  const primaryCurveSamples = signedGeneratorCurveSamples(directPrimary, byId);
  const twigCurveSamples = signedGeneratorCurveSamples(directTwigs, byId);
  const twigAzimuthMixture = inferCircularMixture(
    relativeBranchAzimuthSamples(directTwigs, byId, height).map((sample) => sample[1])
  );
  const branchCurveSegments = clamp(
    Math.round(
      maximum(
        directPrimary.map((branch) => branch.points.length - 1),
        1
      )
    ),
    1,
    64
  );
  const twigCurveSegments = clamp(
    Math.round(
      maximum(
        directTwigs.map((branch) => branch.points.length - 1),
        1
      )
    ),
    1,
    64
  );
  const leafDensityCurve = inferLeafDensityCurve(source, height);
  const leafDensityProfile = inferLeafDensityProfile(source, height);
  const crownHarmonic = inferCrownHarmonic(primary, height);
  const primaryWhorl = inferWhorlGenerator(directPrimary, byId, height);
  const primaryAzimuthMixture = inferCircularMixture(
    relativeBranchAzimuthSamples(directPrimary, byId, height).map((sample) => sample[1])
  );
  const primaryBifurcation = inferBifurcationTuning(primary, byId);
  const twigBifurcation = inferBifurcationTuning(twigs, byId);
  const trunkLateNoise = inferSpineLateNoiseTuning(trunk ? [trunk] : []);
  const trunkPathHarmonics = trunk ? inferSpinePathHarmonics(trunk) : undefined;
  const branchLateNoise = inferSpineLateNoiseTuning(directPrimary);
  const twigLateNoise = inferSpineLateNoiseTuning(directTwigs);
  const branchRadiusByHeightCurve = inferChildRadiusByHeightCurve(directPrimary, height);
  const twigRadiusByHeightCurve = inferChildRadiusByHeightCurve(directTwigs, height);
  const branchTipRadiusPercentOfStart = inferStemTipRadiusPercent(primary);
  const twigTipRadiusPercentOfStart = inferStemTipRadiusPercent(twigs);
  const branchExtensionRadiusRetentionPercent = inferExtensionRadiusRetention(primary, byId);
  const twigExtensionRadiusRetentionPercent = inferExtensionRadiusRetention(twigs, byId);
  const branchExtensionLength = inferExtensionLength(primary, byId);
  const twigExtensionLength = inferExtensionLength(twigs, byId);
  const primaryRotation = primaryWhorl.rotation;
  const twigRotation = inferRotationGenerator(directTwigs);
  const extensionRatio = (selected, sameLevel) =>
    selected.filter((branch) => byId.get(branch.support)?.level === sameLevel).length / Math.max(selected.length, 1);
  const leafSizeSpread = spreadPercent(leafSizes);
  const sourceLeafOffset = median(rules.leaves.nearestStemDistanceRatioQuantiles, 0);
  const medianCardWidth = median(rules.leaves.cardWidthQuantiles, 0);
  const medianCardHeight = median(rules.leaves.cardHeightQuantiles, 0);
  const medianCardHeightRatio = median(rules.leaves.cardHeightQuantiles, 0) / height;
  const leafProgresses = source.leaves?.map((leaf) => Number(leaf.progress)) ?? [];
  const leafDensityScaleByLevel = inferLeafDensityScaleByLevel(source);
  const leafLengthInfluencePercent = inferLeafLengthInfluencePercent(source);
  const leafTerminalFractionPercent =
    100 *
    (source.leaves.filter((leaf) => Number(leaf.progress) >= 1 - 1e-6).length / Math.max(source.leaves.length, 1));
  const leafTerminalFractionPercentByLevel = [0, 1, 2].map((level) => {
    const progresses = (source.leaves ?? []).flatMap((leaf) =>
      byId.get(leaf.stem)?.level === level ? [Number(leaf.progress)] : []
    );
    return (100 * progresses.filter((progress) => progress >= 1 - 1e-6).length) / Math.max(progresses.length, 1);
  });
  const globalLeafStart = quantile(leafProgresses, 0.1);
  const leafFirstBoundariesByLevel = [0, 1, 2].map((level) =>
    source.branches
      .filter((branch) => branch.level === level)
      .flatMap((branch) => {
        const progresses = (source.leaves ?? []).flatMap((leaf) =>
          leaf.stem === branch.id ? [Number(leaf.progress)] : []
        );
        return progresses.length ? [minimum(progresses, globalLeafStart)] : [];
      })
  );
  const leafStartProgressPercentByLevel = leafFirstBoundariesByLevel.map((starts) =>
    clamp(
      100 *
        (starts.length ? (minimum(starts, globalLeafStart) + maximum(starts, globalLeafStart)) * 0.5 : globalLeafStart),
      0,
      100
    )
  );
  const leafStartProgressVariationPercentByLevel = leafFirstBoundariesByLevel.map((starts) =>
    clamp(50 * (maximum(starts, globalLeafStart) - minimum(starts, globalLeafStart)), 0, 100)
  );
  const leafStartProgressMinimumPercentByLevel = leafFirstBoundariesByLevel.map((starts) =>
    clamp(100 * minimum(starts, globalLeafStart), 0, 100)
  );
  const leafStartProgressMaximumPercentByLevel = leafFirstBoundariesByLevel.map((starts) =>
    clamp(100 * maximum(starts, globalLeafStart), 0, 100)
  );
  const leafStartProgressDistributionExponentByLevel = leafFirstBoundariesByLevel.map((starts, level) => {
    const minimumStart = leafStartProgressMinimumPercentByLevel[level] / 100;
    const maximumStart = leafStartProgressMaximumPercentByLevel[level] / 100;
    if (maximumStart - minimumStart <= Number.EPSILON) return 1;
    const normalizedMedian = clamp(
      (median(starts, globalLeafStart) - minimumStart) / (maximumStart - minimumStart),
      0.001,
      0.999
    );
    return clamp(Math.log(normalizedMedian) / Math.log(0.5), 0.05, 4);
  });
  const leafProgressExponent = inferLeafProgressExponent(source, byId, leafStartProgressPercentByLevel);
  const leafProgressExponentByLevel = [0, 1, 2].map((level) =>
    inferLeafProgressExponent(source, byId, leafStartProgressPercentByLevel, level)
  );
  return {
    ...defaults,
    trunkSeed: mixSeed(defaults.geometrySeed, "trunk"),
    branchSeed,
    twigSeed,
    leafSeed,
    trunkLateNoiseSeed: mixSeed(defaults.geometrySeed, "trunk-late-noise"),
    branchLateNoiseSeed: mixSeed(defaults.geometrySeed, "branch-late-noise"),
    twigLateNoiseSeed: mixSeed(defaults.geometrySeed, "twig-late-noise"),
    trunkCount: source.branchCounts[0],
    trunkLengthPercentOfHeight: clamp((100 * Number(rules.trunk.pathLength)) / height, 10, 120),
    treeHeightVariationPercent: 0,
    trunkClearHeightPercentOfHeight: clamp(
      100 * minimum(primaryRootRatios, defaults.trunkClearHeightPercentOfHeight / 100),
      0,
      95
    ),
    trunkRootFlare: clamp(
      Number(trunk?.radii?.[0] ?? rules.trunk.baseRadius) /
        Math.max(Number(trunk?.radii?.[1] ?? rules.trunk.baseRadius), 1e-9),
      0.5,
      4
    ),
    trunkRadiusPercentOfHeight: clamp(
      (100 * Number(rules.trunk.baseRadius)) /
        height /
        clamp(
          Number(trunk?.radii?.[0] ?? rules.trunk.baseRadius) /
            Math.max(Number(trunk?.radii?.[1] ?? rules.trunk.baseRadius), 1e-9),
          0.5,
          4
        ),
      0.02,
      100
    ),
    trunkTipRadiusPercentOfBase: clamp(
      (100 *
        Number(rules.trunk.tipRadius) *
        clamp(
          Number(trunk?.radii?.[0] ?? rules.trunk.baseRadius) /
            Math.max(Number(trunk?.radii?.[1] ?? rules.trunk.baseRadius), 1e-9),
          0.5,
          4
        )) /
        Math.max(Number(rules.trunk.baseRadius), 1e-9),
      0.01,
      100
    ),
    trunkRadiusVariationPercent: 0,
    trunkCurveSegments: clamp(Math.round((trunk?.points.length ?? 2) - 1), 1, 64),
    trunkCurveVariationDegrees: curveDegrees(Number(rules.trunk.curveToHeightRatio)),
    trunkLateNoiseAmountDegrees: trunkLateNoise.amountDegrees,
    trunkLateNoiseTurbulence: trunkLateNoise.turbulence,
    trunkLateNoiseSmoothPercent: trunkLateNoise.smoothPercent,
    trunkLateNoiseByHeightCurve: trunkLateNoise.profilePercent,
    trunkPathHarmonicsPercentOfLength: trunkPathHarmonics,
    branchCount: source.branchCounts[1],
    branchGenerationMode: primaryWhorl.size > 1 ? "steps" : "proportional",
    branchBifurcationThresholdDegrees: primaryBifurcation.thresholdDegrees,
    branchBifurcationSpacingPercentOfParent: primaryBifurcation.spacingPercent,
    branchBifurcationBalancePercent: primaryBifurcation.balancePercent,
    branchBifurcationAlignPercent: 0,
    branchWhorlSize: primaryWhorl.size,
    branchWhorlCount: primaryWhorl.count,
    branchWhorlSpreadPercentOfParent: primaryWhorl.spread * 100,
    branchWhorlPhaseByHeightCurve: primaryWhorl.phaseCurve,
    branchExtensionPercent: extensionRatio(primary, 1) * 100,
    branchExtensionLengthPercentOfParent: branchExtensionLength.percentOfParent,
    branchExtensionLengthVariationPercent: branchExtensionLength.variationPercent,
    branchAttachmentProgressCurve: empiricalDistributionCurve(
      directPrimary.map((branch) => branch.attachmentProgress),
      100
    ),
    branchLengthByHeightCurve: primaryLengthCurve.map((value) => value * 100),
    branchDownAngleByHeightCurve: primaryAngleCurve,
    branchLengthPercentOfParent: clamp(
      100 * median(primaryParentRatios, median(primaryLengths, height * 0.2) / height),
      0.01,
      200
    ),
    branchMaximumLengthPercentOfHeight: clamp((105 * maximum(primaryLengths, height * 0.25)) / height, 0.01, 200),
    branchLengthVariationPercent: residualPercentOfCurve(
      directPrimary.map((branch) => [branch.points[0][1] / height, pathLength(branch) / height]),
      primaryLengthCurve
    ),
    branchCurveSegments,
    branchRadiusScalePercent: 100,
    branchRadiusByHeightCurve,
    branchTipRadiusPercentOfStart,
    branchExtensionRadiusRetentionPercent,
    branchParentRadiusLimitPercent: inferParentRadiusLimitPercent(primary, byId),
    branchCurveDegrees: median(primaryCurveSamples, 0),
    branchCurveBackDegrees: 0,
    branchCurveVariationDegrees: residualScalarVariation(primaryCurveSamples),
    branchLateNoiseAmountDegrees: branchLateNoise.amountDegrees,
    branchLateNoiseTurbulence: branchLateNoise.turbulence,
    branchLateNoiseSmoothPercent: branchLateNoise.smoothPercent,
    branchLateNoiseByHeightCurve: branchLateNoise.profilePercent,
    branchAttractionUp: 0,
    branchRotateDegrees: primaryRotation.stepDegrees,
    branchRotateVariationDegrees:
      primaryWhorl.size === 1 ? primaryAzimuthMixture.variationDegrees : primaryRotation.variationDegrees,
    branchAzimuthModesDegrees: primaryWhorl.size === 1 ? primaryAzimuthMixture.modes : undefined,
    branchAzimuthModeWeights: primaryWhorl.size === 1 ? primaryAzimuthMixture.weights : undefined,
    branchDownAngleDegrees: clamp(
      median(primaryChordAngles, median(rules.primaryBranches.upAngleDegreesQuantiles, 45)),
      -180,
      180
    ),
    branchDownAngleVariationDegrees: residualVariationDegrees(
      directPrimary.map((branch) => branch.points[0][1] / height),
      primaryParentAngles,
      primaryAngleCurve
    ),
    twigCount: source.branchCounts[2],
    twigGenerationMode: "proportional",
    twigBifurcationThresholdDegrees: twigBifurcation.thresholdDegrees,
    twigBifurcationSpacingPercentOfParent: twigBifurcation.spacingPercent,
    twigBifurcationBalancePercent: twigBifurcation.balancePercent,
    twigBifurcationAlignPercent: 0,
    twigExtensionPercent: extensionRatio(twigs, 2) * 100,
    twigExtensionLengthPercentOfParent: twigExtensionLength.percentOfParent,
    twigExtensionLengthVariationPercent: twigExtensionLength.variationPercent,
    twigAttachmentProgressCurve: empiricalDistributionCurve(
      directTwigs.map((branch) => branch.attachmentProgress),
      100
    ),
    twigLengthByHeightCurve: twigLengthCurve.map((value) => value * 100),
    twigDownAngleByHeightCurve: twigAngleCurve,
    twigLengthPercentOfParent: clamp(
      100 *
        median(
          twigParentRatios,
          median(twigLengths, height * 0.09) / Math.max(median(primaryLengths, height * 0.2), 1e-9)
        ),
      0.01,
      200
    ),
    twigMaximumLengthPercentOfHeight: clamp((105 * maximum(twigLengths, height * 0.12)) / height, 0.01, 200),
    twigLengthVariationPercent: residualPercentOfCurve(
      directTwigs.map((branch) => [branch.points[0][1] / height, pathLength(branch) / height]),
      twigLengthCurve
    ),
    twigCurveSegments,
    twigRadiusScalePercent: 100,
    twigRadiusByHeightCurve,
    twigTipRadiusPercentOfStart,
    twigExtensionRadiusRetentionPercent,
    twigParentRadiusLimitPercent: inferParentRadiusLimitPercent(twigs, byId),
    twigCurveDegrees: median(twigCurveSamples, 0),
    twigCurveBackDegrees: 0,
    twigCurveVariationDegrees: residualScalarVariation(twigCurveSamples),
    twigLateNoiseAmountDegrees: twigLateNoise.amountDegrees,
    twigLateNoiseTurbulence: twigLateNoise.turbulence,
    twigLateNoiseSmoothPercent: twigLateNoise.smoothPercent,
    twigLateNoiseByHeightCurve: twigLateNoise.profilePercent,
    twigAttractionUp: 0,
    twigRotateDegrees: twigRotation.stepDegrees,
    twigRotateVariationDegrees: twigAzimuthMixture.variationDegrees,
    twigAzimuthModesDegrees: twigAzimuthMixture.modes,
    twigAzimuthModeWeights: twigAzimuthMixture.weights,
    twigAttachmentEndPercentOfParent: clamp(
      100 *
        maximum(
          directTwigs.map((branch) => branch.attachmentProgress),
          1
        ),
      0,
      100
    ),
    twigDownAngleDegrees: clamp(
      median(twigChordAngles, median(rules.secondaryBranches.upAngleDegreesQuantiles, 45)),
      -180,
      180
    ),
    twigDownAngleVariationDegrees: residualVariationDegrees(
      directTwigs.map((branch) => branch.points[0][1] / height),
      twigParentAngles,
      twigAngleCurve
    ),
    leafDownAngleDegrees: inferLeafDownAngle(source.leaves, byId, defaults.leafDownAngleDegrees),
    leafDensityScaleByLevel,
    leafDensityByHeightCurve: leafDensityCurve,
    leafDensityByHeightProfile: leafDensityProfile,
    leafLengthInfluencePercent,
    leafDistributionInfluencePercent: 100,
    leafTerminalFractionPercent,
    leafTerminalFractionPercentByLevel,
    leafProgressExponent,
    leafProgressExponentByLevel,
    leafSpacingPercent: 0,
    leafScalePercentOfHeight: clamp((100 * medianCardHeight) / height, 0.01, 50),
    leafAspectRatio: clamp(medianCardWidth / Math.max(medianCardHeight, Number.EPSILON), 0.01, 20),
    leafScaleTaperPercent: 0,
    leafScaleVariationPercent: clamp(leafSizeSpread, 0, 100),
    leafVariantSizeBlendPercent: 0,
    leafAnchorOffsetPercentOfHeight: clamp(100 * Math.max(0, sourceLeafOffset - medianCardHeightRatio * 0.5), 0, 20),
    leafAnchorOffsetVariationPercent: clamp(
      100 * (halfRange(rules.leaves.nearestStemDistanceRatioQuantiles) / Math.max(sourceLeafOffset, Number.EPSILON)),
      0,
      100
    ),
    leafStartProgressPercentOfStem: clamp(100 * quantile(leafProgresses, 0.1), 0, 100),
    leafStartProgressPercentByLevel,
    leafStartProgressVariationPercentByLevel,
    leafStartProgressMinimumPercentByLevel,
    leafStartProgressMaximumPercentByLevel,
    leafStartProgressDistributionExponentByLevel,
    leafRollDegrees: defaults.leafRollDegrees ?? -45,
    crownLobeCount: crownHarmonic.count,
    crownLobeDepthPercent: crownHarmonic.depth * 100,
    crownLobePhaseDegrees: crownHarmonic.phaseDegrees,
    crownAsymmetryXPercent: crownHarmonic.asymmetryX * 100,
    crownAsymmetryZPercent: crownHarmonic.asymmetryZ * 100,
    crownMaximumHeightPercentOfHeight: 100
  };
}

function publicReconstructionDistributionTuning(tuning) {
  const result = Object.fromEntries(
    PUBLIC_RECONSTRUCTION_DISTRIBUTION_KEYS.map((key) => {
      if (!(key in tuning)) throw new Error("Public reconstruction parameter " + key + " is missing");
      return [key, structuredClone(tuning[key])];
    })
  );
  if (Object.keys(result).length !== PUBLIC_RECONSTRUCTION_DISTRIBUTION_KEYS.length) {
    throw new Error("Public reconstruction distribution must be a closed editable parameter set");
  }
  return result;
}

function fitTrunkParameters(generator, source, sourceAnalysis, initial, leafCounts, foliage, triangleBudget) {
  const target = sourceSkeletonFeatures(sourceAnalysis);
  let best = { distributionTuning: initial, objective: Number.POSITIVE_INFINITY };
  let evaluatedCandidates = 0;
  const evaluate = (distributionTuning) => {
    const geometry = generator.generateProceduralTreeGeometry(
      source,
      toLeafCountTuning(leafCounts),
      distributionTuning,
      foliage,
      triangleBudget
    );
    const objective = trunkObjective(target, geometry, source.size);
    evaluatedCandidates++;
    if (objective < best.objective) best = { distributionTuning, objective };
  };
  // An inferred harmonic path is an analytic fit of the measured source spine, so
  // stochastic curve/noise search would only perturb an already-owned trunk shape.
  // Keep the analytic path compact and deterministic while leaving late noise available
  // for species whose trunk cannot be represented by the fitted harmonic coefficients.
  if (initial.trunkPathHarmonicsPercentOfLength) {
    evaluate({
      ...initial,
      trunkCurveVariationDegrees: 0,
      trunkLateNoiseAmountDegrees: 0,
      trunkLateNoiseByHeightCurve: undefined
    });
    return { ...best, evaluatedCandidates };
  }
  const inferredAmount = Number(initial.trunkLateNoiseAmountDegrees ?? 0);
  const inferredTurbulence = Number(initial.trunkLateNoiseTurbulence ?? 0);
  const amounts = uniqueNumbers([0, inferredAmount * 0.5, inferredAmount, inferredAmount * 1.5, 360]);
  const turbulences = uniqueNumbers([0, 0.5, inferredTurbulence * 0.5, inferredTurbulence, inferredTurbulence * 1.5]);
  for (const trunkCurveVariationDegrees of uniqueNumbers([
    0,
    initial.trunkCurveVariationDegrees * 0.5,
    initial.trunkCurveVariationDegrees
  ])) {
    for (const trunkLateNoiseByHeightCurve of [undefined, initial.trunkLateNoiseByHeightCurve]) {
      for (const trunkLateNoiseAmountDegrees of amounts) {
        for (const trunkLateNoiseTurbulence of turbulences) {
          for (const trunkLateNoiseSmoothPercent of [0, 35]) {
            evaluate({
              ...initial,
              trunkCurveVariationDegrees,
              trunkLateNoiseAmountDegrees: clamp(trunkLateNoiseAmountDegrees, 0, 360),
              trunkLateNoiseTurbulence: clamp(trunkLateNoiseTurbulence, 0, 16),
              trunkLateNoiseSmoothPercent,
              trunkLateNoiseByHeightCurve
            });
          }
        }
      }
    }
  }
  for (const trunkLateNoiseSeed of candidateSeeds(
    best.distributionTuning.trunkLateNoiseSeed ?? initial.geometrySeed,
    256
  )) {
    evaluate({ ...best.distributionTuning, trunkLateNoiseSeed });
  }
  for (let pass = 0; pass < 2; pass++) {
    const amount = Number(best.distributionTuning.trunkLateNoiseAmountDegrees ?? 0);
    for (const multiplier of [0.6, 0.8, 0.9, 1, 1.1, 1.25, 1.5]) {
      evaluate({
        ...best.distributionTuning,
        trunkLateNoiseAmountDegrees: clamp(amount * multiplier, 0, 360)
      });
    }
    const turbulence = Number(best.distributionTuning.trunkLateNoiseTurbulence ?? 0);
    for (const offset of [-1, -0.5, -0.25, 0, 0.25, 0.5, 1]) {
      evaluate({
        ...best.distributionTuning,
        trunkLateNoiseTurbulence: clamp(turbulence + offset, 0, 16)
      });
    }
    for (const trunkLateNoiseSmoothPercent of [0, 15, 30, 45, 60, 75]) {
      evaluate({ ...best.distributionTuning, trunkLateNoiseSmoothPercent });
    }
  }
  return { ...best, evaluatedCandidates };
}

function assertOnlyStageParametersChanged(before, after, stage) {
  const allowedPrefixes = STAGE_PARAMETER_PREFIXES[stage];
  if (!allowedPrefixes) throw new Error(`Unknown procedural tree fitting stage ${stage}`);
  const changed = new Set([...Object.keys(before), ...Object.keys(after)]);
  const forbidden = [...changed].filter(
    (key) =>
      !allowedPrefixes.some((prefix) => key.startsWith(prefix)) &&
      JSON.stringify(before[key]) !== JSON.stringify(after[key])
  );
  if (forbidden.length) {
    throw new Error(`${stage} fitting changed frozen parameters: ${forbidden.sort().join(", ")}`);
  }
}

function fitPrimaryBranchParameters(generator, source, sourceAnalysis, initial, leafCounts, foliage, triangleBudget) {
  return fitBranchLevelParameters(
    generator,
    source,
    sourceAnalysis,
    initial,
    leafCounts,
    foliage,
    triangleBudget,
    "primaryBranches",
    "branch"
  );
}

function fitSecondaryBranchParameters(generator, source, sourceAnalysis, initial, leafCounts, foliage, triangleBudget) {
  return fitBranchLevelParameters(
    generator,
    source,
    sourceAnalysis,
    initial,
    leafCounts,
    foliage,
    triangleBudget,
    "secondaryBranches",
    "twig"
  );
}

function fitBranchLevelParameters(
  generator,
  source,
  sourceAnalysis,
  initial,
  leafCounts,
  foliage,
  triangleBudget,
  targetKey,
  prefix
) {
  const target = sourceSkeletonFeatures(sourceAnalysis);
  let distributionTuning = { ...initial };
  let geometry = generator.generateProceduralTreeGeometry(
    source,
    toLeafCountTuning(leafCounts),
    distributionTuning,
    foliage,
    triangleBudget
  );
  const radiusCurveKey = `${prefix}RadiusByHeightCurve`;
  const radiusScaleKey = `${prefix}RadiusScalePercent`;
  const radiusCorrection =
    median(target[targetKey].rootRadiusRatioQuantiles, 1) /
    Math.max(median(geometry.structure[targetKey].rootRadiusRatioQuantiles, 1), Number.EPSILON);
  distributionTuning = distributionTuning[radiusCurveKey]
    ? {
        ...distributionTuning,
        [radiusCurveKey]: distributionTuning[radiusCurveKey].map((value) => clamp(value * radiusCorrection, 0, 100))
      }
    : {
        ...distributionTuning,
        [radiusScaleKey]: clamp(100 * radiusCorrection, 1, 2000)
      };
  geometry = generator.generateProceduralTreeGeometry(
    source,
    toLeafCountTuning(leafCounts),
    distributionTuning,
    foliage,
    triangleBudget
  );
  let objective = branchLevelObjective(target[targetKey], geometry.structure[targetKey]);
  let evaluatedCandidates = 1;
  const evaluateGenerationMode = (candidate) => {
    const candidateGeometry = generator.generateProceduralTreeGeometry(
      source,
      toLeafCountTuning(leafCounts),
      candidate,
      foliage,
      triangleBudget
    );
    const candidateObjective = branchLevelObjective(target[targetKey], candidateGeometry.structure[targetKey]);
    evaluatedCandidates++;
    if (candidateObjective < objective) {
      distributionTuning = candidate;
      geometry = candidateGeometry;
      objective = candidateObjective;
    }
  };
  for (const generationMode of ["proportional", "steps", "interval", "bifurcation"]) {
    evaluateGenerationMode({ ...distributionTuning, [`${prefix}GenerationMode`]: generationMode });
  }
  if (distributionTuning[`${prefix}GenerationMode`] === "bifurcation") {
    for (const balance of [0, 50, 100]) {
      for (const align of [0, 50, 100]) {
        evaluateGenerationMode({
          ...distributionTuning,
          [`${prefix}BifurcationBalancePercent`]: balance,
          [`${prefix}BifurcationAlignPercent`]: align
        });
      }
    }
  }
  // Stage ownership is strict: each branch level mutates only its own prefix.
  const seedKey = `${prefix}Seed`;
  {
    const seeds = candidateSeeds(distributionTuning[seedKey] ?? distributionTuning.geometrySeed, 32);
    for (const seed of seeds) {
      const candidate = { ...distributionTuning, [seedKey]: seed };
      const candidateGeometry = generator.generateProceduralTreeGeometry(
        source,
        toLeafCountTuning(leafCounts),
        candidate,
        foliage,
        triangleBudget
      );
      const candidateObjective = branchLevelObjective(target[targetKey], candidateGeometry.structure[targetKey]);
      evaluatedCandidates++;
      if (candidateObjective < objective) {
        distributionTuning = candidate;
        geometry = candidateGeometry;
        objective = candidateObjective;
      }
    }
  }
  tuneLevel();
  objective = branchLevelObjective(target[targetKey], geometry.structure[targetKey]);
  for (const seed of candidateSeeds(
    distributionTuning[seedKey] ?? distributionTuning.geometrySeed,
    64,
    `${prefix}-final`
  )) {
    const candidate = { ...distributionTuning, [seedKey]: seed };
    const candidateGeometry = generator.generateProceduralTreeGeometry(
      source,
      toLeafCountTuning(leafCounts),
      candidate,
      foliage,
      triangleBudget
    );
    const candidateObjective = branchLevelObjective(target[targetKey], candidateGeometry.structure[targetKey]);
    evaluatedCandidates++;
    if (candidateObjective < objective) {
      distributionTuning = candidate;
      geometry = candidateGeometry;
      objective = candidateObjective;
    }
  }
  return { distributionTuning, geometry, objective, evaluatedCandidates };

  function tuneLevel() {
    let levelObjective = branchLevelObjective(target[targetKey], geometry.structure[targetKey]);
    const evaluateLevel = (candidate) => {
      const candidateGeometry = generator.generateProceduralTreeGeometry(
        source,
        toLeafCountTuning(leafCounts),
        candidate,
        foliage,
        triangleBudget
      );
      const candidateObjective = branchLevelObjective(target[targetKey], candidateGeometry.structure[targetKey]);
      evaluatedCandidates++;
      if (candidateObjective < levelObjective) {
        distributionTuning = candidate;
        geometry = candidateGeometry;
        levelObjective = candidateObjective;
        objective = candidateObjective;
      }
    };
    for (let pass = 0; pass < 2; pass++) {
      const lengthCurveKey = `${prefix}LengthByHeightCurve`;
      const angleCurveKey = `${prefix}DownAngleByHeightCurve`;
      const maximumLengthKey = `${prefix}MaximumLengthPercentOfHeight`;
      const lengthVariationKey = `${prefix}LengthVariationPercent`;
      const curveKey = `${prefix}CurveDegrees`;
      const curveVariationKey = `${prefix}CurveVariationDegrees`;
      const variationKey = `${prefix}DownAngleVariationDegrees`;
      const radiusScaleKey = `${prefix}RadiusScalePercent`;
      const radiusCurveKey = `${prefix}RadiusByHeightCurve`;
      const parentLimitKey = `${prefix}ParentRadiusLimitPercent`;
      for (const multiplier of [0.75, 0.88, 1, 1.12]) {
        evaluateLevel({
          ...distributionTuning,
          [lengthCurveKey]: distributionTuning[lengthCurveKey].map((value) => clamp(value * multiplier, 0.01, 200))
        });
      }
      for (const multiplier of [0.8, 0.9, 1, 1.1]) {
        evaluateLevel({
          ...distributionTuning,
          [maximumLengthKey]: clamp(distributionTuning[maximumLengthKey] * multiplier, 0.01, 200)
        });
      }
      for (const multiplier of [0, 0.5, 1, 1.5]) {
        evaluateLevel({
          ...distributionTuning,
          [lengthVariationKey]: clamp(distributionTuning[lengthVariationKey] * multiplier, 0, 100)
        });
      }
      for (const multiplier of [0.3, 0.6, 1, 1.4]) {
        evaluateLevel({
          ...distributionTuning,
          [curveKey]: clamp(distributionTuning[curveKey] * multiplier, -360, 360)
        });
      }
      for (const value of [0, 5, 10, 15, 20, 25, 30, 40]) {
        evaluateLevel({ ...distributionTuning, [curveVariationKey]: value });
      }
      for (const value of [5, 10, 20, 30, 45]) {
        evaluateLevel({ ...distributionTuning, [variationKey]: value });
      }
      for (const offset of [-12, -6, 0, 6, 12]) {
        evaluateLevel({
          ...distributionTuning,
          [angleCurveKey]: distributionTuning[angleCurveKey].map((value) => clamp(value + offset, -180, 180))
        });
      }
      for (const multiplier of [0.8, 1, 1.25]) {
        if (distributionTuning[radiusCurveKey]) {
          evaluateLevel({
            ...distributionTuning,
            [radiusCurveKey]: distributionTuning[radiusCurveKey].map((value) => clamp(value * multiplier, 0, 100))
          });
        } else {
          evaluateLevel({
            ...distributionTuning,
            [radiusScaleKey]: clamp(distributionTuning[radiusScaleKey] * multiplier, 1, 2000)
          });
        }
        evaluateLevel({
          ...distributionTuning,
          [parentLimitKey]: clamp(distributionTuning[parentLimitKey] * multiplier, 1, 400)
        });
      }
    }
    const lengthCurveKey = `${prefix}LengthByHeightCurve`;
    for (let knot = 0; knot < PARENT_CURVE_KNOTS.length; knot++) {
      const baseCurve = [...distributionTuning[lengthCurveKey]];
      for (const multiplier of [0.75, 0.9, 1, 1.1, 1.25]) {
        const curve = [...baseCurve];
        curve[knot] = clamp(baseCurve[knot] * multiplier, 0.01, 200);
        evaluateLevel({ ...distributionTuning, [lengthCurveKey]: curve });
      }
    }
  }
}

function fitLeafParameters(generator, source, sourceAnalysis, initial, leafCounts, foliage, triangleBudget) {
  const target = sourceLeafFeatures(sourceAnalysis);
  if (Number(sourceAnalysis.inferredRules?.leaves?.cards ?? 0) === 0) {
    const geometry = generator.generateProceduralTreeGeometry(
      source,
      toLeafCountTuning(leafCounts),
      initial,
      foliage,
      triangleBudget
    );
    return {
      distributionTuning: initial,
      objective: leafObjective(target, generatedLeafFeatures(geometry, source.size)),
      evaluatedCandidates: 1
    };
  }
  let best = { distributionTuning: initial, objective: Number.POSITIVE_INFINITY };
  let evaluatedCandidates = 0;
  for (let leafDistribution = 0; leafDistribution <= 7; leafDistribution++) {
    for (const leafSeed of candidateSeeds(initial.leafSeed ?? initial.geometrySeed, 12)) {
      const distributionTuning = { ...initial, leafDistribution, leafSeed };
      const geometry = generator.generateProceduralTreeGeometry(
        source,
        toLeafCountTuning(leafCounts),
        distributionTuning,
        foliage,
        triangleBudget
      );
      const objective = leafObjective(target, generatedLeafFeatures(geometry, source.size));
      evaluatedCandidates++;
      if (objective < best.objective) best = { distributionTuning, objective };
    }
  }
  let distributionTuning = best.distributionTuning;
  let objective = best.objective;
  const dimensions = [
    ["leafDownAngleDegrees", [-12, -6, 0, 6, 12]],
    ["leafDownAngleVariationDegrees", [-20, -10, 0, 10, 20]],
    ["leafRollDegrees", [-45, -22.5, 0, 22.5, 45]],
    ["leafAnchorOffsetPercentOfHeight", [-0.75, -0.35, 0, 0.35, 0.75]]
  ];
  for (const [key, offsets] of dimensions) {
    const base = Number(distributionTuning[key] ?? 0);
    for (const offset of offsets) {
      const candidate = {
        ...distributionTuning,
        [key]:
          key === "leafAnchorOffsetPercentOfHeight"
            ? clamp(base + offset, 0, 20)
            : key === "leafStartProgressPercentOfStem"
              ? clamp(base + offset, 0, 100)
              : clamp(base + offset, -180, 180)
      };
      const geometry = generator.generateProceduralTreeGeometry(
        source,
        toLeafCountTuning(leafCounts),
        candidate,
        foliage,
        triangleBudget
      );
      const candidateObjective = leafObjective(target, generatedLeafFeatures(geometry, source.size));
      evaluatedCandidates++;
      if (candidateObjective < objective) {
        distributionTuning = candidate;
        objective = candidateObjective;
      }
    }
  }
  for (let pass = 0; pass < 1; pass++) {
    for (let knot = 0; knot < distributionTuning.leafDensityByHeightProfile.length; knot++) {
      const baseCurve = [...distributionTuning.leafDensityByHeightProfile];
      for (const multiplier of [0.65, 0.82, 1, 1.22, 1.5]) {
        const curve = [...baseCurve];
        curve[knot] = clamp(baseCurve[knot] * multiplier, 0.01, 10);
        const candidate = { ...distributionTuning, leafDensityByHeightProfile: curve };
        const geometry = generator.generateProceduralTreeGeometry(
          source,
          toLeafCountTuning(leafCounts),
          candidate,
          foliage,
          triangleBudget
        );
        const candidateObjective = leafObjective(target, generatedLeafFeatures(geometry, source.size));
        evaluatedCandidates++;
        if (candidateObjective < objective) {
          distributionTuning = candidate;
          objective = candidateObjective;
        }
      }
    }
  }
  for (let level = 0; level < 3; level++) {
    const baseStart = [...distributionTuning.leafStartProgressPercentByLevel];
    for (const offset of [-15, -7.5, 0, 7.5, 15]) {
      const startByLevel = [...baseStart];
      startByLevel[level] = clamp(baseStart[level] + offset, 0, 100);
      const candidate = { ...distributionTuning, leafStartProgressPercentByLevel: startByLevel };
      const geometry = generator.generateProceduralTreeGeometry(
        source,
        toLeafCountTuning(leafCounts),
        candidate,
        foliage,
        triangleBudget
      );
      const candidateObjective = leafObjective(target, generatedLeafFeatures(geometry, source.size));
      evaluatedCandidates++;
      if (candidateObjective < objective) {
        distributionTuning = candidate;
        objective = candidateObjective;
      }
    }
  }
  for (const leafLengthInfluencePercent of [0, 25, 50, 75, 100]) {
    const candidate = { ...distributionTuning, leafLengthInfluencePercent };
    const geometry = generator.generateProceduralTreeGeometry(
      source,
      toLeafCountTuning(leafCounts),
      candidate,
      foliage,
      triangleBudget
    );
    const candidateObjective = leafObjective(target, generatedLeafFeatures(geometry, source.size));
    evaluatedCandidates++;
    if (candidateObjective < objective) {
      distributionTuning = candidate;
      objective = candidateObjective;
    }
  }
  for (const multiplier of [0.5, 0.75, 1, 1.5, 2]) {
    const candidate = {
      ...distributionTuning,
      leafProgressExponent: clamp(distributionTuning.leafProgressExponent * multiplier, 0.05, 4)
    };
    const geometry = generator.generateProceduralTreeGeometry(
      source,
      toLeafCountTuning(leafCounts),
      candidate,
      foliage,
      triangleBudget
    );
    const candidateObjective = leafObjective(target, generatedLeafFeatures(geometry, source.size));
    evaluatedCandidates++;
    if (candidateObjective < objective) {
      distributionTuning = candidate;
      objective = candidateObjective;
    }
  }
  for (let level = 0; level < 3; level++) {
    for (const offset of [-30, -15, 0, 15, 30]) {
      const values = [...distributionTuning.leafTerminalFractionPercentByLevel];
      values[level] = clamp(values[level] + offset, 0, 100);
      evaluateLeafCandidate({ ...distributionTuning, leafTerminalFractionPercentByLevel: values });
    }
    for (const multiplier of [0.5, 1, 2]) {
      const values = [...distributionTuning.leafProgressExponentByLevel];
      values[level] = clamp(values[level] * multiplier, 0.05, 4);
      evaluateLeafCandidate({ ...distributionTuning, leafProgressExponentByLevel: values });
    }
    for (const multiplier of [0.5, 1, 1.5]) {
      const values = [...distributionTuning.leafStartProgressVariationPercentByLevel];
      values[level] = clamp(values[level] * multiplier, 0, 100);
      evaluateLeafCandidate({ ...distributionTuning, leafStartProgressVariationPercentByLevel: values });
    }
  }
  return { distributionTuning, objective, evaluatedCandidates };

  function evaluateLeafCandidate(candidate) {
    const geometry = generator.generateProceduralTreeGeometry(
      source,
      toLeafCountTuning(leafCounts),
      candidate,
      foliage,
      triangleBudget
    );
    const candidateObjective = leafObjective(target, generatedLeafFeatures(geometry, source.size));
    evaluatedCandidates++;
    if (candidateObjective < objective) {
      distributionTuning = candidate;
      objective = candidateObjective;
    }
  }
}

function refineLeafParametersWithFinalBudget(
  generator,
  source,
  sourceAnalysis,
  initial,
  leafCounts,
  foliage,
  triangleBudget
) {
  const target = sourceLeafFeatures(sourceAnalysis);
  if (Number(sourceAnalysis.inferredRules?.leaves?.cards ?? 0) === 0) {
    const geometry = generator.generateProceduralTreeGeometry(
      source,
      toLeafCountTuning(leafCounts),
      initial,
      foliage,
      triangleBudget
    );
    const branchSegments = meshBranchSegments(geometry.lods[0].trunk);
    return {
      distributionTuning: initial,
      geometry,
      objective: leafObjective(target, generatedLeafFeatures(geometry, source.size, branchSegments), true),
      evaluatedCandidates: 1
    };
  }
  let distributionTuning = { ...initial };
  let geometry = generator.generateProceduralTreeGeometry(
    source,
    toLeafCountTuning(leafCounts),
    distributionTuning,
    foliage,
    triangleBudget
  );
  const branchSegments = meshBranchSegments(geometry.lods[0].trunk);
  // A fine radial histogram is useful for guiding the broad search, but the public
  // acceptance contract uses radial quantiles. Keep the auxiliary diagnostic during
  // search, then switch to the exact reported rules for final refinement.
  let includeAuxiliaryRadiusHistogram = true;
  let objective = leafObjective(
    target,
    generatedLeafFeatures(geometry, source.size, branchSegments),
    true,
    includeAuxiliaryRadiusHistogram
  );
  let evaluatedCandidates = 1;
  const evaluate = (candidate) => {
    const candidateGeometry = generator.generateProceduralTreeGeometry(
      source,
      toLeafCountTuning(leafCounts),
      candidate,
      foliage,
      triangleBudget
    );
    const candidateObjective = leafObjective(
      target,
      generatedLeafFeatures(candidateGeometry, source.size, branchSegments),
      true,
      includeAuxiliaryRadiusHistogram
    );
    evaluatedCandidates++;
    if (candidateObjective < objective) {
      distributionTuning = candidate;
      geometry = candidateGeometry;
      objective = candidateObjective;
    }
    return candidateObjective;
  };
  for (const leafSeed of candidateSeeds(distributionTuning.leafSeed ?? distributionTuning.geometrySeed, 8)) {
    evaluate({ ...distributionTuning, leafSeed });
  }
  for (const leafDistributionInfluencePercent of [0, 25, 50, 75, 100]) {
    evaluate({ ...distributionTuning, leafDistributionInfluencePercent });
  }
  const initialDensityCurve = [...distributionTuning.leafDensityByHeightProfile];
  for (const slope of [-1.5, -0.75, 0, 0.75, 1.5]) {
    evaluate({
      ...distributionTuning,
      leafDensityByHeightProfile: initialDensityCurve.map((value, knot) =>
        clamp(value * Math.exp(slope * (knot / Math.max(initialDensityCurve.length - 1, 1) - 0.5)), 0.01, 10)
      )
    });
  }
  for (const [key, offsets, lower, upper] of [
    ["leafDownAngleDegrees", [-18, 0, 18], -180, 180],
    ["leafDownAngleVariationDegrees", [-20, 0, 20], 0, 180],
    ["leafRollDegrees", [-45, 0, 45], -180, 180],
    ["leafAnchorOffsetPercentOfHeight", [-0.5, 0, 0.5], 0, 20],
    ["leafAnchorOffsetVariationPercent", [-30, 0, 30], 0, 100],
    ["leafLengthInfluencePercent", [-25, 0, 25], 0, 100],
    ["leafTerminalFractionPercent", [-15, 0, 15], 0, 100]
  ]) {
    const base = Number(distributionTuning[key] ?? 0);
    for (const offset of offsets) evaluate({ ...distributionTuning, [key]: clamp(base + offset, lower, upper) });
  }
  for (const multiplier of [0.5, 0.75, 1, 1.5, 2]) {
    evaluate({
      ...distributionTuning,
      leafProgressExponent: clamp(distributionTuning.leafProgressExponent * multiplier, 0.05, 4)
    });
  }
  for (let level = 0; level < 3; level++) {
    for (const offset of [-30, -15, 0, 15, 30]) {
      const values = [...distributionTuning.leafTerminalFractionPercentByLevel];
      values[level] = clamp(values[level] + offset, 0, 100);
      evaluate({ ...distributionTuning, leafTerminalFractionPercentByLevel: values });
    }
    for (const multiplier of [0.5, 1, 2]) {
      const values = [...distributionTuning.leafProgressExponentByLevel];
      values[level] = clamp(values[level] * multiplier, 0.05, 4);
      evaluate({ ...distributionTuning, leafProgressExponentByLevel: values });
    }
    for (const multiplier of [0.5, 1, 1.5]) {
      const values = [...distributionTuning.leafStartProgressVariationPercentByLevel];
      values[level] = clamp(values[level] * multiplier, 0, 100);
      evaluate({ ...distributionTuning, leafStartProgressVariationPercentByLevel: values });
    }
    for (const offset of [-15, -7.5, 0, 7.5, 15]) {
      const values = [...distributionTuning.leafStartProgressMinimumPercentByLevel];
      values[level] = clamp(
        values[level] + offset,
        0,
        distributionTuning.leafStartProgressMaximumPercentByLevel[level]
      );
      evaluate({ ...distributionTuning, leafStartProgressMinimumPercentByLevel: values });
    }
    for (const offset of [-15, -7.5, 0, 7.5, 15]) {
      const values = [...distributionTuning.leafStartProgressMaximumPercentByLevel];
      values[level] = clamp(
        values[level] + offset,
        distributionTuning.leafStartProgressMinimumPercentByLevel[level],
        100
      );
      evaluate({ ...distributionTuning, leafStartProgressMaximumPercentByLevel: values });
    }
    for (const multiplier of [0.5, 0.75, 1, 1.5, 2]) {
      const values = [...distributionTuning.leafStartProgressDistributionExponentByLevel];
      values[level] = clamp(values[level] * multiplier, 0.05, 4);
      evaluate({ ...distributionTuning, leafStartProgressDistributionExponentByLevel: values });
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let level = 0; level < 3; level++) {
      const baseStart = [...distributionTuning.leafStartProgressPercentByLevel];
      for (const offset of [-25, -15, -7.5, 0, 7.5, 15, 25]) {
        const startByLevel = [...baseStart];
        startByLevel[level] = clamp(baseStart[level] + offset, 0, 100);
        evaluate({ ...distributionTuning, leafStartProgressPercentByLevel: startByLevel });
      }
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let knot = 0; knot < distributionTuning.leafDensityByHeightProfile.length; knot++) {
      const baseCurve = [...distributionTuning.leafDensityByHeightProfile];
      for (const multiplier of [0.35, 0.5, 0.75, 1, 1.33, 2, 3]) {
        const curve = [...baseCurve];
        curve[knot] = clamp(baseCurve[knot] * multiplier, 0.01, 10);
        evaluate({ ...distributionTuning, leafDensityByHeightProfile: curve });
      }
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let level = 0; level < 3; level++) {
      const baseScale = [...distributionTuning.leafDensityScaleByLevel];
      for (const multiplier of [0.5, 0.75, 1, 1.33, 2]) {
        const scaleByLevel = [...baseScale];
        scaleByLevel[level] = clamp(baseScale[level] * multiplier, 0, 20);
        evaluate({ ...distributionTuning, leafDensityScaleByLevel: scaleByLevel });
      }
    }
  }
  // The controls above are coupled by the exact fixed-card selection. Revisit their
  // acceptance-facing coordinates after every density change so a better histogram
  // cannot silently regress attachment, terminal ratio, or per-stem allocation.
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const leafAnchorOffsetVariationPercent of [0, 25, 50, 75, 100]) {
      evaluate({ ...distributionTuning, leafAnchorOffsetVariationPercent });
    }
    for (const offset of [-1.5, -0.75, 0, 0.75, 1.5]) {
      evaluate({
        ...distributionTuning,
        leafAnchorOffsetPercentOfHeight: clamp(distributionTuning.leafAnchorOffsetPercentOfHeight + offset, 0, 20)
      });
    }
    for (const leafDistributionInfluencePercent of [0, 25, 50, 75, 100]) {
      evaluate({ ...distributionTuning, leafDistributionInfluencePercent });
    }
    for (const leafLengthInfluencePercent of [0, 25, 50, 75, 100]) {
      evaluate({ ...distributionTuning, leafLengthInfluencePercent });
    }
    for (let level = 0; level < 3; level++) {
      for (const value of [0, 15, 30, 45, 60, 75, 90, 100]) {
        const values = [...distributionTuning.leafTerminalFractionPercentByLevel];
        values[level] = value;
        evaluate({ ...distributionTuning, leafTerminalFractionPercentByLevel: values });
      }
      for (const value of [0.05, 0.1, 0.25, 0.5, 1, 2, 4]) {
        const values = [...distributionTuning.leafProgressExponentByLevel];
        values[level] = value;
        evaluate({ ...distributionTuning, leafProgressExponentByLevel: values });
      }
      for (const offset of [-15, -7.5, 0, 7.5, 15]) {
        const minimums = [...distributionTuning.leafStartProgressMinimumPercentByLevel];
        minimums[level] = clamp(
          minimums[level] + offset,
          0,
          distributionTuning.leafStartProgressMaximumPercentByLevel[level]
        );
        evaluate({ ...distributionTuning, leafStartProgressMinimumPercentByLevel: minimums });
        const maximums = [...distributionTuning.leafStartProgressMaximumPercentByLevel];
        maximums[level] = clamp(
          maximums[level] + offset,
          distributionTuning.leafStartProgressMinimumPercentByLevel[level],
          100
        );
        evaluate({ ...distributionTuning, leafStartProgressMaximumPercentByLevel: maximums });
      }
      for (const value of [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2]) {
        const values = [...distributionTuning.leafStartProgressDistributionExponentByLevel];
        values[level] = value;
        evaluate({ ...distributionTuning, leafStartProgressDistributionExponentByLevel: values });
      }
      const baseScale = [...distributionTuning.leafDensityScaleByLevel];
      for (const multiplier of [0.5, 0.75, 1, 1.33, 2]) {
        const values = [...baseScale];
        values[level] = clamp(baseScale[level] * multiplier, 0, 20);
        evaluate({ ...distributionTuning, leafDensityScaleByLevel: values });
      }
    }
    for (let knot = 0; knot < distributionTuning.leafDensityByHeightProfile.length; knot++) {
      const baseCurve = [...distributionTuning.leafDensityByHeightProfile];
      for (const multiplier of [0.5, 0.75, 1, 1.33, 2]) {
        const curve = [...baseCurve];
        curve[knot] = clamp(baseCurve[knot] * multiplier, 0.01, 10);
        evaluate({ ...distributionTuning, leafDensityByHeightProfile: curve });
      }
    }
  }
  // Iterative proportional fitting turns the measured height histogram into a generic
  // density-profile update. It changes only finite crown-density weights and therefore
  // remains independent of source vertex coordinates.
  for (let iteration = 0; iteration < 12; iteration++) {
    const actual = generatedLeafFeatures(geometry, source.size, branchSegments);
    const curve = distributionTuning.leafDensityByHeightProfile.map((value, knot) => {
      const bin = Math.min(
        target.leafHeightHistogram.length - 1,
        Math.round(
          (knot / Math.max(distributionTuning.leafDensityByHeightProfile.length - 1, 1)) *
            (target.leafHeightHistogram.length - 1)
        )
      );
      const correction = clamp((target.leafHeightHistogram[bin] + 1) / (actual.leafHeightHistogram[bin] + 1), 0.3, 3);
      return clamp(value * correction, 0.01, 10);
    });
    evaluate({ ...distributionTuning, leafDensityByHeightProfile: curve });
  }
  for (let pass = 0; pass < 2; pass++) {
    const baseAngle = distributionTuning.leafDownAngleDegrees;
    for (const offset of [-20, -10, -5, 0, 5, 10, 20]) {
      evaluate({ ...distributionTuning, leafDownAngleDegrees: clamp(baseAngle + offset, -180, 180) });
    }
    for (const leafDownAngleVariationDegrees of [0, 10, 20, 30, 40, 60, 90]) {
      evaluate({ ...distributionTuning, leafDownAngleVariationDegrees });
    }
    for (const leafAnchorOffsetVariationPercent of [0, 20, 40, 60, 80, 100]) {
      evaluate({ ...distributionTuning, leafAnchorOffsetVariationPercent });
    }
    const baseOffset = distributionTuning.leafAnchorOffsetPercentOfHeight;
    for (const offset of [-1, -0.5, -0.25, 0, 0.25, 0.5, 1]) {
      evaluate({
        ...distributionTuning,
        leafAnchorOffsetPercentOfHeight: clamp(baseOffset + offset, 0, 20)
      });
    }
  }
  includeAuxiliaryRadiusHistogram = false;
  objective = leafObjective(
    target,
    generatedLeafFeatures(geometry, source.size, branchSegments),
    true,
    includeAuxiliaryRadiusHistogram
  );
  // Final acceptance uses the reported rule vector, so revisit orientation and the
  // low-crown First boundary after dropping the auxiliary search histogram.
  for (let pass = 0; pass < 2; pass++) {
    for (let leafNormalCrownBlendPercent = 0; leafNormalCrownBlendPercent <= 100; leafNormalCrownBlendPercent += 10) {
      evaluate({ ...distributionTuning, leafNormalCrownBlendPercent });
    }
    for (let leafRollDegrees = -90; leafRollDegrees <= 90; leafRollDegrees += 15) {
      evaluate({ ...distributionTuning, leafRollDegrees });
    }
    for (let level = 0; level < 3; level++) {
      for (const offset of [-10, -5, -2.5, 0, 2.5, 5, 10]) {
        const minimums = [...distributionTuning.leafStartProgressMinimumPercentByLevel];
        minimums[level] = clamp(
          minimums[level] + offset,
          0,
          distributionTuning.leafStartProgressMaximumPercentByLevel[level]
        );
        evaluate({ ...distributionTuning, leafStartProgressMinimumPercentByLevel: minimums });
        const starts = [...distributionTuning.leafStartProgressPercentByLevel];
        starts[level] = clamp(starts[level] + offset, 0, 100);
        evaluate({ ...distributionTuning, leafStartProgressPercentByLevel: starts });
      }
    }
  }
  for (let step = 0; step <= 32; step++) {
    evaluate({ ...distributionTuning, leafAnchorOffsetPercentOfHeight: step * 0.25 });
  }
  for (const leafAnchorOffsetVariationPercent of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
    evaluate({ ...distributionTuning, leafAnchorOffsetVariationPercent });
  }
  const exactOffset = distributionTuning.leafAnchorOffsetPercentOfHeight;
  for (const offset of [-1, -0.5, -0.25, 0, 0.25, 0.5, 1]) {
    evaluate({
      ...distributionTuning,
      leafAnchorOffsetPercentOfHeight: clamp(exactOffset + offset, 0, 20)
    });
  }
  return { distributionTuning, geometry, objective, evaluatedCandidates };
}

function sourceSkeletonFeatures(source) {
  const height = Number(source.height);
  const trunk = source.branches.find((branch) => branch.level === 0);
  const level = (branchLevel, fallback) => {
    const branches = source.branches.filter((branch) => branch.level === branchLevel);
    return {
      ...fallback,
      endpointHeightRatioQuantiles: quantiles(
        branches.map((branch) => branch.points[branch.points.length - 1][1] / height)
      ),
      endpointRadiusRatioQuantiles: quantiles(
        branches.map((branch) => {
          const endpoint = branch.points[branch.points.length - 1];
          return Math.hypot(endpoint[0], endpoint[2]) / height;
        })
      )
    };
  };
  const trunkVerticalHeight = trunk
    ? maximum(
        trunk.points.map((point) => point[1]),
        height
      ) -
      minimum(
        trunk.points.map((point) => point[1]),
        0
      )
    : height;
  const trunkPathLength = trunk ? pathLength(trunk) : Number(source.inferredRules.trunk.pathLength);
  return {
    height,
    projectedMasks: projectedTubeMasks(source.branches, height, 0),
    trunkProjectedMasks: projectedTubeMasks(
      source.branches.filter((branch) => branch.level === 0),
      height,
      0,
      256
    ),
    trunk: {
      ...source.inferredRules.trunk,
      verticalHeight: trunkVerticalHeight,
      pathLength: trunkPathLength,
      curveToHeightRatio: trunkPathLength / Math.max(trunkVerticalHeight, Number.EPSILON)
    },
    primaryBranches: level(1, source.inferredRules.primaryBranches),
    secondaryBranches: level(2, source.inferredRules.secondaryBranches)
  };
}

function sourceLeafFeatures(source) {
  const height = Number(source.height);
  const leafCenters = source.leaves.map((leaf) => add(leaf.pivot, scale(leaf.up, 0.5)));
  const leafRules = source.inferredRules.leaves;
  const threeQuantiles = (values) => [values[0], values[2], values[4]];
  return {
    leafHeightQuantiles: quantiles(leafCenters.map((point) => point[1] / height)),
    leafRadiusQuantiles: quantiles(leafCenters.map((point) => Math.hypot(point[0], point[2]) / height)),
    leafHeightHistogram: histogram(
      leafCenters.map((point) => point[1] / height),
      12,
      0,
      1.05
    ),
    leafRadiusHistogram: histogram(
      leafCenters.map((point) => Math.hypot(point[0], point[2]) / height),
      8,
      0,
      0.35
    ),
    leafNormalAbsoluteUpQuantiles: quantiles(
      source.leaves.map((leaf) => Math.abs(normalize(cross(leaf.right, leaf.up))[1]))
    ),
    leafCardWidthQuantiles: quantiles(source.leaves.map((leaf) => magnitude(leaf.right))),
    leafCardHeightQuantiles: quantiles(source.leaves.map((leaf) => magnitude(leaf.up))),
    lowestLeafHeightRatio: Number(leafRules.lowestCenterHeightRatio),
    leafNearestBranchDistanceQuantiles: leafRules.nearestStemDistanceRatioQuantiles,
    leafBranchProgressQuantiles: threeQuantiles(leafRules.branchProgressQuantiles),
    leavesPerBranchQuantiles: threeQuantiles(leafRules.leavesPerStemQuantiles),
    terminalLeafRatio: Number(leafRules.terminalLeafRatio),
    leafBearingBranchRatio: Number(leafRules.leafBearingStemRatio)
  };
}

function generatedLeafFeatures(geometry, height, cachedBranchSegments) {
  const lod = geometry.lods[0];
  const centers = cardCenters(lod.crown.positions);
  const dimensions = cardDimensions(lod.crown.positions);
  const geometricAssociations = leafBranchAssociationFeatures(
    centers,
    cachedBranchSegments ?? meshBranchSegments(lod.trunk),
    height
  );
  return {
    leafHeightQuantiles: quantiles(centers.map((point) => point[1] / Math.max(height, 1e-9))),
    leafRadiusQuantiles: quantiles(centers.map((point) => Math.hypot(point[0], point[2]) / Math.max(height, 1e-9))),
    leafHeightHistogram: histogram(
      centers.map((point) => point[1] / Math.max(height, 1e-9)),
      12,
      0,
      1.05
    ),
    leafRadiusHistogram: histogram(
      centers.map((point) => Math.hypot(point[0], point[2]) / Math.max(height, 1e-9)),
      8,
      0,
      0.35
    ),
    leafNormalAbsoluteUpQuantiles: quantiles(cardNormals(lod.crown.positions).map((normal) => Math.abs(normal[1]))),
    leafCardWidthQuantiles: quantiles(dimensions.widths),
    leafCardHeightQuantiles: quantiles(dimensions.heights),
    ...geometricAssociations,
    leafBranchProgressQuantiles: lod.leafBranchProgressQuantiles ?? geometricAssociations.leafBranchProgressQuantiles,
    leavesPerBranchQuantiles: lod.leavesPerBranchQuantiles ?? geometricAssociations.leavesPerBranchQuantiles,
    terminalLeafRatio: lod.terminalLeafRatio ?? geometricAssociations.terminalLeafRatio,
    leafBearingBranchRatio: lod.leafBearingBranchRatio ?? geometricAssociations.leafBearingBranchRatio
  };
}

function createStageRuleComparisons(source, geometry, height) {
  const skeleton = sourceSkeletonFeatures(source);
  const leafTarget = sourceLeafFeatures(source);
  const leafActual = generatedLeafFeatures(geometry, height);
  const trunkRuleErrors = {
    verticalHeight: relativeError(skeleton.trunk.verticalHeight, geometry.structure.trunk.verticalHeight),
    pathLength: relativeError(skeleton.trunk.pathLength, geometry.structure.trunk.pathLength),
    curveToHeightRatio: relativeError(skeleton.trunk.curveToHeightRatio, geometry.structure.trunk.curveToHeightRatio),
    baseRadius: relativeError(skeleton.trunk.baseRadius, geometry.structure.trunk.baseRadius),
    tipRadius: relativeError(skeleton.trunk.tipRadius, geometry.structure.trunk.tipRadius)
  };
  const primaryBranchRuleErrors = levelRuleErrorSummary(skeleton.primaryBranches, geometry.structure.primaryBranches);
  const secondaryBranchRuleErrors = levelRuleErrorSummary(
    skeleton.secondaryBranches,
    geometry.structure.secondaryBranches
  );
  const leafRuleErrors = {
    leafCards: relativeError(source.inferredRules.leaves.cards, geometry.lods[0].leafCount),
    lowestLeafHeightRatio: relativeError(leafTarget.lowestLeafHeightRatio, leafActual.lowestLeafHeightRatio),
    leafHeightQuantiles: vectorNormalizedL1Error(leafTarget.leafHeightQuantiles, leafActual.leafHeightQuantiles),
    leafRadiusQuantiles: vectorNormalizedL1Error(leafTarget.leafRadiusQuantiles, leafActual.leafRadiusQuantiles),
    leafHeightHistogram: vectorNormalizedL1Error(leafTarget.leafHeightHistogram, leafActual.leafHeightHistogram),
    leafNormalAbsoluteUpQuantiles: vectorNormalizedL1Error(
      leafTarget.leafNormalAbsoluteUpQuantiles,
      leafActual.leafNormalAbsoluteUpQuantiles
    ),
    leafCardWidthQuantiles: vectorNormalizedL1Error(
      leafTarget.leafCardWidthQuantiles,
      leafActual.leafCardWidthQuantiles
    ),
    leafCardHeightQuantiles: vectorNormalizedL1Error(
      leafTarget.leafCardHeightQuantiles,
      leafActual.leafCardHeightQuantiles
    ),
    leafNearestBranchDistanceQuantiles: vectorNormalizedL1Error(
      leafTarget.leafNearestBranchDistanceQuantiles,
      leafActual.leafNearestBranchDistanceQuantiles
    ),
    leafBranchProgressQuantiles: vectorNormalizedL1Error(
      leafTarget.leafBranchProgressQuantiles,
      leafActual.leafBranchProgressQuantiles
    ),
    leavesPerBranchQuantiles: vectorNormalizedL1Error(
      leafTarget.leavesPerBranchQuantiles,
      leafActual.leavesPerBranchQuantiles
    ),
    terminalLeafRatio: relativeError(leafTarget.terminalLeafRatio, leafActual.terminalLeafRatio),
    leafBearingBranchRatio: relativeError(leafTarget.leafBearingBranchRatio, leafActual.leafBearingBranchRatio)
  };
  const stages = {
    trunk: stageRuleComparison(trunkRuleErrors),
    primaryBranches: stageRuleComparison(primaryBranchRuleErrors),
    secondaryBranches: stageRuleComparison(secondaryBranchRuleErrors),
    leaves: stageRuleComparison(leafRuleErrors)
  };
  return Object.fromEntries(COMPARISON_ORDER.map((stage) => [stage, stages[stage]]));
}

function levelRuleErrorSummary(target, actual) {
  return {
    count: relativeError(target.count, actual.count),
    rootHeightRatioQuantiles: maximumRelativeVectorError(
      target.rootHeightRatioQuantiles,
      actual.rootHeightRatioQuantiles
    ),
    pathLengthRatioQuantiles: maximumRelativeVectorError(
      target.pathLengthRatioQuantiles,
      actual.pathLengthRatioQuantiles
    ),
    rootRadiusRatioQuantiles: maximumRelativeVectorError(
      target.rootRadiusRatioQuantiles,
      actual.rootRadiusRatioQuantiles
    ),
    upAngleDegreesQuantiles: maximumRelativeVectorError(target.upAngleDegreesQuantiles, actual.upAngleDegreesQuantiles),
    endpointHeightRatioQuantiles: maximumRelativeVectorError(
      target.endpointHeightRatioQuantiles,
      actual.endpointHeightRatioQuantiles
    ),
    endpointRadiusRatioQuantiles: maximumRelativeVectorError(
      target.endpointRadiusRatioQuantiles,
      actual.endpointRadiusRatioQuantiles
    )
  };
}

function maximumRelativeVectorError(target, actual) {
  return Math.max(...vectorRelativeErrors(target, actual));
}

function stageRuleComparison(ruleErrors) {
  const flattenedErrors = Object.values(ruleErrors).flatMap((value) =>
    typeof value === "number" ? [value] : Object.values(value)
  );
  const ruleMaximumError = Math.max(...flattenedErrors);
  return { ruleErrors, ruleMaximumError, passesFivePercent: ruleMaximumError <= MAXIMUM_STAGE_ERROR };
}

function leafBranchAssociationFeatures(centers, branchSegments, height) {
  const inverseHeight = 1 / Math.max(height, Number.EPSILON);
  const nearestDistances = [];
  const branchProgresses = [];
  const leavesPerBranch = Array(branchSegments.length).fill(0);
  for (const center of centers) {
    let nearest = { distance: Number.POSITIVE_INFINITY, branchIndex: 0, progress: 0 };
    branchSegments.forEach((segment, branchIndex) => {
      const directionX = segment.tip[0] - segment.root[0];
      const directionY = segment.tip[1] - segment.root[1];
      const directionZ = segment.tip[2] - segment.root[2];
      const relativeX = center[0] - segment.root[0];
      const relativeY = center[1] - segment.root[1];
      const relativeZ = center[2] - segment.root[2];
      const lengthSquared = Math.max(
        directionX * directionX + directionY * directionY + directionZ * directionZ,
        Number.EPSILON
      );
      const progress = clamp(
        (relativeX * directionX + relativeY * directionY + relativeZ * directionZ) / lengthSquared,
        0,
        1
      );
      const distanceX = relativeX - directionX * progress;
      const distanceY = relativeY - directionY * progress;
      const distanceZ = relativeZ - directionZ * progress;
      const distance = Math.hypot(distanceX, distanceY, distanceZ);
      if (distance < nearest.distance) nearest = { distance, branchIndex, progress };
    });
    nearestDistances.push(nearest.distance * inverseHeight);
    branchProgresses.push(nearest.progress);
    leavesPerBranch[nearest.branchIndex]++;
  }
  return {
    lowestLeafHeightRatio: minimum(
      centers.map((center) => center[1] * inverseHeight),
      0
    ),
    leafNearestBranchDistanceQuantiles: quantiles(nearestDistances),
    leafBranchProgressQuantiles: [0.1, 0.5, 0.9].map((probability) => quantile(branchProgresses, probability)),
    leavesPerBranchQuantiles: [0.1, 0.5, 0.9].map((probability) => quantile(leavesPerBranch, probability)),
    terminalLeafRatio:
      branchProgresses.filter((progress) => progress >= 0.75).length / Math.max(branchProgresses.length, 1),
    leafBearingBranchRatio: leavesPerBranch.filter((count) => count > 0).length / Math.max(leavesPerBranch.length, 1)
  };
}

function trunkObjective(target, geometry, height) {
  const actual = geometry.structure;
  const quantitativeErrors = [
    relativeError(Number(target.trunk.verticalHeight), actual.trunk.verticalHeight),
    relativeError(Number(target.trunk.pathLength), actual.trunk.pathLength),
    relativeError(Number(target.trunk.curveToHeightRatio), actual.trunk.curveToHeightRatio),
    relativeError(Number(target.trunk.baseRadius) / height, actual.trunk.baseRadius / height),
    relativeError(Number(target.trunk.tipRadius) / height, actual.trunk.tipRadius / height)
  ];
  return Math.max(...quantitativeErrors);
}

function branchObjective(target, geometry) {
  const actual = geometry.structure;
  const errors = [
    ...levelErrors(target.primaryBranches, actual.primaryBranches),
    ...levelErrors(target.secondaryBranches, actual.secondaryBranches)
  ];
  const maximumError = Math.max(...errors);
  const meanError = errors.reduce((sum, error) => sum + error, 0) / errors.length;
  return maximumError * 1000 + meanError;
}

function branchLevelObjective(target, actual) {
  const errors = levelErrors(target, actual);
  const maximumError = Math.max(...errors);
  const meanError = errors.reduce((sum, error) => sum + error, 0) / errors.length;
  return maximumError * 1000 + meanError;
}

function levelErrors(target, actual) {
  return [
    relativeError(Number(target.count), actual.count),
    vectorNormalizedL1Error(target.rootHeightRatioQuantiles, actual.rootHeightRatioQuantiles),
    vectorNormalizedL1Error(target.pathLengthRatioQuantiles, actual.pathLengthRatioQuantiles),
    vectorNormalizedL1Error(target.rootRadiusRatioQuantiles, actual.rootRadiusRatioQuantiles),
    vectorNormalizedL1Error(target.upAngleDegreesQuantiles, actual.upAngleDegreesQuantiles),
    vectorNormalizedL1Error(target.endpointHeightRatioQuantiles, actual.endpointHeightRatioQuantiles),
    vectorNormalizedL1Error(target.endpointRadiusRatioQuantiles, actual.endpointRadiusRatioQuantiles)
  ];
}

function meshBranchSegments(mesh) {
  const adjacency = Array.from({ length: mesh.positions.length }, () => new Set());
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const triangle = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]];
    for (let corner = 0; corner < 3; corner++) {
      const left = triangle[corner];
      const right = triangle[(corner + 1) % 3];
      adjacency[left].add(right);
      adjacency[right].add(left);
    }
  }
  const visited = new Set();
  const result = [];
  for (let start = 0; start < adjacency.length; start++) {
    if (visited.has(start)) continue;
    const stack = [start];
    const component = [];
    visited.add(start);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const neighbor of adjacency[current]) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }
    const points = component.map((index) => mesh.positions[index]);
    const minimumHeight = Math.min(...points.map((point) => point[1]));
    const maximumHeight = Math.max(...points.map((point) => point[1]));
    const rootLimit = minimumHeight + Math.max((maximumHeight - minimumHeight) * 0.02, 1e-5);
    const rootPoints = points.filter((point) => point[1] <= rootLimit);
    const root = scale(
      rootPoints.reduce((sum, point) => add(sum, point), [0, 0, 0]),
      1 / rootPoints.length
    );
    const tip = points.reduce((farthest, point) =>
      squaredDistance(point, root) > squaredDistance(farthest, root) ? point : farthest
    );
    result.push({ root, tip });
  }
  return result;
}

function projectedBranchError(sourceMasks, reconstructedBranches, height, resolution = 96) {
  let best = Number.POSITIVE_INFINITY;
  for (let yaw = 0; yaw < 360; yaw += 5) {
    const reconstructedMasks = projectedTubeMasks(reconstructedBranches, height, degreesToRadians(yaw), resolution);
    const error = Math.max(
      ...reconstructedMasks.map((mask, view) => 1 - tolerantMaskSimilarity(sourceMasks[view], mask, 1, resolution))
    );
    if (error < best) best = error;
  }
  return best;
}

function meshBranchPolylines(lod) {
  const branches = [];
  let vertexOffset = 0;
  for (let level = 0; level < 3; level++) {
    const sides = lod.radialSegments[level];
    const segmentCount = lod.curveSegments[level];
    for (let branchIndex = 0; branchIndex < lod.branchCounts[level]; branchIndex++) {
      const points = [];
      const radii = [];
      for (let ring = 0; ring <= segmentCount; ring++) {
        const ringStart = vertexOffset + ring * sides;
        const center = scale(
          Array.from({ length: sides }, (_, side) => lod.trunk.positions[ringStart + side]).reduce(
            (sum, point) => add(sum, point),
            [0, 0, 0]
          ),
          1 / sides
        );
        points.push(center);
        radii.push(
          Array.from({ length: sides }, (_, side) =>
            Math.sqrt(squaredDistance(lod.trunk.positions[ringStart + side], center))
          ).reduce((sum, radius) => sum + radius, 0) / sides
        );
      }
      branches.push({ points, radii });
      vertexOffset += (segmentCount + 1) * sides;
    }
  }
  return branches;
}

function projectedTubeMasks(branches, height, yaw, resolution = 96) {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const project = (point, view) => {
    const x = point[0] * cosine - point[2] * sine;
    const z = point[0] * sine + point[2] * cosine;
    const horizontal = view === 0 ? x : view === 1 ? z : (x + z) * Math.SQRT1_2;
    return [
      Math.round(((horizontal / height + 0.58) / 1.16) * (resolution - 1)),
      Math.round((point[1] / height / 1.16) * (resolution - 1))
    ];
  };
  return [0, 1, 2].map((view) => {
    const mask = new Set();
    for (const branch of branches) {
      for (let segment = 0; segment < branch.points.length - 1; segment++) {
        const root = project(branch.points[segment], view);
        const tip = project(branch.points[segment + 1], view);
        const rootRadius = (branch.radii[segment] / height / 1.16) * (resolution - 1);
        const tipRadius = (branch.radii[segment + 1] / height / 1.16) * (resolution - 1);
        const steps = Math.max(Math.abs(tip[0] - root[0]), Math.abs(tip[1] - root[1]), 1);
        for (let step = 0; step <= steps; step++) {
          const weight = step / steps;
          const x = Math.round(root[0] + (tip[0] - root[0]) * weight);
          const y = Math.round(root[1] + (tip[1] - root[1]) * weight);
          const radius = Math.max(0.6, rootRadius * (1 - weight) + tipRadius * weight);
          const extent = Math.ceil(radius);
          for (let offsetY = -extent; offsetY <= extent; offsetY++) {
            for (let offsetX = -extent; offsetX <= extent; offsetX++) {
              if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
              const sampleX = x + offsetX;
              const sampleY = y + offsetY;
              if (sampleX >= 0 && sampleX < resolution && sampleY >= 0 && sampleY < resolution) {
                mask.add(sampleY * resolution + sampleX);
              }
            }
          }
        }
      }
    }
    return mask;
  });
}

function tolerantMaskSimilarity(left, right, radius, resolution = 96) {
  const dilate = (mask) => {
    const result = new Set(mask);
    for (const value of mask) {
      const x = value % resolution;
      const y = Math.floor(value / resolution);
      for (let offsetY = -radius; offsetY <= radius; offsetY++) {
        for (let offsetX = -radius; offsetX <= radius; offsetX++) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX >= 0 && nextX < resolution && nextY >= 0 && nextY < resolution) {
            result.add(nextY * resolution + nextX);
          }
        }
      }
    }
    return result;
  };
  const leftDilated = dilate(left);
  const rightDilated = dilate(right);
  let matchedLeft = 0;
  let matchedRight = 0;
  for (const value of left) if (rightDilated.has(value)) matchedLeft++;
  for (const value of right) if (leftDilated.has(value)) matchedRight++;
  return (matchedLeft + matchedRight) / Math.max(left.size + right.size, 1);
}

function leafObjective(target, actual, includeAssociations = false, includeAuxiliaryRadiusHistogram = false) {
  const distributionError =
    vectorMeanAbsoluteError(target.leafHeightQuantiles, actual.leafHeightQuantiles) * 2 +
    vectorMeanAbsoluteError(target.leafRadiusQuantiles, actual.leafRadiusQuantiles) * 2 +
    vectorNormalizedL1Error(target.leafHeightHistogram, actual.leafHeightHistogram) * 4 +
    vectorNormalizedL1Error(target.leafRadiusHistogram, actual.leafRadiusHistogram) * 2 +
    vectorMeanAbsoluteError(target.leafNormalAbsoluteUpQuantiles, actual.leafNormalAbsoluteUpQuantiles) +
    vectorMeanAbsoluteError(target.leafCardWidthQuantiles, actual.leafCardWidthQuantiles) +
    vectorMeanAbsoluteError(target.leafCardHeightQuantiles, actual.leafCardHeightQuantiles);
  if (!includeAssociations) return distributionError;
  const acceptanceErrors = [
    vectorNormalizedL1Error(target.leafHeightQuantiles, actual.leafHeightQuantiles),
    vectorNormalizedL1Error(target.leafRadiusQuantiles, actual.leafRadiusQuantiles),
    vectorNormalizedL1Error(target.leafHeightHistogram, actual.leafHeightHistogram),
    vectorNormalizedL1Error(target.leafNormalAbsoluteUpQuantiles, actual.leafNormalAbsoluteUpQuantiles),
    relativeError(target.lowestLeafHeightRatio, actual.lowestLeafHeightRatio),
    vectorNormalizedL1Error(target.leafNearestBranchDistanceQuantiles, actual.leafNearestBranchDistanceQuantiles),
    vectorNormalizedL1Error(target.leafBranchProgressQuantiles, actual.leafBranchProgressQuantiles),
    vectorNormalizedL1Error(target.leavesPerBranchQuantiles, actual.leavesPerBranchQuantiles),
    relativeError(target.terminalLeafRatio, actual.terminalLeafRatio),
    relativeError(target.leafBearingBranchRatio, actual.leafBearingBranchRatio)
  ];
  if (includeAuxiliaryRadiusHistogram) {
    acceptanceErrors.push(vectorNormalizedL1Error(target.leafRadiusHistogram, actual.leafRadiusHistogram));
  }
  const maximumError = Math.max(...acceptanceErrors);
  const meanError = acceptanceErrors.reduce((sum, error) => sum + error, 0) / acceptanceErrors.length;
  return maximumError * 10 + meanError + distributionError * 0.1;
}

function inferFoliageTuning(source, probe) {
  const targetWidth = median(source.inferredRules.leaves.cardWidthQuantiles, 0.1);
  const targetHeight = median(source.inferredRules.leaves.cardHeightQuantiles, 0.1);
  const dimensions = cardDimensions(probe.lods[0].crown.positions);
  const probeWidth = median(dimensions.widths, targetWidth);
  const probeHeight = median(dimensions.heights, targetHeight);
  const widthScale = clamp(targetWidth / Math.max(probeWidth, 1e-9), 0.01, 3);
  const heightScale = clamp(targetHeight / Math.max(probeHeight, 1e-9), 0.01, 3);
  const widthRemainder = Math.max(0, targetWidth - probeWidth * widthScale);
  const heightRemainder = Math.max(0, targetHeight - probeHeight * heightScale);
  return {
    widthScale,
    heightScale,
    additiveHalfExtent: Math.max(widthRemainder, heightRemainder) * 0.5,
    lodScales: [1, 1, 1, 1]
  };
}

function deriveLeafCounts(source, maximumTrianglesPerLod) {
  const sourceLeafCount = Number(source.inferredRules?.leaves?.cards ?? 0);
  if (!Number.isInteger(sourceLeafCount) || sourceLeafCount < 0 || source.lodLeafCounts?.length !== 3) {
    throw new Error("Source analysis requires source leaf cards and three leaf LOD counts");
  }
  if (sourceLeafCount === 0) return [0, 0, 0];
  return source.lodBranchCounts.map((branchCounts, lodIndex) => {
    const stemCount = branchCounts.reduce(sum, 0);
    const minimumBranchTriangles = stemCount * 6;
    const maximumTriangles = maximumTrianglesPerLod[lodIndex];
    const leafCapacity = Math.floor((maximumTriangles - minimumBranchTriangles) / 2);
    if (leafCapacity < 1)
      throw new Error(`LOD${lodIndex} cannot fit one leaf card inside ${maximumTriangles} triangles`);
    return Math.min(Number(source.lodLeafCounts[lodIndex]), sourceLeafCount, leafCapacity);
  });
}

function toLeafCountTuning(counts) {
  return { lod0Count: counts[0], lod1Count: counts[1], lod2Count: counts[2], lod3Count: counts[3] };
}

function relativeBranchAngles(branches, byId) {
  return branches.flatMap((branch) => {
    const support = byId.get(branch.support);
    if (!support || branch.points.length < 2 || support.points.length < 2) return [];
    const branchDirection = normalize(subtract(branch.points[1], branch.points[0]));
    const supportDirection = polylineTangent(support.points, Number(branch.attachmentProgress));
    return [radiansToDegrees(Math.acos(clamp(dot(branchDirection, supportDirection), -1, 1)))];
  });
}

function relativeBranchAzimuthSamples(branches, byId, height) {
  return branches.flatMap((branch) => {
    const azimuth = relativeBranchAzimuth(branch, byId);
    return azimuth === undefined
      ? []
      : [[branch.points[0][1] / Math.max(height, Number.EPSILON), radiansToDegrees(azimuth)]];
  });
}

function relativeBranchAzimuth(branch, byId) {
  const support = byId.get(branch.support);
  if (!support || branch.points.length < 2 || support.points.length < 2) return undefined;
  const tangent = polylineTangent(support.points, Number(branch.attachmentProgress));
  // Generator azimuth is an initial-condition parameter. Measuring the full chord here
  // folds subsequent curve/gravity into the phyllotaxy mode and makes inversion apply
  // the same bend twice.
  const direction = normalize(subtract(branch.points[1], branch.points[0]));
  const radial = normalize(subtract(direction, scale(tangent, dot(direction, tangent))));
  const reference = Math.abs(tangent[1]) < 0.96 ? [0, 1, 0] : [1, 0, 0];
  const first = normalize(cross(tangent, reference));
  const second = normalize(cross(tangent, first));
  return Math.atan2(dot(radial, second), dot(radial, first));
}

function signedGeneratorCurveSamples(branches, byId) {
  return branches.flatMap((branch) => {
    const support = byId.get(branch.support);
    if (!support || branch.points.length < 2 || support.points.length < 2) return [];
    const parentTangent = polylineTangent(support.points, Number(branch.attachmentProgress));
    const initial = normalize(subtract(branch.points[1], branch.points[0]));
    const chord = normalize(subtract(branch.points[branch.points.length - 1], branch.points[0]));
    const radial = normalize(subtract(initial, scale(parentTangent, dot(initial, parentTangent))));
    const bendAxis = normalize(cross(parentTangent, radial));
    const signedChordBend = Math.atan2(dot(bendAxis, cross(initial, chord)), dot(initial, chord));
    // A constant-curvature polyline's chord turns by approximately half the total
    // tangent rotation, which is the generator's curve parameter.
    return [clamp(2 * radiansToDegrees(signedChordBend), -360, 360)];
  });
}

function residualScalarVariation(values) {
  if (!values.length) return 0;
  const center = median(values, 0);
  const rms = Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length);
  return clamp(rms * Math.sqrt(3), 0, 180);
}

function inferCircularMixture(angles) {
  if (!angles.length) return { modes: [0, 0, 0], weights: [1, 0, 0], variationDegrees: 0 };
  const normalized = angles.map((angle) => ((angle % 360) + 360) % 360).sort((left, right) => left - right);
  let cut = 0;
  let largestGap = -1;
  for (let index = 0; index < normalized.length; index++) {
    const next = index + 1 < normalized.length ? normalized[index + 1] : normalized[0] + 360;
    if (next - normalized[index] > largestGap) {
      largestGap = next - normalized[index];
      cut = (index + 1) % normalized.length;
    }
  }
  const unwrapped = Array.from({ length: normalized.length }, (_, offset) => {
    const index = (cut + offset) % normalized.length;
    return normalized[index] + (index < cut ? 360 : 0);
  });
  let best;
  for (let count = 1; count <= Math.min(3, unwrapped.length); count++) {
    let centers = Array.from({ length: count }, (_, index) => quantile(unwrapped, (index + 0.5) / count));
    let groups = [];
    for (let iteration = 0; iteration < 40; iteration++) {
      groups = Array.from({ length: count }, () => []);
      for (const value of unwrapped) {
        let selected = 0;
        for (let center = 1; center < centers.length; center++) {
          if (Math.abs(value - centers[center]) < Math.abs(value - centers[selected])) selected = center;
        }
        groups[selected].push(value);
      }
      if (groups.some((group) => group.length === 0)) break;
      const next = groups.map((group) => group.reduce((sum, value) => sum + value, 0) / group.length);
      if (next.every((value, index) => Math.abs(value - centers[index]) < 1e-8)) break;
      centers = next;
    }
    if (groups.some((group) => group.length === 0)) continue;
    const residual = groups.reduce(
      (sum, group, index) => sum + group.reduce((local, value) => local + (value - centers[index]) ** 2, 0),
      0
    );
    const descriptionLength =
      unwrapped.length * Math.log(Math.max(residual / unwrapped.length, 1e-9)) + 2 * count * Math.log(unwrapped.length);
    if (!best || descriptionLength < best.descriptionLength) {
      best = { centers, groups, residual, descriptionLength };
    }
  }
  const modes = best.centers.map((angle) => ((((angle + 180) % 360) + 360) % 360) - 180);
  const weights = best.groups.map((group) => group.length / unwrapped.length);
  while (modes.length < 3) {
    modes.push(modes[modes.length - 1]);
    weights.push(0);
  }
  return {
    modes,
    weights,
    variationDegrees: clamp(Math.sqrt(best.residual / unwrapped.length) * Math.sqrt(3), 0, 180)
  };
}

function unwrapAngleSamples(samples) {
  const sorted = [...samples].sort((left, right) => left[0] - right[0]);
  const result = [];
  for (const [position, angle] of sorted) {
    if (result.length === 0) {
      result.push([position, angle]);
      continue;
    }
    const previous = result[result.length - 1][1];
    let unwrapped = angle;
    while (unwrapped - previous > 180) unwrapped -= 360;
    while (unwrapped - previous < -180) unwrapped += 360;
    result.push([position, unwrapped]);
  }
  const mean = result.reduce((sum, sample) => sum + sample[1], 0) / Math.max(result.length, 1);
  const winding = Math.round(mean / 360) * 360;
  return result.map(([position, angle]) => [position, angle - winding]);
}

function residualVariationDegrees(positions, values, curve) {
  if (!values.length) return 0;
  const rms = Math.sqrt(
    values.reduce((sum, value, index) => {
      const residual = value - sampleFittedCurve(curve, positions[index]);
      return sum + residual * residual;
    }, 0) / values.length
  );
  return clamp(rms * Math.sqrt(3), 0, 180);
}

function residualPercentOfCurve(samples, curve) {
  if (!samples.length) return 0;
  const normalizedResiduals = samples.map(([position, value]) => {
    const expected = sampleFittedCurve(curve, position);
    return (value - expected) / Math.max(Math.abs(expected), Number.EPSILON);
  });
  const rms = Math.sqrt(
    normalizedResiduals.reduce((sum, residual) => sum + residual * residual, 0) / normalizedResiduals.length
  );
  // signedVariation is uniform in [-variation,+variation], whose RMS is variation / sqrt(3).
  return clamp(rms * Math.sqrt(3) * 100, 0, 100);
}

function sampleFittedCurve(curve, progress) {
  const clamped = clamp(progress, 0, 1);
  let upper = PARENT_CURVE_KNOTS.findIndex((knot) => knot >= clamped);
  if (upper <= 0) return curve[0];
  if (upper < 0) return curve[curve.length - 1];
  const lower = upper - 1;
  const interval = PARENT_CURVE_KNOTS[upper] - PARENT_CURVE_KNOTS[lower];
  const weight = interval > 0 ? (clamped - PARENT_CURVE_KNOTS[lower]) / interval : 0;
  return curve[lower] * (1 - weight) + curve[upper] * weight;
}

function absoluteBranchUpAngles(branches) {
  return branches.map((branch) => {
    const chord = subtract(branch.points[branch.points.length - 1], branch.points[0]);
    return radiansToDegrees(Math.acos(clamp(chord[1] / Math.max(magnitude(chord), Number.EPSILON), -1, 1)));
  });
}

function inferLeafDownAngle(leaves, byId, fallback) {
  if (!Array.isArray(leaves)) return fallback;
  const angles = leaves.flatMap((leaf) => {
    const stem = byId.get(leaf.stem);
    if (!stem || stem.points.length < 2) return [];
    const up = normalize(leaf.up);
    const tangent = polylineTangent(stem.points, Number(leaf.progress));
    return [radiansToDegrees(Math.acos(clamp(dot(up, tangent), -1, 1)))];
  });
  return clamp(median(angles, fallback), -180, 180);
}

function empiricalDistributionCurve(values, scaleFactor = 1) {
  if (!values.length) return PARENT_CURVE_KNOTS.map((value) => value * scaleFactor);
  return PARENT_CURVE_KNOTS.map((probability) => quantile(values, probability) * scaleFactor);
}

function fitParentValueCurve(samples) {
  if (!samples.length) return PARENT_CURVE_KNOTS.map(() => 0);
  return PARENT_CURVE_KNOTS.map((knot) => {
    const ranked = samples
      .map(([position, value]) => ({ distance: Math.abs(position - knot), value }))
      .sort((left, right) => left.distance - right.distance);
    const local = ranked.filter((sample) => sample.distance <= 0.16);
    const selected = local.length >= 3 ? local : ranked.slice(0, Math.min(5, ranked.length));
    let weighted = 0;
    let weights = 0;
    for (const sample of selected) {
      const weight = 1 / Math.max(0.025, sample.distance) ** 2;
      weighted += sample.value * weight;
      weights += weight;
    }
    return weighted / Math.max(weights, Number.EPSILON);
  });
}

function inferChildRadiusByHeightCurve(branches, height) {
  const samples = branches.map((branch) => [
    branch.points[0][1] / Math.max(height, Number.EPSILON),
    (100 * Number(branch.radii[0])) / Math.max(height, Number.EPSILON)
  ]);
  return fitParentValueCurve(samples).map((value) => clamp(value, 0, 100));
}

function inferExtensionRadiusRetention(branches, byId) {
  const extendedStemIds = new Set(
    branches.flatMap((branch) => (byId.get(branch.support)?.level === branch.level ? [branch.support] : []))
  );
  const ratios = branches.flatMap((branch) =>
    extendedStemIds.has(branch.id)
      ? [Number(branch.radii.at(-1)) / Math.max(Number(branch.radii[0]), Number.EPSILON)]
      : []
  );
  return 100 * clamp(median(ratios, 1), 0, 1);
}

function inferExtensionLength(branches, byId) {
  const ratios = branches.flatMap((branch) => {
    const support = byId.get(branch.support);
    if (!support || support.level !== branch.level) return [];
    return [pathLength(branch) / Math.max(pathLength(support), Number.EPSILON)];
  });
  return {
    percentOfParent: clamp(100 * median(ratios, 1), 0.01, 200),
    variationPercent: spreadPercent(ratios)
  };
}

function inferStemTipRadiusPercent(branches) {
  const ratios = branches.map(
    (branch) => Number(branch.radii.at(-1)) / Math.max(Number(branch.radii[0]), Number.EPSILON)
  );
  return 100 * clamp(median(ratios, 0), 0, 1);
}

function inferLeafDensityCurve(source, height) {
  const heights = (source.leaves ?? []).map(
    (leaf) => (leaf.pivot[1] + leaf.up[1] * 0.5) / Math.max(height, Number.EPSILON)
  );
  if (!heights.length) return PARENT_CURVE_KNOTS.map(() => 1);
  const bandwidth = 0.085;
  const curve = PARENT_CURVE_KNOTS.map((knot) =>
    heights.reduce((sum, value) => sum + Math.exp(-0.5 * ((value - knot) / bandwidth) ** 2), 0)
  );
  const center = median(
    curve.filter((value) => value > Number.EPSILON),
    1
  );
  return curve.map((value) => clamp(value / Math.max(center, Number.EPSILON), 0.05, 8));
}

function inferLeafDensityProfile(source, height) {
  const heights = (source.leaves ?? []).map(
    (leaf) => (leaf.pivot[1] + leaf.up[1] * 0.5) / Math.max(height, Number.EPSILON)
  );
  const sampleCount = 12;
  if (!heights.length) return Array(sampleCount).fill(1);
  const bandwidth = 0.035;
  const profile = Array.from({ length: sampleCount }, (_, index) => {
    const knot = index / (sampleCount - 1);
    return heights.reduce((sum, value) => sum + Math.exp(-0.5 * ((value - knot) / bandwidth) ** 2), 0);
  });
  const center = median(
    profile.filter((value) => value > Number.EPSILON),
    1
  );
  return profile.map((value) => clamp(value / Math.max(center, Number.EPSILON), 0.01, 10));
}

function inferLeafDensityScaleByLevel(source) {
  const counts = new Map();
  for (const leaf of source.leaves ?? []) counts.set(leaf.stem, (counts.get(leaf.stem) ?? 0) + 1);
  const means = [0, 1, 2].map((level) => {
    const branches = source.branches.filter((branch) => branch.level === level);
    return branches.reduce((sum, branch) => sum + (counts.get(branch.id) ?? 0), 0) / Math.max(branches.length, 1);
  });
  const positive = means.filter((value) => value > Number.EPSILON);
  const baseline = median(positive, 1);
  return means.map((value) => clamp(value / Math.max(baseline, Number.EPSILON), 0, 20));
}

function inferLeafLengthInfluencePercent(source) {
  const counts = new Map();
  for (const leaf of source.leaves ?? []) counts.set(leaf.stem, (counts.get(leaf.stem) ?? 0) + 1);
  const samples = [];
  for (const level of [0, 1, 2]) {
    const branches = source.branches.filter((branch) => branch.level === level);
    const maximumLength = maximum(branches.map(pathLength), 1);
    const meanCount =
      branches.reduce((sum, branch) => sum + (counts.get(branch.id) ?? 0), 0) / Math.max(branches.length, 1);
    for (const branch of branches) {
      samples.push([pathLength(branch) / maximumLength, (counts.get(branch.id) ?? 0) / Math.max(meanCount, 1e-9)]);
    }
  }
  if (samples.length < 2) return 90;
  const meanX = samples.reduce((sum, sample) => sum + sample[0], 0) / samples.length;
  const meanY = samples.reduce((sum, sample) => sum + sample[1], 0) / samples.length;
  const variance = samples.reduce((sum, sample) => sum + (sample[0] - meanX) ** 2, 0);
  const slope =
    variance > Number.EPSILON
      ? samples.reduce((sum, sample) => sum + (sample[0] - meanX) * (sample[1] - meanY), 0) / variance
      : 0;
  const intercept = meanY - slope * meanX;
  const positiveSlope = Math.max(0, slope);
  const positiveIntercept = Math.max(0, intercept);
  return (100 * positiveSlope) / Math.max(positiveSlope + positiveIntercept, Number.EPSILON);
}

function inferLeafProgressExponent(source, byId, startsByLevel, selectedLevel) {
  const byStem = new Map();
  for (const leaf of source.leaves ?? []) {
    const leaves = byStem.get(leaf.stem) ?? [];
    leaves.push(Number(leaf.progress));
    byStem.set(leaf.stem, leaves);
  }
  const exponents = [];
  for (const [stemId, progresses] of byStem) {
    const level = byId.get(stemId)?.level;
    if (level === undefined || (selectedLevel !== undefined && level !== selectedLevel)) continue;
    const start = startsByLevel[level] / 100;
    const sorted = [...progresses].sort((left, right) => left - right);
    sorted.forEach((progress, index) => {
      if (progress >= 1 - 1e-6 || progress <= start + 1e-6) return;
      const unitProgress = (progress - start) / Math.max(1 - start, Number.EPSILON);
      const unitRank = (index + 1) / sorted.length;
      const exponent = Math.log(unitProgress) / Math.log(unitRank);
      if (Number.isFinite(exponent)) exponents.push(exponent);
    });
  }
  return clamp(median(exponents, 1), 0.05, 4);
}

function inferParentRadiusLimitPercent(branches, byId) {
  const ratios = branches.flatMap((branch) => {
    const support = byId.get(branch.support);
    if (!support?.radii?.length || !branch.radii?.length) return [];
    const scaled = clamp(Number(branch.attachmentProgress), 0, 1) * (support.radii.length - 1);
    const lower = Math.floor(scaled);
    const upper = Math.ceil(scaled);
    const weight = scaled - lower;
    const supportRadius = Number(support.radii[lower]) * (1 - weight) + Number(support.radii[upper]) * weight;
    return supportRadius > Number.EPSILON ? [Number(branch.radii[0]) / supportRadius] : [];
  });
  return clamp(100 * maximum(ratios, 1), 1, 400);
}

function inferCrownHarmonic(branches, height) {
  const samples = branches.map((branch) => {
    const root = branch.points[0];
    const tip = branch.points[branch.points.length - 1];
    const delta = subtract(tip, root);
    return {
      azimuth: Math.atan2(delta[2], delta[0]),
      radius: Math.hypot(delta[0], delta[2]) / Math.max(height, Number.EPSILON),
      x: delta[0] / Math.max(height, Number.EPSILON),
      z: delta[2] / Math.max(height, Number.EPSILON)
    };
  });
  const meanRadius = samples.reduce((sum, sample) => sum + sample.radius, 0) / Math.max(samples.length, 1);
  let best = { count: 0, depth: 0, phaseDegrees: 0 };
  for (let count = 2; count <= 6; count++) {
    const cosine = samples.reduce((sum, sample) => sum + sample.radius * Math.cos(sample.azimuth * count), 0);
    const sine = samples.reduce((sum, sample) => sum + sample.radius * Math.sin(sample.azimuth * count), 0);
    const depth = clamp(
      (2 * Math.hypot(cosine, sine)) / Math.max(samples.length * meanRadius, Number.EPSILON),
      0,
      0.45
    );
    if (depth > best.depth) {
      best = {
        count,
        depth,
        phaseDegrees: radiansToDegrees(Math.atan2(-sine, cosine))
      };
    }
  }
  const xRms = Math.sqrt(samples.reduce((sum, sample) => sum + sample.x * sample.x, 0) / Math.max(samples.length, 1));
  const zRms = Math.sqrt(samples.reduce((sum, sample) => sum + sample.z * sample.z, 0) / Math.max(samples.length, 1));
  const meanAxis = Math.max((xRms + zRms) * 0.5, Number.EPSILON);
  return {
    ...best,
    asymmetryX: clamp(xRms / meanAxis - 1, -0.45, 0.8),
    asymmetryZ: clamp(zRms / meanAxis - 1, -0.45, 0.8)
  };
}

function inferBifurcationTuning(branches, byId) {
  const bendAngles = [];
  const balanceSamples = [];
  const progressBySupport = new Map();
  for (const branch of branches) {
    const support = byId.get(branch.support);
    if (!support || branch.points.length < 2 || support.points.length < 3) continue;
    const frame = bifurcationBendFrame(support.points, Number(branch.attachmentProgress));
    bendAngles.push(radiansToDegrees(frame.angle));
    const childDirection = normalize(subtract(branch.points[1], branch.points[0]));
    const childRadial = normalize(subtract(childDirection, scale(frame.tangent, dot(childDirection, frame.tangent))));
    if (magnitude(frame.oppositeRadial) > Number.EPSILON && magnitude(childRadial) > Number.EPSILON) {
      balanceSamples.push(clamp(dot(childRadial, frame.oppositeRadial), 0, 1));
    }
    const progresses = progressBySupport.get(branch.support) ?? [];
    progresses.push(Number(branch.attachmentProgress));
    progressBySupport.set(branch.support, progresses);
  }
  const spacings = [];
  for (const progresses of progressBySupport.values()) {
    progresses.sort((left, right) => left - right);
    for (let index = 1; index < progresses.length; index++) spacings.push(progresses[index] - progresses[index - 1]);
  }
  return {
    thresholdDegrees: clamp(minimum(bendAngles, 0), 0, 180),
    spacingPercent: clamp(100 * minimum(spacings, 0), 0, 100),
    balancePercent: clamp(100 * median(balanceSamples, 1), 0, 100)
  };
}

function inferSpineLateNoiseTuning(branches) {
  const profiles = [];
  const turnSamples = [];
  for (const branch of branches) {
    if (!Array.isArray(branch.points) || branch.points.length < 4) continue;
    const tangents = branch.points.slice(1).map((point, index) => normalize(subtract(point, branch.points[index])));
    const turns = tangents
      .slice(1)
      .map((tangent, index) => radiansToDegrees(Math.acos(clamp(dot(tangents[index], tangent), -1, 1))));
    const totalTurn = turns.reduce(sum, 0);
    const netTurn = radiansToDegrees(Math.acos(clamp(dot(tangents[0], tangents[tangents.length - 1]), -1, 1)));
    const medianTurn = median(turns, 0);
    const meanTurn = turns.reduce(sum, 0) / turns.length;
    const cumulative = [0];
    for (let index = 1; index < branch.points.length; index++) {
      cumulative.push(cumulative[index - 1] + magnitude(subtract(branch.points[index], branch.points[index - 1])));
    }
    for (let index = 0; index < turns.length; index++) {
      turnSamples.push([
        cumulative[index + 1] / Math.max(cumulative[cumulative.length - 1], Number.EPSILON),
        turns[index] / Math.max(meanTurn, Number.EPSILON)
      ]);
    }
    const significantPeaks = turns.filter(
      (turn, index) =>
        turn >= medianTurn &&
        turn >= (turns[index - 1] ?? Number.NEGATIVE_INFINITY) &&
        turn >= (turns[index + 1] ?? Number.NEGATIVE_INFINITY)
    ).length;
    profiles.push({ residualTurn: Math.max(0, totalTurn - netTurn), significantPeaks });
  }
  if (!profiles.length) {
    return { amountDegrees: 0, turbulence: 0, smoothPercent: 0, profilePercent: undefined };
  }
  return {
    amountDegrees: clamp(
      median(
        profiles.map((profile) => profile.residualTurn),
        0
      ),
      0,
      360
    ),
    turbulence: clamp(
      median(
        profiles.map((profile) => profile.significantPeaks / 2),
        0
      ),
      0,
      16
    ),
    smoothPercent: 0,
    profilePercent: fitParentValueCurve(turnSamples).map((value) => clamp(value * 100, 0, 400))
  };
}

function inferSpinePathHarmonics(branch, initialDirection = [0, 1, 0], azimuth = 0) {
  const points = branch.points;
  if (!Array.isArray(points) || points.length < 2) return undefined;
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    cumulative.push(cumulative[index - 1] + magnitude(subtract(points[index], points[index - 1])));
  }
  const pathLength = cumulative[cumulative.length - 1];
  const root = points[0];
  const firstAxis = radialAroundVector(initialDirection, azimuth);
  const secondAxis = normalize(cross(initialDirection, firstAxis));
  const basisRows = cumulative.map((distance) => spinePathHarmonicBasis(distance / pathLength));
  const fitAxis = (axis) =>
    solveLeastSquares(
      basisRows,
      points.map((point) => (100 * dot(subtract(point, root), axis)) / pathLength)
    ).map((value) => clamp(value, -200, 200));
  return [...fitAxis(firstAxis), ...fitAxis(secondAxis)];
}

function samplePolylineTangent(points, progress) {
  if (points.length < 2) return [0, 1, 0];
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    cumulative.push(cumulative[index - 1] + magnitude(subtract(points[index], points[index - 1])));
  }
  const target = clamp(progress, 0, 1) * cumulative.at(-1);
  let segment = 0;
  while (segment + 1 < cumulative.length - 1 && cumulative[segment + 1] < target) segment++;
  return normalize(subtract(points[segment + 1], points[segment]));
}

function samplePolylinePoint(points, progress) {
  if (points.length < 2) return points[0] ?? [0, 0, 0];
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    cumulative.push(cumulative[index - 1] + magnitude(subtract(points[index], points[index - 1])));
  }
  const target = clamp(progress, 0, 1) * cumulative.at(-1);
  let segment = 0;
  while (segment + 1 < cumulative.length - 1 && cumulative[segment + 1] < target) segment++;
  const segmentLength = cumulative[segment + 1] - cumulative[segment];
  const local = segmentLength > Number.EPSILON ? (target - cumulative[segment]) / segmentLength : 0;
  return add(points[segment], scale(subtract(points[segment + 1], points[segment]), local));
}

function radialAroundVector(direction, angle) {
  const tangent = normalize(direction);
  const reference = Math.abs(tangent[1]) < 0.96 ? [0, 1, 0] : [1, 0, 0];
  const first = normalize(cross(tangent, reference));
  const second = normalize(cross(tangent, first));
  return normalize(add(scale(first, Math.cos(angle)), scale(second, Math.sin(angle))));
}

function spinePathHarmonicBasis(progress) {
  const result = [progress];
  for (let harmonic = 1; harmonic <= 4; harmonic++) {
    const angle = Math.PI * 2 * harmonic * progress;
    result.push(Math.sin(angle), Math.cos(angle) - 1);
  }
  return result;
}

function solveLeastSquares(rows, values) {
  const size = rows[0].length;
  const matrix = Array.from({ length: size }, () => Array(size + 1).fill(0));
  for (let row = 0; row < rows.length; row++) {
    for (let left = 0; left < size; left++) {
      matrix[left][size] += rows[row][left] * values[row];
      for (let right = 0; right < size; right++) {
        matrix[left][right] += rows[row][left] * rows[row][right];
      }
    }
  }
  for (let diagonal = 0; diagonal < size; diagonal++) matrix[diagonal][diagonal] += 1e-10;
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const divisor = matrix[column][column];
    if (Math.abs(divisor) <= Number.EPSILON) continue;
    for (let entry = column; entry <= size; entry++) matrix[column][entry] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let entry = column; entry <= size; entry++) {
        matrix[row][entry] -= factor * matrix[column][entry];
      }
    }
  }
  return matrix.map((row) => row[size]);
}

function bifurcationBendFrame(points, progress) {
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    cumulative.push(cumulative[index - 1] + magnitude(subtract(points[index], points[index - 1])));
  }
  const target = clamp(progress, 0, 1) * cumulative.at(-1);
  let vertex = 1;
  for (let index = 2; index + 1 < points.length; index++) {
    if (Math.abs(cumulative[index] - target) < Math.abs(cumulative[vertex] - target)) vertex = index;
  }
  const incoming = normalize(subtract(points[vertex], points[vertex - 1]));
  const outgoing = normalize(subtract(points[vertex + 1], points[vertex]));
  const tangent = normalize(add(incoming, outgoing));
  const rawOpposite = subtract(incoming, outgoing);
  const rejected = subtract(rawOpposite, scale(tangent, dot(rawOpposite, tangent)));
  return {
    tangent,
    oppositeRadial: magnitude(rejected) > Number.EPSILON ? normalize(rejected) : [0, 0, 0],
    angle: Math.acos(clamp(dot(incoming, outgoing), -1, 1))
  };
}

function inferWhorlGenerator(branches, byId, height) {
  const samples = [...branches].sort((left, right) => left.attachmentProgress - right.attachmentProgress);
  const groupedBranches = [];
  for (const branch of samples) {
    const previousGroup = groupedBranches[groupedBranches.length - 1];
    const previous = previousGroup?.branches[previousGroup.branches.length - 1];
    const support = byId.get(branch.support);
    const previousSupport = previous && byId.get(previous.support);
    const sameSupport = previous && branch.support === previous.support && support === previousSupport;
    const axialSeparation = sameSupport
      ? Math.abs(Number(branch.attachmentProgress) - Number(previous.attachmentProgress)) * pathLength(support)
      : Number.POSITIVE_INFINITY;
    const overlappingRootIntervals =
      sameSupport && axialSeparation <= Number(branch.radii[0]) + Number(previous.radii[0]);
    if (overlappingRootIntervals) {
      previousGroup.branches.push(branch);
      previousGroup.center = median(
        previousGroup.branches.map((candidate) => candidate.attachmentProgress),
        0
      );
    } else {
      groupedBranches.push({ center: Number(branch.attachmentProgress), branches: [branch] });
    }
  }
  const sizes = groupedBranches.map((group) => group.branches.length);
  const size = Math.max(...sizes, 1);
  const spreads = groupedBranches.map((group) => {
    const progresses = group.branches.map((branch) => branch.attachmentProgress);
    return maximum(progresses, 0) - minimum(progresses, 0);
  });
  const attachmentCenters = groupedBranches.map((group) =>
    median(
      group.branches.map((branch) => branch.attachmentProgress),
      0
    )
  );
  const phaseSamples = groupedBranches.map((group) => {
    let cosine = 0;
    let sine = 0;
    for (const branch of group.branches) {
      const azimuth = relativeBranchAzimuth(branch, byId);
      if (azimuth === undefined) continue;
      cosine += Math.cos(azimuth * size);
      sine += Math.sin(azimuth * size);
    }
    return Math.atan2(sine, cosine) / size;
  });
  const phasePeriod = (Math.PI * 2) / size;
  const unwrappedPhases = phaseSamples.reduce((result, phase) => {
    if (result.length === 0) return [phase];
    const previous = result[result.length - 1];
    let selected = phase;
    for (let winding = -size * 2; winding <= size * 2; winding++) {
      const candidate = phase + winding * phasePeriod;
      if (Math.abs(candidate - previous) < Math.abs(selected - previous)) selected = candidate;
    }
    result.push(selected);
    return result;
  }, []);
  const phaseCurve = fitParentValueCurve(
    groupedBranches.map((group, index) => [group.center, radiansToDegrees(unwrappedPhases[index])])
  );
  let rotation = { stepDegrees: 137.5, variationDegrees: 0 };
  if (phaseSamples.length > 1) {
    let bestRotation;
    for (let stepDegrees = -180; stepDegrees <= 180; stepDegrees += 0.5) {
      const step = degreesToRadians(stepDegrees);
      let cosine = 0;
      let sine = 0;
      phaseSamples.forEach((phase, index) => {
        cosine += Math.cos((phase - index * step) * size);
        sine += Math.sin((phase - index * step) * size);
      });
      const basePhase = Math.atan2(sine, cosine) / size;
      const residuals = phaseSamples.map(
        (phase, index) =>
          Math.atan2(
            Math.sin((phase - basePhase - index * step) * size),
            Math.cos((phase - basePhase - index * step) * size)
          ) / size
      );
      const rms = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length);
      if (!bestRotation || rms < bestRotation.rms) bestRotation = { stepDegrees, rms };
    }
    rotation = {
      stepDegrees: bestRotation.stepDegrees,
      variationDegrees: clamp(radiansToDegrees(bestRotation.rms) * Math.sqrt(3), 0, 180 / size)
    };
  }
  return {
    size,
    count: groupedBranches.length,
    sizes,
    attachmentCenters,
    spread: clamp(median(spreads, 0), 0, 0.5),
    phaseCurve,
    attachmentCurve: empiricalDistributionCurve(attachmentCenters, 100),
    rotation
  };
}

function inferRotationGenerator(branches) {
  const azimuths = [...branches]
    .sort((left, right) => left.points[0][1] - right.points[0][1])
    .map((branch) => {
      const delta = subtract(branch.points[branch.points.length - 1], branch.points[0]);
      return Math.atan2(delta[2], delta[0]);
    });
  if (azimuths.length < 2) return { stepDegrees: 137.5, variationDegrees: 0 };
  let best = { stepDegrees: 0, phase: 0, residualDegrees: Number.POSITIVE_INFINITY };
  for (let stepDegrees = -180; stepDegrees <= 180; stepDegrees += 0.5) {
    const step = degreesToRadians(stepDegrees);
    let cosine = 0;
    let sine = 0;
    azimuths.forEach((azimuth, index) => {
      cosine += Math.cos(azimuth - index * step);
      sine += Math.sin(azimuth - index * step);
    });
    const phase = Math.atan2(sine, cosine);
    const residualDegrees = Math.sqrt(
      azimuths.reduce((sum, azimuth, index) => {
        const residual = Math.atan2(Math.sin(azimuth - phase - index * step), Math.cos(azimuth - phase - index * step));
        return sum + radiansToDegrees(residual) ** 2;
      }, 0) / azimuths.length
    );
    if (residualDegrees < best.residualDegrees) best = { stepDegrees, phase, residualDegrees };
  }
  return {
    stepDegrees: best.stepDegrees,
    variationDegrees: clamp(best.residualDegrees * Math.sqrt(3), 0, 180)
  };
}

function mixSeed(seed, role) {
  let value = seed >>> 0;
  for (let index = 0; index < role.length; index++) {
    value ^= role.charCodeAt(index);
    value = Math.imul(value, 16777619) >>> 0;
  }
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function polylineTangent(points, progress) {
  const lengths = [];
  let total = 0;
  for (let index = 0; index + 1 < points.length; index++) {
    total += magnitude(subtract(points[index + 1], points[index]));
    lengths.push(total);
  }
  const target = clamp(progress, 0, 1) * total;
  const segment = Math.max(
    0,
    lengths.findIndex((value) => value >= target)
  );
  return normalize(subtract(points[Math.min(segment + 1, points.length - 1)], points[segment]));
}

function curveDegrees(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 1) return 0;
  let low = 0;
  let high = Math.PI * 1.9;
  for (let iteration = 0; iteration < 40; iteration++) {
    const theta = (low + high) * 0.5;
    const arcToChord = theta / Math.max(2 * Math.sin(theta * 0.5), 1e-9);
    if (arcToChord < ratio) low = theta;
    else high = theta;
  }
  return clamp(radiansToDegrees((low + high) * 0.5), 0, 360);
}

function candidateSeeds(initial, count) {
  const result = [initial >>> 0];
  let value = initial >>> 0;
  while (result.length < count) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    result.push(value);
  }
  return result;
}

function pathLength(branch) {
  if (!branch?.points || branch.points.length < 2) return 0;
  let result = 0;
  for (let index = 0; index + 1 < branch.points.length; index++) {
    result += magnitude(subtract(branch.points[index + 1], branch.points[index]));
  }
  return result;
}

function cardCenters(positions) {
  const result = [];
  for (let index = 0; index < positions.length; index += 4) {
    result.push(
      [0, 1, 2].map((axis) => positions.slice(index, index + 4).reduce((sum, point) => sum + point[axis], 0) / 4)
    );
  }
  return result;
}

function cardDimensions(positions) {
  const widths = [];
  const heights = [];
  for (let index = 0; index < positions.length; index += 4) {
    widths.push(magnitude(subtract(positions[index + 3], positions[index])));
    heights.push(magnitude(subtract(positions[index + 1], positions[index])));
  }
  return { widths, heights };
}

function cardNormals(positions) {
  const result = [];
  for (let index = 0; index < positions.length; index += 4) {
    const right = subtract(positions[index + 3], positions[index]);
    const up = subtract(positions[index + 1], positions[index]);
    result.push(normalize(cross(right, up)));
  }
  return result;
}

function histogram(values, count, lower, upper) {
  const bins = Array(count).fill(0);
  for (const value of values) {
    const index = Math.min(count - 1, Math.max(0, Math.floor(((value - lower) / (upper - lower)) * count)));
    bins[index]++;
  }
  const total = Math.max(values.length, 1);
  return bins.map((value) => value / total);
}

function quantiles(values) {
  return [0.1, 0.25, 0.5, 0.75, 0.9].map((probability) => quantile(values, probability));
}

function quantile(values, probability) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function median(values, fallback = 0) {
  return values?.length ? quantile(values, 0.5) : fallback;
}

function minimum(values, fallback) {
  return values?.length ? Math.min(...values) : fallback;
}

function uniqueNumbers(values) {
  return [...new Set(values.filter(Number.isFinite).map((value) => Number(value.toFixed(9))))];
}

function maximum(values, fallback) {
  return values?.length ? Math.max(...values) : fallback;
}

function halfRange(values) {
  return values?.length ? (quantile(values, 0.9) - quantile(values, 0.1)) * 0.5 : 0;
}

function spreadPercent(values) {
  const center = Math.abs(median(values, 0));
  if (!values?.length || center <= 1e-9) return 0;
  return clamp((halfRange(values) / center) * 100, 0, 100);
}

function vectorMeanAbsoluteError(expected, actual) {
  return expected.reduce((sum, value, index) => sum + Math.abs(value - actual[index]), 0) / expected.length;
}

function vectorMeanRelativeError(expected, actual) {
  return expected.reduce((sum, value, index) => sum + relativeError(value, actual[index]), 0) / expected.length;
}

function vectorMaximumRelativeError(expected, actual) {
  return Math.max(...expected.map((value, index) => relativeError(value, actual[index])));
}

function vectorRelativeErrors(expected, actual) {
  return expected.map((value, index) => relativeError(value, actual[index]));
}

function vectorNormalizedL1Error(expected, actual) {
  const normalization = Math.max(
    expected.reduce((sum, value) => sum + Math.abs(value), 0),
    Number.EPSILON
  );
  return expected.reduce((sum, value, index) => sum + Math.abs(value - actual[index]), 0) / normalization;
}

function relativeError(expected, actual) {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), Number.EPSILON);
}

function add(left, right) {
  return left.map((value, axis) => value + right[axis]);
}

function subtract(left, right) {
  return left.map((value, axis) => value - right[axis]);
}

function scale(value, factor) {
  return value.map((component) => component * factor);
}

function magnitude(value) {
  return Math.hypot(...value);
}

function squaredDistance(left, right) {
  return left.reduce((sum, value, axis) => sum + (value - right[axis]) ** 2, 0);
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function normalize(value) {
  const length = magnitude(value);
  return length > 1e-9 ? scale(value, 1 / length) : [0, 1, 0];
}

function dot(left, right) {
  return left.reduce((sum, value, axis) => sum + value * right[axis], 0);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function clampDistributionValue(key, value) {
  if (key.includes("LengthPercentOfParent")) return clamp(value, 1, 200);
  if (key.includes("CurveVariationDegrees")) return clamp(value, 0, 360);
  if (key.includes("DownAngleDegrees")) return clamp(value, -180, 180);
  return value;
}

function radiansToDegrees(value) {
  return (value * 180) / Math.PI;
}

function clamp(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
}

function sum(left, right) {
  return left + right;
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function assertFiniteParameterRecipe(recipe) {
  const tuning = recipe?.distributionTuning;
  if (!tuning || typeof tuning !== "object" || Array.isArray(tuning)) {
    throw new Error("Procedural tree recipe requires a finite distribution parameter object");
  }
  const tuningKeys = Object.keys(tuning).sort();
  const publicKeys = [...PUBLIC_RECONSTRUCTION_DISTRIBUTION_KEYS].sort();
  if (tuningKeys.length !== publicKeys.length || tuningKeys.some((key, index) => key !== publicKeys[index])) {
    throw new Error("Procedural tree recipe contains hidden or non-editable fitted distribution parameters");
  }
  for (const [key, value] of Object.entries(tuning)) {
    if (value === undefined || typeof value === "string" || typeof value === "boolean") continue;
    if (typeof value === "number" && Number.isFinite(value)) continue;
    if (Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) continue;
    throw new Error(`Procedural tree parameter ${key} must be a scalar or a finite numeric parameter vector`);
  }
  const assertFiniteNodeValue = (value, label) => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(label + " must be finite");
      return;
    }
    if (typeof value === "string" || typeof value === "boolean" || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => assertFiniteNodeValue(entry, label + "[" + index + "]"));
      return;
    }
    if (!value || typeof value !== "object") throw new Error(label + " has an unsupported value");
    for (const [key, entry] of Object.entries(value)) {
      if (/(vertices|indices|normals|tangents|uvs|mesh|binary|base64|blob|buffer)/iu.test(key)) {
        throw new Error("Procedural tree recipe cannot contain baked mesh data: " + key);
      }
      assertFiniteNodeValue(entry, label + "." + key);
    }
  };
  assertFiniteNodeValue(recipe.structureParameters, "structureParameters");
}

function requiredArgument(name) {
  const value = argumentsByName.get(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function parseArguments(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || value === undefined) throw new Error(`Invalid argument ${name ?? ""}`);
    result.set(name.slice(2), value);
  }
  return result;
}
