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

// TODO: 构建一个命名空间+方法的实体，Parser._components['o3']可以获取注册的所有的方法，
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

// TODO:这里编译时候通过rollup替换为package 中的version
//@ts-ignore
export const version = `__buildVersion`;

console.log(`oasis engine version: ${version}`);
