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

/** Convert v2 AssetRef { $ref } → engine format { url } for getResourceByRef. */
export function assetRefToEngine(ref: AssetRef): { url: string; key?: string } {
  return ref.key ? { url: ref.$ref, key: ref.key } : { url: ref.$ref };
}

export interface GalaceanAssetInfo {
  version: string;
  generator?: string;
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
  isLocked?: boolean;
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
  isLocked?: boolean;
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
  isLocked?: boolean;
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
  entities: GalaceanEntitySchema[];
  components: GalaceanComponentSchema[];
  /** Editor-only: stable entity IDs for round-trip serialization. Not consumed at runtime. */
  _entityIds?: string[];
  /** Editor-only: stable component IDs for round-trip serialization. Not consumed at runtime. */
  _componentIds?: string[];
}

export interface GalaceanSceneFile extends IHierarchyFile {
  asset: GalaceanAssetInfo;
  scene: GalaceanSceneSchema;
}

export interface GalaceanPrefabFile extends IHierarchyFile {
  asset: GalaceanAssetInfo;
  root: number;
}
