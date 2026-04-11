/**
 * Galacean Scene/Prefab v2 file format types.
 * Flat-array structure with integer index references.
 */

import {
  BackgroundMode,
  BackgroundTextureFillMode,
  DiffuseMode,
  FogMode,
  ShadowCascadesMode,
  ShadowResolution
} from "@galacean/engine-core";

export type Vec3Tuple = [number, number, number];
export type Vec4Tuple = [number, number, number, number];

export interface AssetRef {
  $ref: string;
  key?: string;
}

export interface ComponentSchema {
  type: string;
  script?: AssetRef;
  props?: Record<string, unknown>;
}

export interface EntityOverrideProps {
  name?: string;
  isActive?: boolean;
  layer?: number;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
}

export interface InlineEntitySchema {
  name?: string;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
  children?: InlineEntitySchema[];
  components?: ComponentSchema[];
  isActive?: boolean;
  layer?: number;
}

export interface AddedEntityOverride {
  parent: number[];
  entity: InlineEntitySchema;
}

export interface AddedComponentOverride {
  target: number[];
  component: ComponentSchema;
}

export interface InstanceOverrides {
  entityProps?: Record<string, EntityOverrideProps>;
  componentProps?: Record<string, Record<string, Record<string, unknown>>>;
  removedEntities?: number[][];
  removedComponents?: Record<string, string[]>;
  addedEntities?: AddedEntityOverride[];
  addedComponents?: AddedComponentOverride[];
}

export interface InstanceSchema {
  asset: AssetRef;
  overrides?: InstanceOverrides;
}

export interface EntitySchema {
  name?: string;
  children?: number[];
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
  components?: number[];
  isActive?: boolean;
  layer?: number;
  instance?: InstanceSchema;
}

export enum SpecularMode {
  Sky = "Sky",
  Custom = "Custom"
}

/** Common base for v2 scene and prefab files. */
export interface HierarchyFile {
  version: string;
  entities: EntitySchema[];
  components: ComponentSchema[];
}

export interface SceneFile extends HierarchyFile {
  scene: {
    name?: string;
    entities: number[];
    background: {
      mode: BackgroundMode;
      color: Vec4Tuple;
      texture?: AssetRef;
      textureFillMode?: BackgroundTextureFillMode;
      skyMesh?: AssetRef;
      skyMaterial?: AssetRef;
    };
    ambient?: {
      diffuseMode: DiffuseMode;
      ambientLight?: AssetRef;
      customAmbientLight?: AssetRef;
      diffuseSolidColor?: Vec4Tuple;
      diffuseIntensity: number;
      specularIntensity: number;
      specularMode: SpecularMode;
    };
    shadow?: {
      castShadows: boolean;
      enableTransparentShadow: boolean;
      shadowResolution: ShadowResolution;
      shadowDistance: number;
      shadowCascades: ShadowCascadesMode;
      shadowTwoCascadeSplits: number;
      shadowFourCascadeSplits: Vec3Tuple;
      shadowFadeBorder: number;
    };
    fog?: {
      fogMode: FogMode;
      fogStart: number;
      fogEnd: number;
      fogDensity: number;
      fogColor: Vec4Tuple;
    };
    ambientOcclusion?: {
      bias: number;
      bilateralThreshold: number;
      enabledAmbientOcclusion: boolean;
      intensity: number;
      power: number;
      quality: number;
      radius: number;
      minHorizonAngle: number;
    };
  };
}

export interface PrefabFile extends HierarchyFile {
  root: number;
}
