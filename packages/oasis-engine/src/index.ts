export * from "@oasis-engine/core";
export * from "@oasis-engine/loader";
export * from "@oasis-engine/math";
export * from "@oasis-engine/rhi-webgl";
import {
  BoxCollider,
  SphereCollider,
  AmbientLight,
  Camera,
  Component,
  DirectLight,
  EnvironmentMapLight,
  GeometryRenderer,
  ParticleRenderer,
  PointLight,
  SkyBox,
  SpriteRenderer,
  Model
} from "@oasis-engine/core";
import { Parser, GLTFModel } from "@oasis-engine/loader";
Parser.registerComponents("o3", {
  GLTFModel,
  SpriteRenderer,
  PointLight,
  AmbientLight,
  DirectLight,
  EnvironmentMapLight,
  ParticleRenderer,
  SkyBox,
  BoxCollider,
  GeometryRenderer,
  Camera,
  Component,
  SphereCollider,
  Model
});
//@ts-ignore
export const version = `__buildVersion`;

console.log(`oasis engine version: ${version}`);
