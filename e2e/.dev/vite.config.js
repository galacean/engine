const path = require("path");
const fs = require("fs-extra");
const OUT_PATH = "mpa";
const templateStr = fs.readFileSync(path.join(__dirname, "template/iframe.ejs"), "utf8");

// 替换 ejs 模版格式的字符串，如 <%= title %>: templateStr.replaceEJS("title","replaced title");
String.prototype.replaceEJS = function (regStr, replaceStr) {
  return this.replace(new RegExp(`<%=\\s*${regStr}\\s*%>`, "g"), replaceStr);
};

// clear mpa
fs.emptyDirSync(path.resolve(__dirname, OUT_PATH));

// create mpa
const demoList = fs
  .readdirSync(path.join(__dirname, "../case"))
  .filter((name) => /.ts$/.test(name) && name.indexOf(".") !== 0)
  .map((name) => {
    return {
      file: name.split(".ts")[0]
    };
  });

demoList.forEach(({ file }) => {
  const ejs = templateStr.replaceEJS("url", `./${file}.ts`);

  fs.outputFileSync(path.resolve(__dirname, OUT_PATH, file + ".ts"), `import "../../case/${file}"`);
  fs.outputFileSync(path.resolve(__dirname, OUT_PATH, file + ".html"), ejs);
});

// output demolist
const demoSorted = {};
demoList.forEach(({ file }) => {
  if (!demoSorted[file]) {
    demoSorted[file] = [];
  }
  demoSorted[file].push({
    src: file
  });
});

fs.outputJSONSync(path.join(__dirname, OUT_PATH, ".demoList.json"), demoSorted);

module.exports = {
  server: {
    open: true,
    host: "0.0.0.0",
    port: 5175,
    strictPort: true
  },
  resolve: {
    dedupe: ["@galacean/engine"]
  },
  optimizeDeps: {
    exclude: [
      "@galacean/engine",
      "@galacean/engine-draco",
      "@galacean/engine-lottie",
      "@galacean/engine-spine",
      "@galacean/engine-shaderlab",
      "@galacean/tools-baker",
    ]
  }
};
