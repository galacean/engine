# Cute Zoo 3 独立动物观察场

入口：`demos/animals/cute-zoo/index.html`。复用 `../roaming/main.ts` 的公共观察场、通用动物注册与行为执行器，不复制主程序，不改 Seed 的素材注册或面板。

当前接入 **14 个动物体型、21 个外观、7 套共 63 个源动画 FBX**。每个体型保留 9 段真实动画，观察场共 126 个动画绑定；21 个外观 GLB 各含对应 9 段动画。默认 14 只代表全部入场、自主闲逛，名字关闭，没有脚下选中圆盘。点击或下拉选择后，可检查原始动画、骨骼、尺寸、面数、文件体积，并切换外观。

素材来自本机采购包 `Cute Zoo 3 v2.0.unitypackage`，采购包未修改。14 个体型为：公牛、变色龙、狐狸、考拉、豹、狐獴、骡、鸵鸟、鸭嘴兽、豪猪、浣熊、臭鼬、松鼠、狼。包内没有独立道具模型；UI 图片、灯光动画、演示场景、C# 代码不作为道具导出。

## 原比例与展示倍率

GLB 保留 FBX 米制比例；微型源模型高约 0.077–0.273 米，鸵鸟约 1.288 米。为便于独立观察场全景检查，微型模型默认使用首个 prefab 倍率再放大 10 倍，鸵鸟保持原尺寸。页面可调倍率。这是观察场校准，与Seed体型配置分离。

同体型外观沿用代表 A 的展示比例。采购包部分 B prefab 比例不同（公牛 B 为 2.5、骡/狼 B 为 1）；完整原始倍率保存在本地资源清单中，外观切换不会隐含修改观察场比例。

14个源FBX均声明相同厘米单位（UnitScaleFactor=1）、Unity导入倍率1；未发现鸵鸟特殊单位声明。尺寸差异是已测的作者几何尺度差异，不能断言导入单位丢失，见 `source-units.json`。

## 动画和行为边界

所有片段均为 Once，下一段由共享行为树选择。Idle 注册为停留；Walk、Move、Run 依据源动画名称及动态脚部轨迹注册为地面步态。全部 14 个体型的真实 Walk/Move 和 Run 都存在非静态骨骼与脚部变化。明确指令优先、连续指令重播、动态避让、暂停和步态结束锁定位移由共享实现负责。

Eat 经7套真实皮肤姿态序列审阅，注册为进食表现；Rest 分别注册卧姿和鸵鸟坐姿，鸭嘴兽 Rest 与 Idle 近似，保留未知。鸵鸟 Rest 是站立到蹲坐的过渡。Attack、Damage、Die、Jump 保留作者原名手动预览；Damage 不映射受惊，没有飞行/游泳能力。食物为草、草地倾向是明确的临时玩法配置，并非从动画推断饮食或生物学。自主权重：walk 60（连续6段）、run 4（连续4段）、idle 24、eat 8、rest 4；缺失能力自动剔除。每段仍为 Once。

全部绑定用 `range=[1/24, clip.length]` 移除 Blender NLA 导出在首键前附加的静止一帧，不重建资源。移动速度按该真实有效窗口121次完整骨架采样中的绝对脚轨迹支撑相速度中位数重估，保留根骨前后摆动，不设置 rootMotionNode；单位为源模型米/秒，再由实例比例缩放。所有源步态根骨首尾水平净位移为0，属于原地步态。拟合残差见 `kinematics-audit.json`；一项常速不能消除作者轨迹全部脚滑，仍待浏览器校准。

## 转换及证据

安全解包仅读取 tar 普通文件中的 pathname/asset/meta，不执行采购包代码；拒绝绝对路径、父级路径和反斜杠，规范化采购包 pathname 的特殊 `\n00` 尾缀。转换使用 Blender 4.2.17 LTS。

动画来自 prefab 绑定的 controller 所引用的独立 FBX。TypeA/TypeB 等共享动画按同名骨骼和父子拓扑核对后离线重定向：使用源动画评估后的骨骼局部旋转，保留目标模型自身的父子偏移和骨长，根骨平移来自源动画。不把不同骨长的 Action 无校验硬挂到目标。

- `animals.json`：真实资源绑定、原名、Once、尺寸、移动估计、展示倍率与外观。
- `registrations.json`：枚举化语义及可用能力，未知片段完整保留为 `unclassified`。
- `audit.json`：网格、骨骼、原米制尺寸、2 Hz 皮肤包围范围、原始49次及校准121次步态骨架采样；包围范围不是连续时间精确极值。
- `facing-audit.json`：完整姿态骨架中 Head→Root/center/pelvis 的朝向；Idle 与 Walk/Move/Run 未发现 180° 反转。
- `semantics-audit.json` 与 `evidence/poses/`：7套实际皮肤姿态序列及语义审阅，语义证据与临时玩法配置分开记录。
- `kinematics-audit.json`：源FBX与重定向GLB的脚支撑相距离、根位移、首尾姿态连续性及常速残差。
- `seed-calibration-proposal.json`：按主任务明确玩法目标高度推导的Seed倍率/速度建议，独立于观察场10倍展示配置。
- `validation.json`：21 个本地整理 GLB 的 Khronos glTF Validator 结果，外部共享纹理也参与读取。

相同纹理以内容哈希共享，21 个 GLB 引用 21 张远程 KTX2，避免在每个 GLB 中重复嵌入。GLB 导出保留每顶点最高 4 个骨骼影响并归一化，具体丢弃权重见 `weight-audit.json`。离线校验不替代真实浏览器的骨骼形变、脚部接地、混合、暂停、选择和外观切换验收。

本地整理目录：`/Users/shensi/Documents/素材/动物/Cute Zoo 3 整理/`。原 FBX、Unity 源文件与转换临时产物留在任务临时目录 `/tmp/cute-zoo-20261016/`，不混入整理目录。

可复现的安全解包、GUID绑定解析、Blender重定向和有效窗口审计工具见 [tools/README.md](./tools/README.md)。工具默认只写新的工作产物，不自动替换现有资源。

## 2026-10-16：远程资源版本

当前 `animals.json` 及 `audit.json` 使用 `afts upload` 返回的 HTTPS URL。21 个外观 GLB 通过 `KHR_texture_basisu` 引用远程 KTX2，无 PNG fallback；原 2048×2048 贴图离线缩小到 1024×1024，sRGB / 11 级 mipmap，UASTC quality 2 / RDO lambda 1 / Zstd 18。合计从 1024 PNG 的 14.389 MiB 降为 9.673 MiB。网格、骨骼、动画 BIN 块原样保留。`remote-assets.json` 保存模型/贴图 URL、原始/发布哈希、字节数、尺寸、跨域与下载校验证据。旧 source/pose/calibration 审计仍描述采购源与动作测量，不代表运行时贴图仍为 2048。

项目不再携带此包 GLB/纹理二进制。采购源和发布前资源归档保留在 `/Users/shensi/Documents/素材/动物/远程发布归档-20261016/cute-zoo/`。重发工具见 `../tools/README.md`。Seed 默认 14 种各 1 只；100 款作为默认 0 只的远程备选，通过目录与召唤 API 按需添加。
