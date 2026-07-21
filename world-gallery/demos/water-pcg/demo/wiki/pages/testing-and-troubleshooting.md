水系统很容易出现“画面看起来对，但玩法查询错了”或“单测通过，但真实 PhysX 没有工作”的假阳性。验收必须同时覆盖纯逻辑、运行时契约和真实浏览器。

## 最小回归

从仓库根目录运行：

```sh
pnpm -C world-gallery typecheck:water-pcg
pnpm -C world-gallery test:water-pcg
git diff --check
```

类型检查保证 Wiki 引用的内部接口仍能编译；Vitest 覆盖 Authoring、Compiler、Resource、Query、Provider、WaterWorld、浮力、交互高度场、路由和 Wiki 自身。`git diff --check` 负责发现空白和补丁格式问题。

## 真实浏览器 Gate

先从 `world-gallery` 根目录启动 Vite：

```sh
pnpm exec vite . --config vite.config.js --host 127.0.0.1 --port 4179
```

再按能力运行：

```sh
node demos/water-pcg/e2e/buoyancy-smoke.mjs
node demos/water-pcg/e2e/indoor-pool-buoyancy-smoke.mjs
```

浮力 Gate 验证真实 Galacean + PhysX 点施力、单点/四点稳定性、局部水流、30/60/120 渲染频率与固定物理步隔离、Render/Query parity 和启动隔离。泳池 Gate 还验证自由落体、入水、持续压力凹陷、水环、波传播、池壁反射、重置和每渲染帧最多一次 Mesh upload。

## 六阶段 River 调试

| 阶段        | 先看什么                                                          | 常见问题归属                 |
| ----------- | ----------------------------------------------------------------- | ---------------------------- |
| 1 Authoring | 控制点、手柄、输入路径                                            | Descriptor 或 AI 输出        |
| 2 Topology  | nodes、reaches、junctions、采样和岸线                             | Decoder、Validator、Compiler |
| 3 Geometry  | Raw Mesh、Chunk、Junction Mesh                                    | 几何与切块 Compiler          |
| 4 Fields    | Base/Local/Final Flow、SDF、Terrain Corridor、Query Grid          | 局部 Atlas 或索引            |
| 5 Surface   | flow coordinate、macro height、crest、micro normal、shore damping | 波面与材质参数               |
| 6 Final     | 正式材质、泡沫、河床和场景                                        | 合成、光学或场景配置         |

从最早发生错误的阶段往源码追。不要在 Final 材质层修补一个 Authoring 或 Query 错误。

## 症状到检查点

| 症状                   | 优先检查                                                  |
| ---------------------- | --------------------------------------------------------- |
| 画面有水、查询 miss    | body bounds、真实 footprint、exclusion、Query Grid        |
| 漂浮高度和波峰错位     | CPU/GPU 时间、宏观波参数、world-XZ 逆解状态               |
| 物体不随河流移动       | `waterVelocity.xz`、Local Flow 权重、水平阻力是否显式开启 |
| 多水体选错             | priority、范围、可见高度和稳定 ID；不要只抬高优先级       |
| 汇流方向不一致         | Base Flow → Local Flow → Final Flow → Query Arrow         |
| 重编译闪烁或半条河     | 是否绕过 staging 和原子 RuntimeSet 切换                   |
| 普通水面意外加载 PhysX | Router kind 与动态 import 边界                            |
| Query P95 突升         | WaterWorld 候选数、精确查询数、候选上限溢出               |

## 浏览器观测入口

River P0 页面提供只读诊断：

```js
window.waterPcgP0.capabilityMatrix;
window.waterPcgP0.bodyMetrics;
window.waterPcgP0.worldMetrics;
window.waterPcgP0.querySurface(0, 2, 0);
```

它用于自动化和人工验收，不是业务 API。Wiki 路由本身不会创建 WebGL、PhysX 或 `window.waterPcgP0`。

## 如何解读失败

- 单测失败：先修确定性合同或接口回归，不用截图证明“其实能用”。
- 浏览器 Console error/warning：当前 Gate 视为失败，先定位真实运行时问题。
- 性能数据：同时记录 P50/P95、候选数、查询数、上传和资源字节；平均 FPS 不能解释局部尖峰。
- 旧 E2E fixture 预检失败：区分“场景没构造出来”和“新能力运行失败”，但不能把未执行的 Gate 写成通过。
