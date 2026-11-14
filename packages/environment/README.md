# @galacean/engine-environment

昼夜、天气、风、云、GI、Probe 数据与环境接入。

源码位于 `src/`，通过包入口或 `package.json` 声明的子路径导入。该包目前是私有 workspace 源码包，由 World 的 Vite 配置编译，不参与原生 Engine 的 Rollup 发布，也不单独发布到 npm。

直接 Galacean 依赖：`@galacean/engine`, `@galacean/engine-core`, `@galacean/engine-math`。

Demo 的页面、UI 编排和私有配置位于仓库 `world/demos/`；公共包不得反向导入 Demo。资源 URL 使用模块相对路径或公开资源子路径，不依赖旧 Gallery 根目录。

安装、构建和兼容性边界见 [World 迁移说明](../../world/README.md)。使用实验引擎能力时，需要显式安装 `@galacean/engine-modify/vite` 的 `engineModify()` 插件，并在 Worker 构建中安装同一插件。直接导入普通 Engine 不会自动安装替换。
