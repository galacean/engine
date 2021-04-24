# [0.3.0](https://github.com/oasis-engine/engine/compare/e217213ec80f0aa9356d74ea12d2f1ef63776f85...0.3.0) (2021-04-05)


### Features
* add `materialCount`, `getInstanceMaterial()`, `getMaterial()/setMaterial()`, `getMaterials()/setMaterials()` properties and methods in `Renderer`. ([#75](https://github.com/oasis-engine/engine/issues/75))
* Delete `GeometryRenderer`, mesh renderer uniformly uses `MeshRenderer`.([#75](https://github.com/oasis-engine/engine/issues/75))
* Remove geometry classes such as `GeometryXX` and use `PrimitiveMesh` instead.([#85](https://github.com/oasis-engine/engine/issues/85))
* Optimize the sorting performance of the render queue.([#98](https://github.com/oasis-engine/engine/issues/98))
* Added tillingOffset property for commonly used materials.([#104](https://github.com/oasis-engine/engine/issues/104))
* Camera adds `screenPointToRay` method.([#109](https://github.com/oasis-engine/engine/issues/109))
* Add model-oriented mesh class `ModleMesh`.([#100](https://github.com/oasis-engine/engine/issues/100))
* Mesh adds `addSubMesh(subMesh: SubMesh): SubMesh;` function overload.([#117](https://github.com/oasis-engine/engine/issues/117))
* SpriteRenderer adds `flipX/Y` and custom shader capabilities.([#64](https://github.com/oasis-engine/engine/issues/64))
* Add `Sprite` Class as the rendering data of `SpriteRenderer`.([#64](https://github.com/oasis-engine/engine/issues/64))
* `RenderTargetBlendState` adds enbale property.([#123](https://github.com/oasis-engine/engine/pull/123))
* Add `isTransparent`, `alphaCutoff`, `renderFace`, `blendMode` blend state properties for commonly used materials.([#121](https://github.com/oasis-engine/engine/pull/121))
* Export `GLTFResource` type.([#135](https://github.com/oasis-engine/engine/pull/135))


### Bug Fixes
* Wrong number of mipmap in `Texture`.([#136](https://github.com/oasis-engine/engine/pull/136))
* Material blend mode bug. ([#127](https://github.com/oasis-engine/engine/pull/127))
* Fix none-indices gltf modle load error. ([#107](https://github.com/oasis-engine/engine/pull/107)) (Thanks to @BugDongDong for providing clues)
* Fix material texture display error bug. ([#148](https://github.com/oasis-engine/engine/pull/148)) (Thanks to @zhoumingyang for providing clues)



