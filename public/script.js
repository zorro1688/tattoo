const concepts = [
  {
    title: "Clean Concept",
    mood: "Balanced, beginner-friendly, easy to explain to an artist."
  },
  {
    title: "Bold Option",
    mood: "Stronger contrast with a clear central symbol."
  },
  {
    title: "Small Tattoo",
    mood: "Reduced detail for first-time placement and smaller sizes."
  },
  {
    title: "Stencil Draft",
    mood: "Linework-first version for tattoo artist discussion."
  }
];

const idea = document.querySelector("#idea");
const style = document.querySelector("#style");
const placement = document.querySelector("#placement");
const size = document.querySelector("#size");
const complexity = document.querySelector("#complexity");
const promptPreview = document.querySelector("#promptPreview");
const generateButton = document.querySelector("#generateButton");
const generatorForm = document.querySelector("#generatorForm");
const lineworkButton = document.querySelector("#lineworkButton");
const conceptGrid = document.querySelector("#conceptGrid");
const quotaLabel = document.querySelector("#quotaLabel");
const upgradeButton = document.querySelector("#upgradeButton");
const creatorPackButton = document.querySelector("#creatorPackButton");
const yearlyButton = document.querySelector("#yearlyButton");
const billingNotice = document.querySelector("#billingNotice");
const artistBrief = document.querySelector("#artistBrief");
const placementAdvice = document.querySelector("#placementAdvice");
const bodyPreview = document.querySelector("#bodyPreview");
const styleCards = document.querySelectorAll(".style-card");
const heroPreviewPanel = document.querySelector("#heroPreviewPanel");
const heroModeLabel = document.querySelector("#heroModeLabel");
const heroPreviewTitle = document.querySelector("#heroPreviewTitle");
const heroPreviewCopy = document.querySelector("#heroPreviewCopy");
const heroConceptImage = document.querySelector(".hero-preview-image-concept");
const heroLineworkImage = document.querySelector(".hero-preview-image-linework");
const heroPlacementImage = document.querySelector(".hero-preview-image-placement");
const heroPlacementMockup = document.querySelector("#heroPlacementMockup");
const heroPlacementTattoo = document.querySelector("#heroPlacementTattoo");
const heroModeButtons = document.querySelectorAll(".hero-mode-button");
const heroResultSummary = document.querySelector("#heroResultSummary");
const heroPlacementNote = document.querySelector("#heroPlacementNote");
const heroDetails = document.querySelector("#heroDetails");
const heroDetailsGrid = document.querySelector("#heroDetailsGrid");
const heroPromptText = document.querySelector("#heroPromptText");
const downloadConceptButton = document.querySelector("#downloadConceptButton");
const heroLineworkAction = document.querySelector("#heroLineworkAction");
const downloadPlacementButton = document.querySelector("#downloadPlacementButton");
const generateAnotherButton = document.querySelector("#generateAnotherButton");
const priceCards = document.querySelectorAll(".price-card");
const leadForm = document.querySelector("#leadForm");
const leadEmail = document.querySelector("#leadEmail");
const leadStatus = document.querySelector("#leadStatus");

let generated = false;
let linework = false;
let heroMode = "concept";
let selectedPlan = "creator-pack";
let quota = 3;
let generatedPrompt = "";
let generatedPlacementNote = "";
let generatedImages = {};
let currentGenerationId = "";
let isGenerating = false;
let generationError = "";
let lineworkError = "";
let lineworkGenerating = false;
let pendingCheckoutPlan = "";
let downloadAccess = {
  highResolution: false,
  watermarked: true,
  message: "Upgrade to download high-resolution files"
};
let pricingEntitlement = {
  paidRemaining: 0,
  highResolution: false
};
const defaultHeroImages = {
  concept: heroConceptImage?.getAttribute("src") ?? "assets/hero-concept.png",
  linework: heroLineworkImage?.getAttribute("src") ?? "assets/hero-linework.png",
  placement: heroPlacementImage?.getAttribute("src") ?? "assets/hero-placement.png"
};

