import { deriveSeed } from "./random";
import {
  authorConnectionKey,
  authorPartKey,
  compareKeys,
  derivedConnectionKey,
  derivedPartKey,
  detectedConnectionKey,
  validId,
  validTypeName,
  type PartIdentity
} from "./identity";
import {
  bindSurfaces,
  EffectiveGeometry,
  geometryIssue,
  modificationIssue,
  type BuildingEnvironment,
  type BuildingGeometry,
  type GeometryModification
} from "./geometry";
import { unitIssue, type BuildingUnit } from "./unit";
import { laidUnit, layingContext, type PartLayout } from "./expansion";
import { defaultLaying } from "./algorithms";
import {
  attachPairKey,
  joinPairKey,
  type ConnectionDef,
  type DerivedConnectionSpec,
  type ParticipantView,
  type PartRef,
  type RuleResult
} from "./connection";
import type { BuildingRegistry } from "./builtins";

export interface BuildingGroupDef {
  readonly id: string;
  readonly seed: number;
  /** Values shared by the group's parts. Any parameter written as { $shared: "name" } reads one. */
  readonly shared?: Readonly<Record<string, unknown>>;
  /** Group-level rule overrides, keyed by attachPairKey / joinPairKey. */
  readonly rules?: Readonly<Record<string, string>>;
}
export interface BuildingAlgorithmRef {
  readonly type: string;
  readonly params?: Readonly<Record<string, unknown>>;
}
export interface BuildingPartDef {
  readonly id: string;
  readonly group: string;
  readonly type: string;
  readonly geometry: { readonly generator: string; readonly params?: Readonly<Record<string, unknown>> };
  /** Optional for points and lines; see `defaultLaying`. Required for surfaces. */
  readonly algorithm?: BuildingAlgorithmRef;
  readonly unit?: BuildingUnit;
}
/** Author data of one frame: groups, base parts and explicit connections. */
export interface BuildingCoreDraft {
  readonly groups: readonly BuildingGroupDef[];
  readonly parts: readonly BuildingPartDef[];
  readonly connections?: readonly ConnectionDef[];
}
export interface BuildingDiagnostic {
  /** Key of the part or connection the message is about. */
  readonly source: string;
  readonly message: string;
}
export interface ResolvedPart {
  readonly key: string;
  readonly identity: PartIdentity;
  readonly type: string;
  readonly group: string;
  readonly seed: number;
  readonly original: BuildingGeometry;
  /** Applied in this order: by connection key, then by position in the rule result. */
  readonly modifications: readonly GeometryModification[];
  readonly algorithm: BuildingAlgorithmRef;
  readonly unit?: BuildingUnit;
  /** How to lay the units again; absent without a unit or when laying failed. Laid units
   * are never stored. Expand them with `expandPart` when needed. */
  readonly layout?: PartLayout;
}
export interface BuildingDesignResult {
  readonly parts: readonly ResolvedPart[];
  readonly diagnostics: readonly BuildingDiagnostic[];
}
export interface BuildingDesignOptions {
  /** Levels of derived connections processed after the author level. */
  readonly maxDepth?: number;
  /** World queries such as the ground height. They must be pure; see BuildingEnvironment. */
  readonly environment?: BuildingEnvironment;
  /** Lay every unit once to check keys and ranges, then drop it. Default: true.
   * Turn it off only where another path checks the same layouts. */
  readonly validate?: boolean;
}

interface PartState {
  readonly key: string;
  readonly identity: PartIdentity;
  readonly type: string;
  readonly group: BuildingGroupDef;
  algorithm?: BuildingAlgorithmRef;
  readonly unit?: BuildingUnit;
  original?: BuildingGeometry;
  view?: EffectiveGeometry;
  guestOf?: string;
  readonly modifications: { order: string; index: number; modification: GeometryModification }[];
}
interface Pending {
  readonly key: string;
  readonly kind: "attach" | "join";
  readonly guest?: string;
  readonly hosts: readonly { readonly part: string; readonly element?: string }[];
  readonly parts: readonly string[];
  readonly rule?: string;
  readonly params: Readonly<Record<string, unknown>>;
}

