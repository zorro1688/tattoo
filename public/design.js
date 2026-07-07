const designStatus = document.querySelector("#designStatus");
const detailTitle = document.querySelector("#detailTitle");
const detailCreatedAt = document.querySelector("#detailCreatedAt");
const detailConceptImage = document.querySelector("#detailConceptImage");
const detailLineworkImage = document.querySelector("#detailLineworkImage");
const detailLineworkEmpty = document.querySelector("#detailLineworkEmpty");
const detailPlacementMockup = document.querySelector("#detailPlacementMockup");
const detailPlacementSkin = document.querySelector("#detailPlacementSkin");
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
const placementXControl = document.querySelector("#placementXControl");
const placementYControl = document.querySelector("#placementYControl");
const placementScaleControl = document.querySelector("#placementScaleControl");
const placementRotateControl = document.querySelector("#placementRotateControl");
const savePlacementButton = document.querySelector("#savePlacementButton");
const resetPlacementButton = document.querySelector("#resetPlacementButton");


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
  forearm: { x: 0.54, y: 0.55, rotation: -7, scale: 0.82, squash: 0.9 },
  wrist: { x: 0.48, y: 0.58, rotation: -4, scale: 0.56, squash: 0.86 },
  "upper-arm": { x: 0.53, y: 0.46, rotation: -5, scale: 0.82, squash: 0.9 },
  chest: { x: 0.5, y: 0.42, rotation: 0, scale: 0.78, squash: 0.95 },
  back: { x: 0.5, y: 0.43, rotation: 0, scale: 0.9, squash: 0.95 },
  ankle: { x: 0.5, y: 0.58, rotation: -3, scale: 0.58, squash: 0.86 },
  shoulder: { x: 0.58, y: 0.34, rotation: -8, scale: 0.92, squash: 0.9 },
  rib: { x: 0.57, y: 0.5, rotation: 5, scale: 0.62, squash: 0.86 }
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
      return canvas.toDataURL("image/png");
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

let currentDesign = null;
let currentPlacementAdjustment = null;
let placementDragActive = false;
let placementPointerId = null;
let placementDragOffset = { x: 0, y: 0 };
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

function setDownloadButtonState(button, isDownloading) {
  if (!button) {
    return;
  }

  if (isDownloading && !button.dataset.previousText) {
    button.dataset.previousText = button.textContent;
  }

  button.disabled = isDownloading;
  button.classList.toggle("is-downloading", isDownloading);
  button.textContent = isDownloading ? "Preparing download..." : button.dataset.previousText || button.textContent;

  if (!isDownloading) {
    delete button.dataset.previousText;
  }
}

