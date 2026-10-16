"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { Readable, Transform } = require("stream");
const { pipeline } = require("stream/promises");

const execFileAsync = promisify(execFile);
import { getCharactersForGame, normalizeCharacterName } from "./characters-data";
import { autoTranslateModConfig } from "./mod-translator";

/**
 * P0 Verified Exact GameBanana Game ID Mappings
 */
const GAME_ID_MAP = Object.freeze({
  "genshin": 8552,
  "honkai-star-rail": 18366,
  "zzz": 19567,
  "wuthering-waves": 20357,
  "endfield": 21842,
  "honkai-impact-3rd": 10349
});

/**
 * Game aliases mapped to standard GameBanana Game IDs
 */
const GAME_ALIASES = Object.freeze({
  "gs": 8552,
  "gi": 8552,
  "genshin-impact": 8552,
  "hsr": 18366,
  "starrail": 18366,
  "star-rail": 18366,
  "honkai-starrail": 18366,
  "zenless": 19567,
  "zenless-zone-zero": 19567,
  "ww": 20357,
  "wuwa": 20357,
  "wutheringwaves": 20357,
  "ak-endfield": 21842,
  "arknights-endfield": 21842,
  "hi3": 10349,
  "honkai3rd": 10349,
  "honkai-3rd": 10349
});

/**
 * Default 7za executable location in QAQManager
 */
const DEFAULT_7ZA_PATH = path.join(
  "F:",
  "XXMI",
  "QAQMAN",
  "QAQManagerV4",
  "resources",
  "app.asar.unpacked",
  "node_modules",
  "7zip-bin",
  "win",
  "x64",
  "7za.exe"
);

/**
 * Archive magic bytes definitions
 */
const MAGIC_ZIP = [0x50, 0x4b]; // PK\x03\x04 or PK\x05\x06 or PK\x07\x08
const MAGIC_7Z = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
const MAGIC_RAR = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]; // RAR 4 or 5

const API_BASE_URL = "https://gamebanana.com/apiv11";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LZ-Manager/1.0.0";

/**
 * Resolve game input to GameBanana numeric Game ID
 * @param {string|number} gameInput
 * @returns {number}
 */
function resolveGameBananaGameId(gameInput) {
  if (typeof gameInput === "number" && Number.isFinite(gameInput) && gameInput > 0) {
    return gameInput;
  }
  const raw = String(gameInput || "").trim().toLowerCase();
  if (GAME_ID_MAP[raw]) {
    return GAME_ID_MAP[raw];
  }
  if (GAME_ALIASES[raw]) {
    return GAME_ALIASES[raw];
  }
  if (/^\d+$/.test(raw)) {
    return parseInt(raw, 10);
  }
  throw new Error(`不支持的游戏标识: "${gameInput}"。有效选项: ${Object.keys(GAME_ID_MAP).join(", ")}`);
}

/**
 * Resolve 7za executable path with fallback lookup
 * @param {string} [customPath]
 * @returns {string}
 */
function resolve7zaPath(customPath = null) {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }
  const candidates = [
    path.join(__dirname, "..", "..", "resources", "binaries", "7za.exe"),
    path.join(__dirname, "resources", "binaries", "7za.exe"),
    path.join(process.cwd(), "resources", "binaries", "7za.exe"),
    path.join(process.resourcesPath || "", "binaries", "7za.exe"),
    path.join(process.resourcesPath || "", "7za.exe"),
    path.join(__dirname, "..", "..", "..", "QAQManagerV4", "resources", "app.asar.unpacked", "node_modules", "7zip-bin", "win", "x64", "7za.exe"),
    "7za.exe"
  ];
  for (const cand of candidates) {
    if (cand && fs.existsSync(cand)) {
      return cand;
    }
  }
  // 找不到时必须返回 null 让调用方明确报错，而不是返回一个肯定不存在的路径
  return null;
}

function resolveUnrarPath(customPath = null) {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }
  const candidates = [
    path.join(__dirname, "..", "..", "resources", "binaries", "UnRAR.exe"),
    path.join(__dirname, "resources", "binaries", "UnRAR.exe"),
    path.join(process.cwd(), "resources", "binaries", "UnRAR.exe"),
    path.join(process.resourcesPath || "", "binaries", "UnRAR.exe"),
    path.join(process.resourcesPath || "", "UnRAR.exe"),
    path.join(__dirname, "..", "..", "..", "QAQManagerV4", "resources", "UnRAR.exe"),
    "UnRAR.exe"
  ];
  return candidates.find((c) => c && fs.existsSync(c)) || null;
}

/**
 * 为什么：清理软件（如 Wise Care 365 / 360 等）默认只扫 %TEMP% 与 Windows 临时目录，
 * 迁移到应用自有缓存目录（%LOCALAPPDATA%\QAQManager\cache\gb_downloads）可避免下载中的文件被外部误删
 */
function resolveDownloadRoot() {
  const baseDir = process.env.LOCALAPPDATA || process.env.APPDATA || os.tmpdir();
  return path.join(baseDir, "QAQManager", "cache", "gb_downloads");
}

/**
 * Safe sleep utility
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * HTTP fetch with 15s timeout and 3 retries
 * @param {string} url
 * @param {object} options
 * @param {number} maxRetries
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options: any = {}, maxRetries = 3, timeoutMs = 15000) {
  const mergedHeaders = Object.assign(
    {
      "User-Agent": DEFAULT_USER_AGENT,
      "Accept": "application/json, text/plain, */*"
    },
    options.headers || {}
  );

  let lastError: any = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers: mergedHeaders,
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) {
        const httpError: any = new Error(`HTTP ${response.status} ${response.statusText} (${url})`);
        httpError.status = response.status;
        // 4xx（除 429 限流）是请求本身的问题，重试只会无意义地重复打 API、加剧限速
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw httpError;
        }
        // 服务端错误或限流：可重试，429 优先遵循 Retry-After
        if (attempt < maxRetries) {
          const retryAfter = parseInt(response.headers.get("retry-after") || "0", 10);
          const waitMs = retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : 500 * attempt;
          await sleep(waitMs);
          continue;
        }
        throw httpError;
      }
      return response;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      // 明确不可重试的 4xx：立即抛出，不再 sleep 重试
      if (err && typeof err.status === "number" && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err;
      }
      if (attempt < maxRetries) {
        await sleep(500 * attempt);
      }
    }
  }
  const finalError: any = new Error(`请求 GameBanana API 失败 (已重试 ${maxRetries} 次): ${lastError?.message || lastError}`);
  if (lastError && typeof lastError.status === "number") finalError.status = lastError.status;
  throw finalError;
}

/**
 * Search GameBanana member by username to find their Member ID
 * @param {string} username
 * @returns {Promise<number|null>}
 */
async function findMemberIdByName(username) {
  const cleanName = String(username || "").trim();
  if (!cleanName) return null;
  if (/^\d+$/.test(cleanName)) {
    return parseInt(cleanName, 10);
  }

  const searchUrl = `${API_BASE_URL}/Util/Search/Results?_sSearchString=${encodeURIComponent(cleanName)}&_sModelName=Member`;
  try {
    const res = await fetchWithRetry(searchUrl, {}, 3, 15000);
    const data = await res.json();
    const records = Array.isArray(data) ? data : data._aRecords || [];
    if (!records.length) return null;

    // Check exact name match first
    const exact = records.find(
      (r) => String(r._sName || "").toLowerCase() === cleanName.toLowerCase()
    );
    if (exact && exact._idRow) return exact._idRow;

    // Fallback to first search result
    return records[0]._idRow || null;
  } catch (err) {
    console.warn(`[GameBananaService] 查询会员 "${username}" 失败:`, err.message);
    return null;
  }
}

/**
 * Format raw GameBanana mod record to normalized DTO
 * @param {object} raw
 * @returns {object}
 */
