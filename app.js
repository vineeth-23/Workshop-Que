const views = Array.from(document.querySelectorAll(".view"));
const textareas = Array.from(document.querySelectorAll("textarea"));
const radioInputs = Array.from(document.querySelectorAll('input[type="radio"]'));
const nextButton = document.querySelector("#nextSection");
const backButton = document.querySelector("#backSection");
const meetingBoard = document.querySelector(".meeting-board");
const themeToggle = document.querySelector("#themeToggle");
const themeToggleText = document.querySelector(".theme-toggle-text");
const dotsContainer = document.querySelector(".section-dots");
const stepLabel = document.querySelector("#stepLabel");
const validationMessage = document.querySelector("#validationMessage");
const analysisPanel = document.querySelector("#analysisPanel");
const analysisContent = document.querySelector("#analysisContent");
const roleNumber = document.querySelector("#witnessNumber");
const roleName = document.querySelector("#witnessRole");
const rolePrompt = document.querySelector("#witnessPrompt");
const roleNameBadges = Array.from(document.querySelectorAll("[data-role-name]"));
const rolePromptBadges = Array.from(document.querySelectorAll("[data-role-prompt]"));
const storageKey = "worldMakingBoard.v6";
const themeStorageKey = "worldMakingBoard.theme";
const roleStorageKey = "worldMakingBoard.role";
const clientStorageKey = "worldMakingBoard.clientId";

const roles = [
  {
    number: 1,
    name: "Customer",
    prompt: "In this world, I feel...",
    color: "#b6533e",
  },
  {
    number: 2,
    name: "Agent / Worker",
    prompt: "In this world, my job becomes...",
    color: "#33697a",
  },
  {
    number: 3,
    name: "Community Member",
    prompt: "In this world, the burden lands on...",
    color: "#6b743f",
  },
  {
    number: 4,
    name: "Leader",
    prompt: "In this world, responsibility sounds like...",
    color: "#bd7a24",
  },
  {
    number: 5,
    name: "Resource Chain / Planet",
    prompt: "In this world, the hidden cost moves to...",
    color: "#744a74",
  },
  {
    number: 6,
    name: "The Person the System Misunderstands",
    prompt: "In this world, someone like me is treated as...",
    color: "#202326",
  },
];

let activeIndex = 0;
let dots = [];
let assignedRole = roles[0];
let saveTimer;
let analysisComplete = false;
let latestAnalysis = null;
let animationPollTimer;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function scoreText(factor) {
  if (!factor || typeof factor.score !== "number") return "";
  const score = factor.score <= 1 ? factor.score * 100 : factor.score;
  return `${Math.round(score)}%`;
}

