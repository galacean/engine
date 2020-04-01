import { createSizedArray } from "../helpers/arrays";

var pooling = (function() {
  function double(arr) {
    return arr.concat(createSizedArray(arr.length));
  }

  return {
    double: double
  };
})();

export default pooling;