const byId = <T extends { id: string }>(items: readonly T[]) => [...items].sort((a, b) => compareKeys(a.id, b.id));
const plain = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Replace every { $shared: name } with the group's shared value. Object keys are visited in sorted order. */
export function resolveShared(value: unknown, shared: Readonly<Record<string, unknown>>, path = "params"): unknown {
  if (Array.isArray(value)) return value.map((item, i) => resolveShared(item, shared, `${path}[${i}]`));
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort(compareKeys);
    const record = value as Record<string, unknown>;
    if (keys.length === 1 && keys[0] === "$shared") {
      const name = record.$shared;
      if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(shared, name))
        throw Error(`Missing shared value "${String(name)}" at ${path}`);
      return shared[name];
    }
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = resolveShared(record[key], shared, `${path}.${key}`);
    return out;
  }
  return value;
}

/** Group → base parts → connection rules (level by level) → effective geometry → laid units.
 * The result depends only on the draft content and the registry, never on array order. */
export function designBuildingCore(
  draft: BuildingCoreDraft,
  registry: BuildingRegistry,
  options: BuildingDesignOptions = {}
): BuildingDesignResult {
  const diagnostics: BuildingDiagnostic[] = [];
  const report = (source: string, message: string) => diagnostics.push({ source, message });
  const maxDepth = options.maxDepth ?? 8;
  const environment = options.environment ?? {};
  const surfaces = bindSurfaces(registry.surfaces, environment);

  // 1. Groups and base parts.
  const groups = new Map<string, BuildingGroupDef>();
  for (const group of byId(draft.groups ?? [])) {
    const key = JSON.stringify(["g", group.id]);
    if (!validId(group.id)) report(key, "Group id must be a non-empty string");
    else if (groups.has(group.id)) report(key, "Duplicate group id");
    else if (!Number.isSafeInteger(group.seed)) report(key, "Group seed must be an integer");
    else groups.set(group.id, group);
  }
  const states = new Map<string, PartState>();
  const definitions = new Map<string, BuildingPartDef>();
  for (const part of byId(draft.parts ?? [])) {
    const key = authorPartKey(part.id);
    const group = groups.get(part.group);
    const unitProblem = part.unit && unitIssue(part.unit);
    if (!validId(part.id)) report(key, "Part id must be a non-empty string");
    else if (states.has(key)) report(key, "Duplicate part id");
    else if (!group) report(key, `Unknown group "${part.group}"`);
    else if (!validTypeName(part.type)) report(key, `Invalid part type "${part.type}"`);
    else if (unitProblem) report(key, unitProblem);
    else {
      states.set(key, {
        key,
        identity: { kind: "author", id: part.id },
        type: part.type,
        group,
        algorithm: part.algorithm,
        unit: part.unit,
        modifications: []
      });
      definitions.set(key, part);
    }
  }

  // 2. Explicit connections.
  const author: Pending[] = [];
  const connectionIds = new Set<string>();
  for (const connection of byId(draft.connections ?? [])) {
    const key = authorConnectionKey(connection.id);
    if (!validId(connection.id)) report(key, "Connection id must be a non-empty string");
    else if (connectionIds.has(connection.id)) report(key, "Duplicate connection id");
    else {
      connectionIds.add(connection.id);
      const pending = authorPending(connection, key, states, report);
      if (pending) author.push(pending);
    }
  }

  // 3. Original geometry of base parts, hosts before guests.
  const viewOf = (state: PartState, element?: string): ParticipantView => ({
    key: state.key,
    identity: state.identity,
    type: state.type,
    group: state.group.id,
    unit: state.unit,
    element,
    geometry: state.view!
  });
  const setGeometry = (state: PartState, geometry: BuildingGeometry): boolean => {
    const issue = geometryIssue(geometry, surfaces);
    if (issue) {
      report(state.key, issue);
      return false;
    }
    state.original = geometry;
    state.view = new EffectiveGeometry(geometry, [], surfaces);
    return true;
  };
  const attachOf = new Map(author.filter((c) => c.kind === "attach").map((c) => [c.guest!, c]));
  const waiting = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const [guest, connection] of attachOf) {
    const hosts = [...new Set(connection.hosts.map((h) => h.part))];
    waiting.set(guest, hosts.length);
    for (const host of hosts) dependents.set(host, [...(dependents.get(host) ?? []), guest]);
  }
  const ready = [...states.keys()].filter((key) => !waiting.get(key)).sort(compareKeys);
  const visited = new Set<string>();
  while (ready.length) {
    const key = ready.shift()!;
    visited.add(key);
    const state = states.get(key)!,
      definition = definitions.get(key)!;
    const connection = attachOf.get(key);
    const hosts = connection?.hosts ?? [];
    if (hosts.some((h) => !states.get(h.part)?.original)) report(key, "A host has no geometry");
    else
      try {
        const generator = registry.geometry.get(definition.geometry?.generator);
        if (!generator) throw Error(`Unknown geometry generator "${definition.geometry?.generator}"`);
        const params = resolveShared(definition.geometry.params ?? {}, state.group.shared ?? {});
        const views = hosts.map((h) => viewOf(states.get(h.part)!, h.element));
        setGeometry(state, generator(params, { hosts: views, environment }));
      } catch (error) {
        report(key, (error as Error).message);
      }
    for (const guest of dependents.get(key) ?? []) {
      const left = waiting.get(guest)! - 1;
      waiting.set(guest, left);
      if (left === 0) insertSorted(ready, guest);
    }
  }
  for (const key of [...states.keys()].sort(compareKeys))
    if (!visited.has(key)) report(key, "Attach connections form a cycle");

  // 4. Peer detection between base parts.
  const explicitPairs = new Set(
    author.filter((c) => c.kind === "join").map((c) => detectedConnectionKey(c.parts[0], c.parts[1]))
  );
  const detected: Pending[] = [];
  const located = [...states.values()].filter((s) => s.original).sort((a, b) => compareKeys(a.key, b.key));
  for (let i = 0; i < located.length; i++)
    for (let j = i + 1; j < located.length; j++) {
      const [a, b] =
        compareKeys(located[i].type, located[j].type) <= 0 ? [located[i], located[j]] : [located[j], located[i]];
      const detector = registry.detectors.get(joinPairKey(a.type, b.type));
      const key = detectedConnectionKey(a.key, b.key);
      if (!detector || explicitPairs.has(key)) continue;
      try {
        if (detector(viewOf(a), viewOf(b)))
          detected.push({ key, kind: "join", hosts: [], parts: [a.key, b.key], params: {} });
      } catch (error) {
        report(key, (error as Error).message);
      }
    }

  // 5. Rules, level by level. Derived connections run on the next level.
  let level = [...author, ...detected].sort((a, b) => compareKeys(a.key, b.key));
  for (let depth = 0; level.length; depth++) {
    if (depth > maxDepth) {
      for (const item of level) report(item.key, `Derived connections exceed depth ${maxDepth}`);
      break;
    }
    const next: Pending[] = [];
    for (const item of level) runRule(item, next);
    level = next.sort((a, b) => compareKeys(a.key, b.key));
  }

  function ownerGroup(item: Pending): BuildingGroupDef {
    return states.get(item.kind === "attach" ? item.guest! : [...item.parts].sort(compareKeys)[0])!.group;
  }
  function chooseRule(item: Pending): string | undefined {
    const participants = [item.guest, ...item.hosts.map((h) => h.part), ...item.parts].filter(Boolean) as string[];
    const types = (keys: readonly string[]) => keys.map((k) => states.get(k)!.type);
    const pair =
      item.kind === "attach"
        ? attachPairKey(states.get(item.guest!)!.type, types(item.hosts.map((h) => h.part)))
        : joinPairKey(...(types(item.parts) as [string, string]));
    if (item.rule !== undefined) return item.rule;
    const owners = item.kind === "attach" ? [item.guest!] : participants;
    const overrides = [
      ...new Set(owners.map((k) => states.get(k)!.group.rules?.[pair]).filter((r) => r !== undefined))
    ];
    if (overrides.length > 1) {
      report(item.key, `Groups override ${pair} with different rules: ${overrides.join(", ")}`);
      return;
    }
    const rule = overrides[0] ?? registry.defaults.get(pair);
    if (rule === undefined) report(item.key, `No rule for ${pair}`);
    return rule;
  }
  function runRule(item: Pending, next: Pending[]) {
    const participants = [item.guest, ...item.hosts.map((h) => h.part), ...item.parts].filter(Boolean) as string[];
    if (participants.some((k) => !states.get(k)?.original)) {
      report(item.key, "A participant has no geometry");
      return;
    }
    const ruleId = chooseRule(item);
    if (ruleId === undefined) return;
    const rule = registry.rules.get(ruleId);
    if (!rule) {
      report(item.key, `Unknown connection rule "${ruleId}"`);
      return;
    }
    const guest = item.guest ? viewOf(states.get(item.guest)!) : undefined;
    const hosts = item.hosts.map((h) => viewOf(states.get(h.part)!, h.element));
    const parts = item.kind === "attach" ? [guest!, ...hosts] : item.parts.map((k) => viewOf(states.get(k)!));
    let result: RuleResult;
    try {
      result = rule({
        key: item.key,
        kind: item.kind,
        params: item.params,
        seed: deriveSeed(ownerGroup(item).seed, item.key),
        guest,
        hosts,
        parts
      });
    } catch (error) {
      report(item.key, (error as Error).message);
      return;
    }
    applyResult(item, result ?? {}, new Set(participants), next);
  }
  function applyResult(item: Pending, result: RuleResult, participants: Set<string>, next: Pending[]) {
    for (const message of result.diagnostics ?? []) report(item.key, String(message));
    const derived = new Map<string, string>();
    for (const spec of result.derive ?? []) {
      const key = derivedPartKey(item.key, spec.localId);
      const group = spec.group === undefined ? ownerGroup(item) : groups.get(spec.group);
      const unitProblem = spec.unit && unitIssue(spec.unit);
      if (!validId(spec.localId) || derived.has(spec.localId)) report(key, "Derived parts need unique local ids");
      else if (!group) report(key, `Unknown group "${spec.group}"`);
      else if (!validTypeName(spec.type)) report(key, `Invalid part type "${spec.type}"`);
      else if (unitProblem) report(key, unitProblem);
      else {
        const state: PartState = {
          key,
          identity: { kind: "derived", connection: item.key, localId: spec.localId },
          type: spec.type,
          group,
          algorithm: spec.algorithm,
          unit: spec.unit,
          modifications: []
        };
        if (setGeometry(state, spec.geometry)) {
          states.set(key, state);
          derived.set(spec.localId, key);
        }
      }
    }
    (result.modify ?? []).forEach(({ part, modification }, index) => {
      const target = states.get(part);
      if (!participants.has(part) || !target) report(item.key, `Rule may only modify its participants, not ${part}`);
      else {
        const issue = modificationIssue(target.original!, modification);
        if (issue) report(item.key, issue);
        else target.modifications.push({ order: item.key, index, modification });
      }
    });
    const resolve = (ref: PartRef): string | undefined => {
      const key = "derived" in ref ? derived.get(ref.derived) : participants.has(ref.part) ? ref.part : undefined;
      if (!key) report(item.key, `Derived connection refers to ${JSON.stringify(ref)}, which is not available`);
      return key;
    };
    const localIds = new Set<string>();
    for (const spec of result.connect ?? []) {
      const key = derivedConnectionKey(item.key, spec.localId);
      if (!validId(spec.localId) || localIds.has(spec.localId)) {
        report(key, "Derived connections need unique local ids");
        continue;
      }
      localIds.add(spec.localId);
      const pending = derivedPending(spec, key, resolve);
      if (!pending) continue;
      if (pending.kind === "attach") {
        const guest = states.get(pending.guest!)!;
        if (guest.guestOf) {
          report(key, "A part can be the guest of only one attach connection");
          continue;
        }
        guest.guestOf = key;
      }
      next.push(pending);
    }
  }

  // 6. Effective geometry and laid units.
  const parts: ResolvedPart[] = [];
  for (const state of [...states.values()].sort((a, b) => compareKeys(a.key, b.key))) {
    if (!state.original) continue;
    const modifications = state.modifications
      .sort((a, b) => compareKeys(a.order, b.order) || a.index - b.index)
      .map((m) => m.modification);
    const seed = deriveSeed(state.group.seed, state.key);
    // A part publishes a layout only when all of its units are valid.
    let layout: PartLayout | undefined;
    if (state.unit)
      try {
        const unit = state.unit;
        const kinds = new Set(Object.values(state.original.elements).map((e) => e.kind));
        state.algorithm ??= defaultLaying(kinds);
        const algorithm = registry.algorithms.get(state.algorithm.type);
        if (!algorithm) throw Error(`Unknown laying algorithm "${state.algorithm.type}"`);
        const accepts = algorithm.info?.accepts;
        if (accepts && !accepts.some((kind) => kinds.has(kind)))
          throw Error(`${state.algorithm.type} lays ${accepts.join(" or ")} elements; this geometry has none`);
        const params = plain(resolveShared(state.algorithm.params ?? {}, state.group.shared ?? {}));
        const context = layingContext(
          { seed, original: state.original, modifications, algorithm: state.algorithm },
          unit,
          params,
          registry,
          environment
        );
        const plan = algorithm.plan(context);
        if (!Number.isSafeInteger(plan.count) || plan.count < 0)
          throw Error("Layout count must be a non-negative integer");
        // Plain JSON only, so layouts cross Worker boundaries and persist unchanged.
        const data = plan.data === undefined ? null : JSON.parse(JSON.stringify(plan.data));
        if (options.validate !== false) {
          const keys = new Set<string>();
          for (let i = 0; i < plan.count; i++) {
            const spec = algorithm.unitAt(context, data, i);
            if (!spec) continue;
            const laid = laidUnit(context, spec);
            if (keys.has(laid.key)) throw Error("Laid unit keys must be unique strings");
            keys.add(laid.key);
          }
        }
        layout = { params, count: plan.count, data };
      } catch (error) {
        report(state.key, (error as Error).message);
        layout = undefined;
      }
    parts.push({
      key: state.key,
      identity: state.identity,
      type: state.type,
      group: state.group.id,
      seed,
      original: state.original,
      modifications,
      algorithm: state.algorithm ?? { type: "none" },
      unit: state.unit,
      ...(layout && { layout })
    });
  }
  return { parts, diagnostics };
}

