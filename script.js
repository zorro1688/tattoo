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
const advancedPrompt = document.querySelector("#advancedPrompt");
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
const heroPlacementSkin = document.querySelector("#heroPlacementSkin");
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
const conceptCandidateStrip = document.querySelector("#conceptCandidateStrip");
const regenerateConceptButton = document.querySelector("#regenerateConceptButton");
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
let conceptCandidates = [];
let selectedConceptIndex = 0;
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

const placementSkinAssets = {
  forearm: "assets/placement-forearm.jpg",
  wrist: "assets/placement-wrist.jpg",
  "upper-arm": "assets/placement-upper-arm.jpg",
  chest: "assets/placement-chest.jpg",
  back: "assets/placement-back.jpg",
  ankle: "assets/placement-ankle.jpg",
  shoulder: "assets/placement-shoulder.jpg",
  rib: "assets/placement-rib.jpg"
};
const placementTattooFits = {
  forearm: { x: 0.54, y: 0.55, rotation: -7, scale: 1.18, squash: 0.9 },
  wrist: { x: 0.48, y: 0.58, rotation: -4, scale: 1.05, squash: 0.86 },
  "upper-arm": { x: 0.53, y: 0.46, rotation: -5, scale: 1.18, squash: 0.9 },
  chest: { x: 0.5, y: 0.59, rotation: 0, scale: 1.2, squash: 0.95 },
  back: { x: 0.5, y: 0.43, rotation: 0, scale: 1.28, squash: 0.95 },
  ankle: { x: 0.5, y: 0.58, rotation: -3, scale: 1.05, squash: 0.86 },
  shoulder: { x: 0.58, y: 0.34, rotation: -8, scale: 1.25, squash: 0.9 },
  rib: { x: 0.57, y: 0.5, rotation: 5, scale: 1.12, squash: 0.86 }
};

function getPlacementTattooFit(value = "Forearm") {
  const key = normalizeDataValue(value);
  return placementTattooFits[key] ?? placementTattooFits.forearm;
}

function applyPlacementTattooFit(mockupElement, placementValue = "Forearm") {
  if (!mockupElement) {
    return;
  }

  const fit = getPlacementTattooFit(placementValue);
  mockupElement.style.setProperty("--tattoo-x", `${Math.round(fit.x * 100)}%`);
  mockupElement.style.setProperty("--tattoo-y", `${Math.round(fit.y * 100)}%`);
  mockupElement.style.setProperty("--tattoo-rotation", `${fit.rotation}deg`);
  mockupElement.style.setProperty("--tattoo-fit-scale", String(fit.scale));
  mockupElement.style.setProperty("--tattoo-squash", String(fit.squash));
}
const transparentTattooCache = new Map();

function getPlacementSkinAsset(value = "Forearm") {
  const key = normalizeDataValue(value);
  return placementSkinAssets[key] ?? placementSkinAssets.forearm;
}

function backgroundDistance(red, green, blue, background) {
  return Math.abs(red - background.red) + Math.abs(green - background.green) + Math.abs(blue - background.blue);
}

function estimateTattooBackgroundColor(data, width, height) {
  const samplePoints = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)]
  ];
  const samples = [];

  samplePoints.forEach(([x, y]) => {
    const safeX = Math.max(0, Math.min(width - 1, x));
    const safeY = Math.max(0, Math.min(height - 1, y));
    const index = (safeY * width + safeX) * 4;
    if (data[index + 3] >= 18) {
      samples.push({
        red: data[index],
        green: data[index + 1],
        blue: data[index + 2]
      });
    }
  });

  if (!samples.length) {
    return { red: 255, green: 255, blue: 255 };
  }

  return samples.reduce(
    (color, sample) => ({
      red: color.red + sample.red / samples.length,
      green: color.green + sample.green / samples.length,
      blue: color.blue + sample.blue / samples.length
    }),
    { red: 0, green: 0, blue: 0 }
  );
}

function isNearTattooBackground(red, green, blue, alpha, background) {
  if (alpha < 18) {
    return true;
  }

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const brightness = (red + green + blue) / 3;
  const chroma = max - min;

  return backgroundDistance(red, green, blue, background) < 84 || (brightness > 210 && chroma < 44);
}


function findTattooContentBounds(imageData) {
  const { data, width, height } = imageData;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 20) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  const padding = Math.max(8, Math.round(Math.max(right - left, bottom - top) * 0.08));
  return {
    left: Math.max(0, left - padding),
    top: Math.max(0, top - padding),
    right: Math.min(width - 1, right + padding),
    bottom: Math.min(height - 1, bottom + padding)
  };
}

