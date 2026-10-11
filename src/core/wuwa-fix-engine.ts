import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const SUPPORTED_SCHEMA_VERSION = 1
export const SUPPORTED_ENGINE_VERSION = 2
export const HASH_PATTERN = /^(?:[0-9a-f]{8}|[0-9a-f]{16})$/i
export const UINT_PATTERN = /^[0-9]{1,20}$/
export const KEY_PATTERN = /^[a-z0-9_$.-]{1,64}$/i
export const UINT_ASSIGNMENT_KEYS = new Set(['match_first_index', 'match_index_count'])
export const ASSIGNMENT_PATTERN = /^((?:(?:\uFEFF|\xEF\xBB\xBF))?[ \t]*)([a-z0-9_$.-]+)([ \t]*=[ \t]*)([^;#\r\n]*?)([ \t]*(?:[;#][^\r\n]*)?)(\r\n|\n|\r|$)/gim
export const BACKUP_MARKER = '.qaqm-inibak-'

export interface WuwaReplacement {
  from: string | string[]
  to: string
  note?: string
}

export interface WuwaRuleOperation {
  type: 'replace-assignment-value'
  keys: string[]
  valueType?: 'hex' | 'uint'
  occurrence?: 'all' | 'ordered-once' | 'first-present-reverse-all'
  replacements: WuwaReplacement[]
}

export interface WuwaRuleWhen {
  anyAssignment: {
    key: string
    values: string[]
    sectionPrefixes?: string[]
  }
}

export interface WuwaRule {
  id: string
  character?: string
  aliases?: string[]
  fromVersion?: string
  toVersion?: string
  operations: WuwaRuleOperation[]
  when?: WuwaRuleWhen
}

export interface WuwaRulesManifest {
  schemaVersion: number
  engineVersion: number
  revision: number
  toolVersion?: string
  gameId: string
  gameVersion?: string
  updatedAt?: string
  title?: string
  description?: string
  source?: {
    upstreamProgramVersion?: string
    upstreamConfigVersion?: string
    forkProgramVersion?: string
    forkConfigVersion?: string
    mappingCounts?: {
      upstreamDirectHashes?: number
      forkDirectHashes?: number
      localHiyuki35Hashes?: number
      combinedDeclaredHashes?: number
      ambiguousForkHashesExcluded?: number
      retiredBaselineHashes?: number
    }
    mappingSha256?: {
      combined?: string
    }
    conditionalPolicy?: {
      ruleCount: number
      mappingCount: number
      sha256: string
    }
    [key: string]: any
  }
  rules: WuwaRule[]
  [key: string]: any
}

export interface CompiledWuwaReplacement {
  from: string | string[]
  to: string
  sources: string[]
  note?: string
}

export interface CompiledWuwaOperation {
  type: string
  keys: string[]
  keySet: Set<string>
  valueType: 'hex' | 'uint'
  occurrence: 'all' | 'ordered-once' | 'first-present-reverse-all'
  replacements: CompiledWuwaReplacement[]
}

export interface CompiledWuwaRule {
  id: string
  when: {
    anyAssignment: {
      key: string
      values: Set<string>
      sectionPrefixes: string[]
    }
  } | null
  operations: CompiledWuwaOperation[]
}

export interface CompiledWuwaRules {
  maps: Map<string, Map<string, string>>
  allMaps: Map<string, Map<string, string>>
  directMaps: Map<string, Map<string, string>>
  rules: CompiledWuwaRule[]
  hasConditionalRules: boolean
  hasFirstPresentReverseAllRules: boolean
  declaredReplacementCount: number
}

export interface AssignmentChange {
  key: string
  from: string
  to: string
  occurrenceCount: number
}

export interface WuwaFixFileResult {
  relativePath: string
  replacementCount: number
  changes: AssignmentChange[]
}

export interface WuwaFixDirectoryStats {
  scannedFiles: number
  modifiedFiles: number
  replacementCount: number
  skippedBackupFiles: number
  failedFiles: number
  errors: string[]
  files: WuwaFixFileResult[]
}

export function cleanString(value: any): string {
  return String(value ?? '').trim()
}

export function normalizeHash(value: any, fieldName: string): string {
  const normalized = cleanString(value).toLowerCase()
  if (!HASH_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} 必须是完整的 8 位或 16 位十六进制 hash`)
  }
  return normalized
}

export function normalizeUint(value: any, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} 必须使用字符串保存无符号整数`)
  }
  const normalized = value.trim()
  if (!UINT_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} 必须是无符号十进制整数字符串`)
  }
  return normalized
}

export function normalizeAssignmentValue(value: any, valueType: string, fieldName: string): string {
  return valueType === 'uint' ? normalizeUint(value, fieldName) : normalizeHash(value, fieldName)
}

export function normalizeReplacementSources(
  value: any,
  valueType: string,
  fieldName: string
): { sources: string[]; normalized: string | string[] } {
  const sourceWasArray = Array.isArray(value)
  const rawSources = sourceWasArray ? value : [value]
  if (rawSources.length === 0) {
    throw new Error(`${fieldName} 不能为空`)
  }
  const sources: string[] = []
  const seen = new Set<string>()
  for (const rawSource of rawSources) {
    const source = normalizeAssignmentValue(rawSource, valueType, fieldName)
    if (!seen.has(source)) {
      seen.add(source)
      sources.push(source)
    }
  }
  return { sources, normalized: sourceWasArray ? sources : sources[0] }
}

export function normalizeRuleOperation(
  operation: any,
  ruleId: string,
  operationIndex: number,
  engineVersion: number
): WuwaRuleOperation {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    throw new Error(`规则 ${ruleId} 的第 ${operationIndex + 1} 个操作无效`)
  }
  if (operation.type !== 'replace-assignment-value') {
    throw new Error(`规则 ${ruleId} 使用了不支持的操作类型: ${operation.type || '空'}`)
  }
  const keys: string[] = Array.from(
    new Set<string>(
      (Array.isArray(operation.keys) ? operation.keys : [])
        .map((key: any) => cleanString(key).toLowerCase())
        .filter(Boolean)
    )
  )
  if (keys.length === 0 || keys.some((key) => !KEY_PATTERN.test(key))) {
    throw new Error(`规则 ${ruleId} 的赋值键无效`)
  }
  const valueType = (cleanString(operation.valueType || 'hex').toLowerCase() as 'hex' | 'uint')
  const occurrence = (cleanString(operation.occurrence || 'all').toLowerCase() as
    | 'all'
    | 'ordered-once'
    | 'first-present-reverse-all')
  if (!['hex', 'uint'].includes(valueType)) {
    throw new Error(`规则 ${ruleId} 使用了不支持的 valueType: ${operation.valueType || '空'}`)
  }
  if (!['all', 'ordered-once', 'first-present-reverse-all'].includes(occurrence)) {
    throw new Error(`规则 ${ruleId} 使用了不支持的 occurrence: ${operation.occurrence || '空'}`)
  }
  if (engineVersion < 2 && (valueType !== 'hex' || occurrence !== 'all')) {
    throw new Error(`规则 ${ruleId} 使用了需要 engineVersion 2 的赋值替换能力`)
  }
  if (valueType === 'hex' && keys.some((key) => key !== 'hash')) {
    throw new Error(`规则 ${ruleId} 的 hex 替换只能用于 hash 赋值键`)
  }
  if (valueType === 'uint' && keys.some((key) => !UINT_ASSIGNMENT_KEYS.has(key))) {
    throw new Error(`规则 ${ruleId} 的 uint 替换只能用于 match_first_index 或 match_index_count`)
  }
  if (occurrence === 'first-present-reverse-all' && valueType !== 'hex') {
    throw new Error(`规则 ${ruleId} 的 first-present-reverse-all 只能用于 hex/hash 替换`)
  }
  const replacements = (Array.isArray(operation.replacements) ? operation.replacements : []).map(
    (replacement: any, replacementIndex: number) => {
      if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement)) {
        throw new Error(`规则 ${ruleId} 的第 ${replacementIndex + 1} 个替换项无效`)
      }
      const from = normalizeReplacementSources(
        replacement.from,
        valueType,
        `规则 ${ruleId} 的 from`
      )
      const to = normalizeAssignmentValue(replacement.to, valueType, `规则 ${ruleId} 的 to`)
      if (valueType === 'hex' && from.sources.some((source) => source.length !== to.length)) {
        throw new Error(`规则 ${ruleId} 的 hash 位宽不一致: ${from.sources.join('/')} -> ${to}`)
      }
      const normalizedReplacement: WuwaReplacement = {
        ...replacement,
        from: from.normalized,
        to
      }
      const note = cleanString(replacement.note)
      if (note) normalizedReplacement.note = note
      else delete normalizedReplacement.note
      return normalizedReplacement
    }
  )
  if (replacements.length === 0) {
    throw new Error(`规则 ${ruleId} 没有替换项`)
  }
  const normalized: WuwaRuleOperation = {
    ...operation,
    type: operation.type,
    keys,
    replacements
  }
  if (engineVersion >= 2 || Object.prototype.hasOwnProperty.call(operation, 'valueType')) {
    normalized.valueType = valueType
  }
  if (engineVersion >= 2 || Object.prototype.hasOwnProperty.call(operation, 'occurrence')) {
    normalized.occurrence = occurrence
  }
  return normalized
}

export function normalizeRuleWhen(when: any, ruleId: string, engineVersion: number): WuwaRuleWhen | undefined {
  if (when === undefined || when === null) return undefined
  if (engineVersion < 2) {
    throw new Error(`规则 ${ruleId} 的 when 条件需要 engineVersion 2`)
  }
  if (!when || typeof when !== 'object' || Array.isArray(when)) {
    throw new Error(`规则 ${ruleId} 的 when 条件无效`)
  }
  const anyAssignment = when.anyAssignment
  if (!anyAssignment || typeof anyAssignment !== 'object' || Array.isArray(anyAssignment)) {
    throw new Error(`规则 ${ruleId} 的 when.anyAssignment 条件无效`)
  }
  const key = cleanString(anyAssignment.key).toLowerCase()
  if (key !== 'hash' && !UINT_ASSIGNMENT_KEYS.has(key)) {
    throw new Error(`规则 ${ruleId} 的 when.anyAssignment.key 不受支持: ${key || '空'}`)
  }
  const valueType = key === 'hash' ? 'hex' : 'uint'
  const values = Array.from(
    new Set(
      (Array.isArray(anyAssignment.values) ? anyAssignment.values : []).map((value: any) =>
        normalizeAssignmentValue(value, valueType, `规则 ${ruleId} 的 when.anyAssignment.values`)
      )
    )
  )
  if (values.length === 0) {
    throw new Error(`规则 ${ruleId} 的 when.anyAssignment.values 不能为空`)
  }
  let sectionPrefixes: string[] | undefined
  if (Object.prototype.hasOwnProperty.call(anyAssignment, 'sectionPrefixes')) {
    if (!Array.isArray(anyAssignment.sectionPrefixes)) {
      throw new Error(`规则 ${ruleId} 的 when.anyAssignment.sectionPrefixes 必须是数组`)
    }
    const seenPrefixes = new Set<string>()
    sectionPrefixes = []
    for (const rawPrefix of anyAssignment.sectionPrefixes) {
      const prefix = cleanString(rawPrefix)
      const identity = prefix.toLowerCase()
      if (!prefix) {
        throw new Error(`规则 ${ruleId} 的 when.anyAssignment.sectionPrefixes 不能包含空值`)
      }
      if (!seenPrefixes.has(identity)) {
        seenPrefixes.add(identity)
        sectionPrefixes.push(prefix)
      }
    }
  }
  const normalizedAnyAssignment: WuwaRuleWhen['anyAssignment'] = { ...anyAssignment, key, values }
  if (sectionPrefixes !== undefined) normalizedAnyAssignment.sectionPrefixes = sectionPrefixes
  return { ...when, anyAssignment: normalizedAnyAssignment }
}

export function computeWuwaConditionalPolicy(rules: WuwaRule[]): {
  ruleCount: number
  mappingCount: number
  sha256: string
} {
  const conditionalRules = (rules || [])
    .filter((rule) => rule?.when?.anyAssignment)
    .map((rule) => {
      const condition = rule.when!.anyAssignment
      return {
        id: cleanString(rule.id),
        when: {
          key: cleanString(condition.key).toLowerCase(),
          values: [...(condition.values || [])].map(cleanString).sort(),
          sectionPrefixes: [...(condition.sectionPrefixes || [])]
            .map((prefix) => cleanString(prefix).toLowerCase())
            .sort()
        },
        operations: (rule.operations || []).map((operation) => ({
          type: cleanString(operation.type),
          keys: [...(operation.keys || [])].map((key) => cleanString(key).toLowerCase()).sort(),
          valueType: cleanString(operation.valueType || 'hex').toLowerCase(),
          occurrence: cleanString(operation.occurrence || 'all').toLowerCase(),
          mappings: (operation.replacements || [])
            .flatMap((replacement) =>
              getReplacementSources(replacement).map(
                (from) => `${cleanString(from).toLowerCase()}->${cleanString(replacement.to).toLowerCase()}`
              )
            )
            .sort()
        }))
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))

  const mappingCount = conditionalRules.reduce(
    (count, rule) =>
      count +
      rule.operations.reduce((operationCount, operation) => operationCount + operation.mappings.length, 0),
    0
  )

  return {
    ruleCount: conditionalRules.length,
    mappingCount,
    sha256: crypto.createHash('sha256').update(JSON.stringify(conditionalRules), 'utf8').digest('hex')
  }
}

export function validateDeclaredMappingMetadata(
  source: any,
  rules: WuwaRule[],
  revision: number
): void {
  const declaredCount = source?.mappingCounts?.combinedDeclaredHashes
  const declaredSha256 = source?.mappingSha256?.combined
  if (revision >= 4 && (declaredCount === undefined || declaredSha256 === undefined)) {
    throw new Error(
      'revision 4 及以上规则必须声明 source.mappingCounts.combinedDeclaredHashes 与 source.mappingSha256.combined'
    )
  }
  if (declaredCount !== undefined || declaredSha256 !== undefined) {
    const pairs: string[] = []
    for (const rule of rules) {
      for (const operation of rule.operations || []) {
        for (const replacement of operation.replacements || []) {
          for (const from of getReplacementSources(replacement)) {
            pairs.push(`${from.toLowerCase()}->${replacement.to.toLowerCase()}`)
          }
        }
      }
    }
    if (declaredCount !== undefined) {
      if (!Number.isInteger(declaredCount) || declaredCount !== pairs.length) {
        throw new Error(
          `规则 source.mappingCounts.combinedDeclaredHashes 与实际映射数量不一致: ${declaredCount} != ${pairs.length}`
        )
      }
    }
    if (declaredSha256 !== undefined) {
      const expected = cleanString(declaredSha256).toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(expected)) {
        throw new Error('规则 source.mappingSha256.combined 必须是 64 位十六进制 SHA256')
      }
      const actual = crypto
        .createHash('sha256')
        .update(pairs.sort().join('\n') + '\n', 'utf8')
        .digest('hex')
      if (actual !== expected) {
        throw new Error(
          `规则 source.mappingSha256.combined 与实际映射不一致: ${expected} != ${actual}`
        )
      }
    }
  }
  const declaredConditionalPolicy = source?.conditionalPolicy
  if (revision >= 4 && !declaredConditionalPolicy) {
    throw new Error('revision 4 及以上规则必须声明 source.conditionalPolicy')
  }
  if (declaredConditionalPolicy !== undefined) {
    if (
      !declaredConditionalPolicy ||
      typeof declaredConditionalPolicy !== 'object' ||
      Array.isArray(declaredConditionalPolicy)
    ) {
      throw new Error('规则 source.conditionalPolicy 必须是对象')
    }
    const expected = {
      ruleCount: Number(declaredConditionalPolicy.ruleCount),
      mappingCount: Number(declaredConditionalPolicy.mappingCount),
      sha256: cleanString(declaredConditionalPolicy.sha256).toLowerCase()
    }
    if (
      !Number.isInteger(expected.ruleCount) ||
      expected.ruleCount < 0 ||
      !Number.isInteger(expected.mappingCount) ||
      expected.mappingCount < 0 ||
      !/^[0-9a-f]{64}$/.test(expected.sha256)
    ) {
      throw new Error('规则 source.conditionalPolicy 元数据无效')
    }
    const actual = computeWuwaConditionalPolicy(rules)
    if (
      actual.ruleCount !== expected.ruleCount ||
      actual.mappingCount !== expected.mappingCount ||
      actual.sha256 !== expected.sha256
    ) {
      throw new Error(
        `规则 source.conditionalPolicy 与实际条件规则不一致: ${JSON.stringify(expected)} != ${JSON.stringify(actual)}`
      );
    }
  }
}

export function validateWuwaRulesManifest(input: any): WuwaRulesManifest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('鸣潮修复规则必须是 JSON 对象')
  }
  const schemaVersion = Number(input.schemaVersion)
  const engineVersion = Number(input.engineVersion)
  const revision = Number(input.revision)
  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`不支持的规则 schemaVersion: ${input.schemaVersion}`)
  }
  if (!Number.isInteger(engineVersion) || engineVersion < 1 || engineVersion > SUPPORTED_ENGINE_VERSION) {
    throw new Error(`当前管理器不支持规则 engineVersion: ${input.engineVersion}`)
  }
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error('规则 revision 必须是正整数')
  }
  if (cleanString(input.gameId) !== 'wuthering-waves') {
    throw new Error(`规则 gameId 无效: ${input.gameId || '空'}`)
  }
  const rawRules = Array.isArray(input.rules) ? input.rules : []
  if (rawRules.length === 0 || rawRules.length > 500) {
    throw new Error('鸣潮修复规则数量无效')
  }
  const seenRuleIds = new Set<string>()
  const rules: WuwaRule[] = rawRules.map((rule: any, ruleIndex: number) => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new Error(`第 ${ruleIndex + 1} 条规则无效`)
    }
    const id = cleanString(rule.id)
    if (!id || seenRuleIds.has(id)) {
      throw new Error(`规则 id 缺失或重复: ${id || '空'}`)
    }
    seenRuleIds.add(id)
    const operations = (Array.isArray(rule.operations) ? rule.operations : []).map(
      (operation: any, index: number) => normalizeRuleOperation(operation, id, index, engineVersion)
    )
    if (operations.length === 0) {
      throw new Error(`规则 ${id} 没有可执行操作`)
    }
    const normalizedRule: WuwaRule = {
      ...rule,
      id,
      character: cleanString(rule.character),
      aliases: (Array.isArray(rule.aliases) ? rule.aliases : []).map(cleanString).filter(Boolean),
      fromVersion: cleanString(rule.fromVersion),
      toVersion: cleanString(rule.toVersion),
      operations
    }
    const when = normalizeRuleWhen(rule.when, id, engineVersion)
    if (when !== undefined) normalizedRule.when = when
    return normalizedRule
  })

  const normalized: WuwaRulesManifest = {
    ...input,
    schemaVersion,
    engineVersion,
    revision,
    toolVersion: cleanString(input.toolVersion) || String(revision),
    gameId: 'wuthering-waves',
    gameVersion: cleanString(input.gameVersion),
    updatedAt: cleanString(input.updatedAt),
    title: cleanString(input.title),
    description: cleanString(input.description),
    source:
      input.source && typeof input.source === 'object' && !Array.isArray(input.source)
        ? { ...input.source }
        : {},
    rules
  }

  validateDeclaredMappingMetadata(normalized.source, rules, revision)
  compileWuwaAssignmentMaps(normalized)
  return normalized
}

export function getReplacementSources(replacement: { from: string | string[]; to: string }): string[] {
  return Array.isArray(replacement.from) ? replacement.from : [replacement.from]
}

export function resolveAssignmentMaps(
  directMaps: Map<string, Map<string, string>>
): Map<string, Map<string, string>> {
  const resolvedMaps = new Map<string, Map<string, string>>()
  for (const [key, directMap] of directMaps) {
    const resolved = new Map<string, string>()
    for (const source of directMap.keys()) {
      const visited = new Set<string>([source])
      let target = directMap.get(source)!
      while (directMap.has(target)) {
        if (visited.has(target)) {
          throw new Error(`赋值键 ${key} 的映射存在循环: ${source}`)
        }
        visited.add(target)
        target = directMap.get(target)!
      }
      resolved.set(source, target)
    }
    resolvedMaps.set(key, resolved)
  }
  return resolvedMaps
}

export function assertNoAssignmentGraphCycles(
  graphMaps: Map<string, Map<string, { to: string; occurrences: Set<string>; ruleId: string; operationIndex: number; replacementIndex: number }>>
): void {
  for (const [key, graph] of graphMaps) {
    const states = new Map<string, number>()
    const visit = (source: string, origin: string) => {
      const state = states.get(source) || 0
      if (state === 1) {
        throw new Error(`赋值键 ${key} 的映射存在循环: ${origin}`)
      }
      if (state === 2) return
      states.set(source, 1)
      const target = graph.get(source)?.to
      if (target && graph.has(target)) visit(target, origin)
      states.set(source, 2)
    }
    for (const source of graph.keys()) visit(source, source)
  }
}

export function assertSafeFirstPresentChains(
  graphMaps: Map<string, Map<string, { to: string; occurrences: Set<string>; ruleId: string }>>,
  compiledRules: CompiledWuwaRule[]
): void {
  const rulesById = new Map<string, CompiledWuwaRule>(compiledRules.map((rule) => [rule.id, rule]))
  for (const [key, graph] of graphMaps) {
    for (const [producerSource, producerEdge] of graph) {
      const consumerEdge = graph.get(producerEdge.to)
      if (!consumerEdge || consumerEdge.occurrences.has('all')) continue
      if (!consumerEdge.occurrences.has('first-present-reverse-all')) continue
      const consumerRule = rulesById.get(consumerEdge.ruleId)
      const condition = consumerRule?.when?.anyAssignment
      if (!condition || condition.key !== key) {
        throw new Error(
          `赋值键 ${key} 的目标 ${producerEdge.to} 又被无条件作为来源，可能产生重复修复: ${producerSource}`
        )
      }
      for (const trigger of condition.values) {
        const triggerEdge = graph.get(trigger)
        const triggerRule = triggerEdge ? rulesById.get(triggerEdge.ruleId) : null
        if (
          !triggerEdge ||
          trigger === producerEdge.to ||
          triggerRule?.when ||
          triggerEdge.occurrences.has('ordered-once')
        ) {
          throw new Error(
            `赋值键 ${key} 的条件链 ${producerEdge.to} 使用了不会在首轮稳定消失的触发值: ${trigger}`
          )
        }
      }
    }
  }
}

export function buildPublicAssignmentMaps(
  allMaps: Map<string, Map<string, string>>,
  compiledRules: CompiledWuwaRule[]
): Map<string, Map<string, string>> {
  const publicMaps = new Map<string, Map<string, string>>(
    Array.from(allMaps, ([key, map]) => [key, new Map(map)])
  )
  for (const rule of compiledRules) {
    for (const operation of rule.operations) {
      if (operation.occurrence !== 'first-present-reverse-all') continue
      for (const key of operation.keys) {
        if (!publicMaps.has(key)) publicMaps.set(key, new Map())
        const publicMap = publicMaps.get(key)!
        const resolvedAllMap = allMaps.get(key)
        for (const replacement of operation.replacements) {
          const target = resolvedAllMap?.get(replacement.to) || replacement.to
          for (const source of replacement.sources) publicMap.set(source, target)
        }
      }
    }
  }
  return publicMaps
}

export function compileWuwaAssignmentMaps(manifest: WuwaRulesManifest): CompiledWuwaRules {
  const directMaps = new Map<string, Map<string, string>>()
  const graphMaps = new Map<
    string,
    Map<
      string,
      {
        to: string
        occurrences: Set<string>
        ruleId: string
        operationIndex: number
        replacementIndex: number
      }
    >
  >()
  const compiledRules: CompiledWuwaRule[] = []
  let declaredReplacementCount = 0

  for (const rule of manifest.rules || []) {
    const compiledRule: CompiledWuwaRule = {
      id: rule.id,
      when: rule.when
        ? {
            anyAssignment: {
              key: rule.when.anyAssignment.key,
              values: new Set(rule.when.anyAssignment.values),
              sectionPrefixes: (rule.when.anyAssignment.sectionPrefixes || []).map((prefix) =>
                prefix.toLowerCase()
              )
            }
          }
        : null,
      operations: []
    }

    for (const [operationIndex, operation] of (rule.operations || []).entries()) {
      const valueType = (cleanString(operation.valueType || 'hex').toLowerCase() as 'hex' | 'uint')
      const occurrence = (cleanString(operation.occurrence || 'all').toLowerCase() as
        | 'all'
        | 'ordered-once'
        | 'first-present-reverse-all')
      const compiledOperation: CompiledWuwaOperation = {
        type: operation.type,
        keys: operation.keys || [],
        keySet: new Set(operation.keys || []),
        valueType,
        occurrence,
        replacements: (operation.replacements || []).map((replacement) => ({
          ...replacement,
          sources: getReplacementSources(replacement)
        }))
      }
      compiledRule.operations.push(compiledOperation)

      for (const key of compiledOperation.keys) {
        if (!graphMaps.has(key)) graphMaps.set(key, new Map())
        const graph = graphMaps.get(key)!
        if (occurrence === 'all' && !directMaps.has(key)) directMaps.set(key, new Map())
        const directMap = directMaps.get(key)

        for (const [replacementIndex, replacement] of compiledOperation.replacements.entries()) {
          for (const source of replacement.sources) {
            if (source === replacement.to) {
              if (occurrence !== 'all') {
                throw new Error(`赋值键 ${key} 的 ${occurrence} 映射存在自循环: ${source}`)
              }
              continue
            }
            declaredReplacementCount++
            const existingGraphEdge = graph.get(source)
            if (existingGraphEdge && existingGraphEdge.to !== replacement.to) {
              throw new Error(`赋值键 ${key} 的值 ${source} 存在冲突目标`)
            }
            if (existingGraphEdge && existingGraphEdge.occurrences.has(occurrence) === false) {
              throw new Error(`赋值键 ${key} 的值 ${source} 不能同时使用不同 occurrence`)
            }
            if (existingGraphEdge) {
              existingGraphEdge.occurrences.add(occurrence)
            } else {
              graph.set(source, {
                to: replacement.to,
                occurrences: new Set([occurrence]),
                ruleId: rule.id,
                operationIndex,
                replacementIndex
              })
            }
            if (occurrence === 'all' && directMap) {
              const existing = directMap.get(source)
              if (existing && existing !== replacement.to) {
                throw new Error(`赋值键 ${key} 的值 ${source} 存在冲突目标`)
              }
              directMap.set(source, replacement.to)
            }
          }
        }
      }
    }
    compiledRules.push(compiledRule)
  }

  assertNoAssignmentGraphCycles(graphMaps)
  assertSafeFirstPresentChains(graphMaps, compiledRules)

  for (const [key, graph] of graphMaps) {
    const incoming = new Map<string, Array<{ source: string; edge: any }>>()
    for (const [source, edge] of graph) {
      if (!incoming.has(edge.to)) incoming.set(edge.to, [])
      incoming.get(edge.to)!.push({ source, edge })
    }
    for (const [source, edge] of graph) {
      if (!edge.occurrences.has('ordered-once')) continue
      if (graph.has(edge.to) || incoming.has(source)) {
        throw new Error(`赋值键 ${key} 的 ordered-once 映射不能参与链式或循环替换: ${source}`)
      }
    }
  }

  const allMaps = resolveAssignmentMaps(directMaps)
  return {
    maps: buildPublicAssignmentMaps(allMaps, compiledRules),
    allMaps,
    directMaps,
    rules: compiledRules,
    hasConditionalRules: compiledRules.some((rule) => rule.when !== null),
    hasFirstPresentReverseAllRules: compiledRules.some((rule) =>
      rule.operations.some((operation) => operation.occurrence === 'first-present-reverse-all')
    ),
    declaredReplacementCount
  }
}

export function decodeIniBuffer(buffer: Buffer | Uint8Array): {
  original: Buffer
  content: string
  encode: (updated: string) => Buffer
} {
  const original = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const byteOrder =
    original.length >= 2 && original[0] === 255 && original[1] === 254
      ? 'utf16le'
      : original.length >= 2 && original[0] === 254 && original[1] === 255
      ? 'utf16be'
      : 'bytes'

  const swapUtf16Bytes = (source: Buffer): Buffer => {
    const swapped = Buffer.from(source)
    for (let index = 0; index + 1 < swapped.length; index += 2) {
      const first = swapped[index]
      swapped[index] = swapped[index + 1]
      swapped[index + 1] = first
    }
    return swapped
  }

  const content =
    byteOrder === 'utf16le'
      ? original.toString('utf16le')
      : byteOrder === 'utf16be'
      ? swapUtf16Bytes(original).toString('utf16le')
      : original.toString('latin1')

  const encode = (updated: string): Buffer =>
    byteOrder === 'utf16le'
      ? Buffer.from(updated, 'utf16le')
      : byteOrder === 'utf16be'
      ? swapUtf16Bytes(Buffer.from(updated, 'utf16le'))
      : Buffer.from(updated, 'latin1')

  return { original, content, encode }
}

export function stripLeadingBom(line: string): string {
  if (line.startsWith('\uFEFF')) return line.slice(1)
  if (line.startsWith('ï»¿')) return line.slice(3)
  return line
}

export function parseIniAssignments(content: string): Array<{ key: string; value: string; section: string }> {
  const assignments: Array<{ key: string; value: string; section: string }> = []
  const linePattern = /([^\r\n]*)(?:\r\n|\n|\r|$)/g
  let currentSection = ''
  let firstLine = true
  let match: RegExpExecArray | null
  while ((match = linePattern.exec(content))) {
    if (match[0] === '') break
    let line = match[1]
    if (firstLine) {
      line = stripLeadingBom(line)
      firstLine = false
    }
    const sectionMatch = line.match(/^[ \t]*\[([^\]\r\n]+)\]/)
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim()
      continue
    }
    const assignmentMatch = line.match(
      /^[ \t]*([a-z0-9_$.-]+)[ \t]*=[ \t]*([^;#\r\n]*?)[ \t]*(?:[;#].*)?$/i
    )
    if (!assignmentMatch) continue
    assignments.push({
      key: assignmentMatch[1].toLowerCase(),
      value: assignmentMatch[2].trim(),
      section: currentSection
    })
  }
  return assignments
}

export function ruleMatchesOriginalAssignments(
  compiledRule: CompiledWuwaRule,
  assignments: Array<{ key: string; value: string; section: string }>
): boolean {
  if (!compiledRule.when) return true
  const condition = compiledRule.when.anyAssignment
  return assignments.some((assignment) => {
    if (assignment.key !== condition.key) return false
    if (condition.sectionPrefixes.length > 0) {
      const section = assignment.section.toLowerCase()
      if (!section || !condition.sectionPrefixes.some((prefix) => section.startsWith(prefix))) {
        return false
      }
    }
    const value = condition.key === 'hash' ? assignment.value.toLowerCase() : assignment.value
    return condition.values.has(value)
  })
}

export function compileActiveAllMaps(
  activeRules: CompiledWuwaRule[]
): Map<string, Map<string, string>> {
  const directMaps = new Map<string, Map<string, string>>()
  for (const rule of activeRules) {
    for (const operation of rule.operations) {
      if (operation.occurrence !== 'all') continue
      for (const key of operation.keys) {
        if (!directMaps.has(key)) directMaps.set(key, new Map())
        const directMap = directMaps.get(key)!
        for (const replacement of operation.replacements) {
          for (const source of replacement.sources) {
            if (source !== replacement.to) directMap.set(source, replacement.to)
          }
        }
      }
    }
  }
  return resolveAssignmentMaps(directMaps)
}

export function compileFirstPresentReverseMap(
  activeRules: CompiledWuwaRule[],
  originalAssignments: Array<{ key: string; value: string; section: string }>,
  allMaps: Map<string, Map<string, string>>
): Map<string, string> {
  const originalHashes = new Set(
    originalAssignments
      .filter((assignment) => assignment.key === 'hash' && HASH_PATTERN.test(assignment.value))
      .map((assignment) => assignment.value.toLowerCase())
  )
  const selectedMap = new Map<string, string>()
  const resolvedAllHashes = allMaps.get('hash')
  for (const rule of activeRules) {
    for (const operation of rule.operations) {
      if (operation.occurrence !== 'first-present-reverse-all') continue
      for (const replacement of operation.replacements) {
        let selectedSource: string | null = null
        for (let index = replacement.sources.length - 1; index >= 0; index--) {
          const source = replacement.sources[index]
          if (originalHashes.has(source)) {
            selectedSource = source
            break
          }
        }
        if (!selectedSource) continue
        const target = resolvedAllHashes?.get(replacement.to) || replacement.to
        const existing = selectedMap.get(selectedSource)
        if (existing && existing !== target) {
          throw new Error(`赋值键 hash 的值 ${selectedSource} 存在冲突目标`)
        }
        selectedMap.set(selectedSource, target)
      }
    }
  }
  return selectedMap
}

export function normalizeCurrentValue(value: string, valueType: string): string | null {
  const trimmed = value.trim()
  if (valueType === 'uint') return UINT_PATTERN.test(trimmed) ? trimmed : null
  return HASH_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null
}

export function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function sortAssignmentChanges(changes: AssignmentChange[]): AssignmentChange[] {
  return changes.sort((left, right) => {
    return (
      compareStableText(left.key, right.key) ||
      compareStableText(left.from, right.from) ||
      compareStableText(left.to, right.to)
    )
  })
}

export function transformWuwaIniBuffer(
  buffer: Buffer | Uint8Array,
  compiled: CompiledWuwaRules
): {
  changed: boolean
  replacementCount: number
  changes: AssignmentChange[]
  buffer: Buffer
} {
  const decoded = decodeIniBuffer(buffer)
  const hasCompiledRules = Array.isArray(compiled?.rules)
  const hasConditionalRules =
    hasCompiledRules &&
    (typeof compiled.hasConditionalRules === 'boolean'
      ? compiled.hasConditionalRules
      : compiled.rules.some((rule) => rule.when))
  const hasFirstPresentReverseAllRules =
    hasCompiledRules &&
    (typeof compiled.hasFirstPresentReverseAllRules === 'boolean'
      ? compiled.hasFirstPresentReverseAllRules
      : compiled.rules.some((rule) =>
          rule.operations.some((operation) => operation.occurrence === 'first-present-reverse-all')
        ))
  const needsOriginalAssignments = hasConditionalRules || hasFirstPresentReverseAllRules
  const originalAssignments = needsOriginalAssignments ? parseIniAssignments(decoded.content) : []
  const activeRules = hasCompiledRules
    ? hasConditionalRules
      ? compiled.rules.filter((rule) => ruleMatchesOriginalAssignments(rule, originalAssignments))
      : compiled.rules
    : []
  const allMaps = hasCompiledRules
    ? hasConditionalRules
      ? compileActiveAllMaps(activeRules)
      : compiled.allMaps || compiled.maps
    : compiled?.maps || new Map()
  const firstPresentReverseMap = hasFirstPresentReverseAllRules
    ? compileFirstPresentReverseMap(activeRules, originalAssignments, allMaps)
    : new Map<string, string>()
  const orderedStates = activeRules.flatMap((rule) =>
    rule.operations
      .filter((operation) => operation.occurrence === 'ordered-once')
      .map((operation) => ({
        operation,
        consumed: new Array(operation.replacements.length).fill(false)
      }))
  )

  let replacementCount = 0
  const changeCounts = new Map<string, AssignmentChange>()
  const updated = decoded.content.replace(
    ASSIGNMENT_PATTERN,
    (line, indent, rawKey, separator, rawValue, comment, newline) => {
      const key = rawKey.toLowerCase()
      let currentValue = rawValue.trim()
      let lineChanged = false
      const normalizedOriginal = key === 'hash' ? normalizeCurrentValue(currentValue, 'hex') : currentValue
      const firstPresentReplacement =
        key === 'hash' && normalizedOriginal !== null
          ? firstPresentReverseMap.get(normalizedOriginal)
          : undefined
      if (firstPresentReplacement && firstPresentReplacement !== normalizedOriginal) {
        currentValue = firstPresentReplacement
        replacementCount++
        lineChanged = true
      } else {
        const keyMap = allMaps.get(key)
        const replacement = normalizedOriginal === null ? undefined : keyMap?.get(normalizedOriginal)
        if (replacement && replacement !== normalizedOriginal) {
          currentValue = replacement
          replacementCount++
          lineChanged = true
        }
      }

      for (const state of orderedStates) {
        const operation = state.operation
        if (!operation.keySet.has(key)) continue
        const normalizedCurrent = normalizeCurrentValue(currentValue, operation.valueType)
        if (normalizedCurrent === null) continue
        const replacementIndex = operation.replacements.findIndex((replacement2, index) => {
          if (state.consumed[index]) return false
          return (
            replacement2.sources.includes(normalizedCurrent) || replacement2.to === normalizedCurrent
          )
        })
        if (replacementIndex < 0) continue
        const replacement = operation.replacements[replacementIndex]
        state.consumed[replacementIndex] = true
        if (replacement.to !== normalizedCurrent) {
          currentValue = replacement.to
          replacementCount++
          lineChanged = true
        }
      }

      if (!lineChanged) return line
      const finalValue =
        key === 'hash' ? normalizeCurrentValue(currentValue, 'hex') || currentValue : currentValue
      const changeKey = `${key}\0${normalizedOriginal}\0${finalValue}`
      const existingChange = changeCounts.get(changeKey)
      if (existingChange) {
        existingChange.occurrenceCount++
      } else {
        changeCounts.set(changeKey, {
          key,
          from: normalizedOriginal ?? '',
          to: finalValue,
          occurrenceCount: 1
        })
      }
      const leading = rawValue.match(/^[ \t]*/)?.[0] || ''
      const trailing = rawValue.match(/[ \t]*$/)?.[0] || ''
      return `${indent}${rawKey}${separator}${leading}${currentValue}${trailing}${comment}${newline}`
    }
  )

  return {
    changed: replacementCount > 0,
    replacementCount,
    changes: sortAssignmentChanges(Array.from(changeCounts.values())),
    buffer: replacementCount === 0 ? decoded.original : decoded.encode(updated)
  }
}

export function isWuwaFixBackupFile(filePath: string): boolean {
  const name = path.basename(filePath)
  const lowered = name.toLowerCase()
  return (
    lowered.includes(BACKUP_MARKER) ||
    lowered.endsWith('.qaqm-persistbak') ||
    lowered.startsWith('disabled_backup_') ||
    lowered.startsWith('disabled ') ||
    lowered.startsWith('desktop') ||
    lowered.startsWith('ntuser')
  )
}

export function collectIniFiles(rootDir: string, stats: WuwaFixDirectoryStats): string[] {
  const files: string[] = []
  function walk(currentDir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch (error: any) {
      stats.failedFiles++
      stats.errors.push(`${currentDir}: ${error?.message || error}`)
      return
    }
    entries.sort((left, right) => compareStableText(left.name, right.name))
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.ini')) {
        if (isWuwaFixBackupFile(fullPath)) {
          stats.skippedBackupFiles++
        } else {
          files.push(fullPath)
        }
      }
    }
  }
  walk(rootDir)
  return files.sort((left, right) => {
    const leftRelative = path.relative(rootDir, left).split(path.sep).join('/')
    const rightRelative = path.relative(rootDir, right).split(path.sep).join('/')
    return compareStableText(leftRelative, rightRelative)
  })
}

export function applyWuwaFixRulesToDirectory({
  rootDir,
  manifest,
  dryRun = false,
  beforeWrite = null
}: {
  rootDir: string
  manifest: any
  dryRun?: boolean
  beforeWrite?: ((iniPath: string) => void) | null
}): {
  manifest: WuwaRulesManifest
  declaredReplacementCount: number
  stats: WuwaFixDirectoryStats
  files: WuwaFixFileResult[]
} {
  const normalizedRoot = path.resolve(rootDir || '')
  if (!normalizedRoot || !fs.existsSync(normalizedRoot) || !fs.statSync(normalizedRoot).isDirectory()) {
    throw new Error(`修复目录不存在: ${rootDir || '空'}`)
  }
  const normalizedManifest = validateWuwaRulesManifest(manifest)
  const compiled = compileWuwaAssignmentMaps(normalizedManifest)
  const stats: WuwaFixDirectoryStats = {
    scannedFiles: 0,
    modifiedFiles: 0,
    replacementCount: 0,
    skippedBackupFiles: 0,
    failedFiles: 0,
    errors: [],
    files: []
  }
  const files = collectIniFiles(normalizedRoot, stats)
  for (const filePath of files) {
    stats.scannedFiles++
    try {
      const original = fs.readFileSync(filePath)
      const transformed = transformWuwaIniBuffer(original, compiled)
      if (!transformed.changed) continue
      if (!dryRun) {
        if (beforeWrite) beforeWrite(filePath)
        fs.writeFileSync(filePath, transformed.buffer)
      }
      stats.modifiedFiles++
      stats.replacementCount += transformed.replacementCount
      stats.files.push({
        relativePath: path.relative(normalizedRoot, filePath).split(path.sep).join('/'),
        replacementCount: transformed.replacementCount,
        changes: transformed.changes
      })
    } catch (error: any) {
      stats.failedFiles++
      stats.errors.push(`${filePath}: ${error?.message || error}`)
    }
  }
  return {
    manifest: normalizedManifest,
    declaredReplacementCount: compiled.declaredReplacementCount,
    stats,
    files: stats.files
  }
}

export function readWuwaRulesFile(filePath: string): WuwaRulesManifest {
  const text = fs.readFileSync(filePath, 'utf8')
  return validateWuwaRulesManifest(JSON.parse(text))
}

export class WuwaFixEngine {
  public validateManifest(manifest: any): WuwaRulesManifest {
    return validateWuwaRulesManifest(manifest)
  }

  public compile(manifest: WuwaRulesManifest): CompiledWuwaRules {
    return compileWuwaAssignmentMaps(manifest)
  }

  public transformBuffer(buffer: Buffer | Uint8Array, compiled: CompiledWuwaRules) {
    return transformWuwaIniBuffer(buffer, compiled)
  }

  public applyToDirectory(options: {
    rootDir: string
    manifest: any
    dryRun?: boolean
    beforeWrite?: ((iniPath: string) => void) | null
  }) {
    return applyWuwaFixRulesToDirectory(options)
  }

  public readRulesFile(filePath: string): WuwaRulesManifest {
    return readWuwaRulesFile(filePath)
  }
}
