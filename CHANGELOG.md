# dsh-purge — DSH 0.2.1-rc.2 适配版

## 1.1.72-dsh021rc2.10

- 修复 `hostFs` 缺少 `readSync` 导致文本 `dsh.cmd` 被误判成二进制、shim 注入与状态检测跳过；文件描述符操作不再按路径做 asar 探测。
- `/purge`、`/rules`、`/skills`、`/rewind` 逐条注册；撞名时尝试备用命令，不再阻断后续工具初始化。
- 主插件本体改由 profile 的 `postinstall` 和演练台启动自愈补入；包内 overlay 只更新已有本体配置，避免重复入队。保留原有红队 Skill、知识库与 Windows/Kali SSH 适配。
- 新增安装、命令冲突和 shim 回归测试；在本机 DSH `0.2.1-rc.2` 宿主样本上跑补丁锚点测试与隔离应用烟测。

---

## 1.1.72-dsh021rc2.4

红队环境适配的安全与可信度收敛（专家团评审项）：

- **API 鉴权**：`/redteam/api` 不再对回环连接一律放行。浏览器请求必须 `Host` 是本机且 `Origin` 与 `Host` 同源；`app://` 仅在本机 Host 下放行；无 Origin 的本机进程保留。伪造 Origin 与 DNS rebinding 都会被 403。
- **密钥边界**：`platformSummary()` 对 `FOFA_KEY`/`REDTEAM_VPS_*` 只返回空串 + `envPresent`；preflight 不再带明文。配置文件改为原子写（tmp + rename）并强制 `0600`，目录 `0700`。
- **空值语义**：保存时空串不再清空已存密钥（与 UI「留空＝不覆盖」一致），清除需显式 `clearEnv`。
- **工具解析**：`config.tools` 只接受绝对路径，必须是普通文件且有执行位；`httpx` 的 Python CLI 拒绝逻辑同样作用于 config。目录、非可执行文件、`~/...` 未展开路径都不再被当成"已找到"。
- **门禁语义**：只有「保存过路径且至少解析到一个可执行文件」才算 configured；仅保存了错路径/已卸载工具会报 `need-config`；有效配置优先于 skip；skip 且路径失效时会明确提示。
- 新增 `test/redteam-env.test.mjs`（10 项：目录/非可执行/Python httpx、0600、空值保留、密钥掩码、stale 路径、skip 优先级）。

---



## 1.1.72-dsh021rc2.3

安全评审（应用安全工程师 / 软件架构师）提出的阻断项：

- **叶子委派封口**：`tool-subagent-fork` 补 `maxDepth: 1`（0.2.1 默认 10，depth=1 角色本可再 fork 出孙代理）；`tool-workflow` / `tool-ralph` 在红队预设里 `disabled: true` —— 宿主的 workflow/ralph 组 spawn 请求不带 maxDepth（`dsh-workflow-ptc` startChild），删掉旧 `toolFilter` 后这是唯一能递归的路径。五角色流程走 `tool-subagent`，不依赖这两个工具。
- **预设覆盖护栏**：`toolFilter` 嗅探改为行首正则；覆盖前写 `.bak-<ts>`（0600）；目标是符号链接时拒绝写穿；写临时文件 + `renameSync` 原子替换；失败只记日志不落半截 YAML。
- **状态可取证**：`#32` 的 prefix 替换带上 `[dsh-purge]` 标记，不再借 `web-app-lib` 的旧 marker；`#53` 改用删除型证据 `absentMarkers`（那句不在 = 目标达成），不再与 #32 共用 marker；多文件补丁新增 `partial` 状态，一个文件不到位就不再报 applied。
- **na 口径修正**：`na` 按"已定位文件数"判定，不再拿 key 数当分母；`naWithout` 加单测，必须是 `[dsh-purge]` 私有标记且真的由某个补丁产出。
- **测试 hermetic**：`#32/#53/#77` 改为从 `.dshpurge.bak` 取"改前"样本，在已打补丁的宿主上也能全绿；`HOST` 支持 `PURGE_HOST` 覆盖。

---



## 1.1.72-dsh021rc2.2

