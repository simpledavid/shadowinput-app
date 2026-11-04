# ADR 037: Standalone shadowinput browser extension

## Status

Accepted for preview; real OAuth/browser compatibility remains an explicit gate.

## Decision

Add `apps/extension`, a TypeScript MV3 runtime independent of Go/MyGo and the
website. Follow downward FSD imports. The worker composes account, translation
and Chrome adapters; content scripts cannot access account operations/tokens.

Use OSS PKCE/dynamic registration, verified OIDC identity and separate plan scope.
The experimental receiver handles only the created tab's top-level loopback
navigation. This differs from the documented native HTTP listener and needs
real verification. No desktop helper, copied credentials, private ChatGPT API
or API-key fallback is introduced.

Declare an isolated top-level content script on ordinary HTTP(S) pages so the
complete toolbar appears on navigation. Exclude provider authorization/API pages
and the loopback callback. Chrome site-access controls still apply; this change
from activeTab-only startup expands declared webpage access. Displaying the
toolbar alone never sends text. Automatic translation requires a separate saved
per-origin opt-in and current permission; it is not implied by toolbar visibility.
Preserve originals and require unchanged draft snapshots. One worker owns refresh
writes, while document-scoped jobs own cancellation. Browser local storage is
not OS-keychain encryption.

## Consequences

Publish independent preview ZIPs with accurate limits. The desktop's successful
OAuth flow is not extension evidence. The full feature direction and unimplemented
slices are recorded in [the guide](../project/shadowinput-extension.md) and
[requirements](../../specs/013-browser-translation.md).
