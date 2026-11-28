# @galacean/engine-vegetation

植被、程序化树木、素材组装和树木还原工具。

启用烘焙树冠遮蔽的叶片在近处使用实时自阴影。使用多级联阴影时，着色器在最近级联包围球半径的最后 15% 内逐渐混入烘焙遮蔽，远处仍能接收其他物体投下的阴影。使用单级阴影时，烘焙遮蔽从阴影距离的淡出区开始生效。

源码位于 `src/`，通过包入口或 `package.json` 声明的子路径导入。该包目前是私有 workspace 源码包，由 World 的 Vite 配置编译，不参与原生 Engine 的 Rollup 发布，也不单独发布到 npm。

直接 Galacean 依赖：`@galacean/engine`, `@galacean/engine-toolkit-controls`, `@galacean/engine-ui`, `@galacean/engine-terrain`。

Demo 的页面、UI 编排和私有配置位于仓库 `world/demos/`；公共包不得反向导入 Demo。资源 URL 使用模块相对路径或公开资源子路径，不依赖旧 Gallery 根目录。

安装、构建和兼容性边界见 [World 迁移说明](../../world/README.md)。使用实验引擎能力时，需要显式安装 `@galacean/engine-modify/vite` 的 `engineModify()` 插件，并在 Worker 构建中安装同一插件。直接导入普通 Engine 不会自动安装替换。