function buildPrompt() {
  const userIdea = idea.value.trim();

  if (!userIdea) {
    return "Describe your tattoo idea to generate a tattoo-ready prompt.";
  }

  return `${style.value.toLowerCase()} ${size.value.toLowerCase()} tattoo design of ${userIdea}, suitable for ${placement.value.toLowerCase()} placement, ${complexity.value.toLowerCase()}, clean linework, white background, tattoo-ready composition, no skin, no mockup, no text`;
}

function getPlacementGuidance() {
  const place = placement.value;
  const detail = complexity.value;
  const selectedSize = size.value;

  const notes = {
    Wrist: "Keep the design compact and readable. Thin lines work well, but very tiny details should be reduced.",
    Forearm: "Use a vertical composition with enough spacing so the design reads clearly from a distance.",
    "Upper arm": "A medium composition works well here, with room for stronger contrast and more detail.",
    Chest: "Centered or lightly symmetrical layouts usually feel more intentional on the chest.",
    Back: "The back can support larger designs, but the first version should still keep a clear focal point.",
    Ankle: "Small, clean shapes are safer for ankle placement because details can blur at small sizes.",
    Shoulder: "Curved or circular compositions fit the shoulder better than flat square layouts.",
    Rib: "Simple linework is usually easier to place on the rib area, especially for a first tattoo."
  };

  return `${notes[place] ?? notes.Forearm} Recommended direction: ${selectedSize.toLowerCase()} size with ${detail.toLowerCase()} complexity.`;
}

