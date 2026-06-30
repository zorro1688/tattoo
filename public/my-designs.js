const myDesignsGrid = document.querySelector("#myDesignsGrid");
const designsStatus = document.querySelector("#designsStatus");
let savedDesigns = [];

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
      const image = design.images?.concept || "assets/hero-concept.png";
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
              <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy">
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
