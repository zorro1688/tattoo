import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { getDownloadAccess, getGeneration } from "./quota-store.mjs";
import { fetchStorageObjectFromSupabase } from "./supabase-store.mjs";

const allowedTypes = new Set(["concept", "linework", "placement"]);
const placeholderLinework = "assets/hero-linework.png";

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

const extensionByContentType = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg"
};

const contentTypeByExtension = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeImageUrl(url = "") {
  if (url.startsWith("/")) {
    return url;
  }

  return url;
}

function isGeneratedLinework(url = "") {
  return Boolean(url && !url.includes(placeholderLinework));
}

function normalizePlacementValue(value = "Forearm") {
  return String(value).toLowerCase().replaceAll(" ", "-");
}

function placementSkinAssetFor(value = "Forearm") {
  const key = normalizePlacementValue(value);
  return placementSkinAssets[key] ?? placementSkinAssets.forearm;
}

function defaultPlacementAdjustmentFor(value = "Forearm") {
  const key = normalizePlacementValue(value);
  return placementTattooFits[key] ?? placementTattooFits.forearm;
}

function imageUrlForType(generation, type) {
  if (type === "placement") {
    return generation.images?.linework || generation.images?.concept || generation.images?.placement;
  }

  return generation.images?.[type];
}

function assetForType(generation, type) {
  if (type === "placement") {
    return generation.assets?.linework || generation.assets?.concept || generation.assets?.placement;
  }

  return generation.assets?.[type];
}

function imageToDataUri(image) {
  const contentType = image.contentType?.split(";")[0] || "application/octet-stream";
  return `data:${contentType};base64,${Buffer.from(image.body).toString("base64")}`;
}

function filenameFor(type, access, contentType = "image/svg+xml") {
  if (!access.highResolution) {
    return `inkfirst-${type}-watermarked.svg`;
  }

  const extension = extensionByContentType[contentType.split(";")[0].toLowerCase()] ?? "png";
  return `inkfirst-${type}-high-resolution.${extension}`;
}

export async function fetchDownloadImage(url, publicBaseUrl = "") {
  if (!url) {
    throw new Error("Image URL is required.");
  }

  if (url.startsWith("/") || !/^https?:\/\//i.test(url)) {
    const localPath = url.startsWith("/") ? url.slice(1) : url;
    const candidates = [join(process.cwd(), localPath), join(process.cwd(), "public", localPath)];

    for (const filePath of candidates) {
      try {
        const body = await readFile(filePath);
        const contentType = contentTypeByExtension[extname(filePath).toLowerCase()] ?? "application/octet-stream";

        return {
          ok: true,
          contentType,
          body
        };
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }
    }

    if (publicBaseUrl) {
      const publicUrl = new URL(`/${localPath}`, publicBaseUrl).toString();
      const response = await fetch(publicUrl);
      const body = Buffer.from(await response.arrayBuffer());

      return {
        ok: response.ok,
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
        body
      };
    }

    throw new Error(`Local image asset was not found: ${localPath}`);
  }

  const response = await fetch(url);
  const body = Buffer.from(await response.arrayBuffer());

  return {
    ok: response.ok,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    body
  };
}

async function fetchImageForType(generation, type, fetchImage, fetchStoredImage, publicBaseUrl) {
  const asset = assetForType(generation, type);

  if (asset?.storagePath || asset?.storage_path) {
    const storedImage = await fetchStoredImage(asset);

    if (storedImage) {
      return storedImage;
    }
  }

  const imageUrl = imageUrlForType(generation, type);

  return imageUrl ? fetchImage(imageUrl, publicBaseUrl) : null;
}

export function renderWatermarkedSvg({
  imageUrl,
  title,
  watermarked = true,
  width = 900,
  height = 900
}) {
  const safeUrl = escapeXml(normalizeImageUrl(imageUrl));
  const safeTitle = escapeXml(title);
  const watermark = watermarked
    ? `<g opacity="0.22" transform="rotate(-24 ${width / 2} ${height / 2})">
        <text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.12)}" font-weight="800" fill="#1d1d1f">InkFirst</text>
      </g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeTitle}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <image href="${safeUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
  ${watermark}
</svg>`;
}

