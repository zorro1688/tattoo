const designStatus = document.querySelector("#designStatus");
const detailTitle = document.querySelector("#detailTitle");
const detailCreatedAt = document.querySelector("#detailCreatedAt");
const detailConceptImage = document.querySelector("#detailConceptImage");
const detailLineworkImage = document.querySelector("#detailLineworkImage");
const detailLineworkEmpty = document.querySelector("#detailLineworkEmpty");
const detailPlacementMockup = document.querySelector("#detailPlacementMockup");
const detailPlacementTattoo = document.querySelector("#detailPlacementTattoo");
const detailPlacementNote = document.querySelector("#detailPlacementNote");
const detailMeta = document.querySelector("#detailMeta");
const detailPrompt = document.querySelector("#detailPrompt");
const detailDownloadConcept = document.querySelector("#detailDownloadConcept");
const detailLineworkButton = document.querySelector("#detailLineworkButton");
const detailDownloadPlacement = document.querySelector("#detailDownloadPlacement");
const detailUpgradeConcept = document.querySelector("#detailUpgradeConcept");
const detailUpgradeLinework = document.querySelector("#detailUpgradeLinework");
const detailUpgradePlacement = document.querySelector("#detailUpgradePlacement");

let currentDesign = null;
let downloadAccess = {
  highResolution: false,
  watermarked: true,
  message: "Upgrade to download high-resolution files"
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeDataValue(value = "") {
  return String(value).toLowerCase().replaceAll(" ", "-");
}

function formatDate(value) {
  if (!value) {
    return "Saved design";
  }

  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatDesignTitle(design) {
  const style = design.input?.style ?? "Tattoo";
  const idea = design.input?.idea ?? "saved idea";

  return `${style} ${idea}`;
}

function normalizeAssetPath(url = "") {
  return String(url).replace(/^\/+/, "");
}

function isDefaultLineworkAsset(url = "") {
  return normalizeAssetPath(url) === "assets/hero-linework.png";
}

function hasGeneratedLinework(design = currentDesign) {
  const linework = design?.images?.linework ?? "";

  return Boolean(
    design?.lineworkProviderGenerationId ||
      (linework && !isDefaultLineworkAsset(linework))
  );
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
  if (!currentDesign?.id) {
    return;
  }

  const typeParam = downloadTypeParams[type];

  if (!typeParam) {
    return;
  }

  const response = await fetch(
    `/api/download?generationId=${encodeURIComponent(currentDesign.id)}&${typeParam}`
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    designStatus.textContent = data.error ?? "Could not download this file.";
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
    designStatus.textContent = downloadAccess.message;
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
  const selectedPlacement = normalizeDataValue(currentDesign?.input?.placement ?? "Forearm");
  const selectedSize = normalizeDataValue(currentDesign?.input?.size ?? "Small");
  const box = placementMap[selectedPlacement] ?? placementMap.forearm;
  const width = canvasSize * (sizeScale[selectedSize] ?? sizeScale.small) * box.scale;

  return {
    ...box,
    width,
    height: width
  };
}

async function downloadPlacementPreview() {
  if (!currentDesign) {
    return;
  }

  const tattooUrl = hasGeneratedLinework(currentDesign)
    ? currentDesign.images?.linework
    : currentDesign.images?.concept || "assets/hero-concept.png";

  try {
    const [skinImage, tattooImage] = await Promise.all([
      loadDrawableImage("assets/hero-forearm-clean.png"),
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
    context.drawImage(tattooImage, -tattooBox.width / 2, -tattooBox.height / 2, tattooBox.width, tattooBox.height);
    context.restore();
    if (!downloadAccess.highResolution) {
      drawWatermark(context, canvas.width, canvas.height);
      designStatus.textContent = downloadAccess.message;
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

function renderDownloadAccessActions(lineworkReady) {
  const hasHighResolution = downloadAccess.highResolution;
  const upgradeLinks = [detailUpgradeConcept, detailUpgradePlacement];

  detailDownloadConcept.textContent = hasHighResolution
    ? "Download high-res"
    : "Download watermarked";
  detailDownloadConcept.title = hasHighResolution ? "" : downloadAccess.message;
  detailDownloadPlacement.textContent = hasHighResolution
    ? "Download high-res"
    : "Download watermarked";
  detailDownloadPlacement.title = hasHighResolution ? "" : downloadAccess.message;
  detailLineworkButton.textContent = lineworkReady
    ? hasHighResolution
      ? "Download high-res"
      : "Download watermarked"
    : "Generate linework";
  detailLineworkButton.title = lineworkReady && !hasHighResolution ? downloadAccess.message : "";

  if (lineworkReady) {
    upgradeLinks.push(detailUpgradeLinework);
  }

  [detailUpgradeConcept, detailUpgradeLinework, detailUpgradePlacement].forEach((link) => {
    if (link) {
      link.hidden = true;
    }
  });

  if (!hasHighResolution) {
    upgradeLinks.forEach((link) => {
      if (link) {
        link.hidden = false;
      }
    });
  }
}

function renderDesign(design) {
  currentDesign = design;
  const title = formatDesignTitle(design);
  const conceptImage = design.images?.concept || "assets/hero-concept.png";
  const lineworkReady = hasGeneratedLinework(design);
  const lineworkImage = lineworkReady ? design.images?.linework : "";
  const tattooImage = lineworkReady ? lineworkImage : conceptImage;

  detailTitle.textContent = title;
  detailCreatedAt.textContent = formatDate(design.createdAt);
  detailConceptImage.src = conceptImage;
  detailConceptImage.alt = title;
  detailLineworkImage.src = lineworkImage || "";
  detailLineworkImage.hidden = !lineworkReady;
  if (detailLineworkEmpty) {
    detailLineworkEmpty.hidden = lineworkReady;
  }
  detailLineworkImage.alt = lineworkReady ? `${title} linework` : "Linework not generated yet";
  detailPlacementTattoo.src = tattooImage;
  detailPlacementTattoo.alt = `${title} placement preview`;
  detailPlacementMockup.dataset.placement = normalizeDataValue(design.input?.placement ?? "Forearm");
  detailPlacementMockup.dataset.size = normalizeDataValue(design.input?.size ?? "Small");
  detailPlacementNote.textContent = design.placementNote ?? "Placement guidance is not available for this design.";
  detailPrompt.textContent = design.prompt ?? "Prompt is not available for this design.";
  detailMeta.innerHTML = `
    <div><dt>Idea</dt><dd>${escapeHtml(design.input?.idea ?? "Saved idea")}</dd></div>
    <div><dt>Style</dt><dd>${escapeHtml(design.input?.style ?? "Style")}</dd></div>
    <div><dt>Placement</dt><dd>${escapeHtml(design.input?.placement ?? "Placement")}</dd></div>
    <div><dt>Size</dt><dd>${escapeHtml(design.input?.size ?? "Size")}</dd></div>
    <div><dt>Complexity</dt><dd>${escapeHtml(design.input?.complexity ?? "Complexity")}</dd></div>
  `;

  detailDownloadConcept.disabled = !design.images?.concept;
  detailDownloadPlacement.disabled = false;
  detailLineworkButton.disabled = false;
  renderDownloadAccessActions(lineworkReady);
  designStatus.textContent = "Saved design loaded.";
}

function renderError(message) {
  designStatus.textContent = message;
  detailTitle.textContent = "Design not found";
  detailPlacementNote.textContent = "Return to My Designs or generate a new tattoo idea.";
}

async function loadDesign() {
  const generationId = new URLSearchParams(window.location.search).get("id");

  if (!generationId) {
    renderError("Missing design id.");
    return;
  }

  try {
    const response = await fetch(`/api/generation?id=${encodeURIComponent(generationId)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Could not load saved design.");
    }

    renderDesign(data.generation);
  } catch (error) {
    renderError(error.message ?? "Could not load saved design.");
  }
}

async function loadDownloadAccess() {
  try {
    const response = await fetch("/api/download-access");
    const data = await response.json();

    if (response.ok && data.downloadAccess) {
      downloadAccess = data.downloadAccess;
      if (currentDesign) {
        renderDesign(currentDesign);
      }
    }
  } catch {
    if (currentDesign) {
      renderDesign(currentDesign);
    }
  }
}

function cleanCheckoutReturnUrl(params) {
  params.delete("checkout");
  params.delete("plan");
  const query = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}

function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("checkout") !== "success") {
    return false;
  }

  designStatus.textContent = "Payment successful. Refreshing download access...";
  cleanCheckoutReturnUrl(params);
  loadDownloadAccess().then(() => {
    designStatus.textContent = downloadAccess.highResolution
      ? "High-resolution downloads are unlocked."
      : "Payment confirmed. Download access will update after Creem confirms the webhook.";
  });

  return true;
}

function refreshDownloadAccessAfterReturn() {
  if (!currentDesign) {
    return;
  }

  loadDownloadAccess().then(() => {
    if (downloadAccess.highResolution) {
      designStatus.textContent = "High-resolution downloads are unlocked.";
    }
  });
}

async function startUpgradeCheckout(event) {
  event.preventDefault();
  const returnTo = `${window.location.pathname}${window.location.search}`;
  designStatus.textContent = "Opening checkout...";

  try {
    const response = await fetch(
      `/api/billing/checkout?plan=creator-pack&returnTo=${encodeURIComponent(returnTo)}`
    );
    const data = await response.json();

    if (response.ok && data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }

    designStatus.textContent = data.error ?? "Checkout is not configured yet.";
  } catch {
    designStatus.textContent = "Run the local server to test checkout.";
  }
}

async function generateLinework() {
  if (!currentDesign || detailLineworkButton.disabled) {
    return;
  }

  if (hasGeneratedLinework()) {
    downloadGenerationFile("linework");
    return;
  }

  detailLineworkButton.disabled = true;
  detailLineworkButton.textContent = "Creating stencil linework...";
  designStatus.textContent = "Creating stencil linework. This uses 1 generation credit.";

  try {
    const response = await fetch("/api/generate/linework", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ generationId: currentDesign.id })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Could not create linework.");
    }

    renderDesign(data.generation);
    designStatus.textContent = "Linework ready.";
  } catch (error) {
    detailLineworkButton.disabled = false;
    detailLineworkButton.textContent = "Generate linework";
    designStatus.textContent = error.message ?? "Could not create linework.";
  }
}

detailDownloadConcept.addEventListener("click", () => {
  downloadGenerationFile("concept");
});

detailLineworkButton.addEventListener("click", () => {
  generateLinework();
});

detailDownloadPlacement.addEventListener("click", () => {
  downloadGenerationFile("placement");
});

[
  detailUpgradeConcept,
  detailUpgradeLinework,
  detailUpgradePlacement
].forEach((link) => {
  link?.addEventListener("click", startUpgradeCheckout);
});

handleCheckoutReturn();
loadDownloadAccess();
loadDesign();

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    refreshDownloadAccessAfterReturn();
  }
});

window.addEventListener("focus", refreshDownloadAccessAfterReturn);
