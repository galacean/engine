---
order: 2
title: UITransform
type: UI
group: quickStart
label: UI/quickStart
---

[UITransform](/apis/core/#SpriteRenderer) 组件是专门设计用来表示 UI 元素的尺寸和位置的，她继承于 [Transform](/apis/core/#SpriteRenderer)

## 属性

除了 [Transform](/apis/core/#SpriteRenderer)

| 属性名  | 描述                                      |
| :------ | :---------------------------------------- |
| `size`  | UI 元素的尺寸，`x` 代表宽度，`y` 代表高度 |
| `pivot` | UI 元素的锚点                             |

## 编辑器

添加了 UI 组件的节点，会自动添加 `UITransform` 组件（替换原先旧的 `Transform` 组件），在编辑器中，可以选中节点可以使用 `RectTool` （快捷键 `T` ）快速设置属性，也可以在在 **[检查器面板](/docs/interface/inspector)** 设置精确属性。

![alt text](<2025-01-24 22.17.44.gif>)