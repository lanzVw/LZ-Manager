/**
 * QAQManager FlairX - GameBanana 100% Official Verified Character Database
 * Contains full character roster with Chinese names, English canonical names,
 * and GameBanana Category IDs verified directly against the GameBanana Live API:
 * - Zenless Zone Zero (19567)
 * - Genshin Impact (8552)
 * - Honkai: Star Rail (18366)
 * - Wuthering Waves (20357)
 * - Arknights: Endfield (21842)
 * - Honkai Impact 3rd (10349)
 */

const CHARACTERS_BY_GAME = {
  "8552": [
    {
      "id": "all",
      "name": "全部角色",
      "enName": "All Characters",
      "gbCatId": null,
      "pinyin": "qbjs"
    },
    {
      "id": "lumine",
      "name": "荧 (女主)",
      "enName": "Lumine",
      "gbCatId": 19763,
      "pinyin": "y"
    },
    {
      "id": "raiden",
      "name": "雷电将军",
      "enName": "Raiden Shogun",
      "gbCatId": 19498,
      "pinyin": "ldjj"
    },
    {
      "id": "furina",
      "name": "芙宁娜",
      "enName": "Furina",
      "gbCatId": 25471,
      "pinyin": "fnn"
    },
    {
      "id": "hutao",
      "name": "胡桃",
      "enName": "Hu Tao",
      "gbCatId": 19485,
      "pinyin": "ht"
    },
    {
      "id": "arlecchino",
      "name": "阿蕾奇诺 (仆人)",
      "enName": "Arlecchino",
      "gbCatId": 28961,
      "pinyin": "alqn"
    },
    {
      "id": "yaemiko",
      "name": "八重神子",
      "enName": "Yae Miko",
      "gbCatId": 19515,
      "pinyin": "bcsz"
    },
    {
      "id": "ganyu",
      "name": "甘雨",
      "enName": "Ganyu",
      "gbCatId": 19483,
      "pinyin": "gy"
    },
    {
      "id": "yelan",
      "name": "夜兰",
      "enName": "Yelan",
      "gbCatId": 19517,
      "pinyin": "yl"
    },
    {
      "id": "ayaka",
      "name": "神里绫华",
      "enName": "Kamisato Ayaka",
      "gbCatId": 19488,
      "pinyin": "slly"
    },
    {
      "id": "aether",
      "name": "空 (男主)",
      "enName": "Aether",
      "gbCatId": 19510,
      "pinyin": "k"
    },
    {
      "id": "mavuika",
      "name": "玛薇卡",
      "enName": "Mavuika",
      "gbCatId": 31621,
      "pinyin": "mwk"
    },
    {
      "id": "navia",
      "name": "娜维娅",
      "enName": "Navia",
      "gbCatId": 26790,
      "pinyin": "nwy"
    },
    {
      "id": "keqing",
      "name": "刻晴",
      "enName": "Keqing",
      "gbCatId": 19490,
      "pinyin": "kq"
    },
    {
      "id": "jean",
      "name": "琴",
      "enName": "Jean",
      "gbCatId": 19465,
      "pinyin": "q"
    },
    {
      "id": "shenhe",
      "name": "申鹤",
      "enName": "Shenhe",
      "gbCatId": 19503,
      "pinyin": "sh"
    },
    {
      "id": "nilou",
      "name": "妮露",
      "enName": "Nilou",
      "gbCatId": 19495,
      "pinyin": "nl"
    },
    {
      "id": "eula",
      "name": "优菈",
      "enName": "Eula",
      "gbCatId": 19481,
      "pinyin": "yl"
    },
    {
      "id": "kokomi",
      "name": "珊瑚宫心海",
      "enName": "Sangonomiya Kokomi",
      "gbCatId": 19501,
      "pinyin": "shgxh"
    },
    {
      "id": "nahida",
      "name": "纳西妲",
      "enName": "Nahida",
      "gbCatId": 20058,
      "pinyin": "nxd"
    },
    {
      "id": "clorinde",
      "name": "克洛琳德",
      "enName": "Clorinde",
      "gbCatId": 29719,
      "pinyin": "klld"
    },
    {
      "id": "citlali",
      "name": "茜特菈莉",
      "enName": "Citlali",
      "gbCatId": 32438,
      "pinyin": "xtll"
    },
    {
      "id": "mona",
      "name": "莫娜",
      "enName": "Mona",
      "gbCatId": 18959,
      "pinyin": "mn"
    },
    {
      "id": "yoimiya",
      "name": "宵宫",
      "enName": "Yoimiya",
      "gbCatId": 19518,
      "pinyin": "xg"
    },
    {
      "id": "barbara",
      "name": "芭芭拉",
      "enName": "Barbara",
      "gbCatId": 19472,
      "pinyin": "bbl"
    },
    {
      "id": "xilonen",
      "name": "希诺宁",
      "enName": "Xilonen",
      "gbCatId": 32435,
      "pinyin": "xnn"
    },
    {
      "id": "mualani",
      "name": "玛拉妮",
      "enName": "Mualani",
      "gbCatId": 31500,
      "pinyin": "mln"
    },
    {
      "id": "noelle",
      "name": "诺艾尔",
      "enName": "Noelle",
      "gbCatId": 19466,
      "pinyin": "nae"
    },
    {
      "id": "fischl",
      "name": "菲谢尔",
      "enName": "Fischl",
      "gbCatId": 19482,
      "pinyin": "fxe"
    },
    {
      "id": "xianyun",
      "name": "闲云",
      "enName": "Xianyun",
      "gbCatId": 27548,
      "pinyin": "xy"
    },
    {
      "id": "sucrose",
      "name": "砂糖",
      "enName": "Sucrose",
      "gbCatId": 19506,
      "pinyin": "st"
    },
    {
      "id": "dehya",
      "name": "迪希雅",
      "enName": "Dehya",
      "gbCatId": 21555,
      "pinyin": "dxy"
    },
    {
      "id": "lynette",
      "name": "琳妮特",
      "enName": "Lynette",
      "gbCatId": 24624,
      "pinyin": "lnt"
    },
    {
      "id": "columbina",
      "name": "哥伦比娅 (少女)",
      "enName": "Columbina",
      "gbCatId": 42455,
      "pinyin": "glby"
    },
    {
      "id": "zhongli",
      "name": "钟离",
      "enName": "Zhongli",
      "gbCatId": 18989,
      "pinyin": "zl"
    },
    {
      "id": "kirara",
      "name": "绮良良",
      "enName": "Kirara",
      "gbCatId": 22960,
      "pinyin": "qll"
    },
    {
      "id": "wanderer",
      "name": "流浪者 (散兵)",
      "enName": "Wanderer",
      "gbCatId": 20311,
      "pinyin": "llz"
    },
    {
      "id": "diluc",
      "name": "迪卢克",
      "enName": "Diluc",
      "gbCatId": 19478,
      "pinyin": "dlk"
    },
    {
      "id": "rosaria",
      "name": "罗莎莉亚",
      "enName": "Rosaria",
      "gbCatId": 19500,
      "pinyin": "lsly"
    },
    {
      "id": "beidou",
      "name": "北斗",
      "enName": "Beidou",
      "gbCatId": 19473,
      "pinyin": "bd"
    },
    {
      "id": "neuvillette",
      "name": "那维莱特",
      "enName": "Neuvillette",
      "gbCatId": 25403,
      "pinyin": "nwlt"
    },
    {
      "id": "xiangling",
      "name": "香菱",
      "enName": "Xiangling",
      "gbCatId": 19511,
      "pinyin": "xl"
    },
    {
      "id": "bennett",
      "name": "班尼特",
      "enName": "Bennett",
      "gbCatId": 19474,
      "pinyin": "bnt"
    },
    {
      "id": "lisa",
      "name": "丽莎",
      "enName": "Lisa",
      "gbCatId": 19494,
      "pinyin": "ls"
    },
    {
      "id": "wriothesley",
      "name": "莱欧斯利",
      "enName": "Wriothesley",
      "gbCatId": 25512,
      "pinyin": "losl"
    },
    {
      "id": "shinobu",
      "name": "久岐忍",
      "enName": "Kuki Shinobu",
      "gbCatId": 19493,
      "pinyin": "jqr"
    },
    {
      "id": "kazuha",
      "name": "枫原万叶",
      "enName": "Kaedehara Kazuha",
      "gbCatId": 19486,
      "pinyin": "fywy"
    },
    {
      "id": "childe",
      "name": "达达利亚 (公子)",
      "enName": "Tartaglia",
      "gbCatId": 19507,
      "pinyin": "ddly"
    },
    {
      "id": "paimon",
      "name": "派蒙",
      "enName": "Paimon",
      "gbCatId": 20975,
      "pinyin": "pm"
    },
    {
      "id": "collei",
      "name": "柯莱",
      "enName": "Collei",
      "gbCatId": 19141,
      "pinyin": "kl"
    },
    {
      "id": "amber",
      "name": "安柏",
      "enName": "Amber",
      "gbCatId": 19470,
      "pinyin": "ab"
    },
    {
      "id": "chiori",
      "name": "千织",
      "enName": "Chiori",
      "gbCatId": 28268,
      "pinyin": "qz"
    },
    {
      "id": "alhaitham",
      "name": "艾尔海森",
      "enName": "Alhaitham",
      "gbCatId": 21708,
      "pinyin": "aehs"
    },
    {
      "id": "yanfei",
      "name": "烟绯",
      "enName": "Yanfei",
      "gbCatId": 19516,
      "pinyin": "yf"
    },
    {
      "id": "layla",
      "name": "莱依拉",
      "enName": "Layla",
      "gbCatId": 20057,
      "pinyin": "lyl"
    },
    {
      "id": "chasca",
      "name": "恰斯卡",
      "enName": "Chasca",
      "gbCatId": 33346,
      "pinyin": "qsk"
    },
    {
      "id": "charlotte",
      "name": "夏洛蒂",
      "enName": "Charlotte",
      "gbCatId": 23440,
      "pinyin": "xld"
    },
    {
      "id": "skirk",
      "name": "丝柯克",
      "enName": "Skirk",
      "gbCatId": 37532,
      "pinyin": "skk"
    },
    {
      "id": "venti",
      "name": "温迪",
      "enName": "Venti",
      "gbCatId": 19340,
      "pinyin": "wd"
    },
    {
      "id": "sara",
      "name": "九条裟罗",
      "enName": "Kujou Sara",
      "gbCatId": 19492,
      "pinyin": "jtsl"
    },
    {
      "id": "ningguang",
      "name": "凝光",
      "enName": "Ningguang",
      "gbCatId": 19496,
      "pinyin": "ng"
    },
    {
      "id": "faruzan",
      "name": "珐露珊",
      "enName": "Faruzan",
      "gbCatId": 20310,
      "pinyin": "fls"
    },
    {
      "id": "sandrone",
      "name": "木偶 (桑多涅)",
      "enName": "Sandrone",
      "gbCatId": 47014,
      "pinyin": "mo"
    },
    {
      "id": "yunjin",
      "name": "云堇",
      "enName": "Yun Jin",
      "gbCatId": 19519,
      "pinyin": "yj"
    },
    {
      "id": "xingqiu",
      "name": "行秋",
      "enName": "Xingqiu",
      "gbCatId": 19513,
      "pinyin": "xq"
    },
    {
      "id": "chevreuse",
      "name": "夏沃蕾",
      "enName": "Chevreuse",
      "gbCatId": 27117,
      "pinyin": "xwl"
    },
    {
      "id": "emilie",
      "name": "艾梅莉埃",
      "enName": "Emilie",
      "gbCatId": 31115,
      "pinyin": "amle"
    },
    {
      "id": "albedo",
      "name": "阿贝多",
      "enName": "Albedo",
      "gbCatId": 19467,
      "pinyin": "abd"
    },
    {
      "id": "itto",
      "name": "荒泷一斗",
      "enName": "Arataki Itto",
      "gbCatId": 19471,
      "pinyin": "hlyd"
    },
    {
      "id": "kaeya",
      "name": "凯亚",
      "enName": "Kaeya",
      "gbCatId": 19487,
      "pinyin": "ky"
    },
    {
      "id": "xiao",
      "name": "魈",
      "enName": "Xiao",
      "gbCatId": 19512,
      "pinyin": "x"
    },
    {
      "id": "candace",
      "name": "坎蒂丝",
      "enName": "Candace",
      "gbCatId": 19475,
      "pinyin": "kds"
    },
    {
      "id": "ayato",
      "name": "神里绫人",
      "enName": "Kamisato Ayato",
      "gbCatId": 19489,
      "pinyin": "slly"
    },
    {
      "id": "qiqi",
      "name": "七七",
      "enName": "Qiqi",
      "gbCatId": 19497,
      "pinyin": "qq"
    },
    {
      "id": "tighnari",
      "name": "提纳里",
      "enName": "Tighnari",
      "gbCatId": 19509,
      "pinyin": "tnl"
    },
    {
      "id": "cyno",
      "name": "赛诺",
      "enName": "Cyno",
      "gbCatId": 19477,
      "pinyin": "sn"
    },
    {
      "id": "kinich",
      "name": "基尼奇",
      "enName": "Kinich",
      "gbCatId": 32109,
      "pinyin": "jnq"
    },
    {
      "id": "chongyun",
      "name": "重云",
      "enName": "Chongyun",
      "gbCatId": 19476,
      "pinyin": "cy"
    },
    {
      "id": "heizou",
      "name": "鹿野院平藏",
      "enName": "Shikanoin Heizou",
      "gbCatId": 19504,
      "pinyin": "lyypz"
    },
    {
      "id": "klee",
      "name": "可莉",
      "enName": "Klee",
      "gbCatId": 19491,
      "pinyin": "kl"
    }
  ],
  "10349": [
    {
      "id": "all",
      "name": "全部角色",
      "enName": "All Characters",
      "gbCatId": null,
      "pinyin": "qbjs"
    },
    {
      "id": "kiana",
      "name": "琪亚娜",
      "enName": "Kiana Kaslana",
      "gbCatId": 23622,
      "pinyin": "qyn"
    },
    {
      "id": "mei",
      "name": "雷电芽衣",
      "enName": "Raiden Mei",
      "gbCatId": 23623,
      "pinyin": "ldyy"
    },
    {
      "id": "fuhua",
      "name": "符华",
      "enName": "Fu Hua",
      "gbCatId": 23627,
      "pinyin": "fh"
    },
    {
      "id": "bronya_hi3",
      "name": "布洛妮娅",
      "enName": "Bronya Zaychik",
      "gbCatId": 23624,
      "pinyin": "blny"
    },
    {
      "id": "elysia",
      "name": "爱莉希雅",
      "enName": "Elysia",
      "gbCatId": 23629,
      "pinyin": "alxy"
    },
    {
      "id": "theresa",
      "name": "德丽莎",
      "enName": "Theresa Apocalypse",
      "gbCatId": 23626,
      "pinyin": "dls"
    },
    {
      "id": "senadina",
      "name": "希娜狄雅",
      "enName": "Senadina",
      "gbCatId": 28446,
      "pinyin": "xndy"
    },
    {
      "id": "rita",
      "name": "丽塔",
      "enName": "Rita Rossweisse",
      "gbCatId": 28450,
      "pinyin": "lt"
    },
    {
      "id": "seele_hi3",
      "name": "希儿",
      "enName": "Seele Vollerei",
      "gbCatId": 28451,
      "pinyin": "xe"
    },
    {
      "id": "himeko_hi3",
      "name": "姬子",
      "enName": "Murata Himeko",
      "gbCatId": 23625,
      "pinyin": "jz"
    },
    {
      "id": "sushang_hi3",
      "name": "李素裳",
      "enName": "Li Sushang",
      "gbCatId": 28542,
      "pinyin": "lsc"
    },
    {
      "id": "yaesakura",
      "name": "八重樱",
      "enName": "Yae Sakura",
      "gbCatId": 28550,
      "pinyin": "bcy"
    },
    {
      "id": "durandal",
      "name": "幽兰黛尔",
      "enName": "Durandal",
      "gbCatId": 23636,
      "pinyin": "ylde"
    },
    {
      "id": "mobius",
      "name": "梅比乌斯",
      "enName": "Mobius",
      "gbCatId": 28536,
      "pinyin": "mbws"
    },
    {
      "id": "pardofelis",
      "name": "帕朵菲莉丝",
      "enName": "Pardofelis",
      "gbCatId": 28538,
      "pinyin": "pdfls"
    },
    {
      "id": "kallen",
      "name": "卡莲",
      "enName": "Kallen Kaslana",
      "gbCatId": 28551,
      "pinyin": "kl"
    },
    {
      "id": "aponia",
      "name": "阿波尼亚",
      "enName": "Aponia",
      "gbCatId": 28539,
      "pinyin": "abny"
    },
    {
      "id": "vita",
      "name": "薇塔",
      "enName": "Vita",
      "gbCatId": 45471,
      "pinyin": "wt"
    },
    {
      "id": "thelema",
      "name": "瑟莉姆",
      "enName": "Thelema Nutriscu",
      "gbCatId": 45468,
      "pinyin": "slm"
    },
    {
      "id": "songque",
      "name": "松雀",
      "enName": "Songque",
      "gbCatId": 45470,
      "pinyin": "sq"
    },
    {
      "id": "lantern",
      "name": "灯",
      "enName": "Lantern",
      "gbCatId": 45469,
      "pinyin": "d"
    },
    {
      "id": "sparkle_hi3",
      "name": "花火",
      "enName": "Sparkle",
      "gbCatId": 38632,
      "pinyin": "hh"
    }
  ],
  "18366": [
    {
      "id": "all",
      "name": "全部角色",
      "enName": "All Characters",
      "gbCatId": null,
      "pinyin": "qbjs"
    },
    {
      "id": "stelle",
      "name": "星 (女开拓者)",
      "enName": "Stelle",
      "gbCatId": 22826,
      "pinyin": "x"
    },
    {
      "id": "kafka",
      "name": "卡芙卡",
      "enName": "Kafka",
      "gbCatId": 23980,
      "pinyin": "kfk"
    },
    {
      "id": "topaz",
      "name": "托帕",
      "enName": "Topaz",
      "gbCatId": 25643,
      "pinyin": "tp"
    },
    {
      "id": "acheron",
      "name": "黄泉",
      "enName": "Acheron",
      "gbCatId": 28483,
      "pinyin": "hq"
    },
    {
      "id": "march7th",
      "name": "三月七",
      "enName": "March 7th",
      "gbCatId": 22815,
      "pinyin": "syq"
    },
    {
      "id": "ruanmei",
      "name": "阮·梅",
      "enName": "Ruan Mei",
      "gbCatId": 26948,
      "pinyin": "rm"
    },
    {
      "id": "firefly",
      "name": "流萤",
      "enName": "Firefly",
      "gbCatId": 29991,
      "pinyin": "ly"
    },
    {
      "id": "robin",
      "name": "知更鸟",
      "enName": "Robin",
      "gbCatId": 29217,
      "pinyin": "zgn"
    },
    {
      "id": "sparkle",
      "name": "花火",
      "enName": "Sparkle",
      "gbCatId": 27701,
      "pinyin": "hh"
    },
    {
      "id": "caelus",
      "name": "穹 (男开拓者)",
      "enName": "Caelus",
      "gbCatId": 22825,
      "pinyin": "q"
    },
    {
      "id": "jingliu",
      "name": "镜流",
      "enName": "Jingliu",
      "gbCatId": 25644,
      "pinyin": "jl"
    },
    {
      "id": "blackswan",
      "name": "黑天鹅",
      "enName": "Black Swan",
      "gbCatId": 27627,
      "pinyin": "hte"
    },
    {
      "id": "seele",
      "name": "希儿",
      "enName": "Seele",
      "gbCatId": 22820,
      "pinyin": "xe"
    },
    {
      "id": "himeko",
      "name": "姬子",
      "enName": "Himeko",
      "gbCatId": 22812,
      "pinyin": "jz"
    },
    {
      "id": "castorice",
      "name": "卡斯托丽丝",
      "enName": "Castorice",
      "gbCatId": 36361,
      "pinyin": "kstls"
    },
    {
      "id": "hyacine",
      "name": "风信子",
      "enName": "Hyacine",
      "gbCatId": 36978,
      "pinyin": "fxz"
    },
    {
      "id": "cyrene",
      "name": "塞壬",
      "enName": "Cyrene",
      "gbCatId": 40903,
      "pinyin": "sr"
    },
    {
      "id": "fuxuan",
      "name": "符玄",
      "enName": "Fu Xuan",
      "gbCatId": 23978,
      "pinyin": "fx"
    },
    {
      "id": "silverwolf",
      "name": "银狼",
      "enName": "Silver Wolf",
      "gbCatId": 23973,
      "pinyin": "yl"
    },
    {
      "id": "theherta",
      "name": "大黑塔",
      "enName": "The Herta",
      "gbCatId": 34587,
      "pinyin": "dht"
    },
    {
      "id": "bronya",
      "name": "布洛妮娅",
      "enName": "Bronya",
      "gbCatId": 22807,
      "pinyin": "blny"
    },
    {
      "id": "phainon",
      "name": "法伊农",
      "enName": "Phainon",
      "gbCatId": 37300,
      "pinyin": "fyn"
    },
    {
      "id": "feixiao",
      "name": "飞霄",
      "enName": "Feixiao",
      "gbCatId": 31814,
      "pinyin": "fx"
    },
    {
      "id": "tingyun",
      "name": "停云",
      "enName": "Tingyun",
      "gbCatId": 22823,
      "pinyin": "ty"
    },
    {
      "id": "evernight",
      "name": "永夜",
      "enName": "Evernight",
      "gbCatId": 39800,
      "pinyin": "yy"
    },
    {
      "id": "qingque",
      "name": "青雀",
      "enName": "Qingque",
      "gbCatId": 22818,
      "pinyin": "qq"
    },
    {
      "id": "aventurine",
      "name": "砂金",
      "enName": "Aventurine",
      "gbCatId": 28489,
      "pinyin": "sj"
    },
    {
      "id": "guinaifen",
      "name": "桂乃芬",
      "enName": "Guinaifen",
      "gbCatId": 25645,
      "pinyin": "gnf"
    },
    {
      "id": "aglaea",
      "name": "阿格莱雅",
      "enName": "Aglaea",
      "gbCatId": 35071,
      "pinyin": "agly"
    },
    {
      "id": "fugue",
      "name": "归忘之流萤/停云",
      "enName": "Fugue",
      "gbCatId": 33640,
      "pinyin": "gw"
    },
    {
      "id": "danheng",
      "name": "丹恒",
      "enName": "Dan Heng",
      "gbCatId": 22809,
      "pinyin": "dh"
    },
    {
      "id": "danhengil",
      "name": "丹恒·饮月",
      "enName": "Dan Heng Imbibitor Lunae",
      "gbCatId": 23979,
      "pinyin": "dhyy"
    },
    {
      "id": "jade",
      "name": "翡翠",
      "enName": "Jade",
      "gbCatId": 30426,
      "pinyin": "fc"
    },
    {
      "id": "sunday",
      "name": "星期日",
      "enName": "Sunday",
      "gbCatId": 33639,
      "pinyin": "xqr"
    },
    {
      "id": "natasha",
      "name": "娜塔莎",
      "enName": "Natasha",
      "gbCatId": 22816,
      "pinyin": "nts"
    },
    {
      "id": "blade",
      "name": "刃",
      "enName": "Blade",
      "gbCatId": 23977,
      "pinyin": "r"
    },
    {
      "id": "lingsha",
      "name": "灵砂",
      "enName": "Lingsha",
      "gbCatId": 32257,
      "pinyin": "ls"
    },
    {
      "id": "xueyi",
      "name": "雪衣",
      "enName": "Xueyi",
      "gbCatId": 26950,
      "pinyin": "xy"
    },
    {
      "id": "asta",
      "name": "艾丝妲",
      "enName": "Asta",
      "gbCatId": 22805,
      "pinyin": "asd"
    },
    {
      "id": "sampo",
      "name": "桑博",
      "enName": "Sampo",
      "gbCatId": 22819,
      "pinyin": "sb"
    },
    {
      "id": "huohuo",
      "name": "藿藿",
      "enName": "Huohuo",
      "gbCatId": 26330,
      "pinyin": "hh"
    },
    {
      "id": "gallagher",
      "name": "加拉赫",
      "enName": "Gallagher",
      "gbCatId": 28490,
      "pinyin": "jlh"
    },
    {
      "id": "clara",
      "name": "克拉拉",
      "enName": "Clara",
      "gbCatId": 22808,
      "pinyin": "kll"
    },
    {
      "id": "sushang",
      "name": "素裳",
      "enName": "Sushang",
      "gbCatId": 22822,
      "pinyin": "sc"
    },
    {
      "id": "jingyuan",
      "name": "景元",
      "enName": "Jing Yuan",
      "gbCatId": 22814,
      "pinyin": "jy"
    },
    {
      "id": "hanya",
      "name": "寒鸦",
      "enName": "Hanya",
      "gbCatId": 26600,
      "pinyin": "hy"
    },
    {
      "id": "rappa",
      "name": "乱破",
      "enName": "Rappa",
      "gbCatId": 32734,
      "pinyin": "lp"
    },
    {
      "id": "serval",
      "name": "希露瓦",
      "enName": "Serval",
      "gbCatId": 22821,
      "pinyin": "xlw"
    },
    {
      "id": "yukong",
      "name": "驭空",
      "enName": "Yukong",
      "gbCatId": 23976,
      "pinyin": "yk"
    },
    {
      "id": "argenti",
      "name": "银枝",
      "enName": "Argenti",
      "gbCatId": 26599,
      "pinyin": "yz"
    },
    {
      "id": "boothill",
      "name": "波提欧",
      "enName": "Boothill",
      "gbCatId": 30326,
      "pinyin": "bte"
    },
    {
      "id": "moze",
      "name": "貊泽",
      "enName": "Moze",
      "gbCatId": 31826,
      "pinyin": "mz"
    },
    {
      "id": "pela",
      "name": "佩拉",
      "enName": "Pela",
      "gbCatId": 22817,
      "pinyin": "pl"
    },
    {
      "id": "welt",
      "name": "瓦尔特",
      "enName": "Welt",
      "gbCatId": 22827,
      "pinyin": "wet"
    },
    {
      "id": "gepard",
      "name": "杰帕德",
      "enName": "Gepard",
      "gbCatId": 22810,
      "pinyin": "jpd"
    },
    {
      "id": "herta",
      "name": "黑塔",
      "enName": "Herta",
      "gbCatId": 22811,
      "pinyin": "ht"
    },
    {
      "id": "luocha",
      "name": "罗刹",
      "enName": "Luocha",
      "gbCatId": 23975,
      "pinyin": "ls"
    },
    {
      "id": "ratio",
      "name": "真理医生",
      "enName": "Dr. Ratio",
      "gbCatId": 26949,
      "pinyin": "zlys"
    },
    {
      "id": "jiaoqiu",
      "name": "椒丘",
      "enName": "Jiaoqiu",
      "gbCatId": 30950,
      "pinyin": "jq"
    },
    {
      "id": "lynx",
      "name": "玲可",
      "enName": "Lynx",
      "gbCatId": 23982,
      "pinyin": "lk"
    },
    {
      "id": "bailu",
      "name": "白露",
      "enName": "Bailu",
      "gbCatId": 22806,
      "pinyin": "bl"
    }
  ],
  "19567": [
    {
      "id": "all",
      "name": "全部角色",
      "enName": "All Characters",
      "gbCatId": null,
      "pinyin": "qbjs"
    },
    {
      "id": "miyabi",
      "name": "星见雅",
      "enName": "Hoshimi Miyabi",
      "gbCatId": 30579,
      "pinyin": "xjy"
    },
    {
      "id": "belle",
      "name": "铃 (女主)",
      "enName": "Belle",
      "gbCatId": 30334,
      "pinyin": "l"
    },
    {
      "id": "nicole",
      "name": "妮可",
      "enName": "Nicole Demara",
      "gbCatId": 30346,
      "pinyin": "nk"
    },
    {
      "id": "yixuan",
      "name": "仪玄",
      "enName": "Yixuan",
      "gbCatId": 37289,
      "pinyin": "yx"
    },
    {
      "id": "ellen",
      "name": "艾莲",
      "enName": "Ellen Joe",
      "gbCatId": 30341,
      "pinyin": "al"
    },
    {
      "id": "jane",
      "name": "简",
      "enName": "Jane Doe",
      "gbCatId": 30580,
      "pinyin": "j"
    },
    {
      "id": "astra",
      "name": "耀嘉音",
      "enName": "Astra Yao",
      "gbCatId": 34740,
      "pinyin": "yjy"
    },
    {
      "id": "anby",
      "name": "安比",
      "enName": "Anby Demara",
      "gbCatId": 30336,
      "pinyin": "ab"
    },
    {
      "id": "yanagi",
      "name": "月城柳",
      "enName": "Yanagi Tsukishiro",
      "gbCatId": 33018,
      "pinyin": "ycl"
    },
    {
      "id": "remielle",
      "name": "雷米尔",
      "enName": "Remielle Dan",
      "gbCatId": 47714,
      "pinyin": "lme"
    },
    {
      "id": "evelyn",
      "name": "伊芙琳",
      "enName": "Evelyn Chevalier",
      "gbCatId": 35123,
      "pinyin": "yfl"
    },
    {
      "id": "burnice",
      "name": "柏妮思",
      "enName": "Burnice White",
      "gbCatId": 32531,
      "pinyin": "bns"
    },
    {
      "id": "alice",
      "name": "爱丽丝",
      "enName": "Alice Thymefield",
      "gbCatId": 38196,
      "pinyin": "als"
    },
    {
      "id": "lucy",
      "name": "露西",
      "enName": "Luciana de Montefio",
      "gbCatId": 30344,
      "pinyin": "lx"
    },
    {
      "id": "qingyi",
      "name": "青衣",
      "enName": "Qingyi",
      "gbCatId": 30578,
      "pinyin": "qy"
    },
    {
      "id": "caesar",
      "name": "凯撒",
      "enName": "Caesar King",
      "gbCatId": 32164,
      "pinyin": "ks"
    },
    {
      "id": "vivian",
      "name": "薇薇安",
      "enName": "Vivian Banshee",
      "gbCatId": 36560,
      "pinyin": "wwa"
    },
    {
      "id": "zhuyuan",
      "name": "朱鸢",
      "enName": "Zhu Yuan",
      "gbCatId": 30350,
      "pinyin": "zy"
    },
    {
      "id": "yuzuha",
      "name": "浮波柚叶",
      "enName": "Yuzuha Ukinami",
      "gbCatId": 38177,
      "pinyin": "fbyy"
    },
    {
      "id": "piper",
      "name": "派派",
      "enName": "Piper Wheel",
      "gbCatId": 30347,
      "pinyin": "pp"
    },
    {
      "id": "yeshunguang",
      "name": "叶舜光",
      "enName": "Ye Shunguang",
      "gbCatId": 42116,
      "pinyin": "ysg"
    },
    {
      "id": "rina",
      "name": "丽娜",
      "enName": "Alexandrina Sebastiane",
      "gbCatId": 30335,
      "pinyin": "ln"
    },
    {
      "id": "velina",
      "name": "薇莉娜",
      "enName": "Velina Airgid",
      "gbCatId": 46553,
      "pinyin": "wln"
    },
    {
      "id": "trigger",
      "name": "扳机",
      "enName": "Trigger",
      "gbCatId": 36133,
      "pinyin": "bj"
    },
    {
      "id": "jufufu",
      "name": "橘福福",
      "enName": "Ju Fufu",
      "gbCatId": 37309,
      "pinyin": "jff"
    },
    {
      "id": "soldier11",
      "name": "11号",
      "enName": "Soldier 11",
      "gbCatId": 30348,
      "pinyin": "11h"
    },
    {
      "id": "seed",
      "name": "席德",
      "enName": "Seed",
      "gbCatId": 39338,
      "pinyin": "xd"
    },
    {
      "id": "grace",
      "name": "格莉丝",
      "enName": "Grace Howard",
      "gbCatId": 30342,
      "pinyin": "gls"
    },
    {
      "id": "wise",
      "name": "哲 (男主)",
      "enName": "Wise",
      "gbCatId": 30316,
      "pinyin": "z"
    },
    {
      "id": "dialyn",
      "name": "黛琳",
      "enName": "Dialyn",
      "gbCatId": 41303,
      "pinyin": "dl"
    },
    {
      "id": "zhao",
      "name": "照",
      "enName": "Zhao",
      "gbCatId": 42118,
      "pinyin": "z"
    },
    {
      "id": "claret",
      "name": "克拉蕾特",
      "enName": "Claret Flint",
      "gbCatId": 49001,
      "pinyin": "kllt"
    },
    {
      "id": "yidhari",
      "name": "伊德哈里",
      "enName": "Yidhari Murphy",
      "gbCatId": 40880,
      "pinyin": "ydhl"
    },
    {
      "id": "koleda",
      "name": "珂蕾妲",
      "enName": "Koleda Belobog",
      "gbCatId": 30343,
      "pinyin": "kld"
    },
    {
      "id": "lucia",
      "name": "露西亚",
      "enName": "Lucia Elowen",
      "gbCatId": 40361,
      "pinyin": "lxy"
    },
    {
      "id": "nekomata",
      "name": "猫又",
      "enName": "Nekomiya Mana",
      "gbCatId": 30345,
      "pinyin": "my"
    },
    {
      "id": "ssanby",
      "name": "零号·安比",
      "enName": "Soldier 0 Anby",
      "gbCatId": 35835,
      "pinyin": "lhab"
    },
    {
      "id": "aria",
      "name": "阿莉亚",
      "enName": "Aria",
      "gbCatId": 43004,
      "pinyin": "aly"
    },
    {
      "id": "pulchra",
      "name": "普尔克拉",
      "enName": "Pulchra Fellini",
      "gbCatId": 35673,
      "pinyin": "pekl"
    },
    {
      "id": "orphie",
      "name": "奥菲",
      "enName": "Orphie Magnusson",
      "gbCatId": 39946,
      "pinyin": "af"
    },
    {
      "id": "corin",
      "name": "可琳",
      "enName": "Corin Wickes",
      "gbCatId": 30340,
      "pinyin": "kl"
    },
    {
      "id": "billy",
      "name": "比利",
      "enName": "Billy Kid",
      "gbCatId": 30339,
      "pinyin": "bl"
    },
    {
      "id": "soukaku",
      "name": "苍角",
      "enName": "Soukaku",
      "gbCatId": 30349,
      "pinyin": "cj"
    },
    {
      "id": "cissia",
      "name": "茜西亚",
      "enName": "Cissia",
      "gbCatId": 44398,
      "pinyin": "xxy"
    },
    {
      "id": "sunna",
      "name": "苏娜",
      "enName": "Sunna",
      "gbCatId": 43003,
      "pinyin": "sn"
    },
    {
      "id": "promeia",
      "name": "普罗梅亚",
      "enName": "Promeia",
      "gbCatId": 45448,
      "pinyin": "plmy"
    },
    {
      "id": "lighter",
      "name": "莱特",
      "enName": "Lighter",
      "gbCatId": 33590,
      "pinyin": "lt"
    },
    {
      "id": "lycaon",
      "name": "莱卡恩",
      "enName": "Von Lycaon",
      "gbCatId": 30309,
      "pinyin": "lke"
    },
    {
      "id": "manato",
      "name": "间人",
      "enName": "Komano Manato",
      "gbCatId": 40360,
      "pinyin": "jr"
    },
    {
      "id": "norma",
      "name": "诺玛",
      "enName": "Norma Hollowell",
      "gbCatId": 46552,
      "pinyin": "nm"
    },
    {
      "id": "harumasa",
      "name": "浅羽悠真",
      "enName": "Asaba Harumasa",
      "gbCatId": 34036,
      "pinyin": "qbyz"
    },
    {
      "id": "seth",
      "name": "赛斯",
      "enName": "Seth Lowell",
      "gbCatId": 30577,
      "pinyin": "ss"
    },
    {
      "id": "anton",
      "name": "安东",
      "enName": "Anton Ivanov",
      "gbCatId": 30337,
      "pinyin": "ad"
    },
    {
      "id": "banyue",
      "name": "伴月",
      "enName": "Banyue",
      "gbCatId": 41775,
      "pinyin": "by"
    },
    {
      "id": "pyrois",
      "name": "皮洛斯",
      "enName": "Pyrois",
      "gbCatId": 46646,
      "pinyin": "pls"
    },
    {
      "id": "hugo",
      "name": "雨果",
      "enName": "Hugo Vlad",
      "gbCatId": 36836,
      "pinyin": "yg"
    },
    {
      "id": "roxy",
      "name": "洛克茜",
      "enName": "Roxy Ifrita Pryce",
      "gbCatId": 49002,
      "pinyin": "lkx"
    },
    {
      "id": "ben",
      "name": "本",
      "enName": "Ben Bigger",
      "gbCatId": 30338,
      "pinyin": "b"
    },
    {
      "id": "bangboo",
      "name": "邦布",
      "enName": "Bangboo",
      "gbCatId": 30702,
      "pinyin": "bb"
    }
  ],
  "20357": [
    {
      "id": "all",
      "name": "全部角色",
      "enName": "All Characters",
      "gbCatId": null,
      "pinyin": "qbjs"
    },
    {
      "id": "female_rover",
      "name": "漂泊者 (女主)",
      "enName": "Rover Female",
      "gbCatId": 30250,
      "pinyin": "pbz"
    },
    {
      "id": "changli",
      "name": "长离",
      "enName": "Changli",
      "gbCatId": 30265,
      "pinyin": "cl"
    },
    {
      "id": "shorekeeper",
      "name": "守岸人",
      "enName": "Shorekeeper",
      "gbCatId": 32220,
      "pinyin": "sar"
    },
    {
      "id": "yinlin",
      "name": "吟霖",
      "enName": "Yinlin",
      "gbCatId": 30261,
      "pinyin": "yl"
    },
    {
      "id": "camellya",
      "name": "椿",
      "enName": "Camellya",
      "gbCatId": 33179,
      "pinyin": "c"
    },
    {
      "id": "carlotta",
      "name": "珂莱塔",
      "enName": "Carlotta",
      "gbCatId": 34264,
      "pinyin": "klt"
    },
    {
      "id": "jinhsi",
      "name": "今汐",
      "enName": "Jinhsi",
      "gbCatId": 30264,
      "pinyin": "jx"
    },
    {
      "id": "male_rover",
      "name": "漂泊者 (男主)",
      "enName": "Rover Male",
      "gbCatId": 30249,
      "pinyin": "pbz"
    },
    {
      "id": "cartethyia",
      "name": "卡特西娅",
      "enName": "Cartethyia",
      "gbCatId": 37392,
      "pinyin": "ktxy"
    },
    {
      "id": "phoebe",
      "name": "菲比",
      "enName": "Phoebe",
      "gbCatId": 35119,
      "pinyin": "fb"
    },
    {
      "id": "cantarella",
      "name": "坎特蕾拉",
      "enName": "Cantarella",
      "gbCatId": 36003,
      "pinyin": "ktll"
    },
    {
      "id": "chisa",
      "name": "千咲",
      "enName": "Chisa",
      "gbCatId": 41155,
      "pinyin": "qx"
    },
    {
      "id": "aemeath",
      "name": "艾蜜斯",
      "enName": "Aemeath",
      "gbCatId": 43048,
      "pinyin": "ams"
    },
    {
      "id": "augusta",
      "name": "奥古斯塔",
      "enName": "Augusta",
      "gbCatId": 39143,
      "pinyin": "agst"
    },
    {
      "id": "iuno",
      "name": "朱诺",
      "enName": "Iuno",
      "gbCatId": 39624,
      "pinyin": "zn"
    },
    {
      "id": "zani",
      "name": "赞妮",
      "enName": "Zani",
      "gbCatId": 36665,
      "pinyin": "zn"
    },
    {
      "id": "sanhua",
      "name": "散华",
      "enName": "Sanhua",
      "gbCatId": 30252,
      "pinyin": "sh"
    },
    {
      "id": "lupa",
      "name": "卢帕",
      "enName": "Lupa",
      "gbCatId": 37891,
      "pinyin": "lp"
    },
    {
      "id": "hiyuki",
      "name": "绯雪",
      "enName": "Hiyuki",
      "gbCatId": 44603,
      "pinyin": "fx"
    },
    {
      "id": "phrolova",
      "name": "弗洛洛",
      "enName": "Phrolova",
      "gbCatId": 38371,
      "pinyin": "fll"
    },
    {
      "id": "lynae",
      "name": "莱奈",
      "enName": "Lynae",
      "gbCatId": 41929,
      "pinyin": "ln"
    },
    {
      "id": "zhezhi",
      "name": "折枝",
      "enName": "Zhezhi",
      "gbCatId": 30472,
      "pinyin": "zz"
    },
    {
      "id": "baizhi",
      "name": "白芷",
      "enName": "Baizhi",
      "gbCatId": 30251,
      "pinyin": "bz"
    },
    {
      "id": "galbrena",
      "name": "迦布丽娜",
      "enName": "Galbrena",
      "gbCatId": 40281,
      "pinyin": "jbln"
    },
    {
      "id": "ciaccona",
      "name": "恰空",
      "enName": "Ciaccona",
      "gbCatId": 36990,
      "pinyin": "qk"
    },
    {
      "id": "jianxin",
      "name": "鉴心",
      "enName": "Jianxin",
      "gbCatId": 30263,
      "pinyin": "jx"
    },
    {
      "id": "qingxiao",
      "name": "青霄",
      "enName": "Qingxiao",
      "gbCatId": 46596,
      "pinyin": "qx"
    },
    {
      "id": "yangyang",
      "name": "泱泱",
      "enName": "Yangyang",
      "gbCatId": 30246,
      "pinyin": "yy"
    },
    {
      "id": "danjin",
      "name": "丹瑾",
      "enName": "Danjin",
      "gbCatId": 30255,
      "pinyin": "dj"
    },
    {
      "id": "suisui",
      "name": "穗穗",
      "enName": "Suisui",
      "gbCatId": 46595,
      "pinyin": "ss"
    },
    {
      "id": "mornye",
      "name": "莫尔奈",
      "enName": "Mornye",
      "gbCatId": 41930,
      "pinyin": "men"
    },
    {
      "id": "chixia",
      "name": "炽霞",
      "enName": "Chixia",
      "gbCatId": 30247,
      "pinyin": "cx"
    },
    {
      "id": "verina",
      "name": "维里奈",
      "enName": "Verina",
      "gbCatId": 30248,
      "pinyin": "wln"
    },
    {
      "id": "taoqi",
      "name": "桃祈",
      "enName": "Taoqi",
      "gbCatId": 30254,
      "pinyin": "tq"
    },
    {
      "id": "encore",
      "name": "安可",
      "enName": "Encore",
      "gbCatId": 30253,
      "pinyin": "ak"
    },
    {
      "id": "lucilla",
      "name": "洛瑟菈",
      "enName": "Lucilla",
      "gbCatId": 44604,
      "pinyin": "lsl"
    },
    {
      "id": "xiangliyao",
      "name": "相里要",
      "enName": "Xiangli Yao",
      "gbCatId": 30471,
      "pinyin": "xly"
    },
    {
      "id": "jiyan",
      "name": "忌炎",
      "enName": "Jiyan",
      "gbCatId": 30256,
      "pinyin": "jy"
    },
    {
      "id": "calcharo",
      "name": "卡卡罗",
      "enName": "Calcharo",
      "gbCatId": 30262,
      "pinyin": "kkl"
    },
    {
      "id": "roccia",
      "name": "洛琪亚",
      "enName": "Roccia",
      "gbCatId": 34733,
      "pinyin": "lqy"
    },
    {
      "id": "lumi",
      "name": "灯灯",
      "enName": "Lumi",
      "gbCatId": 33764,
      "pinyin": "dd"
    },
    {
      "id": "youhu",
      "name": "釉瑚",
      "enName": "Youhu",
      "gbCatId": 33791,
      "pinyin": "yh"
    },
    {
      "id": "mortefi",
      "name": "莫特斐",
      "enName": "Mortefi",
      "gbCatId": 30258,
      "pinyin": "mtf"
    },
    {
      "id": "yuanwu",
      "name": "渊武",
      "enName": "Yuanwu",
      "gbCatId": 30260,
      "pinyin": "yw"
    },
    {
      "id": "lingyang",
      "name": "凌阳",
      "enName": "Lingyang",
      "gbCatId": 30259,
      "pinyin": "ly"
    },
    {
      "id": "aalto",
      "name": "秋水",
      "enName": "Aalto",
      "gbCatId": 30257,
      "pinyin": "qs"
    }
  ],
  "21842": [
    {
      "id": "all",
      "name": "全部角色",
      "enName": "All Characters",
      "gbCatId": null,
      "pinyin": "qbjs"
    },
    {
      "id": "endministrator_f",
      "name": "管理员 (女)",
      "enName": "Endministrator (F)",
      "gbCatId": 42719,
      "pinyin": "glyn"
    },
    {
      "id": "yvonne",
      "name": "伊冯",
      "enName": "Yvonne",
      "gbCatId": 42742,
      "pinyin": "yf"
    },
    {
      "id": "zhuangfangyi",
      "name": "庄芳仪",
      "enName": "Zhuang Fangyi",
      "gbCatId": 44984,
      "pinyin": "zfy"
    },
    {
      "id": "laevatain",
      "name": "莱万汀",
      "enName": "Laevatain",
      "gbCatId": 42734,
      "pinyin": "lwt"
    },
    {
      "id": "perlica",
      "name": "佩丽卡",
      "enName": "Perlica",
      "gbCatId": 42737,
      "pinyin": "plk"
    },
    {
      "id": "gilberta",
      "name": "洁尔佩塔",
      "enName": "Gilberta",
      "gbCatId": 42733,
      "pinyin": "jept"
    },
    {
      "id": "lastrite",
      "name": "别礼",
      "enName": "Last Rite",
      "gbCatId": 42735,
      "pinyin": "bl"
    },
    {
      "id": "chenqianyu",
      "name": "陈千语",
      "enName": "Chen Qianyu",
      "gbCatId": 42728,
      "pinyin": "cqy"
    },
    {
      "id": "fluorite",
      "name": "萤石",
      "enName": "Fluorite",
      "gbCatId": 42732,
      "pinyin": "ys"
    },
    {
      "id": "mifu",
      "name": "米芙",
      "enName": "Mi Fu",
      "gbCatId": 46272,
      "pinyin": "mf"
    },
    {
      "id": "ember",
      "name": "余烬",
      "enName": "Ember",
      "gbCatId": 42730,
      "pinyin": "yj"
    },
    {
      "id": "liino",
      "name": "莉诺",
      "enName": "Liino",
      "gbCatId": 48075,
      "pinyin": "ln"
    },
    {
      "id": "arcane",
      "name": "奥秘",
      "enName": "Arcane",
      "gbCatId": 47395,
      "pinyin": "am"
    },
    {
      "id": "tangtang",
      "name": "汤汤",
      "enName": "Tangtang",
      "gbCatId": 44247,
      "pinyin": "tt"
    },
    {
      "id": "akekuri",
      "name": "阿克库里",
      "enName": "Akekuri",
      "gbCatId": 42721,
      "pinyin": "akkl"
    },
    {
      "id": "typhoeus",
      "name": "提丰",
      "enName": "Typhoeus",
      "gbCatId": 48868,
      "pinyin": "tf"
    },
    {
      "id": "xaihi",
      "name": "赛希",
      "enName": "Xaihi",
      "gbCatId": 42741,
      "pinyin": "sx"
    },
    {
      "id": "endministrator_m",
      "name": "管理员 (男)",
      "enName": "Endministrator (M)",
      "gbCatId": 42720,
      "pinyin": "glyn"
    },
    {
      "id": "arclight",
      "name": "弧光",
      "enName": "Arclight",
      "gbCatId": 42724,
      "pinyin": "hg"
    },
    {
      "id": "avywenna",
      "name": "艾维文娜",
      "enName": "Avywenna",
      "gbCatId": 42726,
      "pinyin": "awwn"
    },
    {
      "id": "ardelia",
      "name": "阿尔黛莉亚",
      "enName": "Ardelia",
      "gbCatId": 42725,
      "pinyin": "aedly"
    },
    {
      "id": "pogranichnik",
      "name": "边境哨卫",
      "enName": "Pogranichnik",
      "gbCatId": 42738,
      "pinyin": "bjsw"
    },
    {
      "id": "wulfgard",
      "name": "狼卫",
      "enName": "Wulfgard",
      "gbCatId": 42740,
      "pinyin": "lw"
    },
    {
      "id": "estella",
      "name": "艾丝黛拉",
      "enName": "Estella",
      "gbCatId": 42731,
      "pinyin": "asdl"
    },
    {
      "id": "rossi",
      "name": "洛茜",
      "enName": "Rossi",
      "gbCatId": 44510,
      "pinyin": "lx"
    },
    {
      "id": "camille",
      "name": "卡米尔",
      "enName": "Camille",
      "gbCatId": 46924,
      "pinyin": "kme"
    },
    {
      "id": "antal",
      "name": "安塔尔",
      "enName": "Antal",
      "gbCatId": 42723,
      "pinyin": "ate"
    },
    {
      "id": "lifeng",
      "name": "黎风",
      "enName": "Lifeng",
      "gbCatId": 42736,
      "pinyin": "lf"
    },
    {
      "id": "catcher",
      "name": "捕手",
      "enName": "Catcher",
      "gbCatId": 42727,
      "pinyin": "bs"
    },
    {
      "id": "snowshine",
      "name": "昼雪",
      "enName": "Snowshine",
      "gbCatId": 42739,
      "pinyin": "zx"
    },
    {
      "id": "alesh",
      "name": "阿列什",
      "enName": "Alesh",
      "gbCatId": 42722,
      "pinyin": "als"
    },
    {
      "id": "dapan",
      "name": "大潘",
      "enName": "Da Pan",
      "gbCatId": 42729,
      "pinyin": "dp"
    }
  ]
};

const GAME_KEY_TO_ID = {
  endfield: 21842,
  zzz: 19567,
  "wuthering-waves": 20357,
  wuwa: 20357,
  "honkai-star-rail": 18366,
  hsr: 18366,
  genshin: 8552,
  gi: 8552,
  "honkai-impact-3rd": 10349,
  hi3: 10349
};

function resolveGameId(val) {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (!val) return 19567;
  const str = String(val).trim().toLowerCase();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  return GAME_KEY_TO_ID[str] || 19567;
}

function getCharactersForGame(gameId) {
  const resolved = resolveGameId(gameId);
  return CHARACTERS_BY_GAME[resolved] || CHARACTERS_BY_GAME[19567] || [];
}

export {
  CHARACTERS_BY_GAME,
  getCharactersForGame,
  resolveGameId
}