function renderArtistBrief() {
  if (!artistBrief) {
    return;
  }

  if (!generated) {
    artistBrief.innerHTML = `
      <h3>Tattoo artist brief</h3>
      <p>Generate a concept to create a clear note you can bring to a tattoo artist.</p>
    `;
    return;
  }

  artistBrief.innerHTML = `
    <h3>Tattoo artist brief</h3>
    <dl>
      <div><dt>Idea</dt><dd>${escapeHtml(idea.value.trim())}</dd></div>
      <div><dt>Style</dt><dd>${style.value}</dd></div>
      <div><dt>Placement</dt><dd>${placement.value}</dd></div>
      <div><dt>Size</dt><dd>${size.value}</dd></div>
      <div><dt>Complexity</dt><dd>${complexity.value}</dd></div>
    </dl>
    <p>${getPlacementGuidance()}</p>
  `;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateQuota() {
  quotaLabel.textContent = `${quota} generation${quota === 1 ? "" : "s"} available`;
  generateButton.disabled = quota <= 0 || isGenerating;
  generateButton.textContent = isGenerating
    ? "Generating your tattoo..."
    : quota <= 0
      ? "Upgrade to Generate More"
      : "Generate Tattoo Ideas";
}

function normalizeImagePath(url = "") {
  return String(url).replace(/^\/+/, "");
}

function isDefaultHeroImage(type, url = "") {
  return Boolean(
    url &&
      defaultHeroImages[type] &&
      normalizeImagePath(url) === normalizeImagePath(defaultHeroImages[type])
  );
}

function getGeneratedImage(type) {
  const url = generatedImages[type];

  if (!url || isDefaultHeroImage(type, url)) {
    return "";
  }

  return url;
}

function getConceptPreviewImage() {
  return generatedImages.concept || defaultHeroImages.concept;
}

function hasGeneratedLinework() {
  return Boolean(getGeneratedImage("linework"));
}

function getLineworkCopy() {
  if (lineworkGenerating) {
    return "Creating stencil linework from your generated concept. This uses 1 generation credit.";
  }

  if (lineworkError) {
    return lineworkError;
  }

  if (generated && hasGeneratedLinework()) {
    return "Linework ready. Download it as a cleaner stencil-style reference for your tattoo artist.";
  }

  if (generated) {
    return "Linework is not generated yet. Generate a stencil-style version when you need a cleaner artist reference. Uses 1 generation credit.";
  }

  return "Linework is not generated yet. Generate a concept first, then create stencil linework when you need it.";
}

function applyQuota(nextQuota) {
  if (!nextQuota) {
    return;
  }

  quota = Number(nextQuota.totalRemaining ?? quota);
  pricingEntitlement = {
    ...pricingEntitlement,
    paidRemaining: Number(nextQuota.paidRemaining ?? pricingEntitlement.paidRemaining ?? 0),
    highResolution: Boolean(nextQuota.highResolution || pricingEntitlement.highResolution)
  };
  updateQuota();
  renderPricingState();
}

function getResultSummary() {
  return `${style.value} · ${placement.value} · ${size.value}`;
}

function getActiveImageUrl(mode = heroMode) {
  if (mode === "linework") {
    return getGeneratedImage("linework") || getConceptPreviewImage();
  }

  if (mode === "placement") {
    return getGeneratedImage("placement") || getGeneratedImage("linework") || getConceptPreviewImage();
  }

  return getConceptPreviewImage();
}

function triggerDownload(url, filename) {
  if (!url) {
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function downloadImageFile(url, filename) {
  if (!url) {
    return;
  }

  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      throw new Error("Image download failed.");
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, filename);
    URL.revokeObjectURL(objectUrl);
  } catch {
    triggerDownload(url, filename);
  }
}

function getFilenameFromDisposition(disposition, fallback) {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

const downloadTypeParams = {
  concept: "type=concept",
  linework: "type=linework",
  placement: "type=placement"
};

async function downloadGenerationFile(type) {
  if (!currentGenerationId) {
    return;
  }

  const typeParam = downloadTypeParams[type];

  if (!typeParam) {
    return;
  }

  const response = await fetch(
    `/api/download?generationId=${encodeURIComponent(currentGenerationId)}&${typeParam}`
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    billingNotice.textContent = data.error ?? "Could not download this file.";
    return;
  }

  const blob = await response.blob();
  const filename = getFilenameFromDisposition(
    response.headers.get("content-disposition"),
    `inkfirst-${type}.png`
  );
  const objectUrl = URL.createObjectURL(blob);
  triggerDownload(objectUrl, filename);
  URL.revokeObjectURL(objectUrl);

  if (!downloadAccess.highResolution) {
    billingNotice.textContent = downloadAccess.message;
  }
}

function drawWatermark(context, canvasWidth, canvasHeight) {
  const label = "InkFirst";
  const fontSize = Math.max(24, Math.round(canvasWidth * 0.045));
  context.save();
  context.globalAlpha = 0.72;
  context.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
  context.fillStyle = "rgba(29, 29, 31, 0.62)";
  context.textAlign = "right";
  context.textBaseline = "bottom";
  context.fillText(label, canvasWidth - 28, canvasHeight - 24);
  context.restore();
}

async function downloadWatermarkedImage(url, filename) {
  if (!url) {
    return;
  }

  try {
    const image = await loadDrawableImage(url);
    const canvas = document.createElement("canvas");
    const maxSize = 900;
    const ratio = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight, 1);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    drawWatermark(context, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        downloadImageFile(url, filename);
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, filename);
      URL.revokeObjectURL(objectUrl);
    }, "image/png");
  } catch {
    downloadImageFile(url, filename);
  }
}

function loadDrawableImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function getPlacementTattooBox(canvasSize) {
  const sizeScale = {
    small: 0.18,
    medium: 0.25,
    large: 0.33
  };
  const placementMap = {
    wrist: { x: 0.42, y: 0.76, rotation: -8, scale: 0.78 },
    ankle: { x: 0.42, y: 0.76, rotation: -8, scale: 0.78 },
    shoulder: { x: 0.56, y: 0.43, rotation: -6, scale: 1.18 },
    chest: { x: 0.56, y: 0.43, rotation: -6, scale: 1.18 },
    back: { x: 0.56, y: 0.43, rotation: -6, scale: 1.18 },
    rib: { x: 0.56, y: 0.43, rotation: -6, scale: 1.18 },
    forearm: { x: 0.54, y: 0.53, rotation: -8, scale: 1 },
    "upper-arm": { x: 0.54, y: 0.53, rotation: -8, scale: 1 }
  };
  const selectedPlacement = normalizeDataValue(placement.value);
  const selectedSize = normalizeDataValue(size.value);
  const box = placementMap[selectedPlacement] ?? placementMap.forearm;
  const width = canvasSize * (sizeScale[selectedSize] ?? sizeScale.small) * box.scale;

  return {
    ...box,
    width,
    height: width
  };
}

