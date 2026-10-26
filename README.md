# dsh-purge Pro

基于 [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) 早期源码的独立维护分支。感谢原作者小杨的基础工作。本分支面向 DSH `0.2.1-rc.2`，继续维护清洗补丁、红队演练台、Windows Desktop 安装和 Kali SSH 环境适配，并按需移植原版后续改进。

| 项目 | 当前状态 |
| --- | --- |
| 插件版本 | `1.1.72-dsh021rc2.10` |
| 适配宿主 | DSH `0.2.1-rc.2` |
| 主要验证环境 | Windows Desktop profile；Kali SSH 环境适配已验证 |
| 许可 | MIT；保留原作者署名及许可证 |

本仓库与原作者当前公开版是两条独立维护路线。原作者公开版调整了红队使用范围及随包内容；本分支保留早期红队能力，并增加适配、证据与报告功能。请仅在获得授权的环境中使用。

## 功能与特点

- **清洗与宿主兼容**：修复 DSH `0.2.1-rc.2` 的提示词变量、补丁锚点、桌面重启及备份问题；面板可查看补丁状态并执行应用、还原。
- **红队演练台**：包含资产、端口、指纹、漏洞、当前测试、发现时间、得分目标、报告等视图；提供 64 个 `redteam_*` 工具声明及 23 份红队 Skill 文档。POC/EXP 知识库可检索和回填。
- **证据链与报告**：记录原始 HTTP 请求、攻击步骤、工具结果、截图和得分；报告可按目标导出，截图随报告一起复制并使用相对路径引用。
- **Windows + Kali SSH**：Windows Desktop 可登记远端 Kali 主机，环境适配页检查工具与配置。Linux 工具仍需安装在 Kali，远端命令经 SSH 执行；仅连接 Kali 不代表扫描流程已验证。
- **安装自修复**：安装脚本可补齐 Desktop profile 的插件 bundle 注册和 `cordis.patch.yml` 插入项，减少“包已安装但界面没有入口”的情况。

红队演练台是记录和协调工具，不会因为安装插件就自动具备全部外部工具、FOFA 凭据或 VPS。使用前应先完成“演练台 → 环境适配”的检查，再在有授权的靶场中建立目标和会话。

## DSH 0.2.1-rc.2 适配

这版宿主的 agent-loop 不再注册 `cwd` 提示词变量。旧版插件仍写入 `{{cwd}}`，会在模型请求前报 `unknown prompt variable "[cwd]"`，即使补丁面板显示正常。本分支在 `lib/identity.js` 中探测变量能力并降级为静态文案，同时修复了下列问题：

| 问题 | 修复 |
| --- | --- |
| `#114 / #126 / #136`：`{{cwd}}` 导致每轮对话失败 | 按宿主已注册变量选择动态或静态工作目录文案，并清理残留占位符 |
| `#132`：补丁 `#40` 在新版宿主跳过 | 增加匹配新版 `system-prompt` 结构的锚点，保留 `requiredContexts` 语义 |
| `#119`：桌面应用后加载失败 | 等待异步文件复制完成后再重启 |
| `#127 / #106`：备份文件缺失、还原失败 | 补齐宿主文件系统接口中的同步操作 |
| 红队预设注册失败 | 修正预设的工具过滤配置 |
| Windows Desktop 插件入口缺失 | 安装后检查并补齐 profile bundle 与 body 插入项 |

修复细节与历史记录见 [CHANGELOG.md](CHANGELOG.md)。宿主升级后，应先核对新版宿主版本和补丁锚点，再测试、修复并重新打包；不要直接把适配 `0.2.1-rc.2` 的包当作新版兼容包。

## 安装与更新

从本仓库源码打包安装当前版本。源码目录与 DSH profile 内的已安装副本互相独立，修改源码不会自动更新已安装插件。