- **红队模式恢复**：0.2.1 已彻底移除 `tool-subagent.toolFilter`，任何还带这段的预设都会被 `agent-preset-registry` 判 `broken`，模式下拉直接消失。插件现在会在启动时检测旧预设里的 `toolFilter:` 并强制重新渲染（`lib/redteam/index.js`），同时已把本机 `~/.dsh/.agent-presets/redteam` 刷新为无 `toolFilter` 版本。
- **#32 / #53 重定向**：0.2.1 把 Web surface 提示词从 `dsh-web-app/lib/index.js` 搬到 `dsh-harness-dev-context/lib/index.js`（`WEB_SURFACE_PROMPT` / `prefix` / `description` 三处）。新增 `harness-dev-context` 目标文件并补 0.2.1 锚点，两条从 skipped 变为 applied。
- **#77 适配**：0.2.1 的 `append()` 用 `if (this.revised.size > 0) this.revised.clear();`（带守卫）。补第二组 pattern，回退丢弃已发送消息重新生效。
- **#80 收敛为 na**：0.2.1 的 minimal 预设里没有本插件注入过的 fs/web 行，没有可回滚内容；新增 `naWithout` 机制，目标标记不存在时如实报 `na` 而不是 skipped。
- **#71 收敛为 na**：未安装梁神插件时目标文件不存在，`optional: true` 让它显示 na 而不是 missing_file。
- 新增回归用例：#32/#53 命中 0.2.1 锚点、#77 命中守卫版 `append()` 且产物可解析、#80 报 na、生效预设不含 `toolFilter`。

---



基座：`YuJunZhiXue/dsh-purge` **master @ 1.1.72**（上游最后一个未发布版本，tag 停在 v1.1.71）。
目标宿主：`@deepseek-ai/dsh` / `dsh-base` **0.2.1-rc.2**（macOS，web profile，npx 安装）。
产出：`dist/dsh-purge-1.1.72-dsh021rc2.1.tgz`（2.0 MB，114 files）。

## 一、修了什么（逐条对应 issue）

| # | 问题 | 根因 | 改动 |
|---|------|------|------|
| **#114 / #126 / #136** | 每轮对话必炸 `unknown prompt variable "{{cwd}}"` | 0.2.1 的 agent-loop 只注册 `provider`/`model` 两个 prompt 变量；`identity.js` 无条件把 `deployment:persona-suffix` 换成 `Your working directory is {{cwd}}.` | `lib/identity.js` 增加能力探测 `cwdVariableSupported()`：`assembled.variables` 里没有 `cwd` 就改用静态文案 `Your working directory is the current workspace.`；组装末尾再把任何残留 `{{cwd}}` 落成字面量。支持 `DSH_PURGE_CWD=variable|static` 强制。 |
| 同上（第二处） | — | 插件自己的 `cordis.patch.yml` 里也写着 `personaSuffix: ... {{cwd}}.` | 改成 `personaSuffix: ""`，后缀统一由 identity 层在组装期决定（与社区 1.6.28 一致）。 |
| **#132** | 点「应用」后 `清洗没有写进全部宿主，已取消重启`；补丁 #40 状态 `skipped` | 0.2.1 的 `system-prompt` 在 assemble 后新增了 `requiredContexts` 过滤，patch #40 的 7 条 pattern 全部不命中 | `lib/core.js` patch #40 新增 0.2.1 形状 pattern + 对应 replacement，保留 `requiredContexts` 语义，并写入 `fold-complete inject first` 标记。 |
| **#119** | 官方桌面端点「应用」后 `dsh: fatal load failure` | `desktop.js` 的 `repairOfficialCliAfterUnpack()` 是同步函数，却调用 async `atomicCopyFile()` 且没 `await`；Node 24 把 unhandled rejection 升级成 uncaughtException | 函数改 `async`，补 `await`；`core.js` 两个调用点、`index.js` 的 apply 路径同步改 `await`。 |
| **#127 / #106** | 应用后一份 `.bak` 都没有，还原/卸载失效 | `extract-asar.js` 的 `HOST_SYNC` 白名单漏了 `closeSync`，`hostFs.closeSync` 为 `undefined`，`backupAll()` 的占位句柄永不释放 → Windows EPERM 静默失败 | 白名单补 `closeSync / fsyncSync / truncateSync / writeSync / futimesSync / utimesSync`。 |
| **#121**（上游已修，本版确认） | Ctrl+Enter 插话静默失效 | 1.1.71 的 patch #86 把 `case "steer"` 改成 `agent.followup`，与 `steer()` 的 next-step 语义打架 | 1.1.72 已把它重写为 `agent.steer`；本版在真实宿主上验证落盘（`dsh-api-session-controller/lib/index.js:1049`）。 |
| 社区 plus 的修法（luowang） | 红队预设注册失败 | `presets/redteam/agent.cordis.yml` 的 `toolFilter.deny` 列了 `subagent_fork / workflow / ralph`；0.2.1 的 `tools.restrict()` 会校验"必须是已注册全局工具"，`workflow`/`ralph` 在本 profile 无注册 → 抛 `unknown global tool` | 移除 `toolFilter` 块，隔离改由 `maxDepth: 1` 保证（与 plus 1.6.1 同处理）。 |
| 元数据 | — | `dshTarget` 还写 0.2.0-rc.2 | 改为 `0.2.1-rc.2`，版本号 `1.1.72-dsh021rc2.1`。 |

