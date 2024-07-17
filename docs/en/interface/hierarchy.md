---
order: 2
title: Hierarchy Panel
type: Basic Knowledge
group: Interface
label: Basics/Interface
---

The hierarchy panel is located on the far left of the editor, displaying all nodes in the current scene in a tree-like structure. Scene nodes are parent nodes of all other nodes, including cameras, lights, grids, and more.

<img alt="Hierarchy Panel" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*w_LPQbXK5OcAAAAAAAAAAAAADhuCAQ/original" style="zoom:50%;"  >

In the hierarchy panel, you can:

- Add, delete, or clone a node
- Copy the path information of a node
- Adjust the hierarchy of nodes by dragging and dropping
- Search for nodes in the scene
- Temporarily hide a node

## Adding, Deleting, and Copying Nodes

### Adding a Node

> You can add either an empty node or quickly add a node with corresponding functional components, such as a node with a camera component, a node with a light source component, or a node with 3D/2D basic rendering components mounted.

You can follow the steps of **clicking the add button** <img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*z9xnR68jixgAAAAAAAAAAAAADhuCAQ/original" width="20" height="20"> -> **selecting the node to add** to add a node. Please note that if you have a node selected at this time, the added node will become a **child node of the selected node**, otherwise, it will default to being a child node of the scene:

<div style="text-align:center;">
    <img alt="add button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*JmW8S4_cb4YAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">Adding a node via the add button</figcaption>

You can also follow the steps of **right-clicking a node** -> **selecting the node to add** to add a child node to that node:

<div style="text-align:center;">
    <img alt="right click" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*JmW8S4_cb4YAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">Adding a node via right-click</figcaption>

After adding, you can edit the properties of the new node in the **[Inspector Panel](/en/docs/interface-inspector)**.

### Deleting a Node

> Deleting a node will remove the node and all its child nodes. Therefore, when deleting a node, you need to consider whether the deleted node will affect other nodes in the scene.

You can follow the steps of **selecting the node to delete** -> **clicking the delete button** <img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*pdYsTLNgz2IAAAAAAAAAAAAADhuCAQ/original" width="20" height="20"> to delete a node:

<div style="text-align:center;">
    <img alt="del button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*P7PJTrSlaHMAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">Removing a node via the delete button</figcaption>

You can also follow the steps of **right-clicking a node** -> **Delete** to remove that node:

<div style="text-align:center;">
    <img alt="del button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*4FP6QqedU5QAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">Removing a node via right-click</figcaption>


In addition, you can also delete the node directly after selecting it using the shortcut key <img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*PzBBTZF1HwEAAAAAAAAAAAAADhuCAQ/original" width="65" height="25">.

### Copy Node

> Copying a node will copy the selected node and all its child nodes, essentially invoking the engine's [clone](/en/docs/core-clone) capability.

After selecting a node, you can quickly clone the node at the same level by using `Duplicated`.

<div style="text-align:center;">
    <img alt="del button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*ZBAsRKWVP9oAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">Duplicated Clone Node</figcaption>

You can also choose `copy` and `paste` separately to achieve cross-level copying.

<div style="text-align:center;">
    <img alt="del button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*9groQ7DrzM4AAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">Copy Paste Clone Node</figcaption>

In addition, you can quickly duplicate the selected node by using the shortcut keys `⌘` + `D`.

## Node Sorting

To better organize nodes, you can sort nodes by dragging them. After selecting a node, you can change the position of the node in the hierarchy tree by dragging it with the left mouse button.

<div style="text-align:center;">
    <img alt="del button" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*eQi1SZYqqCgAAAAAAAAAAAAADhuCAQ/original" >
</div>
<figcaption style="text-align:center; color: #889096;font-size:12px">Drag and Drop Sorting</figcaption>

## Node Search

There is a search box at the top of the hierarchy panel where users can enter the node's name to search for nodes in the scene. The search box supports fuzzy search, allowing you to enter partial characters of the node name to find nodes.

## Node Visibility

Each entity node has an eye button on the right side, which can toggle the node's display/hide status in the scene.

> It is important to note that the adjustment of the node's display status here is only a modification in the workspace, not the `isActive` property in the **[Inspector Panel](/en/docs/interface-inspector)**.

## Shortcut Keys

The following operations will take effect after selecting a node.

| Operation       | Shortcut                                                                                                                          |
| :-------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| `Delete Node`   | <img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*PzBBTZF1HwEAAAAAAAAAAAAADhuCAQ/original" width="65" height="25"> |
| `Copy Node`     | `⌘` + `D`                                                                                                                         |
| `Select Previous Node` | Up Arrow ⬆️                                                                                                                         |
| `Select Next Node`     | Down Arrow ⬇️                                                                                                                         |
| `Expand Node`   | Right Arrow ➡️                                                                                                                         |
| `Collapse Node` | Left Arrow ⬅️                                                                                                                         |

Please paste the Markdown content you need to be translated.
