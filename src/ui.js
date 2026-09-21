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
      --ss-amber: #ffb000;
      --ss-amber-soft: rgba(255, 176, 0, 0.12);
      --ss-border: rgba(127, 127, 127, 0.35);
      --ss-text: inherit;
      display: block;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 4px 12px 10px 68px;
    }
    * { box-sizing: border-box; }
    .card {
      background: var(--ss-amber-soft);
      border: 1px solid rgba(255, 176, 0, 0.46);
      border-radius: 12px;
      color: var(--ss-text);
      overflow: hidden;
    }
    .summary {
      align-items: center;
      appearance: none;
      background: transparent;
      border: 0;
      color: inherit;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-weight: 650;
      gap: 8px;
      padding: 10px 12px;
      text-align: left;
      width: 100%;
    }
    .summary:hover { background: rgba(255, 176, 0, 0.08); }
    .summary:focus-visible, button:focus-visible {
      outline: 2px solid var(--ss-amber);
      outline-offset: -2px;
    }
    .icon { color: #d99100; font-size: 16px; }
    .chevron { margin-left: auto; transition: transform 120ms ease; }
    .summary[aria-expanded="true"] .chevron { transform: rotate(180deg); }
    .details {
      border-top: 1px solid rgba(255, 176, 0, 0.28);
      padding: 8px 12px 12px;
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
    .fix { display: block; margin-top: 2px; opacity: 0.68; }
    .disclaimer {
      border-top: 1px solid var(--ss-border);
      font-size: 12px;
      margin: 10px 0 0;
      opacity: 0.68;
      padding-top: 8px;
    }
    .suggestion {
      background: rgba(255, 176, 0, 0.12);
      border-top: 1px solid rgba(255, 176, 0, 0.32);
      padding: 11px 12px 12px;
    }
    .suggestion-title { font-weight: 700; margin: 0 0 3px; }
    .suggestion-copy { font-size: 13px; margin: 0 0 10px; opacity: 0.8; }
    .actions { display: flex; flex-wrap: wrap; gap: 7px; }
    .actions button {
      appearance: none;
      background: transparent;
      border: 1px solid var(--ss-border);
      border-radius: 999px;
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 650;
      padding: 6px 10px;
    }
    .actions button:hover { background: rgba(127, 127, 127, 0.12); }
    .actions .block {
      background: #cf242e;
      border-color: #cf242e;
      color: white;
    }
    .actions .block:hover { background: #a91c24; }
    .status { font-size: 12px; margin: 8px 0 0; opacity: 0.75; }
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
    li.append(element("span", "quote", `“${item.excerpt}”`));
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
    host.dataset.slopSpotterHandle = payload.parsed.handle.toLowerCase();
    host.dataset.slopSpotterSuggestion = String(payload.account?.shouldSuggest === true);
    host.addEventListener("click", (event) => event.stopPropagation());
    host.addEventListener("keydown", (event) => event.stopPropagation());

    const shadow = host.attachShadow({ mode: "open" });
    const style = element("style", "", CARD_STYLES);
    const card = element("aside", "card");
    card.setAttribute("aria-label", "Slop Spotter finding");

    const summary = element("button", "summary");
    summary.type = "button";
    summary.setAttribute("aria-expanded", "false");
    const patternCount = payload.detection.families.length;
    summary.append(
      element("span", "icon", "⚠"),
      element(
        "span",
        "",
        `Slop patterns detected · ${patternCount} ${patternCount === 1 ? "pattern" : "patterns"}`
      ),
      element("span", "chevron", "⌄")
    );

    const details = element("div", "details");
    details.hidden = true;
    const list = element("ul", "evidence");
    payload.detection.evidence.forEach((item) => list.append(evidenceItem(item)));
    const disclaimer = element(
      "p",
      "disclaimer",
      "This identifies checkable writing patterns, not whether AI wrote the post."
    );
    details.append(list, disclaimer);

    summary.addEventListener("click", () => {
      const expanded = summary.getAttribute("aria-expanded") === "true";
      summary.setAttribute("aria-expanded", String(!expanded));
      details.hidden = expanded;
    });

    card.append(summary, details);
    if (payload.account?.shouldSuggest) {
      card.append(buildSuggestion(payload.parsed, payload.account, callbacks, host));
    }
    shadow.append(style, card);
    article.classList.add("slop-spotter-flagged");
    article.append(host);
    return host;
  }

  function removeAllAnnotations() {
    root.document
      ?.querySelectorAll?.(`[${HOST_ATTRIBUTE}]`)
      .forEach((host) => host.remove());
    root.document
      ?.querySelectorAll?.("article.slop-spotter-flagged")
      .forEach((article) => article.classList.remove("slop-spotter-flagged"));
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
