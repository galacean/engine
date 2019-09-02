const fs = require('fs-extra');
const path = require('path');
const copydir = require('copy-dir');
const map = require('./resource.map');
const DSTDIR = path.resolve(__dirname, '../dist-miniprogram');
const SRCDIR = path.resolve(__dirname, '../src');

/**
 * 拷贝目录
 * @param name
 */
function copyDir(name) {
  const from = path.resolve(SRCDIR, name);
  const to = path.resolve(DSTDIR, name);
  copydir.sync(from, to, {
    utimes: true, // keep add time and modify time
    mode: true, // keep file mode
    cover: true, // cover file when exists, default is true
  });
}

/**
 * 拷贝模板
 * @param name
 */
function copyTemplate(name) {
  const from = path.resolve(__dirname, 'template-miniprogram');
  const to = path.resolve(DSTDIR, name);
  copydir.sync(from, to, {
    utimes: true, // keep add time and modify time
    mode: true, // keep file mode
    cover: true, // cover file when exists, default is true
  });
}

/**
 * 获取需要在小程序展示的目录
 * 排除index目录，这个案例只在pc端展示
 * */
function getPages() {
  const pages =
    fs.readdirSync(SRCDIR)
      .filter((pageName) => {
        if (pageName === 'index') return false;
        let pagePath = path.resolve(SRCDIR, pageName);
        let stats = fs.statSync(pagePath);
        return stats.isDirectory();
      });
  return pages;
}

/**
 * 替换变量
 * */
function replaceVar(text, name, dst) {
  let reg = new RegExp(`<%=\\s*?${name}\\s*?%>`, 'g');
  return text.replace(reg, dst);
}

function handleJSON(page) {
  const file = path.resolve(DSTDIR, page, 'index.json');
  const text = fs.readFileSync(file, { encoding: 'utf-8' });
  const newText = replaceVar(text, 'defaultTitle', page);
  fs.writeFileSync(file, newText, { encoding: 'utf-8' });
}

function handleJS(page) {
  const file = path.resolve(DSTDIR, page, 'index.js');
  const codeFile = path.resolve(SRCDIR, page, 'index.js');
  const text = fs.readFileSync(file, { encoding: 'utf-8' });
  const code = fs.readFileSync(codeFile, { encoding: 'utf-8' });
  // replace code
  let newText = replaceVar(text, 'code', code);
  // replace module to local
  newText = newText.replace(
    /import\s*?{\s*?(.*?)\s*?}\s*?from\s*?['"]@alipay\/o3.*?['"]/g,
    `let {$1} = O3`);
  // delete @alipay/o3-engine-stats
  newText = newText.replace(/import\s*?['"]@alipay\/o3-engine-stats['"];?/g, '');
  // replace 'o3-demo' to canvas
  newText = newText.replace(/o3-demo/g, 'canvas');
  // replace 'document.getElementById(.*)' to canvas
  newText = newText.replace(/document.getElementById\('.*?'\)/g, 'canvas');
  // replace Duplicate declaration "canvas"
  newText = newText.replace(/(let|const|var)(?:\s*?canvas\s*?=)/g, '');
  // toplevel engine
  newText = newText.replace(/(?:let|const|var)(.*?)=\s*?new\s*?Engine\(\);?/,
    `engine = new Engine();
    $1 = engine`,
  );
  // toplevel module
  let reg = /(import.*['"];?)/g;
  const matches = newText.match(reg);
  if (matches) {
    newText = newText.replace(reg, '');
    newText = matches.join('\n') + '\n' + newText;
  }
  fs.writeFileSync(file, newText, { encoding: 'utf-8' });
}

/**
 * 替换module和静态资源
 * */
function handlePrefix(pages) {
  pages.forEach(page => {
    fs.readdirSync(path.resolve(DSTDIR, page)).forEach(filename => {
      if (!/\.js$/.test(filename)) return;
      const file = path.resolve(DSTDIR, page, filename);
      let stats = fs.statSync(file);
      if (stats.isDirectory()) return;
      const text = fs.readFileSync(file, { encoding: 'utf-8' });
      // 替换成小程序包
      let newText = text.replace(
        /(@alipay\/o3.*?)(?=['"])/g,
        `$1/dist/miniprogram`,
      );
      // 替换静态资源
      for (let resourceName in map) {
        if (newText.indexOf(resourceName) !== -1) {
          newText = newText.replace(resourceName, map[resourceName]);
        }
      }
      fs.writeFileSync(file, newText, { encoding: 'utf-8' });
    });
  });
}

// 确保生成dist-miniprogram构建目录
fs.ensureDirSync(DSTDIR);
// 获取page
let pages = getPages();
pages = [
  'common',
  'controls-orbit',
  'directLighting',
  'TextureCubeMap',
  'pbr',
  'pbr-material-editor'
];
// 处理小程序页面
pages.forEach(page => {
  // copy 目录
  copyDir(page);
  // copy模板，common排除
  if (page === 'common') return;
  copyTemplate(page);
  // replace defaultTitle in index.json
  handleJSON(page);
  // 处理 index.js
  handleJS(page);
});
// 替换prefix
handlePrefix(pages);
console.log('将下面配置复制到app.json.subPackages.pages', pages.filter(p => p !== 'common').map(page => page + '/index'));
