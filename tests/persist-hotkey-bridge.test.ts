import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PERSIST_HOTKEY_SLOTS,
  PersistHotkeyBridge,
  buildPersistHotkeyManifest,
  tryApplyPreparedPersistHotkey
} from '../src/core/persist-hotkey-bridge'
import { PersistBridgeManager } from '../src/core/persist-bridge'
import type { ModPersistInfo, ModPersistVariable } from '../src/core/types'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lz-hotkey-bridge-'))
  tempRoots.push(root)
  return root
}

function makeVariable(overrides: Partial<ModPersistVariable> = {}): ModPersistVariable {
  return {
    name: 'hair',
    canonicalName: 'hair',
    namespace: 'Outfit\\Main',
    supported: true,
    defaultValue: '0',
    currentValue: '0',
    allowedValues: ['0', '1', '2'],
    inputKind: 'enum',
    iniFile: 'main.ini',
    ...overrides
  }
}

function makeInfo(variables: ModPersistVariable[]): ModPersistInfo {
  return {
    hasPersist: variables.length > 0,
    hash: 'abc123',
    namespace: variables[0]?.namespace || '',
    stateFileName: 'qaqm_state_abc123.ini',
    variables
  }
}

describe('persist hotkey bridge manifest', () => {
  it('maps only supported discrete variables with safe values', () => {
    const manifest = buildPersistHotkeyManifest(
      makeInfo([
        makeVariable(),
        makeVariable({
          name: 'glasses',
          canonicalName: 'glasses',
          allowedValues: undefined,
          inputKind: 'binary'
        }),
        makeVariable({
          name: 'scale',
          canonicalName: 'scale',
          allowedValues: ['0', '1'],
          inputKind: 'number'
        }),
        makeVariable({
          name: 'unsupported',
          canonicalName: 'unsupported',
          supported: false
        }),
        makeVariable({
          name: 'vector',
          canonicalName: 'vector',
          allowedValues: ['0,1', '1,0']
        })
      ])
    )

    expect(manifest.targets.map((item) => `${item.variable}:${item.value}`)).toEqual([
      'hair:0',
      'hair:1',
      'hair:2',
      'glasses:0',
      'glasses:1'
    ])
    expect(manifest.hotkeyCount).toBe(5)
    expect(manifest.fallbackCount).toBe(0)
  })

  it('is deterministic and uses every unique slot before falling back', () => {
    const variables = Array.from({ length: 49 }, (_, index) =>
      makeVariable({
        name: `option_${index}`,
        canonicalName: `option_${index}`,
        allowedValues: ['0', '1']
      })
    )

    const first = buildPersistHotkeyManifest(makeInfo(variables))
    const second = buildPersistHotkeyManifest(makeInfo(variables))
    const serializedKeys = first.targets.map((target) => target.keys.join('+'))

    expect(first.targets).toEqual(second.targets)
    expect(first.hotkeyCount).toBe(PERSIST_HOTKEY_SLOTS.length)
    expect(first.fallbackCount).toBe(2)
    expect(new Set(serializedKeys).size).toBe(serializedKeys.length)
    expect(PERSIST_HOTKEY_SLOTS.every((slot) =>
      slot.length === 3 && slot.every((key) => /^VK_F(?:1[3-9]|2[0-4])$/.test(key))
    )).toBe(true)
    expect(first.targets.every((target) => PERSIST_HOTKEY_SLOTS.some(
      (slot) => slot.join('+') === target.keys.join('+')
    ))).toBe(true)
  })
})

