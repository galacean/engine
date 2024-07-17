---
order: 4
title: Inspector Panel
type: Basics
group: Interface
label: Basics/Interface
---

The Inspector Panel is located on the right side of the editor and is the most commonly used panel while using the editor. Depending on what you have currently selected, the Inspector Panel will display the corresponding properties. You can use the Inspector Panel to edit almost everything in the scene, such as scenes, entities, components, assets, and more.

<div style="display: flex; gap: 20px;">
  <figure style="flex:1;">
  <img src="https://gw.alipayobjects.com/zos/OasisHub/1d2e383b-2451-4d0e-8338-a16b1a99ce92/image-20240318174937155.png" alt="image-20240122144004260" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:12px">Scene Inspector</figcaption>
	</figure>
  <figure style="flex:1;">
    <img src="https://gw.alipayobjects.com/zos/OasisHub/bb8e0881-c716-4fc2-89c0-d7b4b01d668d/image-20240318175043180.png" alt="image-20240122144102202" style="zoom:50%;" />
    <figcaption style="text-align:center; color: #889096;font-size:12px">Entity Inspector</figcaption>
  </figure>
  <figure style="flex:1;">
    <img src="https://gw.alipayobjects.com/zos/OasisHub/1ce2c623-bab4-45dd-a0ef-12ab2e00e9a9/image-20240318175341251.png" alt="image-20240122144141450" style="zoom:50%;" />
    <figcaption style="text-align:center; color: #889096;font-size:12px">Asset Inspector</figcaption>
  </figure>
</div>


## Property Types

The properties in the Inspector Panel can be divided into two main categories:

- **Basic Value Types**: Number adjustments, color selection, property toggles, etc.
- **Reference Types**: Usually resources, such as material selection, texture selection, etc.

### Number Adjustments

There are many number adjustment entries available in the Inspector. For different properties, the range of numbers that can be adjusted and the size of each adjustment may vary. The most typical example is adjusting the position, rotation, and scale values of the `Transform` component.

You can quickly adjust the size of numbers by dragging the slider on the right side of the input box. While dragging, holding down `⌘` (or `ctrl` on Windows) allows for more precise adjustments to the numbers (precision is 1/10 of the original step).

<img src="https://gw.alipayobjects.com/zos/OasisHub/b14cd188-22bf-4d78-b327-07a331f3c58b/image-20240318175444343.png" alt="image-20240318175444343" style="zoom:50%;" />

Some adjustable properties appear in the form of sliders. You can drag the slider to quickly adjust the size of numbers, such as the `Intensity` of a light. Similarly, while dragging the slider, holding down `⌘` (or `ctrl` on Windows) allows for more precise adjustments to the numbers.

<img src="https://gw.alipayobjects.com/zos/OasisHub/440cd2ed-d1eb-474f-be7e-7a35cac8c954/image-20240318175518354.png" alt="image-20240318175518354" style="zoom:50%;" />

There are also number adjustment properties that appear in the form of input boxes and buttons, such as the `Near Plane` of a shadow. These properties often have more precise step sizes (such as 0.1, 1, 10). Clicking the button directly increases or decreases the value by the step length.

<img src="https://gw.alipayobjects.com/zos/OasisHub/14c8726c-1a91-4206-8e73-93d436109172/image-20240318175638055.png" alt="image-20240318175638055" style="zoom:50%;" />

### Color Panel

Some properties need color adjustments, such as lighting, scene background color, or the self-illuminating color of materials. To adjust colors, you need to click on the color button on the left to bring up the color picker. In the color picker, you can use HUE to select colors, adjust the color's transparency; you can also adjust the specific RGBA values of the color in the input box. Click the <img src="https://gw.alipayobjects.com/zos/OasisHub/dc030a4b-8813-4ea2-acb0-549c04363b1d/image-20230926110451443.png" alt="image-20230926110451443" style="zoom: 33%;" /> button to switch between HSLA, RGBA, and HEXA modes.

<img src="https://gw.alipayobjects.com/zos/OasisHub/d340d0ea-a88a-4b82-b6c4-c69d3f4b8c4e/image-20240318175748734.png" alt="image-20240318175748734" style="zoom:50%;" />

### Asset Selection Popup

Some properties need to reference the required assets. In this case, you can click on the input box of the asset selector to bring up the asset selection popup. Different properties require different types of assets, but the asset selector has already been pre-configured with the corresponding filters, so you can select directly.

The asset selection popup also provides a search box that you can use to find the corresponding assets more accurately.

<div style="display: flex; gap: 20px;">
  <figure style="flex:1;">
  <img src="https://gw.alipayobjects.com/zos/OasisHub/b7845736-d13a-4332-af75-65cf1e2bb268/image-20240318175855279.png" alt="image-20240122143554973" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:12px">Mesh Asset Picker</figcaption>
	</figure>
  <figure style="flex:1;">
    <img src="https://gw.alipayobjects.com/zos/OasisHub/b8463854-4343-4dea-b1cf-713a7c617288/image-20240318175957149.png" alt="image-20240122134039213" style="zoom:50%;" />
    <figcaption style="text-align:center; color: #889096;font-size:12px">Texture Asset Picker</figcaption>
  </figure>
</div>

