import { PhysXPhysics, PhysXRuntimeMode } from "@galacean/engine-physics-physx";

export function createPhysics(): PhysXPhysics {
  const mode = import.meta.env.VITE_PHYSX_RUNTIME_MODE;
  const runtimeMode =
    mode === "wasm"
      ? PhysXRuntimeMode.WebAssembly
      : mode === "simd"
        ? PhysXRuntimeMode.WebAssemblySIMD
        : PhysXRuntimeMode.Auto;
  return new PhysXPhysics(runtimeMode, {
    wasmModeUrl: new URL("../../../packages/physics-physx/libs/physx.release.js", import.meta.url).href,
    wasmSIMDModeUrl: new URL("../../../packages/physics-physx/libs/physx.release.simd.js", import.meta.url).href
  });
}