```powershell
# 在本仓库目录执行；将安装包保存在 DSH 的插件归档目录
npm pack
$archive = Join-Path $env:USERPROFILE '.dsh\plugins\archives'
New-Item -ItemType Directory -Force $archive | Out-Null
Copy-Item .\dsh-purge-1.1.72-dsh021rc2.10.tgz $archive -Force
$packagePath = (Join-Path $archive 'dsh-purge-1.1.72-dsh021rc2.10.tgz').Replace('\', '/')

# 切换到 DSH Desktop profile 后安装
Set-Location (Join-Path $env:USERPROFILE '.dsh\profiles\desktop')
pnpm add "file:$packagePath"
```

如包管理器禁用了依赖的安装脚本，应在 profile 中允许 `dsh-purge` 的 `postinstall`，或从 profile 目录手动执行：

```powershell
node .\node_modules\dsh-purge\scripts\ensure-profile-bundle.mjs
```

然后完全退出并重开 DSH，在界面找到 **dsh-purge** 入口，检查“清洗”状态。只有存在待应用补丁时才执行“应用”，完成后按提示重启。旧版 `evilevil/dsh-purge-021rc2` 的 `.4` 包和安装链接不对应本分支当前版本。

## 红队演练台使用顺序

1. 在“环境适配”页检查本机或 Kali SSH 主机、工具路径和可选凭据。缺失的工具应安装到实际执行命令的环境中。
2. 新会话选择已注册的“红队模式”预设，先运行 `redteam_preflight`，再通过 `redteam_engagement_open` 建立并绑定授权目标。
3. 将资产、漏洞、原始请求、步骤、结果、截图和得分及时落库；报告依赖这些记录，不能从聊天文本自动补齐证据。
4. 回演练台刷新，检查资产、待测状态、证据和得分。漏洞需要准确的验证状态与证据；报告只呈现满足当前规则的成果。
5. 需要交付时导出报告：

```powershell
node .\node_modules\dsh-purge\scripts\export-engagement-report.mjs --engagement "your-engagement-id" --out ".\report-output"
```

导出命令从 DSH Desktop profile 目录执行；将 `your-engagement-id` 换成演练台中的目标标识。报告所引用的截图会复制到输出目录。

## 验证范围

仓库包含提示词、补丁、安装回归、红队环境、远端连接及上游功能回归测试：

```powershell
$tests = Get-ChildItem .\test -Filter '*.test.mjs' | Select-Object -ExpandProperty FullName
node --test $tests
```

需要验证宿主补丁锚点时，将 `PURGE_HOST` 指向当前安装的宿主源码路径，并使用 `test/sandbox-apply.mjs` 在隔离副本中试应用。此前在 Windows Desktop / DSH `0.2.1-rc.2` 上，六组测试通过，隔离副本应用了 71/72 个补丁行，1 项跳过；补丁数和状态会随宿主版本变化。

Kali SSH 连接和环境检查已验证，但外部工具、FOFA/VPS 配置及完整红队任务仍取决于使用者的环境；上述测试结果不等于一次完整演练已通过。

## 与原作者版本的关系

- 代码基座为原作者的 `1.1.72` 早期源码；当前公开原版仍由原作者继续维护。
- 本分支除兼容修复外，还保留并扩展了红队演练、证据记录、报告及 Windows/Kali 适配，功能和使用范围可能与当前原版不同。
- 历史原版说明保留在 [upstream-README.md](upstream-README.md)、[upstream-README.zh-CN.md](upstream-README.zh-CN.md) 和 [upstream-README.en.md](upstream-README.en.md)。
- 借用原作者的名称、思路、代码和提示词时，请保留原作者署名与来源链接；二次分发也应保留相应许可文件。

## 维护

发布新包前，应更新版本号和 [CHANGELOG.md](CHANGELOG.md)，运行仓库测试，在目标宿主版本上检查补丁锚点与插件入口，再打包验证。仓库的 `origin` 可能指向历史社区 fork；推送前先核对远端地址，不要照搬旧版 README 的推送命令。

## License

MIT。原始版权 `Copyright (c) 2026 小杨`；本分支保留原有版权与许可证声明。
