globalThis.SlopSpotter = Object.assign(globalThis.SlopSpotter || {}, {
  async detectSlop(text, options = {}) {
    const response = await chrome.runtime.sendMessage({ type: "jev-evaluate", text, sensitivity: options.sensitivity });
    if (!response?.detection) throw new Error(response?.error || "Jev background worker unavailable.");
    return response.detection;
  }
});
