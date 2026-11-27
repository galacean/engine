# @galacean/engine-farming

农场、种植、程序化作物、生长、收获、交互与存储。

源码位于 `src/`，通过包入口或 `package.json` 声明的子路径导入。该包目前是私有 workspace 源码包，由 World 的 Vite 配置编译，不参与原生 Engine 的 Rollup 发布，也不单独发布到 npm。

直接 Galacean 依赖：`@galacean/engine`, `@galacean/engine-core`, `@galacean/engine-design`, `@galacean/engine-math`, `@galacean/engine-ui`, `@galacean/engine-project`, `@galacean/engine-terrain`, `@galacean/engine-ai-chat`。

Demo 的页面、UI 编排和私有配置位于仓库 `world/demos/`；公共包不得反向导入 Demo。资源 URL 使用模块相对路径或公开资源子路径，不依赖旧 Gallery 根目录。

安装、构建和兼容性边界见 [World 说明](../../world/README.md)。World 与 Worker 构建通过 `@galacean/engine-project/vite` 的 `workspaceEngine()` 插件直接解析当前 monorepo 引擎源码（`packages/modify` 已移除）。
