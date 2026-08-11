(function enableGuidePromptCopying() {
  const defaultLabel = "Copy prompt";

  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-copy-guide-prompt]");
    if (!button) return;

    const card = button.closest(".guide-prompt-card");
    const promptField = card?.querySelector("[data-guide-prompt-value]");
    const status = card?.querySelector("[data-guide-copy-status]");
    if (!promptField) return;

    const prompt = promptField.value.trim();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        promptField.focus();
        promptField.select();
        if (!document.execCommand("copy")) throw new Error("Copy command unavailable");
      }

      button.textContent = "Copied";
      if (status) status.textContent = "Prompt copied to clipboard.";
      window.setTimeout(() => {
        button.textContent = defaultLabel;
      }, 1800);
    } catch {
      promptField.focus();
      promptField.select();
      if (status) status.textContent = "Prompt selected. Copy it from the text field.";
    }
  });
})();
