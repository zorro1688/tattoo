const FULL_BODY_PATTERN = /\b(full body|whole body|entire body|head to toe|all four legs)\b/i;
const HALF_BODY_PATTERN = /\b(half body|upper body|bust)\b/i;
const PORTRAIT_PATTERN = /\b(head|face|portrait|headshot)\b/i;

export function classifyCompositionIntent(idea = "") {
  const text = String(idea).replace(/\s+/g, " ").trim();
  if (FULL_BODY_PATTERN.test(text)) return "full_body";
  if (HALF_BODY_PATTERN.test(text)) return "half_body";
  if (PORTRAIT_PATTERN.test(text)) return "portrait";
  return "portrait";
}

export function buildCompositionGuidance({ idea = "", category = "general" } = {}) {
  const composition = classifyCompositionIntent(idea);
  if (category !== "animal" && category !== "creature") {
    return "Keep the complete requested motif inside the canvas with generous clean margins.";
  }
  if (composition === "full_body") {
    return "Show one complete full-body subject with anatomically coherent head, torso, all four legs when applicable, paws or feet, and tail fully inside the canvas.";
  }
  if (composition === "half_body") {
    return "Use a complete upper-body composition with a readable head, shoulders, and torso transition; do not add unrelated ornaments.";
  }
  return "Prefer a portrait or upper-body composition with a complete readable head and neck silhouette; hidden legs are expected and must not be invented.";
}
