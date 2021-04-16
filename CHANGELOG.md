## [0.3.2](https://github.com/oasis-engine/engine/compare/v0.3.1...v0.3.2) (2021-04-14)


### Bug Fixes

* error caused by duplicate shader name ([839ec0f](https://github.com/oasis-engine/engine/commit/839ec0ff5103278b08546cb468b28a5048595dd9))
* material blend error ([#214](https://github.com/oasis-engine/engine/issues/214)) ([897fd21](https://github.com/oasis-engine/engine/commit/897fd21810b79293b65442321523c1d903c06cbe))
* shader wanning with unUpload texture ([#212](https://github.com/oasis-engine/engine/issues/212)) ([8f52847](https://github.com/oasis-engine/engine/commit/8f52847cdf02849953d7c4425183fc28828166b5))
* texture upload warnning ([#183](https://github.com/oasis-engine/engine/issues/183)) ([4a9c0c9](https://github.com/oasis-engine/engine/commit/4a9c0c9c49c8e63e7ee998569952a4d5d1cbd77a))


## [0.3.1](https://github.com/oasis-engine/engine/compare/0.3.0...v0.3.1) (2021-04-09)


### Bug Fixes

* GLTF DRACO decode bug ([#141](https://github.com/oasis-engine/engine/issues/141)) ([#164](https://github.com/oasis-engine/engine/issues/164)) ([19a1f32](https://github.com/oasis-engine/engine/commit/19a1f32e3e7b1699bc3a91fbca140a2996930363))
* SpriteRenderer bounds error ([#176](https://github.com/oasis-engine/engine/issues/176))



## [0.3.0](https://github.com/oasis-engine/engine/compare/e217213ec80f0aa9356d74ea12d2f1ef63776f85...0.3.0) (2021-04-05)


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



