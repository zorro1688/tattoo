import sharp from "sharp";

const supportedImageTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

function contentTypeBase(contentType = "") {
  return String(contentType).split(";")[0].trim().toLowerCase();
}

function isSupportedImage(contentType = "") {
  return supportedImageTypes.has(contentTypeBase(contentType));
}

async function estimateEdgeLuminance(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(32, 32, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let total = 0;
  let count = 0;
  const edgeWidth = 3;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (x >= edgeWidth && x < info.width - edgeWidth && y >= edgeWidth && y < info.height - edgeWidth) {
        continue;
      }

      const index = (y * info.width + x) * info.channels;
      total += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
      count += 1;
    }
  }

  return count ? total / count : 255;
}

export async function normalizeConceptImage(image) {
  if (!image?.body || !isSupportedImage(image.contentType)) {
    return { ...image, normalized: false };
  }

  const edgeLuminance = await estimateEdgeLuminance(image.body);

  if (edgeLuminance >= 72) {
    return { ...image, normalized: false };
  }

  const body = await sharp(image.body)
    .negate({ alpha: false })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();

  return {
    body,
    contentType: "image/png",
    normalized: true
  };
}

export async function normalizeConceptImageUrl(sourceUrl, fetchImpl = fetch) {
  try {
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      return { url: sourceUrl, normalized: false };
    }

    const response = await fetchImpl(sourceUrl);

    if (!response.ok || typeof response.arrayBuffer !== "function") {
      return { url: sourceUrl, normalized: false };
    }

    const image = await normalizeConceptImage({
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers?.get?.("content-type") ?? "application/octet-stream"
    });

    if (!image.normalized) {
      return { url: sourceUrl, normalized: false };
    }

    return {
      url: sourceUrl,
      normalized: true,
      image
    };
  } catch {
    return { url: sourceUrl, normalized: false };
  }
}
