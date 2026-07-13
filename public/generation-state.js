(function exposeGenerationState(globalScope) {
  function normalizePath(value = "") {
    return String(value).replace(/^\/+/, "");
  }

  function resolveAssetState({
    phase = "",
    assetUrl = "",
    failed = false,
    defaultAsset = "",
    emptyState = "not_generated"
  } = {}) {
    if (phase === "generating" || phase === "saving") {
      return phase;
    }

    if (assetUrl && (!defaultAsset || normalizePath(assetUrl) !== normalizePath(defaultAsset))) {
      return "ready";
    }

    if (failed) {
      return "failed";
    }

    return emptyState;
  }

  function isBusy(state) {
    return state === "generating" || state === "saving";
  }

  globalScope.InkFirstGenerationState = { resolveAssetState, isBusy };
})(typeof window === "undefined" ? globalThis : window);
