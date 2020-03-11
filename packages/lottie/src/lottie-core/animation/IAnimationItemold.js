// import AnimationItem from "./AnimationItem";
// import { ResourceLoader, Resource } from "@alipay/o3-loader";
// import expressionsPlugin from "../utils/expressions/Expressions";
// import dataManager from "../utils/DataManager";
// import assetLoader from "../utils/asset_loader";
// import WebglRenderer from "../renderers/WebglRenderer";

// declare global {
//   interface Window {
//     engine;
//   }
// }

// class OasisAnimationItem extends AnimationItem {
//   imagePreloader: ResourceLoader;
//   animationData: any;
//   resouce: any;
//   renderer: any;
//   assetsLoaded: boolean;
//   constructor() {
//     super();
//     this.imagePreloader = new ResourceLoader(window.engine, null);
//   }

//   setParams = function(params) {
//     if (params.context) {
//       this.context = params.context;
//     }
//     if (params.wrapper || params.container) {
//       this.wrapper = params.wrapper || params.container;
//     }
//     var animType = params.animType ? params.animType : params.renderer ? params.renderer : "svg";
//     this.renderer = new WebglRenderer(this, params.rendererSettings);
//     this.renderer.setProjectInterface(this.projectInterface);
//     this.animType = animType;

//     if (params.loop === "" || params.loop === null) {
//     } else if (params.loop === false) {
//       this.loop = false;
//     } else if (params.loop === true) {
//       this.loop = true;
//     } else {
//       this.loop = parseInt(params.loop);
//     }
//     this.autoplay = "autoplay" in params ? params.autoplay : true;
//     this.name = params.name ? params.name : "";
//     this.autoloadSegments = params.hasOwnProperty("autoloadSegments") ? params.autoloadSegments : true;
//     this.assetsPath = params.assetsPath;
//     if (params.animationData) {
//       this.configAnimation(params.animationData);
//     } else if (params.path) {
//       if (params.path.lastIndexOf("\\") !== -1) {
//         this.path = params.path.substr(0, params.path.lastIndexOf("\\") + 1);
//       } else {
//         this.path = params.path.substr(0, params.path.lastIndexOf("/") + 1);
//       }
//       this.fileName = params.path.substr(params.path.lastIndexOf("/") + 1);
//       this.fileName = this.fileName.substr(0, this.fileName.lastIndexOf(".json"));

//       assetLoader.load(
//         params.path,
//         this.configAnimation.bind(this),
//         function() {
//           this.trigger("data_failed");
//         }.bind(this)
//       );
//     }
//   };

//   imagesLoaded(err, resources) {
//     resources.forEach(resouce => {
//       const { name } = resouce;
//       this.renderer.globalData.resources[name] = resouce;
//     });
//     this.assetsLoaded = true;
//     super.imagesLoaded();
//   }

//   checkLoaded = function() {
//     if (
//       !this.isLoaded &&
//       this.renderer.globalData.fontManager.loaded() &&
//       (this.assetsLoaded || this.renderer.rendererType !== "canvas")
//     ) {
//       this.isLoaded = true;
//       dataManager.completeData(this.animationData, this.renderer.globalData.fontManager);
//       if (expressionsPlugin) {
//         expressionsPlugin.initExpressions(this);
//       }
//       this.renderer.initItems();
//       setTimeout(
//         function() {
//           this.trigger("DOMLoaded");
//         }.bind(this),
//         0
//       );
//       this.gotoFrame();
//       if (this.autoplay) {
//         this.play();
//       }
//     }
//   };

//   preloadImages() {
//     const TextureResources = this.animationData.assets.map(item => {
//       return new Resource(item.id, {
//         type: "texture",
//         url: item.p,
//         config: {
//           reSample: false
//         }
//       });
//     });
//     // this.imagePreloader.setAssetsPath(this.assetsPath);
//     // this.imagePreloader.setPath(this.path);
//     this.imagePreloader.batchLoad(TextureResources, this.imagesLoaded.bind(this));
//   }
// }

// export default OasisAnimationItem;
