/**
 * @title OBJ Loader Use Model Mesh
 * @category Mesh
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*ZnBlT4UNh0IAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  AssetPromise,
  BlinnPhongMaterial,
  Camera,
  Color,
  DirectLight,
  Entity,
  Loader,
  LoadItem,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  resourceLoader,
  ResourceManager,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

@resourceLoader("OBJ", ["obj"])
class OBJLoader extends Loader<ModelMesh> {
  load(
    item: LoadItem,
    resourceManager: ResourceManager
  ): AssetPromise<ModelMesh> {
    return this.request<string>(item.url!, { ...item, type: "text" }).then(
      (text: string) => {
        const lines = text.split(/\n/);
        const positions: Vector3[] = [];
        const indices: number[] = [];
        lines
          .map((lineText) => lineText.split(" "))
          .forEach((parseTexts) => {
            if (parseTexts[0] === "v") {
              positions.push(
                new Vector3(
                  parseFloat(parseTexts[1]),
                  parseFloat(parseTexts[2]),
                  parseFloat(parseTexts[3])
                )
              );
            } else if (parseTexts[0] === "f") {
              indices.push(
                parseInt(parseTexts[1]) - 1,
                parseInt(parseTexts[2]) - 1,
                parseInt(parseTexts[3]) - 1
              );
            }
          });
        const mesh = new ModelMesh(resourceManager.engine);
        mesh.setPositions(positions);
        mesh.setIndices(Uint16Array.from(indices));
        mesh.addSubMesh(0, indices.length, MeshTopology.Triangles);
        mesh.uploadData(false);
        return mesh;
      }
    );
  }
}

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // init camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);
  cameraEntity.transform.setPosition(0.5, 0.5, 0.5);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

  // init light
  rootEntity.addComponent(DirectLight);

  engine.resourceManager
    .load<ModelMesh>(
      "https://gw.alipayobjects.com/os/bmw-prod/b885a803-5315-44f0-af54-6787ec47ed1b.obj"
    )
    .then((mesh) => {
      renderer.mesh = mesh;
    });
  // init cube
  const cubeEntity = rootEntity.createChild("cube");
  const renderer = cubeEntity.addComponent(MeshRenderer);
  const material = new BlinnPhongMaterial(engine);
  material.baseColor = new Color(1, 0.25, 0.25, 1);
  renderer.setMaterial(material);
  engine.run();
});
