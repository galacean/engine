import { extendPrototype } from "../functionExtensions";
import { initialDefaultFrame } from "../../main";
import DynamicPropertyContainer from "../helpers/dynamicProperties";
import shapeCollection_pool from "../pooling/shapeCollection_pool";

function ShapeModifier() {}
ShapeModifier.prototype.initModifierProperties = function() {};
ShapeModifier.prototype.addShapeToModifier = function() {};
ShapeModifier.prototype.addShape = function(data) {
  if (!this.closed) {
    // Adding shape to dynamic properties. It covers the case where a shape has no effects applied, to reset it's _mdf state on every tick.
    data.sh.container.addDynamicProperty(data.sh);
    var shapeData = { shape: data.sh, data: data, localShapeCollection: shapeCollection_pool.newShapeCollection() };
    this.shapes.push(shapeData);
    this.addShapeToModifier(shapeData);
    if (this._isAnimated) {
      data.setAsAnimated();
    }
  }
};
ShapeModifier.prototype.init = function(elem, data) {
  this.shapes = [];
  this.elem = elem;
  this.initDynamicPropertyContainer(elem);
  this.initModifierProperties(elem, data);
  this.frameId = initialDefaultFrame;
  this.closed = false;
  this.k = false;
  if (this.dynamicProperties.length) {
    this.k = true;
  } else {
    this.getValue(true);
  }
};
ShapeModifier.prototype.processKeys = function() {
  if (this.elem.globalData.frameId === this.frameId) {
    return;
  }
  this.frameId = this.elem.globalData.frameId;
  this.iterateDynamicProperties();
};

extendPrototype([DynamicPropertyContainer], ShapeModifier);

// WARN: 与源代码不同 解决循环引用问题
// extendPrototype([ShapeModifier], MouseModifier);
// extendPrototype([ShapeModifier], RepeaterModifier);
// extendPrototype([ShapeModifier], RoundCornersModifier);
// extendPrototype([ShapeModifier], TrimModifier);

// var ShapeModifiers = (function() {
//   var ob = {};
//   var modifiers = {};
//   ob.registerModifier = registerModifier;
//   ob.getModifier = getModifier;

//   function registerModifier(nm, factory) {
//     console.log(222, factory);
//     if (!modifiers[nm]) {
//       modifiers[nm] = factory;
//     }
//   }

//   function getModifier(nm, elem, data) {
//     console.log(333, modifiers);
//     return new modifiers[nm](elem, data);
//   }

//   return ob;
// })();

// ShapeModifiers.registerModifier("ms", MouseModifier);
// ShapeModifiers.registerModifier("rp", RepeaterModifier);
// ShapeModifiers.registerModifier("rd", RoundCornersModifier);
// ShapeModifiers.registerModifier("tm", TrimModifier);

export default ShapeModifier;
