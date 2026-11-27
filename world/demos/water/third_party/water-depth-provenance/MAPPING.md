# Stylized Water 3 depth-formula provenance

This document records the narrow licensed-source provenance for the shared Water depth-response formulas. Stylized Water 3 is not an active Ocean runtime, Demo, material, terrain, or texture dependency. No vendor binary asset is retained in this directory.

## Shared depth response

| Licensed source behavior | Source inputs | Galacean owner | Adaptation |
| --- | --- | --- | --- |
| Sample opaque-scene depth | Camera depth and projection parameters | `runtime/surface/WaterSurfaceDepthResponseShader.ts` | Invalid, non-finite, clear, or foreground samples are rejected before fallback. |
| Reconstruct opaque world position | Camera matrices and projection mode | `waterSurfaceReconstructOpaquePositionWS` | Galacean eye depth and `camera_ViewInvMat` support perspective and orthographic cameras explicitly. |
| Compute scene-ray water depth | Water fragment depth and opaque depth | `shaders/library/surface/WaterSurfaceDepthResponse.glsl` / `waterSurfaceResolveSceneRayDepth` | Runtime publishes metres instead of exposing renderer-specific depth encodings. |
| Compute normal-projected water depth | Reconstructed opaque position and macro normal | `waterSurfaceResolveSurfaceNormalDepth` | The projection uses the physical geometry normal; moving detail normals remain visual only. |
| Resolve the shallow/deep ramp | Scene-ray depth, normal depth, coefficients, absorption | `waterSurfaceDepthTintFactor` and `waterSurfaceCompositeDepthResponse` | Source coefficients are normalized to inverse metres and compiled into the shared appearance closure. |

These Galacean-owned ports are shared by active Water bodies, including Lake and River paths. Ocean has its own separately licensed source mapping under `third_party/ocean-assets` and does not consume this directory.

The source scene/material identities, formula facts, authorization scope, and the explicit empty retained-binary list are recorded in `provenance.json`.
