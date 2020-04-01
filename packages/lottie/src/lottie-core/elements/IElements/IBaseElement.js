import Matrix from "../../3rd_party/transformation-matrix";
import getBlendMode from "../../utils/helpers/blendModes";
import CVMaskElement from "../canvasElements/CVMaskElement";
export function IBaseElement() {}

IBaseElement.prototype = {
  createElements: function() {},
  initRendererElement: function() {},
  createContainerElements: function() {},
  createContent: function() {},
  setBlendMode: function() {
    var globalData = this.globalData;
    if (globalData.blendMode !== this.data.bm) {
      globalData.blendMode = this.data.bm;
      var blendModeValue = getBlendMode(this.data.bm);
      // TODO blend
    }
  },
  createRenderableComponents: function() {
    this.maskManager = new CVMaskElement(this.data, this);
  },
  hideElement: function() {
    if (!this.hidden && (!this.isInRange || this.isTransparent)) {
      this.hidden = true;
    }
  },
  showElement: function() {
    if (this.isInRange && !this.isTransparent) {
      this.hidden = false;
      this._isFirstFrame = true;
      this.maskManager._isFirstFrame = true;
    }
  },
  setTransform: function(matrix) {},

  setOpacity: function(opacity) {},

  renderFrame: function() {
    if (this.hidden || this.data.hd) {
      return;
    }
    this.renderTransform();
    this.renderRenderable();
    this.setBlendMode();
    var forceRealStack = this.data.ty === 0;
    this.setTransform(this.finalTransform.mat.props);
    this.setOpacity(this.finalTransform.mProp.o.v);
    this.renderInnerContent();
  },
  destroy: function() {
    this.canvasContext = null;
    this.data = null;
    this.globalData = null;
    this.maskManager.destroy();
  },
  mHelper: new Matrix()
};
IBaseElement.prototype.hide = IBaseElement.prototype.hideElement;
IBaseElement.prototype.show = IBaseElement.prototype.showElement;
