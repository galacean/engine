# World monorepo

本分支从主仓 `experimental/engine-next` 的 `a09ec3533` 创建，已同步至 `70d0a1526`，沿用它的 World、Seed 和 LLM 编辑产品。Seed 共用一套模板、业务源码和 LLM 编辑链，在启动时选择 WebGPU 或 WebGL2。WebGL2 产品差异沿用 engine-next 的 `packages/modify`；通用 WebGPU 设备和渲染实现直接位于主包。原 engine-next 的历史迁入记录见 [migration/files.json](migration/files.json)。

## 目录与所有权

```text
packages/
  core/、loader/、shader/、rhi-webgpu/、galacean-webgpu/   可独立构建的引擎与 WebGPU 后端
  terrain/ water/ animals/ building/ farming/ vegetation/ environment/
  ai-chat/ project/ retrieval/ runtime-editor/ world-planning/
  modify/                             engine-next 的 WebGL2 差异、共享产品扩展及渲染扩展
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
pnpm b:module
pnpm --dir world prepare:engine
pnpm --dir world dev
# http://127.0.0.1:5193/world/demos/seed-world/index.html?template=sakura-pearl&rhi=auto&fps=1
WORLD_DEMO=water pnpm --dir world dev
WORLD_DEMO=animals/cute-zoo pnpm --dir world build
pnpm --dir world build
pnpm --dir world build:all
pnpm --dir world build:seed-world-flash-app
pnpm --dir world build:seed-world-flash-source
pnpm --dir world check:boundaries
pnpm --dir world typecheck
```

从 `@galacean/engine` 导入 `Engine` 后，`Engine.isWebGL2Supported()` 同步检查临时 WebGL2 context，`await Engine.isWebGPUSupported()` 异步检查 WebGPU adapter。独立应用可直接调用 `WebGLEngine.create({ canvas })` 或从 `@galacean/engine-webgpu` 导入 `WebGPUEngine` 并调用 `create({ canvas })`。Seed 的主世界和规划视图共用 `createWorldEngine({ canvas, rhi: RHIMode.Auto })`。从 `@galacean/engine` 导入 `RHIMode` 即可使用 `Auto`、`WebGL2` 和 `WebGPU`。URL 省略 `rhi` 或指定 `auto` 时优先实际创建 WebGPU，设备不可用会降级到 WebGL2。指定 `rhi=webgpu` 或 `rhi=webgl2` 会强制使用该后端。

添加 `debug=1` 可在左上角查看 FPS、切换后端并读取实际结果。切换会重新加载当前世界，保留 URL 中的模板、种子和视图等参数。普通入口可用 `fps=1` 单独查看帧率。团队通过局域网验收 WebGPU 时请使用 HTTPS。

构建后可在一台支持 WebGPU 的桌面 Chrome 上复跑验收。仓库根目录用 `pnpm --dir world exec vite preview --config vite.config.mjs --port 5194 --strictPort` 启动产物，另一个终端运行 `SEED_BASE_URL=http://127.0.0.1:5194 node world/scripts/acceptance/seed-rhi.mjs`。脚本在隔离浏览器上下文检查 10 个模板与后端组合，比较出生点与相机的位置、旋转和 FOV。它还验证自动选择、WebGPU API 缺失、适配器为空、设备或 canvas context 不可用时的回退，以及设备配置失败或显式要求 WebGPU 时的报错。沙漠用例覆盖昼夜、季节、天气、截图拾取、拍照进入编辑、场景参数提交与撤销重做。规划页另有两组用例，检查两种后端的导演视图能实际产出像素统计，并验证进入正式世界后保留后端偏好及通过调试控件切换。设置 `SEED_EVIDENCE_DIR` 可将截图写到工作树以外。真实模型联调用 [本地 LLM 调试流程](../.agents/skills/seed-world-local-debug/SKILL.md)，让 wrapper 的两个子页面 URL 指向同一模板与后端。

`build` 默认构建 Seed World，输出 `world/dist/seed-world/`；`build:all` 输出 `world/dist/all/`。部署时保留整个输出目录，HTML 位于其 `world/demos/…` 子目录；项目清单与动态资源按原相对结构输出，不能只上传 HTML 或 JS。各 Demo 的辅助 HTML 入口也包含在统一构建中。

发布 Seed World 为灵光闪应用时，使用 `build:seed-world-flash-app`（输出根部直接含 `index.html` 的 `world/dist/seed-world-flash-app/`）与 `build:seed-world-flash-source`（输出可重建源码快照 `world/dist/seed-world-flash-source/`）；完整发布、上架与验收步骤见 [Seed World 灵光闪应用构建与发布指南](demos/seed-world/FLASH_APP_PUBLISH.md)。

