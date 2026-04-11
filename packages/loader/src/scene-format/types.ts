/**
 * Galacean Scene/Prefab v2 file format types.
 * glTF-inspired flat-array structure with integer index references.
 */

export type Vec3Tuple = [number, number, number];
export type Vec4Tuple = [number, number, number, number];

export interface AssetRef {
  $ref: string;
  key?: string;
}

export interface GalaceanComponentSchema {
  type: string;
  script?: AssetRef;
  props?: Record<string, unknown>;
}

export interface GalaceanEntityOverrideProps {
  name?: string;
  isActive?: boolean;
  layer?: number;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
}

export interface GalaceanInlineEntitySchema {
  name?: string;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
  children?: GalaceanInlineEntitySchema[];
  components?: GalaceanComponentSchema[];
  isActive?: boolean;
  layer?: number;
}

export interface GalaceanAddedEntityOverride {
  parent: number[];
  entity: GalaceanInlineEntitySchema;
}

export interface GalaceanAddedComponentOverride {
  target: number[];
  component: GalaceanComponentSchema;
}

export interface GalaceanInstanceOverrides {
  entityProps?: Record<string, GalaceanEntityOverrideProps>;
  componentProps?: Record<string, Record<string, Record<string, unknown>>>;
  removedEntities?: number[][];
  removedComponents?: Record<string, string[]>;
  addedEntities?: GalaceanAddedEntityOverride[];
  addedComponents?: GalaceanAddedComponentOverride[];
}

export interface GalaceanInstanceSchema {
  asset: AssetRef;
  overrides?: GalaceanInstanceOverrides;
}

export interface GalaceanEntitySchema {
  name?: string;
  children?: number[];
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
  components?: number[];
  isActive?: boolean;
  layer?: number;
  instance?: GalaceanInstanceSchema;
}

export interface GalaceanSceneSchema {
  name?: string;
  entities: number[];
  background?: Record<string, unknown>;
  ambient?: Record<string, unknown>;
  shadow?: Record<string, unknown>;
  fog?: Record<string, unknown>;
  ambientOcclusion?: Record<string, unknown>;
}

/** Common base for v2 scene and prefab files. */
export interface IHierarchyFile {
  version: string;
  entities: GalaceanEntitySchema[];
  components: GalaceanComponentSchema[];
}

export interface GalaceanSceneFile extends IHierarchyFile {
  scene: GalaceanSceneSchema;
}

export interface GalaceanPrefabFile extends IHierarchyFile {
  root: number;
}
