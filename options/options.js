(async function setupPage() {
  "use strict";

  const api = globalThis.ScrollGuard;
  const $ = (selector) => document.querySelector(selector);
  const keyInput = $("#jevApiKey");
  const refreshTail = globalThis.ScrollGuardPanel.attachKeyTail(keyInput);
  const keyForm = $("#keyForm");
  const keyActions = $("#keyActions");
  const keyStatus = $("#keyStatus");
  const status = $("#status");
  let statusTimer;

  function flash(message) {
    status.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ""; }, 3000);
  }

  // Setup has two steps. The flag options unlock once a key exists.
  async function showKeyState() {
    const key = await JevKeyStore.get();
    $("#keyCard").classList.toggle("done", Boolean(key));
    $("#prefsCard").setAttribute("aria-disabled", String(!key));
    keyForm.hidden = Boolean(key);
    keyActions.hidden = !key;
    keyStatus.textContent = key
      ? `Key saved · ends in ${key.slice(-4)}. Reload any open X tab to start.`
      : "No API key saved yet.";
    if (!key) keyInput.focus();
  }

  keyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = keyInput.value.trim();
    if (!key) {
      keyStatus.textContent = "Paste a key first.";
      return;
    }
    const button = $("#saveKey");
    button.disabled = true;
    button.textContent = "Checking…";
    keyStatus.textContent = "Testing the key with Jev…";
    try {
      const result = await JevKeyStore.verifyAndSave(key);
      if (!result.saved) {
        keyStatus.textContent = "Jev rejected this key. Check it and try again.";
        keyInput.select();
        return;
      }
      keyInput.value = "";
      refreshTail();
      await showKeyState();
      if (!result.verified) keyStatus.textContent += " Jev could not be reached to test it.";
    } finally {
      button.disabled = false;
      button.textContent = "Save key";
    }
  });
  $("#replaceKey").addEventListener("click", () => {
    keyForm.hidden = false;
    keyActions.hidden = true;
    keyInput.focus();
  });
  $("#removeKey").addEventListener("click", async () => {
    await JevKeyStore.remove();
    await showKeyState();
  });

  const stats = $("#stats");
  async function showStats() {
    const dashboard = await api.getDashboard();
    stats.textContent = `${dashboard.observedPosts} posts checked, ${dashboard.flaggedPosts} flagged. Stored on this device only.`;
  }

  $("#clearHistory").addEventListener("click", async () => {
    if (!confirm("Clear all locally stored post history?")) return;
    await api.clearHistory();
    await showStats();
    flash("Local history cleared.");
  });

  await api.init();
  await globalThis.ScrollGuardPanel.mount($("#panel"), api, {
    hints: true,
    onChange: (next, change) => flash(
      change.paused ? "Every type is off, so Scroll Guard is paused. Check one to turn it back on."
        : change.resumed ? "Scroll Guard is back on."
          : "Saved. Open X tabs update automatically."
    )
  });
  await showKeyState();
  await showStats();
})();
