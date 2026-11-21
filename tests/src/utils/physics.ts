import type { IPhysics } from "@galacean/engine-design";
import { HavokPhysics } from "@galacean/engine-physics-havok";
import { PhysXPhysics, PhysXRuntimeMode } from "@galacean/engine-physics-physx";

export function createPhysics(requestedRuntimeMode?: PhysXRuntimeMode): IPhysics {
  if (import.meta.env.VITE_PHYSICS_BACKEND === "havok") {
    return new HavokPhysics();
  }

  const mode = import.meta.env.VITE_PHYSX_RUNTIME_MODE;
  const runtimeMode =
    requestedRuntimeMode ??
    (mode === "wasm"
      ? PhysXRuntimeMode.WebAssembly
      : mode === "simd"
        ? PhysXRuntimeMode.WebAssemblySIMD
        : PhysXRuntimeMode.Auto);
  return new PhysXPhysics(runtimeMode, {
    wasmModeUrl: new URL("../../../packages/physics-physx/libs/physx.release.js", import.meta.url).href,
    wasmSIMDModeUrl: new URL("../../../packages/physics-physx/libs/physx.release.simd.js", import.meta.url).href
  });
}
