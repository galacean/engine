---
order: 1
title: UITransform
type: UI
label: UI
---

`UITransform` 组件是专门设计用来表示 UI 元素的尺寸和位置的，它继承于 [Transform](/apis/core/#Transform) 。

## 编辑器使用

添加了 UI 组件的节点，会自动添加 `UITransform` 组件（替换原先旧的 [Transform](/apis/core/#Transform) 组件），在编辑器中，可以选中节点可以使用 `RectTool` （快捷键 `T` ）快速设置属性，也可以在在 **[检查器面板](/docs/interface/inspector)** 设置精确属性。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*hJ81TKtDKLIAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

> 当主画布的渲染模式为 `Screen` 时，编辑器侧会禁止修改它的 `transform` 避免屏幕适配异常，因此在脚本中，**开发者应当自己避免去篡改屏幕空间主画布 `transform` 的属性**。

## 属性

| 属性名  | 描述                                                                                 |
| :------ | :----------------------------------------------------------------------------------- |
| `size`  | UI 元素的尺寸，`x` 代表宽度，`y` 代表高度，初始化都默认为 `100`                      |
| `pivot` | UI 元素的锚点，它是一个以左下角为原点的归一化的二元向量，默认值为中心点，即(0.5,0.5) |

## 脚本使用

```typescript
// Add UICanvas
const canvasEntity = root.createChild("canvas");
const canvas = canvasEntity.addComponent(UICanvas);
const imageEntity = canvasEntity.create("Image");
(<UITransform>imageEntity.transform).size.set(200, 200);
(<UITransform>imageEntity.transform).pivot.set(0, 0);
```
