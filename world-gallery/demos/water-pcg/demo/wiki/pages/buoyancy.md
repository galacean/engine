`WaterBuoyancy` 是统一查询契约的消费者。它不需要知道自己漂在 River、Ocean、Heightfield 还是 Pool 上，但 Provider 必须真实返回最终宏观水面和局部水速。

## 最小接入

```ts
import { DynamicCollider } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";

const boatCollider = boatEntity.addComponent(DynamicCollider);
boatCollider.mass = 240;

const buoyancy = boatEntity.addComponent(WaterBuoyancy);
buoyancy.surfaceProvider = waterWorld;
buoyancy.pontoons = [
  { localPosition: new Vector3(-1.2, -0.4, 1.6), radius: 0.45, enabled: true },
  { localPosition: new Vector3(1.2, -0.4, 1.6), radius: 0.45, enabled: true },
  { localPosition: new Vector3(-1.2, -0.4, -1.6), radius: 0.45, enabled: true },
  { localPosition: new Vector3(1.2, -0.4, -1.6), radius: 0.45, enabled: true }
];
```

`WaterBuoyancy` 会从所在 Entity 获取 `DynamicCollider`，没有公开的 `dynamicCollider` 配置字段。Collider 应先创建；Pontoon 当前最少 1 个、最多 8 个。

## 每个固定物理步发生什么

1. 把启用的 Pontoon 局部坐标和半径转换到世界空间。
2. 每个 Pontoon 查询一次最终水面。
3. 计算球冠浸没率、质量份额、点速度和垂直阻尼。
4. 可选计算相对局部水速的水平线性/二次阻力。
5. 合并垂直与水平力，通过公开 `DynamicCollider.applyForceAtPosition()` 一次提交。

组件只在 Galacean `Script.onPhysicsUpdate()` 工作，不自建 fixed loop，不直接写 Transform、线速度或 PhysX native 对象，也不把 force 再乘 fixed timestep。

## 水平水流默认不会自动开启

为保持旧配置兼容，`applyHorizontalDrag` 默认是 `false`。需要物体顺流漂移时显式配置：

```ts
buoyancy.applyHorizontalDrag = true;
buoyancy.horizontalLinearDrag = 0;
buoyancy.waterDensity = 1000;
buoyancy.horizontalDragCoefficient = 0.5;
buoyancy.horizontalDragAreaScale = 1;
buoyancy.maxHorizontalDragSpeed = 5;
buoyancy.maxHorizontalForceMultiplier = 2;
```

力来自 Pontoon 点速度与 `sample.waterVelocity` 的相对速度。物体追上水流时力自然衰减，超过水流时自动反向；不要额外叠加一个固定“下游推力”。

## Pontoon 怎么布置

- 至少三个不共线点才能稳定控制姿态，船体通常使用四角四点。
- Pontoon 放在预期吃水线附近，不要放到模型中心顶部。
- 半径表示该探针代表的排水区域，不是 Collider Shape 半径。
- Entity 有父级缩放时，组件会把 Pontoon 位置和半径转换到世界空间。
- 传送刚体后调用 `notifyTeleported()`，让下一物理步清理旧浸没状态并等待碰撞体同步。

## 运行时诊断

可读取：

- `isInWater`、`submergedPontoonCount`。
- `lastStepQueryCount`、`lastStepAppliedForceCount`。
- `lastDiagnostic`，例如 missing-provider、kinematic 或 invalid-parameters。
- `pontoonStates` 中稳定复用的位置、浸没率、水平相对速度和受力。
- 开启 `profilingEnabled` 后读取最近一步的 query/solver/applyForce/total 毫秒数。

缺少 Provider、Collider、合法重力或参数时，本步不查询、不施力，不会回退到全局固定水面。

## 动态泳池的双向交互

给 `interactionSink` 配置 `RectangularWaterHeightField` 后，dry-to-submerged 会登记入水冲量，持续浸没会登记有界压力足迹。水面凹陷、法线和垂直速度由同一高度场同时提供给网格与浮力，形成真实双向闭环。

该首版只验证单球、单矩形泳池，不代表通用多刚体流固耦合、船体 CFD 或完整 3D 流体。
