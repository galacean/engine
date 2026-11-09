# Water 作者接口

Scene/Prefab 的 `WaterBodyComponent.authoring` 与所引用的项目资产是唯一持久作者数据。坐标、宽深、岸坡和水位均以米为单位。`shape` 使用 Entity 局部 XZ 与 Y 高程；Entity Transform 负责放置，只支持平移、绕 Y 轴旋转和单位缩放。Seed World 在规划 DTO 边界转换成世界坐标，写回时转换回局部坐标。

## 公共项目编辑

RuntimeEditor 的面板和 Agent 共用 `NativeWaterEditor` / `editWaterSource`，经过公共 `run → prepare → commit → activate`。Agent 使用 `water.author`；支持 create、update、updateMany、setEnabled 和 remove。Source 水体不能通过游戏运行 `WaterAPI` 绕过公共事务修改。规划调试命令也经项目事务写回组件，不保留独立的水体存档或历史。

```ts
const result = await water.change({
  operation: "update",
  id: sourceComponentId,
  patch: { shape: { ...lakeShape, levelOffsetM: -0.15 } }
});
// 作者接受、运行生效和持久保存是三个结果。
if (result.runtimeError) console.error(result.runtimeError);
await water.flush();
```

Lake 保留固定 `referenceLevel` 与 `levelOffsetM`。岸线点有稳定 id，`shore` 为外岸，其他 ring 为岛洞，每环至少三点。River 保留稳定的控制点 id、x/z/elevation?/width/depth，以及 auto/slope/waterfall/steps 段型。显式 0、false 均有意义。隐藏保留查询；禁用移除查询。Ocean 的 CPU 查询报告 datum，不报告 Shader Gerstner 波峰。Seed World 只支持 datum 0 和一个活动 Ocean；独立宿主使用显式有限范围或固定 LOD 布局。

## 原生外观与资源

组件只需引用一份原生 Material 定义外观，Quality 作为组件上的类型化值保存，已接受床面另行引用。颜色、透明度、法线、焦散、落水数值与外观策略由同一 `.mat` 的有类型 shaderData 和原生 Texture 引用持有；固定字段依赖和编译结构从 Shader 家族代码推导，不再持久化 Look 作者资产。Shader 源使用通用 `Editor.Properties` 元数据。共享编辑影响全部引用者；实例差异通过显式独立 Material 表达。运行材质克隆不回写作者资产。

普通 River 只引用水面纹理；需要可编辑落水外观时选择 `Water/Materials/river-drops.mat`。段型决定水帘几何，外观不授权切挖。落水 speed=0 保留冻结语义。粒子、Mesh、atlas 和编译缓存属于运行 owner，不进入 Source 或撤销记录。

## 质量值属性

`authoring.quality` 是普通组件值。创建时可省略并使用水体类型默认值；`NativeWaterEditor.change` 的局部 Quality 补丁保留未指定字段，接受后的值通过 Source/Prefab 保存，未知字段和资源引用会被拒绝。正式 editor 的 Inspector 由 E 项接入，本轮未新增专属资产类型。

```ts
await water.change({
  operation: "update", id: sourceComponentId,
  patch: { quality: {
    query: "off",
    reflectionBudget: { screenSpace: false },
    spatialField: { maximumDepthError: 0 }
  } }
});
```

| 属性 | 类型与合法范围 | 默认值 |
| --- | --- | --- |
| geometry / surfaceShading | low、medium、high 枚举 | high / high |
| sceneFields | local-only、scene-color、scene-color-depth | scene-color-depth |
| opaqueDownsampling | none、2x、4x；只控制 Scene Color | Lake/River none，Ocean 2x |
| reflectionBudget.environment / screenSpace | boolean | environment=true；screenSpace 在 Lake/River 为 true，Ocean 为 false |
| surfaceEffectBudget.caustics | boolean | true；与材质意图共同决定是否启用焦散 |
| query | off、sparse、dense | dense；off 移除查询能力，保留水体作者和渲染 |
| spatialField.maximumHorizontalError / maximumDepthError | 有限非负数，米 | 见下表 |
| spatialField.maximumGpuDepthDecodeError / maximumGpuShoreDecodeError | 有限非负数，米 | 见下表 |
| spatialField.maximumAtlasPixels | 非负安全整数，0～Number.MAX_SAFE_INTEGER | 见下表；满足值域不保证当前水体能在该预算内编译 |

| 默认类型 | 水平误差 | 深度误差 | GPU 深度误差 | GPU 岸距误差 | Atlas 像素上限 |
| --- | --- | --- | --- | --- | --- |
| Lake | 1 | 0 | 0.02 | 0.1 | 65536 |
| River | 0.25 | 0 | 0 | 0 | 9007199254740991 |
| Ocean | 4 | 0 | 1 | 0.3 | 16777216 |

可选 `backendBudgets.ocean` 保留现有后端参数：finitePatchSegments、fixedLodCentralPatchSegments 是 1～192 的整数；fixedLodRingPatchSegments、fixedLodFirstRingPatchSegments 是 1～96 的整数；nearshoreFixedStepRateHz 为 (0,30] Hz，nearshoreMaximumSeekSeconds 为 (0,600] 秒；windResponseFixedStepRateHz 为 (0,120] Hz，windResponseMaximumCatchUpSteps 是 1～16 的整数。省略时沿用现有 Ocean 后端默认值。不支持的能力组合或不足的预算在编译/激活时明确失败，不改写物理形状以迁就预算。

Quality 与 shape、床面和 Material 分别修改。共享默认使用 Prefab 模板，实例只覆盖修改的叶子；模板修改其他质量字段时继续继承。运行所需的不可变 QualityResource 由组件缓存、保留和释放，不写回项目资产。

## Terrain 与连接

`WaterAPI.resolveRiver` 的 `ok:true/applied:false` 只表示解析成功。支持切挖的宿主必须先接受地形修改，准备最终 Terrain 与全部 Water 候选，再同步发布；失败或取消保留上一套一致的运行状态。Seed World 复用原有 Terrain/Water 发布事务。独立 Water Editor 的人工床面只读，河深与床面不匹配时返回 `TERRAIN_CHANGE_REQUIRED`，不伪装成已雕刻。

连接使用原生 Source 组件引用。连接组从当前已接受床面重编译 port 与岸距。当前静态连接要求两端的世界放置均为单位变换；不支持单端移动。删除一端时，公共作者事务同时清除相关引用，运行重新编译连接遮罩。

`sample` / `sampleSurface` 区分 actual、proxy、unsupported。`sampleDrops` 单独查询水帘；水帘厚度、泡沫和粒子不作为普通水深或湿区。

## 保存与验收

首次生成的具体水体和按 Seed 的初始化记录在同次作者提交中接受。之后重算读取 Source，不覆盖人工修改，也不补回已删除对象。新会话从存储加载项目，普通撤销栈从头开始。受控关闭先停止并排空写入，再保存，保存成功后释放运行资源；保存失败可重试。

本期不实现历史项目转换、水量守恒、出水口 CRUD、降雨演算或游泳玩法。正式 editor 接入后置。源码、资产清单与本次验证结果见 [实施记录](../../../EDITOR_MIGRATION_IMPLEMENTATION.md)；落水素材来源见 [落水来源](../resources/river/assets/drops/README.md)。
