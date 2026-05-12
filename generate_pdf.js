const fs = require("fs/promises");
const path = require("path");
const puppeteer = require("puppeteer");

const DEFAULT_JSON_FILE = "data/data.json";
const DEFAULT_TEMPLATE_FILE = "template.html";
const DEFAULT_OUTPUT_FILE = "cover-page.pdf";

/**
 * Reads JSON data, injects it into the HTML template, and writes a PDF.
 *
 * @param {Object} options
 * @param {string} [options.jsonFile="data/data.json"] - JSON file in the same folder.
 * @param {string} [options.templateFile="template.html"] - HTML template with {{PLACEHOLDER}} keys.
 * @param {string | null} [options.outputFile="cover-page.pdf"] - Output PDF file name. Pass null to skip saving.
 * @param {Object} [options.data] - Already prepared flat data for the template.
 * @param {boolean} [options.returnBuffer=false] - Return the generated PDF as a Buffer.
 */
async function generatePdfFromJson({
  jsonFile = DEFAULT_JSON_FILE,
  templateFile = DEFAULT_TEMPLATE_FILE,
  outputFile = DEFAULT_OUTPUT_FILE,
  data: inputData,
  returnBuffer = false,
} = {}) {
  const baseDir = __dirname;
  const outputPath = outputFile ? path.join(baseDir, outputFile) : null;
  const sourceData = inputData ?? normalizeTemplateData(await loadSourceData(jsonFile));
  const renderedHtml = await renderTemplateHtml({
    jsonFile,
    templateFile,
    data: sourceData,
  });

  const pdfBuffer = await renderPdfBuffer(renderedHtml, outputPath);

  if (returnBuffer) {
    return pdfBuffer;
  }

  return outputPath;
}

async function loadSourceData(jsonFile = DEFAULT_JSON_FILE) {
  const sourcePath = path.join(__dirname, jsonFile);
  const raw = await fs.readFile(sourcePath, "utf8");
  return JSON.parse(raw);
}

async function renderTemplateHtml({
  templateFile = DEFAULT_TEMPLATE_FILE,
  data,
} = {}) {
  const baseDir = __dirname;
  const templatePath = path.join(baseDir, templateFile);
  const templateRaw = await fs.readFile(templatePath, "utf8");
  let renderedHtml = templateRaw;

  for (const [key, value] of Object.entries(data ?? {})) {
    const tokenRegex = new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "g");
    renderedHtml = renderedHtml.replace(tokenRegex, String(value ?? ""));
  }

  renderedHtml = renderedHtml.replace(/{{\s*[^}]+\s*}}/g, "");
  renderedHtml = await inlineLocalImages(renderedHtml, baseDir);

  const baseHref = pathToFileUrl(baseDir + path.sep);
  if (renderedHtml.includes("<head>")) {
    renderedHtml = renderedHtml.replace("<head>", `<head>\n    <base href="${baseHref}">`);
  }

  return renderedHtml;
}

