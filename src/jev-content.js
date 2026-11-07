globalThis.ScrollGuard = Object.assign(globalThis.ScrollGuard || {}, {
  async detectSlop(post, options = {}) {
    const { text, quote, images } = typeof post === "string" ? { text: post } : post;
    const response = await chrome.runtime.sendMessage({ type: "jev-evaluate", text, quote, images, sensitivity: options.sensitivity, verdicts: options.verdicts });
    if (!response?.detection) {
      const error = new Error(response?.error || "Jev background worker unavailable.");
      error.retryable = response?.retryable === true;
      error.visible = response?.visible !== false;
      throw error;
    }
    return response.detection;
  }
});
