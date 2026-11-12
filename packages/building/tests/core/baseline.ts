// What the online building path produced, frozen into JSON before that path was deleted. The
// acceptance tests compare the core against these values. Each file holds one test file's
// values, keyed by case.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function baseline<T>(file: string): Readonly<Record<string, T>> {
  return frozen(file);
}
/** A whole baseline file. */
export function frozen<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(__dirname, "baselines", `${file}.json`), "utf8"));
}

/** A digest of plain data that does not depend on the order of object keys. */
export function digest(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical((v as Record<string, unknown>)[k])])
          )
        : v;
  return createHash("sha1")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
