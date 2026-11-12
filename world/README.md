# World monorepo

本分支以 `galacean/engine` 的 `dev/2.0` 提交 `aa195af6d5e07b4006b76ff7d6716ce58fac2580` 为基线，迁入 `engine-next` 的 Seed World 与系统 Demo。来源是本地 `dev/engine-next-experimental` 的有效工作树（含已有合并结果和 `world/engine/overlay`），并非仅复制其 HEAD；源仓库没有被本次迁移修改。逐文件来源见 [migration/files.json](migration/files.json)。

当前开发与同步仓库为 **`galacean/engine`**；`engine-next` 已停用，仅保留上述迁移来源记录。当前实验同步目标为 `experimental/engine-next@79c8a42d20b1623d6c3c4d0ee6e07b1d46101661`。原生 Engine 保留先前合入的 `dev/2.0@4916add0371a4853ebe8d3c23fcd68cf150038d6`（2.0.0-alpha.56）；`modify` 同时适配其 shader/parser、显式 Shader 引用与变换反馈输出名称契约。

## 目录与所有权

```text
packages/
  core/、loader/、rhi-webgl/、shader/…   原生 dev/2.0 源码保持不变
  terrain/ water/ animals/ building/ farming/ vegetation/ environment/
  ai-chat/ project/ retrieval/ runtime-editor/ world-planning/
  modify/                             集中所有引擎魔改
world/
  demos/<demo>/                       页面、私有业务、私有资产与配置
  demos.json                          入口、归属及运行模式
  scripts/                            当前 workspace 的构建和静态检查工具
  migration/                          来源、边界与排除记录
examples/                             原生 Engine 示例保持不变
```

| 包（统一前缀 `@galacean/engine-`） | 代码职责 |
| --- | --- |
| `terrain` | 地形、道路、岩石、地表采样与 clipmap |
| `water` | 河湖海、水面与水体编译、桥梁、水材质、SSR 接入 |
| `animals` | 动物、行为树、角色移动、骑乘与动物资源 |
| `building` | 建筑、砌造、装饰、几何编译、建筑资源及历史离线 provider 适配工具 |
| `farming` | 农场、种植、程序化作物、生长、收获、交互与存储 |
| `vegetation` | 植被、程序化树木、素材组装和树木还原工具 |
| `environment` | 昼夜、天气、风、云、GI、Probe 数据与环境接入 |
| `ai-chat` | 聊天、模型调用、流式响应、通用 AI UI 与协议 |
| `project` | VFS、项目资源、持久化、编辑事务、脚本编译和 API 契约工具 |
| `retrieval` | 外部资产关键词检索、目录索引与 Worker 客户端 |
| `runtime-editor` | 运行时编辑、选择与操作、属性编辑、组件扩展和编辑 Agent 接入 |
| `world-planning` | 空间规划、语义模型、生成与多系统装配、共享场景初始化 |
| `modify` | 显式启用的引擎替换实现、渲染扩展、拾取协议及 PhysX 运行资产 |

七大系统维持原有粗粒度归属：道路属于地形、桥梁和 SSR 属于水、GI 属于环境、移动/骑乘/行为树属于动物。公共业务机制继续拆为独立包；Seed World 的 Agent 任务、业务知识、页面布局、专用脚本与组合配置留在 `world/demos/seed-world/`。其他 Demo 不引用 Seed World 私有代码。

依赖方向为 Demo → 系统/业务公共包 → 原生 Engine。`world-planning` 承担跨系统装配，底层系统不得反向依赖它。`modify` 是显式选择的 Engine 实现配置；它不导入业务包。环境与 SSR 中仍依赖渲染内部状态的实现收在 `modify/src/native`，所属系统包提供对外入口。

各包的实际直接依赖见 `package.json`，公共包之间的依赖快照如下（不含原生 Engine 与第三方库）：

- `terrain` → `environment`, `animals`
- `water` → `terrain`, `ai-chat`, `environment`, `modify`
- `animals` → `modify`
- `building` → `modify`, `runtime-editor`, `project`, `terrain`
- `farming` → `project`, `terrain`, `ai-chat`, `modify`
- `vegetation` → `terrain`
- `environment` → 无其他公共包
- `ai-chat` → `project`
- `project` → 无其他公共包
- `retrieval` → 无其他公共包
- `runtime-editor` → `ai-chat`, `farming`, `project`, `retrieval`, `modify`
- `world-planning` → `vegetation`, `water`, `building`, `ai-chat`, `terrain`, `environment`, `farming`, `modify`, `runtime-editor`, `project`, `animals`
- `modify` → 无其他公共包

## 使用

在仓库根目录执行（Node ≥ 20.19；包管理器按根 `packageManager` 使用 pnpm 9.3.0）：

```sh
pnpm install --frozen-lockfile
pnpm --dir world prepare:engine
pnpm --dir world dev
# http://127.0.0.1:5193/world/demos/seed-world/index.html
WORLD_DEMO=water pnpm --dir world dev
WORLD_DEMO=animals/cute-zoo pnpm --dir world build
pnpm --dir world build
pnpm --dir world build:all
pnpm --dir world check:boundaries
pnpm --dir world typecheck
```

