# Privacy notice

Slop Spotter for X processes visible X post text locally to provide its
highlighting and repeated-account block-suggestion features.

## Data processed

While enabled on `x.com` or `twitter.com`, the extension reads the primary text,
author handle, and status ID of posts rendered in the current page. It applies
deterministic writing-pattern rules in the browser.

## Data stored

The extension stores the following in `chrome.storage.local`:

- whether detection and block suggestions are enabled;
- the selected sensitivity;
- author handles needed for account-level suggestions;
- a salted SHA-256 fingerprint for each observed post, used for deduplication;
- whether the post matched and the identifiers of its pattern families;
- timestamps used to retain the latest 30 observations per account;
- accounts for which suggestions are snoozed or disabled.
- latest aggregate scanner diagnostics: post-card, parsed, evidence, highlight,
  and error counts plus a short internal error message and the X origin.

Full post text, profile names, authentication data, cookies, direct messages,
and X credentials are not stored. At most 30 observations per account and 300
accounts are retained.

## Data transmission

The extension has no server and does not transmit data to its developer or any
third party. It makes no analytics, telemetry, advertising, or remote AI/model
requests. Opening the user-requested block handoff navigates a new tab directly
to the selected account's public profile on `x.com`.

## User control

The toolbar popup can disable detection or block suggestions at any time. The
options page can restore suggestions for ignored accounts and delete all local
observation history. Removing the extension also removes its local storage
under Chrome's normal extension-data lifecycle.

## Changes

If a future version changes these practices, this notice and the extension's
prominent disclosure must be updated before that version is distributed.
