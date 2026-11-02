# shadowinput 系统输入法预览

主入口为系统输入法设置，复用 Arion 的 Rime 拼音引擎、macOS InputMethodKit 宿主及 Windows TSF 服务。目标是从系统输入菜单切换后直接打字，普通词语上屏后出现独立 AI 短语联想。官网的 v0.1.0-preview.9 已包含该实现与 4M 拼音排序，提供 DMG 和 EXE 下载；完整系统输入验收仍待完成，不能视为已经可替代微信输入法的成品。

## 使用流程

1. 打开 shadowinput，在“输入法设置”安装 / 启用组件。macOS 首次需要系统允许；Windows 注册 TSF 服务需要管理员授权。
2. 在 macOS 菜单栏输入菜单或 Windows 的 Win + 空格菜单中选择 shadowinput。只有系统实际列出并选中输入法后，才可进行下面的输入验收。
3. 在编辑器里输入拼音。空格或数字选择普通候选，Esc 取消。普通拼音使用本地 Rime，不依赖 ChatGPT。
4. 明确开启“AI 候选”，并保持主程序运行。随包提供的 4M 小模型先启动，用于现有拼音候选排序；设置页单独显示其就绪或失败状态，不依赖 ChatGPT 或 Qwen。下载并启动 Qwen 后，还可使用上屏后的短语联想。正常按空格分词上屏；至少 2 个字后暂停约 180 毫秒，请求一次短语续写。模型推理耗时另计。已下载且 AI 开关开启时，下次启动会预热模型；不会自动下载。
5. 只有请求完整成功且通过检查，才显示独立短语候选，末尾用 `⇥` 提示 Tab 采纳，不再在左侧显示“AI”。Tab 或点击只追加新短语，保留已上屏文字。继续输入、移动光标、删除、换焦点或关闭 AI 会撤销旧候选。请求超时（2 秒）、重复原文、回复式结果或不可用时不显示短语行。

拼音容错默认开启，复用 Rime 已有的纠错能力；它不调用大模型。短语联想只追加文字，不自动发送聊天、不读取整篇文档。ChatGPT 登录、润色、翻译、改写、续写和完整差异审阅保留在“长文写作工具”中，模型选择互不影响。AI 行不占用普通候选的数字槽位；AI 文本不写入用户词库。

## 本地候选排序

开启 AI 后，Rime 仍先显示普通候选，`chinese-ime-lm` 4M 在独立进程中从这些候选中选择首选，不生成新词，也不替换 Qwen 的上屏后短语联想。排序和续写各有独立的回环端口、随机令牌、取消状态和发现文件；Qwen 未安装、加载或繁忙不阻止排序。关闭 AI 撤销两条路径并释放 4M 进程。排序失败时保留 Rime 菜单，设置页提示关闭再开启 AI 重试。

只比较完整覆盖当前拼音、与首选覆盖范围相同的汉字候选，最多 27 个；保守地保留 `phrase` / `user_phrase` 词库首选。英文、Emoji、部分输入候选和已开始导航的菜单不被改动。即使没有前文也可以排序；前文仅使用输入法已有的最近确认上屏上下文，不读取宿主全文。返回值必须是已有候选身份的稳定提升，应用前再次验证输入修订、焦点和组合范围。继续打字、选词、翻页、移动光标、失焦或关闭 AI 均使旧结果失效。没有更好的选择时菜单保持不变，因此不会每次出现额外的 AI 提示。

排序结果有效期为 100 毫秒；工作进程有 1 秒看门狗，取消后先排空当前有界响应再处理下一请求，避免串答。原生输入线程不等待推理。Windows 完成通知回到原 COM 线程后才申请编辑会话，不在工作线程操作 TSF。

