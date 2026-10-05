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
  characters?: string[]
}

export interface AppConfig {
  activeGameId: string
  games: GameConfig[]
  characterUsage: Record<string, number>
  serverUrl?: string
  enableOptionAExclusive?: boolean // 角色单选互斥
  overlayHotkey?: string // 默认 Ctrl+F
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
  metadata: {
    author?: string
    version?: string
    description?: string
    checkTime?: string
    lastUpdated?: string
  }
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