async function downloadPlacementPreview() {
  if (!generated) {
    return;
  }

  const skinUrl = "assets/hero-forearm-clean.png";
  const tattooUrl = generatedImages.linework || generatedImages.concept || defaultHeroImages.concept;

  try {
    const [skinImage, tattooImage] = await Promise.all([
      loadDrawableImage(skinUrl),
      loadDrawableImage(tattooUrl)
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = downloadAccess.highResolution ? 1200 : 900;
    canvas.height = downloadAccess.highResolution ? 1200 : 900;
    const context = canvas.getContext("2d");
    const cropSize = Math.min(skinImage.naturalWidth, skinImage.naturalHeight);
    const cropX = (skinImage.naturalWidth - cropSize) / 2;
    const cropY = (skinImage.naturalHeight - cropSize) / 2;
    context.drawImage(skinImage, cropX, cropY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);

    const tattooBox = getPlacementTattooBox(canvas.width);
    context.save();
    context.globalAlpha = 0.82;
    context.translate(canvas.width * tattooBox.x, canvas.height * tattooBox.y);
    context.rotate((tattooBox.rotation * Math.PI) / 180);
    context.filter = "grayscale(1) contrast(1.18)";
    context.globalCompositeOperation = "multiply";
    context.drawImage(
      tattooImage,
      -tattooBox.width / 2,
      -tattooBox.height / 2,
      tattooBox.width,
      tattooBox.height
    );
    context.restore();
    if (!downloadAccess.highResolution) {
      drawWatermark(context, canvas.width, canvas.height);
      billingNotice.textContent = downloadAccess.message;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        downloadImageFile(tattooUrl, "inkfirst-placement-reference.png");
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(
        objectUrl,
        downloadAccess.highResolution
          ? "inkfirst-placement-preview.png"
          : "inkfirst-placement-preview-watermarked.png"
      );
      URL.revokeObjectURL(objectUrl);
    }, "image/png");
  } catch {
    downloadImageFile(tattooUrl, "inkfirst-placement-reference.png");
  }
}

function resetGeneratedResult() {
  generated = false;
  generatedPrompt = "";
  generatedPlacementNote = "";
  generatedImages = {};
  currentGenerationId = "";
  generationError = "";
  lineworkError = "";
  lineworkGenerating = false;
}

function normalizeDataValue(value = "") {
  return value.toLowerCase().replaceAll(" ", "-");
}

function updatePlacementPreview() {
  if (!heroPlacementMockup || !heroPlacementTattoo) {
    return;
  }

  const tattooImage = getGeneratedImage("linework") || getConceptPreviewImage();
  heroPlacementMockup.dataset.placement = normalizeDataValue(placement.value);
  heroPlacementMockup.dataset.size = normalizeDataValue(size.value);
  heroPlacementTattoo.src = tattooImage;
  heroPlacementTattoo.alt = generated
    ? `${style.value} tattoo placement preview for ${placement.value}`
    : "Example tattoo placement preview";
}

async function loadQuota() {
  try {
    const response = await fetch("/api/quota");
    const data = await response.json();
    if (response.ok) {
      applyQuota(data.quota);
    }
  } catch {
    updateQuota();
  }
}

async function loadDownloadAccess() {
  try {
    const response = await fetch("/api/download-access");
    const data = await response.json();

    if (response.ok && data.downloadAccess) {
      downloadAccess = data.downloadAccess;
      pricingEntitlement = {
        ...pricingEntitlement,
        highResolution: Boolean(data.downloadAccess.highResolution)
      };
      renderHeroPreview();
      renderPricingState();
    }
  } catch {
    renderHeroPreview();
    renderPricingState();
  }
}

function renderPrompt() {
  promptPreview.innerHTML = `<strong>Prompt preview:</strong> ${generatedPrompt || buildPrompt()}`;
  if (placementAdvice) {
    placementAdvice.textContent = generated
      ? generatedPlacementNote || getPlacementGuidance()
      : "Generate a concept to preview placement guidance.";
  }
  if (bodyPreview) {
    bodyPreview.dataset.placement = placement.value.toLowerCase().replaceAll(" ", "-");
  }
  renderArtistBrief();
  renderHeroPreview();
}

function renderHeroPreview() {
  const modeCopy = {
    concept: {
      label: "Concept",
      title: "Generated tattoo concept",
      copy: generated
        ? `${style.value} direction for "${idea.value.trim()}," prepared for ${placement.value.toLowerCase()} placement.`
        : "A first direction for your idea. Generate once, then switch views to inspect linework or placement."
    },
    linework: {
      label: "Linework / Stencil",
      title: "Clean linework reference",
      copy: getLineworkCopy()
    },
    placement: {
      label: "Placement",
      title: "Body placement preview",
      copy: generated
        ? generatedPlacementNote || getPlacementGuidance()
        : "Placement preview shows how size and body location change the design."
    }
  };

  const state = modeCopy[heroMode] ?? modeCopy.concept;
  heroPreviewPanel.classList.remove(
    "mode-concept",
    "mode-linework",
    "mode-placement",
    "is-generating",
    "is-error",
    "is-generated"
  );
  const blockingError = Boolean(generationError && !generated);

  heroPreviewPanel.classList.add(`mode-${heroMode}`);
  heroPreviewPanel.classList.toggle("is-generating", isGenerating || lineworkGenerating);
  heroPreviewPanel.classList.toggle("is-error", blockingError);
  heroPreviewPanel.classList.toggle("is-generated", generated);
  heroModeLabel.textContent = state.label;
  heroPreviewTitle.textContent = state.title;
  heroPreviewCopy.textContent = isGenerating
    ? "Generating your tattoo..."
    : blockingError
      ? generationError
      : heroMode === "linework" && lineworkError
        ? lineworkError
        : state.copy;
  if (heroConceptImage) {
    heroConceptImage.src = getConceptPreviewImage();
  }
  if (heroLineworkImage) {
    heroLineworkImage.src = getGeneratedImage("linework") || getConceptPreviewImage();
  }
  if (heroPlacementImage?.tagName === "IMG") {
    heroPlacementImage.src =
      getGeneratedImage("placement") || getGeneratedImage("linework") || getConceptPreviewImage();
  }
  updatePlacementPreview();

  heroModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === heroMode);
  });

  if (heroResultSummary) {
    heroResultSummary.textContent = generated || isGenerating ? getResultSummary() : "Fine line · Forearm · Small";
  }

  if (heroPlacementNote) {
    heroPlacementNote.textContent = generated
      ? `Placement note: ${generatedPlacementNote || getPlacementGuidance()}`
      : "Placement note: Generate a concept to see placement guidance for your tattoo idea.";
  }

  if (heroDetailsGrid) {
    heroDetailsGrid.innerHTML = `
      <div><dt>Idea</dt><dd>${escapeHtml(idea.value.trim() || "Not set")}</dd></div>
      <div><dt>Style</dt><dd>${escapeHtml(style.value)}</dd></div>
      <div><dt>Placement</dt><dd>${escapeHtml(placement.value)}</dd></div>
      <div><dt>Size</dt><dd>${escapeHtml(size.value)}</dd></div>
      <div><dt>Complexity</dt><dd>${escapeHtml(complexity.value)}</dd></div>
    `;
  }

  if (heroPromptText) {
    heroPromptText.textContent = generatedPrompt || buildPrompt();
  }

  if (downloadConceptButton) {
    downloadConceptButton.disabled = (!generatedImages.concept && !blockingError) || isGenerating;
    downloadConceptButton.textContent = blockingError
      ? "Try again"
      : downloadAccess.highResolution
        ? "Download high-res concept"
        : "Download watermarked concept";
    downloadConceptButton.title = downloadAccess.highResolution ? "" : downloadAccess.message;
  }

  if (heroLineworkAction) {
    const hasLinework = hasGeneratedLinework();
    heroLineworkAction.disabled = !generated || lineworkGenerating || isGenerating;
    heroLineworkAction.textContent = lineworkGenerating
      ? "Creating stencil linework..."
      : lineworkError
        ? "Try linework again"
      : hasLinework
        ? downloadAccess.highResolution
          ? "Download high-res linework"
          : "Download watermarked linework"
        : quota <= 0
          ? "Upgrade for linework"
          : "Generate linework";
    heroLineworkAction.title = hasLinework
      ? downloadAccess.highResolution
        ? ""
        : downloadAccess.message
      : generated
        ? "Uses 1 generation credit"
        : "Generate a concept first";
  }

  if (downloadPlacementButton) {
    downloadPlacementButton.disabled = !generated || isGenerating;
    downloadPlacementButton.textContent = downloadAccess.highResolution
      ? "Download high-res placement"
      : "Download watermarked placement";
    downloadPlacementButton.title = downloadAccess.highResolution ? "" : downloadAccess.message;
  }
}