function normalizeModRecord(raw) {
  if (!raw) return null;

  const rawImages = raw._aPreviewMedia?._aImages || [];
  const images = rawImages.map((img) => {
    const base = img._sBaseUrl || "https://images.gamebanana.com/img/ss/mods";
    const file = img._sFile || "";
    const file100 = img._sFile100 || "";
    const file220 = img._sFile220 || "";
    const file530 = img._sFile530 || "";
    const file800 = img._sFile800 || "";
    return {
      type: img._sType || "screenshot",
      url: file ? `${base}/${file}` : "",
      thumbUrl: file100 ? `${base}/${file100}` : file220 ? `${base}/${file220}` : file530 ? `${base}/${file530}` : `${base}/${file}`,
      medUrl: file530 ? `${base}/${file530}` : file800 ? `${base}/${file800}` : file220 ? `${base}/${file220}` : file100 ? `${base}/${file100}` : `${base}/${file}`,
      width: img._wFile530 || img._wFile220 || img._wFile100 || 0,
      height: img._hFile530 || img._hFile220 || img._hFile100 || 0,
      caption: img._sCaption || ""
    };
  });

  return {
    id: raw._idRow,
    name: raw._sName || "未命名 Mod",
    profileUrl: raw._sProfileUrl || `https://gamebanana.com/mods/${raw._idRow}`,
    dateAdded: raw._tsDateAdded || 0,
    dateModified: raw._tsDateModified || 0,
    dateUpdated: raw._tsDateUpdated || raw._tsDateModified || 0,
    hasFiles: !!raw._bHasFiles,
    category: raw._aSubCategory?._sName || raw._aCategory?._sName || raw._aRootCategory?._sName || "",
    categoryIcon: raw._aSubCategory?._sIconUrl || raw._aCategory?._sIconUrl || raw._aRootCategory?._sIconUrl || "",
    subCategory: raw._aSubCategory
      ? {
          id: raw._aSubCategory._idRow || parseInt(raw._aSubCategory._sProfileUrl?.match(/cats\/(\d+)/)?.[1] || 0, 10) || null,
          name: raw._aSubCategory._sName,
          iconUrl: raw._aSubCategory._sIconUrl || "",
          profileUrl: raw._aSubCategory._sProfileUrl || ""
        }
      : null,
    rootCategory: raw._aRootCategory
      ? {
          id: raw._aRootCategory._idRow || parseInt(raw._aRootCategory._sProfileUrl?.match(/cats\/(\d+)/)?.[1] || 0, 10) || null,
          name: raw._aRootCategory._sName,
          iconUrl: raw._aRootCategory._sIconUrl || "",
          profileUrl: raw._aRootCategory._sProfileUrl || ""
        }
      : null,
    submitter: {
      id: raw._aSubmitter?._idRow || 0,
      name: raw._aSubmitter?._sName || "未知作者",
      avatarUrl: raw._aSubmitter?._sAvatarUrl || raw._aSubmitter?._sHdAvatarUrl || "",
      profileUrl: raw._aSubmitter?._sProfileUrl || ""
    },
    images,
    previewImage: images[0]?.medUrl || images[0]?.thumbUrl || images[0]?.url || "",
    previewImages: images.map((img: any) => img.medUrl || img.url || img.thumbUrl || "").filter(Boolean),
    author: raw._aSubmitter?._sName || "未知作者",
    likesCount: raw._nLikeCount || 0,
    stats: {
      likes: raw._nLikeCount || 0,
      views: raw._nViewCount || 0,
      downloads: raw._nDownloadCount || 0
    }
  };
}

/**
 * In-memory cache for game categories
 */
const CATEGORIES_CACHE = new Map();

/**
 * Get categories for a game from GameBanana ProfilePage
 * @param {string|number} gameId
 * @returns {Promise<{ gameId: number, categories: Array }>}
 */
async function getGameCategories(gameId) {
  const gbGameId = resolveGameBananaGameId(gameId);
  if (CATEGORIES_CACHE.has(gbGameId)) {
    return CATEGORIES_CACHE.get(gbGameId);
  }

  try {
    const url = `${API_BASE_URL}/Game/${gbGameId}/ProfilePage`;
    const res = await fetchWithRetry(url, {}, 3, 15000);
    const data = await res.json();
    const rootCats = data._aModRootCategories || [];
    const categories = rootCats.map((c) => ({
      id: c._idRow,
      name: c._sName,
      itemCount: c._nItemCount || 0,
      categoryCount: c._nCategoryCount || 0,
      iconUrl: c._sIconUrl || "",
      url: c._sUrl || ""
    }));

    const result = { gameId: gbGameId, categories };
    CATEGORIES_CACHE.set(gbGameId, result);
    return result;
  } catch (err) {
    console.warn(`[GameBananaService] 获取游戏 ${gbGameId} 分类列表失败:`, err.message);
    return { gameId: gbGameId, categories: [] };
  }
}

/**
 * 1. Search Mods API v11 with author syntax parsing, character filtering, 15s timeout, 3 retries
 *
 * Query syntax & synergy:
 * - "user:作者名" or "author:作者名" -> filter by author
 * - plain text -> keyword search
 * - character selected + search text -> combined query scoped to character (e.g. "Hoshimi Miyabi NSFW")
 * - character selected without search text:
 *   - if character has dedicated gbCatId -> Mod/Index with _aFilters[Generic_Category]=gbCatId
 *   - if character has no gbCatId -> Util/Search/Results with character name
 *
 * @param {object} params
 * @param {string|number} params.gameId - Game identifier (e.g. 'genshin', 8552)
 * @param {string} [params.query] - Search query (supports user:xxx syntax)
 * @param {number} [params.page=1] - Page number (1-based)
 * @param {number} [params.perPage=20] - Number of records per page
 * @param {string} [params.sort='default'] - Sort order
 * @param {number|string} [params.categoryId] - Optional category ID filter
 * @param {string} [params.characterId] - Character ID (e.g. 'miyabi' or 'all')
 * @param {string} [params.characterName] - Character English canonical name (e.g. 'Hoshimi Miyabi')
 * @param {string} [params.characterCnName] - Character Chinese name (e.g. '星见雅')
 * @param {number|string} [params.characterGbCatId] - GameBanana Category ID (e.g. 30579)
 * @returns {Promise<{ total: number, page: number, perPage: number, records: Array }>}
 */
