(function startContentScript(root) {
  "use strict";

  const api = root.ScrollGuard;
  if (!api?.detectSlop || !api?.parsePost || !api?.recordObservation || !api?.scheduler) {
    return;
  }

  let settings;
  let observer;
  let scanScheduled = false;
  let generation = 0;
  let postInputs = new WeakMap();
  let diagnosticOutcomes = new WeakMap();
  let lastProcessingError = "";
  let retries = new WeakMap();
  let inFlight = 0;
  let wakeTimer;
  let wakeAt = 0;
  let scrollListening = false;
  const scheduler = api.scheduler;
  const scroll = scheduler.createScrollTracker();

  function safeErrorMessage(error) {
    const name = String(error?.name || "Error");
    const message = String(error?.message || "Unknown content-script failure");
    // The worker writes plain messages; only unexpected errors keep their type name.
    return (name === "Error" ? message : `${name}: ${message}`).slice(0, 180);
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

  // Everything sent to Jev. A change in any part means a new decision.
  function inputOf(parsed) {
    return JSON.stringify([parsed.handle, parsed.statusId, parsed.text, parsed.quote, parsed.images]);
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
      pump();
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
    const input = inputOf(parsed);
    // X can reuse a card for another post while a remote decision is pending.
    if (postInputs.get(article) !== input) {
      postInputs.set(article, input);
      diagnosticOutcomes.delete(article);
      delete article.dataset.scrollGuardProcessed;
      delete article.dataset.scrollGuardPending;
      delete article.dataset.scrollGuardFlagged;
      article.querySelector("[data-scroll-guard-host]")?.remove();
      delete article.dataset.scrollGuardVerdict;
    }
    const current = () => {
      const latest = api.parsePost(article);
      return expectedGeneration === generation && settings?.enabled && article.isConnected &&
        postInputs.get(article) === input && latest && inputOf(latest) === input;
    };
    const alreadyProcessed =
      article.dataset.scrollGuardProcessed === String(expectedGeneration);
    const flaggedBefore =
      article.dataset.scrollGuardFlagged === String(expectedGeneration);
    const annotationPresent = article.querySelector("[data-scroll-guard-host]");
    if (
      (alreadyProcessed && (!flaggedBefore || annotationPresent)) ||
      article.dataset.scrollGuardPending === String(expectedGeneration)
    ) {
      return;
    }
    article.dataset.scrollGuardPending = String(expectedGeneration);

    try {
      const detection = await api.detectSlop({ text: parsed.text, quote: parsed.quote, images: parsed.images }, {
        sensitivity: settings.sensitivity,
        verdicts: settings.verdicts
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
        article.dataset.scrollGuardFlagged = String(expectedGeneration);
        mountFinding(article, { detection, parsed });
      } else {
        delete article.dataset.scrollGuardFlagged;
      }
      diagnosticOutcomes.set(article, {
        parsed: true,
        evidence: detection.evidence.length > 0,
        highlighted: detection.isFlagged,
        error: false
      });
      article.dataset.scrollGuardProcessed = String(expectedGeneration);
    } catch (error) {
      if (!current()) return;
      if (error.retryable) {
        // A busy or paused worker is temporary: keep the post and ask again after a backoff.
        const attempts = (retries.get(article)?.attempts || 0) + 1;
        const at = Date.now() + scheduler.retryDelay(attempts);
        retries.set(article, { attempts, at, input });
        wakeLater(at - Date.now());
        if (error.visible) {
          lastProcessingError = safeErrorMessage(error);
          diagnosticOutcomes.set(article, { parsed: false, evidence: false, highlighted: false, error: true });
        }
        throw error;
      }
      // Avoid repeated paid requests on every DOM mutation after a failure.
      article.dataset.scrollGuardProcessed = String(expectedGeneration);
      lastProcessingError = safeErrorMessage(error);
      diagnosticOutcomes.set(article, {
        parsed: false,
        evidence: false,
        highlighted: false,
        error: true
      });
      throw error;
    } finally {
      if (postInputs.get(article) === input && article.dataset.scrollGuardPending === String(expectedGeneration)) {
        delete article.dataset.scrollGuardPending;
      }
      publishDiagnostics();
    }
  }

  function wakeLater(delay) {
    const at = Date.now() + Math.max(0, delay);
    if (wakeTimer && wakeAt <= at) return;
    root.clearTimeout(wakeTimer);
    wakeAt = at;
    wakeTimer = root.setTimeout(() => {
      wakeTimer = undefined;
      scheduleScan();
    }, Math.max(0, delay));
  }

  // True when the post has no current verdict and is not already being checked.
  function needsCheck(article) {
    const parsed = api.parsePost(article);
    if (!parsed) return false;
    const input = inputOf(parsed);
    if (postInputs.get(article) !== input) return true;
    const current = String(generation);
    if (article.dataset.scrollGuardPending === current) return false;
    const retry = retries.get(article);
    if (retry && retry.input === input && retry.at > Date.now()) return false;
    const processed = article.dataset.scrollGuardProcessed === current;
    const flagged = article.dataset.scrollGuardFlagged === current;
    // X can re-render a flagged card without the annotation; remount from the cache.
    return !processed || (flagged && !article.querySelector("[data-scroll-guard-host]"));
  }

  // Keep a few requests open and always spend the next one on the post the reader
  // is most likely to look at: on screen first, then ahead, then just behind.
  function pump() {
    publishDiagnostics();
    if (!settings?.enabled) return;
    if (scheduler.isFling(scroll.speed())) {
      wakeLater(200);
      return;
    }
    const viewport = root.innerHeight || 800;
    const queue = scheduler.order(
      api.findPosts(root.document)
        .filter(needsCheck)
        .map((article) => ({ article, rect: article.getBoundingClientRect() })),
      viewport,
      scroll.direction()
    );
    const currentGeneration = generation;
    for (const { article } of queue) {
      if (inFlight >= scheduler.MAX_IN_FLIGHT) break;
      inFlight += 1;
      processPost(article, currentGeneration)
        .then(() => retries.delete(article), () => undefined)
        .finally(() => {
          inFlight -= 1;
          scheduleScan();
        });
    }
  }

  function startObserver() {
    observer?.disconnect();
    observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
        scheduleScan();
      }
    });
    observer.observe(root.document.documentElement, { childList: true, subtree: true });
    if (!scrollListening) {
      // Scrolling back to posts that are already rendered causes no DOM mutation.
      root.addEventListener("scroll", () => {
        scroll.update(root.scrollY, root.innerHeight);
        scheduleScan();
      }, { passive: true });
      scrollListening = true;
    }
    scheduleScan();
  }

  function resetForSettings(nextSettings) {
    settings = nextSettings;
    generation += 1;
    postInputs = new WeakMap();
    diagnosticOutcomes = new WeakMap();
    retries = new WeakMap();
    lastProcessingError = "";
    api.removeAllAnnotations();
    api.findPosts(root.document).forEach((article) => {
      delete article.dataset.scrollGuardProcessed;
      delete article.dataset.scrollGuardPending;
      delete article.dataset.scrollGuardFlagged;
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
        JSON.stringify(next.verdicts) !== JSON.stringify(settings.verdicts)
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
