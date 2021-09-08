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
  SpriteRenderer,
  SpriteMask,
  Animator
} from "@oasis-engine/core";
import { GLTFModel, Parser, Model } from "@oasis-engine/loader";

Parser.registerComponents("o3", {
  GLTFModel,
  SpriteRenderer,
  SpriteMask,
  PointLight,
  AmbientLight,
  DirectLight,
  ParticleRenderer,
  BoxCollider,
  Camera,
  Model,
  Component,
  SphereCollider,
  Animator
});

//@ts-ignore
export const version = `__buildVersion`;

console.log(`oasis engine version: ${version}`);
