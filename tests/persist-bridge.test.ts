import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { PersistBridgeManager } from '../src/core/persist-bridge'

const roots: string[] = []

function fixture(ini: string, content: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-persist-'))
  roots.push(root)
  const mods = path.join(root, 'Mods')
  const mod = path.join(mods, 'Character', 'Skin')
  fs.mkdirSync(mod, { recursive: true })
  fs.mkdirSync(path.join(root, 'qaqm'), { recursive: true })
  fs.writeFileSync(path.join(mod, ini), content, 'utf8')
  return { root, mods, mod }
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('PersistBridgeManager namespace mapping', () => {
  it('uses an explicit namespace for d3dx_user keys', () => {
    const f = fixture('main.ini', 'namespace = Outfit\\Main\n\n[Constants]\nglobal persist $hair = 1\n')
    const manager = new PersistBridgeManager()
    const info = manager.getModPersistInfo(f.mod, f.mods, f.root)
    expect(info.variables[0].namespace).toBe('Outfit\\Main')
    expect(info.variables[0].supported).toBe(true)

    expect(manager.updateModVariable(f.root, f.mods, f.mod, 'hair', '0').success).toBe(true)
    const user = fs.readFileSync(path.join(f.root, 'd3dx_user.ini'), 'utf8')
    expect(user).toContain('$\\Outfit\\Main\\hair = 0')
    expect(user).not.toContain('QAQM\\Persist\\Bridge_')
  })

  it('uses the game namespace including Mods root and ini filename', () => {
    const f = fixture('main.ini', '[Constants]\nglobal persist $body = 0\n')
    const manager = new PersistBridgeManager()
    const info = manager.getModPersistInfo(f.mod, f.mods, f.root)
    expect(info.variables[0].namespace).toBe('Mods\\Character\\Skin\\main.ini')
    expect(manager.updateModVariable(f.root, f.mods, f.mod, 'body', '1').success).toBe(true)
    expect(fs.readFileSync(path.join(f.root, 'd3dx_user.ini'), 'utf8')).toContain('$\\Mods\\Character\\Skin\\main.ini\\body = 1')
  })

  it('keeps variables from multiple ini namespaces independent and resets them', () => {
    const f = fixture('a.ini', 'namespace = A\n\n[Constants]\nglobal persist $x = 0\n')
    fs.writeFileSync(path.join(f.mod, 'b.ini'), 'namespace = B\n\n[Constants]\nglobal persist $x = 1\n', 'utf8')
    const manager = new PersistBridgeManager()
    const info = manager.getModPersistInfo(f.mod, f.mods, f.root)
    expect(info.variables.map((v) => v.namespace)).toEqual(['A', 'B'])
    expect(manager.updateModVariable(f.root, f.mods, f.mod, 'x', '1')).toEqual({
      success: false,
      error: '此 Mod 存在同名但不同 namespace 的变量，无法安全确定目标'
    })
    expect(manager.resetModVariables(f.root, f.mods, f.mod).resetCount).toBe(2)
    const reset = fs.readFileSync(path.join(f.root, 'd3dx_user.ini'), 'utf8')
    expect(reset).toContain('$\\A\\x = 0')
    expect(reset).toContain('$\\B\\x = 1')
  })

  it('accepts vector and signed numeric values and injects them live without allowing ini syntax injection', () => {
    const f = fixture('main.ini', '[Constants]\nglobal persist $hair = 1\n')
    const manager = new PersistBridgeManager()

    const vectorUpdate = manager.updateModVariable(f.root, f.mods, f.mod, 'hair', '-0.5, 1.0')
    expect(vectorUpdate.success).toBe(true)
    expect(vectorUpdate.liveApply?.groups[0].assignments[0].value).toBe('-0.5, 1.0')
    expect(manager.ensureEnvironment(f.root, false)).toBe(true)
    expect(manager.writeLiveApply(f.root, vectorUpdate.liveApply).success).toBe(true)
    const apply = fs.readFileSync(path.join(f.root, 'qaqm', 'qaqm_persist_apply', '0.ini'), 'utf8')
    expect(apply).toContain('post $hair = -0.5, 1.0')
    expect(manager.updateModVariable(f.root, f.mods, f.mod, 'hair', '1\nInjected = 1')).toEqual({
      success: false,
      error: '变量名或设定值无效'
    })
  })

  it('strips DISABLED_ from mod folder when deriving default namespace', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-persist-'))
    roots.push(root)
    const mods = path.join(root, 'Mods')
    const disabledMod = path.join(mods, 'Character', 'DISABLED_Skin')
    fs.mkdirSync(disabledMod, { recursive: true })
    fs.mkdirSync(path.join(root, 'qaqm'), { recursive: true })
    fs.writeFileSync(path.join(disabledMod, 'main.ini'), '[Constants]\nglobal persist $body = 0\n', 'utf8')

    const manager = new PersistBridgeManager()
    const info = manager.getModPersistInfo(disabledMod, mods, root)
    expect(info.variables[0].namespace).toBe('Mods\\Character\\Skin\\main.ini')

    expect(manager.updateModVariable(root, mods, disabledMod, 'body', '1').success).toBe(true)
    const user = fs.readFileSync(path.join(root, 'd3dx_user.ini'), 'utf8')
    expect(user).toContain('$\\Mods\\Character\\Skin\\main.ini\\body = 1')
    expect(user).not.toContain('DISABLED_')

    // Reading persist info from disabled mod should retrieve the updated value from d3dx_user.ini
    const infoAfter = manager.getModPersistInfo(disabledMod, mods, root)
    expect(infoAfter.variables[0].currentValue).toBe('1')
  })

  it('allows updating duplicate-name variables when targetNamespace is provided', () => {
    const f = fixture('a.ini', 'namespace = A\n\n[Constants]\nglobal persist $x = 0\n')
    fs.writeFileSync(path.join(f.mod, 'b.ini'), 'namespace = B\n\n[Constants]\nglobal persist $x = 1\n', 'utf8')
    const manager = new PersistBridgeManager()

    // Disambiguated update targeting namespace A
    expect(manager.updateModVariable(f.root, f.mods, f.mod, 'x', '2', 'A').success).toBe(true)
    const user = fs.readFileSync(path.join(f.root, 'd3dx_user.ini'), 'utf8')
    expect(user).toContain('$\\A\\x = 2')
    expect(user).not.toContain('$\\B\\x = 2')
  })

  it('accepts variable names with leading $ and strips it safely', () => {
    const f = fixture('main.ini', 'namespace = Outfit\\Main\n\n[Constants]\nglobal persist $hair = 1\n')
    const manager = new PersistBridgeManager()

    expect(manager.updateModVariable(f.root, f.mods, f.mod, '$hair', '0').success).toBe(true)
    const user = fs.readFileSync(path.join(f.root, 'd3dx_user.ini'), 'utf8')
    expect(user).toContain('$\\Outfit\\Main\\hair = 0')
  })

  it('supports the persist global declaration order used by some tools', () => {
    const f = fixture('main.ini', 'namespace = RabbitFX\n\n[Constants]\npersist global $censor = 0\n')
    const manager = new PersistBridgeManager()
    const info = manager.getModPersistInfo(f.mod, f.mods, f.root)

    expect(info.variables).toHaveLength(1)
    expect(info.variables[0].name).toBe('censor')
    expect(manager.updateModVariable(f.root, f.mods, f.mod, 'censor', '1').success).toBe(true)
    expect(fs.readFileSync(path.join(f.root, 'd3dx_user.ini'), 'utf8')).toContain('$\\RabbitFX\\censor = 1')
  })

  it('keeps decimal toggle values and injects them live', () => {
    const f = fixture(
      'main.ini',
      'namespace = Slider\n\n[Constants]\nglobal persist $scale = 0.5\n\n[KeyScale]\nkey = VK_F1\n$scale = 0.5, 1.0, 1.5\n'
    )
    const manager = new PersistBridgeManager()
    const info = manager.getModPersistInfo(f.mod, f.mods, f.root)

    expect(info.variables[0].allowedValues).toEqual(['0.5', '1.0', '1.5'])
    const update = manager.updateModVariable(f.root, f.mods, f.mod, 'scale', '1.5')
    expect(update.liveApply?.groups[0].assignments).toEqual([{ name: 'scale', value: '1.5' }])
  })

  it('never modifies or rewrites original Mod INI files', () => {
    const originalContent = 'namespace = Outfit\\Main\n\n[Constants]\nglobal persist $hair = 1\n'
    const f = fixture('main.ini', originalContent)
    const iniPath = path.join(f.mod, 'main.ini')
    const manager = new PersistBridgeManager()

    manager.updateModVariable(f.root, f.mods, f.mod, 'hair', '0')
    expect(fs.readFileSync(iniPath, 'utf8')).toBe(originalContent)

    manager.resetModVariables(f.root, f.mods, f.mod)
    expect(fs.readFileSync(iniPath, 'utf8')).toBe(originalContent)

    manager.syncModPersistOnToggle(f.root, f.mods, f.mod, true)
    expect(fs.readFileSync(iniPath, 'utf8')).toBe(originalContent)

    manager.syncModPersistOnToggle(f.root, f.mods, f.mod, false)
    expect(fs.readFileSync(iniPath, 'utf8')).toBe(originalContent)
  })

  it('marks variables with invalid namespace as unsupported and rejects edits', () => {
    const f = fixture('main.ini', 'namespace = "Bad#Namespace"\n\n[Constants]\nglobal persist $var = 1\n')
    const manager = new PersistBridgeManager()
    const info = manager.getModPersistInfo(f.mod, f.mods, f.root)

    expect(info.variables[0].supported).toBe(false)
    expect(info.variables[0].supportError).toBe('namespace 包含非法字符')
    expect(manager.updateModVariable(f.root, f.mods, f.mod, 'var', '0')).toEqual({
      success: false,
      error: 'namespace 包含非法字符'
    })
  })

  it('writes live apply post commands against an explicit namespace and wires the index', () => {
    const f = fixture('main.ini', 'namespace = Outfit\\Main\n\n[Constants]\nglobal persist $hair = 1\n')
    const manager = new PersistBridgeManager()
    const update = manager.updateModVariable(f.root, f.mods, f.mod, 'hair', '2')

    expect(update.liveApply).toEqual({
      groups: [{ namespace: 'Outfit\\Main', assignments: [{ name: 'hair', value: '2' }] }]
    })
    expect(manager.ensureEnvironment(f.root, false)).toBe(true)
    expect(manager.writeLiveApply(f.root, update.liveApply).success).toBe(true)

    const includer = fs.readFileSync(path.join(f.root, 'qaqm', 'qaqm_includer.ini'), 'utf8')
    expect(includer).toContain('[IncludePersistApply]')
    expect(includer).toContain('include = qaqm_persist_apply.ini')

    const index = fs.readFileSync(path.join(f.root, 'qaqm', 'qaqm_persist_apply.ini'), 'utf8')
    expect(index).toContain('include = qaqm_persist_apply\\0.ini')
    const apply = fs.readFileSync(path.join(f.root, 'qaqm', 'qaqm_persist_apply', '0.ini'), 'utf8')
    expect(apply).toContain('namespace = Outfit\\Main')
    expect(apply).toContain('post $hair = 2')
  })

  it('writes live apply against the default file namespace when the ini has no preamble', () => {
    const f = fixture('main.ini', '[Constants]\nglobal persist $body = 0\n')
    const manager = new PersistBridgeManager()
    const update = manager.updateModVariable(f.root, f.mods, f.mod, 'body', '1')

    expect(update.liveApply?.groups[0].namespace).toBe('Mods\\Character\\Skin\\main.ini')
    expect(manager.ensureEnvironment(f.root, false)).toBe(true)
    expect(manager.writeLiveApply(f.root, update.liveApply).success).toBe(true)
    const apply = fs.readFileSync(path.join(f.root, 'qaqm', 'qaqm_persist_apply', '0.ini'), 'utf8')
    expect(apply).toContain('namespace = Mods\\Character\\Skin\\main.ini')
    expect(apply).toContain('post $body = 1')
  })

  it('keeps legacy bridge namespaces, state files and active includes in sync', () => {
    const hash = '6571342a40b3'
    const originalContent = [
      '[Constants]',
      'global persist $Jacket = 1',
      `$\\QAQM\\Persist\\Bridge_${hash}\\Jacket = 1, 0`,
      ''
    ].join('\n')
    const f = fixture('main.ini', originalContent)
    const manager = new PersistBridgeManager()
    const info = manager.getModPersistInfo(f.mod, f.mods, f.root)

    expect(info.variables[0].namespace).toBe(`QAQM\\Persist\\Bridge_${hash}`)
    expect(info.variables[0].bridgeHash).toBe(hash)
    const update = manager.updateModVariable(f.root, f.mods, f.mod, 'Jacket', '0')
    expect(update.success).toBe(true)
    expect(update.liveApply?.groups[0].namespace).toBe(`QAQM\\Persist\\Bridge_${hash}`)

    const user = fs.readFileSync(path.join(f.root, 'd3dx_user.ini'), 'utf8')
    expect(user).toContain(`$\\QAQM\\Persist\\Bridge_${hash}\\Jacket = 0`)
    const state = fs.readFileSync(path.join(f.root, 'qaqm', 'cache', `qaqm_state_${hash}.ini`), 'utf8')
    expect(state).toContain(`namespace = QAQM\\Persist\\Bridge_${hash}`)
    expect(state).toContain('global persist $Jacket = 0')
    const active = fs.readFileSync(path.join(f.root, 'qaqm', 'qaqm_persist_active.ini'), 'utf8')
    expect(active).toContain(`include = cache\\qaqm_state_${hash}.ini`)
    expect(fs.readFileSync(path.join(f.mod, 'main.ini'), 'utf8')).toBe(originalContent)
  })

  it('recovers legacy bridge variables from the state file when the original declaration is missing', () => {
    const hash = '6571342a40b3'
    const f = fixture('main.ini', `[Constants]\n$\\QAQM\\Persist\\Bridge_${hash}\\Jacket = 1, 0\n`)
    const cacheDir = path.join(f.root, 'qaqm', 'cache')
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(
      path.join(cacheDir, `qaqm_state_${hash}.ini`),
      `namespace = QAQM\\Persist\\Bridge_${hash}\n\n[Constants]\nglobal persist $Jacket = 1\n`,
      'utf8'
    )

    const manager = new PersistBridgeManager()
    const info = manager.getModPersistInfo(f.mod, f.mods, f.root)
    expect(info.variables).toHaveLength(1)
    expect(info.variables[0].name).toBe('Jacket')
    expect(info.variables[0].namespace).toBe(`QAQM\\Persist\\Bridge_${hash}`)
    expect(info.variables[0].currentValue).toBe('1')
  })

  it('returns every supported default in a reset live apply group', () => {
    const f = fixture(
      'main.ini',
      'namespace = Outfit\\Main\n\n[Constants]\nglobal persist $hair = 1\nglobal persist $body = 0\n'
    )
    const manager = new PersistBridgeManager()
    const reset = manager.resetModVariables(f.root, f.mods, f.mod)

    expect(reset.success).toBe(true)
    expect(reset.resetCount).toBe(2)
    expect(reset.liveApply).toEqual({
      groups: [
        {
          namespace: 'Outfit\\Main',
          assignments: [
            { name: 'hair', value: '1' },
            { name: 'body', value: '0' }
          ]
        }
      ]
    })
  })
})
