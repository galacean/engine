# 克隆材质避免全局修改 示例

## Summary
- 展示克隆材质避免全局修改的用法。

## Code
```ts
import { MeshRenderer } from "@galacean/engine";

declare const renderer: MeshRenderer;

const instMat = renderer.getInstanceMaterial(0);
instMat.shaderData.setFloat("u_Shininess", 32);
renderer.setMaterial(0, instMat);
```
