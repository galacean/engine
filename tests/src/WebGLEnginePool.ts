import { WebGLEngine } from "@galacean/engine-rhi-webgl";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

export const defaultEngine = WebGLEngine.create({ canvas: canvasDOM });
