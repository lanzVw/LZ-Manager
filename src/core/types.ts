export interface GameConfig {
  id: string
  name: string
  shortName: string
  description?: string
  gamePath: string
  modFolderPath: string
  modLoaderPath: string
  dx12LauncherPath?: string
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
}

export interface PresetModRef {
  characterName: string
  modName: string
  enabled: boolean
}

export interface Preset {
  id: string
  name: string
  description?: string
  mods: PresetModRef[]
  createdAt: string
  updatedAt: string
}

export interface GamePresets {
  presets: Preset[]
  activePresetId?: string | null
}

export interface PresetsData {
  presetsByGame: Record<string, GamePresets>
}

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