`build` 默认构建 Seed World，输出 `world/dist/seed-world/`；`build:all` 输出 `world/dist/all/`。部署时保留整个输出目录，HTML 位于其 `world/demos/…` 子目录；项目清单与动态资源按原相对结构输出，不能只上传 HTML 或 JS。各 Demo 的辅助 HTML 入口也包含在统一构建中。

首次启动必须执行 `prepare:engine`；该命令先构建原生包（包括 compiler/parser），再编译 World 的 shader 替换文件。只修改 shader 替换文件后可执行 `node packages/modify/build/prepare.mjs`。缓存仅含 shader 编译输入/输出，不生成 Engine 或 Gallery 的副本。所有新包目前是 `private` workspace 源码包，使用显式子路径导出；尚未建设 npm 分发产物。

AI Chat 的真实模型请求沿用业务配置，需要配置可用的 provider/网关。迁移不附带凭证。树木还原页面可静态构建，但上传 FBX 还原依赖开发服务器的本机 API 和 Blender（通过原工具支持的环境配置指定）；静态部署不提供该 API。

## 引擎替换边界

`packages/modify/native-overrides.json` 是原生模块路径到替换文件的唯一映射。Vite 插件沿用原生模块 ID 装载替换源码，使跨包共享同一组 Engine 类；主线程与 Worker 都显式启用。普通 Engine/examples 构建不启用它，也不修改原生源文件。

实验分支的粒子/风场 ABI 与最新 dev/2.0 的粒子轨迹管理存在结构差异。这里将实验粒子实现及其 Engine/Scene/ComponentsManager 生命周期配套收在 `modify` 中，作为完整兼容实现。**启用 modify 的 World 并不继承最新原生粒子轨迹管理行为**；不能把静态编译成功当成两个实现已经行为等价。将来升级 dev/2.0 时，应复核这些替换及渲染管线、shader、loader 的兼容性。

类型检查使用与构建相同的替换映射。World/依赖源码进行检查，原生内部诊断与未替换的 dev/2.0 基线比较；该基线已有 1 条类型诊断，本迁移不修改它。生产构建与静态检查不能证明运行时视觉、资源生命周期或交互正确。

## Demo 归属

当前 [demos.json](demos.json) 登记了 36 个静态构建入口。`static` 表示构建模式，不代表所有在线 API 功能都能离线运行。`demos/building-core-preview/` 的四个开发页（新建筑系统的预览和 GPU 铺设原型）不登记在其中。

| Demo 目录 | 系统归属 |
| --- | --- |
| `demos/agent-trajectory/` | ai-chat |
| `demos/animals/` | animals |
| `demos/building-core-preview/` | building（开发页；`demos/building-components/` 只放 world 测试用的建筑夹具） |
| `demos/canyon-shape-study/` | world-planning / terrain |
| `demos/day-night-system/` | environment |
| `demos/farming/` | farming |
| `demos/free-control-pitch-repro/` | terrain |
| `demos/global-illumination/` | environment |
| `demos/integrated-world/` | world-planning（综合业务 Demo） |
| `demos/landform-study/` | world-planning / terrain |
| `demos/metrics-zoo/` | world-planning |
| `demos/prompt-noise-world/` | world-planning / terrain |
| `demos/rain-wind/` | environment |
| `demos/rock-ridge-study/` | world-planning / terrain（独立原子岩石排布研究） |
| `demos/screen-space-reflection/` | water |
| `demos/seed-world/` | world-planning（Seed World 业务） |
| `demos/snow-wind/` | environment |
| `demos/terrain-editor/` | terrain / runtime-editor |
| `demos/tree-reconstruction/` | vegetation |
| `demos/vegetation/` | vegetation |
| `demos/volumetric-clouds/` | environment |
| `demos/water/` | water |
| `demos/wind-tree/` | vegetation / environment |

历史建筑实验的启动方式与外部输入见各自 README；它们使用保留的 capture renderer，未伪装为 Galacean Scene 运行链路，也不参与 `build:all`。

## 不迁入

- Gaussian Splat Demo、注册入口和专属引擎实现。
- 旧 Gallery 首页、导航容器、materialized Engine/Gallery 副本。
- 原测试目录、LLM 批量回归、旧截图与报告、临时产物。
- 基于旧 Gallery 路径、旧 overlay stamp 或旧 bundle 数量基线的构建/验收脚本；详见 [migration/excluded-tools.json](migration/excluded-tools.json)。
- 无消费者的本机 Unity/Editor 路径生成脚本；当前资源生成必需的工具与其依赖才保留。
- 外部原生建筑 provider、原游戏二进制、私人服务凭证；历史实验需自行提供其输入。

根级改动限于 workspace/锁文件及新源码包的构建隔离。原生 Engine 源码和现有 examples 跟随上述 `galacean/engine` 同步提交；复核时可执行 `git diff 4916add0371a4853ebe8d3c23fcd68cf150038d6 -- packages/core/src packages/loader/src packages/rhi-webgl/src packages/shader/src examples/src`，结果应为空。
