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
  let analyzedPosts = new WeakMap();
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

  function hasVisibleSuggestion(handle, exceptArticle) {
    return [...root.document.querySelectorAll("[data-slop-spotter-host]")].some(
      (host) =>
        host.dataset.slopSpotterSuggestion === "true" &&
        host.dataset.slopSpotterHandle === handle.toLowerCase() &&
        !exceptArticle?.contains(host)
    );
  }

  function callbacksFor(parsed) {
    return {
      onBlock() {
        try {
          api.openBlockHandoff(parsed.handle);
          api.snoozeAccount(parsed.handle, 24 * 60 * 60 * 1000).catch(() => undefined);
        } catch {
          api.showHandoffStatus({
            state: "error",
            handle: parsed.handle,
            message: "Could not open a safe X profile URL for this account."
          });
        }
      },
      onSnooze() {
        return api.snoozeAccount(parsed.handle, 7 * 24 * 60 * 60 * 1000);
      },
      onIgnore() {
        return api.ignoreAccount(parsed.handle);
      }
    };
  }

  function mountFinding(article, payload, account) {
    const shouldSuggest =
      account.shouldSuggest && !hasVisibleSuggestion(payload.parsed.handle, article);
    api.mountPostAnnotation(
      article,
      {
        ...payload,
        account: { ...account, shouldSuggest }
      },
      callbacksFor(payload.parsed)
    );
  }

  function placeEligibleSuggestion(handle, account) {
    if (!account.shouldSuggest || hasVisibleSuggestion(handle)) {
      return;
    }
    for (const article of api.findPosts(root.document)) {
      const payload = analyzedPosts.get(article);
      if (
        payload?.detection.isSlop &&
        payload.parsed.handle.toLowerCase() === handle.toLowerCase()
      ) {
        mountFinding(article, payload, account);
        return;
      }
    }
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
      const parsed = api.parsePost(article);
      if (!parsed || expectedGeneration !== generation || !settings?.enabled) {
        if (!parsed) {
          diagnosticOutcomes.set(article, {
            parsed: false,
            evidence: false,
            highlighted: false,
            error: false
          });
        }
        return;
      }

      const detection = await api.detectSlop(parsed.text, {
        sensitivity: settings.sensitivity
      });
      if (expectedGeneration !== generation || !settings?.enabled || !article.isConnected) return;
      const fingerprint = await api.fingerprintPost(
        parsed.handle,
        parsed.statusId,
        parsed.text
      );
      const account = await api.recordObservation({
        handle: parsed.handle,
        fingerprint,
        flagged: detection.isSlop,
        families: detection.families,
        at: Date.now()
      });

      if (expectedGeneration !== generation || !settings?.enabled) {
        return;
      }

      if (detection.isSlop) {
        const payload = { detection, parsed };
        analyzedPosts.set(article, payload);
        article.dataset.slopSpotterFlagged = String(expectedGeneration);
        mountFinding(article, payload, account);
      } else {
        delete article.dataset.slopSpotterFlagged;
      }
      diagnosticOutcomes.set(article, {
        parsed: true,
        evidence: detection.evidence.length > 0,
        highlighted: detection.isSlop,
        error: false
      });
      placeEligibleSuggestion(parsed.handle, account);
      article.dataset.slopSpotterProcessed = String(expectedGeneration);
    } catch (error) {
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
      delete article.dataset.slopSpotterPending;
      publishDiagnostics();
    }
  }

  function scanVisiblePosts() {
    const currentGeneration = generation;
    const articles = api.findPosts(root.document);
    publishDiagnostics();
    articles.forEach((article) => {
      processPost(article, currentGeneration).catch(() => {
        delete article.dataset.slopSpotterPending;
      });
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
    analyzedPosts = new WeakMap();
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
        next.showBlockSuggestions !== settings.showBlockSuggestions
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