function selectPlan(plan) {
  selectedPlan = plan;

  const planLabels = {
    free: "Free is selected. Start with 3 generations per day.",
    "creator-pack": "Creator Pack is selected. Best for one tattoo idea.",
    "pro-monthly": "Pro Monthly is selected. Best for serious tattoo planning.",
    "pro-yearly": "Pro Yearly is selected. Best value for multiple tattoo ideas."
  };

  priceCards.forEach((card) => {
    const isSelected = card.dataset.plan === selectedPlan;
    card.classList.toggle("selected", isSelected);
    card.dataset.badge = card.dataset.plan === "creator-pack" ? "Recommended" : "Selected";
  });

  billingNotice.textContent = planLabels[selectedPlan] ?? planLabels["creator-pack"];
}

function renderPricingState() {
  const hasPaidAccess = Boolean(downloadAccess.highResolution || pricingEntitlement.highResolution);
  const paidCredits = Number(pricingEntitlement.paidRemaining ?? 0);
  const creatorCard = document.querySelector('.price-card[data-plan="creator-pack"]');

  if (creatorCard) {
    creatorCard.classList.toggle("active-plan", hasPaidAccess);
    creatorCard.dataset.badge = hasPaidAccess ? "Active" : "Recommended";
  }

  if (creatorPackButton) {
    creatorPackButton.textContent = hasPaidAccess ? "Creator Pack active" : "Buy Creator Pack";
    creatorPackButton.disabled = hasPaidAccess;
    creatorPackButton.setAttribute("aria-disabled", String(hasPaidAccess));
  }

  if (hasPaidAccess && billingNotice) {
    const creditCopy = paidCredits === 1 ? "1 credit available" : `${paidCredits} credits available`;
    billingNotice.textContent = `High-resolution downloads unlocked. ${creditCopy}.`;
  }
}

