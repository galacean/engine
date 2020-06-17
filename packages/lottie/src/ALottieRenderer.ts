import { RenderableComponent } from "@alipay/o3-core";
import { lottie } from "./oasis-lottie";
export class ALottieRenderer extends RenderableComponent {
  public loop: boolean;
  public autoplay: boolean;
  public animationData: any;
  private animationItem: any;
  private _lottieData: any;
  constructor(node, props) {
    super(node, props);
    const { animationData, loop, autoplay } = props;
    this.loop = loop;
    this.autoplay = autoplay;
    this.animationData = animationData;
    this.lottieData = {
      animationData,
      loop,
      autoplay
    };
  }
  get lottieData() {
    return this._lottieData;
  }

  set lottieData(lottieData) {
    if (!lottieData) return;
    this._lottieData = lottieData;
    this.init();
  }

  private init() {
    const { animationData, loop, autoplay } = this.lottieData;
    this.animationItem = lottie.loadAnimation(this.engine, {
      animationData,
      loop,
      autoplay
    });
    this.node.addChild(this.animationItem.node);
  }

  public render() {
    lottie.update(this.engine.time.deltaTime);
  }

  public play() {
    this.animationItem.play();
  }

  public stop() {
    this.animationItem.stop();
  }

  public pause() {
    this.animationItem.pause();
  }

  public goToAndStop(value: number, isFrame: boolean) {
    this.animationItem.goToAndStop(value, isFrame);
  }

  public goToAndPlay(value: number, isFrame: boolean) {
    this.animationItem.goToAndPlay(value, isFrame);
  }

  public playSegments(segments: number[], forceFlag: boolean) {
    this.animationItem.playSegments(segments, forceFlag);
  }
}
