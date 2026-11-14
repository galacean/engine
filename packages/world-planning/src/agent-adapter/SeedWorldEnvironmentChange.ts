import type { SeedWorldEnvironmentUpdateInput } from "./ports/SeedWorldEnginePort";

type Path = readonly [string] | readonly [string, string];
type Value = { stored: unknown; fallback?: unknown };
type Options = Pick<SeedWorldEnvironmentUpdateInput, "transitionDuration" | "waitForIbl" | "fromTimeHours">;
const optionKeys = new Set(["transitionDuration", "waitForIbl", "fromTimeHours"]);
const groups = ["weatherChannels", "atmosphere"] as const;

/** Ordered forward configuration writes for a detached runtime draft. */
export interface SeedWorldEnvironmentChange {
  readonly kind: "environment";
  readonly fields: readonly { path: Path; after: Value }[];
  readonly afterGroups: readonly string[];
  readonly options: Options;
}

/** Capture explicit writes, including equal values; weather channels are atomic values. */
export function captureEnvironmentChange(
  settings: SeedWorldEnvironmentUpdateInput | undefined,
  forward: SeedWorldEnvironmentUpdateInput
): SeedWorldEnvironmentChange {
  const paths: Path[] = [];
  for (const key of Object.keys(forward)) {
    if (groups.some((group) => group === key) && read(forward, [key]) !== undefined) {
      for (const child of Object.keys(read(forward, [key]) as object)) paths.push([key, child]);
    } else paths.push([key]);
  }
  return {
    kind: "environment",
    fields: paths.map((path) => ({ path, after: value(read(forward, path)) })),
    afterGroups: [...new Set([...presentGroups(settings), ...presentGroups(forward)])],
    options: {
      transitionDuration: forward.transitionDuration,
      waitForIbl: forward.waitForIbl,
      ...(forward.fromTimeHours === undefined ? {} : { fromTimeHours: forward.fromTimeHours })
    }
  };
}

/** Runtime activation consumes the same values as the draft projection. */
export function environmentChangeInput(change: SeedWorldEnvironmentChange): SeedWorldEnvironmentUpdateInput {
  const input: Record<string, unknown> = {};
  for (const field of change.fields) {
    if (optionKeys.has(field.path[0])) continue;
    const endpoint = field.after;
    const target = endpoint.stored === undefined ? endpoint.fallback : endpoint.stored;
    if (target !== undefined) write(input, field.path, target);
  }
  return { ...input, ...change.options };
}

/** Apply only recorded fields; unrelated edits in the current draft remain intact. */
export function applyEnvironmentChange(
  settings: SeedWorldEnvironmentUpdateInput | undefined,
  change: SeedWorldEnvironmentChange
): SeedWorldEnvironmentUpdateInput | undefined {
  const result: Record<string, unknown> = structuredClone(settings ?? {});
  for (const field of change.fields) write(result, field.path, field.after.stored);
  for (const group of groups) {
    const child = result[group] as Record<string, unknown> | undefined;
    if (child && Object.keys(child).length === 0 && !change.afterGroups.includes(group)) delete result[group];
  }
  if (!Object.keys(result).length && !change.afterGroups.includes("root")) return undefined;
  return result as unknown as SeedWorldEnvironmentUpdateInput;
}

function value(stored: unknown, fallback?: unknown): Value {
  return structuredClone({ stored, ...(stored === undefined && fallback !== undefined ? { fallback } : {}) });
}
function presentGroups(settings: object | undefined): string[] {
  return settings ? ["root", ...groups.filter((group) => read(settings, [group]) !== undefined)] : [];
}
function read(source: object | undefined, path: Path): unknown {
  let current: unknown = source;
  for (const key of path)
    current =
      current && typeof current === "object" && Object.hasOwn(current, key)
        ? (current as Record<string, unknown>)[key]
        : undefined;
  return current;
}
function write(target: Record<string, unknown>, path: Path, value: unknown): void {
  let parent = target;
  if (path.length === 2) parent = (target[path[0]] ??= {}) as Record<string, unknown>;
  const key = path[path.length - 1]!;
  if (value === undefined) delete parent[key];
  else parent[key] = structuredClone(value);
}