权重、大小、校验值和许可证由[模型目录](../../models/catalog.json)统一定义，使用 `chinese-ime-lm` 0.2.0 的 `best_where` 策略。工作进程适配自 [Arion 0095c104](https://github.com/AstraFoundry/Arion/tree/0095c1046aa33e4e3d30e54ac236e0b82a8a982f/apps/desktop/runtime/keyboard-ranker)，仅保留 4M 候选排序，不引入其 25M 比较评分或窗口上下文读取。构建固定 Rust 1.90.0 和 Cargo.lock，下载时及运行前验证权重 SHA-256；保留模型内嵌 Apache-2.0 署名和全部 Cargo 依赖许可证。

准备 Rust 1.90.0；macOS 使用 `aarch64-apple-darwin`，Windows 使用 `x86_64-pc-windows-gnu`（需要 MinGW-w64 GCC）。`scripts/shadowinput.mjs build/package` 自动调用 stage；只在构建时下载，打字时不下载。单独检查：

```sh
node scripts/stage-keyboard-ranker.mjs darwin-arm64
node scripts/test-keyboard-ranker.mjs
node scripts/test-shadowinput-ranking.mjs
```

Windows staging 参数改为 `windows-amd64`；最后一项是 macOS 专用的真实 Rime / HTTP / 模型 / NSTextView 夹具。Windows 的同一真实模型脚本、候选状态及 WinHTTP 测试由手动触发的 `Windows candidate checks` 工作流执行。它们不能代替已安装 TSF 在微信中的实际键盘验收。

本轮已验证：无前文排序、两条请求路径互不取消、关闭及过期结果拒绝、退出与启动交错不死锁；真实 4M 的合成选词、保留词库首选、拒绝不同覆盖范围和损坏权重；macOS 原生完整请求到空格上屏、旧修订拒绝。单个合成选词在本机约 2 毫秒，不是准确率或尾延迟基准。Windows 原生 CI 已通过真实 4M 推理、候选窗口、WinHTTP 请求和取消验证，见 [运行记录](https://github.com/simpledavid/shadowinput-app/actions/runs/41441037667)。该实现不保证“部门”之后出现续写，也不构成 Windows 微信兼容性修复。

## 错误恢复和更新

- 个人风格读取失败时，输入法设置、写作页和个人风格页显示同一错误和重试入口；不覆盖异常文件。
- 自动候选固定使用本地模型，不依赖 ChatGPT 登录和额度，不会退回云端。主程序中启动模型、暂停或失败时显示本地状态。主动写作请求的账户错误仍由写作页处理。
- Windows 安装前读取原生注册状态：首次安装和同版本修复使用 `install`，版本变化或迁移使用已有的 `update` 事务，传入之前的构建指纹并保留底层回滚机制；无法确认状态时不修改注册。
- Windows 每个候选请求独立持有取消状态。继续输入或结束组合会撤销旧请求；WinHTTP 使用异步请求，由工作线程取消连接，旧完成事件不能清除新请求。回调完全结束前保留其缓冲区和 DLL 引用。
- Windows 候选窗的数字编号只控制显示，不控制点击；无编号的短语候选也会把自己的身份和修订号传给编辑器。原生鼠标回归夹具位于 `candidate_window_test.cpp`，需要在 Windows 运行；macOS 交叉编译不构成该点击行为的运行证据。
- macOS 菜单使用透明镂空 SI 模板，由系统决定黑白颜色；应用、安装包和官网保留黄色品牌图标。菜单资源名包含内容指纹，父输入源和子模式都声明模板属性。

## 隐私和隔离

AI 默认关闭。自动联想使用已下载并启动的 Qwen 模型，只接收当前输入位置最近连续上屏的文字（最多 128 字）、风格及相关词表。上下文仅在内存中保留，30 秒超时或光标/焦点变化后失效。服务只监听随机的 `127.0.0.1` 端口，使用每次启动随机生成的令牌；拒绝浏览器来源请求，限制输入及结果长度，不持久化候选或输入日志。关闭 AI 会移除发现文件并取消当前请求。补全过滤是启发式检查，不保证建议符合语义；用户按 Tab 前应确认结果。

macOS 注册标识为 `org.shadowinput.inputmethod.shadowinput`，模式为 `org.shadowinput.inputmethod.shadowinput.pinyin`。Windows 使用独立的服务和语言配置 GUID。数据与上游分开存放；与 Arion 同时安装的完整兼容性尚未验收。macOS 开发预览的学习加密密钥保存在独立的登录钥匙串条目中，不声称具备上游正式签名版的 Data Protection 设备绑定保证。

## 构建

先准备 Rime SDK、固定版本依赖和词库，再构建主程序；Qwen 权重不随包分发；4M 排序权重随主程序分发。macOS 需要 Xcode，原生学习层还使用 Swift/C++ 工具链。

```sh
node scripts/stage-keyboard-runtime.mjs
node scripts/shadowinput.mjs build macos
node scripts/test-shadowinput-ime.mjs
node scripts/test-shadowinput-candidates.mjs
node scripts/shadowinput.mjs check
```

Windows 的输入法构建需要 x64 MinGW-w64 GCC、CMake、Ninja、windres；不是 MSVC。Windows 本机运行 `node scripts/stage-keyboard-runtime-windows.mjs` 后再执行 `node scripts/shadowinput.mjs build windows`。

macOS 交叉构建 Windows 时，先完成 macOS Rime staging，以获得主机版本 `rime_deployer`。把 `SHADOWINPUT_DATA_DEPLOYER` 导出为 `.workspace/keyboard-runtime/source-build/<构建指纹>/build/bin/rime_deployer` 的实际路径，然后运行：

```sh
SHADOWINPUT_CROSS_WINDOWS=1 CXX=x86_64-w64-mingw32-g++ CC=x86_64-w64-mingw32-gcc node scripts/stage-keyboard-runtime-windows.mjs
node scripts/shadowinput.mjs build windows
```

`node scripts/test-shadowinput-candidates.mjs` 在主机运行候选状态测试，在 Windows 上还运行真实回环 HTTP 取消/成功响应测试。macOS 可加 `--cross-windows` 仅交叉编译这个 Windows 测试，不能将其记为运行通过。`node scripts/shadowinput.mjs check` 已包含主机候选状态测试、Go 回归测试和静态检查。

脚本只用主机 deployer 编译词库，不运行 Windows 二进制。构建脚本在隔离的暂存源码中替换产品注册标识，保留上游原生源文件及版权。包内包含 Rime/词库、Go 模块、Source Han Sans 和平台运行库的许可证。暂存资源清单和本机二进制不提交到源码仓库。

## 2026-11-01 验收记录

- macOS 原生引擎和 NSTextView 测试通过：未上屏拼音不请求模型、连续空格分词累积上下文、短语只追加一次、旧修订和光标移动后拒绝结果、失焦取消、拼音纠错和正常拼音候选。
- 本地候选服务通过鉴权、浏览器来源拒绝、取消、关闭后拒绝旧令牌请求以及不合法候选过滤测试。
- 一个真实 ChatGPT 账号在主程序中恢复了会话；合成短句请求返回过 HTTP 200 的完整候选，约 2.39 秒。这是服务请求证据，不是系统候选窗验收。
- macOS 系统列表现已显示 shadowinput；用户截图及独立 TIS 查询确认组件已启用且可选中（`ownCount: 2, available: true, selected: true`）。本轮本机主程序和输入组件均已更新，旧包保留用于回退，原有账户恢复成功。用户已在文本编辑中确认上一版出现 `AI · Tab` 行。本轮改为本地上屏后联想，新的系统端到端体验仍需另行验收。
- Windows x64 TSF、主程序已交叉编译，PE 依赖闭包经过检查。没有 Windows 真机的安装、切换、输入、候选窗口、升级和卸载验收结果。

- 本轮先复现再修复：配置错误在输入法页被隐藏、401/403 后账户仍可用、迟到错误覆盖新来源、Windows 跨版本安装被拒绝，以及编辑后旧候选请求没有取消。对应回归测试现已通过。
- 项目检查、macOS 原生输入夹具、候选状态测试及双端构建通过；Windows WinHTTP 夹具仅交叉编译，没有真机执行结果。Crapper、Dryer、Mutator 未接入或运行，不声称达到相关指标。

不自动注销、不修改 HIToolbox 偏好或替换其他输入法。图标更新后若新进程的 TIS 图标 URL 已指向新文件，而菜单仍显示旧图案，属于菜单界面缓存；不要据此反复改变图案或重新安装。官网以开发预览版提供下载，系统端到端输入验收完成前不标为稳定版。

Windows 仍需检查不同缩放、浏览器/Office/记事本、安全输入框、快速换焦点和停用/卸载。AI 行服从原生候选 UI 的显示限制；屏幕阅读器及编辑器自绘 TSF UI 的 AI 候选能力尚未验收。自动候选不消耗 ChatGPT 套餐；长期输入的延迟、内存和耗电仍需实机观察。

## 本地短语联想验证

- 原生测试先复现“未上屏的拼音仍会启动请求”，修改后验证连续分词上屏、只追加一次、光标及焦点撤销；共享状态测试覆盖 UTF-8 长度、30 秒失效和 180 毫秒等待。
- Go 测试先复现自动输入会访问 ChatGPT、两字上下文被拒绝、整句回显被接受，以及输入设置缺少独立本地入口，修改后通过。合成样例暴露出回复式结果和边界重复，增加保守过滤；这不构成语义质量保证。
- `node scripts/shadowinput.mjs check`（含 race、vet）、原生 AppKit 测试、候选状态/Windows HTTP 交叉编译、固定 pnpm 的仓库检查通过。中英文、明暗主题的本地就绪/未安装/加载界面已渲染检查。
- macOS 构建来自 `a8d20603`，Windows 来自 `19a7c24c`；两者均为干净源码构建，后者不包含仅修正 macOS block 返回类型的提交。macOS 主程序和输入组件已安装，签名校验通过，二进制与构建产物哈希一致，旧包保留。已安装模型自动预热成功。
- 已安装主程序的真实本地候选接口：三个合成短语返回完整结果，耗时分别为 0.158、0.109、0.109 秒；一个边界重复样例被过滤为 204。上述耗时不含输入法停顿等待和窗口渲染，不是统计性能基准。
- 用户选择稍后验证实际键盘输入与 Tab 追加；端到端打字仍记为待测。Windows 原生行为也未验证。随后按用户要求发布了 v0.1.0-preview.6 并更新官网，安装包与源码、校验值一起提供；发布不代表这些验收已通过。

对应验收约定见[本地输入短语规范](../../specs/012-native-phrases.md)。

## 候选标签交付核对

此前源码已去掉左侧标签，但本机仍运行 `a8d20603`，官网仍分发 preview.6，所以实际候选条仍显示 `AI · Tab`。preview.7 从干净源码 `e807fcfa` 重新构建并包含该修复及 Windows 无编号候选点击修复。

本机主程序和输入组件均已替换，旧包保留用于回退；新文件签名校验通过，输入法二进制哈希与包内一致。原进程退出后启动了新组件，独立系统查询确认已启用且选中，本地模型恢复就绪。用户用实际键盘确认左侧旧标签已经消失。该确认只证明标签交付，不替代完整编辑器兼容性验收。

主机候选状态、AppKit 组合/追加/取消、Go race/vet 及安装包结构检查通过。Windows 原生候选窗口、点击和请求取消已有 [CI 运行证据](https://github.com/simpledavid/shadowinput-app/actions/runs/41320416331)，完整已安装 TSF 与本地模型推理仍待 Windows 实机验证。Crapper、Dryer、Mutator 未接入，本轮未运行。