function cropTransparentTattooCanvas(canvas, imageData) {
  const bounds = findTattooContentBounds(imageData);
  if (!bounds) {
    return canvas;
  }

  const width = Math.max(1, bounds.right - bounds.left + 1);
  const height = Math.max(1, bounds.bottom - bounds.top + 1);
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = width;
  croppedCanvas.height = height;
  const croppedContext = croppedCanvas.getContext("2d");
  croppedContext.putImageData(
    imageData,
    -bounds.left,
    -bounds.top,
    bounds.left,
    bounds.top,
    width,
    height
  );
  return croppedCanvas;
}

function createTransparentTattooUrl(url) {
  if (!url) {
    return Promise.resolve(url);
  }

  if (transparentTattooCache.has(url)) {
    return transparentTattooCache.get(url);
  }

  const promise = loadDrawableImage(url)
    .then((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, image.naturalWidth || image.width);
      canvas.height = Math.max(1, image.naturalHeight || image.height);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const background = estimateTattooBackgroundColor(data, canvas.width, canvas.height);

      for (let index = 0; index < data.length; index += 4) {
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];

        if (isNearTattooBackground(red, green, blue, alpha, background)) {
          data[index + 3] = 0;
          continue;
        }

        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        const brightness = (red + green + blue) / 3;
        const chroma = max - min;

        if (brightness > 185 && chroma < 70) {
          data[index + 3] = Math.min(data[index + 3], Math.max(0, Math.round((230 - brightness) * 2.2)));
        }

        if (data[index + 3] < 16) {
          data[index + 3] = 0;
        }
      }

      context.putImageData(imageData, 0, 0);
      const croppedCanvas = cropTransparentTattooCanvas(canvas, imageData);
      return croppedCanvas.toDataURL("image/png");
    })
    .catch(() => url);

  transparentTattooCache.set(url, promise);
  return promise;
}

function applyTransparentTattooOverlay(imageElement, url) {
  if (!imageElement || !url) {
    return;
  }

  imageElement.dataset.source = url;
  imageElement.src = url;
  createTransparentTattooUrl(url).then((transparentUrl) => {
    if (imageElement.dataset.source === url) {
      imageElement.src = transparentUrl;
    }
  });
}

const defaultHeroImages = {
  concept: heroConceptImage?.getAttribute("src") ?? "assets/hero-concept.png",
  linework: heroLineworkImage?.getAttribute("src") ?? "assets/hero-linework.png",
  placement: heroPlacementImage?.getAttribute("src") ?? "assets/hero-placement.png"
};

const stylePromptPresets = {
  "fine line": "fine line: delicate thin outlines, elegant negative space, minimal shading, graceful botanical or symbolic detail, refined tattoo flash finish.",
  minimalist: "minimalist: simple iconic silhouette, very few lines, balanced empty space, instantly readable at small size.",
  blackwork: "blackwork: solid black shapes, high contrast, controlled negative space, bold tattoo readability, no grey wash.",
  geometric: "geometric: clean symmetrical geometry, precise line weight, balanced sacred-geometry inspired structure, crisp edges.",
  japanese: "japanese: bold irezumi-inspired flow, strong readable silhouette, dynamic curves, tattoo-ready traditional composition.",
  lettering: "lettering: clean custom tattoo lettering, readable letterforms, balanced spacing, no random extra words."
};

function normalizePromptText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function subjectCompletenessGuidance(userIdea = "") {
  const text = normalizePromptText(userIdea).toLowerCase();
  const isPortrait = /\b(head|face|portrait|bust|skull)\b/.test(text);
  const isCreature = /\b(dragon|eagle|bird|wolf|tiger|lion|cat|dog|fox|snake|fish|butterfly|moth|phoenix|animal|creature|wings|tail|claws)\b/.test(text);

  if (isCreature && !isPortrait) {
    return "Full body complete subject: show the whole creature in one tattoo motif, with feet, claws, wings, and tail fully inside the artwork. Do not crop or hide any body part.";
  }

  return "Complete tattoo motif: keep the full design visible inside the canvas, with no cropped edges or missing important elements.";
}

function stylePresetFor(selectedStyle = "Fine line") {
  const key = normalizePromptText(selectedStyle).toLowerCase();
  return stylePromptPresets[key] ?? `${key}: clean tattoo flash style, readable silhouette, balanced line weight, artist-ready reference.`;
}

function sizeGuidance(selectedSize = "Small") {
  const key = normalizePromptText(selectedSize).toLowerCase();
  if (key === "large") {
    return "large readable tattoo composition with strong focal point, enough detail for a larger body area, clear silhouette from distance.";
  }
  if (key === "medium") {
    return "medium tattoo composition with readable details, clear focal point, enough spacing between lines.";
  }
  return "small tattoo composition with simplified details, clean readable silhouette, avoid tiny fragile details.";
}

