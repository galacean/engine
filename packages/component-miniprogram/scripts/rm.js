const fs = require('fs-extra');
const path = require('path');

// remove unnecessary file
const dirs = fs.readdirSync(path.join(__dirname, '../dist'));

dirs.forEach((item) => {
  if (item.includes('app.') || item.includes('DS_Store') || item.includes('demo')) {
    fs.removeSync(path.join(__dirname, '../dist/', item));
  } else {
    const pathFull = path.join(__dirname, '../dist/', item);
    try {
      const moduleDirs = fs.readdirSync(pathFull);
      moduleDirs.forEach((item2) => {
        if (item2.includes('demo')) {
          fs.removeSync(path.join(__dirname, '../dist/', item, item2));
        }
      });
    } catch (e) {
      //
    }
  }
});

fs.removeSync(path.join(__dirname, '../dist/.entry'));
fs.removeSync(path.join(__dirname, '../dist/yarn.lock'));
