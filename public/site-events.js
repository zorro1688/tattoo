(function initializeInkFirstAnalytics() {
  const allowedParameters = new Set([
    "guide",
    "case_id",
    "style",
    "placement",
    "size",
    "complexity",
    "error_code",
    "download_type",
    "access_tier",
    "transaction_id",
    "value",
    "currency",
    "items"
  ]);

  function sanitizeItems(items) {
    if (!Array.isArray(items)) {
      return undefined;
    }

    return items.slice(0, 10).map((item) => ({
      item_id: String(item?.item_id ?? "").slice(0, 100),
      item_name: String(item?.item_name ?? "").slice(0, 100),
      price: Number(item?.price) || 0,
      quantity: Math.max(1, Number(item?.quantity) || 1)
    }));
  }

  function track(eventName, parameters = {}) {
    const safeParameters = Object.fromEntries(
      Object.entries(parameters)
        .filter(([key, value]) =>
          allowedParameters.has(key) && (
            ["string", "number", "boolean"].includes(typeof value) ||
            (key === "items" && Array.isArray(value))
          )
        )
        .map(([key, value]) => [key, key === "items" ? sanitizeItems(value) : value])
    );
    window.gtag?.("event", eventName, safeParameters);
  }

  function trackDownload(downloadType, accessTier) {
    track("download_completed", {
      download_type: downloadType,
      access_tier: accessTier
    });
  }

  function trackPurchase(purchase) {
    const transactionId = String(purchase?.transactionId ?? "").trim();
    const value = Number(purchase?.value);
    const currency = String(purchase?.currency ?? "").trim().toUpperCase();
    const plan = String(purchase?.plan ?? "").trim();

    if (!transactionId || !plan || !Number.isFinite(value) || value < 0 || !/^[A-Z]{3}$/.test(currency)) {
      return false;
    }

    const storageKey = `inkfirst_purchase_${transactionId}`;

    try {
      if (localStorage.getItem(storageKey)) {
        return false;
      }
    } catch {}

    track("purchase", {
      transaction_id: transactionId,
      value,
      currency,
      items: [{
        item_id: plan,
        item_name: purchase.itemName || plan,
        price: value,
        quantity: 1
      }]
    });

    try {
      localStorage.setItem(storageKey, "sent");
    } catch {}

    return true;
  }

  window.InkFirstAnalytics = { track, trackDownload, trackPurchase };

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