function downloadGenerationFile(type, button) {
  if (!currentDesign?.id) {
    return;
  }

  const typeParam = downloadTypeParams[type];

  if (!typeParam) {
    return;
  }

  const downloadUrl = `/api/download?generationId=${encodeURIComponent(currentDesign.id)}&${typeParam}`;
  setDownloadButtonState(button, true);
  designStatus.textContent = `Preparing ${type} download...`;
  triggerDownload(downloadUrl, `inkfirst-${type}.png`);

  window.setTimeout(() => {
    setDownloadButtonState(button, false);
    designStatus.textContent = downloadAccess.highResolution
      ? `${type.charAt(0).toUpperCase()}${type.slice(1)} download started.`
      : downloadAccess.message;
  }, 1400);
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


function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function normalizePlacementAdjustment(adjustment, fallback) {
  if (!adjustment) {
    return { ...fallback };
  }

  return {
    x: clampNumber(adjustment.x, 0, 1),
    y: clampNumber(adjustment.y, 0, 1),
    scale: clampNumber(adjustment.scale, 0.35, 2.4),
    rotation: clampNumber(adjustment.rotation, -45, 45)
  };
}

function getDefaultPlacementAdjustment(design = currentDesign) {
  const fit = getPlacementTattooFit(design?.input?.placement ?? "Forearm");
  return {
    x: fit.x,
    y: fit.y,
    scale: fit.scale,
    rotation: fit.rotation
  };
}

function syncPlacementControls(adjustment) {
  if (placementXControl) {
    placementXControl.value = String(adjustment.x);
  }
  if (placementYControl) {
    placementYControl.value = String(adjustment.y);
  }
  if (placementScaleControl) {
    placementScaleControl.value = String(adjustment.scale);
  }
  if (placementRotateControl) {
    placementRotateControl.value = String(adjustment.rotation);
  }
}

function applyPlacementAdjustment(adjustment, options = {}) {
  if (!detailPlacementMockup) {
    return;
  }

  currentPlacementAdjustment = normalizePlacementAdjustment(
    adjustment,
    getDefaultPlacementAdjustment(currentDesign)
  );
  detailPlacementMockup.style.setProperty("--tattoo-x", `${Math.round(currentPlacementAdjustment.x * 1000) / 10}%`);
  detailPlacementMockup.style.setProperty("--tattoo-y", `${Math.round(currentPlacementAdjustment.y * 1000) / 10}%`);
  detailPlacementMockup.style.setProperty("--tattoo-fit-scale", String(currentPlacementAdjustment.scale));
  detailPlacementMockup.style.setProperty("--tattoo-rotation", `${currentPlacementAdjustment.rotation}deg`);
  detailPlacementMockup.classList.add("is-adjustable");

  if (!options.skipControls) {
    syncPlacementControls(currentPlacementAdjustment);
  }
}

function updatePlacementFromPointer(event) {
  if (!detailPlacementMockup || !placementDragActive) {
    return;
  }

  if (placementPointerId !== null && event.pointerId !== placementPointerId) {
    return;
  }

  const rect = detailPlacementMockup.getBoundingClientRect();
  const next = {
    ...(currentPlacementAdjustment ?? getDefaultPlacementAdjustment(currentDesign)),
    x: clampNumber((event.clientX - rect.left - placementDragOffset.x) / rect.width, 0, 1),
    y: clampNumber((event.clientY - rect.top - placementDragOffset.y) / rect.height, 0, 1)
  };
  applyPlacementAdjustment(next);
}

function startPlacementDrag(event) {
  if (!currentDesign || !detailPlacementMockup || !detailPlacementTattoo) {
    return;
  }

  event.preventDefault();
  const tattooRect = detailPlacementTattoo.getBoundingClientRect();
  placementDragOffset = {
    x: event.clientX - (tattooRect.left + tattooRect.width / 2),
    y: event.clientY - (tattooRect.top + tattooRect.height / 2)
  };
  placementDragActive = true;
  placementPointerId = event.pointerId;
  detailPlacementMockup.classList.add("is-dragging");
  detailPlacementTattoo.setPointerCapture?.(event.pointerId);
  updatePlacementFromPointer(event);
}

function stopPlacementDrag(event) {
  if (placementPointerId !== null && event.pointerId !== placementPointerId) {
    return;
  }

  placementDragActive = false;
  placementPointerId = null;
  placementDragOffset = { x: 0, y: 0 };
  detailPlacementMockup?.classList.remove("is-dragging");
}

async function savePlacementAdjustment(adjustment = currentPlacementAdjustment) {
  if (!currentDesign?.id || !adjustment) {
    return;
  }

  savePlacementButton.disabled = true;
  designStatus.textContent = "Saving placement...";

  try {
    const response = await fetch("/api/generation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationId: currentDesign.id,
        placementAdjustment: adjustment
      })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error ?? "Could not save placement.");
    }

    currentDesign = data.generation;
    applyPlacementAdjustment(currentDesign.placementAdjustment ?? getDefaultPlacementAdjustment(currentDesign));
    designStatus.textContent = "Placement saved.";
  } catch (error) {
    designStatus.textContent = error.message ?? "Could not save placement.";
  } finally {
    savePlacementButton.disabled = !currentDesign;
  }
}

async function resetPlacementAdjustment() {
  if (!currentDesign?.id) {
    return;
  }

  const fallback = getDefaultPlacementAdjustment(currentDesign);
  applyPlacementAdjustment(fallback);
  savePlacementButton.disabled = true;
  resetPlacementButton.disabled = true;
  designStatus.textContent = "Resetting placement...";

  try {
    const response = await fetch("/api/generation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationId: currentDesign.id,
        placementAdjustment: null
      })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error ?? "Could not reset placement.");
    }

    currentDesign = data.generation;
    currentDesign.placementAdjustment = null;
    applyPlacementAdjustment(fallback);
    designStatus.textContent = "Placement reset.";
  } catch (error) {
    designStatus.textContent = error.message ?? "Could not reset placement.";
  } finally {
    savePlacementButton.disabled = !currentDesign;
    resetPlacementButton.disabled = !currentDesign;
  }
}

