# Chrome Web Store listing: Scroll Guard

Paste these values into the [developer dashboard](https://chrome.google.com/webstore/devconsole).
The fields follow the dashboard's order. Chrome does not let extensions or scripts
fill in the dashboard, so this is done by hand.

Before you submit, make the repository public. The privacy policy and homepage
URLs below point to it and must load for reviewers.

## Package

Upload `artifacts/scroll-guard-0.3.0.zip`. Build it with `npm run package`.

## Store listing tab

**Name** (comes from the manifest): Scroll Guard

**Summary** (comes from the manifest, 132 characters maximum):

> Flags AI slop, shilling, clickbait, bot spam, and scams in your X feed with TypeSafe Jev. Bring your own key.

**Description:**

```
Scroll Guard flags AI slop, shilling, clickbait, bot spam, and scams in your X feed as you scroll.

Each flagged post gets a colored frame and a short verdict. Open the verdict to see why: for AI slop, Scroll Guard names the strongest AI-writing pattern it found, such as a binary contrast ("It's not X. It's Y.") or a fake-profound kicker ("Let that sink in."). Every flagged post also gets a Block button that opens X's own confirmation. Nothing is ever blocked automatically.

WHAT IT FLAGS
• AI slop: posts that read as AI-written
• Clickbait: framing built for clicks, such as "JUST IN: Study reveals…"
• Shilling: posts that read as undisclosed paid promotion of a token, project, or product
• Bot spam: copy-paste posts, reply farming, link drops, and keyword stuffing. Text that one account repeats, or that several accounts post word for word, is caught on your device without an API call.
• Scams: fake giveaways, phishing, and requests for wallet recovery phrases

Plain news, personal updates, jokes, and excited reactions are not flagged.

YOU CONTROL IT
• Turn each type on or off.
• Choose how strict it is: Fewer (90%), Balanced (75%), More (60%), or your own threshold from 20% to 99%.
• See how many posts it checked and flagged in the last 24 hours.

BRING YOUR OWN KEY
Scroll Guard uses TypeSafe's Jev model. You paste your own Jev API key from console.typesafe.ai/keys, and TypeSafe bills your usage directly. There is no subscription and no account with us. A typical day of scrolling costs about 1–2 cents.

PRIVATE BY DESIGN
• Only the text of posts on or near your screen goes to TypeSafe for analysis, including the post a reply answers, quoted posts, and the photo descriptions authors wrote. Photos themselves are never sent.
• Your key stays on your device, in storage that pages on X cannot read.
• No analytics, no tracking, and no servers of ours.
• Open source: https://github.com/tameravci/scroll-guard

A NOTE ON ACCURACY
Scroll Guard asks Jev to judge each post against a written rubric. It is not a trained AI-text detector, and a verdict is evidence, not proof of who wrote a post. People write these patterns too.

Scroll Guard is not affiliated with X Corp. or TypeSafe.
```

**Category:** Lifestyle › Social Networking

**Language:** English

**Graphic assets** (all in `store/`):

| Field | File |
|---|---|
| Store icon (128×128) | `icons/icon-128.png` |
| Screenshot 1 (1280×800) | `store/screenshot-1-feed.png` |
| Screenshot 2 | `store/screenshot-2-evidence.png` |
| Screenshot 3 | `store/screenshot-3-popup.png` |
| Screenshot 4 | `store/screenshot-4-setup.png` |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |
| Promo video (YouTube URL) | Upload `store/promo.mp4` (18 s, 1080p60, original score synthesized in `scripts/store-music.mjs`, no licensed audio) to YouTube, unlisted is fine, and paste the link. Rebuild it with `node scripts/store-reel.mjs`. |

**Official URL:** leave empty. It needs a verified domain.

**Homepage URL:** `https://github.com/tameravci/scroll-guard`

**Support URL:** `https://github.com/tameravci/scroll-guard/issues`

**Mature content:** No

## Privacy tab

**Single purpose:**

```
Scroll Guard flags AI slop, shilling, clickbait, bot spam, and scams in the user's X feed. It sends the text of posts on the user's screen to the TypeSafe Jev API, using the user's own API key, and marks flagged posts with a frame, a verdict, and a Block button.
```

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings (on/off, verdict types, strictness) and local counts of checked and flagged posts shown in the popup. |
| Host permission `https://api.typesafe.ai/*` | Sends the text of posts on the user's screen to the TypeSafe Jev API for a verdict, authenticated with the user's own API key. This is the extension's only network destination. |
| Content scripts on `https://x.com/*` and `https://twitter.com/*` | Reads the text of posts shown in the user's feed and draws the frame, verdict, and Block button next to flagged posts. |

**Remote code:** No, I am not using remote code. (All scripts ship in the package; the API returns data only.)

**Data usage.** Check these:

- **Website content**: the text of posts in the user's X feed, including the post a reply answers, quoted posts, and the photo descriptions (alt text) authors wrote, sent to TypeSafe for analysis.
- **Authentication information**: the user's own TypeSafe API key, sent only to TypeSafe to authenticate the user's requests.

Leave everything else unchecked. Author handles and post fingerprints stay on the device and are never transmitted.

Check all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://github.com/tameravci/scroll-guard/blob/master/PRIVACY.md`

## Distribution tab

- **Payments:** Free of charge
- **Visibility:** Public (or Unlisted for a soft launch)
- **Regions:** All regions

## Test instructions (reviewers only; never shown to users)

```
Scroll Guard needs a TypeSafe Jev API key. A test key with a small budget:

    <PASTE A LOW-BUDGET TEST KEY HERE>

1. Install the extension. The setup page opens.
2. Paste the key and click "Save key". The extension tests it and shows "Key saved".
3. Open https://x.com/home while signed in to X, and scroll.
4. Posts that read as AI-written, shilling, clickbait, bot spam, or scams get a colored frame and a verdict card. Click a verdict to see the reason. The Block button opens X's own block confirmation; the extension never blocks automatically.
5. Click the toolbar icon to turn verdict types on or off and change strictness.
```

Create the test key at console.typesafe.ai/keys with a low spending limit, and delete it after approval.
