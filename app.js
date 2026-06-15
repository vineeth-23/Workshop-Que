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
    <section class="poster-panel" id="posterPanel">
      <div>
        <p class="kicker">Poster</p>
        <h4>Generate a poster from this response</h4>
        <p>Ideogram renders a symbolic image on Comfy Cloud; the participant summary is overlaid as crisp text.</p>
      </div>
      <button class="analysis-action" type="button" id="generatePoster">Generate poster</button>
      <div class="poster-output" id="posterOutput" aria-live="polite"></div>
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

function setPosterStatus(message) {
  const output = document.querySelector("#posterOutput");
  if (!output) return;
  const status = output.querySelector(".poster-status");
  if (status) {
    status.textContent = message;
  } else {
    output.innerHTML = `<p class="poster-status">${escapeHtml(message)}</p>`;
  }
}

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  String(text || "")
    .split(/\n+/)
    .forEach((paragraph) => {
      let line = "";
      paragraph.split(/\s+/).forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      });
      if (line) lines.push(line);
    });
  return lines;
}

const WORD_STOPWORDS = new Set(
  ("the a an and or but of to in on for with as is are be been being this that these those they them their it its " +
   "we our you your i me my he she his her not no yes can could would should will may might do does did done has have " +
   "had who whom which what when where why how than then so such more most very also into from by at if about across " +
   "over under between within without participant response responses answer answers system systems")
    .split(" "),
);

const CLOUD_PALETTE = {
  warm: ["#b6533e", "#a8472f", "#bd7a24"],
  cool: ["#33697a", "#5a6b70", "#744a74"],
  topic: ["#6b743f", "#566b3a"],
  emotion: ["#bd7a24", "#c98a3a"],
  neutral: ["#5b5550", "#736b62"],
};

// Which palette family a matching_topic factor belongs to.
const FACTOR_GROUP = {
  care: "warm",
  trust: "warm",
  generosity: "warm",
  nurturing: "warm",
  societal_contribution: "topic",
  profit_service: "neutral",
  retention: "cool",
  indifference: "cool",
};

function salientWords(text, limit) {
  const counts = new Map();
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .forEach((word) => {
      if (word.length < 4 || WORD_STOPWORDS.has(word)) return;
      counts.set(word, (counts.get(word) || 0) + 1);
    });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// The first meaningful word of a label, lightly stemmed — used to collapse
// near-duplicates like "care", "care for others", "care and repair".
function rootToken(label) {
  const tokens = String(label)
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const token of tokens) {
    if (token.length > 2 && !WORD_STOPWORDS.has(token)) return token.replace(/s$/, "");
  }
  return tokens[0] || "";
}

// Gather words + weights + colors from every part of the analysis.
function buildWordItems(analysis) {
  const items = [];
  const seen = new Set();
  const usedRoots = new Set();
  const add = (text, weight, group) => {
    const label = String(text || "").trim();
    const key = label.toLowerCase();
    if (label.length < 2 || seen.has(key)) return;
    const root = rootToken(label);
    if (root && usedRoots.has(root)) return; // skip words sharing a leading root (care / care for others / ...)
    seen.add(key);
    if (root) usedRoots.add(root);
    const palette = CLOUD_PALETTE[group] || CLOUD_PALETTE.neutral;
    items.push({ label, weight, color: palette[items.length % palette.length] });
  };

  const topics = analysis.matching_topic || {};
  Object.entries(topics).forEach(([key, factor]) => {
    const score = factor && typeof factor.score === "number" ? factor.score : null;
    if (score == null) return;
    const name = key.replace(/_/g, " ");
    add(name, score, FACTOR_GROUP[key] || "neutral");
  });

  [
    ["propensity_to_show_care", "care for others"],
    ["societal_support", "societal support"],
    ["institutional_support", "institutional support"],
    ["balance", "balance"],
  ].forEach(([key, name]) => {
    const factor = analysis[key];
    if (factor && typeof factor.score === "number") add(name, factor.score, "neutral");
  });

  (analysis.dominant_topics || []).slice(0, 6).forEach((topic, i) => add(topic, 64 - i * 5, "topic"));
  (analysis.compassion_sentiment?.emotions || []).slice(0, 6).forEach((emotion, i) => add(emotion, 52 - i * 4, "emotion"));
  salientWords(analysis.participant_summary, 10).forEach(([word, count]) => add(word, 22 + Math.min(count, 4) * 7, "neutral"));

  return items;
}

function boxesOverlap(a, b, gap) {
  return !(a.x + a.w + gap < b.x || b.x + b.w + gap < a.x || a.y + a.h + gap < b.y || b.y + b.h + gap < a.y);
}

// Archimedean-spiral packing: largest words near the centre, smaller ones spiral outward.
function packWords(ctx, items, areaW, areaH) {
  const placed = [];
  const cx = areaW / 2;
  const cy = areaH / 2;
  const gap = Math.max(2, areaW * 0.006);
  items
    .slice()
    .sort((a, b) => b.fontSize - a.fontSize)
    .forEach((item) => {
      ctx.font = `700 ${item.fontSize}px Georgia, serif`;
      const w = ctx.measureText(item.label).width;
      const h = item.fontSize;
      for (let t = 0; t < 4000; t += 1) {
        const r = areaW * 0.012 * t * 0.18;
        const angle = t * 0.45;
        const x = cx + r * Math.cos(angle) - w / 2;
        const y = cy + r * Math.sin(angle) - h / 2;
        if (x < 0 || y < 0 || x + w > areaW || y + h > areaH) continue;
        const box = { x, y, w, h };
        if (!placed.some((p) => boxesOverlap(p, box, gap))) {
          item.box = box;
          placed.push(box);
          break;
        }
      }
    });
}

