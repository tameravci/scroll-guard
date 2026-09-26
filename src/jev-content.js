globalThis.SlopSpotter = Object.assign(globalThis.SlopSpotter || {}, {
  async detectSlop(text, options = {}) {
    const response = await chrome.runtime.sendMessage({ type: "jev-evaluate", text, sensitivity: options.sensitivity, verdicts: options.verdicts });
    if (!response?.detection) {
      const error = new Error(response?.error || "Jev background worker unavailable.");
      error.retryable = response?.retryable === true;
      error.visible = response?.visible !== false;
      throw error;
    }
    return response.detection;
  }
});
