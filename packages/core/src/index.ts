export { Engine } from "./Engine";
export type { HardwareRenderer } from "./EngineDesign/HardwareRenderer";
export type { Canvas } from "./EngineDesign/Canvas";
export { EngineFeature } from "./EngineFeature";
export { AssetObject } from "./asset/AssetObject";

export { Scene } from "./Scene";
export { SceneVisitor } from "./SceneVisitor";
export { SceneFeature } from "./SceneFeature";

export { Entity } from "./Entity";
export { Component } from "./Component";
export { Script } from "./Script";
export { RenderableComponent } from "./RenderableComponent";
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
export { ReferenceObject } from "./asset/ReferenceObject";

export { BasicRenderPipeline } from "./RenderPipeline/BasicRenderPipeline";
export { RenderQueue } from "./RenderPipeline//RenderQueue";
export { RenderContext } from "./RenderPipeline/RenderContext";
export { RenderPass } from "./RenderPipeline/RenderPass";
export * from "./base";

//Lighting
import { LightFeature, hasLight } from "./lighting/LightFeature";
import { Scene } from "./Scene";
Scene.registerFeature(LightFeature);
(Scene.prototype as any).hasLight = hasLight;
export { LightFeature };
export { AmbientLight } from "./lighting/AmbientLight";
export { DirectLight } from "./lighting/DirectLight";
export { PointLight } from "./lighting/PointLight";
export { SpotLight } from "./lighting/SpotLight";
export { EnvironmentMapLight } from "./lighting/EnvironmentMapLight";
export { Light } from "./lighting/Light";
