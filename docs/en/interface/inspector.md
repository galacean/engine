---
order: 4
title: Inspector Panel
type: Basics
group: Interface
label: Basics/Interface
---

The Inspector panel is located on the right side of the editor and will be the most frequently used panel during your use of the editor. Based on what you currently have selected, the Inspector panel will display the corresponding properties. You can use the Inspector panel to edit almost everything in the scene, such as scenes, entities, assets, etc.

<img src="https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*NWWWTp5Le1cAAAAAAAAAAAAADqiTAQ/original" />

## Types of Inspectors

### Scene Inspector

<img src="https://gw.alipayobjects.com/zos/OasisHub/6429cce7-8fe4-4c12-bd41-1911f53acc5d/image-20240709111320128.png" style="zoom:50%;" />

The scene is at the top of the hierarchy tree. By clicking on the scene, you can see that the Inspector provides adjustments for scene-related effects such as ambient light, background, shadows, fog, etc. For detailed parameters on how to edit these elements, see [Scene](/en/docs/core/scene).

<img src="https://gw.alipayobjects.com/zos/OasisHub/cfdc7905-7a4f-47bb-aa77-3f3866486cee/image-20240709141658903.png" style="zoom:50%;" />

### Entity Inspector

The Entity Inspector is the most commonly used inspector. Its properties include the current entity's component list. You can easily modify the properties of a component or conveniently add any built-in engine components and custom script components through the **Add Component** button. The Entity Inspector also includes basic information about the current entity, such as `Transform`, `Layer`, etc. For more details, see [Entity](/en/docs/core/entity).

<img src="https://gw.alipayobjects.com/zos/OasisHub/bb8e0881-c716-4fc2-89c0-d7b4b01d668d/image-20240318175043180.png" style="zoom:50%;" />

### Asset Inspector

After selecting an asset in the asset panel, the Inspector will display the various properties of the current asset and provide a previewer to show the editing results in real-time. The following image is a screenshot of the Inspector for a material asset.

<img src="https://gw.alipayobjects.com/zos/OasisHub/1ce2c623-bab4-45dd-a0ef-12ab2e00e9a9/image-20240318175341251.png" style="zoom:50%;" />

## Using Inspector Controls

Inspector controls can be divided into two main categories:

- **Basic Value Types**: Number adjustment, color selection, property toggling, etc.
- **Reference Types**: Usually resources, such as material selection, texture selection, etc.

### Number Adjustment Controls

The Inspector provides many entry points for number adjustments. Depending on the property, the range of adjustable numbers and the size of each adjustment will vary. The most typical example is adjusting the position, rotation, and scale values of the `Transform` component.

You can quickly adjust the number size by dragging the slider on the right side of the input box. While dragging, holding down <Kbd>⌘</Kbd> (on Windows, <Kbd>Ctrl</Kbd>) allows for more precise number adjustments (precision is 1/10 of the original step).

<img src="https://gw.alipayobjects.com/zos/OasisHub/b14cd188-22bf-4d78-b327-07a331f3c58b/image-20240318175444343.png" style="zoom:50%;" />

Some adjustable properties appear in the form of sliders. You can drag the slider to quickly adjust the number size, such as the `Intensity` of a light. Similarly, while dragging the slider, holding down `⌘` (on Windows, `ctrl`) allows for more precise number adjustments.

<img src="https://gw.alipayobjects.com/zos/OasisHub/440cd2ed-d1eb-474f-be7e-7a35cac8c954/image-20240318175518354.png" style="zoom:50%;" />

Some number adjustment properties appear in the form of input boxes and buttons, such as the `Near Plane` of shadows. These properties often have more precise step sizes (e.g., 0.1, 1, 10). Clicking the buttons can directly increase or decrease the value by the step length.

<img src="https://gw.alipayobjects.com/zos/OasisHub/14c8726c-1a91-4206-8e73-93d436109172/image-20240318175638055.png" style="zoom:50%;" />

### Color Picker

Some properties require color adjustments, such as lighting, scene background color, or the emissive color of a material. To adjust the color, you need to click the color button on the left to bring up the color picker. In the color picker, you can use HUE to select the color and adjust the color's transparency; you can also adjust the specific RGBA values in the input box. Click the <img src="https://gw.alipayobjects.com/zos/OasisHub/dc030a4b-8813-4ea2-acb0-549c04363b1d/image-20230926110451443.png" style="zoom:33%;" /> button to switch between HSLA, RGBA, and HEXA modes.

<img src="https://gw.alipayobjects.com/zos/OasisHub/d340d0ea-a88a-4b82-b6c4-c69d3f4b8c4e/image-20240318175748734.png" style="zoom:50%;" />

### Asset Picker

Some properties require referencing the necessary assets. In this case, you can click the input box of the asset picker to bring up the asset picker. Different properties require different types of assets, but the asset picker is already configured with the appropriate filters, so you can select directly.

The asset picker also provides a search box, which you can use to find the corresponding assets more precisely.

<img src="https://gw.alipayobjects.com/zos/OasisHub/b8463854-4343-4dea-b1cf-713a7c617288/image-20240318175957149.png" style="zoom:50%;" />
