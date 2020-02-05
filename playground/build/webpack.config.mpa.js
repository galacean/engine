const path = require('path');
const fs = require("fs-extra");
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const portfinder = require('portfinder');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const FriendlyErrorsPlugin = require('friendly-errors-webpack-plugin');
const isDev = process.env.NODE_ENV === 'development';

const srcPath = '../src';
const pages =
  fs.readdirSync(path.resolve(__dirname, srcPath))
    .filter((pageName) => {
      let pagePath = path.resolve(__dirname, srcPath, pageName);
      let stats = fs.statSync(pagePath);
      if (stats.isDirectory()) {
        let files = fs.readdirSync(pagePath);
        return files.some(fileName => fileName === 'index.js');
      }
    });

let entry = {};
pages.forEach((pageName) => {
  entry[pageName] = [`./${pageName}/index.js`];
})
let itemList =
  pages.filter(pageName => pageName !== 'index').sort().map(pageName => {
    let pagePath = path.resolve(__dirname, srcPath, pageName);
    let files = fs.readdirSync(pagePath);
    let img = null;
    // let readme = '';
    files.some(fileName => {
      if (/^avatar\.(jpg|png)$/.test(fileName)) {
        img = RegExp.$1;
        return true;
      }
      // else if (/README\.md/ig.test(fileName)) {
      //   readme = fs.readFileSync(path.resolve(pagePath, 'README.md'), {encoding: "utf-8"});
      // }
    })
    return {
      img,
      name: pageName,
      // readme,
    }
  })

let config = {
  mode: 'development',
  context: path.resolve(__dirname, srcPath),
  entry,
  output: {
    filename: 'js/[name].js',
    path: path.resolve(__dirname, '../dist')
  },
  optimization: {
    splitChunks: {
      cacheGroups: {
        commons: {
          name: 'commons',
          chunks: "initial",
          minChunks: 2
        }
      }
    }
  },
  module: {
    rules: [
      {
        test: /\.(html|htm)$/,
        use: {
          loader: 'html-loader',
          options: {
            attrs: ['img:src',]
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader']
      },
      {
        test: /\.less$/,
        use: ['style-loader', 'css-loader', 'postcss-loader', 'less-loader']
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: "babel-loader",
        options: {
          compact: true,
          presets: ['@babel/preset-env'],
          plugins: ['@babel/plugin-proposal-class-properties'],
        },
      },
      {test: /\.(glsl)$/, loader: "raw-loader"},
      {
        test: /\.(png|jpe?g|gif|svg|bmp|tga)(\?.*)?$/i, use: [
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
  plugins: pages.map((pageName) => {
    return new HtmlWebpackPlugin({
      template: path.resolve(__dirname, pageName === 'index' ? `${srcPath}/index/index.html` : 'template.ejs'),
      filename: pageName + ".html",
      chunks: [pageName],
      title: pageName
    })
  }).concat(new webpack.DefinePlugin({
    'ITEMLIST': JSON.stringify(itemList),
  }))
};

if (isDev) {
  config.devtool = 'eval-source-map';
  config.devServer = {
    contentBase: path.resolve(__dirname, '..'),
    hot: true,
    quiet: true,
    host: "0.0.0.0",
    port: '8888',
    open: true,
    overlay: {
      warnings: false,
      errors: true
    },
    watchOptions: {
      poll: false,
    },
    clientLogLevel: 'none'
  }
  module.exports = new Promise((resolve, reject) => {
    portfinder.basePort = process.env.PORT || config.devServer.port;
    portfinder.getPort((err, port) => {
      if (err) {
        reject(err)
      } else {
        process.env.PORT = port;
        config.devServer.port = port;
        config.plugins.push(new FriendlyErrorsPlugin({
          compilationSuccessInfo: {
            messages: [`Your application is running here: http://${config.devServer.host}:${port}`],
          }
        }))
        resolve(config)
      }
    })
  })
} else {
  config.mode = 'production';
  config.plugins.push(new CopyWebpackPlugin([{
    from: path.resolve(__dirname, '../static'),
    to: path.resolve(__dirname, '../dist/static'),
    ignore: ['.*']
  }]))
  module.exports = config;
}
