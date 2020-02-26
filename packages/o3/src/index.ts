export * from "@alipay/o3-2d";
export * from "@alipay/o3-animation";
export * from "@alipay/o3-base";
export * from "@alipay/o3-collider";
export * from "@alipay/o3-collision";
export * from "@alipay/o3-core";
export * from "@alipay/o3-default-camera";
export * from "@alipay/o3-fog";
export * from "@alipay/o3-framebuffer-picker";
export * from "@alipay/o3-free-controls";
export * from "@alipay/o3-fsm";
export * from "@alipay/o3-geometry";
export * from "@alipay/o3-geometry-shape";
export * from "@alipay/o3-hud";
export * from "@alipay/o3-lighting";
export * from "@alipay/o3-loader";
export * from "@alipay/o3-loader-gltf";
export * from "@alipay/o3-material";
export * from "@alipay/o3-math";
export * from "@alipay/o3-mesh";
export * from "@alipay/o3-mobile-material";
export * from "@alipay/o3-orbit-controls";
export * from "@alipay/o3-particle";
export * from "@alipay/o3-pbr";
// export * from '@alipay/o3-post-processing';
export * from "@alipay/o3-primitive";
import "@alipay/o3-raycast";
export * from "@alipay/o3-renderer-basic";
export * from "@alipay/o3-renderer-cull";
export * from "@alipay/o3-request";
export * from "@alipay/o3-rfui";
export * from "@alipay/o3-rhi-webgl";
export * from "@alipay/o3-shaderlib";
import "@alipay/o3-shadow";
export * from "@alipay/o3-skybox";
export * from "@alipay/o3-trail";
export * from "@alipay/o3-tween";
export * from "@alipay/o3-env-probe";
export * from "@alipay/o3-bounding-info";

export {
  AnimationClip as AnimationClipNew,
  Animation,
  Animator,
  AAnimation as AAnimationNew,
  AAnimator,
  AnimationClipType
} from "@alipay/o3-animator";
import { PBRMaterial } from "@alipay/o3-pbr";
import { TextureMaterial, TransparentMaterial } from "@alipay/o3-mobile-material";
import { RegistExtension } from "@alipay/o3-loader-gltf";
RegistExtension({ PBRMaterial, TextureMaterial, TransparentMaterial });
