# @galacean/engine-modify

显式启用的引擎替换实现、渲染扩展、拾取协议及 PhysX 运行资产。

源码位于 `src/`，通过包入口或 `package.json` 声明的子路径导入。该包目前是私有 workspace 源码包，由 World 的 Vite 配置编译，不参与原生 Engine 的 Rollup 发布，也不单独发布到 npm。

直接 Galacean 依赖：`@galacean/engine`, `@galacean/engine-core`, `@galacean/engine-math`。

Demo 的页面、UI 编排和私有配置位于仓库 `world/demos/`；公共包不得反向导入 Demo。资源 URL 使用模块相对路径或公开资源子路径，不依赖旧 Gallery 根目录。

安装、构建和兼容性边界见 [World 迁移说明](../../world/README.md)。使用实验引擎能力时，需要显式安装 `@galacean/engine-modify/vite` 的 `engineModify()` 插件，并在 Worker 构建中安装同一插件。直接导入普通 Engine 不会自动安装替换。

修改层保留原项目粒子模块及其配套 GLSL 顶点布局；`native-overrides.json` 同时登记两端依赖，不能只升级其中一端。Vite 插件对原生 Engine 源码使用与 release 相同的 ES5 类转换，以兼容 toolkit 的构造函数继承方式；模块路径仍使用原生身份，避免双份 Engine 类。

MaterialLoader 保留迁移前的字段读取行为：忽略不支持的字段类型，包括编辑器 `Select` / `Toggle` 元数据，不将其转换成 Integer 或 Boolean。该兼容逻辑只在 modify 中启用，原生 Engine 保留严格校验。ShaderLoader 保留按内容共享相同预编译程序及同来源源码程序的行为；不同内容的同名 Shader 使用原生 Engine 的独立实例契约，MaterialLoader 优先绑定显式 `shaderRef`，仅当引用解析为空时按旧材质名称回退；加载错误仍传播。

同步 `galacean/engine` 的 `experimental/engine-next` 后，执行 `pnpm --dir world prepare:engine`，再运行 `pnpm --dir tests exec vitest run --config ../packages/modify/tests/vitest.compat.config.mjs`。兼容性测试直接安装 World 使用的 `engineModify()` 插件，验证 Shader 实例、材质引用、MRT 与变换反馈读回，不使用另一份 Engine 副本。

材质字段、宏解析或纹理依赖加载失败时，修改层销毁本次创建的材质并传播原错误。纹理绑定在全部依赖加载成功后写入，避免失败后的异步回调写入已销毁材质；共享纹理仍由资源管理器管理。未知字段类型的忽略行为保持不变。

SSR 阶段 0 的作者接口、Scene / Camera / Material 序列化、本地打包与 Editor link 见 [SSR 作者配置契约](SSR_AUTHORING.md)。本地打包命令为 `node packages/modify/build/local-engine.mjs`。
