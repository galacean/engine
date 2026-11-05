# Runtime 查询与截图身份

公共层提供实际 Engine 节点、组件与绘制实例的身份，不识别树、动物或其他业务类型。运行时 ID 直接使用 Engine instanceId 数值，主线程按需登记弱引用，节点重建后不会复用旧 ID；它与编辑态 ID 不可互换。截图句柄带会话标识，不能跨页面刷新使用。

## 查询链路

`world.view.hitPoints({ snapshotId, pointers })` 返回截图时的 `entityId/componentId/componentType`，批量绘制额外返回 `instanceIndex` 和可选 `instanceKey`。随后可调用：

- `runtime.entity.inspect({ entityId })`：名称、父节点、组件 ID、局部变换。entityId 原样来自拾取或实体查询，无需改名或转换。
- `runtime.entity.children({ entityId?, offset?, limit? })`：分页遍历，省略 entityId 返回根节点。
- `runtime.component.query({ entityId, type? })`：节点实际挂载的组件类型、属性名。
- `runtime.component.read({ componentId, fields })`：显式读取当前公开字段，以可序列化值及 Entity/Component 引用返回；不调用方法、不写入状态。

实体记录返回 entityId，组件记录返回 componentId 及所属 entityId。两个 inspect/read 接口的旧 id 参数及记录中的旧 id 字段仅为兼容保留；新旧参数只能选一种，同时传入会报错。作者身份仍使用字符串，不能把运行时数字 ID 当作作者身份，也不能把实体 ID 用作组件 ID。

截图同步生成最长边 768 的正常照片和编号纹理。正常照片编码为 JPEG（质量 0.8），编号纹理保留在 GPU；截图时不读回整张编号图、不保存深度或全场景节点结构。每个绘制批次保存一份 Renderer 身份，批量实例的 opaque key 在截图时复制，后续不得调用可变 producer 解析旧实例。临时 RT 的深度附件在截图完成后释放。

`hitPoints` 将附近坐标合并为最多 16×16 的按需读回，Worker 只收到命中引用；区域查询显式读回选区包围矩形并临时扫描。所有节点/组件查询均读取当前真实对象，销毁或 pendingDestroy 后返回 unavailable；不冒充历史节点数据。

每个截图管理器最多保留 4 张、编号纹理总计最多 8 MiB（不含照片、引用表和临时渲染资源）。最近两个未占用快照保留，编辑器/附件/执行任务 pin 的截图不会被驱逐；预算不足时报 SNAPSHOT_CAPACITY。驱逐、dispose 释放 GPU 纹理；上下文丢失后旧图查询报 SNAPSHOT_EXPIRED，不重新渲染当前场景顶替旧图。

LLM 的 Agent Script 在 Worker 内运行，四个 runtime API 复用现有 Tool RPC，由主线程读取 Engine，再回传普通数据。只在原生场景投影确有映射时返回 authoring，指向现有编辑态记录；没有映射时不猜测父节点或业务所有权。原 editor.entity、editor.component 和资产编辑能力继续保留。

authoring.componentQuery 可原样传给 `editor.component.query`：有组件映射时包含精确 id，只有实体映射时查询该作者实体的组件。返回的是可读身份，仍须根据实际 type 和组件声明确认编辑能力；它不授权修改父节点或其他对象。

组件类型来自实际 query 结果，方法与参数通过 Engine/项目声明查询；资产仍通过现有 editor.asset.list 与文件声明发现。读取组件属性不代表该属性允许直接修改。

## Renderer 覆盖与系统负责人边界

`RuntimeMeshPickSource` 自动发现启用且激活的普通 MeshRenderer 和 SkinnedMeshRenderer，目前支持内置 PBR、Unlit、BlinnPhong 材质及其骨骼/BlendShape 变形和 alpha cutoff。混合透明像素没有唯一对象身份，不能将此能力描述为任意透明 Shader 的精确拾取。

自定义 Shader、程序化几何与 GPU 批量实例通过同一个 `RuntimePickBatch` 接口提供 count、实例对应关系及 prepare/restore。实例索引只在该次绘制内有意义，公共层不根据它推测业务对象；生产方可返回自己的 opaque instanceKey。已有自定义 producer 优先于自动 Mesh 接入，同一 Renderer 不可注册两次。没有合格 producer 的自定义绘制仍是未注册表面，不能拿错误的替代几何补命中。

系统负责人负责实例身份与业务数据的映射，以及各系统的持久化、修改、删除、重建和可调用组件契约。本分支不携带这些系统内部改动。此前新增的动物专用拾取、单只删除及种群身份改动已移除，地形／道路拾取和公共参数工具恢复 dev/2.0 基线。普通 Mesh 由公共层自动发现，现有自定义 producer 沿用基线接口。截图契约不提供树专用修改提示或动物删除引导。

## 验证入口

- 单元与 Tool 边界：`demos/terrain/project-tests/RuntimeSceneInspection.spec.ts`。
- 真实 WebGL / Worker：`shared/runtime-inspection/tests/index.html`，结果在页面 #result。
- Seed 集成：`demos/terrain/seed-world-planner/index.html` 的截屏按钮与自由标记附件。

浏览器夹具检查自动 Mesh 发现、遮挡、材质恢复、三类内置材质 alpha cutoff、骨骼移动、按需读回、当前结构、销毁不复用，以及真实 Worker 的运行时 Tool 查询。对象识别验收与修改/删除是不同目标；此链路不宣称已经实现通用运行时写入。
