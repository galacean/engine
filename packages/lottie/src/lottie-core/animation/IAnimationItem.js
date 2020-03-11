import AnimationItem from "./AnimationItem";
import dataManager from "../utils/DataManager";
import expressionsPlugin from "../utils/expressions/Expressions";

export class IAnimationItem extends AnimationItem {
  setParams(params) {
    if (params.context) {
      this.context = params.context;
    }
    if (params.wrapper || params.container) {
      this.wrapper = params.wrapper || params.container;
    }
    var animType = params.animType ? params.animType : params.renderer ? params.renderer : "svg";
    this.setRenderer(this, params.rendererSettings);
    this.renderer.setProjectInterface(this.projectInterface);
    this.animType = animType;

    if (params.loop === "" || params.loop === null) {
    } else if (params.loop === false) {
      this.loop = false;
    } else if (params.loop === true) {
      this.loop = true;
    } else {
      this.loop = parseInt(params.loop);
    }
    this.autoplay = "autoplay" in params ? params.autoplay : true;
    this.name = params.name ? params.name : "";
    this.autoloadSegments = params.hasOwnProperty("autoloadSegments") ? params.autoloadSegments : true;
    this.assetsPath = params.assetsPath;
    if (params.animationData) {
      this.configAnimation(params.animationData);
    } else if (params.path) {
      if (params.path.lastIndexOf("\\") !== -1) {
        this.path = params.path.substr(0, params.path.lastIndexOf("\\") + 1);
      } else {
        this.path = params.path.substr(0, params.path.lastIndexOf("/") + 1);
      }
      this.fileName = params.path.substr(params.path.lastIndexOf("/") + 1);
      this.fileName = this.fileName.substr(0, this.fileName.lastIndexOf(".json"));

      assetLoader.load(
        params.path,
        this.configAnimation.bind(this),
        function() {
          this.trigger("data_failed");
        }.bind(this)
      );
    }
  }

  setRenderer() {}

  checkLoaded = function() {
    if (
      !this.isLoaded &&
      this.renderer.globalData.fontManager.loaded() &&
      (this.assetsLoaded || this.renderer.rendererType !== "canvas")
    ) {
      this.isLoaded = true;
      dataManager.completeData(this.animationData, this.renderer.globalData.fontManager);
      if (expressionsPlugin) {
        expressionsPlugin.initExpressions(this);
      }
      this.renderer.initItems();
      setTimeout(
        function() {
          this.trigger("DOMLoaded");
        }.bind(this),
        0
      );
      this.gotoFrame();
      if (this.autoplay) {
        this.play();
      }
    }
  };
}
