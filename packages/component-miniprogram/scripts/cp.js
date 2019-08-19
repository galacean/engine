const fs = require('fs-extra');
const path = require('path');
// copy file
fs.copySync(path.join(__dirname, '../src'), path.join(__dirname, '../dist'), {
  filter(src) {
    return !src.endsWith('.js') && !src.endsWith('.md');
  },
});