function complexityGuidance(selectedComplexity = "Beginner friendly") {
  const key = normalizePromptText(selectedComplexity).toLowerCase();
  if (key.includes("detailed")) {
    return "controlled detail, still stencil-friendly, avoid visual noise or overly dense micro-lines.";
  }
  if (key.includes("moderate")) {
    return "moderate detail, balanced contrast, clean artist-ready line hierarchy.";
  }
  return "beginner friendly complexity, simple enough to explain to a tattoo artist, clean and not overcrowded.";
}

function buildPrompt() {
  const userIdea = normalizePromptText(idea.value);

  if (!userIdea) {
    return "Describe your tattoo idea to generate a tattoo-ready prompt.";
  }

  const selectedStyle = normalizePromptText(style.value || "Fine line");
  const selectedPlacement = normalizePromptText(placement.value || "Forearm");
  const selectedSize = normalizePromptText(size.value || "Small");
  const selectedComplexity = normalizePromptText(complexity.value || "Beginner friendly");
  const extraInstructions = normalizePromptText(advancedPrompt?.value ?? "");
  const parts = [
    `Create an isolated ${selectedStyle.toLowerCase()} tattoo design reference of ${userIdea}.`,
    "professional tattoo flash reference, single complete tattoo motif, artist-ready design sheet.",
    stylePresetFor(selectedStyle),
    sizeGuidance(selectedSize),
    complexityGuidance(selectedComplexity),
    `This is only the tattoo artwork for later ${selectedPlacement.toLowerCase()} placement preview; do not show the placement itself.`,
    `Design target: ${selectedSize.toLowerCase()} size, ${selectedComplexity.toLowerCase()} complexity.`,
    "Clean black ink linework, centered tattoo flash sheet composition, opaque pure white background only.",
    "Keep the entire tattoo design fully visible and uncropped, with generous white margin around all edges.",
    "Black ink on white background only; no black background, no transparent background, no inverted white lines.",
    subjectCompletenessGuidance(userIdea),
    "For animals, dragons, and creatures, include all limbs, legs, claws, wings, horns, and tail inside the canvas unless the user asks for a portrait.",
    "Use clean contour lines and controlled contrast so the design can become a stencil or artist reference.",
    "Avoid poster art, logo design, sticker, clipart, 3d render, photorealism.",
    "No person, no model, no hand, no arm, no forearm, no wrist, no skin, no body parts, no clothing.",
    "No photo, no mockup, no placement preview, no shadows, no grey background, no paper texture, no text.",
    "No extra background objects, no frame, no border, no watermark, no signature."
  ];

  if (extraInstructions) {
    parts.push(`Additional user instructions: ${extraInstructions}.`);
  }

  return parts.join(" ");
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
  generateButton.disabled = isGenerating;
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
    small: 0.3,
    medium: 0.38,
    large: 0.48
  };
  const selectedPlacement = normalizeDataValue(placement.value);
  const selectedSize = normalizeDataValue(size.value);
  const fit = getPlacementTattooFit(selectedPlacement);
  const width = canvasSize * (sizeScale[selectedSize] ?? sizeScale.small) * fit.scale;

  return {
    ...fit,
    width,
    height: width
  };
}

