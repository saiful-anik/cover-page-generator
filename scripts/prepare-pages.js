const fs = require("fs/promises");
const path = require("path");

const root = path.resolve(__dirname, "..");

async function copyAsset(fileName) {
  await fs.copyFile(path.join(root, fileName), path.join(root, "public", path.basename(fileName)));
}

Promise.all([copyAsset("data/data.json"), copyAsset("logo.jpg")]).catch((error) => {
  console.error("Could not prepare Cloudflare Pages assets:", error.message);
  process.exitCode = 1;
});
