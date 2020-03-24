// babel.config.js
module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        // modules: 'auto',
        modules: false,
        targets: {
          // @see https://juejin.im/entry/5a099de0f265da4321538c72
          browsers: ["Android >= 4.0", "ios >= 8"]
        }
      }
    ],
    "@babel/preset-typescript"
  ],
  plugins: [
    ["@babel/plugin-proposal-decorators", { legacy: true }],
    ["@babel/plugin-proposal-class-properties", { loose: true }],
    "@babel/proposal-object-rest-spread",
    "@babel/plugin-proposal-optional-chaining"
  ]
};
