---
order: 5
title: UIGroup
type: UI
label: UI
---

The `UIGroup` component allows you to inherit or ignore properties such as **opacity** and **interactivity**.

## Editor Usage

Select the node, then in the **[Inspector Panel](/docs/interface/inspector)**, click **Add Component** and choose **UIGroup**. You can control the opacity of multiple UI elements by modifying the settings.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*PWGYRb7MJs4AAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

## Properties

| Property Name       | Description                        |
| :------------------ | :--------------------------------- |
| `alpha`             | Opacity                            |
| `interactive`       | Whether the element is interactive |
| `ignoreParentGroup` | Whether to ignore the settings of the parent group |

> UIGroup resolves the issue where UI element properties cannot be passed from parent to child.

## Script Development

<playground src="xr-ar-simple.ts"></playground>