import type {
  SeedWorldAnimalCommand,
  SeedWorldAnimalDescription,
  SeedWorldAnimalReceipt,
  SeedWorldAnimalTarget
} from "../../../../agent-adapter/ports/SeedWorldAnimalService.ts";

/** Public targets and their runtime validation belong to this host, independently of asset loading. */
export const PLANNING_ANIMAL_TARGETS: SeedWorldAnimalDescription["targets"] = [
  {
    query: "position",
    label: "世界坐标",
    description: "目标必须位于预计算运动范围内，并且存在与该动物运动能力匹配的可直达通路（陆地、空中或水域）。",
    parameters: [
      { name: "x", type: "number", required: true, description: "世界 X 坐标，米" },
      { name: "z", type: "number", required: true, description: "世界 Z 坐标，米" }
    ]
  }
];

type CommandPreparation =
  | { kind: "execute"; input: SeedWorldAnimalCommand }
  | { kind: "receipt"; receipt: SeedWorldAnimalReceipt };

/**
 * Validate a new semantic task before it can replace the active behavior.
 * Existing operations are compared before live spatial checks, so a moving animal's retries stay idempotent.
 * @param input Public semantic request; animation details are not accepted.
 * @param skills The actual asset registration's public skill declarations.
 * @param canReach The host's authoritative support, obstacle and allowed-region test.
 * @param previous Existing receipt for this actor/request pair, if any.
 */
export function preparePlanningAnimalCommand(
  input: SeedWorldAnimalCommand,
  skills: Readonly<Record<string, { requiresTarget?: boolean }>>,
  canReach: (position: { x: number; z: number }) => boolean,
  previous?: SeedWorldAnimalReceipt
): CommandPreparation {
  const reject = (reason: string): CommandPreparation => ({
    kind: "receipt",
    receipt: { ...input, status: "rejected", reason }
  });
  if (previous) {
    return previous.skillId === input.skillId && sameTarget(previous.target, input.target)
      ? { kind: "receipt", receipt: structuredClone(previous) }
      : reject("request_id_conflict");
  }
  if (
    typeof input.requestId !== "string" ||
    !input.requestId.trim() ||
    typeof input.skillId !== "string" ||
    Object.keys(input).some((key) => !["id", "requestId", "skillId", "target"].includes(key))
  )
    return reject("invalid_request");
  const skill =
    Object.prototype.hasOwnProperty.call(skills, input.skillId) && !input.skillId.startsWith("_")
      ? skills[input.skillId]
      : undefined;
  if (!skill) return reject("unknown_skill");
  if (!skill.requiresTarget)
    return input.target === undefined ? { kind: "execute", input } : reject("unexpected_target");
  const target = input.target;
  if (!target) return reject("target_required");
  if (target.query !== "position") return reject("unknown_target_query");
  if (Object.keys(target).some((key) => key !== "query" && key !== "params")) return reject("invalid_target");
  const params = target.params;
  if (
    !params ||
    Object.keys(params).length !== 2 ||
    typeof params.x !== "number" ||
    typeof params.z !== "number" ||
    !Number.isFinite(params.x) ||
    !Number.isFinite(params.z)
  )
    return reject("invalid_target_parameters");
  const position = { x: params.x, z: params.z };
  if (!canReach(position)) return reject("target_unreachable");
  // Canonical property ordering also keeps the underlying task controller's saved request stable.
  return { kind: "execute", input: { ...input, target: { query: "position", params: position } } };
}

function sameTarget(left?: SeedWorldAnimalTarget, right?: SeedWorldAnimalTarget): boolean {
  if (!left || !right) return left === right;
  if (Object.keys(right).some((key) => key !== "query" && key !== "params") || left.query !== right.query) return false;
  const a = left.params ?? {},
    b = right.params ?? {};
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key])
  );
}
