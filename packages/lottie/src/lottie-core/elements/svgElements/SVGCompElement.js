import { extendPrototype } from "../../utils/functionExtensions";
import ICompElement from "../CompElement";
import SVGBaseElement from "./SVGBaseElement";
import { createSizedArray } from "../../utils/helpers/arrays";
import PropertyFactory from "../../utils/PropertyFactory";

function SVGCompElement(data, globalData, comp) {
  this.layers = data.layers;
  this.supports3d = true;
  this.completeLayers = false;
  this.pendingElements = [];
  this.elements = this.layers ? createSizedArray(this.layers.length) : [];
  //this.layerElement = createNS('g');
  this.initElement(data, globalData, comp);
  this.tm = data.tm ? PropertyFactory.getProp(this, data.tm, 0, globalData.frameRate, this) : { _placeholder: true };
}

extendPrototype([ICompElement, SVGBaseElement], SVGCompElement);
export default SVGCompElement;
