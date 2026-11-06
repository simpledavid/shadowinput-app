# shadowinput browser translation

The user requested a standalone Chrome ZIP, their own ChatGPT account, and both
products on shadowinput.com. Interaction direction follows the public
[Immersive Translate feature documentation](https://immersivetranslate.com/zh-Hans/docs/).
Source code, interface and branding are shadowinput's own implementation.

New feature development is paused while the [system input method](shadowinput-ime.md)
is the primary focus. The existing preview is retained. Fast translation engines
have not been added, and the two-second page-translation target remains unmet and
unverified; it is deferred rather than marked complete.

## Implemented preview

- Authorization, verified identity/plan grant, rotating refresh, local logout,
  authorized model discovery and automatic translation of typed/pasted drafts.
- Bilingual paragraphs, restore, selection, optional Shift-hover and preview/apply
  for unchanged plain inputs.
- Optional automatic translation per explicitly authorized website.
- Single-view popup controls and a two-action page launcher that appears on ordinary
  pages subject to Chrome site access; automatic translation stays separately opted in.
- Chinese/English UI; Chinese/English/Japanese targets; cancellation and recovery.

This is not production feature parity. PDF layout translation, EPUB export,
subtitle files/live video, image/OCR, glossary/prompts, more engines, mobile
browsers and site-specific video adapters are not implemented in this ZIP.
They remain subsequent slices after real account/browser acceptance.

The [extension README](../../apps/extension/README.md) owns installation,
permissions and storage details. In the quick/full text window, typed or pasted
text is sent automatically after a pause. Webpage text is sent after a translation
action or automatically for an enabled site. No shadowinput proxy, analytics, chat-history
access or persistent original/translation history is used. Local logout clears
credentials; it does not revoke the provider-side grant.

## Evidence and limits

- Strict TypeScript compilation, synthetic signed-token/transport tests, DOM
  reading/replacement tests, worker sender/callback ownership and ZIP build ran.
  Test output owns the current count; fixtures are not real inference evidence.
- In the initial attempt, the user loaded the extension and reported an error after
  completing OpenAI authorization and returning to the account page. This is a
  failed real acceptance attempt, not successful sign-in. The browser tool blocks
  both chrome://extensions and extension pages, so their UI requires user checks.
- Safe diagnostics identify token exchange, identity keys/verification, model
  discovery and translation separately. Only allowlisted stage/code/kind and an
  optional HTTP status cross the worker boundary. Callback failure metadata lives
  in session storage and clears with a new sign-in, successful sign-in or logout.
  Raw errors, URLs, response bodies, credentials and text are excluded.
- The first callback failure was narrowed to token-exchange transport. A Chrome
  Worker probe reproduced `Illegal invocation` when native fetch was called as an
  account object's method; unbound/global-bound calls succeeded with the same
  fixed data URL. The default account transport now binds fetch to the global
  receiver, covered by a failing-then-passing regression. This browser-runtime
  reproduction does not itself establish successful OpenAI inference.
- After the fetch-receiver fix, a user-provided screenshot showed the connected
  account and an authorized model in both the workbench and popup. Real sign-in
  and model discovery now have manual evidence; completed translation is pending.
- Completed real translation, browser restart/token rotation/logout and live-page
  compatibility remain unverified.
  Desktop OAuth acceptance does not validate the extension.
- A later real page attempt displayed the generic incomplete-translation error.
  The screenshot does not identify the provider's underlying cause. Regression
  tests reproduced two defects: completed output without deltas was discarded,
  and stream failures (including plan limits) lost their actual category. The
  parser now uses final message output only at `response.completed`, and the
  webpage card retains allowlisted failure reasons across the worker boundary.
  Unknown raw messages/codes are not exposed. After reloading preview.3, the user
  provided a real webpage screenshot showing
  `subscription_sharing_usage_limit_exceeded`. This confirms a provider-enforced
  usage limit for that request; it does not establish whether the limit is
  plan-wide or application-specific, nor its reset time. The page stops new work
  and cancels in-flight jobs. Repeated sign-in is not a recovery for this code.
  Completed real translation remains pending available usage.
  Protocol references: [inference completion](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
  and [structured recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).
- Pre-merge review reproduced and fixed three regressions: an old model request
  could clear a newer login, the popup enabled page actions on unsupported pages,
  and closing the text workbench left its translation running. Worker and DOM
  regression tests now check session ownership, disabled actions with guidance,
  and cancellation when the owning tab closes. These are synthetic checks.
- Crapper, Dryer and Mutator are not installed/integrated and were not run.
  No CRAP, duplication or mutation score is claimed.

Publish this as a preview with those limits, not a Chrome Web Store release.

## Popup controls and page button

Language, model/refresh, website automation, Shift-hover and input
preview are directly visible in the popup. Page translation/restoration uses the
SI launcher, keyboard shortcut or context menu; the large popup action and
secondary Settings view have been removed at the user's request. The inline account
card shows the signed-in email, plan explanation and sign-out action even on
unsupported pages. It also owns sign-in/progress/retry; model failures retain a
retry control. Sign-out uses the existing worker lifecycle and clears local UI
identity/model choices only after success. A failed sign-out preserves the account
and shows a retryable error. The redundant footer is removed; text translation
uses the page launcher's Quick translation window. Pending sign-in progress opens
the workbench account section; fragment URLs retain exact extension-page sender
validation. The reader owns page/hover state
and reports only two booleans to the popup. Restoring originals bypasses
configuration/model reads and cancels the document's work.

Ordinary top-level HTTP(S) navigation now loads the complete toolbar directly.
The previous activeTab/per-origin-pin startup required opening the popup on a
fresh website, which did not match the requested always-visible entry point.
Static manifest content scripts replace the pin option and its dynamic
registration. Provider authorization/API pages and the loopback callback are
excluded; Chrome's site-access controls and restricted-page rules still apply.
The expanded declaration may require Chrome approval after updating.
Showing the toolbar sends no page text. Automatic translation retains its own
saved origin opt-in and current permission check, including after a permission
revocation. Updates retire only legacy owned dynamic registrations without
changing automation preferences. Manual popup inspection does not itself start
an automatic translation.

The page toolbar has a drag grip, the two translation actions and a bottom close
control. Dragging the grip or action buttons moves it after a small threshold;
release does not fire an action. Arrow keys move the focused grip (Shift increases
the step). Interrupted drags restore the previous position. Bounds are clamped on
movement and viewport resize. Closing only hides the host; translations
and automation stay intact. The popup's existing reading-state request or an
explicit reading action reopens the same host. Position/visibility belong to the
launcher for this document, without persistent position storage. A new document
starts at the default position. Reader result updates never reopen a closed bar.

Failing-then-passing DOM and worker tests cover directly visible controls, recovery,
permission denial/revocation, automatic startup without text transmission,
duplicate-injection prevention, legacy registration migration, failed saves and the trusted
fragment routes. Browser-rendered synthetic fixtures cover Chinese/English and
light/dark popup states. A real browser fixture displayed the rounded button;
keyboard activation inserted bilingual fixture text and restored originals with
no extra translation request. Automated coordinate clicking cannot access the
closed shadow root in that browser tool; DOM click tests cover the same action.
These checks do not prove Chrome installation, persistent permission prompts or
live GPT inference. A local unpacked build can be replaced independently of the
website/public download; replacement still requires Chrome reload and webpage
refresh before runtime acceptance.

## Quick translation window

The upper launcher button opens a compact `quick.html` window. The lower SI button
continues to translate/restore only the current page. The quick page reuses the
workbench feature for account status, model/target preferences and automatic text
translation with cancellation/retry; it has no automatic selection/clipboard
capture and does not persist drafts or results. Closing its tab follows the same
worker-owned job cancellation as the full workbench.
The quick window removes the signed-in account/email/logout row. It keeps only
conditional sign-in recovery when disconnected or authorization is pending;
account management remains in the popup and full workbench.

Both text windows remove the Translate/Copy buttons and use one shared scheduler.
The current nonempty draft starts after a 700 ms pause, only with a connected
account and usable model. Composition waits for committed text. A changed draft,
target or model invalidates the old result immediately. One active request and
one latest replacement are owned by the scheduler; the old request and its
cancellation must settle before a replacement starts. Clearing, cancelling or
closing drops queued work. Errors show a small explicit retry action, never an
automatic retry loop. Output stays selectable for keyboard copying; there is no
automatic clipboard write. Visible privacy copy explains automatic transmission.

The worker only opens the fixed internal URL, ignores caller-supplied text/URLs,
and coalesces concurrent opens. It uses
[Chrome extension contexts](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getContexts)
to focus an existing quick page through the
[window API](https://developer.chrome.com/docs/extensions/reference/api/windows#method-create).
No new manifest permissions or browsing-history access are requested. Exact
quick-page URLs join the trusted extension-page allowlist; content contexts gain
only the fixed opening action and still cannot invoke account operations.

DOM and worker fixtures cover upper/lower routing, no translation on opening,
window creation/reuse, ignored untrusted fields, sender boundaries, debounced
translation, IME composition, stale-result rejection and cancellation. The shared workbench also now gives model
loading/failure placeholders and disables unusable selections until refresh
succeeds. Browser-rendered Chinese/English light/dark fixtures fit the compact
window content width, and keyboard activation verified the two launcher routes
without changing page text from the quick action. Actual Chrome popup-window
behavior and live provider inference remain manual acceptance gates after
reloading the extension.

## Translation request efficiency

The user reported slow GPT-6.1 Sol webpage translation and supplied a card showing
16 translated paragraphs. That shows reported progress, not measured latency or
translation-quality acceptance. A deterministic reader fixture reproduced one
provider call per paragraph and DOM-order scheduling even when the visible
paragraph appeared later in the page.

The reader now groups identical text, prioritizes the viewport and reserves a
small first request. Remaining paragraphs use bounded batches; the
[extension README](../../apps/extension/README.md) owns the limits. The worker
uses the saved model/target and keeps the existing document/global concurrency
caps. No automatic model switch, retry loop or remote batch-job
service is introduced. Batch text travels through the existing completed-response
stream parser, then exact ID/count/nonempty-text validation restores source order.
A malformed batch is rejected as a whole. No source text or raw malformed output
is added to diagnostics or persistent storage.

Fixtures cover request reduction, first-visible priority, duplicates, long-text
bounds, reordered IDs, malformed/incomplete results, document cancellation and
changed paragraphs. They establish fewer calls, not a measured live Sol speedup.
Real account timing and the model's batch-format compliance remain acceptance
checks. A first response can still be delayed by provider/network latency.

A later regression reproduced a scrolled long page whose visible paragraph fell
beyond the initial DOM-order cap. Visibility is now ranked before limiting nodes;
only selected nodes are marked as scheduled. Duplicate text remains one request,
and the cap still counts annotated nodes, not unique text. Provider requests use
the model-specific reasoning policy documented in the extension README to reduce
unnecessary reasoning work. Tests assert both single and batched request bodies
while preserving unknown-model defaults and completed-response validation. These
fixes have synthetic regression evidence, not a measured provider speedup or a
controlled comparison with another extension.

## Empty-output regression

The user reported `stream · empty_output` with both GPT-6.1 Sol and GPT-6.1 Terra,
including a workbench request containing only `hello`. This narrows the failure
beyond page extraction, but screenshots do not establish the provider event shape.
A synthetic reproduction passed a completed assistant item followed by
`response.completed` with an empty output array: the previous parser discarded
the item and reproduced the empty-output failure. The regression failed before
the change and passed afterward, including bilingual insertion/restoration through
the production reader and translation functions.

The parser now retains completed output items by index and waits for the response
completion gate. A nonempty final output remains authoritative; incomplete items,
refusals, commentary and failed/interrupted streams remain unusable. Diagnostics
separate absent text, uncompleted deltas and items without a final answer without
retaining source text, translations, raw errors or response bodies. See the
[Responses item event schema](https://developers.openai.com/api/reference/resources/responses/streaming-events#response.output_item.done).
This is protocol-fixture evidence, not confirmation of the remote user's exact
response or successful live GPT inference. A refreshed extension must still pass
`hello` translation and a normal webpage on that account. Desktop installers and
website deployment remain paused.
