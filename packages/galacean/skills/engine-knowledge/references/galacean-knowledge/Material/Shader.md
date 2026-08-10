# 自定义 Shader 材质 示例

## Summary
- 展示自定义 Shader 材质的用法。
- 关键 API：Material, Shader, Vector4

## Code
```ts
import { Engine, Material, Shader, Vector4 } from "@galacean/engine";

declare const engine: Engine;

const shader = Shader.find("Unlit"); // 或自定义注册的 shader
const mat = new Material(engine, shader);
mat.shaderData.setVector4("u_Color", new Vector4(1, 0, 0, 1));
mat.shaderData.enableMacro("USE_VERTEX_COLOR");
```
