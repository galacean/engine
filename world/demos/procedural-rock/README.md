# 程序化岩石

同一个页面提供「3D 岩石」和「2D 轮廓」两个 Tab，共用 `generator/outline.js`。3D 页可选中九种近中远岩石，独立调节 OBB、形状、减面、颜色与草地；2D 页保留轮廓参数、Seed 和角度约束检查。参数保存在本机浏览器，切换 Tab 保留相机与编辑状态。

仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm --dir world prepare:engine
WORLD_DEMO=procedural-rock pnpm --dir world dev
```

打开 `/world/demos/procedural-rock/index.html`；`#outline` 可直接进入二维实验。构建使用 `WORLD_DEMO=procedural-rock pnpm --dir world build`。几何回归运行：

```sh
WORLD_DEMO=procedural-rock pnpm exec vitest run world/tests/procedural-rock --config world/vite.config.mjs
```

生成器在 Worker 内运行，使用参数化包络、受角度约束的二维轮廓组合与网格减面；不加载参考 GLB 或轮廓模板。预览借用公共包中的 Seed 正午光照、后处理、地形和草，新增投影着色器注册在案例独立命名空间，不替换 Seed 世界里的岩石系统。

所有岩石共享两张 1K 贴图，世界空间三向投影的平铺米数为 `max(OBB 宽, 高, 深) / 2`。来源为 Amal Kumar 的 [Marble Cliff 05](https://polyhaven.com/a/marble_cliff_05)，[CC0](https://polyhaven.com/license)。原始灰度 displacement 图作为 sRGB 底色图乘 Color 使用，不参与几何位移；OpenGL 法线从 EXR 归一化、转换为线性 RGB8 PNG。没有引入 Blender 场景、原 diffuse 或 roughness 贴图。

网格简化使用 vendored meshoptimizer；授权保留在 `generator/vendor/meshoptimizer-LICENSE.md`。
