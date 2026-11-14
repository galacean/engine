import {
  movePromptNoiseRiverControlPoint,
  PromptNoiseTerrainProgram,
  updatePromptNoiseRiverControlPoint,
  upgradePromptNoiseWorldRecipeV4,
  type PromptNoiseRiverOperatorV1,
  type PromptNoiseTerrainOperatorV1,
  type PromptNoiseWorldRecipeV4
} from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";

export interface PromptNoiseRiverNetworkSnapshotV1 {
  readonly id: number;
  readonly reachOperatorIds: readonly number[];
  readonly nodeCount: number;
  readonly sourceCount: number;
  readonly mouthCount: number;
  readonly junctionCount: number;
}

/** Adds explicit singleton Network / Node identities without changing River geometry. */
export function upgradePromptNoiseRiverTopology(program: PromptNoiseTerrainProgram): PromptNoiseTerrainProgram {
  const recipe = editableRecipe(program);
  const rivers = recipe.operators.filter(isRiver);
  if (rivers.length === 0 || rivers.every((river) => river.topology)) return program;
  if (rivers.some((river) => river.topology)) {
    throw new RangeError("Prompt-noise River topology cannot be partially initialized");
  }
  let nextRiverNetworkId = 1;
  let nextRiverNodeId = 1;
  const operators = recipe.operators.map((operator) => {
    if (operator.kind !== "river") return operator;
    const updated: PromptNoiseRiverOperatorV1 = {
      ...operator,
      topology: {
        networkId: nextRiverNetworkId++,
        fromNodeId: nextRiverNodeId++,
        toNodeId: nextRiverNodeId++,
        fromMergeRadius: 0,
        toMergeRadius: 0
      }
    };
    return updated;
  });
  return new PromptNoiseTerrainProgram({ ...recipe, operators, nextRiverNetworkId, nextRiverNodeId });
}

/**
 * Atomically connects two singleton incoming Reaches and one singleton outgoing Reach.
 * Endpoint geometry is snapped to the outgoing source; topology, not proximity, owns connectivity.
 */
export function connectPromptNoiseRiverConfluence(
  program: PromptNoiseTerrainProgram,
  incomingOperatorIds: readonly [number, number],
  outgoingOperatorId: number,
  mergeRadius: number
): PromptNoiseTerrainProgram {
  if (!Number.isFinite(mergeRadius) || mergeRadius <= 0) {
    throw new RangeError("Prompt-noise River confluence radius must be positive");
  }
  const ids = [...incomingOperatorIds, outgoingOperatorId];
  if (new Set(ids).size !== ids.length) {
    throw new RangeError("Prompt-noise River confluence requires three distinct Reaches");
  }
  const explicit = upgradePromptNoiseRiverTopology(program);
  const recipe = explicit.recipe as PromptNoiseWorldRecipeV4;
  const selected = ids.map((id) => requireRiver(recipe.operators, id));
  for (const river of selected) {
    const networkMembers = recipe.operators.filter(
      (operator) => operator.kind === "river" && operator.topology?.networkId === river.topology!.networkId
    );
    if (networkMembers.length !== 1) {
      throw new RangeError("Disconnect the selected River Network before creating another confluence");
    }
  }
  const outgoing = selected[2];
  const junctionPoint = outgoing.controlPoints![0];
  const junctionSurface = junctionPoint.bedHeight + junctionPoint.depth;
  const maximumHalfWidth = Math.max(
    junctionPoint.width * 0.5,
    ...selected.slice(0, 2).map((river) => river.controlPoints!.at(-1)!.width * 0.5)
  );
  if (mergeRadius + 1e-5 < maximumHalfWidth) {
    throw new RangeError(
      `Prompt-noise River confluence radius ${mergeRadius.toFixed(2)}m is smaller than the connected half-width ${maximumHalfWidth.toFixed(2)}m`
    );
  }
  const junctionNodeId = recipe.nextRiverNodeId!;
  const networkId = outgoing.topology!.networkId;
  const replacements = new Map<number, PromptNoiseRiverOperatorV1>();
  for (const incoming of selected.slice(0, 2)) {
    const mouth = incoming.controlPoints!.at(-1)!;
    const moved = movePromptNoiseRiverControlPoint(incoming, mouth.id, junctionPoint.position);
    const resolved = updatePromptNoiseRiverControlPoint(moved, mouth.id, {
      bedHeight: junctionSurface - mouth.depth
    });
    replacements.set(incoming.id, {
      ...resolved,
      topology: {
        ...incoming.topology!,
        networkId,
        toNodeId: junctionNodeId,
        toMergeRadius: mergeRadius
      }
    });
  }
  replacements.set(outgoing.id, {
    ...outgoing,
    topology: {
      ...outgoing.topology!,
      networkId,
      fromNodeId: junctionNodeId,
      fromMergeRadius: mergeRadius
    }
  });
  return new PromptNoiseTerrainProgram({
    ...recipe,
    operators: recipe.operators.map((operator) => replacements.get(operator.id) ?? operator),
    nextRiverNodeId: junctionNodeId + 1
  });
}

