# 屋顶

欧式 buildHouses/buildTower 选择 dev/2.0 roof 参数与 overlap_rows Unit。设计阶段解析墙顶与屋顶的关系；精确屋瓦算法保留边缘补片、压脊、裁剪面与 GPU feedback，不能用普通盒子近似后宣称等效。

自定义屋面：提供真实 Mesh，support 为 meshSurface，params 指定 mesh/subMesh；铺设算法使用网格 UV/切向约定。buildRoof 也接受显式 support 与 style。它不要求任意屋面都具备 ridge_length 等欧式参数。

附加曲面使用独立基础构件；连接显式命名参与部位，调用具体求解算法。不能只凭两个屋顶类型就保证交线可求或收口合理。

平顶舱门和屋顶灯使用设计阶段解算的 Point，由注册的 `mountAttachment` 生成资产几何；开口与安装占位属于设计阶段。完整乡村式老虎窗 `dormer-cottage` 的窗体也通过 `mountAttachment`，小屋面派生独立 Surface 构件并通过 `cottageDormerCourses` 生成。可在附件构件的 `params.roofAlgorithm` 指定替代注册算法，返回 `dormer-roof/v1`，几何开口不会因替代排列自动改变；小屋面材质沿用宿主屋顶绑定。完整哥特式老虎窗也通过 `mountAttachment` 放置窗体，小屋面是 `profiledDormerRoof + profiledDormerCourses`。它的精确避让包络依赖瓦带的尺寸、倾角和搭接，设计会采样占用体积，但不会生成实例字节或保留瓦片数组。替代小屋面算法沿用已规划的开口与占位；若要扩大几何范围，需修改对应 support/避让设计。三类半老虎窗（cottage/gothic/arrow-slit）同样发布窗体及附属成员挂点、墙/屋顶双开口与派生小屋面；分别复用 cottageDormerCourses 或 profiledDormerCourses。占用计算保留原有逐瓦带几何，实施阶段才打包渲染实例。屋顶尖饰是派生 Point 构件，引用 `{libraryMesh:"roofSpire"}` 并由 `placeRoofSpire` 生成；设计只确定挂点与收口参数。屋顶构件可用 `params.spireAlgorithm` 指定替代注册算法，返回 `roof-spire/v1`，允许零或一个明确归属的尖饰及其挂点；预览不会在零输出时重新生成。局部隐藏、屋面开口消费同一挂点，派生数据不写入Source。动态算法在编译前选择主线程，默认实现已打包进Worker。

原生 profile 上也可注册自定义铺设：`buildingPlacementAlgorithms.register(id, callback, {profile:{basis:"grid"}})`。basis 声明原生几何准备约定，实际执行的仍是 callback；它应返回完整 profile 铺设输出，并同步绘制 cells 与编辑 plans。动态函数走主线程原生实例渲染，不自动生成远景替身；任意形状继续使用 Mesh support。算法注册名在保存项目重新加载前必须可解析。
