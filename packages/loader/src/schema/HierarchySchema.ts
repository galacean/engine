import type { MutationBlock, RefItem, Vec3Tuple } from "./CommonSchema";

export interface ComponentSchema extends MutationBlock {
  type: string;
  script?: number;
}

export interface EntityOverrideProps {
  name?: string;
  isActive?: boolean;
  layer?: number;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
}

export interface InlineEntitySchema extends EntityOverrideProps {
  children?: InlineEntitySchema[];
  components?: ComponentSchema[];
}

export interface AddedEntityOverride {
  /** Parent path from prefab instance root via children indices. `[]` = instance root. */
  parent: number[];
  entity: InlineEntitySchema;
}

export interface AddedComponentOverride {
  /** Target entity path from prefab instance root via children indices. `[]` = instance root. */
  target: number[];
  component: ComponentSchema;
}

export interface EntityPropOverride extends EntityOverrideProps {
  /** Path from prefab instance root via children indices. `[]` = instance root. */
  path: number[];
}

export interface ComponentSelector {
  type: string;
  index: number;
}

export interface ComponentOverride extends MutationBlock {
  /** Path from prefab instance root via children indices. `[]` = instance root. */
  path: number[];
  selector: ComponentSelector;
}

export interface RemovedComponentOverride {
  /** Path from prefab instance root via children indices. `[]` = instance root. */
  path: number[];
  selectors: ComponentSelector[];
}

export interface InstanceOverrides {
  entityProps?: EntityPropOverride[];
  componentProps?: ComponentOverride[];
  /** Each element is a path from prefab instance root via children indices. */
  removedEntities?: number[][];
  removedComponents?: RemovedComponentOverride[];
  addedEntities?: AddedEntityOverride[];
  addedComponents?: AddedComponentOverride[];
}

export interface InstanceSchema {
  asset: number;
  overrides?: InstanceOverrides;
}

export interface NormalEntitySchema extends EntityOverrideProps {
  children?: number[];
  components?: number[];
  instance?: undefined;
}

export interface PrefabInstanceEntitySchema {
  instance: InstanceSchema;
}

export type EntitySchema = NormalEntitySchema | PrefabInstanceEntitySchema;

/** Common base for v2 scene and prefab files. */
export interface HierarchyFile {
  version: "2.0";
  refs: RefItem[];
  entities: EntitySchema[];
  components: ComponentSchema[];
}
