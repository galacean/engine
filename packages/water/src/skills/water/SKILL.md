---
name: water
description: 读取或修改湖泊、河流、海洋等 Source 水体组件时使用。
---

# 水体

用 `tools.water.author` 读取或编辑 Source 水体组件。输入合同见 `declare/editor/water/authoring.md` 和 `declare/editor/water/WaterAuthoring.d.ts`。先用 `list`、`get` 取得组件 ID 和当前作者值；world.query 返回的 Ref 不是 Source 组件 ID。

## 形状与放置

- 形状坐标和高程是局部米制，放置由 Entity Transform 提供。
- 湖泊有固定的参考水位和独立的水位偏移；河流由控制点、宽度、深度和段型组成；海洋只支持其 backend 声明的字段。
- 人工床面只读，不能雕刻 Terrain。Seed World 宿主可以把 Terrain 与 Water 一起准备。

## 外观与质量

- 每个水体引用一份原生 Material，Material 持有视觉数值、外观策略和原生 Texture 引用；固定编译结构由 Shader 家族代码定义。不要创建或选择独立的 Look 资产。
- 编辑共享资源选 `shared`；需要独立外观时选 `instance`，会复制出独立 Material。
- Quality 是组件上的类型化值，控制几何、着色、场景字段、反射与焦散预算、查询密度和空间场上限。用局部补丁修改，例如 `{ query: "off" }`；省略字段保持当前值，新建使用该水体类型的默认值；显式 `false` 和 `0` 都是有效值。不要引用或创建 Quality 文件。Quality 修改不改变形状、床面或 Material。Prefab 模板提供共享默认值，实例按叶子覆盖。
- Source 之间的连接使用组件引用。

## 事务与结果

- 工具返回 `prepared-in-draft`，表示修改已进入当前草稿。外层事务 commit 并 activate 后才能报告修改已接受或运行生效；保存需要另行等待。UI 与工具共用同一项目事务和历史。
- 运行失败时保留上一次发布的水体。报告目标、字段或资产路径以及失败原因；不能仅凭草稿数据报告水体操作成功。

## 查询

隐藏水面保留查询，禁用水体移除查询。查询字段报告 `actual`、`proxy` 或 `unsupported`。海洋报告基准面，不含可视波峰。水帘用 `sampleDrops` 查询，它不是普通湿区。

## 接口索引

<!-- API_INDEX: generated from executable contracts at load time. -->
