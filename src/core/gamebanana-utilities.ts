export const GAMEBANANA_UTILITY_MODS: Record<number, number[]> = {
  19567: [531649]
}

export function getGameBananaUtilityModIds(gameId: string | number): number[] {
  const id = Number(gameId)
  return Number.isFinite(id) ? [...(GAMEBANANA_UTILITY_MODS[id] || [])] : []
}

export function filterGameBananaUtilityMods<T extends { id?: string | number }>(
  records: T[],
  modIds: number[]
): T[] {
  const allowedIds = new Set(modIds.map(Number))
  const seenIds = new Set<number>()
  return records.filter((record) => {
    const id = Number(record.id)
    if (!Number.isFinite(id) || !allowedIds.has(id) || seenIds.has(id)) return false
    seenIds.add(id)
    return true
  })
}
