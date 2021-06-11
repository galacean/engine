# Oasis Engine (Ant Graphics Engine)

<p align="center"><a href="https://oasis-engine.github.io" target="_blank" rel="noopener noreferrer"><img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*f1pVTpPvzA8AAAAAAAAAAAAAARQnAQ" alt="Oasis logo"></a></p>

<a href="https://www.npmjs.com/package/oasis-engine"><img src="https://img.shields.io/npm/v/oasis-engine"/></a>
![npm-size](https://img.shields.io/bundlephobia/minzip/oasis-engine)
![npm-download](https://img.shields.io/npm/dm/oasis-engine)

Oasis is a **web-first** and **mobile-first** high-performance real-time development platform. Use **component system design** and pursue ease of use and light weight. This repository is the core engine of Oasis. Developers can independently use and write Typescript scripts to develop projects using pure code.

## Features

- 🖥  &nbsp;**Platform** - Suppport HTML5 and Alipay miniprogram
- 🔮  &nbsp;**Graphics** - Advanced 2D + 3D graphics engine
- 🏃  &nbsp;**Animation** - Powerful animation system
- 📑  &nbsp;**Scripts** - Use TypeScript to write logic efficiently

## Usage

```typescript
// Create engine by passing in the HTMLCanvasElement id and adjust canvas size.
const engine = new WebGLEngine("canvas-id");
engine.canvas.resizeByClientSize();

// Create root entity.
const rootEntity = engine.sceneManager.activeScene.createRootEntity("Root");

// Create light.
const lightEntity = rootEntity.createChild("Light");
const directLight = lightEntity.addComponent(DirectLight);
lightEntity.transform.setRotation(-45, -45, 0);
directLight.intensity = 0.4;

// Create camera.
const cameraEntity = rootEntity.createChild("Camera");
cameraEntity.addComponent(Camera);
cameraEntity.transform.setPosition(0, 0, 12);

// Create sphere.
const meshEntity = rootEntity.createChild("Sphere");
const meshRenderer = meshEntity.addComponent(MeshRenderer);
const material = new BlinnPhongMaterial(engine);
meshRenderer.setMaterial(material);
meshRenderer.mesh = PrimitiveMesh.createSphere(engine, 1);

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

Make sure to read the [Contributing Guide](.github/HOW_TO_CONTRIBUTE.md) before submitting changes.

## Build

If you don't already have Node.js and NPM, go install them. Then, in the folder where you have cloned the repository, install the build dependencies using npm:

```sh
npm run bootstrap
```

Then, to build the source, using npm:

```sh
npm run build
```

## Links

- [Official Site](https://oasisengine.cn)
- [Examples](https://oasisengine.cn/0.3/examples)
- [Documentation](https://oasisengine.cn/0.3/docs/install-cn)
- [API References](https://oasisengine.cn/0.3/api/core/index)


## License 
The Oasis Engine is released under the [MIT](https://opensource.org/licenses/MIT) license. See LICENSE file.
