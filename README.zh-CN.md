# shadowinput

键盘优先，在原处把话写好，读懂另一种语言。

[官网与下载](https://shadowinput.com/#download) · [GitHub](https://github.com/simpledavid/shadowinput-app) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

shadowinput 包含三个部分：

| 产品 | 用途 | 当前边界 |
| --- | --- | --- |
| 系统输入法 | macOS / Windows 拼音输入，本地模型提供短语候选，Tab 接受 | 开发预览；完整 Windows 安装和编辑器兼容性待验收 |
| 浏览器插件 | ChatGPT 登录、网页双语、划词、悬停和输入框翻译预览 | 登录及模型发现已验证；完整翻译受账号授权和额度限制，仍待验收 |
| 中文官网 | 产品介绍、macOS DMG、Windows EXE、Chrome ZIP 下载 | 原发布包与对应源码已迁入本仓库，文件内容不变 |

输入法的自动短语使用本地模型。浏览器翻译使用用户主动授权的 ChatGPT；登录成功不代表有可用额度。长文润色、翻译、改写和个人风格也保留在桌面工具中。

## 开发

使用 Node、Go 和平台工具链，版本与准备步骤见下方构建文档。工作区使用固定的 pnpm 10.33.0。

```sh
pnpm install --frozen-lockfile
node scripts/shadowinput.mjs check
node scripts/shadowinput.mjs dev
node scripts/shadowinput.mjs build macos
node scripts/shadowinput.mjs build windows
pnpm extension:check
```

- `apps/desktop`：Go + MyGo 桌面工具与原生 IMK / TSF 输入法。
- `apps/extension`：独立 Chrome 翻译插件。
- `apps/shadowinput-site`：中文官网。

这是 shadowinput 的新主仓库，从独立的初始提交开始维护。复用了 Arion 的原生基础，因此仍遵守 AGPL-3.0，并保留上游与第三方声明；没有将复用代码声明为原创。源码中的兼容性标识与历史技术文档按需保留。

## 项目资料

- [输入法与构建说明](docs/project/shadowinput.md)
- [系统输入法使用与验收](docs/project/shadowinput-ime.md)
- [浏览器插件使用与验收](docs/project/shadowinput-extension.md)
- [仓库迁移记录](docs/project/shadowinput-repository.md)
- [编码规范](docs/quality/ub-mode.md)
- [开发指南](AGENTS.md) · [文档索引](docs/README.md)
- [开源协议](LICENSE) · [来源与致谢](NOTICE.md)
