const path = require('path');
const fs = require("fs");
const HtmlWebpackPlugin = require('html-webpack-plugin');

const srcPath = '../src';
const pages =
  fs.readdirSync(path.resolve(__dirname, srcPath))
    .filter((filename) => {
      // if (!/^\d/.test(filename))
      //   return false;
      let stats = fs.statSync(path.resolve(__dirname, srcPath, filename));
      return stats.isDirectory();
    });

let entry = {};
pages.forEach((pageName) => {
  entry[pageName] = [`./${pageName}/index.js`];
})
module.exports = {
  mode: 'development',
  context: path.resolve(__dirname, srcPath),
  entry,
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, '../dist')
  },
  module: {
    rules: [
      // {
      //   test: /\.js/,
      //   exclude: /node_modules/,
      //   loader: "babel-loader",
      //   options: {
      //     presets: ['@babel/preset-env'],
      //     plugins: ['@babel/plugin-proposal-class-properties'],
      //   },
      // },
      {test: /\.glsl/, loader: "raw-loader"},
      {
        test: /\.(png|jpe?g|gif|svg)(\?.*)?$/, use: [
          {
            loader: 'url-loader',
            options: {
              name: 'img/[name].[hash:7].[ext]'
            }
          }
        ]
      },
      {
        test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
        loader: 'url-loader',
        options: {
          name: 'media/[name].[hash:7].[ext]'
        }
      },
    ]
  },
  devServer: {
    contentBase: path.resolve(__dirname, '..'),
    open: true,
    openPage: 'webpack-dev-server',
    clientLogLevel: 'none'
  },
  plugins: pages.map((pageName) => {
    return new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "template.html"),
      filename: pageName + ".html",
      chunks: [pageName],
      title: pageName
    })
  })
};