首次启动必须执行 `prepare:engine`；修改 shader 替换文件后需要重跑。缓存仅含 shader 编译输入/输出，不生成 Engine 或 Gallery 的副本。World 的业务包是 `private` workspace 源码包，使用显式子路径导出。通用浏览器入口、WebGPU 引擎入口和 RHI 有独立的模块与类型产物。

AI Chat 的真实模型请求沿用业务配置，需要配置可用的 provider/网关。迁移不附带凭证。树木还原页面可静态构建，但上传 FBX 还原依赖开发服务器的本机 API 和 Blender（通过原工具支持的环境配置指定）；静态部署不提供该 API。

## 引擎替换边界

`packages/modify/native-overrides.json` 是原生模块路径到替换文件的唯一映射。Vite 插件沿用原生模块 ID 装载替换源码，使跨包共享同一组 Engine 类；主线程与 Worker 都显式启用。World 将主线程、Worker 和产品的 Agent 类型声明解析到同一套有效源码。普通引擎构建直接消费主包；可移植到 dev/2.0 的 GPU 能力须在这个入口独立验证。

实验分支的粒子/风场 ABI 与最新 dev/2.0 的粒子轨迹管理存在结构差异。这里将实验粒子实现及其 Engine/Scene/ComponentsManager 生命周期配套收在 `modify` 中，作为完整兼容实现。**启用 modify 的 World 并不继承最新原生粒子轨迹管理行为**；不能把静态编译成功当成两个实现已经行为等价。将来升级 dev/2.0 时，应复核这些替换及渲染管线、shader、loader 的兼容性。

类型检查使用与构建相同的替换映射。在此前的产品基线 `5b74617c2` 上，`pnpm --dir world typecheck` 在两个工作树均报告相同的 32 项诊断。后续同步应重跑来源分支并逐项比较。

## 在两个分支间协作

共享 Seed 功能和 WebGL2 产品修复在主仓 `experimental/engine-next` 开发。将一批产品提交同步到已发布的实验分支时，在干净的 `experimental/webgpu` 工作树运行以下命令。显式指定主仓 URL，适用于 remote 名称不同的克隆。

```sh
git switch experimental/webgpu
repo=https://github.com/galacean/engine.git
git pull --ff-only "$repo" experimental/webgpu
git fetch "$repo" refs/heads/experimental/engine-next
product_sha=$(git rev-parse FETCH_HEAD)
git log --oneline HEAD.."$product_sha"
git diff --name-only HEAD..."$product_sha"
git merge "$product_sha"
git merge-base --is-ancestor "$product_sha" HEAD
git diff --stat "$product_sha" HEAD
```

普通 merge 保留产品提交的父子关系，下次 Git 能识别已合入的改动。发生冲突时，先用 `git diff --name-only --diff-filter=U` 找到文件。共享产品代码和 WebGL2 产品覆盖以 engine-next 的行为为基线。对 `packages/modify/native-overrides.json` 命中的模块，同时核对主包实现、实际 replacement 和已有的 WebGPU 适配。合并完成后按上文构建并运行双端验收，在跟踪 PR 中记录 `product_sha`、验证时的实验 SHA 和结果。准备独立引擎 PR 时，从当时的 `dev/2.0` 新开分支，仅迁入该能力的主包、测试与文档。

本轮同步的产品提交 `70d0a1526` 将草地移动到 AlphaTest 队列。Git 自动合入了 `Grass.shader`，并在两边都更新过的 `Grass.shaderc` 处报告冲突。该资产在实验分支的增量只有 WGSL，因此先取该产品提交的 `Grass.shaderc` 作为输入，再从仓库根目录运行 `pnpm --dir world export:seed-shaders /path/to/translation-tools`。工具目录的版本、下载地址和准备步骤见[离线着色器导出说明](scripts/webgpu/README.md)。检查结果应同时包含产品更新后的渲染状态、原 WebGL2 指令和 WGSL 的两个阶段，再暂存并继续合并。

## Demo 归属

共 33 个 HTML 入口，都是静态构建入口。`static` 表示构建模式，不代表所有在线 API 功能都能离线运行。完整入口清单由 [demos.json](demos.json) 维护。`demos/building-core-preview/` 的四个开发页（新建筑系统的预览和 GPU 铺设原型）不登记在其中。

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

最初的 World 迁移将根级改动限制在 workspace、锁文件和新源码包的构建隔离。本实验分支还在引擎主包实现双后端，复核这些改动时请使用 `git diff 70d0a1526 -- packages/core packages/loader packages/rhi-webgl packages/rhi-webgpu packages/shader`。本地尚未提交的新文件可用 `git status -uall` 检查。
