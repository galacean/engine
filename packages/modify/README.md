# @galacean/engine-modify

显式启用的引擎替换实现、渲染扩展、拾取协议及 PhysX 运行资产。

源码位于 `src/`，通过包入口或 `package.json` 声明的子路径导入。该包目前是私有 workspace 源码包，由 World 的 Vite 配置编译，不参与原生 Engine 的 Rollup 发布，也不单独发布到 npm。

直接 Galacean 依赖：`@galacean/engine`, `@galacean/engine-core`, `@galacean/engine-math`。

Demo 的页面、UI 编排和私有配置位于仓库 `world/demos/`；公共包不得反向导入 Demo。资源 URL 使用模块相对路径或公开资源子路径，不依赖旧 Gallery 根目录。

安装、构建和兼容性边界见 [World 迁移说明](../../world/README.md)。使用实验引擎能力时，需要显式安装 `@galacean/engine-modify/vite` 的 `engineModify()` 插件，并在 Worker 构建中安装同一插件。直接导入普通 Engine 不会自动安装替换。

修改层保留原项目粒子模块及其配套 GLSL 顶点布局；`native-overrides.json` 同时登记两端依赖，不能只升级其中一端。Vite 插件对原生 Engine 源码使用与 release 相同的 ES5 类转换，以兼容 toolkit 的构造函数继承方式；模块路径仍使用原生身份，避免双份 Engine 类。

MaterialLoader 完整沿用 engine-next 的类型校验，不额外接受旧编辑器 `Select` / `Toggle` 标签。原项目 ShaderLoader 按内容共享相同程序的行为保留，与原生 Engine 的重复 Shader 拒绝契约不同，测试分别验证。
