import { Vector2, Vector3, Vector4 } from "@alipay/o3-math";
import { GodraysCombinePassNode } from "./nodes/GodraysCombinePassNode";
import { GodraysPassNode } from "./nodes/GodraysPassNode";
import { GodraysStartPassNode } from "./nodes/GodraysStartPassNode";
import { PostEffectNode } from "./PostEffectNode";

/**
 * Godrays 后处理效果
 * @private
 */
export class GodraysEffect extends PostEffectNode {
  constructor(manager, props) {
    super("Godrays", null, null, null);

    const rtPool = manager.renderTargets;
    this.sunWorldPosition = new Vector3(1.0, 1.0, 1.0);
    this.sunScreen = new Vector3();
    this.manager = manager;
    const filterLen = 1.0;
    const TAPS_PER_PASS = 6.0;
    let pass = 1.0;
    let stepLen = filterLen * Math.pow(TAPS_PER_PASS, -pass);

    let godraysRTA = {};
    let godraysRTB = {};
    let godraysCombine = {};
    if (props && props.rtSize) {
      const rtColor = new Vector4(0.0, 0.0, 0.0, 1.0);

      godraysRTA = rtPool.require("scene_godraysRTA", {
        width: props.rtSize,
        height: props.rtSize,
        clearColor: rtColor
      });

      godraysRTB = rtPool.require("scene_godraysRTB", {
        width: props.rtSize,
        height: props.rtSize,
        clearColor: rtColor
      });

      godraysCombine = rtPool.require("scene_godraysCombine", {
        width: props.rtSize,
        height: props.rtSize,
        clearColor: rtColor
      });
    } else {
      const rtSize = 1024;
      godraysRTA = rtPool.require("scene_" + rtSize);
      godraysRTB = rtPool.require("scene_" + rtSize);
      godraysCombine = rtPool.require("scene_" + rtSize);
    }

    // 第一步：提取深度纹理，初始化阴影效果
    const godraysPassA = new GodraysStartPassNode("GodraysA", godraysRTA, this);
    this._godraysPassA = godraysPassA;
    godraysPassA.fStepSize = stepLen;

    // 第二步：迭代阴影效果
    pass = 2.0;
    stepLen = filterLen * Math.pow(TAPS_PER_PASS, -pass);

    const godraysPassB = new GodraysPassNode("GodraysB", godraysRTB, godraysPassA);
    this._godraysPassB = godraysPassB;
    godraysPassB.fStepSize = stepLen;

    pass = 3.0;
    stepLen = filterLen * Math.pow(TAPS_PER_PASS, -pass);
    const godraysRTC = godraysRTA;
    const godraysPassC = new GodraysPassNode("GodraysC", godraysRTC, godraysPassB);
    this._godraysPassC = godraysPassC;
    godraysPassC.fStepSize = stepLen;

    // 第三步：将原始图像与处理后的体积光进行叠加
    const godraysCombinePass = new GodraysCombinePassNode(
      "GodraysCombine",
      godraysCombine,
      this,
      godraysRTC.getColorTexture()
    );
    this._godraysCombinePass = godraysCombinePass;
  }

  /**
   * 场景深度 贴图
   */
  get depthTexture() {
    return this._godraysPassA.depthTexture;
  }

  set depthTexture(value) {
    if (this._godraysPassA) this._godraysPassA.depthTexture = value;
  }

  /**
   * 太阳空间坐标
   */
  get sunScreen() {
    return this._godraysPassA.sunScreen;
  }

  set sunScreen(sunWorldPosition) {
    this.sunWorldPosition = sunWorldPosition;
  }

  draw(feature, camera) {
    const canvas = camera.engine.renderhardware.gl.canvas;
    camera.worldToViewportPoint(this.sunWorldPosition, this.sunScreen);
    const sunScreen = camera.viewportToScreenPoint(this.sunScreen, this.sunScreen);
    sunScreen.x = sunScreen.x / canvas.clientWidth;
    sunScreen.y = 1.0 - sunScreen.y / canvas.clientHeight;

    if (this._godraysPassA) this._godraysPassA.sunScreen = new Vector2(sunScreen.x, sunScreen.y);
    if (this._godraysPassB) this._godraysPassB.sunScreen = new Vector2(sunScreen.x, sunScreen.y);
    if (this._godraysPassC) this._godraysPassC.sunScreen = new Vector2(sunScreen.x, sunScreen.y);
    if (this._godraysCombinePass) this._godraysCombinePass.sunScreen = new Vector2(sunScreen.x, sunScreen.y);

    return super.draw(feature, camera);
  }

  /**
   * 体积光光强
   */
  get godRayIntensity() {
    return this._godraysCombinePass.godRayIntensity;
  }

  set godRayIntensity(value) {
    if (this._godraysCombinePass) this._godraysCombinePass.godRayIntensity = value;
  }

  /**
   * 体积光范围
   */
  get godRayLong() {
    return this._godraysCombinePass.godRayLong;
  }

  set godRayLong(value) {
    if (this._godraysCombinePass) this._godraysCombinePass.godRayLong = value;
  }

  /**
   * 体积光颜色
   */
  get color() {
    return this._godraysCombinePass.color;
  }

  set color(value) {
    if (this._godraysCombinePass) this._godraysCombinePass.color = value;
  }
}
