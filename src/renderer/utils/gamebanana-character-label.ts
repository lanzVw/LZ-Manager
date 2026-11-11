/**
 * GameBanana 的模组分类名是英文角色名（如 "Velina Airgid"），
 * 市场角标需要显示国服官方中文名（"维琳娜"）。
 * 这里用角色库里的 gbCatId / enName 做映射；联动数据来自 getGameBananaCharacters，
 * 不直接 import characters-data，避免把整份角色大表打进渲染层包。
 */

export interface CharacterLabelLookup {
  byGbCatId: Map<number, string>
  byName: Map<string, string>
}

const normalizeLabelKey = (raw: unknown): string =>
  typeof raw === 'string' ? raw.trim().toLowerCase() : ''

/** 角色库还没加载时也能安全调用（空表 => 全部回退原文） */
export const buildCharacterLabelLookup = (
  characters: any[] | null | undefined
): CharacterLabelLookup => {
  const byGbCatId = new Map<number, string>()
  const byName = new Map<string, string>()

  for (const c of characters || []) {
    if (!c || typeof c.name !== 'string' || !c.name.trim()) continue
    // "全部角色" 这类占位项没有 gbCatId，也不该参与名称匹配
    if (c.id === 'all') continue
    const name = c.name.trim()

    const catId = Number(c.gbCatId)
    if (Number.isFinite(catId) && catId > 0) byGbCatId.set(catId, name)

    for (const alias of [c.enName, c.name]) {
      const key = normalizeLabelKey(alias)
      if (key && !byName.has(key)) byName.set(key, name)
    }
  }

  return { byGbCatId, byName }
}

/**
 * 把模组身上的分类信息换成中文角色名。
 * 优先按分类 ID 命中（最可靠），其次按英文名匹配；
 * 都命中不了就保留原文——新角色尚未入库时，英文名也比空白有信息量。
 */
export const resolveCharacterLabel = (
  mod: any,
  lookup: CharacterLabelLookup,
  fallback = ''
): string => {
  if (!mod) return fallback

  const category = typeof mod.category === 'object' ? mod.category : null

  const idCandidates = [
    mod.subCategory?.id,
    mod.rootCategory?.id,
    category?.id,
    mod.categoryId
  ]
  for (const raw of idCandidates) {
    const catId = Number(raw)
    if (Number.isFinite(catId) && lookup.byGbCatId.has(catId)) {
      return lookup.byGbCatId.get(catId) as string
    }
  }

  const nameCandidates: unknown[] = [
    mod.subCategory?.name,
    mod.rootCategory?.name,
    typeof mod.category === 'string' ? mod.category : category?.name,
    mod.categoryName
  ]
  for (const raw of nameCandidates) {
    const key = normalizeLabelKey(raw)
    if (key && lookup.byName.has(key)) return lookup.byName.get(key) as string
  }

  const first = nameCandidates.find(
    (raw): raw is string => typeof raw === 'string' && Boolean(raw.trim())
  )
  return first ? first.trim() : fallback
}
