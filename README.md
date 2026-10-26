## 关于 dsh-purge Pro
dsh-purge Pro 基于原作者 YuJunZhiXue/dsh-purge 的早期源码 fork，由社区独立维护。原作者后续公开版收紧了红队任务的使用范围，不再随包提供红队 Skill 和知识库。本分支保留了早期功能，并继续完善 DSH 0.2.1-rc.2 兼容性、Windows 桌面安装、Kali SSH 环境适配及证据与报告流程。
这是独立维护的 Pro 分支，感谢原作者的基础工作。原版仍在更新；后续修复会核对后按需移植。
>
> 本仓库以 **1.1.72（master）** 为基座，把 0.2.1-rc.2 上必崩的几处修掉，做成可直接安装的版本。**上游恢复维护后，请优先回到上游。**

- 版本：`1.1.72-dsh021rc2.4`
- 适配：`@deepseek-ai/dsh` / `dsh-base` **0.2.1-rc.2**（web profile，macOS 实测）
- 基线：0.2.0-rc.2 仍可用（本版改动对 0.2.0 是向后兼容的）
- 许可：MIT（原作者 小杨 / YuJunZhiXue，署名见文末）

## 为什么需要这一版

0.2.1 改了提示词变量的注册范围：agent-loop 只注册 `provider` / `model`，**不再注册 `cwd`**。而 1.1.72 的 `lib/identity.js` 会无条件把 `deployment:persona-suffix` 换成 `Your working directory is {{cwd}}.`。结果是**每一轮对话在发出模型请求之前**就抛：

```
unknown prompt variable "[cwd]" in section "deployment:persona-suffix";
registered variables: provider, model
```

补丁面板这时是全绿的，因为崩点在提示词组装，不在补丁。

## 修了什么

