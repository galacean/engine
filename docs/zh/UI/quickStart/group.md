---
order: 1
title: UIGroup
type: UI
label: UI
---

通过 [UIGroup] 组件，可以继承或忽略**透明度**，**是否可交互**等属性。

## 属性

| 属性名              | 描述                      |
| :------------------ | :------------------------ |
| `alpha`             | 透明度                    |
| `interactive`       | 是否可交互                |
| `ignoreParentGroup` | 是否忽略上层 Group 的设置 |

> UIGroup 解决了 UI 元素的属性无法由父传递给子的问题。

## 编辑器



## 脚本开发

<playground src="xr-ar-simple.ts"></playground>
