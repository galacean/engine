import type {
  PopulationTokenExtensionV1,
  TreePopulationTokenV1
} from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import type { TreeRecipeSource } from "./AssetAssemblySourceLibrary";
import { TREE_DISTRIBUTION_EXTENSION_ID } from "./AssetAssemblyPresetFactory";
import {
  createDefaultProceduralTreeDistributionTuning,
  PROCEDURAL_TREE_ALGORITHM,
  validateProceduralTreeDistributionTuning,
  type ProceduralTreeDistributionTuning
} from "./ProceduralTreeGenerator";

interface ProceduralTreeDistributionTokenDataV1 {
  /** Generator contract required to interpret every persisted distribution field. */
  readonly algorithm: typeof PROCEDURAL_TREE_ALGORITHM;
  /** Complete generator input snapshot; recipe defaults are used only when this extension is absent. */
  readonly tuning: ProceduralTreeDistributionTuning;
}

/** Resolves the complete deterministic tree-geometry input from a Token or its selected recipe. */
export function resolveTreeDistributionTuning(
  token: TreePopulationTokenV1,
  recipe: TreeRecipeSource
): ProceduralTreeDistributionTuning {
  if (token.assetId !== recipe.id) {
    throw new Error("Tree distribution extension cannot be resolved against a different recipe");
  }
  const extension = token.extensions.find((candidate) => candidate.id === TREE_DISTRIBUTION_EXTENSION_ID);
  if (!extension) {
    return detachTreeDistributionTuning(
      recipe.proceduralRuntime?.distributionTuning ?? createDefaultProceduralTreeDistributionTuning(recipe)
    );
  }
  if (extension.version !== 1 || extension.required) {
    throw new Error("Tree distribution extension version or requirement is unsupported");
  }
  if (!extension.data || typeof extension.data !== "object" || Array.isArray(extension.data)) {
    throw new Error("Tree distribution extension data must be an object");
  }
  const data = extension.data as Record<string, unknown>;
  const keys = Object.keys(data).sort();
  if (keys.length !== 2 || keys[0] !== "algorithm" || keys[1] !== "tuning") {
    throw new Error("Tree distribution extension data contains unsupported fields");
  }
  if (data.algorithm !== PROCEDURAL_TREE_ALGORITHM) {
    throw new Error(`Tree distribution requires procedural algorithm "${PROCEDURAL_TREE_ALGORITHM}"`);
  }
  if (!data.tuning || typeof data.tuning !== "object" || Array.isArray(data.tuning)) {
    throw new Error("Tree distribution tuning must be an object");
  }
  const tuning = data.tuning as ProceduralTreeDistributionTuning;
  validateProceduralTreeDistributionTuning(tuning);
  assertRecipeOwnedDistributionShape(tuning, recipe);
  return detachTreeDistributionTuning(tuning);
}

/** Replaces the complete trunk, primary-branch, twig, and foliage distribution snapshot in one tree Token. */
export function withTreeDistributionTuning(
  token: TreePopulationTokenV1,
  tuning: ProceduralTreeDistributionTuning
): TreePopulationTokenV1 {
  validateProceduralTreeDistributionTuning(tuning);
  const remaining = token.extensions.filter((extension) => extension.id !== TREE_DISTRIBUTION_EXTENSION_ID);
  const data: ProceduralTreeDistributionTokenDataV1 = {
    algorithm: PROCEDURAL_TREE_ALGORITHM,
    tuning: detachTreeDistributionTuning(tuning)
  };
  const extension: PopulationTokenExtensionV1 = {
    id: TREE_DISTRIBUTION_EXTENSION_ID,
    version: 1,
    required: false,
    data
  };
  return { ...token, extensions: [...remaining, extension] };
}

/** Removes the authored override so the selected recipe again owns the complete tree distribution. */
export function withoutTreeDistributionTuning(token: TreePopulationTokenV1): TreePopulationTokenV1 {
  return {
    ...token,
    extensions: token.extensions.filter((extension) => extension.id !== TREE_DISTRIBUTION_EXTENSION_ID)
  };
}

/** Detaches every nested curve and level tuple so Token state cannot alias mutable editor input. */
export function detachTreeDistributionTuning(
  tuning: ProceduralTreeDistributionTuning
): ProceduralTreeDistributionTuning {
  return detachCanonicalValue(tuning) as ProceduralTreeDistributionTuning;
}

/** A runtime recipe owns a closed editable field surface; Tokens may change values but cannot inject hidden inputs. */
function assertRecipeOwnedDistributionShape(tuning: ProceduralTreeDistributionTuning, recipe: TreeRecipeSource): void {
  const recipeTuning = recipe.proceduralRuntime?.distributionTuning;
  if (!recipeTuning) return;
  const expectedKeys = Object.keys(recipeTuning).sort();
  const actualKeys = Object.keys(tuning).sort();
  if (
    expectedKeys.length !== actualKeys.length ||
    expectedKeys.some((expected, index) => expected !== actualKeys[index])
  ) {
    throw new Error(`Tree distribution for "${recipe.id}" must contain exactly its exposed recipe fields`);
  }
}

function detachCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(detachCanonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, detachCanonicalValue(entry)])
    );
  }
  return value;
}
