export * from "@alipay/o3-2d";
export * from "@alipay/o3-animation";
export * from "@alipay/o3-core";
export * from "@alipay/o3-bounding-info";
export * from "@alipay/o3-collider";
export * from "@alipay/o3-collision";
// export * from "@alipay/o3-compressed-texture";
export * from "@alipay/o3-core";
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
export * from "@alipay/o3-shaderlib";
export * from "@alipay/o3-skybox";
export * from "@alipay/o3-trail";
export * from "@alipay/o3-tween";
// import { RegistExtension } from "@alipay/o3-loader-gltf";
// import { TextureMaterial, TransparentMaterial } from "@alipay/o3-mobile-material";
// import { PBRMaterial } from "@alipay/o3-pbr";
import "@alipay/o3-raycast";
import "@alipay/o3-shadow";
import { Parser } from "@alipay/o3-scene-loader";

import { GLTFModel } from "@alipay/o3-loader";
import { SpriteRenderer } from "@alipay/o3-2d";
import { PointLight, AmbientLight, DirectLight, EnvironmentMapLight } from "@alipay/o3-lighting";
import { ASkyBox } from "@alipay/o3-skybox";
import { Particle } from "@alipay/o3-particle";
import { BoxCollider, SphereCollider } from "@alipay/o3-collider";
import { GeometryRenderer } from "@alipay/o3-geometry";
import { Camera, Component } from "@alipay/o3-core";
import { PlaneProbe } from "@alipay/o3-env-probe";
import { Model } from "@alipay/o3-geometry-shape";

Parser.registerComponents("o3", {
  Model,
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
  PlaneProbe
});

export * from "@alipay/o3-scene-loader";

// RegistExtension({ PBRMaterial, TextureMaterial, TransparentMaterial });
