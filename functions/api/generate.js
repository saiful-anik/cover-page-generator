import puppeteer from "@cloudflare/puppeteer";

const MAX_BODY_BYTES = 12_000;
const TEXT_LIMITS = { type: 80, name: 120, id: 40, section: 30, code: 40, title: 160, instructorName: 120, instructorDesignation: 100 };

export async function onRequestPost({ request, env }) {
  try {
    const payload = await parsePayload(request);
    const source = await loadSource(request);
    const data = validateAndPrepare(payload, source);
    const browser = await puppeteer.launch(env.BROWSER);

    try {
      const page = await browser.newPage();
      await page.setContent(renderCoverPage(data, new URL(request.url).origin));
      const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" } });
      return new Response(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="cover-page.pdf"', "Cache-Control": "no-store" } });
    } finally {
      await browser.close();
    }
  } catch (error) {
    const status = error.statusCode || 500;
    return Response.json({ error: status === 500 ? "Could not generate the PDF." : error.message }, { status });
  }
}

async function parsePayload(request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw clientError("Send JSON data.", 415);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw clientError("Request is too large.", 413);
  const raw = await request.text();
  if (!raw || raw.length > MAX_BODY_BYTES) throw clientError("Request is too large.", 413);
  try { return JSON.parse(raw); } catch { throw clientError("Request body must be valid JSON."); }
}

async function loadSource(request) {
  const response = await fetch(new URL("/data.json", request.url));
  if (!response.ok) throw new Error("Source data is unavailable.");
  return response.json();
}

function validateAndPrepare(payload, source) {
  assertExactKeys(payload, ["type", "profileIndex", "courseValue", "submissionDate", "customProfile", "customCourse"]);
  const type = text(payload.type, "type", true);
  const customProfile = payload.customProfile == null ? null : customProfileData(payload.customProfile);
  const customCourse = payload.customCourse == null ? null : customCourseData(payload.customCourse);
  const profile = customProfile || indexed(source.PROFILES, payload.profileIndex, "student");
  const course = customCourse || indexed(source.COURSES, payload.courseValue, "course");
  const submissionDate = date(payload.submissionDate);

  return {
    TYPE: type, DEPARTMENT: safeText(source.DEPARTMENT),
    STUDENT_NAME: profile.STUDENT_NAME, STUDENT_ID: profile.STUDENT_ID, SECTION: profile.SECTION,
    COURSE_CODE: course.COURSE_CODE, COURSE_TITLE: course.COURSE_TITLE,
    INSTRUCTOR_NAME: course.INSTRUCTOR_NAME, INSTRUCTOR_DESIGNATION: course.INSTRUCTOR_DESIGNATION,
    SUBMISSION_DATE: submissionDate,
  };
}

function customProfileData(value) {
  assertExactKeys(value, ["name", "id", "section"]);
  return { STUDENT_NAME: text(value.name, "name", true), STUDENT_ID: text(value.id, "id", true), SECTION: text(value.section, "section", true) };
}

function customCourseData(value) {
  assertExactKeys(value, ["code", "title", "instructorName", "instructorDesignation"]);
  return { COURSE_CODE: text(value.code, "code", true), COURSE_TITLE: text(value.title, "title", true), INSTRUCTOR_NAME: text(value.instructorName, "instructorName"), INSTRUCTOR_DESIGNATION: text(value.instructorDesignation, "instructorDesignation") };
}

function indexed(items, value, label) {
  if (!Array.isArray(items) || typeof value !== "string" || !/^\d{1,3}$/.test(value)) throw clientError(`Choose a saved ${label} or provide custom details.`);
  const item = items[Number(value)];
  if (!item) throw clientError(`Choose a valid ${label}.`);
  return item;
}

function text(value, field, required = false) {
  if (typeof value !== "string") throw clientError(`Enter a valid ${field}.`);
  const normalized = value.normalize("NFC").trim();
  if ((required && !normalized) || normalized.length > TEXT_LIMITS[field]) throw clientError(`Enter a valid ${field}.`);
  return normalized;
}

function date(value) {
  if (value === "") return "";
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw clientError("Enter a valid submission date.");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw clientError("Enter a valid submission date.");
  return value;
}

function assertExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) throw clientError("Request contains invalid fields.");
}
function safeText(value) { return typeof value === "string" ? value : ""; }
function clientError(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; return error; }
function esc(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

function renderCoverPage(data, origin) {
  const value = (key) => esc(data[key]);
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"Times New Roman",serif}.page{width:210mm;height:297mm;padding:30mm 20mm;background:#fff;color:#111;display:flex;flex-direction:column}.brand{text-align:center;margin-bottom:22mm}.brand img{display:block;width:100%;max-width:none;height:auto;margin:0 auto}.header{text-align:center}.header h1{font-size:28px;margin:0 0 24px}.course{font-size:18px;line-height:1.45}.course p{margin:0}.course p+p{margin-top:6px}.info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:24px 0}.box{background:#f3f3f3}.box h2{margin:0;padding:8px;text-align:center;font-size:18px;background:#d9d9d9}.box div{padding:18px}.box p{font-size:14px;line-height:1.5;margin:0 0 5px}.submission{font-size:16px;margin-top:12px}.signature{margin-top:auto;text-align:right;padding-bottom:18px}.signature div{border-top:1px solid;width:180px;margin-left:auto;padding-top:5px;text-align:center}</style></head><body><main class="page"><div class="brand"><img src="${esc(origin)}/logo.jpg" alt="University logo"></div><header class="header"><h1>${value("TYPE")}</h1><div class="course"><p><strong>Course Code:</strong> ${value("COURSE_CODE")}</p><p><strong>Course Title:</strong> ${value("COURSE_TITLE")}</p></div></header><section class="info"><article class="box"><h2>Submitted by</h2><div><p><strong>Name:</strong> ${value("STUDENT_NAME")}</p><p><strong>ID:</strong> ${value("STUDENT_ID")}</p><p><strong>Department:</strong> ${value("DEPARTMENT")}</p><p><strong>Section:</strong> ${value("SECTION")}</p></div></article><article class="box"><h2>Submitted to</h2><div><p><strong>Name:</strong> ${value("INSTRUCTOR_NAME")}</p><p><strong>Designation:</strong> ${value("INSTRUCTOR_DESIGNATION")}</p><p>Department of CSE</p><p>Northern University of Business and Technology</p><p>Khulna</p></div></article></section><p class="submission"><strong>Submission Date:</strong> ${value("SUBMISSION_DATE")}</p><footer class="signature"><div>Signature</div></footer></main></body></html>`;
}
