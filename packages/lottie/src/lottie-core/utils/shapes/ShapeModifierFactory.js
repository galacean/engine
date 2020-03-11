import MouseModifier from "./MouseModifier";
import RepeaterModifier from "./RoundCornersModifier";
import RoundCornersModifier from "./RepeaterModifier";
import TrimModifier from "./TrimModifier";

var ShapeModifierFactory = (function() {
  var ob = {};
  var modifiers = {};
  ob.registerModifier = registerModifier;
  ob.getModifier = getModifier;

  function registerModifier(nm, factory) {
    if (!modifiers[nm]) {
      modifiers[nm] = factory;
    }
  }

  function getModifier(nm, elem, data) {
    return new modifiers[nm](elem, data);
  }

  return ob;
})();

ShapeModifierFactory.registerModifier("ms", MouseModifier);
ShapeModifierFactory.registerModifier("rp", RepeaterModifier);
ShapeModifierFactory.registerModifier("rd", RoundCornersModifier);
ShapeModifierFactory.registerModifier("tm", TrimModifier);

export default ShapeModifierFactory;