对应上游 issue：[#114](https://github.com/YuJunZhiXue/dsh-purge/issues/114)、[#126](https://github.com/YuJunZhiXue/dsh-purge/issues/126)、[#136](https://github.com/YuJunZhiXue/dsh-purge/issues/136)、[#132](https://github.com/YuJunZhiXue/dsh-purge/issues/132)、[#119](https://github.com/YuJunZhiXue/dsh-purge/issues/119)、[#127](https://github.com/YuJunZhiXue/dsh-purge/issues/127)、[#121](https://github.com/YuJunZhiXue/dsh-purge/issues/121)。

| 问题 | 根因 | 修法 |
|---|---|---|
| **#114 / #126 / #136** 每轮 `unknown prompt variable "{{cwd}}"` | 0.2.1 不再注册 `cwd` 变量，`identity.js` 却硬写 `{{cwd}}` | `lib/identity.js` 增加能力探测：`assembled.variables` 没有 `cwd` 就降级为静态文案 `Your working directory is the current workspace.`；组装末尾再兜底把任何残留 `{{cwd}}` 落成字面量。可用 `DSH_PURGE_CWD=variable\|static` 强制 |
| 同一 bug 的第二入口 | 插件自己的 `cordis.patch.yml` 里也写着 `personaSuffix: ... {{cwd}}.` | 改成 `personaSuffix: ""`，后缀统一由 identity 层决定 |
| **#132** 应用后「清洗没有写进全部宿主，已取消重启」、`#40` 落成 skipped | 0.2.1 的 `system-prompt` 在 assemble 后新增 `requiredContexts` 过滤，旧 pattern 全不命中 | patch `#40` 增加 0.2.1 形状的 pattern + replacement，保留 `requiredContexts` 语义 |
| **#119** 桌面端点「应用」后 `dsh: fatal load failure` | `desktop.js` 同步函数调 async `atomicCopyFile()` 没 `await`，Node 24 升级成 uncaughtException | 函数改 async、补 `await`，`core.js` / `index.js` 调用点同步 |
| **#127 / #106** 应用后一份 `.bak` 都没有，还原/卸载失效 | `HOST_SYNC` 白名单漏 `closeSync` → `hostFs.closeSync` 未定义 → 占位句柄泄漏 → EPERM 静默失败 | 白名单补 `closeSync / fsyncSync / truncateSync / writeSync / futimesSync / utimesSync` |
| **#121** Ctrl+Enter 插话静默失效 | 1.1.71 的 `#86` 把 `case "steer"` 改成 `followup`，与 `steer()` 的 next-step 冲突 | 1.1.72 已修正为 `agent.steer`；本版在真机确认落盘 |
| 红队预设注册失败（社区 fork 的修法） | `presets/redteam/agent.cordis.yml` 的 `toolFilter.deny` 列了未注册的 `workflow / ralph`，`tools.restrict()` 直接抛 `unknown global tool` | 移除 `toolFilter`，子代理隔离改由 `maxDepth: 1` 保证 |

**未处理**：上游 #133（Windows 桌面换包助手杀自己）属 Electron/Windows 路径，macOS 不复现，未改动；上游 #30（system section 过滤影响项目约定）属行为争议，不在适配范围。

## 安装

### 方式一：一键脚本（macOS，web profile）

```sh
curl -fsSL https://raw.githubusercontent.com/evilevil/dsh-purge-021rc2/main/scripts/install.sh | sh
```

脚本会：备份现有插件目录 → 解包本仓库发行版 → 写入 `installed-rev` / `applied.json` 戳（避免启动时误判版本落后而反复重打）。

### 方式二：手动

```sh
V=1.1.72-dsh021rc2.4
curl -fsSLO https://github.com/evilevil/dsh-purge-021rc2/releases/download/v$V/dsh-purge-$V.tgz
curl -fsSLO https://github.com/evilevil/dsh-purge-021rc2/releases/download/v$V/SHA256SUMS.txt
shasum -a 256 -c SHA256SUMS.txt
rm -rf "$DSH_HOME/profiles/web/node_modules/dsh-purge"
mkdir -p "$DSH_HOME/profiles/web/node_modules/dsh-purge"
tar xzf dsh-purge-$V.tgz -C "$DSH_HOME/profiles/web/node_modules/dsh-purge" --strip-components=1
```

### 方式三：写进 profile 依赖

```json
"dsh-purge": "https://github.com/evilevil/dsh-purge-021rc2/releases/download/v1.1.72-dsh021rc2.4/dsh-purge-1.1.72-dsh021rc2.4.tgz"
```

## 装完怎么用

1. 完全退出并重开 DSH（补丁改的是已加载的 JS，不重启不生效）；
2. 左侧栏 **Purge** → 状态页 → **应用**；
3. 成功会自动重启；重启后新开一轮对话，注入才进当前会话；
4. 面板应显示 **69 个补丁行 / 0 pending**，`#40 / #85 / #86 / #87–#92` 全绿。

想确认真的注入了：随便问一句「你是谁」，回答应该来自 `~/.dsh/prompt-inject.md` 的人格，而不是官方自我介绍。

## 验证

仓库自带三组离线测试，不依赖网络：

```sh
node test/identity.test.mjs   # 5 项：{{cwd}} 能力探测与降级
node test/patches.test.mjs    # 5 项：#40 命中 0.2.1 形状、#86 steer、#119/#127 静态断言
node test/sandbox-apply.mjs   # 把宿主目标文件复制到 /tmp 跑全量 apply
```

真机结果（macOS / dsh 0.2.1-rc.2 / web profile）：

```
应用前：59/86 applied，11 pending，#40 skipped
应用后：70/86 applied，0 pending，#40 / #85 / #86 / #87–#92 applied
hostCleanMarkersPresent === true
hostPromptKeepsInject === true
```

## 与上游的关系

- 代码基座：`YuJunZhiXue/dsh-purge` master `1.1.72`（MIT）
- 原作者：**小杨 / [YuJunZhiXue](https://github.com/YuJunZhiXue/dsh-purge)**
- 本仓库：社区适配分支，只做 0.2.1-rc.2 兼容修复，不改变产品行为与提示词内容
- 上游原始 README 保留在 [`upstream-README.md`](upstream-README.md)、[`upstream-README.zh-CN.md`](upstream-README.zh-CN.md)、[`upstream-README.en.md`](upstream-README.en.md)
- 依照上游《署名要求》：**借用名称、思路、代码或提示词必须署名并写明来源仓库** —— 本仓库保留 MIT 许可证、原作者版权声明，并在 README 与本说明中明确标注来源。二次分发请同样保留。

## 已知限制

- 只验证了 **web profile + 官方桌面 0.2.1-rc.2 的代码形状**；0.2.0-rc.2 逻辑上兼容但未逐项回归。
- 上游停止维护意味着 dsh 再改宿主结构时，补丁锚点需要重新对齐；欢迎 issue / PR。
- `shim 目录: 未定位` 在 npx 安装下是正常现象（没有全局 `dsh` 启动器），不影响功能。
- 本仓库不提供官方背书，使用风险自负；破甲类插件请只在自有环境做安全研究。

## 维护与发布

上游停更后，这个仓库自己发版，流程很短：

1. 改代码，同步改 `package.json` 的 `version`（例如 `1.1.72-dsh021rc2.4`）与 `CHANGELOG.md`；
2. 跑一遍离线测试：
   ```sh
   node test/identity.test.mjs && node test/patches.test.mjs
   ```
3. 打 tag 推上去，CI 会自动 `npm pack` + 生成 `SHA256SUMS.txt` 并发 Release：
   ```sh
   git tag v1.1.72-dsh021rc2.4 && git push origin v1.1.72-dsh021rc2.4
   ```
4. 本地升级：`PURGE_VERSION=<新版本> sh scripts/install.sh`

宿主再升级导致补丁锚点漂移时，优先跑 `test/sandbox-apply.mjs` 看是哪几条 pattern 不命中，再对着真实的 `@deepseek-ai/*` 源码补 pattern。

## License

MIT。原始版权 `Copyright (c) 2026 小杨`，本仓库修改部分 `Copyright (c) 2026 evilevil`。
