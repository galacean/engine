#! /usr/bin/env node

'use strict';
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const inquirer = require("inquirer");
const copydir = require("copy-dir");
const regExp = /([a-z]|[-])+/;

/**
 * 检查是否在根目录
 */
function checkRootDir() {
  const packagesPath = path.join(__dirname, "../packages");
  if (!fs.existsSync(packagesPath)) {
    throw new Error("请在 oasis3d 的根目录下执行脚本");
  }
}

/**
 * 询问模块名称
 * @returns {PromiseLike<T | never> | Promise<T | never> | *}
 */
function inquirerModule() {
  function checkIsKebabCase(name) {
    return !!name.match(regExp);
  }

  function isModuleExist(name) {
    const modulePath = path.join(__dirname, "../packages", name);
    return fs.existsSync(modulePath);
  }

  function convertToKebab(string) {
    return string.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  }

  return inquirer
    .prompt([
      {
        type: "input",
        name: "packageName",
        message: "新建模块名称"
      }
    ])
    .then(answers => {
      const { packageName } = answers;
      if (!checkIsKebabCase(packageName)) {
        throw new Error(
          `模块命名应该是 kebab-case，例如: o3-animation 而不是 o3Animation`
        );
      }
      if (isModuleExist(packageName)) {
        throw new Error(`模块 ${packageName} 已经存在`);
      }
      return packageName;
    });
}

/**
 * 拷贝模板
 * @param name
 */
function copyTemplates(name) {
  const from = path.join(__dirname, "template");
  const to = path.join(__dirname, "../packages", name);
  copydir.sync(from, to, {
    utimes: true, // keep add time and modify time
    mode: true, // keep file mode
    cover: false // cover file when exists, default is true
  });
}

/**
 * 替换名称
 * @param name
 */
function replaceNames(name) {
  function replaceName(filename) {
    const filepath = path.join(__dirname, "../packages", name, filename);
    const text = fs.readFileSync(filepath, { encoding: "utf-8" });
    const newText = text.replace(/(\$name\$)/g, name);
    fs.writeFileSync(filepath, newText, { encoding: "utf-8" });
  }

  const fileList = ["CHANGELOG.md", "package.json", "README.md"];
  fileList.forEach(replaceName);
}

async function main() {
  try {
    checkRootDir();
    const packageName = await inquirerModule();
    copyTemplates(packageName);
    replaceNames(packageName);
  } catch (e) {
    console.log(chalk.redBright(e.message));
  }
}

main();