/** Converts every Reach in one connected Network back to an explicit singleton Network. */
export function disconnectPromptNoiseRiverNetwork(
  program: PromptNoiseTerrainProgram,
  operatorId: number
): PromptNoiseTerrainProgram {
  const explicit = upgradePromptNoiseRiverTopology(program);
  const recipe = explicit.recipe as PromptNoiseWorldRecipeV4;
  const selected = requireRiver(recipe.operators, operatorId);
  const networkId = selected.topology!.networkId;
  const members = recipe.operators.filter(
    (operator): operator is PromptNoiseRiverOperatorV1 =>
      operator.kind === "river" && operator.topology?.networkId === networkId
  );
  if (members.length <= 1) return explicit;
  let nextRiverNetworkId = recipe.nextRiverNetworkId!;
  let nextRiverNodeId = recipe.nextRiverNodeId!;
  const replacements = new Map<number, PromptNoiseRiverOperatorV1>();
  for (const member of members) {
    replacements.set(member.id, {
      ...member,
      topology: {
        networkId: nextRiverNetworkId++,
        fromNodeId: nextRiverNodeId++,
        toNodeId: nextRiverNodeId++,
        fromMergeRadius: 0,
        toMergeRadius: 0
      }
    });
  }
  return new PromptNoiseTerrainProgram({
    ...recipe,
    operators: recipe.operators.map((operator) => replacements.get(operator.id) ?? operator),
    nextRiverNetworkId,
    nextRiverNodeId
  });
}

export function listPromptNoiseRiverNetworks(
  program: PromptNoiseTerrainProgram
): readonly PromptNoiseRiverNetworkSnapshotV1[] {
  const rivers = program.recipe.operators.filter(isRiver);
  const grouped = new Map<number, PromptNoiseRiverOperatorV1[]>();
  for (const river of rivers) {
    const networkId = river.topology?.networkId ?? river.id;
    const members = grouped.get(networkId) ?? [];
    members.push(river);
    grouped.set(networkId, members);
  }
  return Object.freeze(
    [...grouped.entries()].map(([id, members]) => {
      const degrees = new Map<number, { incoming: number; outgoing: number }>();
      for (const river of members) {
        const from = river.topology?.fromNodeId ?? river.id * 2 - 1;
        const to = river.topology?.toNodeId ?? river.id * 2;
        degrees.set(from, {
          incoming: degrees.get(from)?.incoming ?? 0,
          outgoing: (degrees.get(from)?.outgoing ?? 0) + 1
        });
        degrees.set(to, {
          incoming: (degrees.get(to)?.incoming ?? 0) + 1,
          outgoing: degrees.get(to)?.outgoing ?? 0
        });
      }
      const values = [...degrees.values()];
      return Object.freeze({
        id,
        reachOperatorIds: Object.freeze(members.map((river) => river.id)),
        nodeCount: degrees.size,
        sourceCount: values.filter(({ incoming, outgoing }) => incoming === 0 && outgoing > 0).length,
        mouthCount: values.filter(({ incoming, outgoing }) => incoming > 0 && outgoing === 0).length,
        junctionCount: values.filter(({ incoming, outgoing }) => incoming >= 2 && outgoing >= 1).length
      });
    })
  );
}

function editableRecipe(program: PromptNoiseTerrainProgram): PromptNoiseWorldRecipeV4 {
  return program.recipe.version === 4 ? program.recipe : upgradePromptNoiseWorldRecipeV4(program.recipe);
}

function requireRiver(
  operators: readonly PromptNoiseTerrainOperatorV1[],
  operatorId: number
): PromptNoiseRiverOperatorV1 {
  const river = operators.find(
    (operator): operator is PromptNoiseRiverOperatorV1 => operator.kind === "river" && operator.id === operatorId
  );
  if (!river?.controlPoints || !river.topology) {
    throw new RangeError(`Unknown explicit Prompt-noise River Reach ${operatorId}`);
  }
  return river;
}

function isRiver(operator: PromptNoiseTerrainOperatorV1): operator is PromptNoiseRiverOperatorV1 {
  return operator.kind === "river";
}
