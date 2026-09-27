(async function setupPopup() {
  "use strict";

  const api = globalThis.ScrollGuard;
  const $ = (selector) => document.querySelector(selector);
  const enabled = $("#enabled");
  const setup = $("#setup");
  const panel = $("#panel");
  const summary = $("#summary");
  const diagnostics = $("#diagnostics");
  const status = $("#status");
  const RESTING = status.textContent;
  let statusTimer;
  let hasKey = false;
  const refreshTail = globalThis.ScrollGuardPanel.attachKeyTail($("#jevApiKey"));

  // Confirmations replace the footer credit briefly, so nothing shifts.
  function flash(message) {
    status.textContent = message;
    status.classList.add("flash");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.textContent = RESTING;
      status.classList.remove("flash");
    }, 2200);
  }

  // Show only problems the user can act on.
  function showDiagnostics(result) {
    const problem = result?.errorCount > 0 ? `Scanner error: ${result.lastError || "unknown failure"}` : "";
    diagnostics.textContent = problem;
    diagnostics.hidden = !problem;
  }

  async function showSummary(dashboard) {
    const settings = await api.getSettings();
    const { checked, flagged } = dashboard.recent;
    document.body.classList.toggle("paused", !settings.enabled);
    summary.hidden = !hasKey;
    if (!settings.enabled) {
      $("#figure").textContent = "Paused";
      $("#figureUnit").textContent = "";
      $("#summaryLine").textContent = "Posts on X are not being checked.";
    } else if (checked === 0) {
      $("#figure").textContent = "0";
      $("#figureUnit").textContent = "flagged";
      $("#summaryLine").textContent = "Nothing checked in the last 24 hours yet.";
    } else {
      $("#figure").textContent = String(flagged);
      $("#figureUnit").textContent = "flagged";
      $("#summaryLine").textContent = `of ${checked} checked in the last 24 hours`;
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
    const button = $("#keyForm button");
    const keyStatus = $("#keyStatus");
    button.disabled = true;
    button.textContent = "Checking…";
    keyStatus.textContent = "";
    try {
      const result = await JevKeyStore.verifyAndSave(key);
      if (!result.saved) {
        keyStatus.textContent = "Jev rejected this key.";
        input.select();
        return;
      }
      input.value = "";
      refreshTail();
      await showKeyState();
      await showSummary(await api.getDashboard());
      flash(result.verified ? "Key works · reload X" : "Saved · Jev unreachable");
    } finally {
      button.disabled = false;
      button.textContent = "Save";
    }
  });

  // Jev finishes asynchronously; keep an open popup in sync.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.slopSpotterDiagnosticsV1?.newValue) {
      showDiagnostics(changes.slopSpotterDiagnosticsV1.newValue);
    }
  });

  await api.init();
  const settings = await api.getSettings();
  const dashboard = await api.getDashboard();
  enabled.checked = settings.enabled;
  const controls = await globalThis.ScrollGuardPanel.mount(panel, api, {
    counts: dashboard.recent.byVerdict,
    onChange: async (next, change) => {
      if (next) enabled.checked = next.enabled;
      if (change.paused || change.resumed) await showSummary(await api.getDashboard());
      flash(change.paused ? "Nothing to flag · paused" : change.resumed ? "On" : "Saved");
    }
  });
  enabled.addEventListener("change", async () => {
    const next = await api.updateSettings({ enabled: enabled.checked });
    // Switching on with every type off brings every type back.
    controls.setVerdicts(next.verdicts);
    await showSummary(await api.getDashboard());
    flash(enabled.checked ? "On" : "Paused");
  });
  $("#options").addEventListener("click", () => chrome.runtime.openOptionsPage());

  await showKeyState();
  await showSummary(dashboard);
  showDiagnostics(await api.getDiagnostics());
})();
