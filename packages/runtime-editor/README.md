# @galacean/engine-runtime-editor

运行时编辑、选择与操作、属性编辑、组件扩展和编辑 Agent 接入。

源码位于 `src/`，通过包入口或 `package.json` 声明的子路径导入。该包目前是私有 workspace 源码包，由 World 的 Vite 配置编译，不参与原生 Engine 的 Rollup 发布，也不单独发布到 npm。

直接 Galacean 依赖：`@galacean/engine`, `@galacean/engine-loader`, `@galacean/engine-math`, `@galacean/engine-ui`, `@galacean/engine-ai-chat`, `@galacean/engine-farming`, `@galacean/engine-project`, `@galacean/engine-retrieval`, `@galacean/engine-rhi-webgl`, `@galacean/engine-rhi-webgpu`, `@galacean/engine-webgpu`。

Demo 的页面、UI 编排和私有配置位于仓库 `world/demos/`；公共包不得反向导入 Demo。资源 URL 使用模块相对路径或公开资源子路径，不依赖旧 Gallery 根目录。

安装、构建和兼容性边界见 [World 说明](../../world/README.md)。World 与 Worker 构建通过 `@galacean/engine-project/vite` 的 `workspaceEngine()` 插件直接解析当前 monorepo 引擎源码（`packages/modify` 已移除）。
