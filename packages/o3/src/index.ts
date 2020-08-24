export * from "@alipay/o3-core";
export * from "@alipay/o3-draco";
export * from "@alipay/o3-framebuffer-picker";
export * from "@alipay/o3-free-controls";
export * from "@alipay/o3-fsm";
export * from "@alipay/o3-hud";
export * from "@alipay/o3-loader";
// export * from "@alipay/o3-loader-gltf";
export * from "@alipay/o3-math";
export * from "@alipay/o3-orbit-controls";
// export * from '@alipay/o3-post-processing';
export * from "@alipay/o3-rfui";
export * from "@alipay/o3-rhi-webgl";
export * from "@alipay/o3-tween";
// import { RegistExtension } from "@alipay/o3-loader-gltf";
import {
  BoxCollider,
  SphereCollider,
  AmbientLight,
  Camera,
  Component,
  DirectLight,
  EnvironmentMapLight,
  GeometryRenderer,
  Model,
  Particle,
  PointLight,
  SkyBox,
  SpriteRenderer,
  PlaneProbe,
  GLTFModel
} from "@alipay/o3-core";
export { Parser } from "@alipay/o3-loader";

Parser.registerComponents("o3", {
  Model,
  GLTFModel,
  SpriteRenderer,
  PointLight,
  AmbientLight,
  DirectLight,
  EnvironmentMapLight,
  Particle,
  SkyBox,
  BoxCollider,
  GeometryRenderer,
  Camera,
  Component,
  SphereCollider,
  PlaneProbe
});

// RegistExtension({ PBRMaterial, TextureMaterial, TransparentMaterial });
