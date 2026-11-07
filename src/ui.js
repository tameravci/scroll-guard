(function attachUi(root, factory) {
  const api = factory(root);
  root.ScrollGuard = Object.assign(root.ScrollGuard || {}, api);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createUi(root) {
  "use strict";

  const HOST_ATTRIBUTE = "data-scroll-guard-host";
  let handoffHost;

  const CARD_STYLES = `
    :host {
      color-scheme: light dark;
      --ss-amber: #f5a623;
      --ss-amber-soft: rgba(245, 166, 35, 0.10);
      --ss-border: #343638;
      --ss-text: #f2f1ed;
      --ss-muted: #9a9ca0;
      --ss-font: "TwitterChirp", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
      display: block;
      /* X's own Chirp face loads on the page, and shadow trees can use document fonts. */
      font: 400 14px/1.4 var(--ss-font);
      font-feature-settings: "kern" 1;
      font-kerning: normal;
      letter-spacing: -0.003em;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      /* Line up with the post text: X's text column already has its own padding. */
      margin: 12px 0;
      box-sizing: border-box;
      width: auto;
      min-width: 0;
    }
    :host([data-scroll-guard-verdict="scam"]) {
      --ss-amber: #ff526b;
      --ss-amber-soft: rgba(255, 82, 107, 0.10);
    }
    :host([data-scroll-guard-verdict="bot"]) {
      --ss-amber: #a78bfa;
      --ss-amber-soft: rgba(167, 139, 250, 0.10);
    }
    :host([data-scroll-guard-verdict="clickbait"]) {
      --ss-amber: #2dd4bf;
      --ss-amber-soft: rgba(45, 212, 191, 0.10);
    }
    :host([data-scroll-guard-verdict="shill"]) {
      --ss-amber: #5b9cff;
      --ss-amber-soft: rgba(91, 156, 255, 0.10);
    }
    * { box-sizing: border-box; }
    .card {
      background: #17191b;
      border: 1px solid #393b3d;
      border-radius: 12px;
      color: var(--ss-text);
      overflow: hidden;
    }
    .bar { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 4px; }
    .summary {
      align-items: center;
      appearance: none;
      background: transparent;
      border: 0;
      border-radius: 10px;
      color: var(--ss-text);
      cursor: pointer;
      display: flex;
      flex: 1;
      font: inherit;
      gap: 8px;
      min-width: 0;
      padding: 6px 8px;
      text-align: left;
    }
    .summary:hover { background: #ffffff0a; }
    .summary:focus-visible, button:focus-visible {
      outline: 2px solid var(--ss-amber);
      outline-offset: -2px;
    }
    .mark { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--ss-amber); }
    .verdict { font-weight: 600; letter-spacing: -0.011em; white-space: nowrap; }
    .percent { color: var(--ss-amber); font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: 0; }
    .chevron { display: block; width: 12px; height: 12px; flex: none; color: var(--ss-muted); transition: transform 160ms ease; }
    .summary[aria-expanded="true"] .chevron { transform: rotate(180deg); }
    .details {
      border-top: 1px solid var(--ss-border);
      padding: 12px 14px;
      font-size: 13px;
      line-height: 1.45;
    }
    .details[hidden] { display: none; }
    .evidence {
      display: grid;
      gap: 9px;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .evidence-name { display: block; font-weight: 600; letter-spacing: -0.006em; }
    .quote {
      display: block;
      margin-top: 2px;
      color: #d6d5d1;
      overflow-wrap: anywhere;
    }
    .fix { display: block; margin-top: 4px; color: var(--ss-muted); }
    .disclaimer {
      border-top: 1px solid var(--ss-border);
      font-size: 12px;
      margin: 10px 0 0;
      color: var(--ss-muted);
      padding-top: 8px;
    }
    .block {
      appearance: none;
      background: #f1eee6;
      border: 0;
      border-radius: 8px;
      color: #151719;
      cursor: pointer;
      flex: none;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.006em;
      max-width: 50%;
      overflow: hidden;
      padding: 7px 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .block:hover { background: var(--ss-amber); }
    :host([data-scroll-guard-verdict="scam"]) .block { background: #ffdce1; }
    :host([data-scroll-guard-verdict="scam"]) .block:hover { background: var(--ss-amber); }
    :host([data-scroll-guard-verdict="bot"]) .block { background: #ebe5ff; }
    :host([data-scroll-guard-verdict="bot"]) .block:hover { background: var(--ss-amber); }
    :host([data-scroll-guard-verdict="clickbait"]) .block { background: #d9f7f1; }
    :host([data-scroll-guard-verdict="clickbait"]) .block:hover { background: var(--ss-amber); }
    :host([data-scroll-guard-verdict="shill"]) .block { background: #dde9ff; }
    :host([data-scroll-guard-verdict="shill"]) .block:hover { background: var(--ss-amber); }
    .status { font-size: 12px; margin: 8px 0 0; opacity: 0.75; }
    .card > .status { margin: 0; padding: 0 14px 10px; }
    .card > .status:empty { display: none; }
    @media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }
  `;

  const BANNER_STYLES = `
    :host {
      color-scheme: light dark;
      display: block;
      font: 400 14px/1.45 "TwitterChirp", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
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

  function chevronIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = root.document.createElementNS(ns, "svg");
    svg.setAttribute("class", "chevron");
    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("aria-hidden", "true");
    const path = root.document.createElementNS(ns, "path");
    path.setAttribute("d", "M2.5 4.5 6 8l3.5-3.5");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    return svg;
  }

  // X wraps posts in nested flex rows. A card inside a row steals width from
  // the post text, so mount into the nearest block or column box above the text.
  function annotationContainer(article) {
    const view = article.ownerDocument?.defaultView;
    const text = article.querySelector("[data-testid='tweetText']");
    if (!text || typeof view?.getComputedStyle !== "function") {
      return article;
    }

    for (let node = text.parentElement; node && article.contains(node); node = node.parentElement) {
      const style = view.getComputedStyle(node);
      const row =
        /flex|box/.test(style.display) &&
        !String(style.flexDirection || "row").startsWith("column");
      if (!row) {
        return node;
      }
    }
    return article;
  }

  // Match the card's side edges to the post text's content box.
  function alignWithText(article, host) {
    const view = article.ownerDocument?.defaultView;
    const text = article.querySelector("[data-testid='tweetText']");
    const parent = host.parentElement;
    if (!text || !parent || typeof view?.getComputedStyle !== "function") {
      return;
    }
    const textBox = text.getBoundingClientRect();
    const parentBox = parent.getBoundingClientRect();
    if (!textBox.width || !parentBox.width) {
      return;
    }
    const textStyle = view.getComputedStyle(text);
    const parentStyle = view.getComputedStyle(parent);
    const px = (value) => Number.parseFloat(value) || 0;
    const left = textBox.left + px(textStyle.paddingLeft) -
      (parentBox.left + px(parentStyle.borderLeftWidth) + px(parentStyle.paddingLeft));
    const right = parentBox.right - px(parentStyle.borderRightWidth) - px(parentStyle.paddingRight) -
      (textBox.right - px(textStyle.paddingRight));
    host.style.marginLeft = `${Math.max(0, Math.round(left))}px`;
    host.style.marginRight = `${Math.max(0, Math.round(right))}px`;
  }

  function mountPostAnnotation(article, payload, callbacks) {
    const existing = article.querySelector(`[${HOST_ATTRIBUTE}]`);
    existing?.remove();

    const host = element("div");
    host.setAttribute(HOST_ATTRIBUTE, "");
    const { isScam, isBot, isShill, isClickbait } = payload.detection;
    const verdict = isScam ? "scam" : isBot ? "bot" : isShill ? "shill" : isClickbait ? "clickbait" : "slop";
    host.dataset.scrollGuardVerdict = verdict;
    host.dataset.scrollGuardHandle = payload.parsed.handle.toLowerCase();
    host.addEventListener("click", (event) => event.stopPropagation());
    host.addEventListener("keydown", (event) => event.stopPropagation());

    const shadow = host.attachShadow({ mode: "open" });
    const style = element("style", "", CARD_STYLES);
    const card = element("aside", "card");
    card.setAttribute("aria-label", "Scroll Guard finding");
    const verdictLabel = { scam: "Possible scam", bot: "Likely bot spam", shill: "Likely shilling", clickbait: "Likely clickbait", slop: "Likely AI slop" }[verdict];
    // A repeat found on this device has no Jev probability; it shows "Repeat" instead.
    const local = typeof payload.detection.probability !== "number";
    const percent = local ? null : Math.round(payload.detection.probability * 100);
    const score = local ? "Repeat" : `${percent}%`;
    const summary = element("button", "summary");
    summary.type = "button";
    summary.title = "Scroll Guard: view Jev assessment";
    summary.setAttribute("aria-label", local
      ? `Scroll Guard: ${verdictLabel}, repeated text. View details`
      : `Scroll Guard: ${verdictLabel}, ${percent}% probability. View Jev assessment`);
    summary.setAttribute("aria-expanded", "false");
    summary.setAttribute("aria-controls", "finding-details");
    const mark = element("span", "mark");
    mark.setAttribute("aria-hidden", "true");
    summary.append(mark, element("span", "verdict", verdictLabel), element("span", "percent", score), chevronIcon());
    const bar = element("div", "bar");
    bar.append(summary);

    const details = element("div", "details");
    details.id = "finding-details";
    details.hidden = true;
    const list = element("ul", "evidence");
    payload.detection.evidence.forEach((item) => list.append(evidenceItem(item)));
    const disclaimer = element(
      "p",
      "disclaimer",
      {
        scam: "This is a model assessment, not verification of the account or linked website.",
        bot: local
          ? "Based on text repeated in posts seen on this device. Some people repost their own words."
          : "This is a model assessment. Jev cannot confirm that a bot runs this account.",
        shill: "This is a model assessment of the writing. Jev cannot see whether the author was paid.",
        clickbait: "This is a model assessment of the framing. Jev has not fact-checked the claim.",
        slop: "Based on AI-writing patterns in the text. This is not proof of who wrote the post."
      }[verdict]
    );
    details.append(list, disclaimer);

    summary.addEventListener("click", () => {
      const expanded = summary.getAttribute("aria-expanded") === "true";
      summary.setAttribute("aria-expanded", String(!expanded));
      details.hidden = expanded;
    });

    card.append(bar);
    if (payload.detection.canBlock) {
      const block = element("button", "block", `Block @${payload.parsed.handle}`);
      block.type = "button";
      block.setAttribute("aria-label", `Block @${payload.parsed.handle}`);
      block.title = "Opens X's block confirmation";
      const status = element("p", "status");
      status.setAttribute("role", "status");
      block.addEventListener("click", () => {
        status.textContent = "Opening X's block confirmation…";
        callbacks.onBlock?.();
      });
      bar.append(block);
      card.append(status, details);
    } else {
      card.append(details);
    }
    shadow.append(style, card);
    article.dataset.scrollGuardVerdict = verdict;
    annotationContainer(article).append(host);
    alignWithText(article, host);
    return host;
  }

  function removeAllAnnotations() {
    root.document
      ?.querySelectorAll?.(`[${HOST_ATTRIBUTE}]`)
      .forEach((host) => host.remove());
    root.document
      ?.querySelectorAll?.("article[data-scroll-guard-verdict]")
      .forEach((article) => {
        delete article.dataset.scrollGuardVerdict;
      });
  }

  function showHandoffStatus(status) {
    if (!root.document?.documentElement) {
      return;
    }

    if (!handoffHost) {
      handoffHost = element("div");
      handoffHost.setAttribute("data-scroll-guard-handoff", "");
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
      element("span", "title", status.handle ? `Scroll Guard · @${status.handle}` : "Scroll Guard"),
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
