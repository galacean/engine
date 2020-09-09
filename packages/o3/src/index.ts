export * from "@alipay/o3-core";
export * from "@alipay/o3-loader";
export * from "@alipay/o3-math";
export * from "@alipay/o3-rhi-webgl";
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
  PlaneProbe
} from "@alipay/o3-core";
import { Parser, GLTFModel } from "@alipay/o3-loader";
// import { MarsComponent } from "@alipay/o3-mars";

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
  // MarsComponent
});
