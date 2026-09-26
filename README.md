# Slop Spotter for X

Slop Spotter is a Manifest V3 Chrome extension that calls TypeSafe's Jev model
to flag AI slop, clickbait, bot spam, and scams in X posts. Each flagged post gets a
button that starts X's native block flow. It never blocks automatically.

"AI slop" means the text reads as AI-written. Jev judges this from named AI-writing
patterns adapted from the No AI Slop guide, such as binary contrasts, faux-insight
setups, colon reveals, puffery, and fake-profound kickers. People write these
patterns too, so a verdict is evidence, not proof of authorship. The previous rule-based
detector remains in source for historical tests but is not loaded by the extension.

## Install locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository's root directory.
5. The setup page opens. Paste your Jev API key from
   [console.typesafe.ai/keys](https://console.typesafe.ai/keys) and save it.
6. Choose what to flag and how strict to be. You can change this later from the toolbar icon.
7. Open or reload `https://x.com/home`. The key stays saved after you restart Chrome or reload the extension.

The toolbar popup holds the on/off switch, the verdict types to flag (slop, clickbait,
bot spam, scam; at least one stays on), and the strictness. Until a key is saved, the
icon shows a `!` badge and the popup asks for the key. The setup page also holds the
privacy summary and the button that clears local history.

The extension requests Chrome's `storage` permission, access to the TypeSafe API,
and content-script access to `x.com`/`twitter.com`. API requests incur usage on your key.

## How detection works

The background worker calls `POST https://api.typesafe.ai/v1/systemone` with
`model: jev-latest` and two Choice questions: a scam/bot/clickbait/slop/not-slop/uncertain verdict,
and a writing-problem category. See the [official API quickstart](https://docs.typesafe.ai/introduction/quickstart).
The rubric asks Jev to judge substance in context, allowing ordinary conversation,
humor, concrete information, and quotations being criticized. No phrase matching
determines the verdict. The full rubric lives in `src/jev.js`.
Excitement, encouragement, personal celebrations, and casual reactions are explicitly
allowed even without concrete details. One weak pattern is not enough for a slop
verdict; the rubric asks for several patterns together. The expanded card names the
strongest pattern Jev found.
Flagged tweets have a full border: amber for slop, violet for bot spam, teal for
clickbait, and coral red for possible scams. A compact card below the post text shows the verdict, its
probability, expandable details, and a Block button. The layout adapts to narrow
cards and respects reduced-motion preferences.

Flags require Jev to choose slop, clickbait, bot, or scam with that option's probability at least 75% (Balanced),
90% (Conservative), or 60% (Sensitive). These are application defaults, not
validated accuracy claims. Uncertain decisions are not flagged. The displayed
percentage is the selected verdict's probability under this rubric. It is not a measured accuracy.
Scam takes priority over slop for deceptive solicitations, phishing, impersonation,
wallet-secret requests, advance-fee giveaways, and guaranteed-profit pitches.
Crypto discussion, automated posting, and warnings about scams are not by themselves
scam evidence. Scam verdicts display “possible scam”; Jev does not verify accounts or links.
Bot takes priority over slop for automated or mass-posted spam: copy-paste replies,
link drops, keyword stuffing, random codes, or off-topic promotion. Posting often or
using automation to share useful information is not bot spam. Bot verdicts display
“likely bot spam”; Jev cannot confirm who runs an account.
Clickbait takes priority over slop for framing built to get clicks or shares: false
urgency such as “JUST IN” on non-urgent content, surprising claims from an unnamed
study, stacked exaggerated outcomes, curiosity gaps, or rage bait. News headlines and
reports are never slop; a plain news report is neither clickbait nor slop. Clickbait
verdicts display “likely clickbait”.
Jev judges the framing and does not fact-check the claim.

The page decides what to check, because only the page knows what the reader sees
(`src/scheduler.js`). It keeps up to 4 requests open and always spends the next one
on the most useful post: on-screen posts top to bottom, then posts up to one screen
ahead in the scroll direction, then posts just behind. Posts further away wait until
they come near. During a fling (over 3 screens per second) it sends nothing and
resumes when the scroll slows. The worker also caps work at 4 requests across all
tabs; if more than 40 wait, it drops the oldest, and the page asks again later.

Identical text shares one request and reuses up to 500 cached decisions in worker
memory. Requests time out after 15 seconds. Rate limits, server errors, and timeouts
pause new calls for 30 seconds; a rejected key or a malformed answer does not. A post
whose request fails stays unchecked and retries with backoff (4 s, doubling to 60 s).
Failures never count as clean observations. There is no local-rule fallback.

Every flagged post displays a visible `Block @handle` button. The sensitivity
setting decides which posts get flagged. No observation history is required.
The button opens X's native confirmation; it does not confirm the block for you.

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

Post text is sent to TypeSafe. The API key is held in the extension origin's
IndexedDB, inaccessible to content scripts, and is never included in a packaged build.
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

For thirteen real API sample calls (including scams, bot spam, clickbait, plain news, benign crypto text, and excited reactions), put `TYPESAFE_API_KEY=...` in an ignored `.env`
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
