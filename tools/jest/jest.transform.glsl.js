// custom-transformer.js
"use strict";

module.exports = {
  process(src, filename) {
    const source = `module.exports = \`${src}\`;`;
    return source;
  }
};
