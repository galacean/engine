---
order: 1
title: C4D Baking
type: Art
label: Art
---

Using C4D-OC renderer baking (windows) as an example.

### What is Baking

Baking is to express all rendered material color information in the form of a texture.

Baking requires two sets of models: a high poly model and a low poly model. The high poly model is used to bake textures with higher detail, while the low poly model is used in the engine with the texture. When creating them, ensure the UVs are consistent. First, layout the UVs for the low poly model, then refine it to create the high poly model. The high poly model can have more details to bake a texture with richer details.

![1.gif](https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*pbduQosyOJwAAAAAAAAAAAAAARQnAQ)

The left is the low poly model, and the right is the high poly model. From the wireframe information, it can be seen that the high poly model has more fine details.

![2.gif](https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*SgbzSKngA2IAAAAAAAAAAAAAARQnAQ)

There may be differences in wireframe details, but the visible parts of both models should be consistent. The obscured parts are not considered, so the high poly model must be derived from the low poly model to ensure consistent UVs.

### Specific Baking Process

1. Adjust the prepared high poly model in C4D to render the desired effects. For textures used on faces, they also need to be drawn according to the overall UV layout. After adjusting the materials, you can prepare for baking.

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*u81UTYTkSVMAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:50%;" />

2. An important point in baking is to select the camera mode and specify the tags for the cameras that need to be output, adding the camera tags unique to the OC renderer.

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*gRWvSK1MoTMAAAAAAAAAAAAAARQnAQ" style="zoom: 67%;" />

3. Click on the added camera tag to enter the tag properties. There are many options for camera types, one of which is baking. Select baking.

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*7XApTKsQy9wAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom: 67%;" />

4. In the baking menu, set the baking group ID to a number other than 1, here set to 2.

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*n_1qRIkFtdAAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:50%;" />

5. Then group the models that need to be baked together, as shown in the image below, group all the required models and add the OC object tag.

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*_iMOSaTyfroAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:50%;" />

6. Click on the tag to show the tag properties, select the object layer, then set the baking ID inside to the same value as the baking group ID, which is 2 here. Then click render, and you can bake the required images.

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*lP1pQqZWZC8AAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*gsxbTZBSKGQAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:50%;" />

If you are not completely satisfied with the baking results, both C4D and Substance Painter can be used to brush and modify textures. Photorealistic rendering is not the only choice; brushed textures can also be used to recreate some special styles.

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*PCz8TpYJd5wAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*8mwtRY6YdiIAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:50%;" />
