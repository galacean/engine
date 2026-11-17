import {
  AssetType,
  Camera,
  DirectLight,
  MeshRenderer,
  Vector3,
  WebGLEngine,
  type GLTFResource
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";

interface AssetReview {
  width: number;
  height: number;
  center: [number, number, number];
  size: number;
  levels: string[];
}

const canvas = document.querySelector<HTMLCanvasElement>("#asset")!;
const review = {
  async load(input: AssetReview) {
    canvas.width = input.width;
    canvas.height = input.height;
    canvas.style.width = `${input.width}px`;
    canvas.style.height = `${input.height}px`;
    const engine = await WebGLEngine.create({
      canvas,
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: { preserveDrawingBuffer: true }
    });
    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor.set(0.38, 0.57, 0.64, 1);
    scene.ambientLight.diffuseSolidColor.set(0.75, 0.79, 0.84, 1);
    scene.ambientLight.diffuseIntensity = 0.8;
    const sun = scene.createRootEntity("Sun");
    sun.transform.setRotation(-42, -28, 0);
    sun.addComponent(DirectLight).intensity = 1.75;
    const eye = scene.createRootEntity("Camera");
    const camera = eye.addComponent(Camera);
    const center = new Vector3(...input.center);
    camera.fieldOfView = 50;
    camera.nearClipPlane = input.size * 0.001;
    const nodes = [];
    const counts = [];
    let base: MeshRenderer | undefined;
    for (const url of input.levels) {
      const gltf = await engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url });
      const node = gltf.instantiateSceneRoot();
      scene.addRootEntity(node);
      const renderers = node.getComponentsIncludeChildren(MeshRenderer, []);
      if (renderers.length !== 1) throw new Error(`Expected one mesh renderer in ${url}`);
      const renderer = renderers[0];
      if (base) renderer.setMaterials(base.getMaterials());
      else base = renderer;
      nodes.push(node);
      counts.push(renderer.mesh.subMeshes.reduce((total, mesh) => total + mesh.count / 3, 0));
      node.isActive = false;
    }
    engine.run();
    return {
      counts,
      shot: async (level: number, share: number, yawDegrees: number) => {
        nodes.forEach((node, index) => (node.isActive = index === level));
        const distance = input.size / (2 * share * Math.tan((camera.fieldOfView * Math.PI) / 360));
        const yaw = (yawDegrees * Math.PI) / 180;
        const pitch = Math.PI / 15;
        camera.farClipPlane = distance + input.size * 3;
        eye.transform.setPosition(
          center.x + distance * Math.sin(yaw) * Math.cos(pitch),
          center.y + distance * Math.sin(pitch),
          center.z + distance * Math.cos(yaw) * Math.cos(pitch)
        );
        eye.transform.lookAt(center);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return canvas.toDataURL("image/png").split(",")[1];
      }
    };
  }
};

Object.assign(window, { lodAssetReview: review });
