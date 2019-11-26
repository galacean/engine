const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

fs.readdirSync("packages").forEach(dir => {
  const filepath = path.join(__dirname, 'packages', dir);
  exec(`cd ${filepath} && tnpm publish --tag next`)
});
