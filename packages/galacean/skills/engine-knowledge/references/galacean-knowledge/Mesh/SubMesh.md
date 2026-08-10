# 多材质 SubMesh 示例

## Summary
- 展示多材质 SubMesh的用法。

## Code
```ts
import { Material, MeshRenderer, ModelMesh } from "@galacean/engine";

declare const mesh: ModelMesh;
declare const renderer: MeshRenderer;
declare const mat0: Material;
declare const mat1: Material;

mesh.addSubMesh(0, 36);       // submesh 0 → 材质槽 0
mesh.addSubMesh(36, 36);      // submesh 1 → 材质槽 1
renderer.setMaterial(0, mat0);
renderer.setMaterial(1, mat1);
```