function renderList(items = []) {
  if (!items.length) return "";
  return `<ul>${items.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderFactorCard(title, factor, wide = false) {
  if (!factor) return "";
  return `
    <article class="analysis-card ${wide ? "analysis-wide" : ""}">
      <h4><span>${escapeHtml(title)}</span><strong>${escapeHtml(scoreText(factor))}</strong></h4>
      <p>${escapeHtml(factor.interpretation || factor.overall || "")}</p>
      ${renderList(factor.evidence)}
      ${factor.recommendation ? `<p><strong>Next:</strong> ${escapeHtml(factor.recommendation)}</p>` : ""}
    </article>
  `;
}

function renderAnalysis(analysis) {
  latestAnalysis = analysis;
  const topics = analysis.matching_topic || {};
  analysisPanel.hidden = false;
  analysisContent.innerHTML = `
    <p class="analysis-summary">${escapeHtml(analysis.participant_summary || "Analysis complete.")}</p>
    <div class="analysis-grid">
      ${renderFactorCard("Care", topics.care)}
      ${renderFactorCard("Generosity", topics.generosity)}
      ${renderFactorCard("Profit / Service", topics.profit_service)}
      ${renderFactorCard("Societal Contribution", topics.societal_contribution)}
      ${renderFactorCard("Retention", topics.retention)}
      ${renderFactorCard("Trust", topics.trust)}
      ${renderFactorCard("Nurturing", topics.nurturing)}
      ${renderFactorCard("Indifference", topics.indifference)}
      <article class="analysis-card analysis-wide">
        <h4><span>Compassion Sentiment</span><strong>${escapeHtml(analysis.compassion_sentiment?.overall || "")}</strong></h4>
        <p>${escapeHtml(analysis.compassion_sentiment?.interpretation || "")}</p>
        ${renderList(analysis.compassion_sentiment?.emotions || [])}
      </article>
      ${renderFactorCard("Propensity to Show Care", analysis.propensity_to_show_care, true)}
      ${renderFactorCard("Societal Support", analysis.societal_support, true)}
      ${renderFactorCard("Institutional Support", analysis.institutional_support, true)}
      ${renderFactorCard("Balance", analysis.balance, true)}
      <article class="analysis-card analysis-wide">
        <h4><span>Links, Risks, and Facilitator Notes</span><strong>Review</strong></h4>
        ${renderList([...(analysis.cross_factor_links || []), ...(analysis.risks_or_blind_spots || []), ...(analysis.facilitator_notes || [])])}
      </article>
    </div>
    <section class="animation-panel" id="animationPanel">
      <div>
        <p class="kicker">Animation</p>
        <h4>Generate a moving visual from this response</h4>
        <p>The raw answers and analysed response will both be sent to ComfyUI.</p>
      </div>
      <button class="analysis-action" type="button" id="generateAnimation">Generate animation</button>
      <div class="animation-output" id="animationOutput" aria-live="polite"></div>
    </section>
  `;
  analysisPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showAnalysisPlaceholder() {
  analysisPanel.hidden = false;
  analysisContent.innerHTML = `
    <p class="analysis-summary">
      When the final reflection is complete, generate the analysis to see the factor-by-factor reading here.
    </p>
    <button class="analysis-action" type="button" id="generateAnalysis">Generate analysis</button>
  `;
}

function getClientId() {
  const existingId = localStorage.getItem(clientStorageKey);
  if (existingId) return existingId;

  const newId = crypto.randomUUID();
  localStorage.setItem(clientStorageKey, newId);
  return newId;
}

function createDots() {
  dotsContainer.innerHTML = "";
  dots = views.map(() => {
    const dot = document.createElement("span");
    dotsContainer.append(dot);
    return dot;
  });
}

function boardState() {
  const currentView = views[activeIndex];
  return {
    clientId: getClientId(),
    currentStep: currentView?.dataset.viewTitle || "",
    assignedRole,
    textareas: textareas.map((field) => ({
      id: field.getAttribute("aria-label"),
      value: field.value,
    })),
    votes: radioInputs
      .filter((field) => field.checked)
      .map((field) => ({
        name: field.name,
        value: field.value,
      })),
  };
}

function saveBoard() {
  const state = boardState();
  localStorage.setItem(storageKey, JSON.stringify(state));
  queueDatabaseSave(state);
}

function queueDatabaseSave(state = boardState()) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveToDatabase(state);
  }, 350);
}

async function saveToDatabase(state) {
  try {
    await fetch("/api/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    });
  } catch {
    // Local autosave still preserves responses if the server is unavailable.
  }
}

async function requestAnalysis() {
  if (!validateCurrentView()) return;

  const state = boardState();
  validationMessage.textContent = "Analyzing responses...";
  nextButton.disabled = true;
  const inlineButton = document.querySelector("#generateAnalysis");
  if (inlineButton) inlineButton.disabled = true;

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Unable to analyze responses");
    }
    analysisComplete = true;
    validationMessage.textContent = "Analysis saved.";
    renderAnalysis(result.analysis);
    nextButton.textContent = "Start over";
  } catch (error) {
    validationMessage.textContent = error.message || "Analysis could not be saved.";
  } finally {
    nextButton.disabled = false;
    if (inlineButton) inlineButton.disabled = false;
  }
}

function setAnimationStatus(message, videoUrl = "") {
  const output = document.querySelector("#animationOutput");
  if (!output) return;

  output.innerHTML = videoUrl
    ? `<p>${escapeHtml(message)}</p><video controls playsinline src="${escapeHtml(videoUrl)}"></video>`
    : `<p>${escapeHtml(message)}</p>`;
}

async function pollAnimation(promptId) {
  clearTimeout(animationPollTimer);
  try {
    const response = await fetch(`/api/animation-status?promptId=${encodeURIComponent(promptId)}`);
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Unable to check animation status");
    }

    if (result.status === "completed" && result.outputs?.length) {
      setAnimationStatus("Animation ready.", result.outputs[0].url);
      const button = document.querySelector("#generateAnimation");
      if (button) button.disabled = false;
      return;
    }

    setAnimationStatus("Animation is still rendering in ComfyUI...");
    animationPollTimer = setTimeout(() => pollAnimation(promptId), 5000);
  } catch (error) {
    setAnimationStatus(error.message || "Unable to check animation status.");
    const button = document.querySelector("#generateAnimation");
    if (button) button.disabled = false;
  }
}

async function requestAnimation() {
  if (!latestAnalysis) {
    setAnimationStatus("Generate the analysis first.");
    return;
  }

  const button = document.querySelector("#generateAnimation");
  if (button) button.disabled = true;
  setAnimationStatus("Sending raw responses and analysis to ComfyUI...");

  try {
    const response = await fetch("/api/generate-animation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        response: boardState(),
        analysis: latestAnalysis,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Unable to queue animation");
    }
    setAnimationStatus("Animation queued in ComfyUI. This can take a while locally.");
    pollAnimation(result.promptId);
  } catch (error) {
    setAnimationStatus(error.message || "Animation could not be queued.");
    if (button) button.disabled = false;
  }
}

function randomRole() {
  return roles[Math.floor(Math.random() * roles.length)];
}

function setAssignedRole(role) {
  assignedRole = role;
  document.documentElement.style.setProperty("--witness-color", role.color);
  roleNumber.textContent = role.number;
  roleName.textContent = role.name;
  rolePrompt.textContent = role.prompt;
  roleNameBadges.forEach((badge) => {
    badge.textContent = role.name;
  });
  rolePromptBadges.forEach((badge) => {
    badge.textContent = role.prompt;
  });
  localStorage.setItem(roleStorageKey, String(role.number));
  saveBoard();
}

function loadAssignedRole() {
  const savedNumber = Number(localStorage.getItem(roleStorageKey));
  const savedRole = roles.find((role) => role.number === savedNumber);
  setAssignedRole(savedRole || randomRole());
}

function loadBoard() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    parsed.textareas?.forEach(({ id, value }) => {
      const field = textareas.find((item) => item.getAttribute("aria-label") === id);
      if (field) field.value = value;
    });
    parsed.votes?.forEach(({ name, value }) => {
      const field = radioInputs.find((item) => item.name === name && item.value === value);
      if (field) field.checked = true;
    });
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function setView(index) {
  clearValidation();
  clearTimeout(animationPollTimer);
  analysisComplete = false;
  latestAnalysis = null;
  analysisPanel.hidden = true;
  analysisContent.innerHTML = "";
  activeIndex = Math.max(0, Math.min(index, views.length - 1));
  views.forEach((view, viewIndex) => {
    view.classList.toggle("active", viewIndex === activeIndex);
  });
  dots.forEach((dot, dotIndex) => {
    dot.classList.toggle("active", dotIndex === activeIndex);
  });

  const title = views[activeIndex].dataset.viewTitle || `Step ${activeIndex + 1}`;
  meetingBoard.classList.toggle("stage-mode", activeIndex > 0);
  stepLabel.textContent = `${activeIndex + 1} / ${views.length} ${title}`;
  backButton.disabled = activeIndex === 0;
  nextButton.textContent = activeIndex === views.length - 1 ? "Analyze" : "Next";
  if (activeIndex === views.length - 1) {
    showAnalysisPlaceholder();
  }
  queueDatabaseSave();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearValidation() {
  validationMessage.textContent = "";
  document.querySelectorAll(".missing").forEach((element) => {
    element.classList.remove("missing");
  });
document.querySelectorAll("[aria-invalid='true']").forEach((element) => {
    element.removeAttribute("aria-invalid");
  });
}

document.addEventListener("click", (event) => {
  if (event.target?.id === "generateAnalysis") {
    requestAnalysis();
  }
  if (event.target?.id === "generateAnimation") {
    requestAnimation();
  }
});

function markMissingField(field) {
  field.setAttribute("aria-invalid", "true");
  const wrapper = field.closest("label") || field;
  wrapper.classList.add("missing");
  return field;
}

function validateCurrentView() {
  clearValidation();
  const currentView = views[activeIndex];
  const missingFields = [];

  currentView.querySelectorAll("textarea").forEach((field) => {
    if (!field.value.trim()) {
      missingFields.push(markMissingField(field));
    }
  });

  const radioGroupNames = new Set(
    Array.from(currentView.querySelectorAll('input[type="radio"]')).map((field) => field.name),
  );
  radioGroupNames.forEach((name) => {
    const groupFields = Array.from(currentView.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`));
    if (!groupFields.some((field) => field.checked)) {
      const group = groupFields[0]?.closest(".vote-grid");
      if (group) group.classList.add("missing");
      missingFields.push(groupFields[0]);
    }
  });

  if (missingFields.length > 0) {
    validationMessage.textContent = missingFields.length === 1 ? "Please complete the missing item." : "Please complete the missing items.";
    missingFields[0]?.focus?.();
    return false;
  }

  return true;
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.body.dataset.theme = isDark ? "dark" : "";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  themeToggleText.textContent = isDark ? "Light" : "Dark";
  localStorage.setItem(themeStorageKey, isDark ? "dark" : "light");
}

function toggleTheme() {
  setTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
}

function goToNextView() {
  if (!validateCurrentView()) {
    return;
  }
  if (activeIndex === views.length - 1) {
    if (!analysisComplete) {
      requestAnalysis();
      return;
    }
    setView(0);
    return;
  }
  setView(activeIndex + 1);
}

function goToPreviousView() {
  setView(activeIndex - 1);
}

textareas.forEach((field) =>
  field.addEventListener("input", () => {
    saveBoard();
    clearValidation();
  }),
);
radioInputs.forEach((field) =>
  field.addEventListener("change", () => {
    saveBoard();
    clearValidation();
  }),
);
nextButton.addEventListener("click", goToNextView);
backButton.addEventListener("click", goToPreviousView);
themeToggle.addEventListener("click", toggleTheme);

createDots();
loadBoard();
loadAssignedRole();
setTheme(localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light");
setView(0);
