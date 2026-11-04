import { PhysXPhysics, PhysXRuntimeMode } from "@galacean/engine-physics-physx";

export function createPhysics(runtimeMode = PhysXRuntimeMode.Auto): PhysXPhysics {
  return new PhysXPhysics(runtimeMode, {
    wasmModeUrl: new URL("../../../../packages/physics-physx/libs/physx.release.js", import.meta.url).href,
    wasmSIMDModeUrl: new URL("../../../../packages/physics-physx/libs/physx.release.simd.js", import.meta.url).href
  });
}