async function renderPdfBuffer(renderedHtml, outputPath) {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(renderedHtml, { waitUntil: "networkidle0" });

    const pdfBytes = await page.pdf({
      ...(outputPath ? { path: outputPath } : {}),
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      pageRanges: "1",
    });

    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
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

function normalizeTemplateData(source) {
  if (!source || typeof source !== "object") {
    return {};
  }

  if (Array.isArray(source.PROFILES) && Array.isArray(source.COURSES)) {
    const selectedProfile = source.PROFILES[0] ?? {};
    const selectedCourse = source.COURSES[0] ?? {};

    return {
      TYPE: Array.isArray(source.TYPE) ? source.TYPE[0] ?? "" : source.TYPE ?? "",
      DEPARTMENT: source.DEPARTMENT ?? "",
      STUDENT_ID: selectedProfile.STUDENT_ID ?? "",
      STUDENT_NAME: selectedProfile.STUDENT_NAME ?? "",
      SECTION: selectedProfile.SECTION ?? "",
      COURSE_CODE: selectedCourse.COURSE_CODE ?? "",
      COURSE_TITLE: selectedCourse.COURSE_TITLE ?? "",
      INSTRUCTOR_NAME: selectedCourse.INSTRUCTOR_NAME ?? "",
      INSTRUCTOR_DESIGNATION: selectedCourse.INSTRUCTOR_DESIGNATION ?? "",
      SUBMISSION_DATE: "",
    };
  }

  return source;
}

function parseCliArgs(argv) {
  const [profileArg, courseArg, ...dateParts] = argv;
  return {
    profileArg,
    courseArg,
    submissionDate: dateParts.join(" ").trim(),
  };
}

async function buildTemplateData({
  jsonFile = DEFAULT_JSON_FILE,
  typeArg,
  profileArg,
  courseArg,
  submissionDate,
} = {}) {
  const source = await loadSourceData(jsonFile);

  if (profileArg == null || courseArg == null) {
    throw new Error(getUsageMessage(source));
  }

  const profileIndex = parseRequiredIndex(profileArg, source.PROFILES.length, "profile");
  const selectedProfile = source.PROFILES[profileIndex];
  const selectedCourse = findCourse(source.COURSES, courseArg);
  const selectedType = findType(source.TYPE, typeArg);

  if (!selectedCourse) {
    throw new Error(`Course '${courseArg}' not found. Use a course index or exact course code.`);
  }

  if (typeArg != null && selectedType == null) {
    throw new Error(`Type '${typeArg}' not found. Use a type index or exact type value.`);
  }

  return {
    ...normalizeTemplateData({
      ...source,
      TYPE: selectedType ?? source.TYPE,
      PROFILES: [selectedProfile],
      COURSES: [selectedCourse],
    }),
    SUBMISSION_DATE: submissionDate ?? "",
  };
}

function parseRequiredIndex(value, total, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= total) {
    throw new Error(`Invalid ${label} index '${value}'. Use a number from 0 to ${total - 1}.`);
  }

  return parsed;
}

function findCourse(courses, courseArg) {
  const courseIndex = Number.parseInt(courseArg, 10);
  if (String(courseIndex) === String(courseArg).trim()) {
    if (courseIndex >= 0 && courseIndex < courses.length) {
      return courses[courseIndex];
    }

    return null;
  }

  const normalizedCourseArg = String(courseArg).trim().toLowerCase();
  return courses.find((course) => String(course.COURSE_CODE).trim().toLowerCase() === normalizedCourseArg);
}

function findType(types, typeArg) {
  if (!Array.isArray(types)) {
    return typeArg == null ? types ?? "" : String(types ?? "");
  }

  if (typeArg == null || String(typeArg).trim() === "") {
    return types[0] ?? "";
  }

  const typeIndex = Number.parseInt(typeArg, 10);
  if (String(typeIndex) === String(typeArg).trim()) {
    return types[typeIndex] ?? null;
  }

  const normalizedTypeArg = String(typeArg).trim().toLowerCase();
  return types.find((type) => String(type).trim().toLowerCase() === normalizedTypeArg) ?? null;
}

function getUsageMessage(source) {
  const typeLines = (Array.isArray(source.TYPE) ? source.TYPE : [source.TYPE]).map(
    (type, index) => `  [${index}] ${type}`
  ).join("\n");
  const profileLines = source.PROFILES.map(
    (profile, index) => `  [${index}] ${profile.STUDENT_NAME} (${profile.STUDENT_ID})`
  ).join("\n");
  const courseLines = source.COURSES.map(
    (course, index) => `  [${index}] ${course.COURSE_CODE} - ${course.COURSE_TITLE}`
  ).join("\n");

  return [
    "Usage: node generate_pdf.js <profileIndex> <courseIndexOrCourseCode> [submissionDate]",
    "",
    "Types:",
    typeLines,
    "",
    "Profiles:",
    profileLines,
    "",
    "Courses:",
    courseLines,
  ].join("\n");
}

if (require.main === module) {
  const cliArgs = parseCliArgs(process.argv.slice(2));

  buildTemplateData(cliArgs)
    .then((data) => generatePdfFromJson({ data }))
    .then((pdfPath) => {
      console.log(`PDF generated: ${pdfPath}`);
    })
    .catch((error) => {
      console.error("Failed to generate PDF:", error);
      process.exit(1);
    });
}

module.exports = {
  DEFAULT_JSON_FILE,
  DEFAULT_OUTPUT_FILE,
  DEFAULT_TEMPLATE_FILE,
  buildTemplateData,
  findCourse,
  findType,
  generatePdfFromJson,
  loadSourceData,
  normalizeTemplateData,
  parseCliArgs,
  renderTemplateHtml,
};
