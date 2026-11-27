# @galacean/engine-vegetation

植被、程序化树木、素材组装和树木还原工具。

源码位于 `src/`，通过包入口或 `package.json` 声明的子路径导入。该包目前是私有 workspace 源码包，由 World 的 Vite 配置编译，不参与原生 Engine 的 Rollup 发布，也不单独发布到 npm。

直接 Galacean 依赖：`@galacean/engine`, `@galacean/engine-toolkit-controls`, `@galacean/engine-ui`, `@galacean/engine-terrain`。

Demo 的页面、UI 编排和私有配置位于仓库 `world/demos/`；公共包不得反向导入 Demo。资源 URL 使用模块相对路径或公开资源子路径，不依赖旧 Gallery 根目录。

安装、构建和兼容性边界见 [World 迁移说明](../../world/README.md)。使用实验引擎能力时，需要显式安装 `@galacean/engine-modify/vite` 的 `engineModify()` 插件，并在 Worker 构建中安装同一插件。直接导入普通 Engine 不会自动安装替换。

### 树木随风摆动

程序化树的叶片按树冠中的位置共享风的相位。相机距树根 18 米以内时，叶片摆幅上限为材质设定的三分之一，从 18 米到 52 米平滑衰减到零。默认材质的叶片在近处最多转动 ±2°，35 米处为 ±1°。远处仍能看到整棵树随风摆动。主渲染、阴影和深度通道都按观察相机到树根的距离计算。
