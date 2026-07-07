const myDesignsGrid = document.querySelector("#myDesignsGrid");
const designsStatus = document.querySelector("#designsStatus");
let savedDesigns = [];

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
  forearm: { x: 0.54, y: 0.55, rotation: -7, scale: 0.82 },
  wrist: { x: 0.48, y: 0.58, rotation: -4, scale: 0.56 },
  "upper-arm": { x: 0.53, y: 0.46, rotation: -5, scale: 0.82 },
  chest: { x: 0.5, y: 0.59, rotation: 0, scale: 0.78 },
  back: { x: 0.5, y: 0.43, rotation: 0, scale: 0.9 },
  ankle: { x: 0.5, y: 0.58, rotation: -3, scale: 0.58 },
  shoulder: { x: 0.58, y: 0.34, rotation: -8, scale: 0.92 },
  rib: { x: 0.57, y: 0.5, rotation: 5, scale: 0.62 }
};

function normalizePlacementValue(value = "Forearm") {
  return String(value).toLowerCase().replaceAll(" ", "-");
}

function getPlacementSkinAsset(value = "Forearm") {
  const key = normalizePlacementValue(value);
  return placementSkinAssets[key] ?? placementSkinAssets.forearm;
}

function getDefaultPlacementAdjustment(design) {
  const key = normalizePlacementValue(design?.input?.placement ?? "Forearm");
  return placementTattooFits[key] ?? placementTattooFits.forearm;
}

const transparentTattooCache = new Map();

function loadDrawableImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
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
  createTransparentTattooUrl(url).then((transparentUrl) => {
    if (imageElement.dataset.source === url) {
      imageElement.src = transparentUrl;
    }
  });
}

function hydratePlacementPreviewTattooImages() {
  document.querySelectorAll("[data-placement-tattoo-source]").forEach((imageElement) => {
    applyTransparentTattooOverlay(imageElement, imageElement.dataset.placementTattooSource);
  });
}

function normalizePlacementAdjustment(adjustment, fallback) {
  if (!adjustment) {
    return { ...fallback };
  }

  return {
    x: Math.min(1, Math.max(0, Number(adjustment.x))),
    y: Math.min(1, Math.max(0, Number(adjustment.y))),
    scale: Math.min(2.4, Math.max(0.35, Number(adjustment.scale))),
    rotation: Math.min(45, Math.max(-45, Number(adjustment.rotation)))
  };
}

function renderPlacementPreview(design, title) {
  const placement = design.input?.placement ?? "Forearm";
  const adjustment = normalizePlacementAdjustment(
    design.placementAdjustment ?? getDefaultPlacementAdjustment(design),
    getDefaultPlacementAdjustment(design)
  );
  const tattooImage = hasGeneratedLinework(design)
    ? design.images?.linework
    : design.images?.concept;
  const safeTattooImage = tattooImage || "assets/hero-concept.png";
  const style = [
    `--tattoo-x: ${Math.round(adjustment.x * 1000) / 10}%`,
    `--tattoo-y: ${Math.round(adjustment.y * 1000) / 10}%`,
    `--tattoo-fit-scale: ${adjustment.scale}`,
    `--tattoo-rotation: ${adjustment.rotation}deg`
  ].join("; ");

  return `
    <div class="my-design-placement-preview" data-placement="${escapeHtml(normalizePlacementValue(placement))}" style="${escapeHtml(style)}">
      <img class="my-design-placement-skin" src="${escapeHtml(getPlacementSkinAsset(placement))}" alt="" aria-hidden="true" loading="lazy">
      <img class="my-design-placement-tattoo" src="${escapeHtml(safeTattooImage)}" data-placement-tattoo-source="${escapeHtml(safeTattooImage)}" alt="${escapeHtml(title)} placement preview" loading="lazy">
    </div>
  `;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function renderEmptyState() {
  myDesignsGrid.innerHTML = `
    <article class="my-designs-empty">
      <h3>No saved designs yet</h3>
      <p>No saved designs yet. Generate your first tattoo idea to see it here.</p>
      <a class="primary-button" href="/#generator">Generate a new tattoo idea</a>
    </article>
  `;
}

function renderDesigns(designs = []) {
  savedDesigns = designs;

  if (!designs.length) {
    renderEmptyState();
    return;
  }

  myDesignsGrid.innerHTML = designs
    .map((design) => {
      const title = formatDesignTitle(design);
      const placement = design.input?.placement ?? "Placement";
      const size = design.input?.size ?? "Size";
      const style = design.input?.style ?? "Style";
      const prompt = design.prompt ?? "Saved tattoo reference";
      const lineworkReady = hasGeneratedLinework(design);
      const lineworkImage = design.images?.linework ?? "";
      const lineworkAction = lineworkReady
        ? `<a class="secondary-button" href="${escapeHtml(lineworkImage)}" target="_blank" rel="noreferrer">Open linework</a>`
        : `<button class="secondary-button my-design-linework-button" type="button" data-linework-id="${escapeHtml(design.id)}">Generate linework</button>`;

      return `
        <article class="my-design-card">
          <figure>
            <div class="my-design-image">
              ${renderPlacementPreview(design, title)}
            </div>
            <figcaption class="my-design-copy">
              <span>${escapeHtml(formatDate(design.createdAt))}</span>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(prompt)}</p>
              <small>${escapeHtml(style)} / ${escapeHtml(placement)} / ${escapeHtml(size)}</small>
              <div class="my-design-actions">
                <span class="my-design-status ${lineworkReady ? "ready" : "pending"}">${lineworkReady ? "Linework ready" : "Linework not generated yet"}</span>
                ${lineworkAction}
                <a class="secondary-button" href="/design?id=${escapeHtml(design.id)}">View details</a>
              </div>
            </figcaption>
          </figure>
        </article>
      `;
    })
    .join("");
  hydratePlacementPreviewTattooImages();
}

async function generateLinework(generationId, button) {
  button.disabled = true;
  button.textContent = "Creating stencil linework...";
  designsStatus.textContent = "Creating stencil linework. This uses 1 generation credit.";

  try {
    const response = await fetch("/api/generate/linework", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ generationId })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Could not create linework.");
    }

    savedDesigns = savedDesigns.map((design) =>
      design.id === generationId ? { ...design, ...data.generation } : design
    );
    renderDesigns(savedDesigns);
    designsStatus.textContent = "Linework ready. Your saved design was updated.";
  } catch (error) {
    button.disabled = false;
    button.textContent = "Generate linework";
    designsStatus.textContent = error.message ?? "Could not create linework.";
  }
}

async function loadDesigns() {
  try {
    const response = await fetch("/api/generations?limit=24");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Could not load saved designs.");
    }

    renderDesigns(data.generations ?? []);
    designsStatus.textContent = data.generations?.length
      ? `${data.generations.length} saved design${data.generations.length === 1 ? "" : "s"}`
      : "No saved designs yet.";
  } catch (error) {
    renderEmptyState();
    designsStatus.textContent = error.message ?? "Could not load saved designs.";
  }
}

myDesignsGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-linework-id]");

  if (!button || button.disabled) {
    return;
  }

  generateLinework(button.dataset.lineworkId, button);
});

loadDesigns();
