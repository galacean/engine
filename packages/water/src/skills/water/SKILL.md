---
name: water
description: 读取或修改湖泊、河流、海洋等 Source 水体组件时使用。
---

# 水体

与建筑相同，持久修改使用公共 `editor.entity`、`editor.component` 和 `editor.asset`。先读公共 Editor 声明，查询 `WaterBodyComponent` 并读取 `props.authoring`。world.query 的 Ref、运行时 waterId 都不是 Source 组件身份。

## 创建与修改

- 新建用 `editor.entity.create` 后 `editor.component.add({scene,entityId,type:"WaterBodyComponent",props:{authoring}})`，或实例化已有原生 Prefab。需要完整 shape、地床来源和 Material 引用；不自动提供地床或雕刻 Terrain。
- 配置字段为 `shape`、`terrain`、`quality`、`material`、`connections`、`visible`、`priority`、`interaction`。`enabled` 是 `props` 的同级组件属性。
- `component.update` 只合并顶层 props，嵌套值整体替换。先读取当前草稿，合并需要修改的子字段，再写回完整 authoring。Quality 内的预算组也要保留其他字段；不要把局部 Quality 对象当作深合并补丁。
- 批量修改在同一次 execute 中多次调用公共 API；新建后可立即在当前草稿继续读取或修改。整个事务通过校验后统一提交。
- 删除使用 `component.remove`，删除 Entity 使用 `entity.delete`。公共准备阶段清理指向本次已删除水体的既有连接；任意错误引用仍会拒绝。

```js
const matches = await editor.component.query({scene, type:"WaterBodyComponent"});
const target = {scene, id:matches[0].id};
const record = await editor.component.read(target);
const authoring = record.props?.authoring;
if (!authoring || typeof authoring !== "object" || Array.isArray(authoring)) throw Error("没有作者配置");
await editor.component.update({...target, props:{authoring:{...authoring, visible:false}}});
```

## 形状与放置

- 形状坐标和高程是局部米制，放置由 Entity Transform 提供。非连接湖/河支持平移、yaw 和单位缩放；Ocean 和连接水体要求 identity 世界变换。
- 湖泊有参考水位和水位偏移；河流由控制点、宽度、深度和段型组成。人工床面只读；宿主地形由现有公共准备与激活链协调。
- 先查询 `tools.water.capabilities({})` 获取宿主限制。SeedWorld Ocean 基准水位为 0，同一场景只支持一个活动 Ocean。

## 外观与质量

- 一份原生 `.mat` 定义外观，纹理使用原生引用；不创建私有 Look 或 Quality 资产。Quality 是组件的类型化值，修改不应改变 shape、terrain 或 Material。
- 用 `tools.water.capabilities({target:{scene,id}})` 获取当前材质路径、真实支持的参数及纹理槽元数据。类型、枚举和范围以此结果为准。
- 通过 `asset.read` 读取 `.mat`，检查 `kind === "structured"` 后使用返回的 `data`；只修改目标 shaderData entry 并保留其 type。参数值使用原生类型；纹理值是 `{url:资产虚拟路径}` 或 `null`。湖/河/海分别有 2/3/5 个公开纹理槽。
- 共享修改：`asset.update` 原材质。实例独立修改：`asset.create` 复制完整材质，再在同一次 execute 中修改目标组件的 `authoring.material.{$ref}`。调用前明确共享范围；不修改其他引用相同纹理的槽或共享 Texture 的采样设置。
- `0`、`false`、空纹理是明确值，不可用 truthy 判断丢弃。资源引用、色彩空间和能力由真实准备阶段校验。

## 事务与结果

- 公共写接口的 await 仅完成草稿修改。外层 commit/activate 完成且无运行错误后，才能报告本次操作成功；保存完成是独立状态，使用公共项目保存操作等待。
- 激活失败不隐式撤销已接受 Source，旧运行结果可能仍可见。报告目标和失败原因，不以旧画面或草稿值证明本次修改成功。
- 撤销、重做使用公共 `editor.history`；不保存第二份 Water 模型或派生运行资源。

## 只读运行查询

`tools.water.sample`、`sampleDrops`、`diagnostics`、`verify` 读取已发布状态，不读取当前草稿。先完成当前 execute，再在下一次 execute 验证结果。target 只传 Source 的 `{scene,id}`，宿主负责解析运行时身份。

隐藏保留查询，禁用退出查询。字段保留 `actual`、`proxy`、`unsupported`；Ocean 返回基准面，不含可视波峰。水帘用 `sampleDrops` 查询。`verify` 检查当前发布状态和可选水体修订，不证明已落盘；诊断能显示尚未成功发布的 Source 水体。

## 接口索引

<!-- API_INDEX: generated from executable contracts at load time. -->