async function searchMods(rawParams: any = {}) {
  // 参数归一化：渲染层历史上传的是 searchQuery（GameBananaPage），直接解构 query 会导致
  // 关键词被静默丢弃、搜索框完全失效，这里统一兼容两种字段名
  const p = (rawParams || {}) as any;
  const gameId = p.gameId;
  const query = p.query ?? p.searchQuery ?? p.keyword ?? "";
  const page = p.page ?? 1;
  const perPage = p.perPage ?? 20;
  const sort = p.sort ?? "default";
  const categoryId = p.categoryId ?? null;
  const characterId = p.characterId ?? "all";
  const characterName = p.characterName ?? null;
  const characterCnName = p.characterCnName ?? null;
  const characterGbCatId = p.characterGbCatId ?? null;
  const gbGameId = resolveGameBananaGameId(gameId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const perPageNum = Math.min(100, Math.max(1, parseInt(perPage, 10) || 20));

  let rawQuery = String(query || "").trim();

  // Resolve character info if specified
  let activeCharGbCatId = characterGbCatId ? parseInt(characterGbCatId, 10) : null;
  let activeCharEnName = characterName ? String(characterName).trim() : null;
  let activeCharCnName = characterCnName ? String(characterCnName).trim() : null;

  if (characterId && characterId !== "all") {
    if (!activeCharGbCatId || !activeCharEnName) {
      try {
        const gameChars = getCharactersForGame(gbGameId);
        const match = gameChars.find((c) => c.id === characterId);
        if (match) {
          if (!activeCharGbCatId && match.gbCatId) activeCharGbCatId = match.gbCatId;
          if (!activeCharEnName && match.enName) activeCharEnName = match.enName;
          if (!activeCharCnName && match.name) activeCharCnName = match.name;
        }
      } catch (_) {}
    }
  }

  // 1. Direct Mod ID or GameBanana Mod URL match (e.g. 567291 or https://gamebanana.com/mods/567291)
  const modIdMatch = rawQuery.match(/^(?:https?:\/\/gamebanana\.com\/mods\/)?(\d{4,9})$/i);
  if (modIdMatch) {
    const directModId = parseInt(modIdMatch[1], 10);
    try {
      const directMod = await getModDetails({ gameId: gbGameId, modId: directModId });
      if (directMod && directMod.id) {
        const directModFormatted = {
          ...directMod,
          category: typeof directMod.category === "object" ? (directMod.category?.name || "") : (directMod.category || ""),
          previewImage: directMod.images?.[0]?.medUrl || directMod.images?.[0]?.url || ""
        };
        return {
          total: 1,
          page: 1,
          perPage: perPageNum,
          records: [directModFormatted]
        };
      }
    } catch (e) {
      console.warn(`[GameBananaService] 模组 ID ${directModId} 查询失败，继续关键词搜索:`, e.message);
    }
  }

  // 2. Author syntax parsing: user:name, author:name
  let authorName = null;
  const authorMatch = rawQuery.match(/(?:^|\s)(?:user|author):([^\s]+)/i);
  if (authorMatch) {
    authorName = authorMatch[1].trim();
    rawQuery = rawQuery.replace(authorMatch[0], " ").trim();
  }

  let submitterId = null;
  if (authorName) {
    submitterId = await findMemberIdByName(authorName);
    if (!submitterId) {
      // Author specified but member not found
      return {
        total: 0,
        page: pageNum,
        perPage: perPageNum,
        records: []
      };
    }
  }

  const SORT_MAP = {
    newest: "Generic_Newest",
    downloads: "Generic_MostDownloaded",
    likes: "Generic_MostLiked",
    views: "Generic_MostViewed",
    Generic_Newest: "Generic_Newest",
    Generic_MostDownloaded: "Generic_MostDownloaded",
    Generic_MostLiked: "Generic_MostLiked",
    Generic_MostViewed: "Generic_MostViewed"
  };
  const resolvedSort = SORT_MAP[sort] || (typeof sort === "string" && sort.startsWith("Generic_") ? sort : null);

  // 3. Keyword Search via Util/Search/Results:
  // Triggered when user typed search keywords OR when character is selected without a dedicated gbCatId
  const hasUserKeywords = rawQuery.length > 0;
  const isCharacterKeywordSearch = !hasUserKeywords && !activeCharGbCatId && Boolean(activeCharEnName);

  if (hasUserKeywords || isCharacterKeywordSearch) {
    // If character is selected, scope search by prefixing canonical character name
    let effectiveSearch = rawQuery;
    if (activeCharEnName) {
      if (hasUserKeywords) {
        effectiveSearch = `${activeCharEnName} ${rawQuery}`;
      } else {
        effectiveSearch = activeCharEnName;
      }
    }

    const searchParams = new URLSearchParams();
    searchParams.set("_sSearchString", effectiveSearch);
    searchParams.set("_sModelName", "Mod");
    searchParams.set("_idGameRow", String(gbGameId));
    searchParams.set("_nPage", String(pageNum));

    const url = `${API_BASE_URL}/Util/Search/Results?${searchParams.toString()}`;
    const response = await fetchWithRetry(url, {}, 3, 15000);
    const data = await response.json();

    const rawRecords = Array.isArray(data) ? data : (data._aRecords || []);
    let records = rawRecords.map(normalizeModRecord).filter(Boolean);

    // Apply author filter if specified
    if (submitterId) {
      records = records.filter((r) => r.submitter?.id === submitterId);
    }

    // Apply category filter if specified
    if (categoryId && categoryId !== "all" && categoryId !== "0") {
      const targetCatId = parseInt(categoryId, 10);
      if (!isNaN(targetCatId)) {
        records = records.filter(
          (r) =>
            r.rootCategory?.id === targetCatId ||
            r.subCategory?.id === targetCatId
        );
      }
    }

    // Apply character category filtering/relevance check if gbCatId exists
    if (activeCharGbCatId && activeCharEnName) {
      const charLower = activeCharEnName.toLowerCase();
      records = records.filter((r) => {
        if (r.subCategory?.id === activeCharGbCatId) return true;
        if (r.name && r.name.toLowerCase().includes(charLower)) return true;
        return false;
      });
    }

    // Apply client-side sorting if requested
    if (resolvedSort && resolvedSort !== "default") {
      if (resolvedSort === "Generic_Newest") {
        records.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      } else if (resolvedSort === "Generic_MostDownloaded") {
        records.sort((a, b) => (b.stats?.downloads || 0) - (a.stats?.downloads || 0));
      } else if (resolvedSort === "Generic_MostLiked") {
        records.sort((a, b) => (b.stats?.likes || 0) - (a.stats?.likes || 0));
      } else if (resolvedSort === "Generic_MostViewed") {
        records.sort((a, b) => (b.stats?.views || 0) - (a.stats?.views || 0));
      }
    }

    const total = data._aMetadata?._nRecordCount || records.length;

    return {
      total,
      page: pageNum,
      perPage: data._aMetadata?._nPerpage || 15,
      records
    };
  }

  // 4. Dedicated Browse via Mod/Index:
  // Used when no search keywords: either browsing dedicated character category or default root category
  const params = new URLSearchParams();
  params.set("_aFilters[Generic_Game]", String(gbGameId));
  params.set("_nPage", String(pageNum));
  params.set("_nPerpage", String(perPageNum));

  if (submitterId) {
    params.set("_aFilters[Generic_Submitter]", String(submitterId));
  }

  // If a character with gbCatId is selected, that is the primary category filter!
  if (activeCharGbCatId) {
    params.set("_aFilters[Generic_Category]", String(activeCharGbCatId));
  } else if (categoryId && categoryId !== "all" && categoryId !== "0" && !isNaN(parseInt(categoryId, 10))) {
    params.set("_aFilters[Generic_Category]", String(categoryId));
  }

  if (resolvedSort) {
    params.set("_sSort", resolvedSort);
  }

  const url = `${API_BASE_URL}/Mod/Index?${params.toString()}`;
  const response = await fetchWithRetry(url, {}, 3, 15000);
  const data = await response.json();

  const records = (data._aRecords || []).map(normalizeModRecord).filter(Boolean);
  const total = data._aMetadata?._nTotalRecordCount || data._aMetadata?._nRecordCount || records.length;

  return {
    total,
    page: pageNum,
    perPage: perPageNum,
    records
  };
}

/**
 * 2. Get Mod Details API v11
 * Fetches ProfilePage & Files, returns normalized DTO
 * @param {object} params
 * @param {string|number} [params.gameId]
 * @param {number|string} params.modId
 * @returns {Promise<object>}
 */
async function getModDetails(params: any = {}) {
  const rawId = params.modId || params.itemId || params.id || (typeof params === 'number' ? params : (typeof params === 'string' ? params : 0));
  const cleanModId = parseInt(rawId, 10);
  if (!cleanModId || Number.isNaN(cleanModId)) {
    throw new Error(`无效的 Mod ID: ${JSON.stringify(params)}`);
  }
  const gameId = params.gameId;

  const profileUrl = `${API_BASE_URL}/Mod/${cleanModId}/ProfilePage`;
  const profileRes = await fetchWithRetry(profileUrl, {}, 3, 15000);
  const p = await profileRes.json();

  // If files not present in ProfilePage, query /Files endpoint
  let rawFiles = Array.isArray(p._aFiles) ? p._aFiles : [];
  if (rawFiles.length === 0) {
    try {
      const filesUrl = `${API_BASE_URL}/Mod/${cleanModId}/Files`;
      const filesRes = await fetchWithRetry(filesUrl, {}, 3, 15000);
      const fData = await filesRes.json();
      if (Array.isArray(fData)) {
        rawFiles = fData;
      }
    } catch (e) {
      console.warn(`[GameBananaService] 补充获取 Mod ${cleanModId} 文件列表失败:`, e.message);
    }
  }

  const files = rawFiles.map((f) => ({
    id: f._idRow,
    fileName: f._sFile || "archive.zip",
    fileSize: f._nFilesize || 0,
    downloadUrl: f._sDownloadUrl || `https://gamebanana.com/dl/${f._idRow}`,
    md5: (f._sMd5Checksum || "").toLowerCase(),
    dateAdded: f._tsDateAdded || 0,
    downloadCount: f._nDownloadCount || 0,
    description: f._sDescription || "",
    isArchived: !!f._bIsArchived
  }));

  // 按发布时间降序排序（最新发布的排在第一位）
  files.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));

  const rawImages = p._aPreviewMedia?._aImages || [];
  const images = rawImages.map((img) => {
    const base = img._sBaseUrl || "https://images.gamebanana.com/img/ss/mods";
    const file = img._sFile || "";
    const file100 = img._sFile100 || "";
    const file220 = img._sFile220 || "";
    const file530 = img._sFile530 || "";
    const file800 = img._sFile800 || "";
    return {
      type: img._sType || "screenshot",
      url: file ? `${base}/${file}` : "",
      thumbUrl: file100 ? `${base}/${file100}` : file220 ? `${base}/${file220}` : file530 ? `${base}/${file530}` : `${base}/${file}`,
      medUrl: file530 ? `${base}/${file530}` : file800 ? `${base}/${file800}` : file220 ? `${base}/${file220}` : file100 ? `${base}/${file100}` : `${base}/${file}`,
      width: img._wFile530 || img._wFile220 || img._wFile100 || 0,
      height: img._hFile530 || img._hFile220 || img._hFile100 || 0,
      caption: img._sCaption || ""
    };
  });

  return {
    id: p._idRow,
    name: p._sName || "未命名 Mod",
    description: p._sDescription || "",
    text: p._sText || "",
    profileUrl: p._sProfileUrl || `https://gamebanana.com/mods/${cleanModId}`,
    dateAdded: p._tsDateAdded || 0,
    dateModified: p._tsDateModified || 0,
    dateUpdated: p._tsDateUpdated || p._tsDateModified || 0,
    submitter: {
      id: p._aSubmitter?._idRow || 0,
      name: p._aSubmitter?._sName || "未知作者",
      avatarUrl: p._aSubmitter?._sAvatarUrl || p._aSubmitter?._sHdAvatarUrl || "",
      profileUrl: p._aSubmitter?._sProfileUrl || ""
    },
    game: {
      id: p._aGame?._idRow || (gameId ? resolveGameBananaGameId(gameId) : 0),
      name: p._aGame?._sName || ""
    },
    category: {
      id: p._aCategory?._idRow || p._aRootCategory?._idRow || 0,
      name: p._aCategory?._sName || p._aRootCategory?._sName || "通用模组",
      iconUrl: p._aCategory?._sIconUrl || p._aRootCategory?._sIconUrl || "",
      profileUrl: p._aCategory?._sProfileUrl || p._aRootCategory?._sProfileUrl || ""
    },
    categoryName: p._aCategory?._sName || p._aRootCategory?._sName || "",
    subCategory: p._aSubCategory
      ? {
          id: p._aSubCategory._idRow,
          name: p._aSubCategory._sName,
          iconUrl: p._aSubCategory._sIconUrl || "",
          profileUrl: p._aSubCategory._sProfileUrl || ""
        }
      : null,
    stats: {
      likes: p._nLikeCount || 0,
      views: p._nViewCount || 0,
      downloads: p._nDownloadCount || 0
    },
    images,
    previewImage: images[0]?.medUrl || images[0]?.thumbUrl || images[0]?.url || "",
    previewImages: images.map((img: any) => img.medUrl || img.url || img.thumbUrl || "").filter(Boolean),
    author: p._aSubmitter?._sName || "未知作者",
    likesCount: p._nLikeCount || 0,
    version: p._sVersion || "",
    changelog: p._aChangeLog || null,
    files
  };
}

