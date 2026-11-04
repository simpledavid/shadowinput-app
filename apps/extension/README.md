# shadowinput browser extension

Standalone Chrome MV3 preview. Unzip, load unpacked, then connect your own ChatGPT.
See [installation](INSTALL.txt), [verification](../../docs/project/shadowinput-extension.md),
[requirements](../../specs/013-browser-translation.md) and
[ADR 037](../../docs/decisions/037-standalone-browser-extension.md).

The popup exposes target language, authorized model/refresh, automatic
translation, the pinned SI button, Shift-hover and input preview in one view.
There is no secondary Settings page, large page-translation button or duplicate
footer links. Text translation uses the page launcher's Quick translation window.
An inline account card shows the signed-in
email, plan limits and sign-out action, and handles sign-in/progress/retry.
Sign-out clears the displayed identity and model choices after worker confirmation;
a failed sign-out remains recoverable. Selection translation stays in the right-click
menu. Alt+Shift+T toggles page translation; Alt+Shift+I previews the focused input.
Chrome's shortcut settings can change these bindings.

Opening the popup or using a page action adds a two-button launcher. The upper
window icon opens Quick translation in a separate compact browser window; the
lower SI button translates/restores the current page. Quick translation shares
the existing account/model and translation behavior, starts with an empty draft
and sends text only after submitting. It does not read the clipboard or import
page text. Reopening focuses a live quick window without changing its draft. Restore remains available without
reloading models or contacting the provider. Model loading and retry controls
remain visible; unavailable models do not leave a blank list.

Reading is capped at 120 paragraphs per run with two concurrent requests per
document. Visible paragraphs are prioritized, and identical text is translated
once per scan. The first paragraph gets its own request to keep the first result
small. Later short paragraphs share a request, up to four paragraphs and 6,000
source characters. Longer paragraphs (up to 8,000 characters) remain individual
requests. A batch must complete with every requested paragraph ID exactly once;
missing, duplicate, invalid or empty entries cannot be applied. Each completed
batch appears without waiting for the rest of the page.
Original DOM nodes remain intact. Output is inert text in isolated shadow roots.
Changed paragraphs/drafts reject stale results. Hidden content, code, password
fields and rich editors are excluded. Restore cancels that document's work.

Site automation and a pinned SI button are both off by default. Each requests
only the chosen origin's permission. "Keep SI on this website"
shows the button on future visits without translating automatically. Turning off
either option preserves the other's registration. Unpinning takes effect on the
next visit; the current page keeps its already-opened button.
Original text and translations are never persisted. A bounded document cache
clears on restore/navigation. No analytics, desktop helper, API-key requirement,
ChatGPT cookie access or desktop credential sharing is included.

The service worker owns credentials/refresh. Browser local/session storage is
restricted to trusted extension contexts. Local storage persists credentials
across restarts but is **not OS-keychain encryption**. Content scripts receive
only translation results and non-secret preferences.

Connection and in-page translation errors show a fixed step, failure category,
optional HTTP status and allowlisted provider/stream reason. Plan usage limits,
temporary unavailability, model restrictions, refusals, output limits and missing
completion events remain distinct. No retry or reauthorization loop is started.
Only `response.completed` can authorize a result. Nonempty final output is
authoritative. When that output array is empty or omitted, completed assistant
items from `response.output_item.done` supply the text in output-index order,
excluding commentary and duplicate events. An unfinished item, explicit empty
final message, refusal or incomplete response cannot become a translation.
Raw deltas never replace an empty final array. Safe reasons distinguish no text
(`empty_output`), deltas without completed text (`missing_completed_text`) and
items without a final answer (`no_final_text`); they contain no response content.
These diagnostics exclude raw exceptions, URLs, response bodies, credentials and
translated content. The latest callback error is held only in session storage and
clears when sign-in starts/completes or the user signs out.

The [OpenAI OSS flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
documents an HTTP loopback listener. This experiment receives that callback via
the created authorization tab's top-level navigation event. It validates state,
PKCE, issued client ID, signed identity/nonce/account and plan scope. It never
consumes another tab's callback. This is **not documented extension support**;
real authorization and inference remain a release acceptance gate.

After replacing an unpacked extension, reload it in Chrome's extension manager
and refresh the webpage being translated so that both worker and content script
use the new build. For a failure, share only the displayed diagnostic code, not
tokens, callback URLs or a network export.

## Build

Use Node 22+ and the repository-pinned pnpm:

```sh
pnpm install --frozen-lockfile
pnpm extension:check
pnpm extension:build
```

Generated ZIP/unpacked files are in ignored `dist/`. TypeScript emits local
extension modules; esbuild bundles the isolated content script. No remote scripts
or runtime framework dependencies are loaded. SI PNG assets are transparent exports
of [the shared rounded SI vector](../shadowinput-site/public/favicon.svg), preserving
alpha at the corners. The floating button exposes only its local SI icon as a
web-accessible resource; extension pages and scripts are not exposed.
