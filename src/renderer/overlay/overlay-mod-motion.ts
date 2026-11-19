export type CharacterSwitchDirection = -1 | 0 | 1

export function resolveCharacterSwitchDirection(
  previousCharacter: string | null | undefined,
  nextCharacter: string | null | undefined,
  orderedCharacters: readonly string[]
): CharacterSwitchDirection {
  if (!previousCharacter || !nextCharacter || previousCharacter === nextCharacter) {
    return 0
  }

  const previousIndex = orderedCharacters.indexOf(previousCharacter)
  const nextIndex = orderedCharacters.indexOf(nextCharacter)
  if (previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex) {
    return 0
  }

  // 首尾循环时沿用按键方向，避免把「下一角色」错判成反向入场。
  if (previousIndex === orderedCharacters.length - 1 && nextIndex === 0) return 1
  if (previousIndex === 0 && nextIndex === orderedCharacters.length - 1) return -1
  return nextIndex > previousIndex ? 1 : -1
}

export function getModEnterDelayMs(
  index: number,
  staggerMs = 14,
  maxStaggerIndex = 7
): number {
  if (!Number.isFinite(index) || !Number.isFinite(staggerMs) || !Number.isFinite(maxStaggerIndex)) {
    return 0
  }

  const safeIndex = Math.max(0, Math.floor(index))
  const safeStagger = Math.max(0, staggerMs)
  const safeMaxIndex = Math.max(0, Math.floor(maxStaggerIndex))
  return Math.min(safeIndex, safeMaxIndex) * safeStagger
}

// 覆盖最大延迟（98ms）与动画时长（240ms），动画结束后移除类名，避免筛选或切换视图时重播。
export const MOD_SWITCH_MOTION_CLEAR_MS = 460