function getPlacementTattooBox(canvasSize) {
  const sizeScale = {
    small: 0.22,
    medium: 0.31,
    large: 0.42
  };
  const selectedPlacement = normalizeDataValue(currentDesign?.input?.placement ?? "Forearm");
  const selectedSize = normalizeDataValue(currentDesign?.input?.size ?? "Small");
  const fit = getPlacementTattooFit(selectedPlacement);
  const adjustment = normalizePlacementAdjustment(currentDesign?.placementAdjustment, {
    x: fit.x,
    y: fit.y,
    scale: fit.scale,
    rotation: fit.rotation
  });
  const width = canvasSize * (sizeScale[selectedSize] ?? sizeScale.small) * adjustment.scale;

  return {
    ...fit,
    ...adjustment,
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
  context.drawImage(tattooImage, -tattooBox.width / 2, -tattooBox.height / 2, tattooBox.width, tattooBox.height);

  context.globalAlpha = 0.58;
  context.filter = "grayscale(1) contrast(0.92) brightness(0.72) blur(0.18px)";
  context.drawImage(tattooImage, -tattooBox.width / 2, -tattooBox.height / 2, tattooBox.width, tattooBox.height);
  context.restore();
}
async function downloadPlacementPreview() {
  if (!currentDesign) {
    return;
  }

  const tattooUrl = hasGeneratedLinework(currentDesign)
    ? currentDesign.images?.linework
    : currentDesign.images?.concept || "assets/hero-concept.png";

  try {
    const tattooImage = await loadDrawableImage(tattooUrl);
    const canvas = document.createElement("canvas");
    canvas.width = downloadAccess.highResolution ? 1200 : 900;
    canvas.height = downloadAccess.highResolution ? 1200 : 900;
    const context = canvas.getContext("2d");
    const selectedPlacement = normalizeDataValue(currentDesign?.input?.placement ?? "Forearm");
    const skinImage = await loadDrawableImage(getPlacementSkinAsset(selectedPlacement));
    context.drawImage(skinImage, 0, 0, canvas.width, canvas.height);

    const tattooBox = getPlacementTattooBox(canvas.width);
    const transparentTattooUrl = await createTransparentTattooUrl(tattooUrl);
    const transparentTattooImage = await loadDrawableImage(transparentTattooUrl);
    drawSkinEmbeddedTattoo(context, transparentTattooImage, tattooBox);
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
  detailPlacementTattoo.alt = `${title} placement preview`;
  const selectedPlacement = normalizeDataValue(design.input?.placement ?? "Forearm");
  detailPlacementMockup.dataset.placement = selectedPlacement;
  detailPlacementMockup.dataset.size = normalizeDataValue(design.input?.size ?? "Small");
  applyPlacementTattooFit(detailPlacementMockup, selectedPlacement);
  applyPlacementAdjustment(design.placementAdjustment ?? getDefaultPlacementAdjustment(design));
  if (detailPlacementSkin) {
    detailPlacementSkin.src = getPlacementSkinAsset(selectedPlacement);
  }
  applyTransparentTattooOverlay(detailPlacementTattoo, tattooImage);
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
  if (savePlacementButton) {
    savePlacementButton.disabled = false;
  }
  if (resetPlacementButton) {
    resetPlacementButton.disabled = false;
  }
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
    downloadGenerationFile("linework", detailLineworkButton);
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


if (detailPlacementMockup && detailPlacementTattoo) {
  detailPlacementTattoo.addEventListener("pointerdown", startPlacementDrag);
  detailPlacementTattoo.addEventListener("pointermove", updatePlacementFromPointer);
  detailPlacementTattoo.addEventListener("pointerup", stopPlacementDrag);
  detailPlacementTattoo.addEventListener("pointercancel", stopPlacementDrag);
}


placementXControl?.addEventListener("input", () => {
  applyPlacementAdjustment({
    ...(currentPlacementAdjustment ?? getDefaultPlacementAdjustment(currentDesign)),
    x: placementXControl.value
  }, { skipControls: true });
});

placementYControl?.addEventListener("input", () => {
  applyPlacementAdjustment({
    ...(currentPlacementAdjustment ?? getDefaultPlacementAdjustment(currentDesign)),
    y: placementYControl.value
  }, { skipControls: true });
});

placementScaleControl?.addEventListener("input", () => {
  applyPlacementAdjustment({
    ...(currentPlacementAdjustment ?? getDefaultPlacementAdjustment(currentDesign)),
    scale: placementScaleControl.value
  }, { skipControls: true });
});

placementRotateControl?.addEventListener("input", () => {
  applyPlacementAdjustment({
    ...(currentPlacementAdjustment ?? getDefaultPlacementAdjustment(currentDesign)),
    rotation: placementRotateControl.value
  }, { skipControls: true });
});

savePlacementButton?.addEventListener("click", () => {
  savePlacementAdjustment();
});

resetPlacementButton?.addEventListener("click", () => {
  resetPlacementAdjustment();
});

detailDownloadConcept.addEventListener("click", () => {
  downloadGenerationFile("concept", detailDownloadConcept);
});

detailLineworkButton.addEventListener("click", () => {
  generateLinework();
});

detailDownloadPlacement.addEventListener("click", () => {
  downloadGenerationFile("placement", detailDownloadPlacement);
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
