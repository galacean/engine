# Ocean 模块冗余与命名审查

日期：2026-09-10。本轮审查继续基于共享工作区中的 Ocean 修改；保留 River、Lake 的并行工作，不执行提交或发布。

结论：Ocean 本轮审查通过。已收敛确认的冗余、命名和诊断哈希问题；后续按用户要求修复了波浪法线强度在两阶段叠加的 P2，验证结果见下文。共享架构检查的既有 River 失败仍单独保留。

## 已处理

| 级别 | 问题 | 处理 |
| --- | --- | --- |
| P2 | `parameterHash` 只记录初始化输入，调参后未更新，且初始输入可能不同于实际契约解析后的 tuning | 初始化使用解析后的 tuning，后续修改同步更新哈希；增加修改／复位回归测试 |
| P3 | 已接入共享光学后，仍绑定旧 shallow color、sun reflection、refraction 参数 | 删除三个未被 Shader 消费的 uniform 及其绑定 |
| P3 | NormalFadeAndDepth、ReflectionParameters、FarReflection 的名称和向量分量已不符合实际用途 | 分别收敛为 NormalFadeEndDistance、ReflectionNormalBlend、FarReflectionFilter；删除不使用的分量，保留原有效值 |
| P3 | 近、远材质各自绑定一套相同的近岸纹理、范围和解码数据 | 合并为 `bindOceanNearshoreUniforms`，类型归入 uniform binding 模块 |
| P3 | 诊断枚举放在近景材质中，远景另写数字范围校验 | 抽到 `OceanDebugView.ts`，近远材质共用枚举和 `assertOceanDebugView`，调用方直接依赖模式定义 |
| P3 | 契约、组装与 GPU 绑定模块名称过于笼统 | 按实际职责重命名并更新引用；纯契约到 tuning 的映射移出 GPU 绑定模块 |
| P3 | 重复变量、包装函数、未使用导入、未消费的 optics readback 和重复 Shader 组装 | 移除或合并；远景复用已创建的 assembly；说明文案改为模块级常量 |

文件映射：

- `OceanSurfaceContract.ts` → `OceanRenderContract.ts`：契约创建、能力校验和 tuning 投影。
- `OceanSurfaceShader.ts` → `OceanSurfaceShaderAssembly.ts`：共享着色组装和近／远几何适配；参数使用 `"near" | "far"` 代替布尔值。
- `OceanSurfaceBinding.ts` → `OceanSurfaceUniformBinding.ts`：GPU uniform 与近岸纹理绑定。
- 新增 `OceanDebugView.ts`；对应契约测试改名为 `OceanRenderContract.test.ts`。

函数采用 `createOceanTuningFromRenderContract`、`assertSupportedOceanRenderContract`、`createOceanSurfaceShaderAssembly`、`bindOceanRenderContractUniforms` 等名称。案例里的 `VIEWS` 改为 `OCEAN_CAMERA_VIEWS`，控制器访问器改为 `getOceanController`。

本轮前后 Ocean runtime TypeScript 总行数为 4,742 → 4,697；其中近景材质为 577 → 493 行。部分逻辑是转移到职责明确的模块，不能把文件缩短当作执行成本下降。旧 JSON 中的退役字段仍保留校验，以维持已明确的兼容边界。没有声称 GPU 性能提升。

## P2 修复：波浪法线强度只在着色阶段生效

原问题：`OceanGeometry.glsl` 的 `groupNormal.xz` 与片元阶段 `waterSurfaceAmplifyMacroNormalSlopes` 都使用 `tuning.wave.normalStrength`，造成重复增益。

修复后，顶点阶段保留未经美术强度调整的波浪几何法线估计，片元阶段只施加一次宏观法线坡度增益。细节法线的切线重新对着色法线正交化，避免强度为 0 时切线仍携带几何倾斜。表面法线方向深度与掠射修正继续读取几何法线，不随美术强度调节。

移除顶点阶段的强度分量后，原四分量 `material_OceanWaveDetailParameters` 收敛为三分量 `material_OceanWaveFadeAndTimeScale`，只保存衰减起点、衰减终点和动画时间倍率。默认强度仍为 0.16；这是行为修复，默认反射／细节表现会变化，未通过重新调低默认值保留旧的重复衰减。

本次修复验证：

- 8 个 Ocean／共享调用链文件共 96 项通过，含新增 GLES100／300 顶点与片元职责断言，以及 0、0.16、1、2 强度的 uniform 独立性测试。
- Water 类型检查与 Ocean／SeedWorld 生产构建通过；7 项 SeedWorld AOT／启动契约测试通过；AOT 确定性检查通过（284,655 字节）。
- 开发页面通过真实调参控件检查 4 档强度 × 宏观法线／深度密度／环境反射共 12 组，参数读回一致，页面错误和失败请求均为 0。宏观法线诊断在 0 时趋于平面，调高后出现更明显的方向变化。
- 生产页面检查 3 个视角 × 7 种显示状态共 21 组，页面错误和失败请求均为 0；人工对照近岸完整效果、低机位远海以及深度诊断，未见海面覆盖缺失。
- SeedWorld 生产页面三份 Water AOT 均返回 200，GPU warmup 为 true，场景进入 complete；页面错误和失败请求均为 0。
- 本次证据单独位于 `output/playwright/ocean-normal-strength/`。下节保留前一轮命名审查的验证记录，不能与本次计数相加。

## 验证与边界

- 9 个 Ocean／共享调用链测试文件，97 项通过；其中包含调参哈希修改／复位测试。
- Water 类型检查、Ocean 和 SeedWorld 生产构建通过。
- 7 项 SeedWorld Water AOT／启动契约测试通过；AOT 已重新生成。
- 最新 SeedWorld 生产版实际加载三份 Water AOT 均返回 200，GPU warmup 为 true，场景进入 complete，错误和失败请求均为 0。生产版不暴露开发诊断接口，此项是启动／完整画面验收，不代表 SeedWorld 专属诊断面板验收。
- 886×809 视口下，三个视角 × 七种显示状态共 21 组 Ocean 浏览器检查通过，错误和失败请求均为 0。证据在 `output/playwright/ocean-review/`。
- 公共架构测试 93 项通过、1 项失败，失败为当前 `RiverMaterialFactory.ts` 的内联 GLSL 声明触发归属检查，本轮未修改该文件。未放宽断言或顺带修整 River。
- 重命名和 AOT 资源唯一性在独立干净 Gallery 副本验证，避免旧物化文件影响结果，也避免重建共享 Engine 中断其他开发服务。

相关背景见 [OceanSharedSurfaceAcceptance.md](./OceanSharedSurfaceAcceptance.md)。
