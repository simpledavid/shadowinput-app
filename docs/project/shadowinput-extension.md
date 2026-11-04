# shadowinput browser translation

The user requested a standalone Chrome ZIP, their own ChatGPT account, and both
products on shadowinput.com. Interaction direction follows the public
[Immersive Translate feature documentation](https://immersivetranslate.com/zh-Hans/docs/).
Source code, interface and branding are shadowinput's own implementation.

## Implemented preview

- Authorization, verified identity/plan grant, rotating refresh, local logout,
  authorized model discovery and explicit text translation.
- Bilingual paragraphs, restore, selection, optional Shift-hover and preview/apply
  for unchanged plain inputs.
- Optional automatic translation per explicitly authorized website.
- Compact stateful popup and one SI page button; independently opt in to keep
  that button on a website without automatic translation.
- Chinese/English UI; Chinese/English/Japanese targets; cancellation and recovery.

This is not production feature parity. PDF layout translation, EPUB export,
subtitle files/live video, image/OCR, glossary/prompts, more engines, mobile
browsers and site-specific video adapters are not implemented in this ZIP.
They remain subsequent slices after real account/browser acceptance.

The [extension README](../../apps/extension/README.md) owns installation,
permissions and storage details. Text is sent after an explicit action, or
automatically for an enabled site. No shadowinput proxy, analytics, chat-history
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

## Compact popup and page button

The popup keeps the target language, one translate/restore action and the current
site's automation switch on its home view. Models, refresh, pinned button,
Shift-hover and input preview are in Settings. Text and account links open the
corresponding workbench sections; these fragment URLs retain exact extension-page
sender validation. The reader owns page/hover state and reports only two booleans
to the popup. Restoring originals bypasses configuration/model reads and cancels
the document's work.

Pinning and automatic translation share one origin-specific content registration
but keep separate preferences. Saving either is serialized by the worker; failed
preference writes roll back the registration. Manual popup inspection initializes
the reader without triggering a saved automatic-translation rule. Persistent
injection is limited to origins explicitly granted by the user.

Failing-then-passing DOM and worker tests cover stateful actions, recovery,
permission denial, independent site options, failed-save rollback and the trusted
fragment routes. Browser-rendered synthetic fixtures cover Chinese/English and
light/dark popup states. A real browser fixture displayed the rounded button;
keyboard activation inserted bilingual fixture text and restored originals with
no extra translation request. Automated coordinate clicking cannot access the
closed shadow root in that browser tool; DOM click tests cover the same action.
These checks do not prove Chrome installation, persistent permission prompts or
live GPT inference. The website and installed extension have not been replaced.

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
