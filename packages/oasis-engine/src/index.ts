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
  Particle,
  PointLight,
  SkyBox,
  SpriteRenderer,
  PlaneProbe
} from "@oasis-engine/core";
import { Parser, GLTFModel } from "@oasis-engine/loader";

Parser.registerComponents("o3", {
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
