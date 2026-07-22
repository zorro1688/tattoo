const FULL_BODY_PATTERN = /\b(full body|whole body|entire body|head to toe|all four legs)\b/i;
const HALF_BODY_PATTERN = /\b(half body|upper body|bust)\b/i;
const PORTRAIT_PATTERN = /\b(head|face|portrait|headshot)\b/i;

export const ALLOWED_CANDIDATE_REASONS = new Set([
  "subject_mismatch",
  "missing_front_leg",
  "missing_hind_leg",
  "extra_limb",
  "malformed_anatomy",
  "extra_botanical_elements",
  "extra_celestial_elements",
  "extra_text",
  "duplicate_subject",
  "cropped_subject",
  "dark_background",
  "poor_tattoo_readability",
  "other_quality_issue"
]);

const REASON_PATTERNS = [
  [/subject.{0,20}(mismatch|wrong)|wrong subject/i, "subject_mismatch"],
  [/missing.{0,20}(front|fore).{0,10}(leg|limb)|missing_front_leg/i, "missing_front_leg"],
  [/missing.{0,20}(hind|back|rear).{0,10}(leg|limb)|missing_hind_leg/i, "missing_hind_leg"],
  [/(extra|additional).{0,12}(leg|limb|arm|paw)|extra_limb/i, "extra_limb"],
  [/(malformed|deformed|broken|incoherent).{0,20}(anatomy|body|limb)|malformed_anatomy/i, "malformed_anatomy"],
  [/(flower|floral|leaf|leaves|plant|botanical)/i, "extra_botanical_elements"],
  [/(moon|star|celestial|planet|sun)/i, "extra_celestial_elements"],
  [/(text|letter|word|caption|typography)/i, "extra_text"],
  [/(duplicate|multiple|second|extra).{0,15}(subject|animal|creature)/i, "duplicate_subject"],
  [/(crop|cropped|cut off|outside canvas)/i, "cropped_subject"],
  [/(dark|black).{0,15}background/i, "dark_background"],
  [/(poor|weak|unusable|unclear).{0,20}(tattoo|stencil|readability)|poor_tattoo_readability/i, "poor_tattoo_readability"]
];

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

export function buildCandidateReviewPrompt({ candidateId = "", input = {}, composition = "portrait" } = {}) {
  const idea = String(input.idea || "").trim();
  const style = String(input.style || "").trim();
  return [
    "You are a strict tattoo-reference quality reviewer.",
    `Candidate ID: ${candidateId}`,
    `Requested subject: ${idea}`,
    `Requested style: ${style}`,
    `Expected composition: ${composition}`,
    "Judge only the supplied image. Reject subject mismatch, malformed or missing anatomy required by the composition, unrequested decorative elements, duplicate subjects, crop, dark background, text, or poor tattoo readability.",
    "Portrait and half-body compositions must not be rejected merely because legs are intentionally outside the requested composition.",
    "Return JSON only with this exact shape:",
    '{"accepted":boolean,"score":0-100,"subjectMatch":boolean,"anatomyComplete":boolean,"unrequestedElements":[],"cropped":boolean,"tattooUsable":boolean,"reasons":[]}',
    "Reasons must use short factual labels and must not include explanations."
  ].join("\n");
}

function flattenOutput(output) {
  if (Array.isArray(output)) return output.map(flattenOutput).join("");
  if (output && typeof output === "object") {
    if ("output" in output) return flattenOutput(output.output);
    if ("text" in output) return flattenOutput(output.text);
  }
  return String(output ?? "");
}

function extractJsonObject(value) {
  const text = flattenOutput(value).replace(/```(?:json)?/gi, "").trim();
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return /^(true|yes|1)$/i.test(value.trim());
  return false;
}

function normalizeReason(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const canonical = text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (ALLOWED_CANDIDATE_REASONS.has(canonical)) return canonical;
  for (const [pattern, reason] of REASON_PATTERNS) {
    if (pattern.test(text)) return reason;
  }
  return "other_quality_issue";
}

function normalizeReasons(parsed) {
  const values = [
    ...(Array.isArray(parsed.reasons) ? parsed.reasons : []),
    ...(Array.isArray(parsed.unrequestedElements) ? parsed.unrequestedElements : [])
  ];
  const reasons = [];
  for (const value of values) {
    const reason = normalizeReason(value);
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  }
  return reasons;
}

export function parseCandidateReviewOutput(output, candidateId = "") {
  const json = extractJsonObject(output);
  if (!json) {
    return { candidateId, reviewStatus: "invalid_response", accepted: false, score: 0, reasons: [] };
  }
  try {
    const parsed = JSON.parse(json);
    const numericScore = Number(parsed.score);
    const score = Number.isFinite(numericScore) ? Math.max(0, Math.min(100, numericScore)) : 0;
    return {
      candidateId,
      reviewStatus: "complete",
      accepted: toBoolean(parsed.accepted),
      score,
      subjectMatch: toBoolean(parsed.subjectMatch),
      anatomyComplete: toBoolean(parsed.anatomyComplete),
      cropped: toBoolean(parsed.cropped),
      tattooUsable: toBoolean(parsed.tattooUsable),
      reasons: normalizeReasons(parsed)
    };
  } catch {
    return { candidateId, reviewStatus: "invalid_response", accepted: false, score: 0, reasons: [] };
  }
}

export function rankAcceptedCandidates(candidates = [], { minScore = 70 } = {}) {
  return candidates
    .filter((candidate) => {
      if (!candidate?.deterministic?.passed) return false;
      const status = candidate?.review?.reviewStatus;
      if (status === "complete") {
        return candidate.review.accepted === true && Number(candidate.review.score) >= minScore;
      }
      return status === "unavailable" || status === "invalid_response";
    })
    .map((candidate) => ({
      ...candidate,
      qualityDecision: candidate.review?.reviewStatus === "complete" ? "review_accepted" : "review_fail_open"
    }))
    .sort((left, right) => {
      const leftScore = left.review?.reviewStatus === "complete" ? Number(left.review.score) || 0 : -1;
      const rightScore = right.review?.reviewStatus === "complete" ? Number(right.review.score) || 0 : -1;
      if (rightScore !== leftScore) return rightScore - leftScore;
      const cleanliness = (Number(right.deterministic?.cleanliness) || 0) - (Number(left.deterministic?.cleanliness) || 0);
      if (cleanliness !== 0) return cleanliness;
      return (Number(left.originalIndex) || 0) - (Number(right.originalIndex) || 0);
    });
}
