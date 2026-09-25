(function attachUi(root, factory) {
  const api = factory(root);
  root.SlopSpotter = Object.assign(root.SlopSpotter || {}, api);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createUi(root) {
  "use strict";

  const HOST_ATTRIBUTE = "data-slop-spotter-host";
  let handoffHost;

  const CARD_STYLES = `
    :host {
      color-scheme: light dark;
      --ss-amber: #f5a623;
      --ss-amber-soft: rgba(245, 166, 35, 0.10);
      --ss-border: #343638;
      --ss-text: #f5f3ed;
      display: block;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 12px 14px 14px;
      container-type: inline-size;
    }
    :host([data-slop-spotter-verdict="scam"]) {
      --ss-amber: #ff526b;
      --ss-amber-soft: rgba(255, 82, 107, 0.10);
    }
    * { box-sizing: border-box; }
    .card {
      background: #17191b;
      border: 1px solid #393b3d;
      border-radius: 16px;
      color: var(--ss-text);
      overflow: hidden;
      box-shadow: 0 6px 18px #00000018;
    }
    .masthead { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 0; gap: 12px; }
    .brand { display: flex; align-items: center; gap: 7px; color: #cbc9c2; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .brand-mark { width: 12px; height: 12px; border: 3px solid var(--ss-amber); border-radius: 50%; box-shadow: 3px -3px 0 -1px #17191b, 4px -4px 0 -1px var(--ss-amber); }
    .classification { font: 10px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--ss-amber); padding: 3px 7px; background: var(--ss-amber-soft); border-radius: 4px; }
    .summary {
      align-items: center;
      appearance: none;
      background: transparent;
      border: 0;
      color: var(--ss-text);
      cursor: pointer;
      display: flex;
      font: inherit;
      font-weight: 650;
      gap: 16px;
      padding: 14px 16px 16px;
      text-align: left;
      width: 100%;
    }
    .summary:hover { background: #ffffff05; }
    .summary:focus-visible, button:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: -4px;
    }
    .summary-copy { min-width: 0; flex: 1; }
    .verdict { display: block; font-size: 25px; font-weight: 750; letter-spacing: -0.9px; line-height: 1.15; }
    .detail-link { display: flex; align-items: center; gap: 6px; margin-top: 9px; font-size: 12px; color: #b0b2b5; font-weight: 450; }
    .probability { display: grid; place-content: center; text-align: center; flex: 0 0 64px; height: 64px; border-radius: 50%; background: radial-gradient(closest-side, #17191b 86%, transparent 88%), conic-gradient(var(--ss-amber) var(--ss-probability), #353739 0); }
    .probability-value { font: 700 19px/1.1 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: -1px; }
    .probability-label { font-size: 8px; letter-spacing: 0.02em; color: #a4a6a9; margin-top: 3px; }
    .chevron { display: inline-block; font-size: 15px; transition: transform 120ms ease; }
    .summary[aria-expanded="true"] .chevron { transform: rotate(180deg); }
    .details {
      border-top: 1px solid var(--ss-border);
      padding: 16px;
      background: #121416;
    }
    .details[hidden] { display: none; }
    .evidence {
      display: grid;
      gap: 9px;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .evidence-name { display: block; font-weight: 650; }
    .quote {
      display: block;
      margin-top: 2px;
      opacity: 0.82;
      overflow-wrap: anywhere;
    }
    .fix { display: block; margin-top: 5px; color: #b0b2b5; }
    .disclaimer {
      border-top: 1px solid var(--ss-border);
      font-size: 12px;
      margin: 10px 0 0;
      color: #a4a6a9;
      padding-top: 8px;
    }
    .suggestion {
      background: var(--ss-amber-soft);
      border-top: 1px solid var(--ss-amber);
      padding: 11px 12px 12px;
    }
    .suggestion-title { font-weight: 700; margin: 0 0 3px; }
    .suggestion-copy { font-size: 13px; margin: 0 0 10px; opacity: 0.8; }
    .actions { display: flex; flex-wrap: wrap; gap: 7px; }
    .direct-actions { padding: 12px 16px; align-items: center; justify-content: space-between; border-top: 1px solid var(--ss-border); background: #ffffff03; gap: 10px; }
    .action-note { font-size: 11px; color: #a4a6a9; }
    .direct-actions .status { flex-basis: 100%; margin: 0; }
    .direct-actions .status:empty { display: none; }
    .actions button {
      appearance: none;
      background: transparent;
      border: 1px solid var(--ss-border);
      border-radius: 8px;
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 650;
      padding: 9px 12px;
    }
    .actions button:hover { background: rgba(127, 127, 127, 0.12); }
    .actions .block {
      background: #f1eee6;
      border-color: transparent;
      color: #151719;
      max-width: 100%;
      overflow-wrap: anywhere;
      transition: background 120ms ease, transform 120ms ease;
    }
    .actions .block::after { content: "↗"; margin-left: 12px; }
    .actions .block:hover { background: var(--ss-amber); transform: translateY(-1px); }
    .actions .block:active { transform: translateY(0); }
    :host([data-slop-spotter-verdict="scam"]) .actions .block { background: #ffdce1; }
    :host([data-slop-spotter-verdict="scam"]) .actions .block:hover { background: var(--ss-amber); }
    .status { font-size: 12px; margin: 8px 0 0; opacity: 0.75; }
    @container (max-width: 340px) {
      .masthead { padding: 12px 12px 0; }
      .summary { padding: 14px 12px; gap: 10px; }
      .verdict { font-size: 23px; }
      .direct-actions { padding: 12px; }
      .action-note { display: none; }
      .actions .block { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) { .chevron, .actions .block { transition: none; } }
  `;

  const BANNER_STYLES = `
    :host {
      color-scheme: light dark;
      display: block;
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    .banner {
      align-items: center;
      background: #191919;
      border: 1px solid rgba(255, 176, 0, 0.68);
      border-radius: 14px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.32);
      color: #f5f5f5;
      display: flex;
      gap: 10px;
      margin: 12px auto;
      max-width: 620px;
      padding: 12px 14px;
    }
    .mark { color: #ffb000; font-size: 20px; }
    .copy { flex: 1; }
    .title { display: block; font-weight: 750; margin-bottom: 1px; }
    button {
      appearance: none;
      background: transparent;
      border: 0;
      border-radius: 50%;
      color: #f5f5f5;
      cursor: pointer;
      font-size: 20px;
      height: 32px;
      width: 32px;
    }
    button:hover { background: rgba(255, 255, 255, 0.1); }
    button:focus-visible { outline: 2px solid #ffb000; }
  `;

  function element(tagName, className, text) {
    const node = root.document.createElement(tagName);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function evidenceItem(item) {
    const li = element("li");
    li.append(element("span", "evidence-name", item.name));
    li.append(element("span", "quote", item.excerpt));
    li.append(element("span", "fix", item.fix));
    return li;
  }

  function buildSuggestion(parsed, account, callbacks, host) {
    const section = element("section", "suggestion");
    const title = element("p", "suggestion-title", `Consider blocking @${parsed.handle}?`);
    const copy = element(
      "p",
      "suggestion-copy",
      `${account.flaggedCount} of ${account.observedCount} locally observed posts matched ${account.familyCount} pattern families.`
    );
    const actions = element("div", "actions");
    const block = element("button", "block", `Block @${parsed.handle}`);
    const snooze = element("button", "", "Not now");
    const ignore = element("button", "", "Never suggest");
    const status = element("p", "status");
    status.setAttribute("role", "status");

    block.type = "button";
    block.setAttribute("aria-label", `Block @${parsed.handle}`);
    snooze.type = "button";
    ignore.type = "button";

    block.addEventListener("click", () => {
      status.textContent = "Opening the verified X profile and native confirmation…";
      callbacks.onBlock?.();
    });
    snooze.addEventListener("click", async () => {
      await callbacks.onSnooze?.();
      host.dataset.slopSpotterSuggestion = "false";
      section.remove();
    });
    ignore.addEventListener("click", async () => {
      await callbacks.onIgnore?.();
      host.dataset.slopSpotterSuggestion = "false";
      section.remove();
    });

    actions.append(block, snooze, ignore);
    section.append(title, copy, actions, status);
    return section;
  }

  function mountPostAnnotation(article, payload, callbacks) {
    const existing = article.querySelector(`[${HOST_ATTRIBUTE}]`);
    existing?.remove();

    const host = element("div");
    host.setAttribute(HOST_ATTRIBUTE, "");
    const verdict = payload.detection.isScam ? "scam" : "slop";
    host.dataset.slopSpotterVerdict = verdict;
    host.dataset.slopSpotterHandle = payload.parsed.handle.toLowerCase();
    host.dataset.slopSpotterSuggestion = String(payload.account?.shouldSuggest === true);
    host.addEventListener("click", (event) => event.stopPropagation());
    host.addEventListener("keydown", (event) => event.stopPropagation());

    const shadow = host.attachShadow({ mode: "open" });
    const style = element("style", "", CARD_STYLES);
    const card = element("aside", "card");
    card.setAttribute("aria-label", "Slop Spotter finding");
    const masthead = element("div", "masthead");
    const brand = element("span", "brand");
    const mark = element("span", "brand-mark");
    mark.setAttribute("aria-hidden", "true");
    brand.append(mark, element("span", "", "Slop Spotter"));
    masthead.append(brand, element("span", "classification", verdict === "scam" ? "SCAM SIGNAL" : "SLOP SIGNAL"));

    const summary = element("button", "summary");
    summary.type = "button";
    summary.setAttribute("aria-expanded", "false");
    summary.setAttribute("aria-controls", "finding-details");
    const copy = element("span", "summary-copy");
    const detailLink = element("span", "detail-link", "View Jev assessment");
    detailLink.append(element("span", "chevron", "⌄"));
    copy.append(element("span", "verdict", verdict === "scam" ? "Possible scam" : "Likely slop"), detailLink);
    const probability = element("span", "probability");
    const percent = Math.round(payload.detection.probability * 100);
    probability.style.setProperty("--ss-probability", `${percent}%`);
    probability.append(element("span", "probability-value", `${percent}%`), element("span", "probability-label", "probability"));
    summary.append(
      copy,
      probability
    );

    const details = element("div", "details");
    details.id = "finding-details";
    details.hidden = true;
    const list = element("ul", "evidence");
    payload.detection.evidence.forEach((item) => list.append(evidenceItem(item)));
    const disclaimer = element(
      "p",
      "disclaimer",
      verdict === "scam" ? "This is a model assessment, not verification of the account or linked website." : "Jev's writing-quality assessment is not proof that AI wrote this post."
    );
    details.append(list, disclaimer);

    summary.addEventListener("click", () => {
      const expanded = summary.getAttribute("aria-expanded") === "true";
      summary.setAttribute("aria-expanded", String(!expanded));
      details.hidden = expanded;
    });

    card.append(masthead, summary, details);
    if (payload.detection.canBlock) {
      const actions = element("div", "actions direct-actions");
      const block = element("button", "block", `Block @${payload.parsed.handle}`);
      block.type = "button";
      block.setAttribute("aria-label", `Block @${payload.parsed.handle}`);
      const status = element("p", "status");
      status.setAttribute("role", "status");
      block.addEventListener("click", () => {
        status.textContent = "Opening X's block confirmation…";
        callbacks.onBlock?.();
      });
      actions.append(element("span", "action-note", "You confirm on X"), block, status);
      card.append(actions);
    } else if (payload.account?.shouldSuggest) {
      card.append(buildSuggestion(payload.parsed, payload.account, callbacks, host));
    }
    shadow.append(style, card);
    article.classList.add("slop-spotter-flagged");
    article.dataset.slopSpotterVerdict = verdict;
    article.append(host);
    return host;
  }

  function removeAllAnnotations() {
    root.document
      ?.querySelectorAll?.(`[${HOST_ATTRIBUTE}]`)
      .forEach((host) => host.remove());
    root.document
      ?.querySelectorAll?.("article.slop-spotter-flagged")
      .forEach((article) => {
        article.classList.remove("slop-spotter-flagged");
        delete article.dataset.slopSpotterVerdict;
      });
  }

  function showHandoffStatus(status) {
    if (!root.document?.documentElement) {
      return;
    }

    if (!handoffHost) {
      handoffHost = element("div");
      handoffHost.setAttribute("data-slop-spotter-handoff", "");
      Object.assign(handoffHost.style, {
        left: "0",
        pointerEvents: "auto",
        position: "fixed",
        right: "0",
        top: "0",
        zIndex: "2147483647"
      });
      handoffHost.attachShadow({ mode: "open" });
      root.document.documentElement.append(handoffHost);
    }

    const shadow = handoffHost.shadowRoot;
    shadow.replaceChildren();
    const style = element("style", "", BANNER_STYLES);
    const banner = element("div", "banner");
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    const mark = element("span", "mark", status.state === "error" ? "!" : "⚠");
    const copy = element("div", "copy");
    copy.append(
      element("span", "title", status.handle ? `Slop Spotter · @${status.handle}` : "Slop Spotter"),
      element("span", "", status.message)
    );
    const close = element("button", "", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => {
      handoffHost.remove();
      handoffHost = null;
    });
    banner.append(mark, copy, close);
    shadow.append(style, banner);
  }

  return {
    mountPostAnnotation,
    removeAllAnnotations,
    showHandoffStatus
  };
});
