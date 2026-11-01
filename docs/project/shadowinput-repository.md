# shadowinput repository

The active project is [simpledavid/shadowinput-app](https://github.com/simpledavid/shadowinput-app), on `main`. It contains the input method, desktop writing tool, Chrome translation extension and Chinese website. Its initial commit is a source snapshot, with no inherited Git parent or tag history.

## Provenance and compatibility

The snapshot includes the integrated shadowinput-desktop source at `05d305e47bf1660f4c2f6c22becce666e5c6c447` and the phrase-label and Windows candidate-click fix recorded locally at `75e4f84b`. The upstream Arion base and original author attribution are preserved in [NOTICE](../../NOTICE.md), together with the unchanged [license](../../LICENSE). Third-party licenses, source headers and maintained MyGo source remain in place.

The previous repository had 385 commits on its published main branch before this migration, including inherited upstream history. Resetting the new repository's history does not change the code's provenance or license. Old worktrees and uncommitted work are not removed. Historical commit references in inherited technical records still describe the old repositories.

Internal Go module names, input-method identifiers, local preference paths and stored credentials are unchanged. A repository rename must not reset installed app state. Arion technical documents remain reference material; the current product entry points are [desktop](shadowinput.md), [input method](shadowinput-ime.md) and [browser extension](shadowinput-extension.md).

## Downloads and publication

The old repository remains available for immutable desktop `v0.1.0-preview.6` and browser `browser-v0.1.0-preview.3` assets and their corresponding source archives. Existing website download links are preserved. They do not include the new candidate-label/click fix. Website source and current-documentation links now target shadowinput-app. New packages produced here embed this repository's source URL and exact revision.

The inherited Arion CI, release and signed-macOS workflows were removed from the new repository. They depended on upstream infrastructure and are not shadowinput release automation. The only installed workflow is the explicitly dispatched [Windows candidate check](../../.github/workflows/windows-candidates.yml), with read-only repository permissions, no account credentials and synthetic test text.

## Verification

The phrase fix removes the left AI prefix and retains a trailing Tab arrow. Windows candidates no longer confuse hidden number labels with disabled mouse selection. The existing native fixture now checks the unnumbered phrase's exact identity, revision and retained editor focus.

Before migration, macOS AppKit continuation tests, shared state tests, both IME component builds, Windows candidate cross-compilation and `node scripts/shadowinput.mjs check` passed. These results do not establish installed Windows behavior. Crapper, Dryer and Mutator were not available and were not run.

The [hosted Windows candidate run](https://github.com/simpledavid/shadowinput-app/actions/runs/41315563624) subsequently passed on Windows Server 2022: committed-word context and expiry, cancellation and stale requests, native WinHTTP transport, candidate rendering, unnumbered mouse selection identity and retained editor focus. The first run exposed a missing `<cstring>` include in the context fixture; Windows GCC reproduced it, and the explicit header fixed compilation. These synthetic native checks do not establish installed TSF registration, real editor compatibility or local-model inference.

On an actual Windows host with Node and MinGW-w64 GCC on PATH, run:

```sh
node scripts/test-shadowinput-candidates.mjs
node scripts/test-windows-candidates.mjs
```

These checks exercise committed-word state, cancellation, stale responses, native WinHTTP transport and the real Win32 candidate window. They do not install or register an input method. The full owned TSF fixture separately requires a staged keyboard runtime and `node scripts/test-windows-tsf-keyboard.mjs`; installation, system switching, local inference and typing in Notepad, Chrome and Office remain manual acceptance gates.
