const successStatus = document.querySelector("#successStatus");
const successTitle = document.querySelector("#successTitle");
const successReturnLink = document.querySelector("#successReturnLink");
const successCheckAgain = document.querySelector("#successCheckAgain");
const MAX_ACCESS_CHECKS = 8;
const ACCESS_CHECK_INTERVAL_MS = 1500;

function getSafeReturnTo(params) {
  const returnTo = params.get("returnTo") ?? "";

  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return "";
  }

  return returnTo;
}

function setSuccessStatus(message) {
  if (successStatus) {
    successStatus.textContent = message;
  }
}

function setSuccessTitle(message) {
  if (successTitle) {
    successTitle.textContent = message;
  }
}

function setCheckAgainState(isChecking) {
  if (!successCheckAgain) {
    return;
  }

  successCheckAgain.disabled = isChecking;
  successCheckAgain.textContent = isChecking ? "Checking..." : "Check again";
}

function setDelayedConfirmationStatus() {
  setSuccessTitle("Payment received");
  setSuccessStatus(
    "Your payment was received. We are still confirming it with Creem. This usually takes less than a minute. You can check again or open Billing to review the order."
  );
}

async function refreshDownloadAccess(attempt = 1, manual = false) {
  if (attempt === 1) {
    setCheckAgainState(true);
  }

  setSuccessTitle("Payment received");
  setSuccessStatus(manual ? "Checking your download access..." : "Payment received. Finalizing your access...");

  try {
    const response = await fetch("/api/download-access");
    const data = await response.json();

    if (response.ok && data.downloadAccess?.highResolution) {
      setSuccessTitle("High-resolution downloads unlocked");
      setSuccessStatus("High-resolution downloads are unlocked. Open My Designs to download your files.");
      setCheckAgainState(false);
      return true;
    }

    if (!manual && attempt < MAX_ACCESS_CHECKS) {
      setSuccessStatus("Payment received. Finalizing your access...");
      setTimeout(() => {
        refreshDownloadAccess(attempt + 1);
      }, ACCESS_CHECK_INTERVAL_MS);
      return false;
    }

    setDelayedConfirmationStatus();
    setCheckAgainState(false);
    return false;
  } catch {
    if (!manual && attempt < MAX_ACCESS_CHECKS) {
      setSuccessStatus("Payment received. Finalizing your access...");
      setTimeout(() => {
        refreshDownloadAccess(attempt + 1);
      }, ACCESS_CHECK_INTERVAL_MS);
      return false;
    }

    setDelayedConfirmationStatus();
    setCheckAgainState(false);
    return false;
  }
}

function initSuccessPage() {
  const params = new URLSearchParams(window.location.search);
  const returnTo = getSafeReturnTo(params);

  if (returnTo && successReturnLink) {
    successReturnLink.href = returnTo;
    successReturnLink.dataset.returnTo = returnTo;
  }

  successCheckAgain?.addEventListener("click", () => {
    refreshDownloadAccess(1, true);
  });

  refreshDownloadAccess();
}

initSuccessPage();