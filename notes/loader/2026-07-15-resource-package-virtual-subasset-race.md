# Virtual resource sub-asset loading race

## Symptom

A runtime-v2 Prefab compiled from a resource package stopped at `Loading Prefab` even though every blob request completed. The unresolved load key was the second primitive of a package-local glTF: `meshes[0][1]`.

## Root cause

Sub-asset queries rely on eager callbacks emitted by loaders. When the glTF main asset completed, `ResourceManager` released the callback table. A concurrent sub-asset query could be registered around that cleanup boundary and remain pending forever even though the completed main resource already contained the requested mesh.

## Resolution

The eager callback remains the fast path. Every sub-asset promise now also follows the authoritative main-asset promise and resolves the query path from the completed resource. Callback cleanup can no longer strand a request.

Resource-package consumers also need a supported way to map stable package paths to generated blob URLs, so `registerVirtualResources` is the public runtime boundary while the old Editor initialization method delegates to it for compatibility.

## Verification

- Browser `ResourceManager` suite: 16 tests pass, including a loader that completes without emitting an eager sub-asset callback.
- Real package: `/Meshes/FX_MS_ExtraShapes_02.glb?q=meshes[0][1]` resolves during Prefab loading without preloading dependencies.
- The independent demo mounts 27 virtual resources and renders the blue cosmic-flame Prefab from a single `.package`.
