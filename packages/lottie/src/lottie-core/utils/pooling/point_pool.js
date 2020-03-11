import { createTypedArray } from "../helpers/arrays";
import pool_factory from "./pool_factory";

var point_pool = (function() {
  function create() {
    return createTypedArray("float32", 2);
  }
  return pool_factory(8, create);
})();

export default point_pool;
