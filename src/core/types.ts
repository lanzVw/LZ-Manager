export interface GameConfig {
  id: string
  name: string
  shortName: string
  description?: string
  gamePath: string
  modFolderPath: string
  modLoaderPath: string
  dx12LauncherPath?: string
  officialLauncherPath?: string
  launchMode?: string
  supportedLaunchModes?: string[]
  launchArgs?: string
  characters?: string[]
  hidden?: boolean
}

export interface AppConfig {
  activeGameId: string
  games: GameConfig[]
  characterUsage: Record<string, number>
  serverUrl?: string
  enableOptionAExclusive?: boolean // 角色单选互斥
  overlayHotkey?: string // 默认 Ctrl+F
  persistBridgeEnabled?: boolean // 保留 Mod 设定数值 (Persist Bridge)
  persistBridgeCacheSize?: number // 最近缓存 Mod 数量 (默认 12)
  closeAction?: 'quit' | 'minimize_to_tray' // 点击右上角关闭按钮行为: 'quit' (彻底退出) | 'minimize_to_tray' (最小化到托盘)
  closePromptRemembered?: boolean // 是否已记住关闭选择并不再弹窗提示
  palette?: 'default' | 'clay'
}

export interface AppearanceSection {
  id: string // "base" 或 "custom:uuid"
  sectionId: string
  name: string
  nameZh?: string
  nameEn?: string
  kind: 'base' | 'custom' | 'skin'
  official: boolean
  coverUrl?: string | null
  totalCount?: number
  enabledCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface ModUpdateInfo {
  hasUpdate: boolean
  remoteVersion?: string
  remoteDate?: number
  changelog?: string
  downloadUrl?: string
}

export interface ModItem {
  id: string
  name: string
  folderName: string
  characterName: string
  enabled: boolean
  coverPath: string | null
  previewImages: string[]
  fullPath: string
  hasIni: boolean
  mtime: number
  appearanceSectionId?: string
  modBroken?: boolean
  brokenReason?: string
  hasUpdate?: boolean
  updateInfo?: ModUpdateInfo
  /** 是否为基底 Mod（提供 namespace 给其他 Mod 消费） */
  isBaseMod?: boolean
  baseModNamespace?: string
}

export interface ModDetailedInfo {
  id: string
  name: string
  folderName: string
  characterName: string
  enabled: boolean
  fullPath: string
  images: { path: string; name: string; isCover: boolean }[]
  coverPath: string | null
  iniFiles: { name: string; fullPath: string; size: number }[]
  totalSize: number
  fileCount: number
  mtime: number
  birthtime: number
  appearanceSectionId?: string
  metadata: {
    author?: string
    version?: string
    description?: string
    checkTime?: string
    lastUpdated?: string
    sourceUrl?: string
    gamebananaUrl?: string
    url?: string
    modId?: number
    source?: string
    appearanceSectionId?: string
    modBroken?: boolean
    brokenReason?: string
    brokenDate?: string
    [key: string]: any
  }
  persistInfo?: ModPersistInfo
  /** 基底 Mod 识别结果（非基底 Mod 为 undefined） */
  baseModInfo?: BaseModInfo
}

export interface PresetModRef {
  characterName: string
  modName: string
  enabled: boolean
}

export type PresetApplyMode = 'replace' | 'merge'

export interface Preset {
  id: string
  name: string
  description?: string
  mods: PresetModRef[]
  createdAt: string
  updatedAt: string
  /** 最近一次完整应用成功的时间；部分失败不写入，避免界面误报"已生效" */
  lastAppliedAt?: string
}

export interface GamePresets {
  presets: Preset[]
  activePresetId?: string | null
}

export interface PresetsData {
  presetsByGame: Record<string, GamePresets>
}

export interface PresetMutationResult {
  success: boolean
  preset?: Preset
  error?: string
}

export interface PresetPruneResult extends PresetMutationResult {
  removed: number
}

export interface PresetApplyFailure {
  characterName: string
  modName: string
  error?: string
}

export interface PresetApplyResult {
  success: boolean
  applied: number
  enabled: number
  disabled: number
  failed: PresetApplyFailure[]
  missing: PresetModRef[]
  mode: PresetApplyMode
  message?: string
}

export type PresetChangeReason =
  | 'created'
  | 'updated'
  | 'duplicated'
  | 'overwritten'
  | 'pruned'
  | 'deleted'
  | 'applied'

export interface GBFilterOption {
  id: number
  name: string
  count?: number
}

export interface ResourceCollision {
  hash: string
  type: 'texture' | 'shader' | 'index_buffer' | 'vertex_buffer' | 'override'
  sectionA: string
  sectionB: string
  modA: string
  modB: string
  fileA: string
  fileB: string
}

export interface ModConflictSummary {
  hasConflict: boolean
  modName: string
  characterName: string
  conflictingMods: string[]
  collisions: ResourceCollision[]
}

export interface CharacterConflictReport {
  characterName: string
  totalEnabledMods: number
  hasConflict: boolean
  conflictsByMod: Record<string, ModConflictSummary>
  allCollisions: ResourceCollision[]
}

export interface EnvironmentStatus {
  gameId: string
  gameName: string
  gamePath: string
  gameDir: string
  gameExeExists: boolean
  d3d11Exists: boolean
  dxgiExists: boolean
  d3dxIniExists: boolean
  xxmiRuntimeExists: boolean
  xxmiRuntimePath?: string
  modFolderExists: boolean
  ready: boolean
  status: 'ready' | 'missing_dll' | 'missing_game' | 'not_configured'
  message: string
}

export interface ModPersistVariable {
  name: string
  canonicalName: string
  defaultValue: string
  currentValue: string
  allowedValues?: string[]
  keybind?: string
  iniFile: string
  alias?: string
  valueLabels?: Record<string, string>
}

export interface ModPersistInfo {
  hasPersist: boolean
  hash: string
  namespace: string
  stateFileName: string
  variables: ModPersistVariable[]
}

/** 基底 Mod 的着色器缓存开关状态（文件位于 Mod 根目录 / DISABLED 子目录） */
export interface ShaderCacheState {
  /** 根目录存在 ShaderCacheSettings.ini */
  installed: boolean
  /** installed 且解析出的 cache_shaders === '1' */
  active: boolean
  /** [Rendering] cache_shaders 原值，未解析到为 null */
  value: string | null
  /** 根目录生效文件绝对路径 */
  activePath: string | null
  /** DISABLED/ShaderCacheSettings.ini 模板绝对路径 */
  templatePath: string | null
}

export interface BaseModInfo {
  isBaseMod: boolean
  /** ini 中 namespace = ...；显式标记但无 namespace 时为空串 */
  namespace: string
  /** mod.json.baseMod === true */
  explicit: boolean
  shaderCache: ShaderCacheState
}

export interface ShaderCacheStats {
  /** 缓存目录绝对路径；envRoot 缺失或路径不安全时为空串 */
  path: string
  exists: boolean
  fileCount: number
  totalBytes: number
  lastModified: number
  error?: string
}

export interface D3dxCacheRules {
  d3dxIniPath: string
  exists: boolean
  includeRecursiveMods: boolean
  excludesDisabled: boolean
  /** 未配置时回退 'ShaderCache' */
  cacheDirectory: string
  cacheDirectoryConfigured: boolean
  /** [Rendering] cache_shaders 的值；未配置为 null */
  globalCacheShaders: string | null
}

export interface BaseModStatus {
  modFullPath: string
  namespace: string
  explicit: boolean
  enabled: boolean
  shaderCache: ShaderCacheState
  cacheStats: ShaderCacheStats
  d3dx: D3dxCacheRules
  dependents?: BaseModDependent[]
  scanTruncated?: boolean
  duplicates?: string[]
  health?: BaseModHealth
}

export type BaseModFixAction = 'enable-base-mod'

export type BaseModHealthCheckId =
  | 'namespace-missing'
  | 'settings-missing'
  | 'cache-file-not-active'
  | 'base-disabled-with-dependents'
  | 'base-disabled-cache-inert'
  | 'dependents-enabled'
  | 'duplicate-base-mods'
  | 'd3dx-missing'
  | 'include-recursive-missing'
  | 'exclude-disabled-missing'
  | 'global-cache-enabled'
  | 'cache-directory-default'
  | 'cache-path-error'
  | 'cache-dir-missing'
  | 'cache-empty'
  | 'scan-truncated'

export interface BaseModHealthCheck {
  id: BaseModHealthCheckId
  severity: 'error' | 'warning' | 'info'
  message: string
  detail?: string
  fixAction?: BaseModFixAction
}

export interface BaseModHealth {
  /** 没有 error 级问题 */
  ok: boolean
  checks: BaseModHealthCheck[]
}

export interface BaseModDependent {
  fullPath: string
  characterName: string
  /** 已剥离 DISABLED_ 前缀 */
  modName: string
  /** 磁盘目录名，保留 DISABLED_ 前缀 */
  folderName: string
  enabled: boolean
  /** 命中的 ini 相对路径（最多保留 10 条） */
  matchedFiles: string[]
}

export interface BaseModDisableGuard {
  namespace: string
  enabledDependents: BaseModDependent[]
  scanTruncated: boolean
  needsConfirm: boolean
  reason?: 'dependents' | 'scan-truncated' | 'namespace-missing'
}

export interface ToggleModResult {
  success: boolean
  error?: string
  cancelled?: boolean
  needsConfirm?: boolean
  namespace?: string
  dependents?: BaseModDependent[]
  scanTruncated?: boolean
  /** 目录改名后的新绝对路径（启用/停用都会改文件夹名） */
  newFullPath?: string
}

export interface SetShaderCacheResult {
  success: boolean
  state?: ShaderCacheState
  error?: string
}

export interface ClearShaderCacheResult {
  success: boolean
  deletedCount: number
  failedCount: number
  errors: string[]
  error?: string
}

/**
 * 市场安装时命中的本地已有 Mod
 * 为什么：GameBanana 的文件夹名取自 Mod 标题，作者改标题就会变成"新 Mod"，
 * 只有 modId 是稳定身份，命中后必须走覆盖安装而不是再建一份
 */
export interface ModInstallTarget {
  fullPath: string
  folderName: string
  enabled: boolean
  modId: number
  version?: string
}

export interface GameBananaInstallResult {
  success: boolean
  cancelled?: boolean
  error?: string
  modName?: string
  installedPath?: string
  previewSaved?: boolean
  format?: string
  /** update 覆盖了已有 Mod，install 是全新安装，unknown 表示未命中本地记录 */
  action?: 'install' | 'update' | 'unknown'
  /** 被覆盖的旧 Mod 目录（已删除） */
  replacedPath?: string
  /** 覆盖安装时旧目录里的启用状态被继承下来 */
  preservedEnabled?: boolean
  /**
   * 其余同 modId 的历史副本（历史 bug 产物，多份同源）
   * 为什么只回报不删除：里面可能有用户自己改过的 ini，误删代价太大
   */
  duplicates?: ModInstallTarget[]
  /**
   * 更新失败且旧版本未能自动恢复时，旧版本的备份目录路径
   * 为什么必须回传：这份备份是用户旧版本的唯一副本，只写日志用户看不到
   */
  backupPath?: string
}