function insertSorted(list: string[], value: string) {
  let i = 0;
  while (i < list.length && compareKeys(list[i], value) < 0) i++;
  list.splice(i, 0, value);
}
function authorPending(
  connection: ConnectionDef,
  key: string,
  states: Map<string, PartState>,
  report: (source: string, message: string) => void
): Pending | undefined {
  const params = plain(connection.params);
  if (connection.kind === "attach") {
    const guest = authorPartKey(connection.guest);
    const hosts = (Array.isArray(connection.hosts) ? connection.hosts : []).map((h) => ({
      part: authorPartKey(h.part),
      element: h.element
    }));
    const state = states.get(guest);
    if (!state) report(key, `Unknown guest "${connection.guest}"`);
    else if (!hosts.length) report(key, "Attach needs at least one host");
    else if (hosts.some((h) => !states.has(h.part))) report(key, "Attach refers to an unknown host");
    else if (hosts.some((h) => h.part === guest)) report(key, "A part cannot attach to itself");
    else if (state.guestOf) report(key, "A part can be the guest of only one attach connection");
    else {
      state.guestOf = key;
      return { key, kind: "attach", guest, hosts, parts: [], rule: connection.rule, params };
    }
    return;
  }
  if (connection.kind === "join") {
    const list = Array.isArray(connection.parts) ? connection.parts.map(authorPartKey) : [];
    if (list.length !== 2 || list[0] === list[1]) report(key, "Join needs two different parts");
    else if (list.some((p) => !states.has(p))) report(key, "Join refers to an unknown part");
    else return { key, kind: "join", hosts: [], parts: [...list].sort(compareKeys), rule: connection.rule, params };
    return;
  }
  report(key, `Unknown connection kind "${(connection as { kind: unknown }).kind}"`);
}
function derivedPending(
  spec: DerivedConnectionSpec,
  key: string,
  resolve: (ref: PartRef) => string | undefined
): Pending | undefined {
  const params = plain(spec.params);
  if (spec.kind === "attach") {
    const guest = resolve(spec.guest);
    const hosts = spec.hosts.map((h) => ({ part: resolve(h.ref), element: h.element }));
    if (!guest || hosts.some((h) => !h.part) || !hosts.length) return;
    return { key, kind: "attach", guest, hosts: hosts as Pending["hosts"], parts: [], rule: spec.rule, params };
  }
  const list = spec.parts.map(resolve);
  if (list.some((p) => !p) || list[0] === list[1]) return;
  return { key, kind: "join", hosts: [], parts: (list as string[]).sort(compareKeys), rule: spec.rule, params };
}
