import { extendPrototype } from "../../utils/functionExtensions";
import BaseElement from "../BaseElement";
import TransformElement from "../helpers/TransformElement";
import { IBaseElement } from "./IBaseElement";
import HierarchyElement from "../helpers/HierarchyElement";
import FrameElement from "../helpers/FrameElement";
import RenderableElement from "../helpers/RenderableElement";
import SVGShapeElement from "../svgElements/SVGShapeElement";
import ImageElement from "../ImageElement";

export function IImageElement(data, globalData, comp) {}
extendPrototype(
  [BaseElement, TransformElement, IBaseElement, HierarchyElement, FrameElement, RenderableElement],
  IImageElement
);

IImageElement.prototype.initElement = SVGShapeElement.prototype.initElement;
IImageElement.prototype.prepareFrame = ImageElement.prototype.prepareFrame;

IImageElement.prototype.createContent = function() {};
IImageElement.prototype.setTransform = function(matrix) {};
IImageElement.prototype.setOpacity = function(opacity) {};
IImageElement.prototype.renderInnerContent = function(parentMatrix) {};

IImageElement.prototype.destroy = function() {
  this.img = null;
};
