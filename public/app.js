const form = document.getElementById("cover-form");
const typeSelect = document.getElementById("type");
const profileSelect = document.getElementById("profile");
const courseSelect = document.getElementById("course");
const submissionDateInput = document.getElementById("submissionDate");
const generateButton = document.getElementById("generateButton");
const statusText = document.getElementById("status");

init().catch((error) => {
  setStatus(error.message || "Failed to load data.", "error");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  setBusy(true);
  setStatus("Making PDF...", "");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: typeSelect.value,
        profileIndex: profileSelect.value,
        courseValue: courseSelect.value,
        submissionDate: submissionDateInput.value,
      }),
    });

    if (!response.ok) {
      const errorPayload = await safeReadJson(response);
      throw new Error(errorPayload?.error || "PDF generation failed.");
    }

    const pdfBlob = await response.blob();
    downloadBlob(pdfBlob, "cover-page.pdf");
    setStatus("PDF downloaded.", "success");
  } catch (error) {
    setStatus(error.message || "PDF generation failed.", "error");
  } finally {
    setBusy(false);
  }
});

async function init() {
  const response = await fetch("/api/options", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load dropdown data.");
  }

  const payload = await response.json();
  fillOptions(typeSelect, payload.types.map((type) => ({
    value: type,
    label: type,
  })));
  fillOptions(profileSelect, payload.profiles.map((profile, index) => ({
    value: String(index),
    label: `${profile.STUDENT_NAME} (${profile.STUDENT_ID})`,
  })));
  fillOptions(courseSelect, payload.courses.map((course, index) => ({
    value: String(index),
    label: `${course.COURSE_CODE} - ${course.COURSE_TITLE}`,
  })));

  setStatus("Ready.", "");
}

function fillOptions(select, options) {
  select.innerHTML = "";

  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  }
}

function setBusy(isBusy) {
  generateButton.disabled = isBusy;
  generateButton.textContent = isBusy ? "Generating..." : "Generate PDF";
}

function setStatus(message, tone) {
  statusText.textContent = message;
  statusText.className = `status${tone ? ` ${tone}` : ""}`;
}

function downloadBlob(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
