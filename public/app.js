const form = document.getElementById("cover-form");
const typeSelect = document.getElementById("type");
const profileSelect = document.getElementById("profile");
const courseSelect = document.getElementById("course");
const submissionDateInput = document.getElementById("submissionDate");
const generateButton = document.getElementById("generateButton");
const statusText = document.getElementById("status");

const customProfile = document.getElementById("customProfile");
const customCourse = document.getElementById("customCourse");
const customType = document.getElementById("customType");
const customTypeInput = document.getElementById("customTypeInput");
const customStudentName = document.getElementById("customStudentName");
const customStudentId = document.getElementById("customStudentId");
const customSection = document.getElementById("customSection");
const customCourseCode = document.getElementById("customCourseCode");
const customCourseTitle = document.getElementById("customCourseTitle");
const customInstructorName = document.getElementById("customInstructorName");
const customInstructorDesignation = document.getElementById("customInstructorDesignation");

init().catch((error) => setStatus(error.message || "Failed to load data.", "error"));

typeSelect.addEventListener("change", () => toggleCustom(customType, typeSelect.value === "custom"));
profileSelect.addEventListener("change", () => toggleCustom(customProfile, profileSelect.value === "custom"));
courseSelect.addEventListener("change", () => toggleCustom(customCourse, courseSelect.value === "custom"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  setBusy(true);
  setStatus("Making your PDF...", "");

  try {
    const response = await fetch("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: typeSelect.value === "custom" ? customTypeInput.value : typeSelect.value,
        profileIndex: profileSelect.value === "custom" ? null : profileSelect.value,
        courseValue: courseSelect.value === "custom" ? null : courseSelect.value,
        submissionDate: submissionDateInput.value,
        customProfile: profileSelect.value === "custom" ? { name: customStudentName.value, id: customStudentId.value, section: customSection.value } : null,
        customCourse: courseSelect.value === "custom" ? { code: customCourseCode.value, title: customCourseTitle.value, instructorName: customInstructorName.value, instructorDesignation: customInstructorDesignation.value } : null,
      }),
    });
    if (!response.ok) { const errorPayload = await safeReadJson(response); throw new Error(errorPayload?.error || "PDF generation failed."); }
    downloadBlob(await response.blob(), "cover-page.pdf");
    setStatus("Your PDF has downloaded!", "success");
  } catch (error) { setStatus(error.message || "PDF generation failed.", "error"); }
  finally { setBusy(false); }
});

async function init() {
  const response = await fetch("/api/options", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load dropdown data.");
  const payload = await response.json();
  fillOptions(typeSelect, payload.types.map((type) => ({ value: type, label: type })), "Custom type…");
  fillOptions(profileSelect, payload.profiles.map((profile, index) => ({ value: String(index), label: `${profile.STUDENT_NAME} (${profile.STUDENT_ID})` })), "Custom student…");
  fillOptions(courseSelect, payload.courses.map((course, index) => ({ value: String(index), label: `${course.COURSE_CODE} — ${course.COURSE_TITLE}` })), "Custom course…");
  setStatus("Ready when you are.", "");
}

function fillOptions(select, options, customLabel) {
  select.innerHTML = "";
  for (const option of options) { const node = new Option(option.label, option.value); select.add(node); }
  select.add(new Option(`✦ ${customLabel}`, "custom"));
}

function toggleCustom(element, visible) {
  element.classList.toggle("is-visible", visible);
  element.setAttribute("aria-hidden", String(!visible));
  element.querySelectorAll("input").forEach((input) => { input.required = visible && !input.id.includes("Instructor"); });
}
function setBusy(isBusy) { generateButton.disabled = isBusy; generateButton.textContent = isBusy ? "Generating..." : "Generate PDF →"; }
function setStatus(message, tone) { statusText.textContent = message; statusText.className = `status${tone ? ` ${tone}` : ""}`; }
function downloadBlob(blob, fileName) { const url = URL.createObjectURL(blob); const link = Object.assign(document.createElement("a"), { href: url, download: fileName }); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); }
async function safeReadJson(response) { try { return await response.json(); } catch { return null; } }
