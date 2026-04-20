import type { RefItem } from "./CommonSchema";

export function resolveRefItem(refs: RefItem[], index: number, owner: string, label: string): RefItem {
  if (!Number.isInteger(index) || index < 0 || index >= refs.length) {
    throw new Error(`${owner}: invalid ref index ${index} for ${label}`);
  }

  return refs[index];
}