function artMarkup(index) {
  return `
    <div class="artboard">
      <div class="tattoo-art" style="transform: rotate(${index % 2 === 0 ? "-8deg" : "6deg"}) scale(${1 - index * 0.035})">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="art-label">#${index + 1}</div>
      ${generated ? "" : '<div class="locked">Generate to preview this concept</div>'}
    </div>
  `;
}

function renderConcepts() {
  if (!conceptGrid) {
    return;
  }

  conceptGrid.classList.toggle("linework", linework);
  conceptGrid.innerHTML = concepts
    .map(
      (concept, index) => `
        <article class="concept-card">
          ${artMarkup(index)}
          <h3>${concept.title}</h3>
          <p>${concept.mood}</p>
          <button class="download-button" data-index="${index}">Download</button>
        </article>
      `
    )
    .join("");
}

function downloadConcept(index) {
  const text = [
    "InkFirst tattoo reference",
    `Concept: ${concepts[index].title}`,
    `Idea: ${idea.value.trim()}`,
    `Style: ${style.value}`,
    `Placement: ${placement.value}`,
    `Size: ${size.value}`,
    `Complexity: ${complexity.value}`,
    `Mode: ${linework ? "Linework" : "Concept"}`,
    `Placement note: ${getPlacementGuidance()}`,
    `Prompt: ${buildPrompt()}`
  ].join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tattoo-${index + 1}-${linework ? "linework" : "concept"}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function generate() {
  if (quota <= 0) {
    billingNotice.textContent = "Free quota is used up. Upgrade to unlock more tattoo ideas.";
    return;
  }

  if (!idea.value.trim()) {
    promptPreview.innerHTML = "<strong>Prompt preview:</strong> Describe your tattoo idea first.";
    idea.focus();
    return;
  }

  isGenerating = true;
  generationError = "";
  lineworkError = "";
  heroMode = "concept";
  renderHeroPreview();
  updateQuota();
  promptPreview.innerHTML = "<strong>Prompt preview:</strong> Creating your tattoo reference...";

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        idea: idea.value.trim(),
        style: style.value,
        placement: placement.value,
        size: size.value,
        complexity: complexity.value
      })
    });
    const data = await response.json();
    applyQuota(data.quota);

    if (!response.ok) {
      throw new Error(data.error ?? "Generation failed.");
    }

    generated = true;
    generatedPrompt = data.prompt ?? buildPrompt();
    generatedPlacementNote = data.placementNote ?? getPlacementGuidance();
    generatedImages = data.images ?? {};
    currentGenerationId = data.savedGenerationId ?? "";
    renderConcepts();
    renderPrompt();
  } catch (error) {
    generationError = error.message ?? "Generation failed. Try again.";
    promptPreview.innerHTML = `<strong>Prompt preview:</strong> ${escapeHtml(error.message ?? "Generation failed. Try again.")}`;
  } finally {
    isGenerating = false;
    updateQuota();
    renderHeroPreview();
  }
}

