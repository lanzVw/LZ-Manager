export const OVERLAY_LAST_CHARACTER_STORAGE_KEY = 'lz-overlay-last-character-by-game'

type CharacterModState = {
  enabled?: boolean
}

type ModsByCharacter = Record<string, ReadonlyArray<CharacterModState> | undefined>

/**
 * 只把官方角色纳入“唯一启用角色”判断。
 * 功能、武器、NPC 等本地分类目录即使有启用 Mod，也不能代表游戏当前角色。
 */
export function pickUniqueEnabledOfficialCharacter(
  modsByCharacter: ModsByCharacter | null | undefined,
  officialCharacterNames: Iterable<string>
): string | null {
  const officialNames = new Set<string>()
  for (const rawName of officialCharacterNames) {
    const name = typeof rawName === 'string' ? rawName.trim() : ''
    if (name && name !== '全部角色') officialNames.add(name)
  }
  if (officialNames.size === 0) return null

  let candidate: string | null = null
  for (const [name, mods] of Object.entries(modsByCharacter || {})) {
    if (!officialNames.has(name) || !Array.isArray(mods)) continue
    if (!mods.some((mod) => Boolean(mod?.enabled))) continue

    // 第二个官方角色也启用时立刻判为歧义，避免继续遍历无意义数据。
    if (candidate) return null
    candidate = name
  }
  return candidate
}

export function filterOverlayCharacterNames(
  localNames: readonly string[],
  officialCharacterNames: Iterable<string>
): string[] {
  const officialNames = new Set<string>()
  for (const rawName of officialCharacterNames) {
    const name = typeof rawName === 'string' ? rawName.trim() : ''
    if (name) officialNames.add(name)
  }

  if (officialNames.size === 0) return [...localNames]

  // 没有命中任何官方目录时保留原列表，避免旧游戏或不完整名单把悬浮窗清空。
  const hasOfficialLocalCharacter = localNames.some((name) => officialNames.has(name))
  if (!hasOfficialLocalCharacter) return [...localNames]

  return localNames.filter((name) => officialNames.has(name))
}

export function parseLastCharacterByGame(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const entries: Array<[string, string]> = []
    for (const [gameId, rawName] of Object.entries(parsed)) {
      if (!gameId || typeof rawName !== 'string') continue
      const name = rawName.trim()
      if (name) entries.push([gameId, name])
    }
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

export function withLastCharacterForGame(
  map: Record<string, string>,
  gameId: string,
  characterName: string
): Record<string, string> {
  if (!gameId || !characterName) return map
  return { ...map, [gameId]: characterName }
}