function renderPlacementSvg(generation, access, tattooImageUrl, skinImageUrl) {
  const input = generation.input ?? {};
  const title = `${input.style ?? "Tattoo"} placement preview`;
  const width = access.highResolution ? 1200 : 900;
  const height = access.highResolution ? 1200 : 900;
  const placementKey = normalizePlacementValue(input.placement ?? "Forearm");
  const fallbackAdjustment = defaultPlacementAdjustmentFor(input.placement ?? "Forearm");
  const adjustment = generation.placementAdjustment ?? fallbackAdjustment;
  const safeTattooUrl = escapeXml(normalizeImageUrl(tattooImageUrl));
  const safeSkinUrl = escapeXml(normalizeImageUrl(skinImageUrl));
  const safeTitle = escapeXml(title);
  const x = Math.round(Number(adjustment.x) * width);
  const y = Math.round(Number(adjustment.y) * height);
  const scale = Number(adjustment.scale);
  const rotation = Number(adjustment.rotation);
  const adjustmentData = `${adjustment.x},${adjustment.y},${adjustment.scale},${adjustment.rotation}`;
  const watermark = access.watermarked
    ? `<g opacity="0.22" transform="rotate(-24 ${width / 2} ${height / 2})">
        <text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.12)}" font-weight="800" fill="#1d1d1f">InkFirst</text>
      </g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeTitle}" data-placement-source="${escapeXml(placementKey)}" data-placement-adjustment="${escapeXml(adjustmentData)}">
  <rect width="100%" height="100%" fill="#f5f5f7"/>
  <image href="${safeSkinUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
  <g opacity="0.74" style="mix-blend-mode:multiply" transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})">
    <image href="${safeTattooUrl}" x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
  </g>
  ${watermark}
</svg>`;
}

async function defaultFetchImage(url, publicBaseUrl = "") {
  return fetchDownloadImage(url, publicBaseUrl);
}

export async function resolveDownloadFile({
  clientId,
  generationId,
  type,
  fetchImage = defaultFetchImage,
  fetchStoredImage = fetchStorageObjectFromSupabase,
  storePath,
  publicBaseUrl = ""
}) {
  if (!allowedTypes.has(type)) {
    return {
      status: 400,
      error: "Download type must be concept, linework, or placement."
    };
  }

  if (!generationId) {
    return {
      status: 400,
      error: "Saved generation id is required."
    };
  }

  const generation = await getGeneration(clientId, generationId, storePath);

  if (!generation) {
    return {
      status: 404,
      error: "Saved generation was not found."
    };
  }

  if (type === "linework" && !isGeneratedLinework(generation.images?.linework)) {
    return {
      status: 404,
      error: "Linework has not been generated yet."
    };
  }

  const access = await getDownloadAccess(clientId, storePath);

  if (type === "placement") {
    let image;
    let skinImage;

    try {
      image = await fetchImageForType(generation, type, fetchImage, fetchStoredImage, publicBaseUrl);
      skinImage = await fetchImage(placementSkinAssetFor(generation.input?.placement ?? "Forearm"), publicBaseUrl);
    } catch {
      return {
        status: 502,
        error: "Could not fetch the placement image file."
      };
    }

    if ((image && !image.ok) || !skinImage.ok) {
      return {
        status: 502,
        error: "Could not fetch the placement image file."
      };
    }

    const body = Buffer.from(
      renderPlacementSvg(generation, access, image ? imageToDataUri(image) : "", imageToDataUri(skinImage)),
      "utf8"
    );

    return {
      status: 200,
      contentType: "image/svg+xml; charset=utf-8",
      filename: filenameFor(type, access, "image/svg+xml"),
      body,
      access
    };
  }

  const imageUrl = imageUrlForType(generation, type);

  if (!imageUrl) {
    return {
      status: 404,
      error: `${type === "concept" ? "Concept" : "Linework"} image was not found.`
    };
  }

  if (!access.highResolution) {
    const image = await fetchImageForType(generation, type, fetchImage, fetchStoredImage, publicBaseUrl);

    if (!image.ok) {
      return {
        status: 502,
        error: "Could not fetch the original image file."
      };
    }

    const input = generation.input ?? {};
    const body = Buffer.from(
      renderWatermarkedSvg({
        imageUrl: imageToDataUri(image),
        title: input.idea ?? `${type} tattoo design`,
        watermarked: true
      }),
      "utf8"
    );

    return {
      status: 200,
      contentType: "image/svg+xml; charset=utf-8",
      filename: filenameFor(type, access, "image/svg+xml"),
      body,
      access
    };
  }

  const image = await fetchImageForType(generation, type, fetchImage, fetchStoredImage, publicBaseUrl);

  if (!image.ok) {
    return {
      status: 502,
      error: "Could not fetch the original image file."
    };
  }

  return {
    status: 200,
    contentType: image.contentType,
    filename: filenameFor(type, access, image.contentType),
    body: image.body,
    access
  };
}
