"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  HANDOFF_HASH,
  handleBlockHandoff,
  normalizeWhitespace,
  parseStatusHref,
  profileHandoffUrl,
  readableText,
  validateHandle
} = require("../src/x-adapter.js");

test("parses an X status URL into the original handle and stable post id", () => {
  assert.deepEqual(parseStatusHref("/Example_User/status/123456789"), {
    handle: "Example_User",
    statusId: "123456789",
    url: "https://x.com/Example_User/status/123456789"
  });
});

test("rejects non-status and malformed links", () => {
  assert.equal(parseStatusHref("/home"), null);
  assert.equal(parseStatusHref("/this-handle-is-invalid/status/123"), null);
  assert.equal(parseStatusHref("javascript:alert(1)"), null);
});

test("constructs a safe extension-controlled profile handoff URL", () => {
  assert.equal(
    profileHandoffUrl("@Safe_Handle"),
    `https://x.com/Safe_Handle${HANDOFF_HASH}`
  );
  assert.throws(() => profileHandoffUrl("../settings"));
});

test("validates X handle syntax", () => {
  assert.equal(validateHandle("valid_name"), "valid_name");
  assert.equal(validateHandle("@valid_name"), "valid_name");
  assert.equal(validateHandle("too-long-for-x-handle"), null);
  assert.equal(validateHandle("bad/name"), null);
});

test("normalizes feed text while preserving meaningful paragraph breaks", () => {
  assert.equal(normalizeWhitespace("One   line\n\n\n\nTwo\twords"), "One line\n\nTwo words");
});

test("reads emoji from X's emoji images and keeps line breaks", () => {
  const text = (value) => ({ nodeType: 3, nodeValue: value });
  const tag = (tagName, attributes = {}, childNodes = []) =>
    ({ nodeType: 1, tagName, childNodes, getAttribute: (name) => attributes[name] ?? null });
  const element = tag("DIV", {}, [
    tag("SPAN", {}, [text("Movie night ")]),
    tag("IMG", { alt: "🍿" }),
    tag("SPAN", {}, [text(" with  the team")]),
    tag("BR"),
    text("Next line")
  ]);
  assert.equal(readableText(element), "Movie night 🍿 with the team\nNext line");
  assert.equal(readableText(null), "");
});

test("opens the exact native block item but never clicks X's final confirmation", async () => {
  const originalLocation = global.location;
  const originalHistory = global.history;
  const originalDocument = global.document;
  let actionsClicked = 0;
  let blockItemClicked = 0;
  let confirmationClicked = 0;
  const confirmation = { click: () => (confirmationClicked += 1) };
  const blockItem = {
    textContent: "Block @Safe_Handle",
    click: () => (blockItemClicked += 1)
  };

  global.location = {
    hash: HANDOFF_HASH,
    pathname: "/Safe_Handle",
    search: ""
  };
  global.history = { replaceState() {} };
  global.document = {
    querySelector(selector) {
      if (selector === "[data-testid='userActions']") {
        return { click: () => (actionsClicked += 1) };
      }
      if (
        selector === "[data-testid='confirmationSheetConfirm']" &&
        blockItemClicked === 1
      ) {
        return confirmation;
      }
      return null;
    },
    querySelectorAll(selector) {
      return selector === "[role='menuitem']" && actionsClicked === 1 ? [blockItem] : [];
    }
  };

  try {
    const result = await handleBlockHandoff(() => undefined);
    assert.equal(result.openedConfirmation, true);
    assert.equal(actionsClicked, 1);
    assert.equal(blockItemClicked, 1);
    assert.equal(confirmationClicked, 0);
  } finally {
    global.location = originalLocation;
    global.history = originalHistory;
    global.document = originalDocument;
  }
});
