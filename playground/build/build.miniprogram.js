const fs = require("fs-extra");
const path = require("path");
const copydir = require("copy-dir");
const map = require("./resource.map");
const DSTDIR = path.resolve(__dirname, "../dist-miniprogram");
// const DSTDIR = "/Users/husong/WebstormProjects/work/oasis3d-playground-mini/pages/playground/dist-miniprogram";
const SRCDIR = path.resolve(__dirname, "../src");
const prettier = require("prettier");

fs.removeSync(DSTDIR);
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
    cover: true // cover file when exists, default is true
  });
}

/**
 * 拷贝模板
 * @param name
 */
function copyTemplate(name) {
  const from = path.resolve(__dirname, "template-miniprogram");
  const to = path.resolve(DSTDIR, name);
  copydir.sync(from, to, {
    utimes: true, // keep add time and modify time
    mode: true, // keep file mode
    cover: true // cover file when exists, default is true
  });
}

const miniProgramPlaygrounds = [
  "2d",
  "ambientLighting",
  // "animation-crossfade",
  "animation-events",
  "animation-mix",
  // "animation-play",
  // "bounding-type",
  // "clipPlanes",
  "collision",
  "compressed-texture",
  "controls-free",
  "controls-orbit",
  "cubiodGeometry",
  "custom-material",
  "cylinderGeometry",
  // "decal",
  "ibl",
  "directLighting",
  // "fog",
  "instancing",
  "morph-animation",
  // "particle-sprite-sheet",
  // "pbr",
  // "pbr-material-editor",
  "planeGeometry",
  "PointLighting",
  "raycast",
  "SkyBox",
  "sphereGeometry",
  "SpotLighting",
  "Trailing",
  "superant",
  "tween"
];

/**
 * 获取需要在小程序展示的目录
 * 排除index目录，这个案例只在pc端展示
 * */
function getPages() {
  const pages = fs.readdirSync(SRCDIR).filter(pageName => {
    if (pageName === "index") return false;
    if (miniProgramPlaygrounds.indexOf(pageName) < 0) return false;
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
  let reg = new RegExp(`<%=\\s*?${name}\\s*?%>`, "g");
  return text.replace(reg, dst);
}

/**
 * 替换json
 * */
function handleJSON(page) {
  const file = path.resolve(DSTDIR, page, "index.json");
  const text = fs.readFileSync(file, { encoding: "utf-8" });
  const newText = replaceVar(text, "defaultTitle", page);
  fs.writeFileSync(file, newText, { encoding: "utf-8" });
}

/**
 * 替换index.js
 * 1. 替换code
 * 2. 替换import的o3模块到小程序onReady里面的局部变量
 * 3. 去除o3-engine-stats模块
 * 4. o3-demo -> canvas
 * 5. document.getElementById('*') -> canvas
 * 6. canvas变量冲突删除
 * 7. engine升到顶层,用来小程序onUnload时释放
 * 8. 其他的import模块，升到顶层
 * */
async function handleJS(page) {
  const file = path.resolve(DSTDIR, page, "index.js");
  const codeFile = path.resolve(SRCDIR, page, "index.js");
  const text = fs.readFileSync(file, { encoding: "utf-8" });
  const code = fs.readFileSync(codeFile, { encoding: "utf-8" });
  // replace code
  let newText = replaceVar(text, "code", code);
  // replace module to local
  newText = newText.replace(/import\s*?{\s*?(.*?)\s*?}\s*?from\s*?['"]@alipay\/o3.*?['"]/g, `let {$1} = o3`);
  // delete @alipay/o3-engine-stats
  newText = newText.replace(/import\s*?['"]@alipay\/o3-engine-stats['"];?/g, "");
  // replace 'o3-demo' to canvas
  newText = newText.replace(/o3-demo/g, "canvas");
  // replace 'document.getElementById(.*)' to canvas
  newText = newText.replace(/document.getElementById\('.*?'\)/g, "canvas");
  // replace Duplicate declaration "canvas"
  newText = newText.replace(/(let|const|var)(?:\s*?canvas\s*?=)/g, "");
  // toplevel engine
  newText = newText.replace(
    /(?:let|const|var)(.*?)=\s*?new\s*?Engine\(\);?/g,
    `engine = new Engine();
    $1 = engine`
  );
  // toplevel module
  let reg = /(import.*['"];?)/g;
  const matches = newText.match(reg);
  if (matches) {
    newText = newText.replace(reg, "");
    newText = matches.join("\n") + "\n" + newText;
  }
  const filePath = await prettier.resolveConfigFile();
  const options = await prettier.resolveConfig(filePath);
  options.parser = "babel";
  const formatted = prettier.format(newText, options);
  fs.writeFileSync(file, formatted, { encoding: "utf-8" });
}

/**
 * 替换路径
 * 1. 替换成小程序包/dist/miniprogram
 * 2. 替换/static静态资源映射到cdn
 * 3. 替换../common相对路径到/page/playground/common绝对路径
 * */
function handlePrefix(pages) {
  pages.forEach(page => {
    fs.readdirSync(path.resolve(DSTDIR, page)).forEach(filename => {
      if (!/\.js$/.test(filename)) return;
      const file = path.resolve(DSTDIR, page, filename);
      let stats = fs.statSync(file);
      if (stats.isDirectory()) return;
      const text = fs.readFileSync(file, { encoding: "utf-8" });
      // 替换成小程序包
      let newText = text.replace(/(@alipay\/o3.*?)(?=['"])/g, `$1/dist/miniprogram`);
      // 替换静态资源
      for (let resourceName in map) {
        if (newText.indexOf(resourceName) !== -1) {
          newText = newText.replace(new RegExp(resourceName), map[resourceName]);
        }
      }
      // 替换common
      newText = newText.replace(/\.\.\/common/g, "/pages/playground/common");
      newText = newText.replace(/document.getElementById\("canvas"\)/g, "canvas");
      newText = newText.replace(/document.getElementById\("r3-demo"\)/g, "canvas");
      fs.writeFileSync(file, newText, { encoding: "utf-8" });
    });
  });
}

function writeAppJSON(pages) {
  const appJSONPath = "/Users/husong/WebstormProjects/work/oasis3d-playground-mini/app.json";
  if (!fs.existsSync(appJSONPath)) {
    return;
  }
  const appJSON = require(appJSONPath);
  appJSON.subPackages[0].pages = pages.map(item => `${item}/index`);
  fs.writeFileSync(appJSONPath, JSON.stringify(appJSON, null, 2), { encoding: "utf-8" });
  // console.log(pages)
}

// 确保生成dist-miniprogram构建目录
fs.ensureDirSync(DSTDIR);
// 获取page
let pages = getPages();
// 处理小程序页面
Promise.all(
  pages.map(async page => {
    // copy 目录
    copyDir(page);
    // copy模板，common排除
    if (page === "common") return;
    copyTemplate(page);
    // replace defaultTitle in index.json
    handleJSON(page);
    // 处理 index.js
    await handleJS(page);
  })
).then(() => {
  writeAppJSON(pages);
  // 替换prefix
  handlePrefix(pages);
  console.log(
    "将下面配置复制到app.subPackages进行分类展示",
    pages.filter(p => p !== "common").map(page => page + "/index")
  );
});
