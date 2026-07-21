下面示例展示 P0 的最小使用路径。导入路径以 `water-pcg` 内部调用为例，正式包提取后会调整。

## 1. 创建可复用输出

```ts
import { Vector3 } from "@galacean/engine-math";
import { createWaterSurfaceSample } from "../../runtime/query/WaterSurfaceProvider";

const queryPosition = new Vector3();
const surfaceSample = createWaterSurfaceSample();
```

`surfaceSample` 应长期复用，不要在每个物理步重新创建。

## 2. 注册水体

```ts
import { WaterBodyRuntimeAdapter } from "../../runtime/body/WaterBodyRuntime";
import { getWaterBodyCapabilities } from "../../runtime/body/WaterBodyCapabilities";
import { WaterWorld } from "../../runtime/body/WaterWorld";

const waterWorld = new WaterWorld({ maxCandidates: 16 });

waterWorld.register(
  new WaterBodyRuntimeAdapter({
    id: "main-river",
    type: "river",
    capabilities: getWaterBodyCapabilities("river"),
    surface: riverSurfaceProvider,
    bounds: { minX: -40, minZ: -80, maxX: 60, maxZ: 90 },
    priority: 10,
    metrics: {
      meshUploadCount: 0,
      drawCount: 8,
      triangleCount: 2400,
      resourceBytes: 196608
    }
  })
);
```

`bounds` 是查询的第一层过滤，应覆盖水体真实 XZ 范围，但不要直接使用无限大范围。

## 3. 查询最终水面

```ts
queryPosition.copyFrom(character.transform.worldPosition);

if (waterWorld.sampleSurface(queryPosition, surfaceSample)) {
  const surfaceY = surfaceSample.surfacePosition.y;
  const normal = surfaceSample.surfaceNormal;
  const velocity = surfaceSample.waterVelocity;

  updateSwimming(surfaceY, normal, velocity);
} else {
  leaveWaterState();
}
```

返回 `true` 时所有字段都有效；返回 `false` 时，不要继续使用上一次查询结果。

## 4. 场景退出时清理

```ts
waterWorld.unregister("main-river");
waterWorld.destroy();
```

如果水体会动态开关，也可以设置 `body.enabled`，暂时排除查询而不销毁资源。

## 接下来

- 需要理解每个字段：阅读 `WaterSurfaceProvider`。
- 场景里存在多片水：阅读 `WaterWorld 与水体注册`。
- 要接刚体浮力：阅读 `接入 WaterBuoyancy`。