/**
 * 3. Verify archive magic bytes
 * Validates ZIP, 7Z, RAR
 * @param {string} filePath
 * @returns {{ valid: boolean, format: string, error?: string }}
 */
function verifyArchiveMagic(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, format: "unknown", error: "文件不存在" };
  }

  const stats = fs.statSync(filePath);
  if (stats.size < 4) {
    return { valid: false, format: "unknown", error: `文件体积过小 (${stats.size} 字节)` };
  }

  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(16);
  const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
  fs.closeSync(fd);

  if (bytesRead < 4) {
    return { valid: false, format: "unknown", error: "读取文件头部失败" };
  }

  // 1. ZIP Check (PK\x03\x04 or spanned / empty PK)
  if (buffer[0] === MAGIC_ZIP[0] && buffer[1] === MAGIC_ZIP[1]) {
    if (
      (buffer[2] === 0x03 && buffer[3] === 0x04) ||
      (buffer[2] === 0x05 && buffer[3] === 0x06) ||
      (buffer[2] === 0x07 && buffer[3] === 0x08)
    ) {
      return { valid: true, format: "zip" };
    }
  }

  // 2. 7Z Check
  if (bytesRead >= 6) {
    let match7z = true;
    for (let i = 0; i < MAGIC_7Z.length; i++) {
      if (buffer[i] !== MAGIC_7Z[i]) {
        match7z = false;
        break;
      }
    }
    if (match7z) {
      return { valid: true, format: "7z" };
    }
  }

  // 3. RAR Check
  if (bytesRead >= 7) {
    let matchRar = true;
    for (let i = 0; i < MAGIC_RAR.length; i++) {
      if (buffer[i] !== MAGIC_RAR[i]) {
        matchRar = false;
        break;
      }
    }
    if (matchRar) {
      return { valid: true, format: "rar" };
    }
  }

  return {
    valid: false,
    format: "unknown",
    error: `未知归档文件头魔数 (0x${buffer.subarray(0, 8).toString("hex")})，非合法的 ZIP/7Z/RAR 压缩文件`
  };
}

/**
 * Verify MD5 checksum of file
 * @param {string} filePath
 * @param {string} expectedMd5
 * @returns {boolean}
 */
function verifyMd5Checksum(filePath, expectedMd5) {
  if (!expectedMd5) return true;
  // 流式计算，避免数百 MB 压缩包整读进内存并阻塞事件循环
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => {
      const actual = hash.digest("hex").toLowerCase();
      resolve(actual === String(expectedMd5).trim().toLowerCase());
    });
    stream.on("error", reject);
  }).catch((err) => {
    console.warn("MD5 stream verify failed:", err);
    return false;
  });
}

/**
 * 递归检查目录内是否存在符号链接 / 硬链接式跳转（junction）。
 * RAR 预检无法完全覆盖链接条目，解压后在文件系统层面兜底：
 * 发现任何链接立即拒绝安装，防止恶意压缩包把内容写到 Mod 目录之外。
 */
export function assertNoLinksInDir(dir) {
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      let isLink = entry.isSymbolicLink();
      if (!isLink) {
        // junction 在部分 Node 版本不表现为 symlink，用 readlink 探测兜底
        try {
          fs.readlinkSync(full);
          isLink = true;
        } catch (_) {
          /* 非链接 */
        }
      }
      if (isLink) {
        throw new Error(`压缩包内包含符号链接/联接点条目，已拒绝安装: ${path.relative(dir, full)}`);
      }
      if (entry.isDirectory()) {
        stack.push(full);
      }
    }
  }
}

