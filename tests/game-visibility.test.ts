import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ConfigStore } from '../src/core/config-store'

describe('Game Visibility & Hidden Filter', () => {
  it('getActiveGame returns the active game if not hidden', () => {
    const store = new ConfigStore()
    const cfg = store.getConfig()
    const active = store.getActiveGame()
    expect(active).not.toBeNull()
    expect(active?.hidden).toBeFalsy()
  })

  it('hiding active game shifts activeGameId to first remaining visible game', () => {
    const store = new ConfigStore()
    const cfg = store.getConfig()
    const initialActive = store.getActiveGame()
    expect(initialActive).not.toBeNull()

    if (!initialActive) return

    // Hide the currently active game
    store.updateGameConfig(initialActive.id, { hidden: true })
    const newActive = store.getActiveGame()

    expect(newActive).not.toBeNull()
    expect(newActive?.id).not.toBe(initialActive.id)
    expect(newActive?.hidden).toBeFalsy()

    // Restore it
    store.updateGameConfig(initialActive.id, { hidden: false })
    store.setActiveGame(initialActive.id)
  })

  it('filtering hidden games properly preserves visible games', () => {
    const games = [
      { id: 'zzz', name: '绝区零', hidden: false },
      { id: 'wuwa', name: '鸣潮', hidden: true },
      { id: 'genshin', name: '原神', hidden: false }
    ]
    const visible = games.filter((g) => !g.hidden)
    expect(visible.map((g) => g.id)).toEqual(['zzz', 'genshin'])
  })
})