describe('persist hotkey bridge files', () => {
  it('writes namespace-scoped key files, wires the index, and leaves Mod INIs untouched', () => {
    const root = makeRoot()
    const modDir = path.join(root, 'Mods', 'Character', 'Outfit')
    fs.mkdirSync(modDir, { recursive: true })
    const modIniPath = path.join(modDir, 'main.ini')
    const originalIni = '[Constants]\nglobal persist $hair = 0\n'
    fs.writeFileSync(modIniPath, originalIni, 'utf8')

    const bridge = new PersistHotkeyBridge()
    const info = makeInfo([
      makeVariable(),
      makeVariable({
        name: 'body',
        canonicalName: 'body',
        namespace: 'Outfit\\Second',
        allowedValues: ['0', '1']
      })
    ])
    const prepared = bridge.prepareFiles(root, info)
    const manifestDir = path.join(root, 'qaqm', 'hotkeys', prepared.manifestHash)
    const files = fs.readdirSync(manifestDir).sort()

    expect(prepared.changed).toBe(true)
    expect(files).toHaveLength(2)
    expect(fs.readFileSync(modIniPath, 'utf8')).toBe(originalIni)

    const index = fs.readFileSync(path.join(root, 'qaqm', 'qaqm_live_keys.ini'), 'utf8')
    expect(index).toContain(`hotkeys\\${prepared.manifestHash}\\${files[0]}`)
    expect(index).toContain(`hotkeys\\${prepared.manifestHash}\\${files[1]}`)

    const contents = files.map((fileName) =>
      fs.readFileSync(path.join(manifestDir, fileName), 'utf8')
    )
    expect(contents.some((content) => content.includes('namespace = Outfit\\Main'))).toBe(true)
    expect(contents.some((content) => content.includes('namespace = Outfit\\Second'))).toBe(true)
    expect(contents.join('\n')).toContain('$hair = 0')
    expect(contents.join('\n')).toContain('key = VK_F13')
    expect(fs.readFileSync(modIniPath, 'utf8')).toBe(originalIni)

    const second = bridge.prepareFiles(root, info)
    expect(second.changed).toBe(false)
  })

  it('removes stale generated manifests when the active Mod changes', () => {
    const root = makeRoot()
    const bridge = new PersistHotkeyBridge()

    const first = bridge.prepareFiles(
      root,
      makeInfo([makeVariable({ namespace: 'Outfit\\First' })])
    )
    const firstDir = path.join(root, 'qaqm', 'hotkeys', first.manifestHash)
    expect(fs.existsSync(firstDir)).toBe(true)

    const second = bridge.prepareFiles(
      root,
      makeInfo([makeVariable({ namespace: 'Outfit\\Second' })])
    )
    const secondDir = path.join(root, 'qaqm', 'hotkeys', second.manifestHash)
    const index = fs.readFileSync(path.join(root, 'qaqm', 'qaqm_live_keys.ini'), 'utf8')

    expect(fs.existsSync(secondDir)).toBe(true)
    expect(fs.existsSync(firstDir)).toBe(false)
    expect(index).toContain(`hotkeys\\${second.manifestHash}\\`)
    expect(index).not.toContain(`hotkeys\\${first.manifestHash}\\`)
  })

  it('clears the generated index when the active Mod has no hotkey targets', () => {
    const root = makeRoot()
    const bridge = new PersistHotkeyBridge()

    bridge.prepareFiles(root, makeInfo([makeVariable()]))
    const empty = bridge.prepareFiles(
      root,
      makeInfo([makeVariable({ inputKind: 'number', allowedValues: undefined })])
    )
    const index = fs.readFileSync(path.join(root, 'qaqm', 'qaqm_live_keys.ini'), 'utf8')

    expect(empty.changed).toBe(true)
    expect(empty.hotkeyCount).toBe(0)
    expect(index).not.toContain('include = hotkeys\\')
  })

  it('wires the generated index into qaqm_includer.ini', () => {
    const root = makeRoot()
    fs.writeFileSync(path.join(root, 'd3dx.ini'), '[Include]\n', 'utf8')

    const manager = new PersistBridgeManager()
    expect(manager.ensureEnvironment(root, false)).toBe(true)

    const includer = fs.readFileSync(path.join(root, 'qaqm', 'qaqm_includer.ini'), 'utf8')
    expect(includer).toContain('[IncludeLiveKeys]')
    expect(includer).toContain('include = qaqm_live_keys.ini')
    expect(fs.existsSync(path.join(root, 'qaqm', 'qaqm_live_keys.ini'))).toBe(true)
  })
})

describe('persist hotkey routing', () => {
  it('only resolves active Mod targets and supports overlay-only dispatch', async () => {
    const bridge = new PersistHotkeyBridge()
    const manifest = buildPersistHotkeyManifest(makeInfo([makeVariable()]))
    bridge.activate('C:\\Mods\\Outfit', manifest)
    const dispatchHotkey = vi.fn(async () => ({ success: true }))
    const waitForRelease = vi.fn(async () => {})
    const deps = { dispatchHotkey, waitForRelease }

    const mainWindowResult = await tryApplyPreparedPersistHotkey(
      bridge,
      'C:\\Mods\\Outfit',
      'Outfit\\Main',
      'hair',
      '1',
      false,
      deps
    )
    const overlayResult = await tryApplyPreparedPersistHotkey(
      bridge,
      'C:\\Mods\\Outfit',
      'Outfit\\Main',
      'hair',
      '1.0',
      true,
      deps
    )
    const wrongModResult = await tryApplyPreparedPersistHotkey(
      bridge,
      'C:\\Mods\\Other',
      'Outfit\\Main',
      'hair',
      '1',
      true,
      deps
    )

    expect(mainWindowResult).toEqual({ applied: false, reason: 'not_requested' })
    expect(wrongModResult).toEqual({ applied: false, reason: 'not_mapped' })
    expect(overlayResult).toEqual({ applied: true })
    expect(dispatchHotkey).toHaveBeenCalledOnce()
    expect(dispatchHotkey).toHaveBeenCalledWith(PERSIST_HOTKEY_SLOTS[1])
    expect(waitForRelease).toHaveBeenCalledOnce()
  })

  it('returns the dispatch failure so the caller can fall back to F10', async () => {
    const bridge = new PersistHotkeyBridge()
    const manifest = buildPersistHotkeyManifest(makeInfo([makeVariable()]))
    bridge.activate('C:\\Mods\\Outfit', manifest)

    const result = await tryApplyPreparedPersistHotkey(
      bridge,
      'C:\\Mods\\Outfit',
      'Outfit\\Main',
      'hair',
      '1',
      true,
      {
        dispatchHotkey: async () => ({ success: false, reason: 'game_not_running' }),
        waitForRelease: async () => {}
      }
    )

    expect(result).toEqual({ applied: false, reason: 'game_not_running' })
  })
})
