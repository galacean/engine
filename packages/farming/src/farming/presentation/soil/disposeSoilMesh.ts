// Soil meshes exclusively own their bindings, including while Renderer teardown is deferred to frame end.
export { destroyOwnedMesh as disposeSoilMesh } from "@galacean/engine-terrain/geometry/destroyOwnedMesh";
