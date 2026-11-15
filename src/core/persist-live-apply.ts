import type { PersistLiveApply } from './persist-bridge'

export interface PersistLiveApplyDeps {
  ensureEnvironment: (envRoot: string, syncActiveMods: boolean) => boolean
  writeLiveApply: (
    envRoot: string,
    liveApply: PersistLiveApply | undefined
  ) => { success: boolean; error?: string }
  clearLiveApply: (envRoot: string) => void
  dispatchReload: () => Promise<{ success: boolean; reason?: string }>
  waitForReload: () => Promise<void>
}

export interface PersistLiveApplyResult {
  liveApplied: boolean
  reloadReason?: string
}

/**
 * F10 会先保存旧内存值、再重新加载配置。只写 d3dx_user.ini 会被第一次
 * SavePersistentSettings 覆盖，因此先用临时 apply 配置把目标值注入内存，
 * 再通过第二次 F10 完成持久化。
 */
export async function applyPersistLiveValue(
  envRoot: string,
  liveApply: PersistLiveApply | undefined,
  reapply: () => { success: boolean },
  deps: PersistLiveApplyDeps
): Promise<PersistLiveApplyResult> {
  if (!liveApply || liveApply.groups.length === 0) {
    deps.clearLiveApply(envRoot)
    return { liveApplied: false, reloadReason: 'live_apply_unsupported' }
  }

  if (!deps.ensureEnvironment(envRoot, false)) {
    deps.clearLiveApply(envRoot)
    return { liveApplied: false, reloadReason: 'live_apply_failed' }
  }

  const written = deps.writeLiveApply(envRoot, liveApply)
  if (!written.success) {
    deps.clearLiveApply(envRoot)
    return { liveApplied: false, reloadReason: 'live_apply_failed' }
  }

  const firstReload = await deps.dispatchReload()
  if (!firstReload.success) {
    // 游戏没启动时 d3dx_user.ini 已保存好，下次启动会直接加载；
    // 运行中派发失败则保留 apply，下一次手动 F10 仍能兜底。
    if (firstReload.reason === 'no_game' || firstReload.reason === 'game_not_running') {
      deps.clearLiveApply(envRoot)
    }
    return { liveApplied: false, reloadReason: firstReload.reason || 'reload_failed' }
  }

  await deps.waitForReload()
  const secondReload = await deps.dispatchReload()
  if (!secondReload.success) {
    return { liveApplied: false, reloadReason: secondReload.reason || 'reload_failed' }
  }

  // 等第二次 F10 完成保存/重载后再写一次 d3dx_user，避免与游戏自己的
  // SavePersistentSettings 抢写；apply 只有这次写入成功后才清空。
  await deps.waitForReload()
  if (!reapply().success) {
    return { liveApplied: false, reloadReason: 'live_apply_persist_failed' }
  }
  deps.clearLiveApply(envRoot)
  return { liveApplied: true }
}