function renderPoster(imageUrl) {
  const output = document.querySelector("#posterOutput");
  if (!output) return;

  const analysis = latestAnalysis || {};
  const role = assignedRole?.name || "Participant";
  const image = new Image();
  image.crossOrigin = "anonymous";

  image.onload = () => {
    const width = image.naturalWidth || 832;
    const imageHeight = image.naturalHeight || 1248;
    const scale = width / 832;
    const pad = Math.round(width * 0.07);
    const headerHeight = Math.round(width * 0.11);
    const cloudHeight = Math.round(width * 1.0);

    // Size each word: weight (score 0-100 / derived) -> font size.
    const items = buildWordItems(analysis);
    const weights = items.map((it) => it.weight);
    const wMin = Math.min(...weights, 18);
    const wMax = Math.max(...weights, 96);
    const minFont = 15 * scale;
    const maxFont = 58 * scale;
    items.forEach((it) => {
      const norm = (it.weight - wMin) / Math.max(1, wMax - wMin);
      it.fontSize = Math.round(minFont + norm * (maxFont - minFont));
    });

    const measure = document.createElement("canvas").getContext("2d");
    packWords(measure, items, width - pad * 2, cloudHeight);

    const bandHeight = headerHeight + cloudHeight + pad;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = imageHeight + bandHeight;
    const ctx = canvas.getContext("2d");

    // Artwork
    ctx.drawImage(image, 0, 0, width, imageHeight);

    // Parchment band + accent rule
    ctx.fillStyle = "#efe7d6";
    ctx.fillRect(0, imageHeight, width, bandHeight);
    ctx.fillStyle = "#b6533e";
    ctx.fillRect(0, imageHeight, width, Math.max(4, Math.round(width * 0.006)));

    // Header
    ctx.textBaseline = "top";
    ctx.fillStyle = "#2a2622";
    ctx.font = `700 ${Math.round(width * 0.04)}px Georgia, serif`;
    ctx.fillText(`Answered as ${role}`, pad, imageHeight + pad);

    // Word cloud
    const cloudTop = imageHeight + headerHeight;
    ctx.textBaseline = "top";
    items.forEach((item) => {
      if (!item.box) return;
      ctx.font = `700 ${item.fontSize}px Georgia, serif`;
      ctx.fillStyle = item.color;
      ctx.fillText(item.label, pad + item.box.x, cloudTop + item.box.y);
    });

    output.innerHTML = "";

    const makeDownload = (label, filename) => {
      const link = document.createElement("a");
      link.textContent = label;
      link.className = "analysis-action";
      link.download = filename;
      return link;
    };
    const makeItem = (title, mediaEl, downloadEl) => {
      const item = document.createElement("figure");
      item.className = "poster-item";
      const caption = document.createElement("figcaption");
      caption.className = "poster-caption";
      caption.textContent = title;
      const actions = document.createElement("div");
      actions.className = "poster-actions";
      actions.appendChild(downloadEl);
      item.append(caption, mediaEl, actions);
      return item;
    };

    // 1) Image — the bare AI artwork
    const bareImage = document.createElement("img");
    bareImage.className = "poster-canvas";
    bareImage.alt = "Generated image";
    bareImage.src = imageUrl;
    const imageDownload = makeDownload("Download image", "stories-we-tell-image.png");
    imageDownload.href = imageUrl;

    // 2) Image + Text — the artwork with the word cloud overlaid
    canvas.classList.add("poster-canvas");
    const posterDownload = makeDownload("Download image + text", "stories-we-tell-poster.png");
    canvas.toBlob((blob) => {
      if (blob) posterDownload.href = URL.createObjectURL(blob);
    }, "image/png");

    output.append(
      makeItem("Image", bareImage, imageDownload),
      makeItem("Image + Text", canvas, posterDownload),
    );
  };

  image.onerror = () => setPosterStatus("The image was generated but could not be loaded.");
  image.src = imageUrl;
}

async function pollImage(promptId) {
  clearTimeout(animationPollTimer);
  try {
    const response = await fetch(`/api/image-status?promptId=${encodeURIComponent(promptId)}`);
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Unable to check generation status");
    }

    if (result.status === "completed" && result.outputs?.length) {
      setPosterStatus("Poster ready.");
      renderPoster(result.outputs[0].url);
      const button = document.querySelector("#generatePoster");
      if (button) button.disabled = false;
      return;
    }

    if (result.status === "failed") {
      throw new Error(result.error || "Comfy Cloud could not generate the image");
    }

    setPosterStatus("Generating the image on Comfy Cloud...");
    animationPollTimer = setTimeout(() => pollImage(promptId), 4000);
  } catch (error) {
    setPosterStatus(error.message || "Unable to check generation status.");
    const button = document.querySelector("#generatePoster");
    if (button) button.disabled = false;
  }
}

async function requestImage() {
  if (!latestAnalysis) {
    setPosterStatus("Generate the analysis first.");
    return;
  }

  const button = document.querySelector("#generatePoster");
  if (button) button.disabled = true;
  setPosterStatus("Sending the response to Comfy Cloud...");

  try {
    const response = await fetch("/api/generate-image", {
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
      throw new Error(result.error || "Unable to queue image");
    }
    setPosterStatus("Queued on Comfy Cloud. Generating the image...");
    pollImage(result.promptId);
  } catch (error) {
    setPosterStatus(error.message || "Image could not be queued.");
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
  if (event.target?.id === "generatePoster") {
    requestImage();
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
