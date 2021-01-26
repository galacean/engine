// custom-transformer.js
"use strict";

const babel = require("@babel/core");

module.exports = {
  process(code, filename) {
    const res = babel.transformSync(code, {
      filename: filename,
      presets: [
        [
          "@babel/preset-env",
          {
            targets: {
              node: "current"
            }
          }
        ],
        "@babel/preset-typescript"
      ],
      plugins: [
        ["@babel/plugin-proposal-decorators", { legacy: true }],
        ["@babel/plugin-proposal-class-properties", { loose: true }],
        "@babel/plugin-proposal-object-rest-spread",
        "@babel/plugin-proposal-optional-chaining",
        "@babel/plugin-transform-object-assign"
      ]
    });
    return res.code;
  }
};
