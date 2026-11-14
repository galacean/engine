# Prompt Noise World 实验进度

本目录记录“无限 FBM 地形 + 解析式局部算子”的阶段性实现。当前代码是实验台，不是最终生成 Skill 或稳定生产契约；新的世界生成计划应以实测结果重新设计工作流。

## 当前可运行能力

- 使用 Geometry Clipmap 绘制相机周围的无限地形，不请求 Heightmap、Alphamap、Region 清单或实例 Transform 数据。
- CPU 与 Shader 共用确定性 FBM、连续山脊和世界坐标公式；Seed 改变随机细节，镜头移动不改变同一逻辑坐标的高度。
- 草地、岩石两套贴图支持 projection、dual scaling、auto shader、macro variation 和 detiling 的独立开关。
- 复用 Terrain Gallery 的 OrbitControl、天空、昼夜、光照、二级阴影、天气、Fog 和后处理运行时；Fog 默认关闭。
- 地形编辑开关默认关闭。开启后可预览并提交曲线河谷、拍平、Smooth，支持模板、参数调整、编辑、删除、排序、撤销与重做。
- 已提交河谷会生成对应的 Water 水面；河谷中心线、影响范围与水体描述由同一算子参数派生。
- PNW4 River revision 会原子派生 Prompt 自己的植被、普通岩石、河岸岩石和一座可选桥梁；植被在 Worker 生成阶段消费同 revision Water Semantic Field 排除 wet / shore，桥梁只用现有 Water Query 校准水面高度，不申请 Wake。
- 河床颜色、湿润岸缘和侵蚀过渡直接进入同一 Prompt Terrain shader，并复用 bounded River Field；不创建第二张 riverbed mesh、第二套 Terrain 或 Showcase Controller。
- V3 配方保存 FBM 参数和稳定排序的算子列表。算子编码为 RGBA32F 记录表，支持数字 World Seed ID、IndexedDB 注册和 `.pnw3` 导入导出。
- 调试面板包含地形公式、算子 Mask、材质特性、Clipmap、阴影、天气、后处理、运行时指标和压力预览。

## 共享改动边界

- `TerrainClipmap` 增加解析式渲染绑定、拓扑统计和阴影接收开关；原 Project R16/Alphamap 路径保持兼容。
- Integrated Terrain 增加 `?terrainOnly=1` 对照模式，用同一 Clipmap 统计与 Prompt Noise Demo 比较地形面数。
- River 资源释放不再触发全局 `ResourceManager.gc()`，避免替换河流时回收其他仍在使用的场景资源。
- Gallery 增加开发态同步脚本，使 `world/gallery` 源码变化能同步到物化运行目录。

## 已有验证资产

- `project-tests/PromptNoiseWorld.spec.ts` 覆盖 FBM 镜头不变性、Seed 坐标映射、V3 字节往返、World Seed ID、三类算子语义、河流 Water 编译、撤销重做和五项材质能力。
- `e2e/prompt-noise.spec.ts` 覆盖算子编辑、持久化、导入还原和无栅格地形资源请求。
- `e2e/stage-c2b.spec.ts` 统一覆盖河流控制点编辑、保存恢复、已发布断面，以及后处理和阴影控制；原 `current-fixes` / `stage-c2a` 独立入口已删除。
- `e2e/terrain-geometry-comparison.spec.ts` 在 DPR 1 下比较 Integrated Terrain 与 Prompt Noise 的 Clipmap 拓扑。
- `artifacts/` 保存各阶段截图与 JSON 指标；它们是对应阶段的证据，不代表所有画面均为当前最终效果。

## 尚未定型

- Godot/Terrain3D 视觉分布仍需继续对照；当前 FBM 参数和山脊组合不是最终默认值。
- 河谷、拍平、Smooth 的数学边界、组合顺序和紧凑编码仍属于实验结论，不能直接沉淀成生成 Skill。
- Prompt 到模板、Seed、局部算子的编译策略尚未完成产品化验收。
- 花、草、树、岩石、灌木和可选桥梁已进入 C2-D / H5 场景构图验收；当前密度与风格仍可在 H5 只通过 Prompt placement / prefab / Terrain layer 调整。
- 雪地表反馈由其他分支实现，当前分支只保留未来接入点，不重复开发。

## 当前入口

- Demo：`demos/terrain/prompt-noise-world/index.html`
- Terrain 对照：`demos/terrain/index.html?terrainOnly=1`
- 固定浏览器验收：1440×900、DPR 1
