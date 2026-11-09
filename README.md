# Scroll Guard

Flags AI slop, shilling, clickbait, bot spam, and scams in your X feed, for pennies a month.

Scroll Guard is an open-source Chrome extension. TypeSafe's Jev model reads each post
as you scroll, and flagged posts get a colored frame, a short verdict, and a Block
button that opens X's own confirmation. It never blocks anything automatically.

"AI slop" means the text reads as AI-written. Jev judges this from named AI-writing
patterns adapted from the No AI Slop guide, such as binary contrasts, faux-insight
setups, colon reveals, puffery, and fake-profound kickers. People write these
patterns too, so a verdict is evidence, not proof of authorship. Jev makes every
decision except one: text repeated word for word is flagged on your device.

## Install (2 minutes)

1. Install [Scroll Guard from the Chrome Web Store](https://chromewebstore.google.com/detail/aaeijennaopjfffmidbckonmnnogpgac).
2. The setup page opens. Paste your Jev API key from
   [console.typesafe.ai/keys](https://console.typesafe.ai/keys) and click **Save key**.
3. Open [x.com](https://x.com) and scroll. Flagged posts get a colored frame and a verdict.

Click the extension icon to pause it, choose which types to flag, or set how strict it is.

## Install from source

Use this to run the latest code or to work on the extension. Chrome does not update
an extension that you load this way, so repeat these steps for each new version.

1. Run `git clone https://github.com/tameravci/scroll-guard.git`, or download and
   unzip the [latest release zip](../../releases/latest).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the folder.
5. Finish with steps 2 and 3 above.

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

Pangram's browser extension scans your X feed automatically only on a paid plan. The
cheapest one, [Individual](https://www.pangram.com/pricing), costs $20 a month ($15 a
month billed yearly) for 300,000 words. The free plan checks one post at a time. Scroll
Guard pays Jev for each post it checks.

|  | Pangram Individual | Scroll Guard on Jev |
|---|---|---|
| Price | $20/month, flat | Pay per use, about $0.00008 per post |
| Posts for $20 | about 6,000–20,000 | about 245,000 |
| Average user (150–300 posts/day) | $20/month | about $0.40–$0.75/month |
| Heavy user (about 1,200 posts/day) | over the 300,000-word cap; Professional costs $65/month for 1.5 million words | about $2.90/month |

How we got these numbers (checked November 2026):

- TypeSafe [lists Jev](https://docs.typesafe.ai/models) at $0.042 per million input
  tokens. Output tokens are free.
- On Jev 1.14, one post used 1,918 to 1,961 input tokens (measured). Most of that is
  the rubric, so short and long posts cost about the same: $0.00008 each.
- Pangram meters words. The post counts assume 15–50 words per post. Pangram does not
  say if its feed scans count against the word cap.
- Daily post counts assume about 30 minutes a day on X at 5–10 posts a minute.
- Prices change. Check both pricing pages before you rely on these numbers.

**It is not a drop-in Pangram replacement.** Pangram runs a classifier trained to
detect AI-written text and publishes accuracy benchmarks. Scroll Guard asks a general
decision model to apply a written rubric, and we have not measured its accuracy yet.
It may miss more AI-written posts, or flag more human posts, than a purpose-built
detector. In exchange,
it costs a fraction as much, it is open source, and it also flags scams, bot spam,
and clickbait.

## Using it

The toolbar popup holds the on/off switch, the verdict types to flag (slop, shilling,
clickbait, bot spam, scam), and the strictness: a threshold from 20% to 99%, 50% by
default. A post is flagged when Jev rates it at the threshold or higher. Unchecking the last type pauses the extension;
checking one again, or turning the switch on, resumes it. Until a key is saved, the
icon shows a `!` badge and the popup asks for the key. The setup page also holds the
privacy summary and the button that clears local history.

What Jev reads for each post:

- The whole post. Scroll Guard clicks X's "Show more" button, so long posts appear
  expanded in your feed.
- For a reply, the post it answers, so Jev can spot generic reply farming.
- The text of a quoted post and the photo descriptions the author wrote. Photos are
  never sent.

Copy-paste text is caught on your device without a Jev request. A post of 8 words or
more is flagged as bot spam, marked "Repeat", when the same account posted the same
text before or when two other accounts did.

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
change its private test IDs and markup. The Jev rubric, storage, and scheduling
logic have dependency-free tests under `tests/`.

## Contributing

Pull requests are welcome. Good places to start:

- Support for another feed, such as Bluesky, Threads, or LinkedIn.
- Rubric changes, with example posts that show the improvement.
- Fixes when X changes its markup (see `src/x-adapter.js`).

Before you open a pull request, run `npm run verify` and `npm run test:browser`.
For larger changes, open an issue first so we can agree on the approach.

## License and upstream notice

This project is MIT-licensed. The adapted No AI Slop rule descriptions retain
their MIT notice in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
