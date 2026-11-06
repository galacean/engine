# 屋顶

## 欧式屋顶

欧式 buildHouses 和 buildTower 使用 roof 参数和 overlap_rows Unit。设计阶段解析墙顶和屋顶的关系。精确屋瓦算法保留边缘补片、压脊、裁剪面和 GPU feedback，不能用普通盒子近似后宣称等效。

## 瓦色

原生屋瓦外观用 `part.appearance.roofColor`（整数 0–12）配置，或用生成器的 `style.appearance`、`roofStyle.appearance`。通用瓦默认为 0。profile 屋顶优先使用明确提供的外观，否则使用已有的 roof.color。修改调色不改变放置和身份。Prefab 材质保留自己的外观。

## 自定义屋面

提供真实 Mesh，support 用 meshSurface，params 指定 mesh 和 subMesh。铺设算法使用网格 UV 和切向约定。buildRoof 也接受显式的 support 和 style。任意屋面都不要求具备 ridge_length 等欧式参数。

附加曲面使用独立的基础构件。连接要明确写出参与的部位，并调用具体的求解算法。只凭两个屋顶类型，不能保证交线可求或收口合理。

## 老虎窗和屋顶挂件

平顶舱门和屋顶灯使用设计阶段解算的 Point，由注册的 `mountAttachment` 生成资产几何。开口和安装占位属于设计阶段。

| 类型 | 窗体 | 小屋面 |
| --- | --- | --- |
| 乡村式老虎窗 `dormer-cottage` | `mountAttachment` | 派生独立 Surface 构件，用 `cottageDormerCourses` 生成 |
| 哥特式老虎窗 | `mountAttachment` | `profiledDormerRoof + profiledDormerCourses` |
| 半老虎窗（cottage/gothic/arrow-slit） | 发布窗体及附属成员挂点、墙和屋顶双开口 | 派生小屋面，复用 `cottageDormerCourses` 或 `profiledDormerCourses` |

- 可以在附件构件的 `params.roofAlgorithm` 指定替代注册算法，返回 `dormer-roof/v1`。替代排列沿用已规划的开口和占位，几何开口不会自动改变。要扩大几何范围，需要修改对应的 support 或避让设计。
- 小屋面材质沿用宿主屋顶的绑定。
- 哥特式老虎窗的精确避让包络依赖瓦带的尺寸、倾角和搭接。设计阶段采样占用体积，但不生成实例字节，也不保留瓦片数组。实施阶段才打包渲染实例。

## 屋顶尖饰

屋顶尖饰是派生的 Point 构件，引用 `{libraryMesh:"roofSpire"}`，由 `placeRoofSpire` 生成。设计阶段只确定挂点和收口参数。

屋顶构件可以用 `params.spireAlgorithm` 指定替代注册算法，返回 `roof-spire/v1`，允许零个或一个明确归属的尖饰及其挂点。预览不会在零输出时重新生成。局部隐藏和屋面开口使用同一个挂点。派生数据不写入 Source。

## 自定义铺设

原生 profile 上也可以注册自定义铺设：`buildingPlacementAlgorithms.register(id, callback, {profile:{basis:"grid"}})`。

- basis 声明原生几何准备约定，实际执行的仍是 callback。
- callback 要返回完整的 profile 铺设输出，并同步绘制 cells 和编辑 plans。
- 动态函数走主线程原生实例渲染，不自动生成远景替身。默认实现已打包进 Worker。
- 任意形状继续使用 Mesh support。
- 重新加载已保存的项目前，算法注册名必须可解析。
