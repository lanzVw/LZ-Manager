import { describe, expect, it, vi } from 'vitest'
import { applyPersistLiveValue, type PersistLiveApplyDeps } from '../src/core/persist-live-apply'
import type { PersistLiveApply } from '../src/core/persist-bridge'

const liveApply: PersistLiveApply = {
  groups: [{ namespace: 'Outfit\\Main', assignments: [{ name: 'hair', value: '1' }] }]
}

function createDeps(calls: string[]) {
  return {
    ensureEnvironment: vi.fn(() => {
      calls.push('ensure')
      return true
    }),
    writeLiveApply: vi.fn(() => {
      calls.push('write')
      return { success: true }
    }),
    clearLiveApply: vi.fn(() => {
      calls.push('clear')
    }),
    dispatchReload: vi.fn(async () => {
      calls.push('reload')
      return { success: true }
    }),
    waitForReload: vi.fn(async () => {
      calls.push('wait')
    })
  } satisfies PersistLiveApplyDeps
}

describe('applyPersistLiveValue', () => {
  it('injects, reloads twice, persists again, then clears the apply index', async () => {
    const calls: string[] = []
    const deps = createDeps(calls)
    const reapply = vi.fn(() => {
      calls.push('reapply')
      return { success: true }
    })

    const result = await applyPersistLiveValue('/env', liveApply, reapply, deps)

    expect(result).toEqual({ liveApplied: true })
    expect(calls).toEqual(['ensure', 'write', 'reload', 'wait', 'reload', 'wait', 'reapply', 'clear'])
  })

  it('does not dispatch when no safe live value exists', async () => {
    const calls: string[] = []
    const deps = createDeps(calls)

    const result = await applyPersistLiveValue('/env', undefined, () => ({ success: true }), deps)

    expect(result).toEqual({ liveApplied: false, reloadReason: 'live_apply_unsupported' })
    expect(deps.dispatchReload).not.toHaveBeenCalled()
    expect(calls).toEqual(['clear'])
  })

  it('clears apply when the game environment cannot be prepared', async () => {
    const calls: string[] = []
    const deps = createDeps(calls)
    deps.ensureEnvironment.mockReturnValueOnce(false)

    const result = await applyPersistLiveValue('/env', liveApply, () => ({ success: true }), deps)

    expect(result).toEqual({ liveApplied: false, reloadReason: 'live_apply_failed' })
    expect(deps.writeLiveApply).not.toHaveBeenCalled()
    expect(deps.dispatchReload).not.toHaveBeenCalled()
    expect(deps.clearLiveApply).toHaveBeenCalledOnce()
  })

  it('clears apply when the game is not running', async () => {
    const calls: string[] = []
    const deps = createDeps(calls)
    deps.dispatchReload.mockResolvedValueOnce({ success: false, reason: 'game_not_running' })

    const result = await applyPersistLiveValue('/env', liveApply, () => ({ success: true }), deps)

    expect(result).toEqual({ liveApplied: false, reloadReason: 'game_not_running' })
    expect(deps.dispatchReload).toHaveBeenCalledOnce()
    expect(calls).toEqual(['ensure', 'write', 'clear'])
  })

  it('keeps apply when the first reload cannot be dispatched', async () => {
    const calls: string[] = []
    const deps = createDeps(calls)
    deps.dispatchReload.mockResolvedValueOnce({ success: false, reason: 'reload_failed' })

    const result = await applyPersistLiveValue('/env', liveApply, () => ({ success: true }), deps)

    expect(result).toEqual({ liveApplied: false, reloadReason: 'reload_failed' })
    expect(deps.clearLiveApply).not.toHaveBeenCalled()
  })

  it('keeps apply when the second reload fails', async () => {
    const calls: string[] = []
    const deps = createDeps(calls)
    deps.dispatchReload
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, reason: 'reload_failed' })

    const result = await applyPersistLiveValue('/env', liveApply, () => ({ success: true }), deps)

    expect(result).toEqual({ liveApplied: false, reloadReason: 'reload_failed' })
    expect(deps.clearLiveApply).not.toHaveBeenCalled()
  })

  it('clears apply when writing the apply file fails', async () => {
    const calls: string[] = []
    const deps = createDeps(calls)
    deps.writeLiveApply.mockReturnValueOnce({ success: false, error: 'disk full' })

    const result = await applyPersistLiveValue('/env', liveApply, () => ({ success: true }), deps)

    expect(result).toEqual({ liveApplied: false, reloadReason: 'live_apply_failed' })
    expect(deps.dispatchReload).not.toHaveBeenCalled()
    expect(deps.clearLiveApply).toHaveBeenCalledOnce()
  })

  it('keeps apply when the final persistence write fails', async () => {
    const calls: string[] = []
    const deps = createDeps(calls)

    const result = await applyPersistLiveValue('/env', liveApply, () => ({ success: false }), deps)

    expect(result).toEqual({ liveApplied: false, reloadReason: 'live_apply_persist_failed' })
    expect(deps.clearLiveApply).not.toHaveBeenCalled()
  })
})
