// babel.config.js
module.exports = {
  presets: [["@babel/preset-env"], "@babel/preset-typescript"],
  plugins: [
    ["@babel/plugin-proposal-decorators", { legacy: true }],
    ["@babel/plugin-proposal-class-properties", { loose: true }],
    "@babel/proposal-object-rest-spread",
    "@babel/plugin-proposal-optional-chaining",
    "@babel/plugin-transform-object-assign"
  ]
};
