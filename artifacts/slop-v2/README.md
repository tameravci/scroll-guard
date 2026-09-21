# Slop Spotter for X

Slop Spotter is a Manifest V3 Chrome extension that highlights named, checkable
writing patterns in X posts. After repeated findings from the same account, it
can suggest starting X's native block flow. It never blocks automatically and
does not claim to determine whether AI wrote a post.

The detector is adapted from Peter Yang's
[No AI Slop skill](https://github.com/petergyang/no-ai-slop). That project
rightly cautions that AI detectors guess, so this extension presents the
specific patterns and excerpts it found instead of an "AI probability."

## Install locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository's root directory.
5. Open or reload `https://x.com/home`.

The extension requests only Chrome's `storage` permission and access to
`x.com`/`twitter.com` through its content-script matches.

## How detection works

The rule engine runs locally and recognizes deterministic forms of:

- throat-clearing and faux-insight setups;
- binary contrasts and negative listings;
- colon reveals and superficial `-ing` analysis;
- importance puffery and weasel attribution;
- fake-strong verbs, dramatic fragments, rhetorical setups, and recap endings;
- buzzwords and em-dash clusters as supporting evidence only.

In the default **Balanced** mode, any named structural pattern is highlighted.
A lone buzzword still does not flag a post; two distinct buzzwords are treated
as a cluster. Conservative mode remains available when fewer flags are wanted.

The extension suggests blocking only after it has locally observed at least
five unique posts from an account, at least three of those posts were flagged,
and the findings span at least two pattern families. Users can dismiss a
suggestion for seven days or permanently suppress suggestions for an account.

## Block handoff

X does not document a public account-specific web URL that opens its Block
confirmation. Its authenticated block API is an Enterprise integration.
Slop Spotter therefore creates an extension-controlled handoff:

`https://x.com/<handle>#slop-spotter-block`

On that exact profile, the content script verifies the handle, locates the
profile action menu, and selects the exact English `Block @handle` item. It
does **not** click X's final confirmation. If the exact action cannot be
verified—because X changed its DOM, the interface is localized, or the page
did not load—the extension fails closed and shows manual instructions on the
profile.

## Privacy

No network requests, remote model calls, analytics, or telemetry are made.
Full post text is never persisted. See [PRIVACY.md](PRIVACY.md) for the precise
local data model and deletion instructions.

The toolbar popup also reports the latest local scan counts. It distinguishes
"X exposed no post cards," "post cards could not be parsed," detector evidence
suppressed by sensitivity, and content-script errors so a broken X selector no
longer looks like a detector that simply found nothing.

## Development

The checked-in extension runs directly without a build or runtime dependency.
Node 20 or newer is used only for tests and repository checks.

```sh
npm test
npm run check
npm run verify
```

The X DOM adapter is deliberately isolated in `src/x-adapter.js`, since X can
change its private test IDs and markup. Detector and account-threshold logic
have dependency-free tests under `tests/`.

## License and upstream notice

This project is MIT-licensed. The adapted No AI Slop rule descriptions retain
their MIT notice in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
