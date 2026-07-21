`WaterWorld` 是场景级水体注册中心，同时实现 `WaterSurfaceProvider`。上层系统可以永远查询同一个入口。

## 为什么需要注册中心

没有注册中心时，角色必须先判断自己靠近河流、海洋还是泳池，再选择对应 Provider。水体重叠后，这套判断会快速分散到每个业务系统中。

`WaterWorld` 把选择规则固定在一个位置：

1. 忽略已禁用水体。
2. 使用 XZ AABB 做低成本过滤。
3. 应用洞口或排除区域。
4. 调用候选水体的精确查询。
5. 先比较 `priority`。
6. 同优先级选择更高的可见水面。
7. 仍相同时按稳定 ID 排序。

因此注册顺序不会改变查询结果。

## 优先级怎么使用

优先级只解决明确的覆盖关系，例如室内泳池覆盖室外海洋：

```ts
const oceanPriority = 0;
const riverPriority = 10;
const indoorPoolPriority = 100;
```

不要用不断增大的优先级修复错误范围。水体误命中时，应该先检查 `bounds` 和 `exclusionBounds`。

## 查询成本指标

```ts
const metrics = waterWorld.metrics;

console.table({
  bodies: metrics.registeredBodyCount,
  candidates: metrics.lastCandidateCount,
  preciseQueries: metrics.lastPreciseQueryCount,
  p50: metrics.queryP50Ms,
  p95: metrics.queryP95Ms
});
```

重点关注：

- `lastCandidateCount` 是否长期接近候选上限。
- `lastPreciseQueryCount` 是否远高于实际重叠水体数。
- `candidateLimitExceededCount` 是否持续增长。
- P95 是否在水体增加后突然上升。

## 生命周期

水体资源销毁前先调用 `unregister(id)`。场景整体退出时调用 `destroy()`，避免下一场景继续命中过期 Provider。
