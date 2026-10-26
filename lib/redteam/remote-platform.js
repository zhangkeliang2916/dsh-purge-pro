/** Read-only tool inventory from a Kali host already configured in dsh-ssh. */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const cache = new Map()
const CACHE_MS = 5000

function safeWord(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
}

function hostEntry(alias, home) {
  if (!safeWord(alias)) throw new Error('SSH 主机别名格式不正确')
  const file = join(home || process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-ssh.json')
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  if (parsed.version !== 1 || !Array.isArray(parsed.hosts)) throw new Error('dsh-ssh 主机配置格式不正确')
  const entry = parsed.hosts.find((item) => item.alias === alias)
  if (!entry) throw new Error('dsh-ssh 中找不到主机 ' + alias)
  if (entry.auth?.kind !== 'key' || !entry.auth.keyPath || !existsSync(entry.auth.keyPath)) {
    throw new Error('远端体检需要该主机使用可读取的 SSH 私钥')
  }
  if (!safeWord(entry.user) || !safeWord(entry.host) || !Number.isInteger(entry.port) || entry.port < 1 || entry.port > 65535) {
    throw new Error('SSH 主机地址、用户名或端口无效')
  }
  if ((entry.proxyJump || []).length || entry.proxyCommand) throw new Error('远端体检暂不支持跳板机')
  return entry
}

function shellQuote(value) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error('Unsupported tool name')
  return "'" + value + "'"
}

export function remoteProbeScript(catalog) {
  const lines = [
    'PATH="$HOME/.local/bin:$HOME/go/bin:$PATH"',
    'source /etc/os-release 2>/dev/null || true',
    "printf 'META\\tos\\t%s\\n' \"${ID:-unknown}\"",
    "printf 'META\\thome\\t%s\\n' \"$HOME\"",
    "for item in toolkit redteam/.setup-complete redteam/setup.sh .env; do if [ -e \"$HOME/.dsh/$item\" ]; then printf 'META\\texists:%s\\t1\\n' \"$item\"; fi; done",
    "python3 - <<'PY'",
    'import os, re',
    'from pathlib import Path',
    'values = {}',
    "env_file = Path.home() / '.dsh' / '.env'",
    'if env_file.is_file():',
    '  for line in env_file.read_text(errors="replace").splitlines():',
    "    match = re.match(r'^\\s*(?:export\\s+)?(FOFA_KEY|REDTEAM_VPS_HOST|REDTEAM_VPS_KEY)\\s*=\\s*(.*)$', line)",
    '    if match:',
    '      value = match.group(2).strip().strip(chr(34)).strip(chr(39))',
    '      if value: values[match.group(1)] = value',
    "for key in ('FOFA_KEY', 'REDTEAM_VPS_HOST'):",
    '  if os.environ.get(key) or values.get(key): print("META\\tenv:" + key + "\\t1")',
    "key_path = os.environ.get('REDTEAM_VPS_KEY') or values.get('REDTEAM_VPS_KEY') or str(Path.home() / '.dsh/redteam/toolkit/vps/id_rsa')",
    'if Path(key_path).expanduser().is_file(): print("META\\texists:vps-key\\t1")',
    'PY',
  ]
  for (const def of catalog) {
    const names = def.id === 'httpx' ? ['httpx-toolkit', 'pd-httpx'] : def.names
    lines.push("found=''")
    if (def.id === 'httpx') {
      /* 与 recon-pipeline 的绝对路径保持一致；不要命中 Python /usr/bin/httpx。 */
      lines.push('if [ -x "$HOME/.dsh/redteam/toolkit/httpx/httpx" ]; then found="$HOME/.dsh/redteam/toolkit/httpx/httpx"; fi')
    }
    lines.push('if [ -z "$found" ]; then')
    lines.push('for candidate in ' + names.map(shellQuote).join(' ') + '; do')
    lines.push('  found=$(command -v "$candidate" 2>/dev/null || true)')
    lines.push('  if [ -n "$found" ]; then break; fi')
    lines.push('  if [ -x "$HOME/.dsh/redteam/toolkit/' + def.id + '/$candidate" ]; then found="$HOME/.dsh/redteam/toolkit/' + def.id + '/$candidate"; break; fi')
    lines.push('done')
    lines.push('fi')
    lines.push("printf 'TOOL\\t%s\\t%s\\n' " + shellQuote(def.id) + ' "$found"')
  }
  return lines.join('\n') + '\n'
}

/** `runner` is injected by tests; production calls Windows OpenSSH without a shell. */
export function probeRemotePlatform(alias, catalog, options = {}) {
  if (!alias) return null
  let stamp = ''
  try {
    const entry = hostEntry(alias, options.home)
    stamp = [entry.host, entry.port, entry.user, entry.auth.keyPath].join('|')
    const cached = cache.get(alias)
    if (!options.runner && cached && cached.stamp === stamp && Date.now() - cached.at < CACHE_MS) return cached.value
    const args = [
      '-i', entry.auth.keyPath, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=4',
      '-p', String(entry.port), `${entry.user}@${entry.host}`, 'bash -s',
    ]
    const runner = options.runner || spawnSync
    const result = runner(process.platform === 'win32' ? 'ssh.exe' : 'ssh', args, {
      input: remoteProbeScript(catalog), encoding: 'utf8', timeout: 8000,
      windowsHide: true, maxBuffer: 256 * 1024,
    })
    if (result.error || result.status !== 0) throw new Error('SSH 连接或体检失败')
    const meta = {}
    const found = new Map()
    for (const line of String(result.stdout || '').split(/\r?\n/)) {
      const [type, key, value] = line.split('\t')
      if (type === 'META') meta[key] = value
      if (type === 'TOOL' && catalog.some((def) => def.id === key)) found.set(key, value || '')
    }
    if (!meta.home || !meta.os || found.size !== catalog.length) throw new Error('SSH 体检返回不完整')
    const value = {
      configured: true, connected: true, alias, os: meta.os, kali: meta.os === 'kali',
      home: meta.home,
      toolkitDir: meta.home + '/.dsh/redteam/toolkit',
      toolkitExists: meta['exists:toolkit'] === '1',
      markerExists: meta['exists:redteam/.setup-complete'] === '1',
      setupScriptExists: meta['exists:redteam/setup.sh'] === '1',
      envFileExists: meta['exists:.env'] === '1',
      fofaKeyConfigured: meta['env:FOFA_KEY'] === '1',
      vpsHostConfigured: meta['env:REDTEAM_VPS_HOST'] === '1',
      vpsKeyExists: meta['exists:vps-key'] === '1',
      tools: catalog.map((def) => ({
        id: def.id, label: def.label, path: found.get(def.id) || null,
        source: found.get(def.id) ? 'remote' : 'missing', names: def.names,
      })),
    }
    if (!options.runner) cache.set(alias, { stamp, at: Date.now(), value })
    return value
  } catch (error) {
    const value = { configured: true, connected: false, alias, kali: false, error: error.message || String(error), tools: catalog.map((def) => ({
      id: def.id, label: def.label, path: null, source: 'missing', names: def.names,
    })) }
    if (!options.runner && stamp) cache.set(alias, { stamp, at: Date.now(), value })
    return value
  }
}
