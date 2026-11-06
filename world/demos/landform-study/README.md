# 五种地貌的米制白盒图集

入口：`/demos/terrain/seed-world-planner/landform-study/index.html`。支持 `?kind=canyon|cliff|plateau|peaks|pass&view=top|oblique` 独立视图。页面可直接查看每种地貌的俯瞰及45度投影。历史总图和十张截图已从工作树清理，已提交的原图可从 Git 历史追溯；没有改写 Git 历史。

## 底层配置

LandformMetrics.ts 是本实验的运行时配置入口：用户确定 walkSpeedMps=2、runSpeedMps=8；其余均为可调试验默认。canyonSeconds=[40,25,55]；断崖80秒、台地65秒、峰群95秒、山口60秒；atomExposureSeconds=12；referenceHeightM=32；heightVariation=.24。没有暴露为用户语义滑杆。

段落时间×步速得到尺度参考线长度；单岩展示时间×步速得到24米原子间距基准。加长时间增加重复段落，缩短展示时间增加原子数；高度修改影响原子高度及支撑进深、相应摆放退距。跑速只用于同一空间的跑步时间估算，不缩放世界。reference passage 是无碰撞的空间计量线，不承诺道路或实际角色可走路线。展示时间是分布启发值，不是实际视野中岩石停留时间，视线/遮挡验收尚未实现。

RockAtoms.ts 是五种地貌共用的原子目录，复用 V2ColumnRole 和 V2Box。每种原子由1–5块组合，提供真实米制长宽高、底高和朝向。widthFactor/depthPerWidth/heightFactor 与归一化 parts 支持统一调比例及组合。普通体量单盒；尖塔、岩壁、山肩、台地、鞍部、裙边有不同组合规则。原子目录变化对所有引用的地貌生效。没有替换旧版 V2ColumnAssembly 或 seed=1 世界规划器。

Landforms.ts 负责组合；范围取所有实际 OBB 的投影并集，不额外生成最大OBB。Projection.ts 从相同3D顶点作90度/45度正交投影，有面排序与明暗、10米地面网格、20米标尺和1.8米人物参照。它是SVG白盒查看器，不是Galacean真实岩石、FBM地形或物理漫游验收。二维与45度按各自视图自动适配，比较实际尺寸应看标尺。每块可选，双视图同时高亮并显示所属原子尺寸。

## 验证

LandformStudy.spec.ts 四项测试通过：五种地貌有效生成；六类及普通体量的精确目标尺寸；时间/细节间距/高度/跑速的不同响应；共享原子参数传播。包括原子预算不足明确报错。terrain类型检查通过。浏览器确认5种地貌、10个视图及选中原子尺寸。上述为当时验证记录，历史截图已清理，不代表当前版本重新验收。审美、ABC体验、素材适配、全局模块约束及真实可行走性尚待后续验证。


## 可交互单文件研究台

转发 `landform-interactive.html` 即可，包含原子/地貌两页签及配置导入导出。从物化 Gallery 工作目录运行源目录的 `build-interactive.mjs` 可重新打包。核心 `InteractiveLandforms.ts` 与 DOM 无关，后续由规划器适配此接口；当前仍是独立研究台。
