import pool_factory from "./pool_factory";
import bezier_length_pool from "./bezier_length_pool";

var segments_length_pool = (function() {
  function create() {
    return {
      lengths: [],
      totalLength: 0
    };
  }

  function release(element) {
    var i,
      len = element.lengths.length;
    for (i = 0; i < len; i += 1) {
      bezier_length_pool.release(element.lengths[i]);
    }
    element.lengths.length = 0;
  }

  return pool_factory(8, create, release);
})();

export default segments_length_pool;
