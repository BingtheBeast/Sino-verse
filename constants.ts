export const NOVELS_STORAGE_KEY = 'novels_v3';

export const DEFAULT_CHINESE_GLOSSARY = `
# --- General Terms ---
'前辈' = 'Senior'
'晚辈' = 'Junior'
'弟子' = 'Disciple'
'师父' = 'Master'
'师兄' = 'Senior Brother'
'师弟' = 'Junior Brother'
'师姐' = 'Senior Sister'
'师妹' = 'Junior Sister'
'掌门' = 'Sect Leader'
'长老' = 'Elder'
'宗门' = 'Sect'
'家族' = 'Family'
'公子' = 'Young Master'
'小姐' = 'Young Miss'
'道' = 'Dao'
'道友' = 'Daoist Friend'
'内力' = 'Internal Energy'
'修为' = 'Cultivation'
'境界' = 'Realm'
'突破' = 'Breakthrough'
'瓶颈' = 'Bottleneck'
'心魔' = 'Inner Demon'
'神识' = 'Spiritual Sense'
'元神' = 'Primordial Spirit'
'洞府' = 'Cave Residence'
'秘境' = 'Secret Realm'
'法宝' = 'Magic Treasure'
'灵石' = 'Spirit Stone'
'丹药' = 'Elixir'
'功法' = 'Cultivation Technique'
'神通' = 'Divine Ability'
'阵法' = 'Formation'
'符箓' = 'Talisman'
'妖兽' = 'Yao Beast'
'魔兽' = 'Demonic Beast'
'天劫' = 'Heavenly Tribulation'
'飞升' = 'Ascend'
'轮回' = 'Samsara'
'因果' = 'Karma'

# --- Cultivation Realms (Common) ---
'炼气' = 'Qi Refining'
'筑基' = 'Foundation Establishment'
'金丹' = 'Golden Core'
'元婴' = 'Nascent Soul'
'化神' = 'Spirit Severing'
'炼虚' = 'Void Refining'
'合体' = 'Body Integration'
'大乘' = 'Mahayana'
'渡劫' = 'Tribulation'
`;

export const DEFAULT_KOREAN_GLOSSARY = `
# --- General Terms ---
'헌터' = 'Hunter'
'게이트' = 'Gate'
'던전' = 'Dungeon'
'몬스터' = 'Monster'
'마물' = 'Magic Beast'
'마석' = 'Magic Stone'
'길드' = 'Guild'
'길드장' = 'Guild Master'
'각성' = 'Awakening'
'각성자' = 'Awakened'
'플레이어' = 'Player'
'시스템' = 'System'
'레벨' = 'Level'
'스킬' = 'Skill'
'아이템' = 'Item'
'인벤토리' = 'Inventory'
'퀘스트' = 'Quest'
'회귀' = 'Regression'
'환생' = 'Reincarnation'
'빙의' = 'Possession'
'랭커' = 'Ranker'
'랭킹' = 'Ranking'
'상태창' = 'Status Window'
'S급' = 'S-Rank'
'A급' = 'A-Rank'
'B급' = 'B-Rank'
'C급' = 'C-Rank'
'D급' = 'D-Rank'
'E급' = 'E-Rank'
'F급' = 'F-Rank'

# --- Common Roles ---
'탱커' = 'Tank'
'딜러' = 'Dealer'
'힐러' = 'Healer'
'서포터' = 'Support'
'마법사' = 'Mage'
'궁수' = 'Archer'
'검사' = 'Swordsman'

# --- Titles / Honorifics (Romanized) ---
'-님' = '-nim'
'-씨' = '-ssi'
'형' = 'Hyung'
'오빠' = 'Oppa'
'누나' = 'Noona'
'언니' = 'Unnie'
'아저씨' = 'Ahjussi'
'아줌마' = 'Ahjumma'
`;

export const LANGUAGE_CONFIG = {
  chinese: {
    system_prompt: `You are a translation assistant specialized in translating Chinese web novels into English.
Your task is to translate the text into English, ensuring that all terms from the glossary are accurately translated as specified.
The translation should be natural-sounding and maintain the tone and style of the original text.
Preserve the original paragraph structure and formatting.
Do not add any extra text, commentary, or annotations.`,
    
    glossary_prompt: `Here is the glossary you must follow:
--- GLOSSARY START ---
{{GLOSSARY}}
--- GLOSSARY END ---`
  },
  korean: {
    system_prompt: `You are a translation assistant specialized in translating Korean web novels into English.
Your task is to translate the text into English, ensuring that all terms from the glossary are accurately translated as specified.
The translation should be natural-sounding and maintain the tone and style of the original text.
Preserve the original paragraph structure and formatting.
Do not add any extra text, commentary, or annotations.`,
    
    glossary_prompt: `Here is the glossary you must follow:
--- GLOSSARY START ---
{{GLOSSARY}}
--- GLOSSARY END ---`
  },
};

export const GLOSSARY_SUGGESTION_PROMPT = `Analyze the following novel context/synopsis for a {{LANGUAGE_NAME}} web novel. Your goal is to identify key proper nouns (character names, places, sects, skills, items) and important recurring terms in their original {{LANGUAGE_NAME}} script.

For each term you identify, provide a suitable English translation or a standard pinyin/romanization for proper nouns.

The output MUST be a simple list in the following format:
'Original Term in {{LANGUAGE_NAME}}' = 'Suggested English Translation'

RULES:
1.  ONLY output the list. Do not include any other commentary, headings, or explanations.
2.  If the provided context is in English, do your best to infer the original terms and their spellings in {{LANGUAGE_NAME}}.

CONTEXT:
"""
{{CONTEXT}}
"""
`;

type RegexRule = {
  pattern: RegExp;
  replacement: string;
};

// A list of find-and-replace rules to clean text BEFORE translation
export const PRE_TRANSLATION_RULES: RegexRule[] = [
  // FAULTY RULE REMOVED
  
  // Rule 1: Removes excessive blank lines
  {
    pattern: /\n{3,}/g,
    replacement: '\n\n',
  },
  
  // --- ENHANCED JUNK RULES ---
  
  // Rule 2: Remove common ad/junk lines (case-insensitive)
  {
    pattern: /Advertisement/gi,
    replacement: '',
  },
  {
    pattern: /Please support our website/gi,
    replacement: '',
  },
  {
    pattern: /This chapter was translated by .*/gi,
    replacement: '',
  },
  {
    pattern: /Share this chapter/gi,
    replacement: '',
  },
  {
    pattern: /read the latest chapter at/gi,
    replacement: '',
  },

  // Rule 3: Add your own language-specific junk rules here
  // (Example for Chinese ads)
  {
    pattern: /.*广告.*/g, // Removes any line containing "广告" (advertisement)
    replacement: '',
  },
  // (Example for Korean ads)
  {
    pattern: /.*광고.*/g, // Removes any line containing "광고" (advertisement)
    replacement: '',
  },
];
