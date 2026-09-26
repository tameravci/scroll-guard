(function startContentScript(root) {
  "use strict";

  const api = root.SlopSpotter;
  if (!api?.detectSlop || !api?.parsePost || !api?.recordObservation) {
    return;
  }

  let settings;
  let observer;
  let scanScheduled = false;
  let generation = 0;
  let postInputs = new WeakMap();
  let diagnosticOutcomes = new WeakMap();
  let lastProcessingError = "";

  function safeErrorMessage(error) {
    const name = String(error?.name || "Error");
    const message = String(error?.message || "Unknown content-script failure");
    return `${name}: ${message}`.slice(0, 180);
  }

  function publishDiagnostics() {
    const articles = api.findPosts(root.document);
    const outcomes = articles.map((article) => diagnosticOutcomes.get(article)).filter(Boolean);
    api.reportDiagnostics({
      lastScanAt: Date.now(),
      origin: root.location.origin,
      articleCount: articles.length,
      parsedCount: outcomes.filter((outcome) => outcome.parsed).length,
      evidenceCount: outcomes.filter((outcome) => outcome.evidence).length,
      highlightedCount: outcomes.filter((outcome) => outcome.highlighted).length,
      errorCount: outcomes.filter((outcome) => outcome.error).length,
      lastError: lastProcessingError
    }).catch(() => undefined);
  }

  function callbacksFor(parsed) {
    return {
      onBlock() {
        try {
          api.openBlockHandoff(parsed.handle);
        } catch {
          api.showHandoffStatus({
            state: "error",
            handle: parsed.handle,
            message: "Could not open a safe X profile URL for this account."
          });
        }
      }
    };
  }

  function mountFinding(article, payload) {
    api.mountPostAnnotation(article, payload, callbacksFor(payload.parsed));
  }

  function scheduleScan() {
    if (scanScheduled || !settings?.enabled) {
      return;
    }
    scanScheduled = true;
    const run = () => {
      scanScheduled = false;
      scanVisiblePosts();
    };
    if (typeof root.requestIdleCallback === "function") {
      root.requestIdleCallback(run, { timeout: 500 });
    } else {
      root.setTimeout(run, 80);
    }
  }

  async function processPost(article, expectedGeneration) {
    const parsed = api.parsePost(article);
    if (!parsed || expectedGeneration !== generation || !settings?.enabled) return;
    const input = JSON.stringify([parsed.handle, parsed.statusId, parsed.text]);
    // X can reuse a card for another post while a remote decision is pending.
    if (postInputs.get(article) !== input) {
      postInputs.set(article, input);
      diagnosticOutcomes.delete(article);
      delete article.dataset.slopSpotterProcessed;
      delete article.dataset.slopSpotterPending;
      delete article.dataset.slopSpotterFlagged;
      article.querySelector("[data-slop-spotter-host]")?.remove();
      delete article.dataset.slopSpotterVerdict;
    }
    const current = () => {
      const latest = api.parsePost(article);
      return expectedGeneration === generation && settings?.enabled && article.isConnected &&
        postInputs.get(article) === input && latest?.handle === parsed.handle &&
        latest?.statusId === parsed.statusId && latest?.text === parsed.text;
    };
    const alreadyProcessed =
      article.dataset.slopSpotterProcessed === String(expectedGeneration);
    const flaggedBefore =
      article.dataset.slopSpotterFlagged === String(expectedGeneration);
    const annotationPresent = article.querySelector("[data-slop-spotter-host]");
    if (
      (alreadyProcessed && (!flaggedBefore || annotationPresent)) ||
      article.dataset.slopSpotterPending === String(expectedGeneration)
    ) {
      return;
    }
    article.dataset.slopSpotterPending = String(expectedGeneration);

    try {
      const detection = await api.detectSlop(parsed.text, {
        sensitivity: settings.sensitivity,
        flagClickbait: settings.flagClickbait
      });
      if (!current()) return;
      const fingerprint = await api.fingerprintPost(
        parsed.handle,
        parsed.statusId,
        parsed.text
      );
      if (!current()) return;
      await api.recordObservation({
        handle: parsed.handle,
        fingerprint,
        flagged: detection.isFlagged,
        families: detection.families,
        at: Date.now()
      });

      if (!current()) {
        return;
      }

      if (detection.isFlagged) {
        article.dataset.slopSpotterFlagged = String(expectedGeneration);
        mountFinding(article, { detection, parsed });
      } else {
        delete article.dataset.slopSpotterFlagged;
      }
      diagnosticOutcomes.set(article, {
        parsed: true,
        evidence: detection.evidence.length > 0,
        highlighted: detection.isFlagged,
        error: false
      });
      article.dataset.slopSpotterProcessed = String(expectedGeneration);
    } catch (error) {
      if (!current()) return;
      // Avoid repeated paid requests on every DOM mutation after a failure.
      article.dataset.slopSpotterProcessed = String(expectedGeneration);
      lastProcessingError = safeErrorMessage(error);
      diagnosticOutcomes.set(article, {
        parsed: false,
        evidence: false,
        highlighted: false,
        error: true
      });
      throw error;
    } finally {
      if (postInputs.get(article) === input && article.dataset.slopSpotterPending === String(expectedGeneration)) {
        delete article.dataset.slopSpotterPending;
      }
      publishDiagnostics();
    }
  }

  function scanVisiblePosts() {
    const currentGeneration = generation;
    const articles = api.findPosts(root.document);
    publishDiagnostics();
    articles.forEach((article) => {
      processPost(article, currentGeneration).catch(() => undefined);
    });
  }

  function startObserver() {
    observer?.disconnect();
    observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
        scheduleScan();
      }
    });
    observer.observe(root.document.documentElement, { childList: true, subtree: true });
    scheduleScan();
  }

  function resetForSettings(nextSettings) {
    settings = nextSettings;
    generation += 1;
    postInputs = new WeakMap();
    diagnosticOutcomes = new WeakMap();
    lastProcessingError = "";
    api.removeAllAnnotations();
    api.findPosts(root.document).forEach((article) => {
      delete article.dataset.slopSpotterProcessed;
      delete article.dataset.slopSpotterPending;
      delete article.dataset.slopSpotterFlagged;
    });

    if (settings.enabled) {
      startObserver();
    } else {
      observer?.disconnect();
    }
  }

  async function main() {
    await api.init();
    api.handleBlockHandoff(api.showHandoffStatus).catch(() => {
      api.showHandoffStatus({
        state: "manual",
        message: "The automatic handoff failed. Use the profile’s ••• menu to block manually."
      });
    });

    settings = await api.getSettings();
    if (settings.enabled) {
      startObserver();
    }

    api.onStateChanged((state) => {
      const next = state.settings;
      if (
        next.enabled !== settings.enabled ||
        next.sensitivity !== settings.sensitivity ||
        next.flagClickbait !== settings.flagClickbait
      ) {
        resetForSettings(next);
      } else {
        settings = next;
      }
    });
  }

  main().catch((error) => {
    lastProcessingError = safeErrorMessage(error);
    api.reportDiagnostics({
      lastScanAt: Date.now(),
      origin: root.location.origin,
      errorCount: 1,
      lastError: lastProcessingError
    }).catch(() => undefined);
  });
})(globalThis);
