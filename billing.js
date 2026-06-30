const billingStatus = document.querySelector("#billingStatus");
const billingPlan = document.querySelector("#billingPlan");
const billingFreeCredits = document.querySelector("#billingFreeCredits");
const billingCredits = document.querySelector("#billingCredits");
const billingTotalCredits = document.querySelector("#billingTotalCredits");
const billingDownloadAccess = document.querySelector("#billingDownloadAccess");
const billingLastPayment = document.querySelector("#billingLastPayment");
const billingPaymentSource = document.querySelector("#billingPaymentSource");
const billingHistory = document.querySelector("#billingHistory");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPlan(value = "free") {
  const labels = {
    free: "Free",
    "creator-pack": "Creator Pack",
    "pro-monthly": "Pro Monthly",
    "pro-yearly": "Pro Yearly"
  };

  return labels[value] ?? value;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function shortId(value = "") {
  const text = String(value);
  return text.length > 18 ? `${text.slice(0, 10)}...${text.slice(-6)}` : text;
}

function renderSummary(summary = {}) {
  const freeCredits = summary.freeCreditsRemaining ?? 0;
  const paidCredits = summary.paidCreditsRemaining ?? 0;
  const totalCredits = summary.totalCreditsRemaining ?? freeCredits + paidCredits;

  billingPlan.textContent = formatPlan(summary.plan ?? "free");
  billingFreeCredits.textContent = String(freeCredits);
  billingCredits.textContent = String(paidCredits);
  billingTotalCredits.textContent = String(totalCredits);
  billingDownloadAccess.textContent = summary.highResolutionDownloadsUnlocked
    ? "High-res unlocked"
    : "Watermarked only";
  billingLastPayment.textContent = summary.lastPaymentAt
    ? formatDate(summary.lastPaymentAt)
    : "No paid order yet";
  billingPaymentSource.textContent = summary.paymentSource
    ? `via ${summary.paymentSource}`
    : "Upgrade when you need final files";
}

function renderEmpty(message = "No billing history yet.") {
  billingHistory.innerHTML = `<p class="billing-empty">${escapeHtml(message)}</p>`;
}

function renderHistory(events = []) {
  if (!events.length) {
    renderEmpty("No billing history yet.");
    return;
  }

  const rows = events.map((event) => `
    <tr>
      <td data-label="Date"><span class="billing-mobile-label">Date</span>${escapeHtml(formatDate(event.occurredAt))}</td>
      <td data-label="Plan"><span class="billing-mobile-label">Plan</span>${escapeHtml(formatPlan(event.plan))}</td>
      <td data-label="Status"><span class="billing-mobile-label">Status</span><span class="billing-status-pill ${escapeHtml(event.status)}">${escapeHtml(event.status)}</span></td>
      <td data-label="Credits"><span class="billing-mobile-label">Credits</span>${escapeHtml(event.credits ?? 0)}</td>
      <td data-label="Provider"><span class="billing-mobile-label">Provider</span>${escapeHtml(event.provider ?? "-")}</td>
      <td data-label="Event ID"><span class="billing-mobile-label">Event ID</span><code>${escapeHtml(shortId(event.id))}</code></td>
    </tr>
  `).join("");

  billingHistory.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Plan</th>
          <th>Status</th>
          <th>Credits</th>
          <th>Provider</th>
          <th>Event ID</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function loadBillingHistory() {
  billingStatus.textContent = "Loading billing history...";

  try {
    const response = await fetch("/api/billing-events?limit=20");
    const data = await response.json();

    if (response.status === 401) {
      renderSummary({ plan: "free", freeCreditsRemaining: 0, paidCreditsRemaining: 0, totalCreditsRemaining: 0, highResolutionDownloadsUnlocked: false });
      renderEmpty("Sign in to view billing history.");
      billingStatus.textContent = "Sign in to view billing history.";
      if (window.InkFirstAuth?.open) {
        window.InkFirstAuth.open("Sign in to view billing history.");
      }
      return;
    }

    if (!response.ok) {
      throw new Error(data.error ?? "Could not load billing history.");
    }

    renderSummary(data.summary);
    renderHistory(data.events ?? []);
    billingStatus.textContent = data.events?.length
      ? `${data.events.length} billing event${data.events.length === 1 ? "" : "s"} loaded.`
      : "No billing history yet.";
  } catch (error) {
    renderEmpty(error.message ?? "Could not load billing history.");
    billingStatus.textContent = error.message ?? "Could not load billing history.";
  }
}

loadBillingHistory();
