export * from "@alipay/o3-2d";
export * from "@alipay/o3-animation";
export * from "@alipay/o3-bounding-info";
export * from "@alipay/o3-collider";
export * from "@alipay/o3-collision";
export * from "@alipay/o3-core";
export * from "@alipay/o3-decal";
export * from "@alipay/o3-draco";
export * from "@alipay/o3-env-probe";
export * from "@alipay/o3-fog";
export * from "@alipay/o3-framebuffer-picker";
export * from "@alipay/o3-free-controls";
export * from "@alipay/o3-fsm";
export * from "@alipay/o3-geometry";
export * from "@alipay/o3-geometry-shape";
export * from "@alipay/o3-hud";
export * from "@alipay/o3-lighting";
export * from "@alipay/o3-loader";
// export * from "@alipay/o3-loader-gltf";
export * from "@alipay/o3-material";
export * from "@alipay/o3-math";
export * from "@alipay/o3-mesh";
export * from "@alipay/o3-mobile-material";
export * from "@alipay/o3-orbit-controls";
export * from "@alipay/o3-particle";
export * from "@alipay/o3-pbr";
// export * from '@alipay/o3-post-processing';
export * from "@alipay/o3-primitive";
export * from "@alipay/o3-renderer-cull";
export * from "@alipay/o3-rfui";
export * from "@alipay/o3-rhi-webgl";
export * from "@alipay/o3-scene-loader";
export * from "@alipay/o3-shaderlib";
export * from "@alipay/o3-skybox";
export * from "@alipay/o3-trail";
export * from "@alipay/o3-tween";
// import { RegistExtension } from "@alipay/o3-loader-gltf";
// import { TextureMaterial, TransparentMaterial } from "@alipay/o3-mobile-material";
// import { PBRMaterial } from "@alipay/o3-pbr";
import { SpriteRenderer } from "@alipay/o3-2d";
import { BoxCollider, SphereCollider } from "@alipay/o3-collider";
import { Camera, Component } from "@alipay/o3-core";
import { PlaneProbe } from "@alipay/o3-env-probe";
import { GeometryRenderer } from "@alipay/o3-geometry";
import { Model } from "@alipay/o3-geometry-shape";
import { AmbientLight, DirectLight, EnvironmentMapLight, PointLight } from "@alipay/o3-lighting";
import { GLTFModel } from "@alipay/o3-loader";
import { Particle } from "@alipay/o3-particle";
import "@alipay/o3-raycast";
import { Parser } from "@alipay/o3-scene-loader";
import "@alipay/o3-shadow";
import { ASkyBox } from "@alipay/o3-skybox";

Parser.registerComponents("o3", {
  GLTFModel,
  SpriteRenderer,
  PointLight,
  AmbientLight,
  DirectLight,
  EnvironmentMapLight,
  Particle,
  ASkyBox,
  BoxCollider,
  GeometryRenderer,
  Camera,
  Component,
  SphereCollider,
  PlaneProbe,
  Model
});

// RegistExtension({ PBRMaterial, TextureMaterial, TransparentMaterial });