/**
 * 4. 7za Security Pre-Inspection
 * Runs `7za.exe l -slt <archive>` and validates every entry:
 * - NO ../ or ..\\ traversal
 * - NO absolute paths (/, \\, C:, UNC)
 * - NO Alternate Data Stream colons (:)
 * - NO Symlinks or Hardlinks (Attributes L, lrwxrwxrwx, Symbolic Link property)
 *
 * @param {string} archivePath
 * @param {string} [sevenZipPath]
 * @param {string} [format]
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ safe: boolean, entriesCount: number, entries: Array }>}
 */
async function inspectArchiveSecurity(archivePath, sevenZipPath, format = "zip", signal?: AbortSignal) {
  if (!fs.existsSync(archivePath)) {
    throw new Error(`待预检的归档文件不存在: ${archivePath}`);
  }

  const isRar = format === "rar" || archivePath.toLowerCase().endsWith(".rar");
  const entries = [];

  if (isRar) {
    const unrarBin = resolveUnrarPath();
    if (!unrarBin) {
      throw new Error("未找到用于解压 RAR 格式的 UnRAR.exe 可执行文件");
    }
    let stdout;
    try {
      const res = await execFileAsync(unrarBin, ["vb", archivePath], {
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
        signal
      });
      stdout = res.stdout;
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      throw new Error(`UnRAR 预检执行失败: ${err.message}`);
    }
    const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const l of lines) {
      entries.push({ Path: l });
    }
  } else {
    const bin = resolve7zaPath(sevenZipPath);
    if (!fs.existsSync(bin)) {
      throw new Error(`7za.exe 可执行文件未找到: ${bin}`);
    }

    let stdout;
    try {
      const res = await execFileAsync(bin, ["l", "-slt", archivePath], {
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
        signal
      });
      stdout = res.stdout;
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      throw new Error(`7za 预检执行失败: ${err.message}`);
    }

    // Parse 7za l -slt output
    const lines = stdout.split(/\r?\n/);
    let inEntries = false;
    let current = null;

    for (const line of lines) {
      if (line.startsWith("----------")) {
        inEntries = true;
        current = {};
        continue;
      }
      if (!inEntries) continue;

      if (line.trim() === "") {
        if (current && current.Path) {
          entries.push(current);
          current = {};
        }
        continue;
      }

      const eqIdx = line.indexOf(" = ");
      if (eqIdx !== -1) {
        const key = line.substring(0, eqIdx).trim();
        const val = line.substring(eqIdx + 3).trim();
        if (key === "Path" && current.Path) {
          entries.push(current);
          current = {};
        }
        current[key] = val;
      }
    }
    if (current && current.Path) {
      entries.push(current);
    }
  }

  if (entries.length === 0) {
    throw new Error("压缩包为空或无法识别内部文件条目");
  }

  // Perform rigorous security inspection for every entry
  for (const entry of entries) {
    const relPath = entry.Path;
    if (!relPath) continue;

    // 1. Path traversal check (../, ..\, or path segment equals '..')
    const segments = relPath.split(/[/\\]/);
    if (
      segments.some((seg) => seg === "..") ||
      relPath.includes("../") ||
      relPath.includes("..\\")
    ) {
      const err: any = new Error(`[安全拦截] 压缩包内包含非法路径穿越条目: "${relPath}"`);
      err.code = "SECURITY_PATH_TRAVERSAL";
      err.entry = entry;
      throw err;
    }

    // 2. Absolute path check (starts with /, \, Windows drive letter, UNC)
    if (
      relPath.startsWith("/") ||
      relPath.startsWith("\\") ||
      /^[a-zA-Z]:/.test(relPath) ||
      /^\\\\/.test(relPath)
    ) {
      const err: any = new Error(`[安全拦截] 压缩包内包含绝对路径条目: "${relPath}"`);
      err.code = "SECURITY_ABSOLUTE_PATH";
      err.entry = entry;
      throw err;
    }

    // 3. Alternate Data Streams (ADS) colon check
    if (relPath.includes(":")) {
      const err: any = new Error(`[安全拦截] 压缩包内包含冒号 (可能包含 Windows ADS 伪装或特殊流): "${relPath}"`);
      err.code = "SECURITY_ADS_COLON";
      err.entry = entry;
      throw err;
    }

    // 4. Null byte and illegal control characters check
    if (/[\x00-\x1F]/.test(relPath)) {
      const err: any = new Error(`[安全拦截] 压缩包内包含控制字符或空字节: "${relPath}"`);
      err.code = "SECURITY_CONTROL_CHAR";
      err.entry = entry;
      throw err;
    }

    // 5. Path normalization sandbox escape check
    const normalized = path.normalize(relPath);
    if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
      const err: any = new Error(`[安全拦截] 路径规范化检测逃逸沙箱: "${relPath}"`);
      err.code = "SECURITY_SANDBOX_ESCAPE";
      err.entry = entry;
      throw err;
    }

    // 6. Symlink & Hardlink check
    const isSymlinkAttr =
      (entry.Attributes && entry.Attributes.includes("L")) ||
      (entry.Attributes && entry.Attributes.trim().startsWith("l")) ||
      entry["Symbolic Link"] ||
      entry["Hard Link"] ||
      entry["Is Symbolic Link"] === "+" ||
      entry["Is Hard Link"] === "+" ||
      (entry.Characteristics && entry.Characteristics.toLowerCase().includes("symlink"));

    if (isSymlinkAttr) {
      const err: any = new Error(`[安全拦截] 压缩包内包含被禁用的符号链接或硬链接条目: "${relPath}"`);
      err.code = "SECURITY_LINK_FORBIDDEN";
      err.entry = entry;
      throw err;
    }
  }

  return {
    safe: true,
    entriesCount: entries.length,
    entries
  };
}

const DOWNLOAD_STALL_TIMEOUT_MS = 60000;

/**
 * 5. Stream download to dedicated `.part` file with progress callback
 * @param {object} params
 * @param {string} params.downloadUrl
 * @param {string} params.targetDir
 * @param {string} [params.fileName]
 * @param {string} [params.expectedMd5]
 * @param {function} [params.onProgress] - ({ downloaded, total, percent, speed })
 * @param {number} [params.stallTimeoutMs]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ archivePath: string, size: number, format: string, md5: string }>}
 */
