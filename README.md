# Scroll Guard

Flags AI slop, clickbait, bot spam, and scams in your X feed, for pennies a month.

Scroll Guard is an open-source Chrome extension. TypeSafe's Jev model reads each post
as you scroll, and flagged posts get a colored frame, a short verdict, and a Block
button that opens X's own confirmation. It never blocks anything automatically.

"AI slop" means the text reads as AI-written. Jev judges this from named AI-writing
patterns adapted from the No AI Slop guide, such as binary contrasts, faux-insight
setups, colon reveals, puffery, and fake-profound kickers. People write these
patterns too, so a verdict is evidence, not proof of authorship. Jev makes every
decision; the extension runs no local rules.

## Install (2 minutes)

1. Download the [latest release zip](../../releases/latest) and unzip it (or `git clone` this repo).
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the unzipped folder.
5. The setup page opens. Paste your Jev API key from
   [console.typesafe.ai/keys](https://console.typesafe.ai/keys) and click **Save key**.
6. Open [x.com](https://x.com) and scroll. Flagged posts get a colored frame and a verdict.

Click the extension icon to pause it, choose which types to flag, or set how strict it is.

## Bring your own key

The extension ships without an API key. You use your own Jev key, and TypeSafe bills
your usage directly: no subscription, no account with us, and no server in between.
Your browser sends each post straight to Jev.

- The key stays on your device, in extension storage that pages on X cannot read.
- Before saving, the extension tests the key with a small Jev call. It does not save a
  key that Jev rejects.
- The key stays saved when you restart Chrome or reload the extension. Remove it from
  the setup page at any time.

## What it costs, compared with Pangram

[Pangram](https://www.pangram.com/pricing)'s Individual plan costs $20 a month for
300,000 words, including feed scanning. This extension pays Jev per post instead.

|  | Pangram Individual | Scroll Guard on Jev |
|---|---|---|
| Price | $20/month, flat | Pay per use, about $0.00008 per post |
| Posts for $20 | about 6,000–20,000 | about 246,000 |
| Average user (150–300 posts/day) | $20/month | about $0.40–$0.75/month |
| Heavy user (about 1,200 posts/day) | may exceed the 300,000-word cap | about $2.90/month |

How we got these numbers:

- One Jev request for one post used 1,930 input tokens (measured). At $0.042 per
  million input tokens with free output, as reported at Jev's launch, one post costs
  about $0.000081. TypeSafe has no official pricing page yet, so check your console.
- Pangram meters words. The post counts assume 15–50 words per post.
- Daily post counts assume about 30 minutes a day on X at 5–10 posts a minute.

**It is not a drop-in Pangram replacement.** Pangram runs a classifier trained to
detect AI-written text and publishes accuracy benchmarks. Scroll Guard asks a general
decision model to apply a written rubric, and we have not measured its accuracy yet.
It may miss more AI-written posts, or flag more human posts, than a purpose-built
detector. In exchange,
it costs a fraction as much, it is open source, and it also flags scams, bot spam,
and clickbait.

## Using it

The toolbar popup holds the on/off switch, the verdict types to flag (slop, clickbait,
bot spam, scam), and the strictness. Unchecking the last type pauses the extension;
checking one again, or turning the switch on, resumes it. Until a key is saved, the
icon shows a `!` badge and the popup asks for the key. The setup page also holds the
privacy summary and the button that clears local history.

The extension requests Chrome's `storage` permission, access to the TypeSafe API,
and content-script access to `x.com`/`twitter.com`. API requests incur usage on your key.

## Privacy

Post text is sent to TypeSafe. The API key is held in the extension origin's
IndexedDB, inaccessible to content scripts, and is never included in a packaged build.
Full post text is never persisted by the extension. See [PRIVACY.md](PRIVACY.md).

The toolbar popup shows how many posts were flagged and checked in the last 24 hours,
split by verdict type. It shows a warning only for problems the user can act on,
such as a rejected key or Jev being unavailable.

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
