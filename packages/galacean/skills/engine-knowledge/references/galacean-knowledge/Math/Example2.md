# 矩阵乘法与变换 示例

## Summary
- 展示矩阵乘法与变换的用法。
- 关键 API：Matrix, Vector3

## Code
```ts
import { Camera, Matrix, Vector3 } from "@galacean/engine";

declare const camera: Camera;

const model = new Matrix();
Matrix.rotationAxisAngle(new Vector3(0, 1, 0), Math.PI / 4, model);

const viewProj = new Matrix();
Matrix.multiply(camera.projectionMatrix, camera.viewMatrix, viewProj); // 注意右乘顺序
```
