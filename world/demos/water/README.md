# Water 展示

此目录拥有 Lake、River、Ocean、Island 和 Planner 联调的页面、场景配方、相机/控件及专用素材；作者契约、Compiler、Backend、公共 Look 与资源由 [shared/water](../../shared/water/README.md) 拥有。

| 入口 | 用途 |
| --- | --- |
| `/demos/water/` 的原场景 hash | Lake / River |
| `/demos/water/ocean/`、`/demos/water/island/` | Ocean / Island |
| `/demos/water/planner/index.html` | 1024 米同源 Planner 联调：天然水域/道路/吊桥与浅溪、河流、瀑布、阶梯、小湖 |

Gallery 菜单为 water/lake、water/river、water/ocean、water/island，不转发旧目录 URL。预览复用正式 Planner 作者事务、Worker、精细 Terrain 和原生水体共同发布，不读取普通 SeedWorld 工程；详见 [预览契约](planner/README.md)。

Lake/River/Ocean 相机在画布聚焦后支持 WASD、Q/E 和拖拽；失焦、窗口隐藏或销毁撤销键盘输入。SeedWorld 使用自身控制器；截图/性能采样使用固定相机。场景身份与配方由宿主拥有，共享资源由其租约 owner 释放。

案例测试、[E2E](e2e/README.md) 与 [真实浏览器验证](tests/browser/README.md) 位于此目录；核心行为测试归 shared/water。功能、真实模型、性能与美术验收分别记录。
