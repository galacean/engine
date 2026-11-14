---
name: assets-use-model
description: 把 GLB 模型放到场景，或由 Script 加载模型时使用。
---

# 使用 GLB 模型

GLTF 资产不是 Prefab。放置模型的做法是：在节点上挂一个 Script 组件，用组件属性引用模型，由 Script 实例化。

## 完整流程

下面两次 execute 就能放好一个外部模型。不需要再读其他文档，除非任务超出这个流程。

先读 project.json 取得活动 Scene。落点用已知坐标。相对位置按宿主的空间 Skill 解析。

```js
// 第 1 次 execute：导入模型，创建加载脚本
await editor.asset.import({
  source: "/oss/assets/model/prop/car-firetruck/firetruck.glb",
  path: "Models/firetruck.glb"
});
await editor.asset.create({
  path: "Scripts/PlaceModel.ts",
  type: "script",
  content: `import { Script, GLTFResource } from "@galacean/engine";

export default class PlaceModel extends Script {
  model!: GLTFResource;

  onAwake(): void {
    if (!this.model) return;
    this.entity.addChild(this.model.instantiateSceneRoot());
  }
}
`
});
```

```js
// 第 2 次 execute：创建节点并挂载脚本
const scene = "<project.json 的 scene 字段>";
const { id } = await editor.entity.create({ scene, name: "FireTruck", position: [x, y, z] });
await editor.component.add({
  scene,
  entityId: id,
  type: "Script",
  script: { $ref: "Scripts/PlaceModel.ts" },
  props: { model: { $ref: "Models/firetruck.glb" } }
});
```

## 确认结果

回执为 committed 且没有运行错误，就说明编辑已生效。需要确认外观时，调用一次 snapshot。画面里能看到模型就可以结束。

不要沿 pick 的结果逐级追查父节点来证明身份。模型的子节点是运行时实例，不在 `editor.entity` 的作者层级中，查询作者节点的子节点数为 0 是正常现象。只有画面和预期不符时，才用运行时查询排查。

## 其他用法

- 候选模型较多或需要按需加载时，见[配置资产](skills/scripting/references/configured-assets.md)。
- Script 资产中调用 Engine 方法，execute 中调用 Editor 声明的方法。不要在 execute 中直接使用 GLTFResource 实例，也不要照搬 Editor 的 gltf.create、instantiate、unpack 等未提供的方法。

## 保留模型结构

完整模型包含网格、材质、节点变换，可能还有动画。单独选一个网格子资源只得到几何，不含完整节点层级。整体摆放时，优先保留模型根节点及其子层级。需要独立几何时，检查所需变换，不猜测子资源索引。

模型外形可能偏离根节点原点。摆放时要结合包围盒、父子变换、缩放和朝向。多个模型的根节点位置相同，不代表外形已经对齐。修改材质前，检查实际引用，判断该改共享材质还是当前实例的绑定，避免影响其他对象。
