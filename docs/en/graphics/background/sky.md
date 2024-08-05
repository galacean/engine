---
order: 3
title: Sky
type: Graphics
group: Background
label: Graphics/Background
---

Sky is a type of background that is drawn before the camera renders. This type of background is very useful for 3D games and applications as it can provide a sense of depth, making the environment appear much larger than it actually is. The sky itself can contain any objects (such as clouds, mountains, buildings, and other unreachable objects) to create a sense of a distant three-dimensional environment. Galacean can also use the sky to generate realistic environmental lighting in the scene, for more details refer to [Baking](/en/docs/graphics-light-bake).

In Sky mode, developers can set the `material` and `mesh` themselves, and with Galacean's built-in `Skybox` and `Procedural Sky`, they can easily set the desired sky effect.

## Setting up Skybox

In the editor, you can set up a skybox for the background by following these steps:

### 1. Create Skybox Texture

> You can download free HDR textures from [Poly Haven](https://polyhaven.com/) or [BimAnt HDRI](http://hdri.bimant.com/)

The skybox texture is a [cubemap texture](/en/docs/graphics-texture-cube), first prepare the HDR, then follow the path **[Asset Panel](/en/docs/assets/interface)** -> **Right-click to upload** -> **Select TextureCube(.hdr)** -> **Choose the corresponding HDR texture** -> **Cubemap asset created** to complete the operation.

![image.png](https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Oi3FSLEEaYgAAAAAAAAAAAAADhuCAQ/original)

### 2. Create Skybox Material

After creating the cubemap asset, follow the path **[Asset Panel](/en/docs/assets/interface)** -> **Right-click to create** -> **Select Material** -> **Select the generated asset** -> **[Inspector Panel](/en/docs/interface/inspector)** -> **Click on the Shader property in the Base column** -> **Select Sky Box** -> **Click on HDR in the Base column** -> **Select the cubemap created in the first step** to create the skybox material.

![image.png](https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*9j2eSYkwg8MAAAAAAAAAAAAADhuCAQ/original)

### 3. Set up Skybox

Finally, just follow the path **[Hierarchy Panel](/en/docs/interface/hierarchy)** -> **Select Scene** -> **[Inspector Panel](/en/docs/interface/inspector)** -> **Background section** -> **Set Mode to Sky** -> **Select the material created in the second step for Material** -> **Set Mesh to the built-in Cuboid** to see the background of the scene change to a skybox.

![image.png](https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*rqvsSpkGJ6UAAAAAAAAAAAAADhuCAQ/original)

### Code for setting up Skybox

```typescript
// 创建天空盒纹理
const textureCube = await engine.resourceManager.load<TextureCube>({
  urls: [
    "px - right 图片 url",
    "nx - left 图片 url",
    "py - top 图片 url",
    "ny - bottom 图片 url",
    "pz - front 图片 url",
    "nz - back 图片 url",
  ],
  type: AssetType.TextureCube,
});
// 创建天空盒材质
const skyMaterial = new SkyBoxMaterial(engine);
skyMaterial.texture = textureCube;
// 设置天空盒
const background = scene.background;
background.mode = BackgroundMode.Sky;
background.sky.material = skyMaterial;
background.sky.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
```

## Setting up Procedural Sky

Procedural Sky is the default background in the editor for 3D projects. You can also follow the path **[Hierarchy Panel](/en/docs/interface/hierarchy)** -> **Select Scene** -> **[Inspector Panel](/en/docs/interface/inspector)** -> **Background section** -> **Set Mode to Sky** -> **Select the built-in SkyMat material** -> **Set Mesh to the built-in Sphere**

![image.png](https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Qe3IRJ9ciNoAAAAAAAAAAAAADhuCAQ/original)

### Code for setting up Procedural Sky

```typescript
// 创建大气散射材质
const skyMaterial = new SkyProceduralMaterial(engine);
// 设置天空盒
const background = scene.background;
background.mode = BackgroundMode.Sky;
background.sky.material = skyMaterial;
background.sky.mesh = PrimitiveMesh.createSphere(engine);
```

### Properties

In the **[Inspector Panel](/en/docs/interface/inspector)** of the atmospheric scattering material, you can see many adjustable properties:

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*igE-RLCRc24AAAAAAAAAAAAADhuCAQ/original" alt="image-4" style="zoom:40%;" />


| Property Name                                                              | Explanation                                                                                   |
| :------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| [exposure](/apis/core/#SkyProceduralMaterial-exposure)                     | The exposure of the sky, the higher the value, the brighter the sky.                           |
| [sunMode](/apis/core/#SkyProceduralMaterial-sunMode)                       | The method used to generate the sun in the sky, including `None`, `Simple`, and `HighQuality`, where None does not generate a sun, Simple generates a simple sun, and HighQuality generates a sun with a customizable appearance. |
| [sunSize](/apis/core/#SkyProceduralMaterial-sunSize)                       | The size of the sun, the larger the value, the larger the sun.                                 |
| [sunSizeConvergence](/apis/core/#SkyProceduralMaterial-sunSizeConvergence) | The convergence of the sun's size, only effective when the sun generation mode is `HighQuality`. |
| [atmosphereThickness](/apis/core/#SkyProceduralMaterial-atmosphereThickness) | The density of the atmosphere, higher density absorbs more light.                             |
| [skyTint](/apis/core/#SkyProceduralMaterial-skyTint)                       | The color of the sky.                                                                         |
| [groundTint](/apis/core/#SkyProceduralMaterial-groundTint)                 | The color of the ground.                                                                      |
