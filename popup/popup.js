(async function setupPopup() {
  "use strict";

  const api = globalThis.SlopSpotter;
  const enabled = document.querySelector("#enabled");
  const sensitivity = document.querySelector("#sensitivity");
  const suggestions = document.querySelector("#showBlockSuggestions");
  const status = document.querySelector("#status");
  const stats = document.querySelector("#stats");
  const diagnosticsNode = document.querySelector("#diagnostics");
  const tagline = document.querySelector("#tagline");

  function showDiagnostics(diagnostics) {
    diagnosticsNode.classList.remove("warning");
    if (!diagnostics.lastScanAt) {
      diagnosticsNode.textContent = "No X scan recorded yet. Reload an open X tab.";
      diagnosticsNode.classList.add("warning");
      return;
    }
    if (diagnostics.errorCount > 0) {
      diagnosticsNode.textContent = `Scanner error: ${diagnostics.lastError || "unknown failure"}`;
      diagnosticsNode.classList.add("warning");
      return;
    }
    if (diagnostics.articleCount === 0) {
      diagnosticsNode.textContent = "Scanner ran, but X exposed 0 post cards on the current page.";
      diagnosticsNode.classList.add("warning");
      return;
    }
    if (diagnostics.parsedCount === 0) {
      diagnosticsNode.textContent = `Saw ${diagnostics.articleCount} post cards but could not parse their text and author.`;
      diagnosticsNode.classList.add("warning");
      return;
    }
    if (diagnostics.evidenceCount > 0 && diagnostics.highlightedCount === 0) {
      diagnosticsNode.textContent = `Parsed ${diagnostics.parsedCount} posts and found pattern evidence, but the current sensitivity suppressed it.`;
      diagnosticsNode.classList.add("warning");
      return;
    }
    diagnosticsNode.textContent = `Latest X scan: ${diagnostics.parsedCount} parsed, ${diagnostics.highlightedCount} highlighted.`;
  }

  async function save(patch) {
    status.textContent = "Saving…";
    await api.updateSettings(patch);
    status.textContent = "Saved. Open X tabs update automatically.";
  }

  await api.init();
  tagline.textContent = `v${chrome.runtime.getManifest().version} · Checkable patterns, not AI guesses.`;
  const settings = await api.getSettings();
  const dashboard = await api.getDashboard();
  const diagnostics = await api.getDiagnostics();
  enabled.checked = settings.enabled;
  sensitivity.value = settings.sensitivity;
  suggestions.checked = settings.showBlockSuggestions;
  stats.textContent = `${dashboard.flaggedPosts} flagged of ${dashboard.observedPosts} locally observed posts.`;
  showDiagnostics(diagnostics);

  enabled.addEventListener("change", () => save({ enabled: enabled.checked }));
  sensitivity.addEventListener("change", () =>
    save({ sensitivity: sensitivity.value })
  );
  suggestions.addEventListener("change", () =>
    save({ showBlockSuggestions: suggestions.checked })
  );
  document.querySelector("#options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
})();
