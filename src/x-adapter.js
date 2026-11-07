(function attachXAdapter(root, factory) {
  const api = factory(root);
  root.ScrollGuard = Object.assign(root.ScrollGuard || {}, api);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createXAdapter(root) {
  "use strict";

  const HANDOFF_HASH = "#scroll-guard-block";
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

  // A quoted post is a link card inside the article with its own author line and text.
  function quoteContainer(article) {
    return [...article.querySelectorAll("div[role='link']")].find((card) =>
      card.querySelector("[data-testid='User-Name']") && card.querySelector("[data-testid='tweetText']")
    ) || null;
  }

  // The post's own text, never the quoted post's text.
  function primaryTextElement(article, quote) {
    const candidates = [...article.querySelectorAll("[data-testid='tweetText']")];
    return candidates.find((candidate) => !quote?.contains(candidate)) || null;
  }

  // X draws each emoji as an image whose alt text is the emoji character, so
  // textContent drops it. Read text nodes in order and put each emoji back.
  function readableText(element) {
    if (!element) return "";
    let output = "";
    const walk = (node) => {
      for (const child of node.childNodes || []) {
        if (child.nodeType === 3) {
          output += child.nodeValue;
        } else if (child.nodeType === 1) {
          const tag = String(child.tagName).toUpperCase();
          if (tag === "IMG") output += child.getAttribute("alt") || "";
          else if (tag === "BR") output += "\n";
          else walk(child);
        }
      }
    };
    walk(element);
    return normalizeWhitespace(output);
  }

  // Descriptions the author wrote for the post's own photos. Without one, X fills
  // in a one-word default such as "Image" in the reader's language. A one-word
  // alt tells Jev nothing, so it is left out.
  function photoDescriptions(article, quote) {
    return [...article.querySelectorAll("[data-testid='tweetPhoto'] img")]
      .filter((image) => !quote?.contains(image))
      .map((image) => normalizeWhitespace(image.getAttribute("alt")).slice(0, 1000))
      .filter((alt) => /\s/u.test(alt))
      .slice(0, 4);
  }

  function articleHandle(article) {
    const link = primaryStatusLink(article);
    return link ? parseStatusHref(link.getAttribute("href"))?.handle || null : null;
  }

  // In a thread, X draws the parent post in the cell just above the reply, and the
  // reply carries "Replying to" profile links. The words are translated, but the
  // links are not, so match the parent's author against those links.
  function parentArticle(article, quote) {
    const cell = article.closest?.("[data-testid='cellInnerDiv']");
    const previous = cell?.previousElementSibling?.querySelector?.("article[data-testid='tweet']");
    const parentHandle = previous ? articleHandle(previous) : null;
    if (!parentHandle) return null;
    // Leave out the post's own author line and avatar, its text mentions, and the
    // quoted post, so only the "Replying to" links remain.
    const skip = [
      article.querySelector("[data-testid='User-Name']"),
      article.querySelector("[data-testid='Tweet-User-Avatar']"),
      primaryTextElement(article, quote),
      quote
    ].filter(Boolean);
    const replyTargets = [...article.querySelectorAll("a[href^='/']")]
      .filter((link) => !skip.some((part) => part.contains(link)))
      .map((link) => link.getAttribute("href").match(/^\/([A-Za-z0-9_]{1,15})$/u)?.[1]?.toLowerCase())
      .filter(Boolean);
    return replyTargets.includes(parentHandle.toLowerCase()) ? previous : null;
  }

  // X cuts long posts and adds a "Show more" button that expands the text in place.
  // Click it so Jev reads the whole post. A post above the screen grows upward into
  // view, so scroll by the same height to keep what the reader sees still.
  async function expandPost(article) {
    const quote = quoteContainer(article);
    const button = [...article.querySelectorAll("[data-testid='tweet-text-show-more-link']")]
      .find((candidate) => candidate.tagName === "BUTTON" && !quote?.contains(candidate));
    if (!button) return false;
    const before = article.getBoundingClientRect();
    button.click();
    const expanded = await waitForElement(
      () => (article.querySelector("[data-testid='tweet-text-show-more-link']") ? null : article),
      2000,
      50
    );
    if (expanded && before.top < 0) {
      const grown = article.getBoundingClientRect().height - before.height;
      if (grown > 0) root.scrollBy?.(0, grown);
    }
    return Boolean(expanded);
  }

  function parsePost(article) {
    if (!article || typeof article.querySelector !== "function") {
      return null;
    }

    const link = primaryStatusLink(article);
    const status = link ? parseStatusHref(link.getAttribute("href")) : null;
    const quote = quoteContainer(article);
    const textElement = primaryTextElement(article, quote);
    const text = readableText(textElement);

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
      quote: readableText(quote?.querySelector("[data-testid='tweetText']")),
      parent: (() => {
        const parent = parentArticle(article, quote);
        return parent ? readableText(primaryTextElement(parent, quoteContainer(parent))) : "";
      })(),
      images: photoDescriptions(article, quote),
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

  async function waitForElement(getElement, timeoutMs, stepMs = 200) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const element = getElement();
      if (element) {
        return element;
      }
      await sleep(stepMs);
    }
    return getElement() || null;
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
    expandPost,
    parentArticleOf: (article) => parentArticle(article, quoteContainer(article)),
    findPosts,
    handleBlockHandoff,
    normalizeWhitespace,
    openBlockHandoff,
    parsePost,
    parseStatusHref,
    readableText,
    profileHandoffUrl,
    validateHandle
  };
});
