(async function setupPopup() {
  "use strict";

  const api = globalThis.SlopSpotter;
  const enabled = document.querySelector("#enabled");
  const sensitivity = document.querySelector("#sensitivity");
  const clickbait = document.querySelector("#flagClickbait");
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

  // Jev finishes asynchronously; keep an already-open popup in sync.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.slopSpotterDiagnosticsV1?.newValue) {
      showDiagnostics(changes.slopSpotterDiagnosticsV1.newValue);
    }
  });

  await api.init();
  tagline.textContent = `v${chrome.runtime.getManifest().version} · Writing assessed by TypeSafe Jev.`;
  const settings = await api.getSettings();
  const dashboard = await api.getDashboard();
  const diagnostics = await api.getDiagnostics();
  enabled.checked = settings.enabled;
  sensitivity.value = settings.sensitivity;
  clickbait.checked = settings.flagClickbait !== false;
  stats.textContent = `${dashboard.flaggedPosts} flagged of ${dashboard.observedPosts} locally observed posts.`;
  showDiagnostics(diagnostics);

  enabled.addEventListener("change", () => save({ enabled: enabled.checked }));
  sensitivity.addEventListener("change", () =>
    save({ sensitivity: sensitivity.value })
  );
  clickbait.addEventListener("change", () => save({ flagClickbait: clickbait.checked }));
  document.querySelector("#options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
})();
