# Slop Spotter for X

Slop Spotter is a Manifest V3 Chrome extension that calls TypeSafe's Jev model
to assess slop in X posts. After repeated findings from the same account, it
can suggest starting X's native block flow. It never blocks automatically and
does not claim to determine whether AI wrote a post.

Jev evaluates writing quality, not proven AI authorship. The previous rule-based
detector remains in source for historical tests but is not loaded by the extension.

## Install locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository's root directory.
5. Open or reload `https://x.com/home`.
6. Open extension settings, paste your TypeSafe API key, and save it for this browser session.
7. Reload X. Repeat key entry after restarting Chrome or reloading the extension.

The extension requests Chrome's `storage` permission, access to the TypeSafe API,
and content-script access to `x.com`/`twitter.com`. API requests incur usage on your key.

## How detection works

The background worker calls `POST https://api.typesafe.ai/v1/systemone` with
`model: jev-latest` and two Choice questions: a scam/slop/not-slop/uncertain verdict,
and a writing-problem category. See the [official API quickstart](https://docs.typesafe.ai/introduction/quickstart).
The rubric asks Jev to judge substance in context, allowing ordinary conversation,
humor, concrete information, and quotations being criticized. No phrase matching
determines the verdict. The full rubric lives in `src/jev.js`.
Excitement, encouragement, personal celebrations, and casual reactions are explicitly
allowed even without concrete details. Slop refers to formulaic content presenting
empty claims as useful advice or insight, or manipulative engagement bait.
Flagged tweets have a full amber border for slop or coral-red border for possible
scams, plus a bold verdict bar with expandable assessment details.

Flags require Jev to choose slop or scam with that option's probability at least 75% (Balanced),
90% (Conservative), or 60% (Sensitive). These are application defaults, not
validated accuracy claims. Uncertain decisions are not flagged. The displayed
percentage is the selected verdict's probability under this rubric, not probability of AI authorship.
Scam takes priority over slop for deceptive solicitations, phishing, impersonation,
wallet-secret requests, advance-fee giveaways, and guaranteed-profit pitches.
Crypto discussion, automated posting, and warnings about scams are not by themselves
scam evidence. Scam verdicts display “possible scam”; Jev does not verify accounts or links.

Requests are serialized and duplicate text reuses up to 500 cached decisions in
worker memory. Worker restarts clear that cache. Requests time out after 15 seconds;
API failures pause new calls for a minute and never count as clean observations.
Reload X to retry failed posts. There is no local-rule fallback.

Every slop or scam verdict with probability strictly above 80% displays a visible
`Block @handle` button, even in Conservative mode. No observation history is
required; snoozes, ignored accounts, the block-suggestion toggle, and other cards
from the same account do not hide this direct action. Exactly 80% does not qualify.
The button opens X's native confirmation; it does not confirm the block for you.

Below this direct-action threshold, optional account-level suggestions still
require five observed posts, three flagged posts, and two finding categories.
Those suggestions can be snoozed or suppressed for an account.

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

Post text is sent to TypeSafe. The API key is held in trusted extension session
storage, inaccessible to content scripts, and is never included in a packaged build.
Full post text is never persisted by the extension. See [PRIVACY.md](PRIVACY.md).

The toolbar popup also reports the latest local scan counts. It distinguishes
"X exposed no post cards," "post cards could not be parsed," detector evidence
suppressed by sensitivity, and content-script errors so a broken X selector no
longer looks like a detector that simply found nothing.

## Development

The checked-in extension runs directly without a build or runtime dependency.
Node 20 or newer is used only for tests and repository checks. Playwright is a
development dependency for browser integration tests.

```sh
npm test
npm run check
npm run verify
```

For ten real API sample calls (including scams, benign crypto text, and excited reactions), put `TYPESAFE_API_KEY=...` in an ignored `.env`
file and run `npm run test:live`. This incurs API usage. The packaging script uses
an allowlist and excludes `.env`. Local tests mock the network.

To exercise the actual extension in an isolated Chromium profile:

```sh
npm ci
npx playwright install chromium
npm run test:browser
# Optional: three synthetic posts sent to the real API, using the ignored .env key
npm run test:browser:live
```

The browser test checks settings, key isolation, background requests, annotations,
cache reuse, recycled post cards, and provider-error reporting. Live mode verifies
the successful API-to-annotation path. Set `CHROME_EXECUTABLE` to use an existing
Chrome for Testing executable instead of Playwright's Chromium. The temporary
browser profile is deleted after each run; your normal browser is not used.

The X DOM adapter is deliberately isolated in `src/x-adapter.js`, since X can
change its private test IDs and markup. Detector and account-threshold logic
have dependency-free tests under `tests/`.

## License and upstream notice

This project is MIT-licensed. The adapted No AI Slop rule descriptions retain
their MIT notice in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