async function downloadFile({
  downloadUrl,
  targetDir,
  fileName,
  expectedMd5,
  onProgress,
  stallTimeoutMs = DOWNLOAD_STALL_TIMEOUT_MS,
  signal
}: {
  downloadUrl: string;
  targetDir: string;
  fileName?: string;
  expectedMd5?: string;
  onProgress?: (progress: any) => void;
  stallTimeoutMs?: number;
  signal?: AbortSignal;
}) {
  if (!downloadUrl) throw new Error("下载链接不能为空");
  fs.mkdirSync(targetDir, { recursive: true });

  const safeFileName = sanitizeFileName(fileName || `gb_mod_${Date.now()}.zip`);
  const finalPath = path.join(targetDir, safeFileName);
  const partPath = path.join(targetDir, `${safeFileName}.part`);

  // Remove stale .part or destination
  if (fs.existsSync(partPath)) {
    try { fs.unlinkSync(partPath); } catch {}
  }
  if (fs.existsSync(finalPath)) {
    try { fs.unlinkSync(finalPath); } catch {}
  }

  const response = await fetchWithRetry(
    downloadUrl,
    { redirect: "follow" },
    3,
    30000
  );

  // 为什么：fetch（含最多 3 次重试 / 单次 30s 超时）期间 %TEMP% 下载目录可能被系统清理，此时 open 会抛原始 ENOENT
  fs.mkdirSync(targetDir, { recursive: true });

  const totalBytes = parseInt(response.headers.get("content-length") || "0", 10);
  let downloadedBytes = 0;
  let lastReportTime = Date.now();
  let lastReportBytes = 0;
  let lastByteAt = Date.now();

  // 使用 stream pipeline：统一处理背压（慢盘快网不再堆积内存）、
  // 写流 error（磁盘满/权限，此前为 unhandled error 会击穿主进程）与资源清理
  const progressCounter = new Transform({
    transform(chunk, _enc, cb) {
      lastByteAt = Date.now();
      downloadedBytes += chunk.length;

      const now = Date.now();
      if (now - lastReportTime >= 200 || (totalBytes > 0 && downloadedBytes === totalBytes)) {
        const timeDiff = (now - lastReportTime) / 1000;
        const bytesDiff = downloadedBytes - lastReportBytes;
        const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
        const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;

        if (typeof onProgress === "function") {
          try {
            onProgress({
              downloaded: downloadedBytes,
              total: totalBytes,
              percent,
              speed
            });
          } catch (_) {}
        }

        lastReportTime = now;
        lastReportBytes = downloadedBytes;
      }

      cb(null, chunk);
    }
  });

  const writeStream = fs.createWriteStream(partPath);
  let streamError = null;
  // 为什么：pipeline 结算后会撤走自己的监听，此后残余的写流 error 事件会变成 uncaughtException
  // 直接击穿主进程（现场表现就是原始 fs ENOENT + 系统错误框，绕过渲染层安装失败提示）
  writeStream.on("error", (err) => {
    streamError = err;
  });

  const stallController = new AbortController();
  const signals = [stallController.signal];
  if (signal) {
    signals.push(signal);
  }
  const combined = AbortSignal.any(signals);

  let stallTimer = null;

  try {
    if (!response.body) {
      throw new Error("响应体为空，无法下载");
    }

    // 为什么：CDN 挂住不发数据时若没有停滞判定会永远转圈
    stallTimer = setInterval(() => {
      if (Date.now() - lastByteAt >= stallTimeoutMs && signal?.aborted !== true) {
        stallController.abort();
      }
    }, Math.max(250, Math.min(5000, Math.floor(stallTimeoutMs / 4))));

    await pipeline(Readable.fromWeb(response.body), progressCounter, writeStream, { signal: combined });
  } catch (err) {
    if (fs.existsSync(partPath)) {
      try { fs.unlinkSync(partPath); } catch {}
    }
    const cause = streamError || err;

    // 为什么：pipeline 因 signal abort 时一律抛 AbortError，不透传自定义 abort reason，因此通过标志判断
    const cancelledByUser = signal?.aborted === true;
    const stalled = stallController.signal.aborted === true;

    if (cancelledByUser) {
      const error: any = new Error("流式下载中断: 安装已取消", { cause });
      error.code = "DOWNLOAD_CANCELLED";
      throw error;
    }
    if (stalled) {
      const error: any = new Error(
        `流式下载中断: 下载停滞：${Math.round(stallTimeoutMs / 1000)} 秒内未收到数据，请重试`,
        { cause }
      );
      error.code = "DOWNLOAD_STALLED";
      throw error;
    }
    throw new Error(`流式下载中断: ${cause.message}`);
  } finally {
    if (stallTimer) {
      clearInterval(stallTimer);
    }
  }

  // Verify Magic Bytes
  const magicCheck = verifyArchiveMagic(partPath);
  if (!magicCheck.valid) {
    if (fs.existsSync(partPath)) {
      try { fs.unlinkSync(partPath); } catch {}
    }
    const err: any = new Error(`下载文件格式校验失败: ${magicCheck.error}`);
    err.code = "INVALID_ARCHIVE_MAGIC";
    throw err;
  }

  // Verify MD5 if provided
  if (expectedMd5) {
    const md5Ok = await verifyMd5Checksum(partPath, expectedMd5);
    if (!md5Ok) {
      if (fs.existsSync(partPath)) {
        try { fs.unlinkSync(partPath); } catch {}
      }
      const err: any = new Error(`文件 MD5 完整性校验未通过 (预期: ${expectedMd5})`);
      err.code = "MD5_MISMATCH";
      throw err;
    }
  }

  // Rename .part to finalPath ensuring extension matches detected format
  const properExt = `.${magicCheck.format}`;
  let finalPathWithExt = finalPath;
  if (!finalPath.toLowerCase().endsWith(properExt)) {
    const baseWithoutExt = finalPath.replace(/\.(zip|rar|7z|part)$/i, "");
    finalPathWithExt = `${baseWithoutExt}${properExt}`;
  }

  if (fs.existsSync(finalPathWithExt)) {
    try { fs.unlinkSync(finalPathWithExt); } catch {}
  }
  fs.renameSync(partPath, finalPathWithExt);

  const stat = fs.statSync(finalPathWithExt);
  return {
    archivePath: finalPathWithExt,
    size: stat.size,
    format: magicCheck.format,
    md5: expectedMd5 || ""
  };
}

/**
 * 6. Identify the actual mod root directory inside staging folder
 * Inspects directory layout:
 * - Direct files: mod.ini, .dds, .buf, .pak, etc. -> stagingDir
 * - Single folder -> inspect inside
 * - Nested mod folder containing .ini -> returns deepest mod root
 * @param {string} stagingDir
 * @returns {string}
 */
function identifyModRoot(stagingDir) {
  if (!fs.existsSync(stagingDir)) return stagingDir;

  const modExtensions = new Set([
    ".ini", ".dds", ".buf", ".ib", ".vb", ".pak", ".sig", ".json"
  ]);

  function hasModFiles(dirPath) {
    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      return items.some((item) => {
        if (!item.isFile()) return false;
        const ext = path.extname(item.name).toLowerCase();
        return modExtensions.has(ext);
      });
    } catch {
      return false;
    }
  }

  // Check if staging root directly has mod files
  if (hasModFiles(stagingDir)) {
    return stagingDir;
  }

  // Explore subdirectories
  const queue = [{ dir: stagingDir, depth: 0 }];
  let bestCandidate = null;

  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    if (depth > 3) continue;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const subdirs = entries.filter((e) => e.isDirectory());

      if (hasModFiles(dir) && dir !== stagingDir) {
        return dir;
      }

      // If single subdirectory, dive in
      if (subdirs.length === 1 && entries.length === 1) {
        bestCandidate = path.join(dir, subdirs[0].name);
        queue.push({ dir: bestCandidate, depth: depth + 1 });
        continue;
      }

      // If multiple subdirs, see if one has .ini
      for (const sd of subdirs) {
        const fullSub = path.join(dir, sd.name);
        if (hasModFiles(fullSub)) {
          return fullSub;
        }
        if (depth < 2) {
          queue.push({ dir: fullSub, depth: depth + 1 });
        }
      }
    } catch {}
  }

  return bestCandidate || stagingDir;
}

/**
 * Sanitize folder and file names for Windows filesystem safety
 */
function sanitizeFileName(name) {
  return String(name || "unnamed")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[. ]+$/, "")
    .trim() || "unnamed";
}

/**
 * 7. Full Download & Safe Install Pipeline
 *
 * Pipeline steps:
 * 1. Stream download to dedicated `.part` file (report progress).
 * 2. Validate archive magic bytes (ZIP/7Z/RAR) and MD5 checksum.
 * 3. Run `7za.exe l -slt` security pre-inspection (reject any traversal, absolute path, ADS, symlink, hardlink).
 * 4. Extract into an isolated staging folder.
 * 5. Identify mod root directory.
 * 6. Move/install to target folder with zero overwrite: `DISABLED_<SafeName>` (or increment if exists).
 * 7. Fetch first high-res preview image and save as `preview.png`.
 * 8. Cleanup temporary files and staging directory.
 *
 * @param {object} params
 * @param {string} params.downloadUrl
 * @param {string} params.targetParentDir - Target parent directory (e.g. game Mods/Character folder)
 * @param {string} [params.modName] - Display name of the Mod
 * @param {string} [params.expectedMd5]
 * @param {string} [params.previewImageUrl] - High-res preview image URL
 * @param {string} [params.sevenZipPath]
 * @param {function} [params.onProgress] - Download/install progress callback
 * @returns {Promise<object>}
 */
