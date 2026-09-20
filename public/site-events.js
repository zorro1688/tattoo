(function initializeInkFirstAnalytics() {
  const allowedParameters = new Set([
    "guide",
    "case_id",
    "style",
    "placement",
    "size",
    "complexity",
    "error_code"
  ]);

  function track(eventName, parameters = {}) {
    const safeParameters = Object.fromEntries(
      Object.entries(parameters).filter(([key, value]) =>
        allowedParameters.has(key) && ["string", "number", "boolean"].includes(typeof value)
      )
    );
    window.gtag?.("event", eventName, safeParameters);
  }

  window.InkFirstAnalytics = { track };

  for (const [browserEvent, analyticsEvent] of [
    ["inkfirst:guide-prompt-copy", "guide_prompt_copy"],
    ["inkfirst:guide-generator-entry", "guide_generator_entry"],
    ["inkfirst:guide-prefill-applied", "guide_prefill_applied"]
  ]) {
    window.addEventListener(browserEvent, (event) => {
      track(analyticsEvent, {
        guide: event.detail?.guide ?? "",
        case_id: event.detail?.caseId ?? ""
      });
    });
  }
})();
