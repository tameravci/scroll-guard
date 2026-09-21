(async function setupOptions() {
  "use strict";

  const api = globalThis.SlopSpotter;
  const enabled = document.querySelector("#enabled");
  const sensitivity = document.querySelector("#sensitivity");
  const suggestions = document.querySelector("#showBlockSuggestions");
  const ignored = document.querySelector("#ignored");
  const stats = document.querySelector("#stats");
  const status = document.querySelector("#status");
  const keyInput = document.querySelector("#jevApiKey");
  const keyStatus = document.querySelector("#keyStatus");
  async function refreshKeyStatus() {
    const { jevApiKey } = await chrome.storage.session.get("jevApiKey");
    keyStatus.textContent = jevApiKey ? "Key saved for this session. Reload X to analyze posts." : "No API key saved. Analysis is unavailable.";
  }
  document.querySelector("#saveKey").addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) { keyStatus.textContent = "Enter an API key first."; return; }
    await chrome.storage.session.set({ jevApiKey: key });
    keyInput.value = "";
    await refreshKeyStatus();
  });
  document.querySelector("#removeKey").addEventListener("click", async () => {
    await chrome.storage.session.remove("jevApiKey");
    keyInput.value = "";
    await refreshKeyStatus();
  });
  await refreshKeyStatus();

  async function refreshDashboard() {
    const dashboard = await api.getDashboard();
    const accountLabel = dashboard.observedAccounts === 1 ? "account" : "accounts";
    stats.textContent = `${dashboard.observedPosts} unique posts from ${dashboard.observedAccounts} ${accountLabel} are represented locally; ${dashboard.flaggedPosts} were flagged.`;
    ignored.replaceChildren();

    if (dashboard.ignoredHandles.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No ignored accounts.";
      ignored.append(empty);
      return;
    }

    dashboard.ignoredHandles.forEach((handle) => {
      const row = document.createElement("div");
      row.className = "ignored-account";
      const name = document.createElement("strong");
      name.textContent = `@${handle}`;
      const restore = document.createElement("button");
      restore.type = "button";
      restore.textContent = "Allow suggestions";
      restore.addEventListener("click", async () => {
        await api.restoreAccount(handle);
        status.textContent = `Suggestions restored for @${handle}.`;
        await refreshDashboard();
      });
      row.append(name, restore);
      ignored.append(row);
    });
  }

  async function save(patch) {
    await api.updateSettings(patch);
    status.textContent = "Saved. Open X tabs update automatically.";
  }

  await api.init();
  const settings = await api.getSettings();
  enabled.checked = settings.enabled;
  sensitivity.value = settings.sensitivity;
  suggestions.checked = settings.showBlockSuggestions;
  await refreshDashboard();

  enabled.addEventListener("change", () => save({ enabled: enabled.checked }));
  sensitivity.addEventListener("change", () =>
    save({ sensitivity: sensitivity.value })
  );
  suggestions.addEventListener("change", () =>
    save({ showBlockSuggestions: suggestions.checked })
  );
  document.querySelector("#clearHistory").addEventListener("click", async () => {
    if (!confirm("Clear all locally stored post observations and ignored accounts?")) {
      return;
    }
    await api.clearHistory();
    status.textContent = "Local observation history cleared.";
    await refreshDashboard();
  });
})();
