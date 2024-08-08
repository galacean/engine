# Galacean Engine

<a href="https://www.npmjs.com/package/@galacean/engine"><img src="https://img.shields.io/npm/v/@galacean/engine"/></a>
![npm-size](https://img.shields.io/bundlephobia/minzip/@galacean/engine)
![npm-download](https://img.shields.io/npm/dm/@galacean/engine)
[![codecov](https://codecov.io/gh/galacean/engine/branch/main/graph/badge.svg?token=KR2UBKE3OX)](https://codecov.io/gh/galacean/engine)

[Galacean](https://galacean.antgroup.com/editor) is a **web-first** and **mobile-first** high-performance real-time interactive engine. Use **component system design** and pursue ease of use and light weight. Developers can independently use and write Typescript scripts to develop projects using pure code.

## Features

- 🖥 &nbsp;**Platform** - Support HTML5 and Alipay miniprogram
- 🔮 &nbsp;**Graphics** - Advanced 2D + 3D graphics engine
- 🏃 &nbsp;**Animation** - Powerful animation system
- 🧱 &nbsp;**Physics** - Powerful and easy-to-use physical features
- 👆 &nbsp;**Input** - Easy-to-use interactive capabilities
- 📑 &nbsp;**Scripts** - Use TypeScript to write logic efficiently

## npm

The engine is published on npm with full typing support. To install, use:

```sh
npm install @galacean/engine
```

This will allow you to import engine entirely using:

```javascript
import * as GALACEAN from "@galacean/engine";
```

or individual classes using:

```javascript
import { Engine, Scene, Entity } from "@galacean/engine";
```

## Usage

```typescript
// Create engine by passing in the HTMLCanvasElement id and adjust canvas size
const engine = await WebGLEngine.create({ canvas: "canvas-id" });
engine.canvas.resizeByClientSize();

// Get scene and create root entity
const scene = engine.sceneManager.activeScene;
const rootEntity = scene.createRootEntity("Root");

// Create light
const lightEntity = rootEntity.createChild("Light");
const directLight = lightEntity.addComponent(DirectLight);
lightEntity.transform.setRotation(-45, -45, 0);
directLight.intensity = 0.4;

// Create camera
const cameraEntity = rootEntity.createChild("Camera");
cameraEntity.addComponent(Camera);
cameraEntity.transform.setPosition(0, 0, 12);

// Create sphere
const meshEntity = rootEntity.createChild("Sphere");
const meshRenderer = meshEntity.addComponent(MeshRenderer);
const material = new BlinnPhongMaterial(engine);
meshRenderer.setMaterial(material);
meshRenderer.mesh = PrimitiveMesh.createSphere(engine, 1);

// Run engine
engine.run();
```

## Contributing

Everyone is welcome to join us! Whether you find a bug, have a great feature request or you fancy owning a task from the road map feel free to get in touch.

Make sure to read the [Contributing Guide](.github/HOW_TO_CONTRIBUTE.md) / [贡献指南](https://github.com/galacean/engine/wiki/%E5%A6%82%E4%BD%95%E4%B8%8E%E6%88%91%E4%BB%AC%E5%85%B1%E5%BB%BA-Oasis-%E5%BC%80%E6%BA%90%E4%BA%92%E5%8A%A8%E5%BC%95%E6%93%8E) before submitting changes.

## Clone
Prerequisites:
- [git-lfs](https://git-lfs.com/) (Install by official website)
  
Clone this repository:

```sh
git clone git@github.com:galacean/runtime.git
```

## Build

Prerequisites:

- [Node.js v15.0.0+](https://nodejs.org/en/) and NPM (Install by official website)
- [PNPM](https://pnpm.io/) (Install globally by `npm install -g pnpm`)

In the folder where you have cloned the repository, install the build dependencies using pnpm:

```sh
pnpm install
```

Then, to build the source, using npm:

```sh
npm run b:all
```

## Links

- [Official Site](https://galacean.antgroup.com/engine)
- [Editor](https://galacean.antgroup.com/editor)
- [Documentation](https://galacean.antgroup.com/engine/docs)

## License

The engine is released under the [MIT](https://opensource.org/licenses/MIT) license. See LICENSE file.
