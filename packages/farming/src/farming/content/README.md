# 农场作物内容

素材库回答“怎样生成和展示植物”，这里回答“玩家能种什么、多久成熟、收获什么”。预览与农场案例共用本目录，不把玩法规则写进几何配方。

- `CropContent.ts`：14 种可种植作物的稳定 ID、中文名、程序化资产 ID、理想成熟秒数、收获物、基础数量、农场显示比例和生长条件预设。
- `CropIconCatalog.ts`：浏览器与入库校验共用的图标路径、缺失诊断和内嵌 PNG 占位图。
- `CropIcons.ts`、`icons/`：共享的 256×256 透明图标，供预览目录、种子袋、详情和仓库使用。由同一份程序化模型渲染，包含成熟着色；农场每种只加载一个 Sprite。
- `../profiles/CropGrowthProfiles.ts`：五种生长因子的梯形响应与阶段敏感度。果菜、根茎、叶菜、谷物和水稻复用五套玩法预设，允许以后按作物覆盖。
- `tools/`：离线导出实际运行时成熟几何，交给 Blender 渲染图标。不要在运行时执行这些脚本。

番茄保留 `tomato`、`tomato-seed` 和 `tomato-fruit`，农场模型绑定到 `tomato-farmlands`；预览中的 `tomato-bumroker` 共用番茄玩法属性。旧版 v4 存档仅升级定义集版本，已种植物、生长进度、土壤、库存、时钟及播种顺序均保留。

数值是可调整的游戏平衡参数，不是农业数据。界面显示理想成熟时间；缺水、温度等条件会降低实际速度，健康度会影响实际产量。根茎和谷物过湿时也会略微减速。生长规则由 domain 执行，资产阶段顺序不决定玩法阶段。

## 新增作物

1. 按素材库规范注册程序化资产和图集，并先在植物预览验证连续生长。
2. 在 `CropContent.ts` 添加一种作物，设置唯一稳定 ID、资产、时间、产出、比例与预设。调整比例时以农场 1.25 米种植格为参照，根部维持 Y=0，不上移地下器官。
3. 生成图标。先执行 `pnpm --dir world gallery:sync`，在已准备好的物化 Gallery 工作目录运行：

```sh
pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' shared/farming/content/tools/export-icon-geometry.ts /tmp/farm-crop-icons
blender --background --python-exit-code 1 --python shared/farming/content/tools/render-icons.py -- /tmp/farm-crop-icons /tmp/farm-rendered-icons
```

将输出 PNG 放回权威源码 `world/gallery/shared/farming/content/icons/`，文件名为 `<crop-id>.png`。图标沿用对应素材的授权，详情见各资产 `ATTRIBUTION.md`；不要脱离项目单独转售素材或图标。

4. 先运行 `pnpm --dir world farming:validate`；缺失图标会报告具体作物和路径，并使校验及生产构建失败。开发预览显示占位与条目警告，其他素材及农场仍可使用。
5. 同步并运行 `typecheck:farming`、`test:farming`、`build:farming:all`，检查预览属性、种子分页、播种、成熟、收获和重载。作物增多无需手写页面列表；种子面板和仓库按屏幕大小分页。

## 资源与限制

几何配方目前在入口统一解析，图集与 GPU 实例按实际创建的植物加载；独立植株保持独立生长状态，现有生长调度和阴影面数预算继续生效。13 种 Farmlands 是原始 LOD0 器官拓扑，部分藤蔓超过 5000 个三角形。接入 4×4 示例不等于移动设备上数百株的性能验收，扩大农场前仍需按目标设备做 LOD/实例化评估。

种子操作：点击卡片仅预览，确认后装备；E 播种、Q 更换、M 打开种植总览。种子分页与仓库分页只改变 UI，不修改农场状态。预览中的“去农场种植”只装备对应种子，不自动播种。跳转参数消费后从当前 URL 移除，保留存档槽位等其他参数；刷新时恢复玩家最后确认的种子。

发布时将两个构建目录 `dist/farming/` 与 `dist/farming-demo/` 放在同一静态根目录，预览到农场的跳转会使用相邻页面。开发服务仍使用 Gallery 的 `/demos/farming/` 路由。