async function generateLinework() {
  if (!generated || !currentGenerationId || hasGeneratedLinework() || lineworkGenerating) {
    return;
  }

  if (quota <= 0) {
    billingNotice.textContent = "Linework uses 1 generation credit. Upgrade to create stencil linework.";
    return;
  }

  lineworkError = "";
  lineworkGenerating = true;
  heroMode = "linework";
  linework = true;
  renderHeroPreview();
  promptPreview.innerHTML = "<strong>Prompt preview:</strong> Creating clean tattoo linework...";

  try {
    const response = await fetch("/api/generate/linework", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        generationId: currentGenerationId
      })
    });
    const data = await response.json();
    applyQuota(data.quota);

    if (!response.ok) {
      throw new Error(data.error ?? "Could not create linework. Try again.");
    }

    generatedImages = {
      ...generatedImages,
      linework: data.images?.linework ?? data.generation?.images?.linework ?? generatedImages.linework
    };
    generatedPrompt = data.prompt ?? generatedPrompt;
    generationError = "";
    lineworkError = "";
    renderHeroPreview();
    renderConcepts();
  } catch (error) {
    lineworkError = error.message ?? "Could not create linework. Try again.";
    promptPreview.innerHTML = `<strong>Prompt preview:</strong> ${escapeHtml(error.message ?? "Could not create linework. Try again.")}`;
  } finally {
    lineworkGenerating = false;
    updateQuota();
    renderHeroPreview();
  }
}

async function checkout(plan = "pro") {
  selectPlan(plan);
  billingNotice.textContent = "Checking account status...";

  try {
    const signedIn = await ensureSignedInForCheckout();

    if (!signedIn) {
      pendingCheckoutPlan = plan;
      return;
    }

    pendingCheckoutPlan = "";
    billingNotice.textContent = "Opening checkout...";
    const response = await fetch(`/api/billing/checkout?plan=${encodeURIComponent(plan)}`);
    const data = await response.json();

    if (response.ok && data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }

    billingNotice.textContent = data.error ?? "Checkout is not configured yet.";
  } catch {
    billingNotice.textContent = "Run the local server to test checkout.";
  }
}

async function ensureSignedInForCheckout() {
  const response = await fetch("/api/auth/session");
  const data = await response.json().catch(() => ({}));

  if (response.ok && data.authenticated) {
    return true;
  }

  const message = "Sign in before upgrading so your credits and download access stay with your account.";
  billingNotice.textContent = message;

  if (window.InkFirstAuth?.open) {
    window.InkFirstAuth.open(message);
  }

  return false;
}

