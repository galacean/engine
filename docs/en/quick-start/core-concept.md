---
order: 1
title: Core Concepts
type: Basics
group: Getting Started
label: Basics/GettingStarted
---

Let's understand the core concepts in the editor and runtime through an example of a cube.

## Editor Usage

### Creating a Project

After logging in, you will first see the homepage of the editor, where all your created projects are displayed. Use the button in the top right corner to create a project. After clicking, you can choose the type of project to create, either 2D or 3D. Let's choose a 3D Project.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*luxKRKYGSBMAAAAAAAAAAAAADhuCAQ/original" alt="image-20230921161225962" style="zoom:50%;" />

### Creating a Cube

First, we create a new entity in the **Hierarchy Panel** ([What is an entity?](https://galacean.antgroup.com/#/en/docs/latest/cn/entity)).

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*g-zmTr6rD9MAAAAAAAAAAAAADhuCAQ/original" alt="image-20230921161422138" style="zoom:50%;" />

Select the newly created entity node with the left mouse button. The **[Inspector Panel](/en/docs/interface-inspector)** on the right will display some configurable properties of the current entity. Since our entity is not currently associated with any components ([What is a component?](https://galacean.antgroup.com/#/en/docs/latest/cn/entity)), we can only adjust basic properties like the entity's coordinate information for now.

Next, click the `Add Component` button in the **[Inspector Panel](/en/docs/interface-inspector)** to bring up the component menu, then choose to add a `Mesh Renderer` component ([What is a Mesh Renderer?](/en/docs/graphics-renderer-meshRenderer)).

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*TrArQ7FmXc4AAAAAAAAAAAAADhuCAQ/original" alt="image-20230921161622497" style="zoom:50%;" />

Now, we have added a `Mesh Renderer` component to the current entity. However, we still cannot see this object in the main editing area. We need to add Mesh and Material to this component. The editor will automatically add a non-editable default material for the `Mesh Renderer` component. We just need to add a Cuboid Mesh to the Mesh property of the component to see it in the scene.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*pc_6S5zuGhYAAAAAAAAAAAAADhuCAQ/original" alt="image-20230921161758541" style="zoom:50%;" />

Since the default material is quite simple, let's create a custom material next.

You can also quickly add a cube model by clicking the `3D Object` → `Cuboid` in the add entity button, which will automatically add a `Mesh Renderer` component for you:

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*zlEzSLQ-L9cAAAAAAAAAAAAADhuCAQ/original" style="zoom:50%;" />

### Creating Materials

First, let's upload textures. You can drag these texture files directly to the **Asset Management Panel** to upload them in bulk.

After uploading, you can see these files in the panel, which are roughness texture, normal texture, and base color texture.

<img src="https://gw.alipayobjects.com/zos/OasisHub/81ad7299-158b-4347-8e67-86b835980a04/image-20230921172453377.png" alt="image-20230921172453377" style="zoom:50%;" />

First, in the **Asset Management Panel**, select `Right-click` → `Create` → `Material` to let the editor create a default PBR material. Select this material, and the **[Inspector Panel](/en/docs/interface-inspector)** will display the configuration options for the current material. The default material is quite simple, so we can add some texture maps to this material, such as base texture, roughness texture, and normal map.


![image-20230921173056885](https://gw.alipayobjects.com/zos/OasisHub/65bf4b63-3f09-4ad6-abc9-a9d26e173783/image-20230921173056885.png)

Next, we will configure these textures to the corresponding properties of the material. After configuration, we select the entity node created in the previous step again, and modify the `Material` property of the `Mesh Renderer` component to the custom material we just created. A cube with a metallic texture is successfully created.

![Untitled](https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*ni3KQ7jGK-0AAAAAAAAAAAAADqiTAQ/original)

However, the cube looks a bit dark now, so we need to brighten the [lighting](https://galacean.antgroup.com/#/en/docs/latest/en/light) in the scene. We select the `DirectLight` node in the node tree, then increase the `Intensity` property in the inspector.

Now it looks more normal.
![Untitled](https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*n151R6vZ59oAAAAAAAAAAAAADqiTAQ/original)

### Create a Script

Next, we will bind a `Script` component to this node ([What is a Script component?](https://galacean.antgroup.com/#/en/docs/latest/en/script)).

1. We continue to add a `Script` component in the **[Inspector Panel](/en/docs/interface-inspector)** in the same way as above
2. Next, in the **[Assets Panel](/en/docs/assets-interface)**, `right-click` → `Create` → `Script` to create a `Script` asset
3. Finally, in the **[Inspector Panel](/en/docs/interface-inspector)**, bind the newly created script file to the script component

> ⚠️ Note that if you do not bind the script asset to the entity's script component, the script will not run

After creating the script, we can **double-click** it to jump to the code editor page.

![image-20230921180953712](https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*gmIjSbbNHZ0AAAAAAAAAAAAADhuCAQ/original)

Once in the code editor, we write a very simple rotation function:

```ts
// Script.ts
import { Script } from "@galacean/engine";

export default class extends Script {
  onUpdate(deltaTime: number) {
    this.entity.transform.rotate(1, 1, 1);
  }
}
```

After writing the code, save (`⌘+s`), and you can see the effect of the entire scene in the preview area on the right in real-time.

### Export the Project

Now that we have completed the basic development work in the editor, let's export this project to the local environment.

Click the **Download** button on the left toolbar, which will bring up the export interface. Here, change the project name to "box," then click the `Download` button, and the editor will package the project into a `box.zip` file for download.

![image-20230921162204014](https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*mmoIRqIt30oAAAAAAAAAAAAADhuCAQ/original)

After the project is packaged, open the box project in VsCode, run `npm install` & `npm run dev`, and you will see that the project is running correctly.

## Script Usage

<playground src="scene-basic.ts"></playground>

## Import Modules

We start writing engine code using [TypeScript](https://www.typescriptlang.org/). If you are not yet comfortable with TypeScript, you can still run using JavaScript and enjoy the benefits of engine API hints (by using IDEs like [VSCode](https://code.visualstudio.com/)).

Returning to our programming, to implement such a feature, we need to import the following Galacean engine classes into our project:

Let's start by getting to know these classes:

| Type           | Class Name                                                                               | Definition                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebGL Engine   | [WebGLEngine](${api}rhi-webgl/WebGLEngine)                                              | WebGL platform engine, supporting WebGL 1.0 and WebGL 2.0, it can control all behaviors of the canvas, including resource management, scene management, execution/pause/resume, vertical synchronization, etc. (See [Engine](/en/docs/core-engine) section for details.) |
| Component      | [Camera](/apis/core/#Camera)                                                             | Camera, an abstract concept of 3D projection in a graphics engine, similar to a camera or eye in the real world. Without a camera, the canvas will not render anything. (See [Camera](/en/docs/graphics-camera) section for details.)          |
|                | [DirectLight](/apis/core/#DirectLight)                                                   | Direct light, a type of lighting that adds depth to the scene. Using lighting can create a more realistic 3D scene. (See [Lighting](/en/docs/graphics-light) section for details.)                                             |
|                | [Script](/apis/core/#Script)                                                             | Script, a link between engine capabilities and game logic. It can be used to extend the engine's functionality, and game logic code can be written in the lifecycle hooks provided by script components. (See [Script](/en/docs/script) section for details.)   |
|                | [MeshRenderer](/apis/core/#MeshRenderer)                                                 | Mesh renderer, using a mesh object (in this example, a cube) as the data source for the geometric outline.                                                                                               |
| Geometry and Material Classes | [PrimitiveMesh](/apis/core/#PrimitiveMesh)                                               | Primitive mesh, providing convenient methods for creating mesh objects such as cubes, spheres, etc. (See [Built-in Geometry](/en/docs/graphics-model) section for details.)                                                             |
|                | [BlinnPhongMaterial](/apis/core/#BlinnPhongMaterial)                                     | Material defines how to render this cube, BlinnPhong material is one of the classic materials. (See [Material](/en/docs/graphics-material) section for details.)                                                         |
| Math Library Classes   | [Vector3](/apis/math/#Vector3), [Vector4](/apis/math/#Vector4), [Color](/apis/math/#Color) | These classes are basic units for mathematical calculations, used to calculate the position, color, etc., of the cube. (See [Math Library](/en/docs/core-math) section for details.)                                                              |


## Create Engine Instance

Create an engine instance, where the `canvas` parameter is the `id` of the _Canvas_ element. If the `id` is different, please replace it accordingly. As mentioned above, reset the canvas dimensions using the [resizeByClientSize](${api}rhi-webgl/WebCanvas#resizeByClientSize) method.

```typescript
const engine = await WebGLEngine.create({ canvas: "canvas" });
engine.canvas.resizeByClientSize();
```

## Create Root Node of the Scene

It is worth noting that an engine instance may contain multiple scene instances. To add a cube to the currently active scene, you need to obtain the currently active scene through the engine's scene manager `engine.sceneManager`.

Once you have the scene, create a **root entity** using the scene's `createRootEntity` method. The root entity in the scene is the root node of the scene tree.

```typescript
const scene = engine.sceneManager.activeScene;
const rootEntity = scene.createRootEntity("root");
```

## Create a Camera Entity

In Galacean Engine, functionalities are added to entities in the form of components. First, create an entity to add a camera component.

After creation, use the entity's built-in transform component `transform` to change the position and orientation of the camera. Then add a camera component `Camera` to this entity.

```typescript
let cameraEntity = rootEntity.createChild("camera_entity");

cameraEntity.transform.position = new Vector3(0, 5, 10);
cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

let camera = cameraEntity.addComponent(Camera);
```

## Create Lighting

Similarly, lighting is also attached to entities in the form of components. After creating the entity, add a directional light component `DirectLight`, set the color, intensity properties, and light angle of the directional light component to achieve the desired lighting effect.

```typescript
let lightEntity = rootEntity.createChild("light");

let directLight = lightEntity.addComponent(DirectLight);
directLight.color = new Color(1.0, 1.0, 1.0);
directLight.intensity = 0.5;

lightEntity.transform.rotation = new Vector3(45, 45, 45);
```

## Create a Cube

Create another entity to attach a cube mesh renderer component. `MeshRenderer` is the mesh renderer component, set the `.mesh` property to the cube data created by `PrimitiveMesh`, and set the cube's material to BlinnPhong using the `setMaterial` method.

```typescript
let cubeEntity = rootEntity.createChild("cube");
let cube = cubeEntity.addComponent(MeshRenderer);
cube.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
cube.setMaterial(new BlinnPhongMaterial(engine));
```

## Start the Engine

Everything is set up, let's start the engine with just one line of code!

```typescript
engine.run();
```
