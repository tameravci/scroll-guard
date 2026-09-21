# Privacy notice

Slop Spotter for X sends rendered X post text to TypeSafe's Jev API to provide its
highlighting and repeated-account block-suggestion features.

## Data processed

While enabled on `x.com` or `twitter.com`, the extension reads the primary text,
author handle, and status ID of posts rendered in the current page. Only the post
text is included in the Jev request state. Text itself may contain personal information.

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

Full post text, profile names, X authentication data, cookies, direct messages,
and X credentials are not stored. At most 30 observations per account and 300
accounts are retained. The TypeSafe API key is stored separately in
`chrome.storage.session`, restricted to trusted extension contexts. It is cleared
on browser restart or extension reload. It is not synced. Up to 500 model responses
and text hashes are cached in worker memory; full post text is not cached there.

## Data transmission

The extension sends post text and its assessment rubric to
`https://api.typesafe.ai/v1/systemone`, authenticated with your TypeSafe key.
TypeSafe also receives ordinary connection metadata. Its own terms and privacy
practices govern provider-side processing and retention; this extension makes no
provider-side deletion or zero-retention guarantee. No analytics, telemetry, or
advertising requests are made. Opening the user-requested block handoff navigates a new tab directly
to the selected account's public profile on `x.com`.

## User control

The toolbar popup can disable detection or block suggestions at any time. The
options page can remove the API key, restore suggestions for ignored accounts and delete all local
observation history. Removing the extension also removes its local storage
under Chrome's normal extension-data lifecycle.

## Changes

If a future version changes these practices, this notice and the extension's
prominent disclosure must be updated before that version is distributed.
