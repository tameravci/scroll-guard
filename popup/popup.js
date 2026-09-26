(async function setupPopup() {
  "use strict";

  const api = globalThis.SlopSpotter;
  const $ = (selector) => document.querySelector(selector);
  const enabled = $("#enabled");
  const setup = $("#setup");
  const panel = $("#panel");
  const stats = $("#stats");
  const diagnostics = $("#diagnostics");
  const status = $("#status");
  let statusTimer;
  let hasKey = false;

  function flash(message) {
    status.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ""; }, 2500);
  }

  // Show only problems the user can act on. Routine scan counts go in the footer.
  function showDiagnostics(result) {
    const problem = result?.errorCount > 0 ? `Scanner error: ${result.lastError || "unknown failure"}` : "";
    diagnostics.textContent = problem;
    diagnostics.hidden = !problem;
  }

  async function showStats() {
    const settings = await api.getSettings();
    const dashboard = await api.getDashboard();
    document.body.classList.toggle("paused", !settings.enabled);
    if (!hasKey) {
      stats.textContent = "Needs an API key";
    } else if (!settings.enabled) {
      stats.textContent = "Paused";
    } else if (dashboard.observedPosts === 0) {
      stats.textContent = "Open x.com to start";
    } else {
      stats.textContent = `${dashboard.observedPosts} checked · ${dashboard.flaggedPosts} flagged`;
    }
  }

  async function showKeyState() {
    hasKey = Boolean(await JevKeyStore.get());
    setup.hidden = hasKey;
    panel.hidden = !hasKey;
    if (!hasKey) $("#jevApiKey").focus();
  }

  $("#keyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("#jevApiKey");
    const key = input.value.trim();
    if (!key) {
      $("#keyStatus").textContent = "Paste a key first.";
      return;
    }
    await JevKeyStore.set(key);
    input.value = "";
    await showKeyState();
    await showStats();
    flash("Key saved. Reload X to start.");
  });

  // Jev finishes asynchronously; keep an open popup in sync.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.slopSpotterDiagnosticsV1?.newValue) {
      showDiagnostics(changes.slopSpotterDiagnosticsV1.newValue);
    }
  });

  await api.init();
  const settings = await api.getSettings();
  enabled.checked = settings.enabled;
  enabled.addEventListener("change", async () => {
    await api.updateSettings({ enabled: enabled.checked });
    await showStats();
    flash(enabled.checked ? "On. Open X tabs update automatically." : "Paused.");
  });
  await globalThis.SlopSpotterPanel.mount(panel, api, {
    compact: true,
    onSaved: () => flash("Saved. Open X tabs update automatically.")
  });
  $("#options").addEventListener("click", () => chrome.runtime.openOptionsPage());

  await showKeyState();
  await showStats();
  showDiagnostics(await api.getDiagnostics());
})();
