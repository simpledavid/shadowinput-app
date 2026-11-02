# shadowinput repository

The active project is [simpledavid/shadowinput-app](https://github.com/simpledavid/shadowinput-app), on `main`. It contains the input method, desktop writing tool, Chrome translation extension and Chinese website. Its main history starts with an independent source snapshot. Migrated release tags are separate parentless source snapshots; they do not add upstream commits to main.

## Provenance and compatibility

The snapshot includes the integrated shadowinput-desktop source at `05d305e47bf1660f4c2f6c22becce666e5c6c447` and the phrase-label and Windows candidate-click fix recorded locally at `75e4f84b`. The upstream Arion base and original author attribution are preserved in [NOTICE](../../NOTICE.md), together with the unchanged [license](../../LICENSE). Third-party licenses, source headers and maintained MyGo source remain in place.

The previous repository had 385 commits on its published main branch before this migration, including inherited upstream history. Resetting the new repository's history does not change the code's provenance or license. Old worktrees and uncommitted work are not removed. Historical commit references in inherited technical records still describe the old repositories.

Internal Go module names, input-method identifiers, local preference paths and stored credentials are unchanged. A repository rename must not reset installed app state. Arion technical documents remain reference material; the current product entry points are [desktop](shadowinput.md), [input method](shadowinput-ime.md) and [browser extension](shadowinput-extension.md).

## Downloads and publication

The current desktop download is preview.8, built from clean commit `4ffcae7c` in this repository. It adds a bundled 4M Pinyin ranker independent of Qwen continuation, retaining the earlier candidate-label and Windows phrase-click fixes. See the [input-method guide](shadowinput-ime.md#本地候选排序) for verified behavior and remaining acceptance limits. Earlier releases remain unchanged for rollback and historical source access.

Desktop `v0.1.0-preview.6` and browser `browser-v0.1.0-preview.3` are preserved in [this repository's releases](https://github.com/simpledavid/shadowinput-app/releases). All original asset bytes, SHA-256 checksums and embedded build metadata are unchanged. The migrated preview.6 desktop archive does not include the newer candidate-label/click fix. Each migrated tag points to an independent commit with the exact original source tree and no parents; GitHub source downloads and the original attached source archives remain available without importing upstream history.

The old GitHub repository is retained at its owner’s latest request. Current distribution uses shadowinput-app. Its Git refs/history and release metadata were also saved locally during migration. Existing local checkouts and cached historical packages remain intact. Website, current documentation and future package source links use shadowinput-app. Source URLs embedded in unchanged old packages may reference the former repository; use the migrated release's corresponding source archive or tag instead.

The inherited Arion CI, release and signed-macOS workflows were removed from the new repository. They depended on upstream infrastructure and are not shadowinput release automation. On main, the only installed workflow is the explicitly dispatched [Windows candidate check](../../.github/workflows/windows-candidates.yml), with read-only repository permissions, no account credentials and synthetic test text. Historical tags preserve upstream workflow files as part of their exact source trees; their archive commits use `[skip ci]` and are not used as the current release pipeline.

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
