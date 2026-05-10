const fs = require("fs/promises");
const path = require("path");
const puppeteer = require("puppeteer");

/**
 * Reads JSON data, injects it into the HTML template, and writes a PDF.
 *
 * @param {Object} options
 * @param {string} [options.jsonFile="data.json"] - JSON file in the same folder.
 * @param {string} [options.templateFile="template.html"] - HTML template with {{PLACEHOLDER}} keys.
 * @param {string} [options.outputFile="cover-page.pdf"] - Output PDF file name.
 */
async function generatePdfFromJson({
  jsonFile = "data.json",
  templateFile = "template.html",
  outputFile = "cover-page.pdf",
} = {}) {
  const baseDir = __dirname;
  const jsonPath = path.join(baseDir, jsonFile);
  const templatePath = path.join(baseDir, templateFile);
  const outputPath = path.join(baseDir, outputFile);

  const [templateRaw, jsonRaw] = await Promise.all([
    fs.readFile(templatePath, "utf8"),
    fs.readFile(jsonPath, "utf8"),
  ]);

  const data = JSON.parse(jsonRaw);
  let renderedHtml = templateRaw;

  // Replace every {{KEY}} with the corresponding JSON value.
  for (const [key, value] of Object.entries(data)) {
    const tokenRegex = new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "g");
    renderedHtml = renderedHtml.replace(tokenRegex, String(value ?? ""));
  }

  // Clear any unreplaced placeholders to avoid raw tokens in the final PDF.
  renderedHtml = renderedHtml.replace(/{{\s*[^}]+\s*}}/g, "");

  // Inline local <img src="..."> files as data URLs so they reliably appear in PDF output.
  renderedHtml = await inlineLocalImages(renderedHtml, baseDir);

  // Ensure relative assets (for example logo.jpg) resolve from this folder.
  const baseHref = pathToFileUrl(baseDir + path.sep);
  if (renderedHtml.includes("<head>")) {
    renderedHtml = renderedHtml.replace("<head>", `<head>\n    <base href=\"${baseHref}\">`);
  }

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(renderedHtml, { waitUntil: "networkidle0" });

    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      pageRanges: "1",
    });
  } finally {
    await browser.close();
  }

  return outputPath;
}

async function launchBrowser() {
  const attempts = [
    {
      name: "default",
      options: {
        headless: "new",
        args: ["--disable-dev-shm-usage", "--no-sandbox"],
      },
    },
    {
      name: "chrome-channel",
      options: {
        headless: "new",
        channel: "chrome",
        args: ["--disable-dev-shm-usage", "--no-sandbox"],
      },
    },
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      return await puppeteer.launch(attempt.options);
    } catch (error) {
      lastError = error;
      console.warn(`Puppeteer launch attempt failed (${attempt.name}): ${error.message}`);
    }
  }

  throw lastError;
}

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathToFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return `file:///${normalized}`;
}

async function inlineLocalImages(html, baseDir) {
  const imgSrcRegex = /(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi;

  const replacements = [];
  let match;
  while ((match = imgSrcRegex.exec(html)) !== null) {
    const fullMatch = match[0];
    const src = match[2].trim();

    if (!src || /^(https?:|data:|file:|\/\/)/i.test(src)) {
      continue;
    }

    const imagePath = path.resolve(baseDir, src);

    try {
      const imageBuffer = await fs.readFile(imagePath);
      const mimeType = getMimeType(imagePath);
      const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
      const replacedTag = `${match[1]}${dataUrl}${match[3]}`;
      replacements.push({ fullMatch, replacedTag });
    } catch (error) {
      console.warn(`Could not inline image '${src}': ${error.message}`);
    }
  }

  let result = html;
  for (const item of replacements) {
    result = result.replace(item.fullMatch, item.replacedTag);
  }

  return result;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

if (require.main === module) {
  generatePdfFromJson()
    .then((pdfPath) => {
      console.log(`PDF generated: ${pdfPath}`);
    })
    .catch((error) => {
      console.error("Failed to generate PDF:", error);
      process.exit(1);
    });
}

module.exports = { generatePdfFromJson };
