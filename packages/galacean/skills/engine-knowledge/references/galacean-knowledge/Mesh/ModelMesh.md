# 自定义 ModelMesh 示例

## Summary
- 展示自定义 ModelMesh的用法。
- 关键 API：ModelMesh, Vector3

## Code
```ts
import { Engine, MeshRenderer, ModelMesh, Vector3 } from "@galacean/engine";

declare const engine: Engine;
declare const renderer: MeshRenderer;

const mesh = new ModelMesh(engine);
mesh.setPositions([
  new Vector3(-0.5, 0, -0.5),
  new Vector3(0.5, 0, -0.5),
  new Vector3(0.5, 0, 0.5),
  new Vector3(-0.5, 0, 0.5)
]);
mesh.setNormals([
  new Vector3(0, 1, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, 1, 0)
]);
mesh.setIndices(new Uint16Array([0, 1, 2, 0, 2, 3]));
mesh.uploadData(true); // 上传并标记只读，减少 CPU 占用

renderer.mesh = mesh;
```
