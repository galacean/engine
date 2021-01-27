# Oasis

Oasis is a web-first and mobile-first high-performance real-time development platform. Using component system design, pursuit of ease of use and lightweight. This repository is the engine library of Oasis and is called Ant graphics engine. Developers can independently use and write Typescript scripts to develop projects using pure code.

##Features

- **Platform** - Suppport HTML5 and Alipay miniprogram
- **Graphics** - Advanced 2D + 3D graphics engine
- **Animation** - Powerful animation system
- **Scripts** - Use TypeScript to write efficient scripting system

## Usage

```typescript
// Create engine by passing in the HTMLCanvasElement name and get root entity.
const engine = new WebGLEngine("canvas");
const canvas = engine.canvas;
const rootEntity = engine.sceneManager.activeScene.createRootEntity("Root");
canvas.width = window.innerWidth * SystemInfo.devicePixelRatio;
canvas.height = window.innerHeight * SystemInfo.devicePixelRatio;

// Create light.
const lightEntity = rootEntity.createChild("Light");
const ambient = lightEntity.addComponent(AmbientLight);
const directLight = lightEntity.addComponent(DirectLight);
ambient.color = new Color(0.5, 0.5, 0.5);
directLight.color = new Color(0.3, 0.4, 0.4);

// Create camera.
const cameraEntity = rootEntity.createChild("Camera");
cameraEntity.transform.setPosition(0, 6, 10);
cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
cameraEntity.addComponent(Camera);

// Create cube.
const cubeEntity = rootEntity.createChild("Cube");
const cubeRenderer = cubeEntity.addComponent(GeometryRenderer);
const material = new BlinnPhongMaterial(engine);
cubeEntity.transform.rotate(0, 60, 0);
material.ambientColor = new Color(0.6, 0.6, 0.6, 1);
cubeRenderer.geometry = new CuboidGeometry(engine, 1, 1, 1);
cubeRenderer.material = material;

// Run engine.
engine.run();
```

## npm

Oasis Engine are published on npm with full typing support. To install, use:

```sh
npm install oasis-engine
```

This will allow you to import Oasis Engine entirely using:

```javascript
import * as OASIS from "oasis-engine";
```

or individual classes using:

```javascript
import { Engine, Scene, Entity } from "oasis-engine";
```

## Contributing

Everyone is welcome to join us! Whether you find a bug, have a great feature request or you fancy owning a task from the road map feel free to get in touch.

Make sure to read the [Contributing Guide](.github/CONTRIBUTING.md) before submitting changes.

## Build

If you don't already have Node.js and NPM, go install them. Then, in the folder where you have cloned the repository, install the build dependencies using npm:

```sh
npm run bootstrap
```

Then, to build the source, using npm:

```sh
npm run build
```

The docs can be generated using npm:

```sh
npm run doc
```

##Links

- [Official site](oasis-engine.github.io)
- [Playground](https://oasis-engine.github.io/0.1/playground)
- [Manual](https://oasis-engine.github.io/#/0.1/manual/zh-cn/README)
- [API References](https://oasis-engine.github.io/0.1/api/globals.html)

##License 
The Oasis Engine is released under the [MIT](https://opensource.org/licenses/MIT) license. See LICENSE file.
