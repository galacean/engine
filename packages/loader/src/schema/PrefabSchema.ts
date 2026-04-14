import type { HierarchyFile } from "./HierarchySchema";

export interface PrefabFile extends HierarchyFile {
  root: number;
}
