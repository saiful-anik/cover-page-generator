const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const {
  buildTemplateData,
  DEFAULT_JSON_FILE,
  generatePdfFromJson,
  loadSourceData,
} = require("./generate_pdf");

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const publicDir = path.join(__dirname, "public");

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { error: "Missing request URL." });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/options") {
      const source = await loadSourceData(DEFAULT_JSON_FILE);
      sendJson(res, 200, {
        types: Array.isArray(source.TYPE) ? source.TYPE : [source.TYPE].filter(Boolean),
        profiles: source.PROFILES ?? [],
        courses: source.COURSES ?? [],
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/generate") {
      const body = await readJsonBody(req);
      const data = await buildTemplateData({
        typeArg: body.type,
        profileArg: body.profileIndex,
        courseArg: body.courseValue,
        submissionDate: body.submissionDate,
        customProfile: body.customProfile,
        customCourse: body.customCourse,
      });

      const pdfBuffer = await generatePdfFromJson({
        data,
        outputFile: null,
        returnBuffer: true,
      });

      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="cover-page.pdf"',
        "Content-Length": pdfBuffer.length,
        "Cache-Control": "no-store",
      });
      res.end(pdfBuffer);
      return;
    }

    if (req.method === "GET") {
      await serveStaticFile(url.pathname, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    const statusCode = error.statusCode ?? 500;
    sendJson(res, statusCode, {
      error: error.message || "Something went wrong.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Cover page website running at http://localhost:${PORT}`);
});

async function serveStaticFile(urlPath, res) {
  const routePath = urlPath === "/" ? "/index.html" : urlPath;
  const resolvedPath = path.resolve(publicDir, `.${routePath}`);

  if (!resolvedPath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  let fileBuffer;
  try {
    fileBuffer = await fs.readFile(resolvedPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { error: "Not found." });
      return;
    }

    throw error;
  }

  res.writeHead(200, {
    "Content-Type": getContentType(resolvedPath),
    "Cache-Control": "no-store",
  });
  res.end(fileBuffer);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    const error = new Error("Request body is empty.");
    error.statusCode = 400;
    throw error;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
