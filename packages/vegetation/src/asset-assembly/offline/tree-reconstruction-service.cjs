const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { pipeline } = require("stream/promises");

const ASSET_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62})$/u;
const MAX_FBX_BYTES = 512 * 1024 * 1024;
const PIPELINE_TIMEOUT_MS = 10 * 60 * 1000;
const TREE_SOURCE_ANALYSIS_SCRIPT_PATH = path.resolve(__dirname, "extract-procedural-tree-geometry-blueprint.py");
const TREE_EVALUATION_SCRIPT_PATH = path.resolve(__dirname, "evaluate-tree-reconstruction.mjs");
const TREE_VISUAL_VALIDATION_SCRIPT_PATH = path.resolve(__dirname, "validate-procedural-tree-geometry.py");
const DEMO_ROOT = path.resolve(__dirname, "..");
const CANONICAL_DEMO_ROOT = DEMO_ROOT;
const TREE_RECONSTRUCTION_SOURCE_ROOT = path.resolve(CANONICAL_DEMO_ROOT, "source/reconstructions");
const PROCEDURAL_TREE_OUTPUT_ROOT = path.resolve(CANONICAL_DEMO_ROOT, "generated/procedural-trees");
const RUNTIME_PROCEDURAL_TREE_OUTPUT_ROOT = path.resolve(DEMO_ROOT, "generated/procedural-trees");
const PROCEDURAL_TREE_TRIANGLE_LIMIT = 4000;
const PROCEDURAL_TREE_PREFERRED_LOD0_TRIANGLES = 3000;
const PROCEDURAL_TREE_LOD_COUNT = 4;
const PROCEDURAL_TREE_LEVEL_COUNT = 3;
const PROCEDURAL_TREE_DIRECTION_MODE_COUNT = 3;
const PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT = 7;
const PROCEDURAL_TREE_SPINE_PATH_HARMONIC_COUNT = 4;
const PROCEDURAL_TREE_SPINE_PATH_PARAMETER_COUNT = 2 * (1 + PROCEDURAL_TREE_SPINE_PATH_HARMONIC_COUNT * 2);
const PROCEDURAL_TREE_LEAF_DENSITY_PROFILE_SAMPLE_COUNT = 12;
const PROCEDURAL_TREE_MAX_WHORL_COUNT = 64;
const TREE_COMPARISON_ERROR_LIMIT = 0.05;
const TREE_COMPARISON_ORDER = Object.freeze(["trunk", "primaryBranches", "secondaryBranches", "leaves"]);
const TREE_DIAGNOSTIC_FALLBACK = Object.freeze({
  maximumSamples: 1,
  productionRecipeAllowed: false,
  productionTokenAllowed: false,
  runtimeAllowed: false,
  requiredAction: "derive-generic-generator-rule-and-retry"
});
const PROCEDURAL_RECIPE_TOP_LEVEL_KEYS = Object.freeze([
  "schema",
  "assetId",
  "profile",
  "size",
  "distributionTuning",
  "leafCountTuning",
  "foliageTuning",
  "triangleBudget",
  "structureParameters"
]);
const PROCEDURAL_RECIPE_BAKED_PARAMETER_KEYS = new Set([
  "branchAuthoredStems",
  "twigAuthoredStems",
  "leafAuthoredCards",
  "leafCountByStem",
  "leafFirstProgressPercentByStem",
  "leafTerminalFractionPercentByStem",
  "leafProgressExponentByStem"
]);
const PROCEDURAL_RECIPE_SCALAR_PARAMETER_KEYS = new Set([
  "geometrySeed",
  "trunkSeed",
  "branchSeed",
  "twigSeed",
  "leafSeed",
  "trunkLateNoiseSeed",
  "branchLateNoiseSeed",
  "twigLateNoiseSeed",
  "trunkCount",
  "trunkLengthPercentOfHeight",
  "treeHeightVariationPercent",
  "trunkClearHeightPercentOfHeight",
  "trunkRadiusPercentOfHeight",
  "trunkTipRadiusPercentOfBase",
  "trunkRootFlare",
  "trunkRadiusVariationPercent",
  "trunkCurveSegments",
  "trunkCurveVariationDegrees",
  "trunkLateNoiseAmountDegrees",
  "trunkLateNoiseTurbulence",
  "trunkLateNoiseSmoothPercent",
  "trunkSplitAngleDegrees",
  "trunkSplitAngleVariationDegrees",
  "trunkRotateDegrees",
  "trunkRotateVariationDegrees",
  "branchCount",
  "branchGenerationMode",
  "branchBifurcationThresholdDegrees",
  "branchBifurcationSpacingPercentOfParent",
  "branchBifurcationBalancePercent",
  "branchBifurcationAlignPercent",
  "branchWhorlSize",
  "branchWhorlCount",
  "branchWhorlSpreadPercentOfParent",
  "branchExtensionPercent",
  "branchExtensionLengthPercentOfParent",
  "branchExtensionLengthVariationPercent",
  "branchForkPercent",
  "branchLengthPercentOfParent",
  "branchMaximumLengthPercentOfHeight",
  "branchLengthVariationPercent",
  "branchCurveSegments",
  "branchRadiusScalePercent",
  "branchTipRadiusPercentOfStart",
  "branchExtensionRadiusRetentionPercent",
  "branchParentRadiusLimitPercent",
  "branchCurveDegrees",
  "branchCurveBackDegrees",
  "branchCurveVariationDegrees",
  "branchLateNoiseAmountDegrees",
  "branchLateNoiseTurbulence",
  "branchLateNoiseSmoothPercent",
  "branchAttractionUp",
  "branchRotateDegrees",
  "branchRotateVariationDegrees",
  "branchDownAngleDegrees",
  "branchDownAngleVariationDegrees",
  "twigCount",
  "twigGenerationMode",
  "twigBifurcationThresholdDegrees",
  "twigBifurcationSpacingPercentOfParent",
  "twigBifurcationBalancePercent",
  "twigBifurcationAlignPercent",
  "twigExtensionPercent",
  "twigExtensionLengthPercentOfParent",
  "twigExtensionLengthVariationPercent",
  "twigForkPercent",
  "twigLengthPercentOfParent",
  "twigMaximumLengthPercentOfHeight",
  "twigLengthVariationPercent",
  "twigCurveSegments",
  "twigRadiusScalePercent",
  "twigTipRadiusPercentOfStart",
  "twigExtensionRadiusRetentionPercent",
  "twigParentRadiusLimitPercent",
  "twigCurveDegrees",
  "twigCurveBackDegrees",
  "twigCurveVariationDegrees",
  "twigLateNoiseAmountDegrees",
  "twigLateNoiseTurbulence",
  "twigLateNoiseSmoothPercent",
  "twigAttractionUp",
  "twigAttachmentEndPercentOfParent",
  "twigRotateDegrees",
  "twigRotateVariationDegrees",
  "twigDownAngleDegrees",
  "twigDownAngleVariationDegrees",
  "leafDistribution",
  "leafLengthInfluencePercent",
  "leafDistributionInfluencePercent",
  "leafTerminalFractionPercent",
  "leafProgressExponent",
  "leafDownAngleDegrees",
  "leafDownAngleVariationDegrees",
  "leafRotateDegrees",
  "leafRotateVariationDegrees",
  "leafSpacingPercent",
  "leafScalePercentOfHeight",
  "leafAspectRatio",
  "leafScaleTaperPercent",
  "leafScaleVariationPercent",
  "leafVariantSizeBlendPercent",
  "leafAnchorOffsetPercentOfHeight",
  "leafAnchorOffsetVariationPercent",
  "leafStartProgressPercentOfStem",
  "leafRollDegrees",
  "leafNormalCrownBlendPercent",
  "crownLobeCount",
  "crownLobeDepthPercent",
  "crownLobePhaseDegrees",
  "crownAsymmetryXPercent",
  "crownAsymmetryZPercent",
  "crownMaximumHeightPercentOfHeight"
]);
const PROCEDURAL_RECIPE_FIXED_VECTOR_LENGTHS = new Map([
  ["trunkLateNoiseByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["trunkPathHarmonicsPercentOfLength", PROCEDURAL_TREE_SPINE_PATH_PARAMETER_COUNT],
  ["branchWhorlPhaseByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["branchAttachmentProgressCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["branchLengthByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["branchDownAngleByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["branchRadiusByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["branchLateNoiseByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["branchPathHarmonicsPercentOfLength", PROCEDURAL_TREE_SPINE_PATH_PARAMETER_COUNT],
  ["branchAzimuthModesDegrees", PROCEDURAL_TREE_DIRECTION_MODE_COUNT],
  ["branchAzimuthModeWeights", PROCEDURAL_TREE_DIRECTION_MODE_COUNT],
  ["twigAttachmentProgressCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["twigLengthByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["twigDownAngleByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["twigRadiusByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["twigLateNoiseByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["twigPathHarmonicsPercentOfLength", PROCEDURAL_TREE_SPINE_PATH_PARAMETER_COUNT],
  ["twigAzimuthByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["twigAzimuthModesDegrees", PROCEDURAL_TREE_DIRECTION_MODE_COUNT],
  ["twigAzimuthModeWeights", PROCEDURAL_TREE_DIRECTION_MODE_COUNT],
  ["leafDensityScaleByLevel", PROCEDURAL_TREE_LEVEL_COUNT],
  ["leafTerminalFractionPercentByLevel", PROCEDURAL_TREE_LEVEL_COUNT],
  ["leafProgressExponentByLevel", PROCEDURAL_TREE_LEVEL_COUNT],
  ["leafDensityByHeightCurve", PROCEDURAL_TREE_PARENT_CURVE_KNOT_COUNT],
  ["leafDensityByHeightProfile", PROCEDURAL_TREE_LEAF_DENSITY_PROFILE_SAMPLE_COUNT],
  ["leafStartProgressPercentByLevel", PROCEDURAL_TREE_LEVEL_COUNT],
  ["leafStartProgressVariationPercentByLevel", PROCEDURAL_TREE_LEVEL_COUNT],
  ["leafStartProgressMinimumPercentByLevel", PROCEDURAL_TREE_LEVEL_COUNT],
  ["leafStartProgressMaximumPercentByLevel", PROCEDURAL_TREE_LEVEL_COUNT],
  ["leafStartProgressDistributionExponentByLevel", PROCEDURAL_TREE_LEVEL_COUNT]
]);
const PROCEDURAL_RECIPE_VARIABLE_VECTOR_KEYS = new Set(["branchWhorlSizes", "branchWhorlAttachmentProgressPercent"]);
const PROCEDURAL_RECIPE_GENERATION_MODES = new Set(["proportional", "steps", "interval", "bifurcation"]);

const PROCEDURAL_RECIPE_BAKED_KEY_PATTERN =
  /(authored|blueprint|controlpoints|vertices|indices|positions|normals|tangents|uvs|matrices|transforms|bones|skin|pointcloud|voxel|sdf|meshlets|geometrystream|binary|base64|blob|buffer)/iu;
const activeAssetIds = new Set();

function assertExactObjectKeys(value, requiredKeys, optionalKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}必须是对象`);
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const keys = Object.keys(value);
  const missing = requiredKeys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  const unknown = keys.filter((key) => !allowed.has(key));
  if (missing.length || unknown.length) {
    throw new Error(
      `${label}不符合闭合协议${missing.length ? `；缺少 ${missing.sort().join(", ")}` : ""}${
        unknown.length ? `；禁止未知字段 ${unknown.sort().join(", ")}` : ""
      }`
    );
  }
}

function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label}必须是有限数值`);
}

function assertFiniteNumberVector(value, expectedLength, label) {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new Error(`${label}必须是固定长度 ${expectedLength} 的参数向量`);
  }
  value.forEach((entry, index) => assertFiniteNumber(entry, `${label}[${index}]`));
}

function assertFinitePoint(value, label) {
  assertFiniteNumberVector(value, 3, label);
}

function assertTreeStructureParameters(value) {
  assertExactObjectKeys(value, ["version", "referenceSize", "height", "verticalHeight", "stems",
    "selectionStemIds", "leafBearingStemIds", "leafClusterCount", "leaves", "leafIdsByLod"], ["leafCountTargets", "canonicalStemIds"], "树结构参数");
  if (value.version !== 1 || !(value.referenceSize > 0) || !(value.height > 0)) throw new Error("树结构版本或尺寸无效");
  const finite = (entry) => {
    if (typeof entry === "number") return Number.isFinite(entry);
    if (Array.isArray(entry)) return entry.every(finite);
    if (entry && typeof entry === "object") return Object.values(entry).every(finite);
    return entry === null || typeof entry === "string" || typeof entry === "boolean";
  };
  if (!finite(value)) throw new Error("树结构参数必须有限");
  if (!Array.isArray(value.stems) || !Array.isArray(value.leaves)) throw new Error("树结构必须包含枝干和叶片数组");
  const stems = new Map(value.stems.map((stem) => [stem.id, stem]));
  if (stems.size !== value.stems.length || new Set(value.stems.map((stem) => stem.stableId)).size !== stems.size)
    throw new Error("树结构枝干 ID 重复");
  for (const stem of value.stems) {
    assertExactObjectKeys(stem, ["id", "stableId", "level", "parentId", "supportStemId", "length", "attachmentProgress",
      "points", "radii", "startRadius", "endRadius", "azimuth"], ["radialSegments", "axialSubdivisions", "tipCap"], "树结构枝干");
    if (!Array.isArray(stem.points) || stem.points.length < 2 || !Array.isArray(stem.radii) || stem.radii.length !== stem.points.length)
      throw new Error("枝干曲线和半径控制点不匹配");
    stem.points.forEach((point) => assertFinitePoint(point, "枝干曲线控制点"));
    if (stem.radii.some((radius) => radius < 0)) throw new Error("枝干半径不能为负数");
    const visited = new Set([stem.id]);
    let parent = stem.supportStemId;
    while (parent !== null) {
      if (!stems.has(parent) || visited.has(parent)) throw new Error("枝干父级缺失或循环引用");
      visited.add(parent); parent = stems.get(parent).supportStemId;
    }
  }
  for (const ids of [value.selectionStemIds, value.canonicalStemIds ?? [], value.leafBearingStemIds]) {
    if (!Array.isArray(ids) || ids.some((id) => !stems.has(id))) throw new Error("树结构引用缺失枝干");
  }
  const leafIds = new Set(value.leaves.map((leaf) => leaf.id));
  if (leafIds.size !== value.leaves.length) throw new Error("叶片 ID 重复");
  for (const leaf of value.leaves) {
    assertExactObjectKeys(leaf, ["id", "clusterId", "stemId", "progress", "attachment", "stemAttachment",
      "clusterOutward", "right", "up", "width", "height", "variantIndex", "tone"], ["isTip"], "树结构叶片");
    if (!stems.has(leaf.stemId)) throw new Error("叶片引用缺失枝干");
    for (const key of ["attachment", "stemAttachment", "clusterOutward", "right", "up"]) assertFinitePoint(leaf[key], "叶片 " + key);
  }
  if (!Array.isArray(value.leafIdsByLod) || value.leafIdsByLod.length !== PROCEDURAL_TREE_LOD_COUNT) throw new Error("树结构 LOD 数量无效");
  let previous = leafIds;
  for (const ids of value.leafIdsByLod) {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some((id) => !previous.has(id))) throw new Error("树结构 LOD 必须逐级嵌套");
    previous = new Set(ids);
  }
}

function assertProceduralRecipeContainsNoBakedData(recipe) {
  assertExactObjectKeys(
    recipe,
    PROCEDURAL_RECIPE_TOP_LEVEL_KEYS,
    [],
    "程序化树配方"
  );
  if (recipe.schema !== "galacean/procedural-tree-recipe-v4") throw new Error("程序化树配方必须使用 v4 结构参数协议");
  assertTreeStructureParameters(recipe.structureParameters);
  if (typeof recipe.assetId !== "string" || !ASSET_ID_PATTERN.test(recipe.assetId)) {
    throw new Error("程序化树配方 Asset ID 无效");
  }
  if (!new Set(["white-birch", "small-maple"]).has(recipe.profile)) {
    throw new Error("程序化树配方基型无效");
  }
  assertFiniteNumber(recipe.size, "程序化树配方尺寸");
  if (recipe.size <= 0) throw new Error("程序化树配方尺寸必须为正数");

  const tuning = recipe.distributionTuning;
  if (!tuning || typeof tuning !== "object" || Array.isArray(tuning)) {
    throw new Error("程序化树配方必须提供有限参数对象");
  }
  const forbiddenKeys = Object.keys(tuning).filter(
    (key) => PROCEDURAL_RECIPE_BAKED_PARAMETER_KEYS.has(key) || PROCEDURAL_RECIPE_BAKED_KEY_PATTERN.test(key)
  );
  if (forbiddenKeys.length) {
    throw new Error(`严禁程序化树还原携带烘焙数据：${forbiddenKeys.sort().join(", ")}`);
  }
  for (const [key, value] of Object.entries(tuning)) {
    if (PROCEDURAL_RECIPE_SCALAR_PARAMETER_KEYS.has(key)) {
      if (key === "branchGenerationMode" || key === "twigGenerationMode") {
        if (!PROCEDURAL_RECIPE_GENERATION_MODES.has(value)) throw new Error(`程序化树参数 ${key} 的模式无效`);
      } else {
        assertFiniteNumber(value, `程序化树参数 ${key}`);
      }
      continue;
    }
    const expectedLength = PROCEDURAL_RECIPE_FIXED_VECTOR_LENGTHS.get(key);
    if (expectedLength !== undefined) {
      assertFiniteNumberVector(value, expectedLength, `程序化树参数 ${key}`);
      continue;
    }
    if (PROCEDURAL_RECIPE_VARIABLE_VECTOR_KEYS.has(key)) continue;
    throw new Error(`程序化树有限参数协议禁止未知字段 ${key}`);
  }
  const whorlSizes = tuning.branchWhorlSizes;
  const whorlPositions = tuning.branchWhorlAttachmentProgressPercent;
  if ((whorlSizes === undefined) !== (whorlPositions === undefined)) {
    throw new Error("程序化树轮生参数必须同时提供数量和位置");
  }
  if (whorlSizes !== undefined) {
    if (!Array.isArray(whorlSizes) || whorlSizes.length < 1 || whorlSizes.length > PROCEDURAL_TREE_MAX_WHORL_COUNT) {
      throw new Error(`程序化树轮生参数必须是至多 ${PROCEDURAL_TREE_MAX_WHORL_COUNT} 项的有限规则向量`);
    }
    assertFiniteNumberVector(whorlPositions, whorlSizes.length, "程序化树轮生位置");
    whorlSizes.forEach((value, index) => {
      if (!Number.isInteger(value) || value <= 0) throw new Error(`程序化树轮生数量[${index}]必须是正整数`);
    });
  }

  assertExactObjectKeys(
    recipe.leafCountTuning,
    ["lod0Count", "lod1Count", "lod2Count", "lod3Count"],
    [],
    "程序化树叶片 LOD 参数"
  );
  Object.entries(recipe.leafCountTuning).forEach(([key, value]) => {
    if (!Number.isInteger(value) || value < 0) throw new Error(`程序化树叶片参数 ${key} 必须是非负整数`);
  });
  assertExactObjectKeys(
    recipe.foliageTuning,
    ["widthScale", "heightScale", "additiveHalfExtent"],
    ["lodScales"],
    "程序化树叶片尺寸参数"
  );
  ["widthScale", "heightScale", "additiveHalfExtent"].forEach((key) =>
    assertFiniteNumber(recipe.foliageTuning[key], `程序化树叶片尺寸参数 ${key}`)
  );
  if (recipe.foliageTuning.lodScales !== undefined) {
    assertFiniteNumberVector(recipe.foliageTuning.lodScales, PROCEDURAL_TREE_LOD_COUNT, "程序化树叶片 LOD 缩放");
  }
  assertExactObjectKeys(
    recipe.triangleBudget,
    ["maxTrianglesPerLod"],
    ["preferredTrianglesPerLod"],
    "程序化树三角面预算"
  );
  assertFiniteNumberVector(
    recipe.triangleBudget.maxTrianglesPerLod,
    PROCEDURAL_TREE_LOD_COUNT,
    "程序化树各级三角面上限"
  );
  if (recipe.triangleBudget.preferredTrianglesPerLod !== undefined) {
    assertFiniteNumberVector(
      recipe.triangleBudget.preferredTrianglesPerLod,
      PROCEDURAL_TREE_LOD_COUNT,
      "程序化树各级三角面目标"
    );
  }
  if (
    recipe.schema === "galacean/procedural-tree-recipe-v4" &&
    Number(recipe.triangleBudget.maxTrianglesPerLod[0]) > PROCEDURAL_TREE_TRIANGLE_LIMIT
  ) {
    throw new Error("程序化树 LOD0 严禁超过 4000 面");
  }
  if (recipe.triangleBudget.preferredTrianglesPerLod?.some((count, index) =>
    count <= 0 || count > recipe.triangleBudget.maxTrianglesPerLod[index])) {
    throw new Error("程序化树目标面数必须为正数且不能超过对应 LOD 上限");
  }
}

function hasCompleteDescendingProceduralLods(lods) {
  return (
    lods.length === PROCEDURAL_TREE_LOD_COUNT &&
    lods.every((lod, index) => index === 0 || Number(lod.triangles) < Number(lods[index - 1].triangles))
  );
}

function buildOrderedStageAcceptance(analysis, visual) {
  const analysisOrder = analysis.comparisonOrder;
  const visualOrder = visual.comparisonOrder;
  if (
    !Array.isArray(analysisOrder) ||
    !Array.isArray(visualOrder) ||
    analysisOrder.join("\0") !== TREE_COMPARISON_ORDER.join("\0") ||
    visualOrder.join("\0") !== TREE_COMPARISON_ORDER.join("\0")
  ) {
    throw new Error(`树木对比阶段必须严格按 ${TREE_COMPARISON_ORDER.join(" -> ")} 执行`);
  }
  let previousStagePassed = true;
  return TREE_COMPARISON_ORDER.map((stage) => {
    const ruleReport = analysis.stageRuleComparisons?.[stage];
    const ruleMaximumError = Math.max(
      Number(ruleReport?.ruleMaximumError ?? Number.POSITIVE_INFINITY),
      stageValidationRuleMaximumError(stage, visual.ruleErrors)
    );
    const visualMaximumError = Number(visual.stageVisualMaximumErrors?.[stage] ?? Number.POSITIVE_INFINITY);
    const maximumError = Math.max(ruleMaximumError, visualMaximumError);
    const eligible = previousStagePassed;
    const status = !eligible ? "blocked" : maximumError <= TREE_COMPARISON_ERROR_LIMIT ? "passed" : "failed";
    previousStagePassed = status === "passed";
    return {
      stage,
      dependsOn: stage === "trunk" ? null : TREE_COMPARISON_ORDER[TREE_COMPARISON_ORDER.indexOf(stage) - 1],
      status,
      eligible,
      ruleMaximumError,
      visualMaximumError,
      maximumError,
      parametersLocked: status === "passed"
    };
  });
}

function stageValidationRuleMaximumError(stage, ruleErrors = {}) {
  const entries = Object.entries(ruleErrors).filter(([key]) => {
    if (stage === "trunk") return key === "treeHeight";
    if (stage === "primaryBranches") return key === "primaryBranchConnectedComponents";
    if (stage === "secondaryBranches") return key === "secondaryBranchConnectedComponents";
    return !new Set([
      "treeHeight",
      "branchConnectedComponents",
      "primaryBranchConnectedComponents",
      "secondaryBranchConnectedComponents"
    ]).has(key);
  });
  return Math.max(0, ...entries.map(([, value]) => Number(value)));
}

function buildLodAcceptance(lods, speciesPassed, triangleLimit) {
  const complete = hasCompleteDescendingProceduralLods(lods);
  const withinTriangleBudget =
    lods.length === PROCEDURAL_TREE_LOD_COUNT && lods.every((lod) => Number(lod.triangles) <= triangleLimit);
  return {
    stage: "lod0-lod3",
    dependsOn: "leaves",
    status: !speciesPassed ? "blocked" : complete && withinTriangleBudget ? "passed" : "failed",
    eligible: speciesPassed,
    levels: lods.map((lod) => Number(lod.level)),
    complete,
    strictlyDescending: complete,
    withinTriangleBudget
  };
}

function resolveBlenderExecutable(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.BLENDER_BIN,
    process.platform === "darwin" ? "/Applications/Blender.app/Contents/MacOS/Blender" : undefined,
    process.platform === "win32" ? "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe" : undefined,
    "blender"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8", timeout: 10_000 });
    if (!probe.error && probe.status === 0) {
      return {
        executable: candidate,
        version: (probe.stdout || probe.stderr).split(/\r?\n/u).find(Boolean) || "Blender"
      };
    }
  }
  return null;
}

function runCommand(executable, argumentsList, label, standardInput) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argumentsList, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const append = (current, chunk) => {
      const next = current + chunk.toString();
      return next.length > 8_000_000 ? next.slice(-8_000_000) : next;
    };
    child.stdout.on("data", (chunk) => (stdout = append(stdout, chunk)));
    child.stderr.on("data", (chunk) => (stderr = append(stderr, chunk)));
    const timer = setTimeout(() => child.kill("SIGTERM"), PIPELINE_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const combinedOutput = `${stdout}\n${stderr}`;
      const pythonTraceback = combinedOutput.includes("Traceback (most recent call last):");
      if (code === 0 && !pythonTraceback) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${label}失败${signal ? `（${signal}）` : ""}\n${combinedOutput.trim().slice(-8000)}`));
    });
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE" && !settled) child.kill("SIGTERM");
    });
    child.stdin.end(standardInput);
  });
}

async function runTreeReconstructionPipeline(options) {
  const sourceGeometryAnalysisPath = path.join(options.outputDirectory, ".source-geometry-analysis.json");
  const extractionArguments = [
    "--background",
    "--factory-startup",
    "--python",
    TREE_SOURCE_ANALYSIS_SCRIPT_PATH,
    "--",
    "--input",
    options.inputPath,
    "--output",
    sourceGeometryAnalysisPath,
    "--asset-id",
    options.assetId
  ];
  if (options.calibrationFoliageTuning) {
    extractionArguments.push(
      "--foliage-width-scale",
      String(options.calibrationFoliageTuning.widthScale),
      "--foliage-height-scale",
      String(options.calibrationFoliageTuning.heightScale),
      "--foliage-additive-half-extent",
      String(options.calibrationFoliageTuning.additiveHalfExtent)
    );
  }
  await runCommand(options.blender.executable, extractionArguments, "Unity 树几何规则提取");
  const evaluationOutput = await runCommand(
    process.execPath,
    [
      TREE_EVALUATION_SCRIPT_PATH,
      "--asset-id",
      options.assetId,
      "--label",
      options.label,
      "--profile",
      options.profile,
      "--source-analysis",
      sourceGeometryAnalysisPath,
      "--source-fbx",
      options.inputPath,
      "--output",
      options.outputDirectory,
      "--triangle-limit",
      String(PROCEDURAL_TREE_TRIANGLE_LIMIT)
    ],
    "程序化树直接网格生成"
  );
  const geometryStartMarker = "GALACEAN_PROCEDURAL_TREE_GEOMETRY_BEGIN\n";
  const geometryEndMarker = "\nGALACEAN_PROCEDURAL_TREE_GEOMETRY_END";
  const geometryStart = evaluationOutput.lastIndexOf(geometryStartMarker);
  const geometryEnd = evaluationOutput.indexOf(geometryEndMarker, geometryStart + geometryStartMarker.length);
  if (geometryStart < 0 || geometryEnd < 0) {
    throw new Error("程序化树生成器没有返回完整的运行时网格数据帧");
  }
  const runtimeGeometry = evaluationOutput.slice(geometryStart + geometryStartMarker.length, geometryEnd);
  const geometryPayload = JSON.parse(runtimeGeometry);
  if (geometryPayload.schema !== "galacean/procedural-tree-runtime-geometry-stream-v1") {
    throw new Error("程序化树生成器没有返回可校验的运行时网格数据");
  }
  const recipePath = path.join(options.outputDirectory, "procedural-recipe.json");
  if (!fs.existsSync(recipePath)) throw new Error("程序化参数反推没有输出有限参数配方");
  assertProceduralRecipeContainsNoBakedData(JSON.parse(fs.readFileSync(recipePath, "utf8")));
  await runCommand(
    options.blender.executable,
    [
      "--background",
      "--factory-startup",
      "--python",
      TREE_VISUAL_VALIDATION_SCRIPT_PATH,
      "--",
      "--input",
      options.inputPath,
      "--output",
      options.outputDirectory
    ],
    "无材质三视图视觉校验",
    runtimeGeometry
  );
  const analysisPath = path.join(options.outputDirectory, "analysis.json");
  const sourceAnalysisPath = path.join(options.outputDirectory, "source-analysis.json");
  const visualPath = path.join(options.outputDirectory, "geometry-visual-parity.json");
  const analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8"));
  const sourceAnalysis = JSON.parse(fs.readFileSync(sourceAnalysisPath, "utf8"));
  const sourceGeometryAnalysis = JSON.parse(fs.readFileSync(sourceGeometryAnalysisPath, "utf8"));
  const visual = JSON.parse(fs.readFileSync(visualPath, "utf8"));
  const lods = analysis.reconstruction?.lods ?? [];
  const lod0Triangles = Number(lods[0]?.triangles ?? Number.POSITIVE_INFINITY);
  const comparisonStages = buildOrderedStageAcceptance(analysis, visual);
  const speciesPassed = comparisonStages.every((stage) => stage.status === "passed") && visual.passesFivePercent;
  const lodAcceptance = buildLodAcceptance(lods, speciesPassed, PROCEDURAL_TREE_TRIANGLE_LIMIT);
  const acceptance = {
    triangleLimit: PROCEDURAL_TREE_TRIANGLE_LIMIT,
    maximumTriangles: lod0Triangles,
    lod0Triangles,
    visualMaximumError: visual.visualMaximumError,
    ruleMaximumError: visual.ruleMaximumError,
    maximumError: Math.max(Number(visual.visualMaximumError ?? 0), Number(visual.ruleMaximumError ?? 0)),
    comparisonOrder: TREE_COMPARISON_ORDER,
    comparisonStages,
    passesFivePercent: speciesPassed,
    lodAcceptance,
    directMeshValidationPasses: true,
    passes: speciesPassed && lodAcceptance.status === "passed"
  };
  const featureGaps = diagnoseFeatureGaps(visual, sourceGeometryAnalysis, analysis, acceptance);
  const diagnosticFallback = acceptance.passes
    ? {
        ...TREE_DIAGNOSTIC_FALLBACK,
        status: "not-needed",
        sampleCount: 0,
        retainedSamples: 0
      }
    : performSingleDiagnosticBake(options.outputDirectory, sourceGeometryAnalysis, comparisonStages, featureGaps);
  featureGaps.diagnosticFallback = diagnosticFallback;
  const completedAnalysis = { ...analysis, acceptance, featureGaps };
  fs.writeFileSync(analysisPath, `${JSON.stringify(completedAnalysis, null, 2)}\n`);
  fs.writeFileSync(
    path.join(options.outputDirectory, "feature-gaps.json"),
    `${JSON.stringify(featureGaps, null, 2)}\n`
  );
  fs.rmSync(sourceGeometryAnalysisPath);
  return { analysis: completedAnalysis, sourceAnalysis, visual, acceptance, featureGaps };
}

function performSingleDiagnosticBake(outputDirectory, sourceGeometryAnalysis, comparisonStages, featureGaps) {
  const failedStage = comparisonStages.find((stage) => stage.status === "failed")?.stage ?? null;
  const diagnosticPath = path.join(outputDirectory, ".single-diagnostic-bake.json");
  const sample = {
    schema: "galacean/procedural-tree-diagnostic-bake-v1",
    productionUseAllowed: false,
    failedStage,
    sourceNodeSample: {
      branches: sourceGeometryAnalysis.branches,
      leaves: sourceGeometryAnalysis.leaves
    }
  };
  fs.writeFileSync(diagnosticPath, JSON.stringify(sample));
  const sampleBytes = fs.statSync(diagnosticPath).size;
  const derivedGenericRules = featureGaps.missingCapabilities.map((entry) => ({
    capabilityId: entry.id,
    rule: entry.requiredCapability
  }));
  fs.rmSync(diagnosticPath);
  return {
    ...TREE_DIAGNOSTIC_FALLBACK,
    status: "generic-rule-required",
    failedStage,
    sampleCount: 1,
    retainedSamples: 0,
    sampleBytes,
    derivedGenericRules
  };
}

function diagnoseFeatureGaps(visual, sourceGeometryAnalysis, analysis, acceptance) {
  const threshold = TREE_COMPARISON_ERROR_LIMIT;
  const ruleErrors = visual.ruleErrors ?? {};
  const missingCapabilities = [];
  const push = (id, label, evidence, requiredCapability) => {
    missingCapabilities.push({ id, label, evidence, requiredCapability });
  };
  const maximumPartError = (part) =>
    Math.max(0, ...Object.values(visual.visualViews ?? {}).map((view) => Number(view?.[part]?.error ?? 0)));
  const branchVisualError = maximumPartError("branches");
  const leafVisualError = maximumPartError("leaves");
  const sourceTrunk = sourceGeometryAnalysis.inferredRules?.trunk;
  const reconstructedTrunk = analysis.reconstruction?.structure?.trunk;
  const trunkTaperError =
    sourceTrunk && reconstructedTrunk
      ? Math.abs(
          reconstructedTrunk.tipRadius / Math.max(reconstructedTrunk.baseRadius, Number.EPSILON) -
            sourceTrunk.tipRadius / Math.max(sourceTrunk.baseRadius, Number.EPSILON)
        ) / Math.max(sourceTrunk.tipRadius / Math.max(sourceTrunk.baseRadius, Number.EPSILON), Number.EPSILON)
      : 0;
  if (trunkTaperError > threshold) {
    push(
      "trunk-profile-controls",
      "主干锥度与半径曲线",
      {
        trunkTaperError,
        sourceTipToBaseRadius: sourceTrunk?.tipRadius / Math.max(sourceTrunk?.baseRadius ?? 0, Number.EPSILON),
        reconstructedTipToBaseRadius:
          reconstructedTrunk?.tipRadius / Math.max(reconstructedTrunk?.baseRadius ?? 0, Number.EPSILON)
      },
      "把 taper、ratioPower、根部膨大和沿主干的半径曲线暴露为可反推参数；当前运行时参数只能控制一个基径比例。"
    );
  }
  if (branchVisualError > threshold) {
    push(
      "branch-envelope-curves",
      "分层枝序与冠层包络",
      { branchVisualError, threshold },
      "为每一枝级提供随树高变化的数量、长度、下垂角、曲率、重力和修剪包络曲线，而不是每级一个全局均值。"
    );
  }
  const leafAttachmentError = Math.max(
    Number(ruleErrors.leafBearingBranchRatio ?? 0),
    Number(ruleErrors.leafBranchProgressQuantiles ?? 0),
    Number(ruleErrors.terminalLeafRatio ?? 0),
    Number(ruleErrors.leavesPerBranchQuantiles ?? 0)
  );
  if (leafAttachmentError > threshold) {
    push(
      "leaf-emission-rules",
      "按枝级和沿枝位置发叶",
      {
        leafAttachmentError,
        sourceLeafBearingStemRatio: sourceGeometryAnalysis.inferredRules?.leaves?.leafBearingStemRatio,
        reconstructedLeafBearingStemRatio: visual.reconstructionRules?.leafBearingBranchRatio
      },
      "允许非末级枝条发叶，并分别控制各枝级的起止进度、密度曲线、末梢偏置和每茎叶簇数量。"
    );
  }
  const crownDistributionError = Math.max(
    Number(ruleErrors.lowestLeafHeightRatio ?? 0),
    Number(ruleErrors.leafHeightQuantiles ?? 0),
    Number(ruleErrors.leafRadiusQuantiles ?? 0),
    Number(ruleErrors.leafHeightBins ?? 0)
  );
  if (crownDistributionError > threshold || leafVisualError > threshold) {
    push(
      "crown-lobes",
      "多层冠团与非对称冠形",
      { crownDistributionError, leafVisualError, threshold },
      "增加可组合的冠层轮廓/冠团、空洞与轴向非对称控制，使叶云不再只能由统一 Sapling shape 函数决定。"
    );
  }
  const leafOrientationError = Number(ruleErrors.leafNormalAbsoluteUpQuantiles ?? 0);
  if (leafOrientationError > threshold) {
    push(
      "leaf-phyllotaxy-orientation",
      "叶序与叶卡姿态分布",
      { leafOrientationError, threshold },
      "将叶序、绕枝相位、俯仰/翻滚分布、重力响应和叶卡宽高分布暴露为可反推参数。"
    );
  }
  const leafCardShapeError = Math.max(
    Number(ruleErrors.leafCardWidthQuantiles ?? 0),
    Number(ruleErrors.leafCardHeightQuantiles ?? 0),
    Number(ruleErrors.leafCardAreaQuantiles ?? 0)
  );
  if (leafCardShapeError > threshold) {
    push(
      "leaf-card-size-distribution",
      "叶卡宽高与缩放分布",
      { leafCardShapeError, threshold },
      "暴露叶片基础长度、宽高比、梢端缩放曲线和分布类型；当前只能在固定白桦基型上乘全局宽高系数。"
    );
  }
  if (!acceptance.passes && missingCapabilities.length === 0) {
    push(
      "projected-crown-occupancy",
      "投影占用与局部疏密控制",
      { visualMaximumError: acceptance.visualMaximumError, threshold },
      "增加多视图投影占用约束所需的通用冠层分区密度参数；当前全局参数无法控制局部轮廓空洞。"
    );
  }
  return {
    schema: "galacean/procedural-tree-capability-gap-report-v1",
    parameterOnlyReconstruction: true,
    measuredGeometryUsedAtRuntime: false,
    passesFivePercent: acceptance.passes,
    diagnosticFallback: TREE_DIAGNOSTIC_FALLBACK,
    missingCapabilities
  };
}

async function readRequestToFile(request, filePath) {
  const declaredSize = Number(request.headers["content-length"] ?? 0);
  if (declaredSize <= 0) throw new Error("FBX 文件为空");
  if (declaredSize > MAX_FBX_BYTES) throw new Error("FBX 文件不能超过 512 MB");
  let received = 0;
  const limiter = async function* (source) {
    for await (const chunk of source) {
      received += chunk.length;
      if (received > MAX_FBX_BYTES) throw new Error("FBX 文件不能超过 512 MB");
      yield chunk;
    }
  };
  await pipeline(request, limiter, fs.createWriteStream(filePath, { flags: "wx" }));
  if (received === 0) throw new Error("FBX 文件为空");
}

function readTreeReconstructionCase(assetId) {
  if (!ASSET_ID_PATTERN.test(assetId)) return null;
  const outputDirectory = path.join(PROCEDURAL_TREE_OUTPUT_ROOT, assetId);
  const analysisPath = path.join(outputDirectory, "analysis.json");
  const sourceAnalysisPath = path.join(outputDirectory, "source-analysis.json");
  const recipePath = path.join(outputDirectory, "procedural-recipe.json");
  const visualPath = path.join(outputDirectory, "geometry-visual-parity.json");
  const featureGapsPath = path.join(outputDirectory, "feature-gaps.json");
  if (
    ![analysisPath, sourceAnalysisPath, recipePath, visualPath, featureGapsPath].every((file) => fs.existsSync(file))
  ) {
    return null;
  }
  const analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8"));
  const sourceAnalysis = JSON.parse(fs.readFileSync(sourceAnalysisPath, "utf8"));
  const recipe = JSON.parse(fs.readFileSync(recipePath, "utf8"));
  assertProceduralRecipeContainsNoBakedData(recipe);
  const visual = JSON.parse(fs.readFileSync(visualPath, "utf8"));
  const featureGaps = JSON.parse(fs.readFileSync(featureGapsPath, "utf8"));
  const lods = analysis.reconstruction?.lods ?? [];
  const lod0Triangles = Number(lods[0]?.triangles ?? Number.POSITIVE_INFINITY);
  const acceptance = analysis.acceptance ?? {
    triangleLimit: analysis.triangleLimit ?? PROCEDURAL_TREE_TRIANGLE_LIMIT,
    maximumTriangles: lod0Triangles,
    lod0Triangles,
    visualMaximumError: visual.visualMaximumError,
    ruleMaximumError: visual.ruleMaximumError,
    maximumError: Math.max(Number(visual.visualMaximumError ?? 0), Number(visual.ruleMaximumError ?? 0)),
    passesFivePercent: visual.passesFivePercent,
    directMeshValidationPasses: true,
    passes:
      visual.passesFivePercent &&
      hasCompleteDescendingProceduralLods(lods) &&
      lod0Triangles <= (analysis.triangleLimit ?? PROCEDURAL_TREE_TRIANGLE_LIMIT) &&
      lods.every((lod) => Number(lod.triangles) <= (analysis.triangleLimit ?? PROCEDURAL_TREE_TRIANGLE_LIMIT))
  };
  const baseUrl = `/packages/vegetation/src/asset-assembly/generated/procedural-trees/${assetId}`;
  return {
    assetId,
    label: analysis.label ?? assetId,
    createdAt: analysis.createdAt ?? null,
    baseUrl,
    acceptance,
    summary: {
      height: sourceAnalysis.height,
      branchCounts: sourceAnalysis.branchCounts,
      stemComponents: sourceAnalysis.branchCounts?.reduce((left, right) => left + right, 0),
      sourceLeafCards: sourceAnalysis.inferredRules?.leaves?.cards,
      lods
    },
    reports: {
      sourceAnalysis: `${baseUrl}/source-analysis.json`,
      recipe: `${baseUrl}/procedural-recipe.json`,
      analysis: `${baseUrl}/analysis.json`,
      visual: `${baseUrl}/geometry-visual-parity.json`,
      featureGaps: `${baseUrl}/feature-gaps.json`
    },
    files: [
      { label: "Procedural parameter recipe", url: `${baseUrl}/procedural-recipe.json` },
      { label: "Source statistics", url: `${baseUrl}/source-analysis.json` },
      { label: "Visual parity report", url: `${baseUrl}/geometry-visual-parity.json` },
      { label: "Capability gap report", url: `${baseUrl}/feature-gaps.json` }
    ]
  };
}

function listTreeReconstructionCases() {
  if (!fs.existsSync(PROCEDURAL_TREE_OUTPUT_ROOT)) return [];
  return fs
    .readdirSync(PROCEDURAL_TREE_OUTPUT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ASSET_ID_PATTERN.test(entry.name))
    .map((entry) => {
      try {
        return readTreeReconstructionCase(entry.name);
      } catch (error) {
        if (error instanceof Error && /烘焙数据|闭合协议|有限参数协议/u.test(error.message)) return null;
        throw error;
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.assetId === "measured-white-birch") return -1;
      if (right.assetId === "measured-white-birch") return 1;
      return left.label.localeCompare(right.label);
    });
}

function isLoopbackAddress(address) {
  return address === "::1" || address?.startsWith("127.") || address?.startsWith("::ffff:127.");
}

function sendJson(response, statusCode, value) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

function errorStatus(error) {
  if (/已存在/u.test(error.message)) return 409;
  if (/Blender|失败/u.test(error.message)) return 503;
  return 400;
}

function createTreeReconstructionServer() {
  return {
    name: "asset-assembly-tree-reconstruction",
    configureServer(server) {
      const blender = resolveBlenderExecutable();
      server.middlewares.use("/api/asset-assembly/tree-reconstruction", (request, response, next) => {
        if (!isLoopbackAddress(request.socket.remoteAddress)) {
          sendJson(response, 403, { error: "Unity 树还原只接受本机请求" });
          return;
        }
        const url = new URL(request.url || "/", "http://localhost");
        if (request.method === "GET") {
          const assetId = String(url.searchParams.get("assetId") ?? "")
            .trim()
            .toLowerCase();
          if (assetId) {
            try {
              const treeCase = readTreeReconstructionCase(assetId);
              sendJson(response, treeCase ? 200 : 404, treeCase ?? { error: `未找到树木还原案例 ${assetId}` });
            } catch (error) {
              sendJson(response, errorStatus(error), { error: error instanceof Error ? error.message : String(error) });
            }
            return;
          }
          sendJson(response, 200, {
            available: Boolean(blender),
            blenderVersion: blender?.version ?? null,
            maxFileBytes: MAX_FBX_BYTES,
            triangleLimit: PROCEDURAL_TREE_TRIANGLE_LIMIT,
            acceptedExtensions: [".fbx"],
            cases: listTreeReconstructionCases()
          });
          return;
        }
        if (request.method !== "POST" || url.pathname !== "/") return next();
        void (async () => {
          let assetId;
          let sourceDirectory;
          let workDirectory;
          let outputDirectory;
          let publishedOutput = false;
          let ownsSourceDirectory = false;
          try {
            if (!blender) throw new Error("未找到 Blender；请安装 Blender 或设置 BLENDER_BIN 后重启 Gallery");
            if (request.headers["content-type"] !== "application/octet-stream") {
              throw new Error("Unity 树上传必须使用 application/octet-stream");
            }
            assetId = String(url.searchParams.get("assetId") ?? "")
              .trim()
              .toLowerCase();
            const label = String(url.searchParams.get("label") ?? assetId)
              .trim()
              .slice(0, 120);
            const profile = String(url.searchParams.get("profile") ?? "white-birch");
            const inputFileName = String(url.searchParams.get("fileName") ?? `${assetId}.fbx`).trim();
            if (!ASSET_ID_PATTERN.test(assetId)) {
              throw new Error("Asset ID 只能包含小写字母、数字和连字符，且最长 63 个字符");
            }
            if (!label) throw new Error("树木名称不能为空");
            if (!new Set(["white-birch", "small-maple"]).has(profile)) throw new Error("不支持的树木程序化基型");
            if (path.extname(inputFileName).toLowerCase() !== ".fbx") throw new Error("请选择 .fbx 树模型");
            if (activeAssetIds.has(assetId)) throw new Error(`素材 ${assetId} 正在还原`);
            outputDirectory = path.join(PROCEDURAL_TREE_OUTPUT_ROOT, assetId);
            sourceDirectory = path.join(TREE_RECONSTRUCTION_SOURCE_ROOT, assetId);
            if (fs.existsSync(outputDirectory) || fs.existsSync(sourceDirectory)) {
              throw new Error(`素材 ${assetId} 已存在；请使用新的 Asset ID，现有验收数据不会被覆盖`);
            }
            activeAssetIds.add(assetId);
            fs.mkdirSync(TREE_RECONSTRUCTION_SOURCE_ROOT, { recursive: true });
            fs.mkdirSync(sourceDirectory);
            ownsSourceDirectory = true;
            const inputPath = path.join(sourceDirectory, `${assetId}.fbx`);
            await readRequestToFile(request, inputPath);
            fs.mkdirSync(PROCEDURAL_TREE_OUTPUT_ROOT, { recursive: true });
            workDirectory = path.join(
              PROCEDURAL_TREE_OUTPUT_ROOT,
              `.${assetId}.reconstruction-${process.pid}-${Date.now()}`
            );
            fs.mkdirSync(workDirectory);
            const pipelineResult = await runTreeReconstructionPipeline({
              assetId,
              label,
              profile,
              inputPath,
              outputDirectory: workDirectory,
              blender
            });
            if (!pipelineResult.acceptance.passes) {
              const failedStage = pipelineResult.acceptance.comparisonStages.find(
                (stage) => stage.status === "failed"
              )?.stage;
              throw new Error(
                `程序化树还原未通过 ${failedStage ?? "LOD"} 的 5% 强门禁；已完成一次诊断烘焙并反推出通用算法缺口，禁止发布`
              );
            }
            fs.renameSync(workDirectory, outputDirectory);
            workDirectory = undefined;
            publishedOutput = true;
            if (RUNTIME_PROCEDURAL_TREE_OUTPUT_ROOT !== PROCEDURAL_TREE_OUTPUT_ROOT) {
              const runtimeOutputDirectory = path.join(RUNTIME_PROCEDURAL_TREE_OUTPUT_ROOT, assetId);
              if (fs.existsSync(runtimeOutputDirectory))
                fs.rmSync(runtimeOutputDirectory, { recursive: true, force: true });
              fs.cpSync(outputDirectory, runtimeOutputDirectory, { recursive: true });
            }
            const treeCase = readTreeReconstructionCase(assetId);
            if (!treeCase) throw new Error("还原数据已生成但无法读取验收报告");
            sendJson(response, 201, treeCase);
          } catch (error) {
            if (workDirectory && fs.existsSync(workDirectory))
              fs.rmSync(workDirectory, { recursive: true, force: true });
            if (publishedOutput && outputDirectory && fs.existsSync(outputDirectory)) {
              fs.rmSync(outputDirectory, { recursive: true, force: true });
            }
            if (ownsSourceDirectory && sourceDirectory && fs.existsSync(sourceDirectory)) {
              fs.rmSync(sourceDirectory, { recursive: true, force: true });
            }
            sendJson(response, errorStatus(error), { error: error instanceof Error ? error.message : String(error) });
          } finally {
            if (assetId) activeAssetIds.delete(assetId);
          }
        })();
      });
    }
  };
}

module.exports = {
  ASSET_ID_PATTERN,
  MAX_FBX_BYTES,
  PROCEDURAL_TREE_PREFERRED_LOD0_TRIANGLES,
  PROCEDURAL_TREE_TRIANGLE_LIMIT,
  TREE_COMPARISON_ERROR_LIMIT,
  TREE_COMPARISON_ORDER,
  TREE_DIAGNOSTIC_FALLBACK,
  assertProceduralRecipeContainsNoBakedData,
  buildOrderedStageAcceptance,
  createTreeReconstructionServer,
  readTreeReconstructionCase,
  resolveBlenderExecutable,
  runTreeReconstructionPipeline
};