function drawSkinEmbeddedTattoo(context, tattooImage, tattooBox) {
  context.save();
  context.translate(context.canvas.width * tattooBox.x, context.canvas.height * tattooBox.y);
  context.rotate((tattooBox.rotation * Math.PI) / 180);
  context.scale(tattooBox.squash ?? 0.9, 1);
  context.globalCompositeOperation = "multiply";

  context.globalAlpha = 0.18;
  context.filter = "grayscale(1) contrast(0.86) brightness(0.74) blur(0.8px)";
  context.drawImage(
    tattooImage,
    -tattooBox.width / 2,
    -tattooBox.height / 2,
    tattooBox.width,
    tattooBox.height
  );

  context.globalAlpha = 0.58;
  context.filter = "grayscale(1) contrast(0.92) brightness(0.72) blur(0.18px)";
  context.drawImage(
    tattooImage,
    -tattooBox.width / 2,
    -tattooBox.height / 2,
    tattooBox.width,
    tattooBox.height
  );
  context.restore();
}
async function downloadPlacementPreview() {
  if (!generated) {
    return;
  }

  const tattooUrl = generatedImages.linework || generatedImages.concept || defaultHeroImages.concept;

  try {
    const tattooImage = await loadDrawableImage(tattooUrl);
    const canvas = document.createElement("canvas");
    canvas.width = downloadAccess.highResolution ? 1200 : 900;
    canvas.height = downloadAccess.highResolution ? 1200 : 900;
    const context = canvas.getContext("2d");
    const selectedPlacement = normalizeDataValue(placement.value);
    const skinImage = await loadDrawableImage(getPlacementSkinAsset(selectedPlacement));
    context.drawImage(skinImage, 0, 0, canvas.width, canvas.height);

    const tattooBox = getPlacementTattooBox(canvas.width);
    const transparentTattooUrl = await createTransparentTattooUrl(tattooUrl);
    const transparentTattooImage = await loadDrawableImage(transparentTattooUrl);
    drawSkinEmbeddedTattoo(context, transparentTattooImage, tattooBox);
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
  conceptCandidates = [];
  selectedConceptIndex = 0;
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
  const selectedPlacement = normalizeDataValue(placement.value);
  heroPlacementMockup.dataset.placement = selectedPlacement;
  heroPlacementMockup.dataset.size = normalizeDataValue(size.value);
  applyPlacementTattooFit(heroPlacementMockup, selectedPlacement);
  if (heroPlacementSkin) {
    heroPlacementSkin.src = getPlacementSkinAsset(selectedPlacement);
  }
  applyTransparentTattooOverlay(heroPlacementTattoo, tattooImage);
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
  promptPreview.innerHTML = `<strong>Prompt preview:</strong> ${escapeHtml(generatedPrompt || buildPrompt())}`;
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

function renderConceptCandidates() {
  if (!conceptCandidateStrip) {
    return;
  }

  const candidates = conceptCandidates.length ? conceptCandidates : generatedImages.concept ? [generatedImages.concept] : [];
  conceptCandidateStrip.hidden = !generated || candidates.length <= 1;
  conceptCandidateStrip.innerHTML = candidates
    .map((url, index) => `
      <button class="concept-candidate${index === selectedConceptIndex ? " selected" : ""}" type="button" data-index="${index}" aria-label="Use concept option ${index + 1}">
        <img src="${escapeHtml(url)}" alt="Concept option ${index + 1}" loading="lazy">
        <span>Option ${index + 1}</span>
      </button>
    `)
    .join("");
}

async function persistSelectedConcept(url) {
  if (!currentGenerationId || !url) {
    return;
  }

  await fetch("/api/generation", {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      generationId: currentGenerationId,
      selectedConceptUrl: url
    })
  }).catch(() => {});
}

function selectConceptCandidate(index) {
  const candidate = conceptCandidates[index];

  if (!candidate) {
    return;
  }

  selectedConceptIndex = index;
  generatedImages = {
    ...generatedImages,
    concept: candidate,
    linework: undefined,
    placement: undefined
  };
  lineworkError = "";
  heroMode = "concept";
  renderHeroPreview();
  persistSelectedConcept(candidate);
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
    heroResultSummary.textContent = getResultSummary();
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

  renderConceptCandidates();

  if (downloadConceptButton) {
    downloadConceptButton.disabled = (!generatedImages.concept && !blockingError) || isGenerating;
    downloadConceptButton.textContent = blockingError
      ? "Try again"
      : downloadAccess.highResolution
        ? "Download high-res concept"
        : "Download watermarked concept";
    downloadConceptButton.title = downloadAccess.highResolution ? "" : downloadAccess.message;
  }

  if (regenerateConceptButton) {
    regenerateConceptButton.disabled = isGenerating || lineworkGenerating || quota <= 0;
    regenerateConceptButton.textContent = isGenerating ? "Regenerating concept..." : "Regenerate concept";
    regenerateConceptButton.title = quota <= 0 ? "Upgrade to generate more concept options" : "Create another concept with the same settings";
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
    document.querySelector("#pricing")?.scrollIntoView({ behavior: "smooth" });
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
        complexity: complexity.value,
        advancedPrompt: advancedPrompt?.value.trim() ?? ""
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
    conceptCandidates = data.conceptCandidates ?? (generatedImages.concept ? [generatedImages.concept] : []);
    selectedConceptIndex = 0;
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


function regenerateConcept() {
  if (isGenerating || lineworkGenerating) {
    return;
  }

  heroMode = "concept";
  generatedImages = {};
  conceptCandidates = [];
  selectedConceptIndex = 0;
  currentGenerationId = "";
  lineworkError = "";
  generate();
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

[idea, style, placement, size, complexity, advancedPrompt].filter(Boolean).forEach((element) => {
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

if (conceptCandidateStrip) {
  conceptCandidateStrip.addEventListener("click", (event) => {
    const button = event.target.closest(".concept-candidate");

    if (!button) {
      return;
    }

    selectConceptCandidate(Number(button.dataset.index));
  });
}

if (regenerateConceptButton) {
  regenerateConceptButton.addEventListener("click", () => {
    regenerateConcept();
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