未处理（有意）：#133（Windows 桌面换包助手杀自己）— 纯 Windows/Electron 路径，本机 macOS 不复现，未改；上游 #30（system section 过滤吃掉项目约定）属行为争议，不在适配范围。

## 二、验证

1. **单元测试**（`test/identity.test.mjs`，5 项全过）
   用真实宿主规则回放插值：`{{name}}` 未注册即抛错。断言在 `variables={provider,model}` 下输出不含 `{{cwd}}`，在 `variables` 带 `cwd` 时保留变量，注入文本里的 `{{cwd}}` 也被中和。
2. **补丁测试**（`test/patches.test.mjs`，5 项全过）
   拿官方快照 `dsh-system-prompt/lib/index.js.dshpurge.bak` 当"改前"样本，patch #40 命中、产物 `node --check` 通过、二次应用幂等；#86 把 `agent.followup` 改回 `agent.steer`；#119/#127/预设静态断言通过。
3. **沙箱全量 dry-run**（`test/sandbox-apply.mjs`）
   把 52 个宿主目标文件复制到 `/tmp`，跑完整 apply：70 个补丁 settled、#40 = applied、改动文件全部 `node --check` 通过。
4. **真实宿主 apply**（已执行）
   - 应用前：59/86，11 pending（#40 为 skipped）
   - 应用后：**70/86，0 pending**，#40 / #85 / #86 / #87–#92 全部 applied
   - `hostCleanMarkersPresent(...) === true`、`hostPromptKeepsInject(...) === true`（不会再因"清洗没写进宿主"取消重启）
   - 宿主侧落盘核对：`dsh-system-prompt/lib/index.js` 保留 `requiredContexts` 且写入 `fold-complete inject first`；`dsh-api-session-controller/lib/index.js:1049` 为 `agent.steer(message)`；三个关键文件 `node --check` 全过
5. **备份**
   - 应用前宿主 52 个目标文件快照：`snapshots/host-before-apply-20261019-183407.tgz`
   - 宿主逐文件官方快照：51 个 `*.dshpurge.bak`（插件机制）
   - 旧插件目录：`~/.dsh/profiles/web/node_modules/dsh-purge.1.1.66.bak`

## 三、安装 / 回滚

```sh
# 安装（已在 web profile 执行过）
cd ~/Documents/dsh-purge-1.1.72-rc2
./install.sh

# 回滚插件
rm -rf ~/.dsh/profiles/web/node_modules/dsh-purge
mv ~/.dsh/profiles/web/node_modules/dsh-purge.1.1.66.bak ~/.dsh/profiles/web/node_modules/dsh-purge

# 回滚宿主补丁（三选一）
# 1) 用插件自己的还原：重启后点 Purge → 还原
# 2) 解包快照（绝对路径 tar）：
tar xzf snapshots/host-before-apply-20261019-183407.tgz -C /
# 3) 逐个 .dshpurge.bak 覆盖回去
```

## 四、必须重启

补丁改的是宿主已加载的 JS 文件，当前进程仍跑旧代码；**完全退出并重开 DSH** 后生效。
重开后确认：Purge 面板应为 `86` 个补丁位、`0 pending`、版本 `1.1.72-dsh021rc2.1`。
