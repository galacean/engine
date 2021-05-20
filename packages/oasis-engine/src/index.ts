export * from "@oasis-engine/core";
export * from "@oasis-engine/loader";
export * from "@oasis-engine/math";
export * from "@oasis-engine/rhi-webgl";
import {
  AmbientLight,
  BoxCollider,
  Camera,
  Component,
  DirectLight,
  ParticleRenderer,
  PointLight,
  SphereCollider,
  SpriteRenderer
} from "@oasis-engine/core";
import { GLTFModel, Parser, Model } from "@oasis-engine/loader";

Parser.registerComponents("o3", {
  GLTFModel,
  SpriteRenderer,
  PointLight,
  AmbientLight,
  DirectLight,
  ParticleRenderer,
  BoxCollider,
  Camera,
  Model,
  Component,
  SphereCollider
});

//@ts-ignore
export const version = `__buildVersion`;

console.log(`oasis engine version: ${version}`);
