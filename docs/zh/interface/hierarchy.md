---
order: 3
title: 层级面板
type: 基础知识
group: 界面
label: Basics/Interface
---

层级面板位于编辑器的最左侧，它以树状结构显示当前场景中的所有节点，场景节点是所有其他节点的父节点，包括相机、灯光、网格等等。

<img alt="Hierarchy Panel" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*w_LPQbXK5OcAAAAAAAAAAAAADhuCAQ/original" style="zoom:50%;"  >

在层级面板，您可以：

- 添加，删除或克隆某个节点
- 复制节点的路径信息
- 通过拖拽调整节点的层级
- 模糊搜索场景中的节点
- 临时隐藏某个节点

## 节点的新增，删除与拷贝

### 新增节点

> 您既可以添加空节点，也可以快速添加挂载相应功能组件的节点，如挂载相机组件的节点，挂载光源组件节点，以及挂载 3D/2D 基础渲染组件的节点。

您可以按照 **点击添加按钮**<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*z9xnR68jixgAAAAAAAAAAAAADhuCAQ/original" width="20" height="20"> -> **选择要添加的节点** 的步骤新增节点，需要注意的是，若您此时正选中了某个节点，那么添加的节点将会成为**选中节点的子节点**，否则将默认为场景的子节点：

<div style="text-align:center;">
    <img alt="add button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*JmW8S4_cb4YAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">通过添加按钮新增节点</figcaption>

您也可以按照 **右键某个节点** -> **选择要添加的节点** 的步骤为该节点新增子节点：

<div style="text-align:center;">
    <img alt="right click" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*JmW8S4_cb4YAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">右键新增节点</figcaption>

添加完毕后，您可以在 **[检查器面板](/docs/interface-inspector)** 中对新节点的属性进行编辑。

### 删除节点

> 删除节点会删除节点及其所有的子节点。所以在删除节点时，你需要注意所删除的节点是否会影响场景中其他节点。

您可以按照 **选中待删节点** -> **点击删除按钮**<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*pdYsTLNgz2IAAAAAAAAAAAAADhuCAQ/original" width="20" height="20"> 的步骤删除节点：

<div style="text-align:center;">
    <img alt="del button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*P7PJTrSlaHMAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">通过删除按钮移除节点</figcaption>

您也可以按照 **右键某个节点** -> **Delete** 的步骤移除该节点：

<div style="text-align:center;">
    <img alt="del button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*4FP6QqedU5QAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">右键移除节点</figcaption>

此外，您还可以在选中后通过快捷键<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*PzBBTZF1HwEAAAAAAAAAAAAADhuCAQ/original" width="65" height="25">直接删除节点。

### 拷贝节点

> 拷贝节点会拷贝选中节点及其所有的子节点，本质上是在调用引擎的[克隆](/docs/core-clone)能力。

你可以在选中某节点后，通过 `Duplicated` 在同层级下快速克隆该节点。

<div style="text-align:center;">
    <img alt="del button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*ZBAsRKWVP9oAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">Duplicated 克隆节点</figcaption>

也可以分别选择 `copy` 与 `paste` ，从而实现跨层级拷贝。

<div style="text-align:center;">
    <img alt="del button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*9groQ7DrzM4AAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">Copy Paste 克隆节点</figcaption>

此外，您还可以通过快捷键 `⌘` + `D` 快速复制选中的节点。

## 节点排序

为了更好的组织节点，你可以通过拖拽的方式来排序节点。选中一个节点后，可以通过鼠标左键拖拽来改变节点在层级树中的位置。

<div style="text-align:center;">
    <img alt="del button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*eQi1SZYqqCgAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px"> 拖拽排序 </figcaption>

## 节点搜索

层级面板上方有一个搜索框，用户可以输入节点的名称来搜索场景中的节点。搜索框支持模糊搜索，你可以输入节点名称的部分字符来查找节点。

## 节点隐藏

每个实体节点右侧都有一个眼睛按钮，点击可以切换节点在场景中的显示/隐藏状态。

> 需要注意的是, 此处对节点显示状态的调整仅是工作区的修改, 而非在 **[检查器面板](/docs/interface-inspector)** 中的 `isActive` 的属性。

## 快捷键

以下操作在选中节点后方可生效。

| 操作 | 快捷键 |
| :-- | :-- |
| `删除节点` | <img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*PzBBTZF1HwEAAAAAAAAAAAAADhuCAQ/original" width="65" height="25"> |
| `复制节点` | `⌘` + `D` |
| `选中上一个节点` | 方向键 ⬆️ |
| `选中下一个节点` | 方向键 ⬇️ |
| `展开节点` | 方向键 ➡️ |
| `折叠节点` | 方向键 ⬅️ |