async function installMod(rawParams: any = {}) {
  const {
    downloadUrl,
    targetParentDir,
    modName = "Mod",
    fileName = "",
    expectedMd5,
    previewImageUrl,
    sevenZipPath,
    onProgress,
    signal,
    sourceUrl,
    profileUrl,
    modId,
    author,
    version,
    description
  } = rawParams || {};
  if (!downloadUrl) throw new Error("下载链接不能为空");
  if (!targetParentDir) throw new Error("目标安装目录不能为空");

  // 严格归一化角色目录名称（杜绝因非官方翻译或带括号别名导致的文件夹重复）
  const parentBase = path.basename(targetParentDir);
  const normalizedBase = typeof normalizeCharacterName === 'function' ? normalizeCharacterName(parentBase) : parentBase;
  const safeTargetParentDir = normalizedBase !== parentBase
    ? path.join(path.dirname(targetParentDir), normalizedBase)
    : targetParentDir;

  fs.mkdirSync(safeTargetParentDir, { recursive: true });

  const tempBase = resolveDownloadRoot();
  fs.mkdirSync(tempBase, { recursive: true });

  const runId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const tempDownloadDir = path.join(tempBase, `dl_${runId}`);
  const stagingDir = path.join(tempBase, `staging_${runId}`);
  fs.mkdirSync(tempDownloadDir, { recursive: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  let downloadedArchivePath = null;
  let installedTargetDir = "";
  // 为什么：取消是用户主动行为，阶段边界必须再查一次，否则会白干一整个阶段
  const cancelledError = () => Object.assign(new Error("安装已取消"), { code: "INSTALL_CANCELLED" });
  const throwIfAborted = () => { if (signal?.aborted) throw cancelledError(); };

  try {
    // 1. Download to .part file & verify magic + md5
    if (typeof onProgress === "function") {
      onProgress({ stage: "downloading", message: "正在流式安全下载...", percent: 0 });
    }

    const dlResult = await downloadFile({
      downloadUrl,
      targetDir: tempDownloadDir,
      fileName: fileName || `${sanitizeFileName(modName)}.zip`,
      expectedMd5,
      signal,
      onProgress: (p) => {
        if (typeof onProgress === "function") {
          onProgress({ stage: "downloading", ...p });
        }
      }
    });
    downloadedArchivePath = dlResult.archivePath;
    throwIfAborted();

    // 2. Pre-inspect archive security
    if (typeof onProgress === "function") {
      onProgress({ stage: "inspecting", message: "执行文件格式与路径安全预检...", percent: 100 });
    }

    const bin7z = resolve7zaPath(sevenZipPath);
    await inspectArchiveSecurity(downloadedArchivePath, bin7z, dlResult.format, signal);
    throwIfAborted();

    // 3. Extract to isolated staging directory
    if (typeof onProgress === "function") {
      onProgress({ stage: "extracting", message: "解压至隔离安全暂存区...", percent: 100 });
    }

    if (dlResult.format === "rar") {
      const unrarBin = resolveUnrarPath();
      if (!unrarBin) {
        throw new Error("检测到 RAR 压缩包，但未找到 UnRAR.exe 可执行文件");
      }
      await execFileAsync(unrarBin, ["x", "-y", downloadedArchivePath, stagingDir + path.sep], {
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
        signal
      });
    } else {
      await execFileAsync(bin7z, ["x", "-y", `-o${stagingDir}`, downloadedArchivePath], {
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
        signal
      });
    }
    throwIfAborted();

    // 4. Identify Mod Root Directory
    const modRoot = identifyModRoot(stagingDir);
    // 文件系统级链接兜底检查（RAR 预检覆盖不到的 symlink/junction 在此拦截）
    assertNoLinksInDir(stagingDir);

    // 5. Zero-overwrite installation named `DISABLED_<SafeName>`
    const safeModName = sanitizeFileName(modName);
    const baseFolderName = `DISABLED_${safeModName}`;
    let targetModDir = path.join(safeTargetParentDir, baseFolderName);
    let counter = 1;

    while (fs.existsSync(targetModDir)) {
      targetModDir = path.join(safeTargetParentDir, `${baseFolderName} (${counter})`);
      counter++;
    }

    throwIfAborted();
    installedTargetDir = targetModDir;
    // Move or copy mod root to target
    fs.mkdirSync(targetModDir, { recursive: true });
    fs.cpSync(modRoot, targetModDir, { recursive: true });

    // 6. Fetch first high-res preview image and save as preview.png
    let previewSaved = false;
    if (previewImageUrl) {
      if (typeof onProgress === "function") {
        onProgress({ stage: "preview", message: "获取高清封面并保存为 preview.png...", percent: 100 });
      }
      try {
        const previewPath = path.join(targetModDir, "preview.png");
        const imgRes = await fetchWithRetry(previewImageUrl, {}, 2, 10000);
        const arrayBuf = await imgRes.arrayBuffer();
        const imgBuf = Buffer.from(arrayBuf);
        if (imgBuf.length > 32) {
          fs.writeFileSync(previewPath, imgBuf);
          previewSaved = true;
        }
      } catch (err) {
        console.warn(`[GameBananaService] 保存预览图失败:`, err.message);
      }
    }
    throwIfAborted();

    // 7. Write/merge mod metadata (mod.json) including sourceUrl and market information
    try {
      const metaPath = path.join(targetModDir, "mod.json");
      let existingMeta: any = {};
      if (fs.existsSync(metaPath)) {
        try {
          existingMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        } catch (_) {}
      }
      const finalSourceUrl = sourceUrl || profileUrl || (modId ? `https://gamebanana.com/mods/${modId}` : "");
      const nowStr = new Date().toLocaleDateString();
      const updatedMeta = {
        name: modName || existingMeta.name || path.basename(targetModDir),
        author: author || existingMeta.author || "GameBanana",
        version: version || existingMeta.version || "Version 1.0",
        description: description || existingMeta.description || "",
        ...existingMeta,
        sourceUrl: finalSourceUrl || existingMeta.sourceUrl || existingMeta.url || "",
        url: finalSourceUrl || existingMeta.url || existingMeta.sourceUrl || "",
        gamebananaUrl: finalSourceUrl || existingMeta.gamebananaUrl || "",
        source: "GameBanana",
        modId: modId ? parseInt(modId, 10) : (existingMeta.modId || null),
        dateChecked: existingMeta.dateChecked || nowStr,
        dateUpdated: existingMeta.dateUpdated || nowStr,
        checkTime: existingMeta.checkTime || nowStr,
        lastUpdated: existingMeta.lastUpdated || nowStr,
        updatedAt: new Date().toISOString()
      };
      if (author) updatedMeta.author = author;
      if (finalSourceUrl) {
        updatedMeta.sourceUrl = finalSourceUrl;
        updatedMeta.url = finalSourceUrl;
        updatedMeta.gamebananaUrl = finalSourceUrl;
      }
      fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2), "utf8");
    } catch (metaErr: any) {
      console.warn("[GameBananaService] 写入 mod.json 元数据失败:", metaErr.message);
    }

    if (typeof onProgress === "function") {
      onProgress({ stage: "completed", message: "安装完成！", percent: 100 });
    }

    // 自动分析并翻译配置说明与按键，写入 mod.json
    autoTranslateModConfig(targetModDir).catch((e: any) => {
      console.warn("[GameBananaService] 自动翻译 Mod 配置说明失败:", e?.message);
    });

    return {
      success: true,
      modName: path.basename(targetModDir),
      installedPath: targetModDir,
      previewSaved,
      format: dlResult.format
    };
  } catch (err: any) {
    if (signal?.aborted) {
      // 为什么：取消时目录可能只拷了一半，必须回滚，否则留下半成品 Mod 被扫描到
      if (installedTargetDir) { try { fs.rmSync(installedTargetDir, { recursive: true, force: true }); } catch {} }
      console.warn('[GameBananaService] 安装已取消:', err?.message);
      return { success: false, cancelled: true, error: '已取消安装' };
    }
    console.error('[GameBananaService] 安装失败:', err?.message || String(err));
    return { success: false, error: err?.message || String(err) };
  } finally {
    // 7. Cleanup temp files
    try {
      if (fs.existsSync(tempDownloadDir)) {
        fs.rmSync(tempDownloadDir, { recursive: true, force: true });
      }
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

/**
 * GameBanana 更新结果缓存 (30分钟过期)
 */
const updateCache = new Map<number, { data: any; expireAt: number }>()

function evaluateUpdate(details: any, localDate?: any, localVersion?: string) {
  const remoteDate = details.dateModified || details.dateUpdated || details.dateAdded || 0
  const remoteVersion = details.version || details.files?.[0]?.fileName || ''

  // 提取最新更新日志摘要
  let changelog = ''
  if (Array.isArray(details.changelog) && details.changelog.length > 0) {
    const latestCl = details.changelog[0]
    changelog = typeof latestCl === 'string' ? latestCl : (latestCl._sText || latestCl.text || '')
  } else if (details.description) {
    changelog = details.description.slice(0, 150)
  }

  // 计算本地时间戳 (秒)
  let localSec = 0
  if (typeof localDate === 'number') {
    localSec = localDate > 1e11 ? Math.floor(localDate / 1000) : localDate
  } else if (typeof localDate === 'string' && localDate) {
    const parsed = Date.parse(localDate)
    if (!isNaN(parsed)) localSec = Math.floor(parsed / 1000)
  }

  // 本地记录的 version 就是安装时那份 GameBanana 文件名，同名即同一份文件
  // （GameBanana 文件名带随机后缀，重传必然改名），因此版本号字符串和页面修改时间都不应再算作更新。
  const latestFileName = details.files?.[0]?.fileName ? String(details.files[0].fileName).trim() : ''
  const cleanLocalVersion = localVersion ? String(localVersion).trim() : ''
  if (latestFileName && cleanLocalVersion && latestFileName.toLowerCase() === cleanLocalVersion.toLowerCase()) {
    return {
      hasUpdate: false,
      checked: true,
      modId: details.id,
      remoteVersion: remoteVersion || '最新版本',
      remoteDate: remoteDate ? remoteDate * 1000 : 0,
      remoteName: details.name,
      changelog: '',
      latestFile: details.files?.[0] || null,
      downloadUrl: details.files?.[0]?.downloadUrl || null
    }
  }

  let hasUpdate = false
  // 判定规则 1：远程修改时间比本地记录晚 1 小时 (3600秒) 以上
  if (remoteDate && localSec && remoteDate > localSec + 3600) {
    hasUpdate = true
  }

  // 判定规则 2：版本号字符串不同
  if (!hasUpdate && remoteVersion && localVersion) {
    const cleanRemote = String(remoteVersion).replace(/^[vV]/, '').replace(/版$/, '').trim()
    const cleanLocal = String(localVersion).replace(/^[vV]/, '').replace(/版$/, '').trim()
    if (cleanRemote && cleanLocal && cleanRemote !== cleanLocal) {
      hasUpdate = true
    }
  }

  return {
    hasUpdate,
    checked: true,
    modId: details.id,
    remoteVersion: remoteVersion || '最新版本',
    remoteDate: remoteDate ? remoteDate * 1000 : 0,
    remoteName: details.name,
    changelog,
    latestFile: details.files?.[0] || null,
    downloadUrl: details.files?.[0]?.downloadUrl || null
  }
}

/**
 * 检查单个 Mod 在 GameBanana 上的更新情况
 */
async function checkModUpdate({
  modId,
  localDate,
  localVersion
}: {
  modId: number
  localDate?: number | string
  localVersion?: string
}) {
  if (!modId) return { hasUpdate: false, checked: false, error: "缺少 modId" }

  const now = Date.now()
  const cached = updateCache.get(modId)
  if (cached && cached.expireAt > now) {
    return evaluateUpdate(cached.data, localDate, localVersion)
  }

  try {
    const details = await getModDetails({ modId })
    if (!details) return { hasUpdate: false, checked: false, error: "未获取到 Mod 详情" }
    updateCache.set(modId, { data: details, expireAt: now + 30 * 60 * 1000 })
    return evaluateUpdate(details, localDate, localVersion)
  } catch (err: any) {
    console.warn(`[GameBananaService] 检查 Mod ${modId} 更新失败:`, err.message)
    // 失败必须与"无更新"区分开：此前断网会被误报为全部最新
    return { hasUpdate: false, checked: false, error: err.message }
  }
}

/**
 * 批量并发检查多个 Mod 的更新状态 (带并发限流)
 */
async function checkAllModsUpdates(
  mods: Array<{ fullPath: string; modId: number; lastUpdated?: any; version?: string }>
) {
  const results: Record<string, any> = {}
  const concurrency = 4
  const queue = [...mods]

  const workers = Array(concurrency)
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const item = queue.shift()
        if (!item || !item.modId) continue
        try {
          const res = await checkModUpdate({
            modId: item.modId,
            localDate: item.lastUpdated,
            localVersion: item.version
          })
          results[item.fullPath] = res
        } catch (err: any) {
          results[item.fullPath] = { hasUpdate: false, checked: false, error: err?.message || "检查失败" }
        }
      }
    })

  await Promise.all(workers)
  return results
}

