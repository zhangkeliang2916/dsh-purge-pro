import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TOOL_CATALOG } from '../lib/redteam/platform-config.js'
import { probeRemotePlatform, remoteProbeScript } from '../lib/redteam/remote-platform.js'
import { checkSkill } from '../lib/redteam/skill-availability.js'

const home = mkdtempSync(join(tmpdir(), 'dsh-remote-'))
try {
  const keyPath = join(home, 'id_ed25519')
  writeFileSync(keyPath, 'test key')
  writeFileSync(join(home, 'dsh-ssh.json'), JSON.stringify({ version: 1, hosts: [{
    alias: 'kali-test', host: '192.0.2.10', port: 22, user: 'kali',
    auth: { kind: 'key', keyPath }, proxyJump: [],
  }] }))

  const script = remoteProbeScript(TOOL_CATALOG)
  assert.match(script, /httpx-toolkit/)
  assert.match(script, /toolkit\/httpx\/httpx/)
  assert.doesNotMatch(script, /for candidate in 'httpx-toolkit' 'pd-httpx' 'httpx'/)
  let captured
  const output = [
    'META\tos\tkali', 'META\thome\t/home/kali', 'META\texists:toolkit\t1',
    ...TOOL_CATALOG.map((def) => `TOOL\t${def.id}\t${def.id === 'nmap' ? '/usr/bin/nmap' : ''}`),
  ].join('\n')
  const result = probeRemotePlatform('kali-test', TOOL_CATALOG, {
    home,
    runner: (binary, args, options) => {
      captured = { binary, args, options }
      return { status: 0, stdout: output }
    },
  })
  assert.equal(result.connected, true)
  assert.equal(result.kali, true)
  assert.equal(result.toolkitExists, true)
  assert.equal(result.tools.find((tool) => tool.id === 'nmap').path, '/usr/bin/nmap')
  assert.equal(result.tools.find((tool) => tool.id === 'httpx').path, null)
  assert.ok(captured.args.includes('BatchMode=yes'))
  assert.equal(captured.options.timeout, 8000)

  const skill = { name: 'remote-example', content: 'Run $DSH_HOME/redteam/toolkit/missing/missing' }
  assert.ok(checkSkill(skill).checked.missing_paths.length > 0)
  assert.deepEqual(checkSkill(skill, { skipLocalPaths: true }).checked.missing_paths, [])

  const failure = probeRemotePlatform('kali-test', TOOL_CATALOG, {
    home, runner: () => ({ status: 255, stderr: 'Permission denied' }),
  })
  assert.equal(failure.connected, false)
  assert.equal(failure.tools.every((tool) => tool.path === null), true)
  console.log('4 remote environment checks passed')
} finally {
  rmSync(home, { recursive: true, force: true })
}
