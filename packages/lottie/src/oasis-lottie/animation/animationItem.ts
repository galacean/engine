import { Node } from "@alipay/o3-core";
import { IAnimationItem } from "../../lottie-core/animation/IAnimationItem";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { Renderer } from "../renderers/renderer";
let lottieAnimationItem = 0;
declare global {
  interface Window {
    engine;
  }
}

export class AnimationItem extends IAnimationItem {
  [x: string]: any;
  imagePreloader: ResourceLoader;
  animationData: any;
  resouce: any;
  renderer: any;
  assetsLoaded: boolean;
  node: Node;
  constructor(engine) {
    super();
    this.imagePreloader = new ResourceLoader(engine, null);
    this.node = new Node(`LOTTIE_ROOT_NODE_${lottieAnimationItem++}`);
  }

  setRenderer(animationItem, rendererSettings) {
    this.renderer = new Renderer(animationItem, rendererSettings);
  }

  imagesLoaded(err, resources) {
    resources.forEach((resouce) => {
      const { name } = resouce;
      this.renderer.globalData.resources[name] = resouce;
    });
    this.assetsLoaded = true;
    super.imagesLoaded();
  }

  preloadImages() {
    const TextureResources = this.animationData.assets.map((item) => {
      return new Resource(item.id, {
        type: "texture",
        url: item.p,
        config: {
          reSample: false
        }
      });
    });
    this.imagePreloader.batchLoad(TextureResources, this.imagesLoaded.bind(this));
  }
}
