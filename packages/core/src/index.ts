export { Engine } from "./Engine";
export { SystemInfo } from "./SystemInfo";
export type { Canvas } from "./Canvas";
export { EngineFeature } from "./EngineFeature";

export { Scene } from "./Scene";
export { SceneFeature } from "./SceneFeature";
export { SceneManager } from "./SceneManager";

export { Entity } from "./Entity";
export { Component } from "./Component";
export { Script } from "./Script";
export { Renderer } from "./Renderer";
export { dependencies } from "./ComponentsDependencies";
export { Camera } from "./Camera";
export { Transform } from "./Transform";
export { UpdateFlag } from "./UpdateFlag";
export { request } from "./asset/request";
export { Loader } from "./asset/Loader";
export { ResourceManager, resourceLoader } from "./asset/ResourceManager";
export { AssetPromise, AssetPromiseStatus } from "./asset/AssetPromise";
export type { LoadItem } from "./asset/LoadItem";
export { AssetType } from "./asset/AssetType";
export { RefObject } from "./asset/RefObject";

export { BasicRenderPipeline } from "./RenderPipeline/BasicRenderPipeline";
export { RenderQueue } from "./RenderPipeline/RenderQueue";
export { RenderPass } from "./RenderPipeline/RenderPass";
export { RenderElement } from "./RenderPipeline/RenderElement";
export { SpriteElement } from "./RenderPipeline/SpriteElement";
export * from "./base";

// Lighting
import { LightFeature, hasLight } from "./lighting/LightFeature";
import { Scene } from "./Scene";
Scene.registerFeature(LightFeature);
(Scene.prototype as any).hasLight = hasLight;

export { PhysicsManager, HitResult } from "./PhysicsManager";

export { Background } from "./Background";
export { BackgroundMode } from "./enums/BackgroundMode";
export { CameraClearFlags } from "./enums/CameraClearFlags";
export * from "./lighting/index";
export * from "./material/index";
export * from "./texture/index";
export * from "./graphic/index";
export * from "./2d/index";
export * from "./shaderlib/index";
export * from "./animation/index";
export * from "./mesh/index";
export * from "./sky/index";
export * from "./particle/index";
export * from "./trail/index";
export * from "./collider/index";
export * from "./collision/index";
export * from "./fog/index";
export * from "./env-probe/index";
export * from "./shadow/index";
export * from "./shader/index";
export * from "./Layer";
export * from "./clone/CloneManager";
export * from "./renderingHardwareInterface/index";
