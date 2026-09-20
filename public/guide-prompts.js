(function enableGuidePromptCopying() {
  const defaultLabel = "Copy prompt";

  function emitGuideEvent(name, card) {
    window.dispatchEvent(new CustomEvent(name, {
      detail: {
        guide: "first-tattoo-ideas",
        caseId: card?.dataset.guideCase ?? ""
      }
    }));
  }

  document.addEventListener("click", async (event) => {
    const generatorLink = event.target.closest?.("[data-use-guide-prompt]");
    if (generatorLink) {
      event.preventDefault();
      const card = generatorLink.closest("[data-guide-case]");
      const promptField = card?.querySelector("[data-guide-prompt-value]");
      const params = new URLSearchParams({
        source: "guide",
        guide: "first-tattoo-ideas",
        case: card?.dataset.guideCase ?? "",
        idea: promptField?.value.trim() ?? "",
        style: generatorLink.dataset.style ?? "",
        placement: generatorLink.dataset.placement ?? "",
        size: generatorLink.dataset.size ?? "",
        complexity: generatorLink.dataset.complexity ?? "",
        advanced: generatorLink.dataset.advanced ?? ""
      });
      emitGuideEvent("inkfirst:guide-generator-entry", card);
      window.location.assign(`/?${params.toString()}#generator`);
      return;
    }

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
      emitGuideEvent("inkfirst:guide-prompt-copy", card);
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
