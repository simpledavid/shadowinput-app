# 012: shadowinput local input phrases

This derivative extends the native Pinyin entry point in [ADR 036](../docs/decisions/036-shadowinput-runtime.md). Explicit long-form writing remains covered by [011](011-writing.md). Runtime acceptance and measured limits live in the [input-method guide](../docs/project/shadowinput-ime.md).

| ID | Observable requirement | Verification |
| --- | --- | --- |
| NPH-01 | Space/numbers commit ordinary words without waiting for a model. Only committed text starts a short continuation request; independent fast reranking may use the current candidate snapshot. | Native Rime/NSTextView fixture |
| NPH-02 | Tab/click appends once at the unchanged caret. Continued typing, deletion, navigation, focus changes and opt-out revoke old work. | Native fixture, portable request-state and broker cancellation tests; real OS acceptance separately |
| NPH-03 | Context contains only this input method's recent contiguous commits, is bounded and expires. No surrounding document reads or input history. | Shared UTF-8 context fixture and source inspection |
| NPH-04 | Automatic phrases use local lookup or the local model regardless of writing-provider selection. No cloud fallback or implicit model download. | Local routing, opt-out and missing-model tests |
| NPH-05 | Complete short suffixes only; reject echo, multiline/control output, repeated boundaries and obvious assistant replies. Generated suffixes additionally reject new numeric/date/promise tokens. | Generator and broker tests; filtering is heuristic |
| NPH-06 | Shadowinput defaults to existing Rime typo correction while preserving exact Pinyin candidates. | Real native engine fixture; Windows cross-build with shared default |
| NPH-07 | Input settings expose model setup and opt-in independently of ChatGPT login; profile failures retain recovery. | Production-view action and recovery tests; localized renders |
| NPH-08 | Opt-in bundled 4M ranking works without Qwen or ChatGPT, starts without preceding text, preserves trusted dictionary leaders and whole-input candidate coverage, and never invents a candidate. | Real worker, broker, lifecycle and native-loopback tests |
| NPH-09 | Fast ranking never blocks the initial menu; navigation, focus, opt-out and newer revisions revoke proposals. Startup/quit cannot wait cyclically on the UI thread. | Native snapshot and lifecycle regression tests |
| NPH-10 | With AI enabled, two-character committed prefixes offer a bounded personal/common phrase without requiring Qwen. Longest matching prefix wins; personal terms take priority, then list order. | App routing, domain matching and broker whitespace tests |
| NPH-11 | Existing personal terms can be viewed, reordered, edited and removed. Saving and reloading updates subsequent suggestions, with no implicit input-history learning. | Profile save/edit/delete/reload through the app entry points |
| NPH-12 | Only unmatched unfinished clauses with at least four Han characters reach Qwen after a cancellable quiet period. Native lookup starts immediately; late replies cannot insert at a changed caret. | App trigger/cancellation tests; native request and append-once fixtures |

No claim of Windows runtime or editor-wide compatibility follows from a cross-build. No claim of full semantic preservation follows from surface filters.
