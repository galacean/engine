# 多材质槽 示例

## Summary
- 展示多材质槽的用法。

## Code
```ts
import { Material, MeshRenderer } from "@galacean/engine";

declare const renderer: MeshRenderer;
declare const mat0: Material;
declare const mat1: Material;

renderer.setMaterial(0, mat0);
renderer.setMaterial(1, mat1);
const mats = renderer.getMaterials(); // 引用，同步修改会影响原材质
```
