import { createTypedArray } from "../helpers/arrays";
import pool_factory from "./pool_factory";
import { defaultCurveSegments } from "../common";

var bezier_length_pool = (function() {
  function create() {
    return {
      addedLength: 0,
      percents: createTypedArray("float32", defaultCurveSegments),
      lengths: createTypedArray("float32", defaultCurveSegments)
    };
  }
  return pool_factory(8, create);
})();

export default bezier_length_pool;
