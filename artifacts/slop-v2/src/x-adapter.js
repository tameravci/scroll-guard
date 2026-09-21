(function attachXAdapter(root, factory) {
  const api = factory(root);
  root.SlopSpotter = Object.assign(root.SlopSpotter || {}, api);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createXAdapter(root) {
  "use strict";

  const HANDOFF_HASH = "#slop-spotter-block";
  const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/u;

  function normalizeWhitespace(value) {
    return String(value || "")
      .replace(/\u00a0/gu, " ")
      .replace(/[ \t]+/gu, " ")
      .replace(/\n{3,}/gu, "\n\n")
      .trim();
  }

  function validateHandle(handle) {
    const value = String(handle || "").replace(/^@/u, "");
    return HANDLE_PATTERN.test(value) ? value : null;
  }

  function parseStatusHref(href, baseUrl) {
    try {
      const url = new URL(href, baseUrl || "https://x.com");
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/u);
      if (!match) {
        return null;
      }
      return { handle: match[1], statusId: match[2], url: url.href };
    } catch {
      return null;
    }
  }

  function primaryStatusLink(article) {
    const timedLink = article.querySelector("time")?.closest("a[href*='/status/']");
    if (timedLink) {
      return timedLink;
    }
    return [...article.querySelectorAll("a[href*='/status/']")].find((link) =>
      parseStatusHref(link.getAttribute("href"))
    );
  }

  function primaryTextElement(article) {
    const candidates = [...article.querySelectorAll("[data-testid='tweetText']")];
    return candidates[0] || null;
  }

  function parsePost(article) {
    if (!article || typeof article.querySelector !== "function") {
      return null;
    }

    const link = primaryStatusLink(article);
    const status = link ? parseStatusHref(link.getAttribute("href")) : null;
    const textElement = primaryTextElement(article);
    const text = normalizeWhitespace(textElement?.textContent);

    if (!status?.handle || !text) {
      return null;
    }

    const userName = article.querySelector("[data-testid='User-Name']");
    const displayName =
      normalizeWhitespace(userName?.querySelector("span")?.textContent) || `@${status.handle}`;

    return {
      article,
      displayName,
      handle: status.handle,
      statusId: status.statusId,
      statusUrl: status.url,
      text,
      textElement
    };
  }

  function findPosts(scope) {
    const container = scope || root.document;
    if (!container?.querySelectorAll) {
      return [];
    }
    return [...container.querySelectorAll("article[data-testid='tweet']")];
  }

  function profileHandoffUrl(handle) {
    const validHandle = validateHandle(handle);
    if (!validHandle) {
      throw new Error("Invalid X handle");
    }
    return `https://x.com/${encodeURIComponent(validHandle)}${HANDOFF_HASH}`;
  }

  function openBlockHandoff(handle) {
    const url = profileHandoffUrl(handle);
    return root.open(url, "_blank", "noopener,noreferrer");
  }

  function sleep(durationMs) {
    return new Promise((resolve) => root.setTimeout(resolve, durationMs));
  }

  async function waitForElement(getElement, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const element = getElement();
      if (element) {
        return element;
      }
      await sleep(200);
    }
    return null;
  }

  function normalizedMenuText(value) {
    return normalizeWhitespace(value).toLowerCase().replace(/[“”"']/gu, "");
  }

  function exactBlockMenuItem(handle) {
    const wanted = `block @${handle.toLowerCase()}`;
    return [...root.document.querySelectorAll("[role='menuitem']")].find((item) => {
      const text = normalizedMenuText(item.textContent);
      return text === wanted || text.startsWith(`${wanted} `);
    });
  }

  async function handleBlockHandoff(notify) {
    if (!root.location || root.location.hash !== HANDOFF_HASH) {
      return { handled: false };
    }

    const handle = validateHandle(root.location.pathname.split("/").filter(Boolean)[0]);
    if (!handle) {
      notify?.({
        state: "error",
        message: "This block handoff URL does not contain a valid X handle."
      });
      return { handled: true, openedConfirmation: false };
    }

    root.history?.replaceState?.(null, "", `${root.location.pathname}${root.location.search}`);
    notify?.({
      state: "working",
      handle,
      message: `Opening X’s block confirmation for @${handle}…`
    });

    const actions = await waitForElement(
      () => root.document.querySelector("[data-testid='userActions']"),
      12000
    );

    if (!actions) {
      notify?.({
        state: "manual",
        handle,
        message: `Use the profile’s ••• menu and choose “Block @${handle}”.`
      });
      return { handled: true, openedConfirmation: false };
    }

    actions.click();
    const blockItem = await waitForElement(() => exactBlockMenuItem(handle), 4000);

    if (!blockItem) {
      notify?.({
        state: "manual",
        handle,
        message: `Use the open ••• menu and choose “Block @${handle}”.`
      });
      return { handled: true, openedConfirmation: false };
    }

    blockItem.click();
    const confirmation = await waitForElement(
      () => root.document.querySelector("[data-testid='confirmationSheetConfirm']"),
      4000
    );
    if (!confirmation) {
      notify?.({
        state: "manual",
        handle,
        message: `X did not expose a verifiable confirmation. Use the profile’s ••• menu to block @${handle}.`
      });
      return { handled: true, openedConfirmation: false };
    }

    notify?.({
      state: "ready",
      handle,
      message: "Review X’s confirmation. Nothing is blocked until you confirm there."
    });
    return { handled: true, openedConfirmation: true };
  }

  return {
    HANDOFF_HASH,
    findPosts,
    handleBlockHandoff,
    normalizeWhitespace,
    openBlockHandoff,
    parsePost,
    parseStatusHref,
    profileHandoffUrl,
    validateHandle
  };
});
