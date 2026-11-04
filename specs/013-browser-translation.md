# 013: shadowinput browser translation

Download a Chrome ZIP from shadowinput.com, load unpacked, connect ChatGPT and
translate within web pages without a desktop companion. The interaction direction
follows Immersive Translate's public workflows.

| ID | Observable requirement |
| --- | --- |
| EXT-01 | ZIP contains MV3 manifest, local scripts/assets, license and installation steps. |
| EXT-02 | Fresh PKCE/state/nonce bind sign-in to the owned tab/exact callback; reject forged, expired, denied or replayed callbacks. |
| EXT-03 | Validate signed identity, issuer, audience, expiry, nonce, account and separate plan permission. |
| EXT-04 | Restore/rotate credentials; serialize refresh; never release unpersisted rotated tokens; logout clears credentials. |
| EXT-05 | Only completed responses are usable; cancellation/refusal/truncation cannot produce an applicable partial result. |
| EXT-06 | Bilingual reading preserves originals and restores them; skip hidden, editable and code content. |
| EXT-07 | Selection and Shift-hover translate requested text; render model output as inert text. |
| EXT-08 | Preview plain-input translation; reject changed drafts, passwords and unsupported rich editors. |
| EXT-09 | Site automation needs an explicit origin grant; content contexts cannot access account operations. |
| EXT-10 | Website provides separate input-method DMG/EXE and browser ZIP with accurate verification/signing limits. |
| EXT-11 | The popup exposes language, model and site controls in one view without a large page-translation button. Show account email, plan explanation and sign-out inline, with loading/sign-in/retry recovery and no duplicate footer links; restoring originals from the page needs no model lookup. |
| EXT-12 | Ordinary top-level HTTP(S) pages show the complete floating toolbar on load, subject to Chrome site access; provider authorization/API pages and the loopback callback are excluded. No popup click or per-site pin is needed. The upper Quick action opens a separate window; lower SI translates/restores the page. A grip supports pointer/keyboard movement within viewport bounds; close hides only the launcher, which popup inspection or a reading action can reopen at its current document position. Dragging and merely displaying the toolbar never translate. Automatic translation remains separately opted in per origin and requires a current permission grant. |
| EXT-13 | Prioritize visible paragraphs before applying the per-run limit, deduplicate repeated text and batch bounded short paragraphs while keeping the first request small. Validate every output ID before applying a completed batch; cancellation and changed text reject stale results. |
| EXT-14 | Quick translation shares the account/model, opens with an empty draft, automatically translates typed/pasted text after a short pause and supports cancellation/retry without Translate/Copy buttons. IME composition and stale drafts never produce applied translations; output stays selectable for manual copying. Reopening focuses a live owned window; content cannot choose an arbitrary window URL or access credentials. |

Real Chrome installation, authorization and completed inference are mandatory for
end-to-end acceptance; synthetic tests do not satisfy that gate. See
[verification](../docs/project/shadowinput-extension.md).

Subsequent slices cover TXT/subtitle files, PDF/EPUB, video adapters, site rules,
glossary/prompts, images/OCR and other platforms/engines. Preserve subtitle timing
and ebook structure; distinguish PDF extraction from layout-preserving output.
Empty controls or fake translations do not count as implemented features.
