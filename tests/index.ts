import fs from "fs";
import path from "path";

fs.readdirSync(path.join(__dirname, "src")).forEach((file) => {
  const root = path.join(__dirname, "src", file);
  const stat = fs.statSync(root);
  if (stat.isDirectory()) {
    describe(file, () => {
      fs.readdirSync(root).forEach((file) => {
        const filePath = path.join(root, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile() && filePath.endsWith(".test.ts")) {
          require(filePath);
        }
      });
    });
  }
});
