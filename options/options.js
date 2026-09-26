(async function setupOptions() {
  "use strict";

  const api = globalThis.SlopSpotter;
  const enabled = document.querySelector("#enabled");
  const sensitivity = document.querySelector("#sensitivity");
  const clickbait = document.querySelector("#flagClickbait");
  const stats = document.querySelector("#stats");
  const status = document.querySelector("#status");
  const keyInput = document.querySelector("#jevApiKey");
  const keyStatus = document.querySelector("#keyStatus");
  async function refreshKeyStatus() {
    const jevApiKey = await JevKeyStore.get();
    keyStatus.textContent = jevApiKey ? "Key saved in this browser. Reload X to analyze posts." : "No API key saved. Analysis is unavailable.";
  }
  document.querySelector("#saveKey").addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) { keyStatus.textContent = "Enter an API key first."; return; }
    await JevKeyStore.set(key);
    keyInput.value = "";
    await refreshKeyStatus();
  });
  document.querySelector("#removeKey").addEventListener("click", async () => {
    await JevKeyStore.remove();
    keyInput.value = "";
    await refreshKeyStatus();
  });
  await refreshKeyStatus();

  async function refreshDashboard() {
    const dashboard = await api.getDashboard();
    const accountLabel = dashboard.observedAccounts === 1 ? "account" : "accounts";
    stats.textContent = `${dashboard.observedPosts} unique posts from ${dashboard.observedAccounts} ${accountLabel} are represented locally; ${dashboard.flaggedPosts} were flagged.`;
  }

  async function save(patch) {
    await api.updateSettings(patch);
    status.textContent = "Saved. Open X tabs update automatically.";
  }

  await api.init();
  const settings = await api.getSettings();
  enabled.checked = settings.enabled;
  sensitivity.value = settings.sensitivity;
  clickbait.checked = settings.flagClickbait !== false;
  await refreshDashboard();

  enabled.addEventListener("change", () => save({ enabled: enabled.checked }));
  sensitivity.addEventListener("change", () =>
    save({ sensitivity: sensitivity.value })
  );
  clickbait.addEventListener("change", () => save({ flagClickbait: clickbait.checked }));
  document.querySelector("#clearHistory").addEventListener("click", async () => {
    if (!confirm("Clear all locally stored post observations?")) {
      return;
    }
    await api.clearHistory();
    status.textContent = "Local observation history cleared.";
    await refreshDashboard();
  });
})();
