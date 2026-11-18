import type { Camera } from "./Camera";
import type { Renderer } from "./Renderer";
import type { Scene } from "./Scene";
import type { Script } from "./Script";
import type { Animator } from "./animation";
import { Logger } from "./base/Logger";

export function updateScript(script: Script, deltaTime: number): void {
  if (script._started) script.onUpdate(deltaTime);
}

export function lateUpdateScript(script: Script, deltaTime: number): void {
  if (script._started) script.onLateUpdate(deltaTime);
}

export function physicsUpdateScript(script: Script): void {
  if (script._started) script.onPhysicsUpdate();
}

export function updateComponent(component: Animator | Renderer, deltaTime: number): void {
  component.update(deltaTime);
}

export function beginRender(script: Script, camera: Camera): void {
  script.onBeginRender(camera);
}

export function endRender(script: Script, camera: Camera): void {
  script.onEndRender(camera);
}

export function setUpdateIndex(component: Script | Animator | Renderer, index: number): void {
  component._onUpdateIndex = index;
}

export function setLateUpdateIndex(script: Script, index: number): void {
  script._onLateUpdateIndex = index;
}

export function setPhysicsUpdateIndex(script: Script, index: number): void {
  script._onPhysicsUpdateIndex = index;
}

export function setEntityScriptIndex(script: Script, index: number): void {
  script._entityScriptsIndex = index;
}

export function renderCamera(camera: Camera, scene: Scene): void {
  const { _componentsManager: componentsManager, engine } = scene;
  componentsManager.callCameraOnBeginRender(camera);

  const { pixelViewport } = camera;
  // A zero-sized viewport cannot allocate a render target.
  if (pixelViewport.width !== 0 && pixelViewport.height !== 0) {
    // Update post process manager
    scene.postProcessManager._update(camera);
    camera.render();
  } else {
    Logger.warn("Camera pixelViewport width or height is 0.");
  }

  componentsManager.callCameraOnEndRender(camera);

  // Some WebGL backends require a flush after each camera.
  if (engine._hardwareRenderer._options._forceFlush) {
    engine._hardwareRenderer.flush();
  }
}

export function setCameraIndex(camera: Camera, index: number): void {
  camera._cameraIndex = index;
}