/**
 * Unified GameBanana Service Class
 */
class GameBananaService {
  public sevenZipPath: string;
  public gameIdMap: Record<string, number>;

  constructor(options: any = {}) {
    this.sevenZipPath = options.sevenZipPath || DEFAULT_7ZA_PATH;
    this.gameIdMap = GAME_ID_MAP;
  }

  resolveGameId(gameInput) {
    return resolveGameBananaGameId(gameInput);
  }

  async searchMods(params) {
    return searchMods(params);
  }

  async getModDetails(params) {
    return getModDetails(params);
  }

  async downloadFile(params) {
    return downloadFile(params);
  }

  async inspectArchiveSecurity(archivePath) {
    return inspectArchiveSecurity(archivePath, this.sevenZipPath);
  }

  async getGameCategories(gameId) {
    return getGameCategories(gameId);
  }

  async installMod(params) {
    return installMod({
      ...params,
      sevenZipPath: params.sevenZipPath || this.sevenZipPath
    });
  }

  async checkModUpdate(params) {
    return checkModUpdate(params);
  }

  async checkAllModsUpdates(mods) {
    return checkAllModsUpdates(mods);
  }
}

export {
  GAME_ID_MAP,
  GAME_ALIASES,
  DEFAULT_7ZA_PATH,
  resolveGameBananaGameId,
  resolve7zaPath,
  resolveUnrarPath,
  resolveDownloadRoot,
  fetchWithRetry,
  findMemberIdByName,
  normalizeModRecord,
  getGameCategories,
  searchMods,
  getModDetails,
  verifyArchiveMagic,
  verifyMd5Checksum,
  inspectArchiveSecurity,
  downloadFile,
  identifyModRoot,
  installMod,
  checkModUpdate,
  checkAllModsUpdates,
  GameBananaService
}