window.addEventListener("inkfirst:auth-state-changed", (event) => {
  if (!event.detail?.authenticated || !pendingCheckoutPlan) {
    return;
  }

  const plan = pendingCheckoutPlan;
  pendingCheckoutPlan = "";
  checkout(plan);
});

function cleanCheckoutUrl(params) {
  params.delete("checkout");
  params.delete("plan");
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", nextUrl);
}

function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("checkout");
  const plan = params.get("plan") || "creator-pack";

  if (status !== "success") {
    return false;
  }

  selectPlan(plan);
  billingNotice.textContent = "Payment successful. Refreshing your credits...";
  loadQuota().then(() => {
    billingNotice.textContent =
      "Payment successful. Your credits will appear here once Creem confirms the payment.";
  });
  cleanCheckoutUrl(params);
  document.querySelector("#pricing")?.scrollIntoView({ behavior: "smooth" });

  return true;
}

[idea, style, placement, size, complexity].forEach((element) => {
  const handleChange = () => {
    resetGeneratedResult();
    renderPrompt();
  };

  element.addEventListener("input", handleChange);
  element.addEventListener("change", handleChange);
});

if (downloadConceptButton) {
  downloadConceptButton.addEventListener("click", () => {
    if (generationError && !generated) {
      generate();
      return;
    }

    downloadGenerationFile("concept");
  });
}

if (heroLineworkAction) {
  heroLineworkAction.addEventListener("click", () => {
    if (hasGeneratedLinework()) {
      downloadGenerationFile("linework");
      return;
    }

    generateLinework();
  });
}

if (downloadPlacementButton) {
  downloadPlacementButton.addEventListener("click", () => {
    downloadGenerationFile("placement");
  });
}

if (generateAnotherButton) {
  generateAnotherButton.addEventListener("click", () => {
    resetGeneratedResult();
    if (heroDetails) {
      heroDetails.open = false;
    }
    renderPrompt();
    idea.focus();
  });
}

generatorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  generate();
});
if (lineworkButton) {
  lineworkButton.addEventListener("click", () => {
    linework = !linework;
    lineworkButton.textContent = linework ? "Concept" : "Linework";
    renderConcepts();
  });
}

if (conceptGrid) {
  conceptGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".download-button");
    if (button) {
      downloadConcept(Number(button.dataset.index));
    }
  });
}
priceCards.forEach((card) => {
  card.addEventListener("click", (event) => {
    const plan = card.dataset.plan;
    if (!plan) {
      return;
    }
    selectPlan(plan);

    if (plan === "free" && !event.target.closest(".price-button")) {
      document.querySelector("#generator").scrollIntoView({ behavior: "smooth" });
    }
  });
});

upgradeButton.addEventListener("click", () => checkout("pro-monthly"));
creatorPackButton.addEventListener("click", () => checkout("creator-pack"));
yearlyButton.addEventListener("click", () => checkout("pro-yearly"));

heroModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    heroMode = button.dataset.mode ?? "concept";
    linework = heroMode === "linework";
    renderHeroPreview();
    renderConcepts();
    if (heroMode === "linework") {
      generateLinework();
    }
  });
});

styleCards.forEach((card) => {
  card.addEventListener("click", () => {
    const selectedStyle = card.dataset.style;
    if (selectedStyle) {
      style.value = selectedStyle;
      generated = false;
      currentGenerationId = "";
      renderPrompt();
      renderConcepts();
      document.querySelector("#generator").scrollIntoView({ behavior: "smooth" });
    }
  });
});

if (leadForm) {
  leadForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = leadEmail.value.trim();

    if (!leadEmail.checkValidity()) {
      leadStatus.textContent = "Enter a valid email address to get tattoo ideas.";
      leadEmail.focus();
      return;
    }

    localStorage.setItem("inkfirst-lead-email", email);
    leadStatus.textContent = "You're on the list. We'll send tattoo inspiration soon.";
    leadForm.reset();
  });
}

renderPrompt();
renderConcepts();
updateQuota();
renderHeroPreview();
selectPlan(selectedPlan);
if (!handleCheckoutReturn()) {
  loadQuota();
}
loadDownloadAccess();
