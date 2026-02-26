// script.js (FULL) — CoA Calculator
// Includes: boosts (World + Stars + Relic), set bonus, alchemy modes, smithing smelt/forge,
// mining bag tiers, inventories needed, mobs A-Z tabs, highscores loader via Worker,
// manual overrides per username+mode (localStorage), ✅ hides boosts in Lone Wolf mode,
// ✅ and locks mode after a successful load (prevents switching to the wrong mode).

// ---- SAFETY NORMALIZER (KEEP AT VERY TOP) ----
(function normalizeSkills() {
  // if your data uses "magic" but your UI uses "mage"
  if (typeof skills !== "undefined" && skills?.magic && !skills?.mage) skills.mage = skills.magic;

  // ensure skills.<key>.items always exists
  for (const k of Object.keys((typeof skills !== "undefined" ? skills : {}) || {})) {
    const s = skills[k];
    if (!s) continue;

    if (!Array.isArray(s.items)) s.items = [];

    // alchemy uses plants/brews too
    if (k === "alchemy") {
      if (!Array.isArray(s.plants)) s.plants = [];
      if (!Array.isArray(s.brews)) s.brews = [];
    }
  }
})();

// ---------- State ----------
let activeSkillKey = "fishing";
let selectedItemKey = (skills?.[activeSkillKey]?.items?.[0]?.key) || "";

// Alchemy modes
let alchemyMode = "gather_only"; // gather_only | brew_only | gather_brew

// Smithing modes
let smithingMode = "smelt"; // smelt | forge
let smithingBarKey = "bronze"; // bronze|iron|steel|crimsteel|silver|gold|mythan|cobalt|varaxite|magic|other

// Mobs alphabetical tab
let mobLetterKey = "A";

// Mining bag tier (0=none, 1..3)
let miningBagTier = 0;

// Mode lock (after successful load)
let loadedAccountMode = null; // null | "normal" | "lonewolf"

// ---------- Elements ----------
const tabs = Array.from(document.querySelectorAll('button.tab[data-skill]'));
const skillTitle = document.getElementById("skillTitle");
const currentLabel = document.getElementById("currentLabel");
const targetLabel = document.getElementById("targetLabel");
const selectHint = document.getElementById("selectHint");
const itemButtonsDiv = document.getElementById("itemButtons");

const currentLevelInput = document.getElementById("currentLevel");
const targetLevelInput = document.getElementById("targetLevel");
const currentXPInput = document.getElementById("currentXP");

const chosenP = document.getElementById("chosen");
const resultP = document.getElementById("result");

const worldBoostInput = document.getElementById("worldBoost");
const bonusStarsInput = document.getElementById("bonusStars");
const wisdomRelicInput = document.getElementById("wisdomRelic");

const worldBoostRow = document.getElementById("worldBoostRow");
const bonusStarsRow = document.getElementById("bonusStarsRow");

const inventoriesP = document.getElementById("inventories");

const smithingInfernalBox = document.getElementById("smithingInfernalBox");
const infernalHammerInput = document.getElementById("infernalHammer");
const infernalRingInput = document.getElementById("infernalRing");

const miningProspectorBox = document.getElementById("miningProspectorBox");
const prospectorsNeckInput = document.getElementById("prospectorsNeck");

const miningBagBox = document.getElementById("miningBagBox");

const materialsBox = document.getElementById("materialsBox");
const materialsList = document.getElementById("materialsList");
const materialsTitle = document.getElementById("materialsTitle");

const setBonusBox = document.getElementById("setBonusBox");
const relicNameSpan = document.getElementById("relicName");
const relicIconImg = document.getElementById("relicIcon");

const alchemyModeBox = document.getElementById("alchemyModeBox");
const smithingModeBox = document.getElementById("smithingModeBox");
const smithingBarBox = document.getElementById("smithingBarBox");
const smithingBarTabs = document.getElementById("smithingBarTabs");

// Highscores UI
const usernameInput = document.getElementById("usernameInput");
const loadStatsBtn = document.getElementById("loadStatsBtn");
const clearStatsBtn = document.getElementById("clearStatsBtn");
const statsStatus = document.getElementById("statsStatus");
const statsSummaryDetails = document.getElementById("statsSummaryDetails");
const statsSummaryList = document.getElementById("statsSummaryList");

// Manual Overrides UI
const overrideEnabledInput = document.getElementById("overrideEnabled");
const saveOverridesBtn = document.getElementById("saveOverridesBtn");
const clearOverridesBtn = document.getElementById("clearOverridesBtn");

const OV_KEYS = ["melee","mage","mining","smithing","woodcutting","crafting","fishing","cooking","spellbinding","alchemy"];
const ovInputs = Object.fromEntries(OV_KEYS.map(k => [k, document.getElementById(`ov_${k}`)]));

// ---------- Constants ----------
const RELIC_MULT = 1.049925925925926;
const WORLD_MULT = 1.5;
const STARS_MULT = 2;
const INFERNAL_MULT = 1.04;
const PROSPECTORS_NECK_MULT = 1.05;

const INV_SIZE = 36;

// Cloudflare Worker base (proxy)
const HISCORE_PROXY_BASE = "https://connecting.xlin1731.workers.dev";

// ---------- Mode helpers ----------
function getModeSelected() {
  return (document.querySelector('input[name="hiscoreMode"]:checked')?.value) || "normal";
}

function setModeSelected(mode) {
  const radios = document.querySelectorAll('input[name="hiscoreMode"]');
  radios.forEach(r => {
    if (r.value === mode) r.checked = true;
  });
}

function lockModeUI(modeOrNull) {
  const radios = document.querySelectorAll('input[name="hiscoreMode"]');
  if (!modeOrNull) {
    radios.forEach(r => (r.disabled = false));
    return;
  }
  radios.forEach(r => {
    r.disabled = (r.value !== modeOrNull);
    if (r.value === modeOrNull) r.checked = true;
  });
}

function isStatsLoaded() {
  const cache = window.__coaStatCache || {};
  return Object.keys(cache).length > 0;
}

// ---------- Boost visibility (Normal vs Lone Wolf) ----------
function updateBoostVisibilityByMode(forceMode) {
  const mode = forceMode || getModeSelected();
  const isLW = mode === "lonewolf";

  if (worldBoostRow) worldBoostRow.style.display = isLW ? "none" : "";
  if (bonusStarsRow) bonusStarsRow.style.display = isLW ? "none" : "";

  if (isLW) {
    if (worldBoostInput) worldBoostInput.checked = false;
    if (bonusStarsInput) bonusStarsInput.checked = false;
  }

  calculate();
}

// ---------- Manual Overrides helpers ----------
function normUser(u){ return String(u||"").trim().toLowerCase(); }

function overridesStorageKey(username, mode){
  return `coa_overrides:${mode}:${normUser(username)}`;
}

function clampLvl(n){
  n = Number(n);
  if (!Number.isFinite(n)) return null;
  n = Math.floor(n);
  return Math.max(1, Math.min(120, n));
}

function loadOverrides(username, mode){
  try {
    const raw = localStorage.getItem(overridesStorageKey(username, mode));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveOverrides(username, mode, data){
  localStorage.setItem(overridesStorageKey(username, mode), JSON.stringify(data || {}));
}

function clearOverrides(username, mode){
  localStorage.removeItem(overridesStorageKey(username, mode));
}

function fillOverrideInputs(obj){
  for (const k of OV_KEYS){
    const el = ovInputs[k];
    if (!el) continue;
    el.value = (obj && Number.isFinite(obj[k])) ? obj[k] : "";
  }
}

function readOverrideInputs(){
  const out = {};
  for (const k of OV_KEYS){
    const el = ovInputs[k];
    if (!el) continue;
    const v = clampLvl(el.value);
    if (v !== null) out[k] = v;
  }
  return out;
}

function refreshOverrideUI(){
  if (!usernameInput) return;
  const user = usernameInput.value || "";
  const mode = getModeSelected();
  fillOverrideInputs(loadOverrides(user, mode));
}

function applyOverridesToCache(username, mode){
  if (!overrideEnabledInput) return false;
  if (!overrideEnabledInput.checked) return false;

  const ov = loadOverrides(username, mode);
  if (!ov) return false;

  window.__coaStatCache = window.__coaStatCache || {};

  const map = {
    melee: "melee",
    mage: "mage",
    mining: "mining",
    smithing: "smithing",
    woodcutting: "woodcutting",
    crafting: "crafting",
    fishing: "fishing",
    cooking: "cooking",
    spellbinding: "spellbinding",
    alchemy: "alchemy",
  };

  for (const [src, dst] of Object.entries(map)) {
    if (!Number.isFinite(ov[src])) continue;
    window.__coaStatCache[dst] = window.__coaStatCache[dst] || {};
    window.__coaStatCache[dst].level = clampLevel(ov[src]);
  }

  const cur = window.__coaStatCache[activeSkillKey]?.level;
  if (Number.isFinite(cur) && currentLevelInput) {
    currentLevelInput.value = clampLevel(cur);
    if (currentXPInput) currentXPInput.value = 0;
  }
  return true;
}

// ---------- ICON MAPS ----------
const CRAFTING_ICON_MAP = {
  relic_accuracy: "./Icons/Crafting/Accuracy_Relic.png",
  relic_affliction: "./Icons/Crafting/Affliction_Relic.png",
  cursed_relic: "./Icons/Crafting/Cursed_Relic.png",
  relic_damage: "./Icons/Crafting/Damage_Relic.png",
  relic_efficiency: "./Icons/Crafting/Efficiency_Relic.png",
  relic_experience: "./Icons/Crafting/Experience_Relic.png",
  relic_fire: "./Icons/Crafting/Fire_Relic.png",
  relic_guarding: "./Icons/Crafting/Guarding_Relic.png",
  relic_healing: "./Icons/Crafting/Healing_Relic.png",
  ice_relic: "./Icons/Crafting/Ice_Relic.png",
  relic_leeching: "./Icons/Crafting/Leeching_Relic.png",
  relic_nature: "./Icons/Crafting/Nature_Relic.png",
  relic_power: "./Icons/Crafting/Power_Relic.png",
  relic_unbroken: "./Icons/Crafting/Unbroken_Relic.png",
  relic_wealth: "./Icons/Crafting/Wealth_Relic.png",
  relic_wisdom: "./Icons/Crafting/Wisdom_Relic.png",
};

const MINING_ICON_MAP = {
  black_salt: "./Icons/Mining/Black_Salt.png",
  coal: "./Icons/Mining/Coal.png",
  cobalt: "./Icons/Mining/Cobalt_Ore.png",
  copper: "./Icons/Mining/Copper_Ore.png",
  crimsteel: "./Icons/Mining/Crimsteel_Ore.png",
  gold: "./Icons/Mining/Gold_Ore.png",
  iron: "./Icons/Mining/Iron_Ore.png",
  magic_ore: "./Icons/Mining/Magic_Ore.png",
  mythan: "./Icons/Mining/Mythan_Ore.png",
  naturite: "./Icons/Mining/Naturite.png",
  obsidian: "./Icons/Mining/Obsidian.png",
  pink_salt: "./Icons/Mining/Pink_salt.png",
  salt: "./Icons/Mining/Salt.png",
  sandstone: "./Icons/Mining/Sandstone.png",
  silver: "./Icons/Mining/Silver_Ore.png",
  tin: "./Icons/Mining/Tin_Ore.png",
  varaxium: "./Icons/Mining/Varaxium.png",
};

const FISHING_ICON_MAP = {
  anchovies: "./Icons/Fishing/Anchovies.png",
  anglerfish: "./Icons/Fishing/Anglerfish.png",
  bass: "./Icons/Fishing/Bass.png",
  eel: "./Icons/Fishing/Eel.png",
  giant_squid: "./Icons/Fishing/Giant_Squid.png",
  goldfish: "./Icons/Fishing/Goldfish.png",
  herringbone: "./Icons/Fishing/Herringbone.png",
  jellyfish: "./Icons/Fishing/Jellyfish.png",
  lobster: "./Icons/Fishing/Lobster.png",
  mackerel: "./Icons/Fishing/Mackerel.png",
  manta_ray: "./Icons/Fishing/Manta_Ray.png",
  orca: "./Icons/Fishing/Orca.png",
  sardine: "./Icons/Fishing/Sardine.png",
  sea_turtle: "./Icons/Fishing/Sea_Turtle.png",
  shark: "./Icons/Fishing/Shark.png",
  squid: "./Icons/Fishing/Squid.png",
  trout: "./Icons/Fishing/Trout.png",
  tuna: "./Icons/Fishing/Tuna.png",
};

const WOODCUTTING_ICON_MAP = {
  pine: "./Icons/Woodcutting/Pine_Logs.png",
  dead: "./Icons/Woodcutting/Dead_Logs.png",
  birch: "./Icons/Woodcutting/Birch_Logs.png",
  applewood: "./Icons/Woodcutting/Applewood.png",
  willow: "./Icons/Woodcutting/Willow_Logs.png",
  oak: "./Icons/Woodcutting/Oak_Logs.png",
  chestnut: "./Icons/Woodcutting/Chestnut_Logs.png",
  maple: "./Icons/Woodcutting/Maple_Logs.png",
  olive: "./Icons/Woodcutting/Olive_Logs.png",
  stinkwood: "./Icons/Woodcutting/Stinkwood.png",
  magic: "./Icons/Woodcutting/Magic_Log.png",
  palm: "./Icons/Woodcutting/Palm_Wood.png",
  ironbark: "./Icons/Woodcutting/Ironbark.png",
  pearwood: "./Icons/Woodcutting/Pearwood.png",
  limewood: "./Icons/Woodcutting/Lime_Wood.png",
};

const TAILORING_ICON_MAP = {
  blizzard_tome: "./Icons/Tailoring/Blizzard_Tome.png",
  book: "./Icons/Tailoring/Book.png",
  consume_tome: "./Icons/Tailoring/Consume_Tome.png",
  curse_tome: "./Icons/Tailoring/Curse_Tome.png",
  drain_tome: "./Icons/Tailoring/Drain_Tome.png",
  ember_tome: "./Icons/Tailoring/Ember_Tome.png",
  freeze_tome: "./Icons/Tailoring/Freeze_Tome.png",
  haunt_tome: "./Icons/Tailoring/Haunt_Tome.png",
  icicle_tome: "./Icons/Tailoring/Icicle_Tome.png",
  ignite_tome: "./Icons/Tailoring/Ignite_Tome.png",
  inferno_tome: "./Icons/Tailoring/Inferno_Tome.png",
  leech_tome: "./Icons/Tailoring/Leech_Tome.png",
  paper: "./Icons/Tailoring/Paper.png",
  torture_tome: "./Icons/Tailoring/Torture_Tome.png",
};

const COOKING_ICON_MAP = {
  bear_roast: "./Icons/Cooking/Bear_Roast.png",
  polar_bear_roast: "./Icons/Cooking/Polar_Bear_Roast.png",
  cooked_anchovies: "./Icons/Cooking/Cooked_Anchovies.png",
  cooked_anglerfish: "./Icons/Cooking/Cooked_Anglerfish.png",
  cooked_bass: "./Icons/Cooking/Cooked_Bass.png",
  cooked_eel: "./Icons/Cooking/Cooked_Eel.png",
  cooked_giant_squid: "./Icons/Cooking/Cooked_Giant_Squid.png",
  cooked_lobster: "./Icons/Cooking/Cooked_Lobster.png",
  cooked_mackerel: "./Icons/Cooking/Cooked_Mackerel.png",
  cooked_manta_ray: "./Icons/Cooking/Cooked_Manta_Ray.png",
  cooked_orca: "./Icons/Cooking/Cooked_Orca.png",
  cooked_sardine: "./Icons/Cooking/Cooked_Sardine.png",
  cooked_sea_turtle: "./Icons/Cooking/Cooked_Sea_Turtle.png",
  cooked_shark: "./Icons/Cooking/Cooked_Shark.png",
  cooked_squid: "./Icons/Cooking/Cooked_Squid.png",
  cooked_trout: "./Icons/Cooking/Cooked_Trout.png",
  cooked_tuna: "./Icons/Cooking/Cooked_Tuna.png",
};

// ---------- Filename helpers ----------
function nameToFilename(name) {
  return String(name || "").trim().replace(/ /g, "_") + ".png";
}

function getSkillItemNameByKey(skillKey, itemKey) {
  const s = skills?.[skillKey];
  if (!s) return null;

  if (skillKey === "alchemy") {
    const plants = Array.isArray(s.plants) ? s.plants : [];
    const brews = Array.isArray(s.brews) ? s.brews : [];
    const found =
      plants.find((it) => it.key === itemKey) ||
      brews.find((it) => it.key === itemKey);
    return found ? found.name : null;
  }

  const items = Array.isArray(s.items) ? s.items : [];
  const found = items.find((it) => it.key === itemKey);
  return found ? found.name : null;
}

function getIconPathForItem(skillKey, itemKey) {
  if (skillKey === "crafting") return CRAFTING_ICON_MAP[itemKey] || "";
  if (skillKey === "mining") return MINING_ICON_MAP[itemKey] || "";
  if (skillKey === "fishing") return FISHING_ICON_MAP[itemKey] || "";
  if (skillKey === "woodcutting") return WOODCUTTING_ICON_MAP[itemKey] || "";
  if (skillKey === "spellbinding") return TAILORING_ICON_MAP[itemKey] || "";
  if (skillKey === "cooking") return COOKING_ICON_MAP[itemKey] || "";

  if (skillKey === "alchemy") {
    const name = getSkillItemNameByKey("alchemy", itemKey);
    if (!name) return "";
    return "./Icons/Alchemy/" + nameToFilename(name);
  }

  if (skillKey === "smithing") {
    const name = getSkillItemNameByKey("smithing", itemKey);
    if (!name) return "";
    return "./Icons/Smithing/" + nameToFilename(name);
  }

  if (skillKey === "melee" || skillKey === "mage") {
    const name = getSkillItemNameByKey(skillKey, itemKey);
    if (!name) return "";
    return "./Icons/Mobs/" + nameToFilename(name);
  }

  return "";
}

// ---------- Basic helpers ----------
function clampLevel(n) { return Math.max(1, Math.min(120, Math.floor(n))); }
function clampPercent(n) { return Math.max(0, Math.min(100, Math.floor(n))); }

function readNumberInput(el) {
  if (!el) return null;
  const raw = (el.value ?? "").toString().trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function enforceLevelBoundsLive(el) {
  const n = readNumberInput(el);
  if (n === null) return;
  const fixed = clampLevel(n);
  if (Number(n) !== fixed) el.value = fixed;
}

function enforcePercentBoundsLive(el) {
  const n = readNumberInput(el);
  if (n === null) return;
  const fixed = clampPercent(n);
  if (Number(n) !== fixed) el.value = fixed;
}

function normalizeLevelInput(el) {
  const n = readNumberInput(el);
  const fixed = Number.isFinite(n) ? clampLevel(n) : 1;
  el.value = fixed;
  return fixed;
}

function normalizePercentInput(el) {
  const n = readNumberInput(el);
  const fixed = Number.isFinite(n) ? clampPercent(n) : 0;
  el.value = fixed;
  return fixed;
}

function fmt(n) { return Number(n).toLocaleString(); }

// ---------- Inventories helpers ----------
function clearInventories() {
  if (inventoriesP) inventoriesP.textContent = "";
}

function getMiningBagExtraSlots(tier) {
  if (!tier) return 0;
  return Math.max(0, Math.min(3, tier)) * 6;
}

function getCapacityPerInventory(skillKey, item) {
  if (!item) return null;
  if (skillKey === "melee" || skillKey === "mage") return null;

  const chestSlot = 1;

  if (skillKey === "mining") {
    if (item.key === "naturite") return 100;
    const bagSlot = miningBagTier > 0 ? 1 : 0;
    const extra = getMiningBagExtraSlots(miningBagTier);
    const usableSlots = Math.max(0, (INV_SIZE - chestSlot - bagSlot) + extra);
    return usableSlots;
  }

  if (skillKey === "woodcutting") return Math.max(0, INV_SIZE - chestSlot);

  if (skillKey === "fishing") {
    const bassBaitFish = ["shark", "orca", "giant_squid"];
    if (bassBaitFish.includes(item.key)) return 26;
    return 34;
  }

  if (skillKey === "crafting") return 34;
  if (skillKey === "spellbinding") return 32;

  if (skillKey === "alchemy") {
    if (alchemyMode === "gather_only") return 100;
    return null;
  }

  if (skillKey === "cooking") return 17;

  return null;
}

function setInventoriesNeeded(totalUnits, capacityPerInv, unitLabel) {
  if (!inventoriesP) return;

  if (!Number.isFinite(totalUnits) || totalUnits <= 0) {
    inventoriesP.textContent = "";
    return;
  }
  if (!capacityPerInv || capacityPerInv <= 0) {
    inventoriesP.textContent = "";
    return;
  }

  const invs = Math.ceil(totalUnits / capacityPerInv);
  const label = unitLabel ? ` (${unitLabel})` : "";
  inventoriesP.textContent =
    `Inventories needed: ${fmt(invs)} | Capacity: ${fmt(capacityPerInv)} per inventory${label}`;
}

// ---------- Mobs A-Z helpers ----------
function getAlphaKey(name) {
  const ch = String(name || "").trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

function buildAlphabetGroups(items) {
  const map = new Map();
  for (const it of items) {
    const letter = getAlphaKey(it.name);
    if (!map.has(letter)) map.set(letter, []);
    map.get(letter).push(it);
  }
  for (const [k, arr] of map.entries()) {
    arr.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  const letters = Array.from(map.keys()).sort((a, b) => {
    if (a === "#") return 1;
    if (b === "#") return -1;
    return a.localeCompare(b);
  });
  return letters.map((l) => ({ letter: l, items: map.get(l) || [] }));
}

function renderMobLetterTabs(groups) {
  const letters = groups.map((g) => g.letter);
  if (!letters.includes(mobLetterKey)) mobLetterKey = letters[0] || "A";

  const tabsWrap = document.createElement("div");
  tabsWrap.className = "mob-letter-tabs";

  for (const g of groups) {
    const btn = document.createElement("button");
    btn.className = "item-btn mob-letter-tab";
    btn.textContent = g.letter;
    if (g.letter === mobLetterKey) btn.classList.add("active");

    btn.addEventListener("click", () => {
      mobLetterKey = g.letter;
      const list = groups.find((x) => x.letter === mobLetterKey)?.items || [];
      if (list.length && !list.some((i) => i.key === selectedItemKey)) {
        selectedItemKey = list[0].key;
      }
      renderButtons();
      calculate();
    });

    tabsWrap.appendChild(btn);
  }

  return tabsWrap;
}

function buildMobButton(it) {
  const btn = document.createElement("button");
  btn.className = "item-btn";

  const iconPath = getIconPathForItem(activeSkillKey, it.key);
  if (iconPath) {
    const img = document.createElement("img");
    img.className = "btn-icon";
    img.src = iconPath;
    img.alt = "";
    img.onerror = () => {
      img.remove();
      if (!btn.querySelector(".btn-text")) {
        const span = document.createElement("span");
        span.className = "btn-text";
        span.textContent = it.name;
        btn.appendChild(span);
      }
    };

    const span = document.createElement("span");
    span.className = "btn-text";
    span.textContent = it.name;

    btn.appendChild(img);
    btn.appendChild(span);
  } else {
    btn.textContent = it.name;
  }

  btn.disabled = false;
  if (it.key === selectedItemKey) btn.classList.add("active");

  btn.addEventListener("click", () => {
    selectedItemKey = it.key;
    renderButtons();
    calculate();
  });

  return btn;
}

// ---------- Multipliers ----------
function getSetMultiplier() {
  const selected = document.querySelector('input[name="setBonus"]:checked');
  return selected ? Number(selected.value) : 1;
}

function getTotalMultiplier() {
  const stars = (bonusStarsInput && bonusStarsInput.checked) ? STARS_MULT : 1;
  const world = (worldBoostInput && worldBoostInput.checked) ? WORLD_MULT : 1;
  const relic = (wisdomRelicInput && wisdomRelicInput.checked) ? RELIC_MULT : 1;

  const infernalHammer =
    (activeSkillKey === "smithing" && infernalHammerInput && infernalHammerInput.checked)
      ? INFERNAL_MULT
      : 1;

  const infernalRing =
    (activeSkillKey === "smithing" && infernalRingInput && infernalRingInput.checked)
      ? INFERNAL_MULT
      : 1;

  const prospectorsNeck =
    (activeSkillKey === "mining" && prospectorsNeckInput && prospectorsNeckInput.checked)
      ? PROSPECTORS_NECK_MULT
      : 1;

  if (activeSkillKey === "melee" || activeSkillKey === "mage") {
    return stars * world * relic * infernalHammer * infernalRing * prospectorsNeck;
  }

  const set = getSetMultiplier();
  return stars * world * relic * infernalHammer * infernalRing * prospectorsNeck * set;
}

// ---------- Data access ----------
function getSkill() { return skills?.[activeSkillKey]; }

function getAlchemyPlantByName(name) {
  const plants = (skills?.alchemy && skills.alchemy.plants) ? skills.alchemy.plants : [];
  const needle = String(name || "").trim().toLowerCase();
  return plants.find(p => String(p.name || "").trim().toLowerCase() === needle) || null;
}

function isSmithingSmeltItem(it) {
  const k = (it.key || "").toLowerCase();
  const n = (it.name || "").toLowerCase();
  return (
    k.includes("_bar") ||
    k.includes("nugget") ||
    n.includes(" bar") ||
    n.endsWith("bar") ||
    n.includes("nugget") ||
    n.includes("alloy")
  );
}

function getSmithingForgeBarKey(it) {
  const mats = Array.isArray(it.materials) ? it.materials : [];
  const matNames = mats.map(m => (m?.name || "").toLowerCase());
  const has = (txt) => matNames.some(n => n.includes(txt));

  if (has("bronze bar")) return "bronze";
  if (has("iron bar")) return "iron";
  if (has("crimsteel bar")) return "crimsteel";
  if (has("steel bar")) return "steel";
  if (has("silver bar")) return "silver";
  if (has("gold bar")) return "gold";
  if (has("mythan bar")) return "mythan";
  if (has("cobalt bar")) return "cobalt";
  if (has("varaxite bar")) return "varaxite";
  if (has("magic bar")) return "magic";

  const nm = (it.name || "").toLowerCase();
  if (nm.includes("bronze")) return "bronze";
  if (nm.includes("iron")) return "iron";
  if (nm.includes("crimsteel")) return "crimsteel";
  if (nm.includes("steel")) return "steel";

  if (
    nm.includes("sapphire") || nm.includes("ruby") || nm.includes("emerald") ||
    nm.includes("arosite") || nm.includes("magnetite") || nm.includes("battle necklace") || nm.includes("ring")
  ) {
    if (has("silver")) return "silver";
    if (has("gold")) return "gold";
  }
  return "other";
}

const SMITHING_BAR_ORDER = ["bronze","iron","steel","crimsteel","silver","gold","mythan","cobalt","varaxite","magic","other"];
const SMITHING_BAR_LABELS = {
  bronze:"Bronze", iron:"Iron", steel:"Steel", crimsteel:"Crimsteel", silver:"Silver", gold:"Gold",
  mythan:"Mythan", cobalt:"Cobalt", varaxite:"Varaxite", magic:"Magic", other:"Other"
};

function getSmithingForgeItemsAll() {
  const s = skills?.smithing;
  const all = (s && s.items) ? s.items : [];
  return all.filter((it) => !isSmithingSmeltItem(it));
}

function getSmithingForgeItemsForBar(barKey) {
  const allForge = getSmithingForgeItemsAll();
  return allForge.filter((it) => getSmithingForgeBarKey(it) === barKey);
}

function getSmithingAvailableBarKeys() {
  const allForge = getSmithingForgeItemsAll();
  const set = new Set(allForge.map(getSmithingForgeBarKey));
  return SMITHING_BAR_ORDER.filter(k => set.has(k));
}

function getItems() {
  const s = getSkill();
  if (!s) return [];

  if (activeSkillKey === "alchemy") {
    if (alchemyMode === "gather_only") return (s.plants || []);
    return (s.brews || []);
  }

  if (activeSkillKey === "smithing") {
    const all = s.items || [];
    if (smithingMode === "smelt") return all.filter(isSmithingSmeltItem);

    const bars = getSmithingAvailableBarKeys();
    if (!bars.includes(smithingBarKey)) smithingBarKey = bars[0] || "bronze";
    return getSmithingForgeItemsForBar(smithingBarKey);
  }

  return s.items || [];
}

function getSelectedItem() {
  const items = getItems();
  return items.find((i) => i.key === selectedItemKey) || items[0];
}

function ensureValidSelection() {
  const items = getItems();
  if (!items.length) return;
  if (!items.some((i) => i.key === selectedItemKey)) {
    selectedItemKey = items[0].key;
  }
}

// ---------- Recipe expansion ----------
function buildRecipeMap(items) {
  const map = new Map();
  for (const it of items) {
    if (Array.isArray(it.materials) && it.materials.length > 0) {
      map.set(it.name, it.materials);
    }
  }
  return map;
}

function addCount(store, name, qty) {
  store.set(name, (store.get(name) || 0) + qty);
}

function expandMaterials(recipeMap, name, qty, out, depth = 0) {
  if (depth > 12) { addCount(out, name, qty); return; }
  const recipe = recipeMap.get(name);
  if (!recipe) { addCount(out, name, qty); return; }
  for (const mat of recipe) {
    expandMaterials(recipeMap, mat.name, mat.qty * qty, out, depth + 1);
  }
}

function expandOneStep(recipeMap, name, qty, out) {
  const recipe = recipeMap.get(name);
  if (!recipe) return false;
  for (const mat of recipe) addCount(out, mat.name, mat.qty * qty);
  return true;
}

// ---------- UI ----------
function renderTabs() {
  for (const t of tabs) t.classList.toggle("active", t.dataset.skill === activeSkillKey);
}

function renderSmithingBarTabs() {
  if (!smithingBarTabs) return;
  smithingBarTabs.innerHTML = "";
  if (activeSkillKey !== "smithing" || smithingMode !== "forge") return;

  const availableBars = getSmithingAvailableBarKeys();
  if (!availableBars.includes(smithingBarKey)) {
    smithingBarKey = availableBars[0] || "bronze";
  }

  for (const barKey of availableBars) {
    const btn = document.createElement("button");
    btn.className = "item-btn";
    btn.textContent = SMITHING_BAR_LABELS[barKey] || barKey;

    if (barKey === smithingBarKey) btn.classList.add("active");

    btn.addEventListener("click", () => {
      smithingBarKey = barKey;
      const list = getItems();
      selectedItemKey = list.length ? list[0].key : selectedItemKey;
      renderHeader();
      renderButtons();
      calculate();
    });

    smithingBarTabs.appendChild(btn);
  }
}

function renderHeader() {
  document.body.setAttribute("data-skill", activeSkillKey);

  const s = getSkill();
  if (!s) return;

  if (skillTitle) skillTitle.textContent = s.title;
  if (currentLabel) currentLabel.textContent = s.currentLabel;
  if (targetLabel) targetLabel.textContent = s.targetLabel;

  if (setBonusBox) {
    setBonusBox.style.display = (activeSkillKey === "melee" || activeSkillKey === "mage") ? "none" : "";
  }

  if (relicNameSpan) {
    relicNameSpan.textContent =
      (activeSkillKey === "melee" || activeSkillKey === "mage") ? "EXP Relic" : "Wisdom Relic";
  }

  if (relicIconImg) {
    const isExpRelic = (activeSkillKey === "melee" || activeSkillKey === "mage");
    relicIconImg.src = isExpRelic
      ? "./Boosts/relic_of_experience.png"
      : "./Boosts/relic_of_wisdom.png";
    relicIconImg.setAttribute("data-name", isExpRelic ? "relic_of_experience" : "relic_of_wisdom");
    relicIconImg.alt = isExpRelic ? "EXP Relic" : "Wisdom Relic";
  }

  if (smithingInfernalBox) {
    if (activeSkillKey === "smithing") {
      smithingInfernalBox.style.display = "";
    } else {
      smithingInfernalBox.style.display = "none";
      if (infernalHammerInput) infernalHammerInput.checked = false;
      if (infernalRingInput) infernalRingInput.checked = false;
    }
  }

  if (miningProspectorBox) {
    if (activeSkillKey === "mining") {
      miningProspectorBox.style.display = "";
    } else {
      miningProspectorBox.style.display = "none";
      if (prospectorsNeckInput) prospectorsNeckInput.checked = false;
    }
  }

  if (miningBagBox) {
    miningBagBox.style.display = (activeSkillKey === "mining") ? "" : "none";
  }

  if (alchemyModeBox) {
    alchemyModeBox.style.display = activeSkillKey === "alchemy" ? "" : "none";
  }

  if (smithingModeBox) {
    smithingModeBox.style.display = activeSkillKey === "smithing" ? "" : "none";
  }

  if (smithingBarBox) {
    smithingBarBox.style.display = (activeSkillKey === "smithing" && smithingMode === "forge") ? "" : "none";
  }

  if (selectHint) {
    if (activeSkillKey === "alchemy") {
      selectHint.textContent =
        alchemyMode === "brew_only"
          ? "Select a potion/brew to brew (locked until you reach the required level)"
          : alchemyMode === "gather_brew"
            ? "Select a potion/brew to gather plants + brew (locked until you reach the required level)"
            : "Select a plant to gather (locked until you reach the required level)";
    } else if (activeSkillKey === "smithing") {
      selectHint.textContent =
        smithingMode === "forge"
          ? "Select equipment to forge (locked until you reach the required level)"
          : "Select a bar/alloy to smelt (locked until you reach the required level)";
    } else if (activeSkillKey === "melee" || activeSkillKey === "mage") {
      selectHint.textContent = "Select a monster (no requirements)";
    } else {
      selectHint.textContent = s.selectHint;
    }
  }

  renderSmithingBarTabs();
}

function renderButtons() {
  if (!itemButtonsDiv) return;
  itemButtonsDiv.innerHTML = "";
  ensureValidSelection();

  const rawCur = readNumberInput(currentLevelInput);
  const cur = rawCur === null ? 1 : clampLevel(rawCur);

  const items = getItems();
  if (!items.length) return;

  const isMobList = (activeSkillKey === "melee" || activeSkillKey === "mage");

  if (!isMobList) {
    const selected = getSelectedItem();
    if (selected && cur < selected.level) {
      const firstAvail = items.find((i) => i.level <= cur) || items[0];
      selectedItemKey = firstAvail.key;
    }
  }

  if (isMobList) {
    const groups = buildAlphabetGroups(items);
    if (!groups.length) return;

    const letters = groups.map(g => g.letter);
    if (!letters.includes(mobLetterKey)) {
      const selectedLetter = getAlphaKey(getSelectedItem()?.name);
      mobLetterKey = letters.includes(selectedLetter) ? selectedLetter : letters[0];
    }

    itemButtonsDiv.appendChild(renderMobLetterTabs(groups));

    const activeGroup = groups.find(g => g.letter === mobLetterKey) || groups[0];
    const list = activeGroup.items || [];

    if (list.length && !list.some(i => i.key === selectedItemKey)) {
      selectedItemKey = list[0].key;
    }

    const grid = document.createElement("div");
    grid.className = "grid alpha-grid";
    for (const it of list) grid.appendChild(buildMobButton(it));
    itemButtonsDiv.appendChild(grid);
    return;
  }

  for (const it of items) {
    const btn = document.createElement("button");
    btn.className = "item-btn";

    const iconPath = getIconPathForItem(activeSkillKey, it.key);
    if (iconPath) {
      const img = document.createElement("img");
      img.className = "btn-icon";
      img.src = iconPath;
      img.alt = "";
      img.onerror = () => {
        img.remove();
        if (!btn.querySelector(".btn-text")) {
          const span = document.createElement("span");
          span.className = "btn-text";
          span.textContent = it.name;
          btn.appendChild(span);
        }
      };

      const span = document.createElement("span");
      span.className = "btn-text";
      span.textContent = it.name;

      btn.appendChild(img);
      btn.appendChild(span);
    } else {
      btn.textContent = it.name;
    }

    const locked = cur < it.level;
    btn.disabled = locked;
    if (locked) btn.classList.add("locked");
    if (it.key === selectedItemKey) btn.classList.add("active");

    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      selectedItemKey = it.key;
      renderButtons();
      calculate();
    });

    itemButtonsDiv.appendChild(btn);
  }
}

// ---------- Materials UI ----------
function addMaterialRow(name, qty) {
  if (!materialsList) return;
  const row = document.createElement("div");
  row.className = "mat-row";

  const left = document.createElement("b");
  left.textContent = name;

  const right = document.createElement("span");
  right.textContent = fmt(qty);

  row.appendChild(left);
  row.appendChild(right);
  materialsList.appendChild(row);
}

function addSectionRow(title) {
  if (!materialsList) return;
  const row = document.createElement("div");
  row.className = "mat-row";

  const left = document.createElement("b");
  left.textContent = title;

  const right = document.createElement("span");
  right.textContent = "";

  row.appendChild(left);
  row.appendChild(right);
  materialsList.appendChild(row);
}

// ---------- Highscores helpers ----------
function setStatsStatus(msg) {
  if (statsStatus) statsStatus.textContent = msg || "";
}

function setStatsSummaryVisible(on) {
  if (!statsSummaryDetails) return;
  statsSummaryDetails.classList.toggle("hidden", !on);

  if (on) statsSummaryDetails.open = false;
}

function addStatsRow(label, value) {
  if (!statsSummaryList) return;
  const row = document.createElement("div");
  row.className = "mat-row";
  const left = document.createElement("b");
  left.textContent = label;
  const right = document.createElement("span");
  right.textContent = value;
  row.appendChild(left);
  row.appendChild(right);
  statsSummaryList.appendChild(row);
}

function applyStatsToInputs(data) {
  if (!data) return;

  const map = {
    melee: "melee",
    magic: "mage",
    mining: "mining",
    smithing: "smithing",
    woodcutting: "woodcutting",
    crafting: "crafting",
    fishing: "fishing",
    cooking: "cooking",
    spellbinding: "spellbinding",
    alchemy: "alchemy",
  };

  window.__coaStatCache = window.__coaStatCache || {};

  for (const [srcKey, dstKey] of Object.entries(map)) {
    const s = data[srcKey];
    if (!s) continue;
    window.__coaStatCache[dstKey] = { level: s.level, xp: s.xp, rank: s.rank };
  }

  const cur = window.__coaStatCache[activeSkillKey]?.level;
  if (Number.isFinite(cur) && currentLevelInput) {
    currentLevelInput.value = clampLevel(cur);
    if (currentXPInput) currentXPInput.value = 0;
  }
}

async function loadHighscoresForUser(username, mode) {
  const clean = String(username || "").trim();
  if (!clean) throw new Error("Enter a username.");

  const u = encodeURIComponent(clean).replace(/%20/g, "+");
  let url = `${HISCORE_PROXY_BASE}/?user=${u}`;
  if (mode === "lonewolf") url += `&mode=lonewolf`;
  url += `&_=${Date.now()}`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`Worker error (HTTP ${res.status}).`);

  const payload = await res.json();
  if (!payload.ok) throw new Error(payload.error || "Could not load user.");

  return payload.data;
}

// ---------- Calculation ----------
function calculate() {
  const skill = getSkill();
  const items = getItems();

  if (!skill || !items.length) {
    if (chosenP) chosenP.textContent = "";
    if (resultP) resultP.textContent = "No items available.";
    if (materialsBox) materialsBox.classList.add("hidden");
    clearInventories();
    return;
  }

  const item = getSelectedItem();
  if (!item) return;

  const rawCurrent = readNumberInput(currentLevelInput);
  const rawTarget = readNumberInput(targetLevelInput);
  const rawPct = readNumberInput(currentXPInput);

  const current = rawCurrent === null ? 1 : clampLevel(rawCurrent);
  const target = rawTarget === null ? 1 : clampLevel(rawTarget);
  const pct = rawPct === null ? 0 : clampPercent(rawPct);

  const isMobList = (activeSkillKey === "melee" || activeSkillKey === "mage");
  if (!isMobList && current < item.level) {
    selectedItemKey = items[0].key;
    renderButtons();
    calculate();
    return;
  }

  const mult = getTotalMultiplier();
  const boostedXP = Math.floor(item.xp * mult);

  if (chosenP) {
    chosenP.textContent =
      `Selected: ${item.name} (Lvl ${item.level}), Base XP: ${fmt(item.xp)}, Boosted XP: ${fmt(boostedXP)}`;
  }

  if (target <= current) {
    if (resultP) resultP.textContent = "Target level must be higher than current level.";
    if (materialsBox) materialsBox.classList.add("hidden");
    clearInventories();
    return;
  }

  // needs levelXP defined in data.js
  const curBase = levelXP[current];
  const nextBase = current < 120 ? levelXP[current + 1] : levelXP[120];
  const toNext = current < 120 ? nextBase - curBase : 0;
  const xpIntoLevel = current >= 120 ? 0 : Math.floor(toNext * (pct / 100));

  const currentTotalXP = curBase + xpIntoLevel;
  const targetTotalXP = levelXP[target];
  const xpNeeded = targetTotalXP - currentTotalXP;

  if (xpNeeded <= 0) {
    if (resultP) resultP.textContent = "You already have enough XP for the target level.";
    if (materialsBox) materialsBox.classList.add("hidden");
    clearInventories();
    return;
  }

  if (boostedXP <= 0) {
    if (resultP) resultP.textContent = "Boosted XP is 0. Check data values.";
    if (materialsBox) materialsBox.classList.add("hidden");
    clearInventories();
    return;
  }

  const actionsNeeded = Math.ceil(xpNeeded / boostedXP);

  if (materialsList) materialsList.innerHTML = "";
  if (materialsBox) materialsBox.classList.remove("hidden");

  // Default inventories
  {
    const cap = getCapacityPerInventory(activeSkillKey, item);
    setInventoriesNeeded(actionsNeeded, cap, skill.unitsLabel ? skill.unitsLabel(item.name) : "");
  }

  // ---- Alchemy special ----
  if (activeSkillKey === "alchemy") {
    if (alchemyMode === "gather_brew") {
      const ing = Array.isArray(item.materials) ? item.materials : [];
      let gatherBoostedPerBrew = 0;

      for (const mat of ing) {
        const plant = getAlchemyPlantByName(mat.name);
        if (plant) {
          const oneGather = Math.floor((plant.xp || 0) * mult);
          gatherBoostedPerBrew += oneGather * (mat.qty || 0);
        }
      }

      const brewBoosted = Math.floor((item.xp || 0) * mult);
      const cycleXP = gatherBoostedPerBrew + brewBoosted;

      if (cycleXP <= 0) {
        if (resultP) resultP.textContent = "Cycle XP is 0. Check plant/brew XP values.";
        if (materialsBox) materialsBox.classList.add("hidden");
        clearInventories();
        return;
      }

      const brewsNeeded = Math.ceil(xpNeeded / cycleXP);
      const totalXP = brewsNeeded * cycleXP;

      if (resultP) resultP.textContent = `XP needed: ${fmt(xpNeeded)} | Total ${item.name}: ${fmt(brewsNeeded)}`;
      if (materialsTitle) materialsTitle.textContent = "Totals";

      addMaterialRow("Total exp", totalXP);
      addMaterialRow(`Total ${item.name}`, brewsNeeded);

      const totals = new Map();
      for (const mat of ing) addCount(totals, mat.name, (mat.qty || 0) * brewsNeeded);

      const sorted = Array.from(totals.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty);

      for (const r of sorted) addMaterialRow(`Total ${r.name}`, r.qty);

      clearInventories();
      return;
    }

    if (alchemyMode === "brew_only") {
      if (resultP) resultP.textContent = `XP needed: ${fmt(xpNeeded)} | Total brews: ${fmt(actionsNeeded)}`;
      if (materialsTitle) materialsTitle.textContent = "Totals";

      addMaterialRow("Total brews", actionsNeeded);

      const totals = new Map();
      const ing = Array.isArray(item.materials) ? item.materials : [];
      for (const mat of ing) addCount(totals, mat.name, (mat.qty || 0) * actionsNeeded);

      const sorted = Array.from(totals.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty);

      for (const r of sorted) addMaterialRow(r.name, r.qty);

      clearInventories();
      return;
    }

    if (resultP) resultP.textContent = `XP needed: ${fmt(xpNeeded)} | Total plants: ${fmt(actionsNeeded)}`;
    if (materialsTitle) materialsTitle.textContent = "Totals";
    addMaterialRow(item.name, actionsNeeded);

    const cap = getCapacityPerInventory("alchemy", item);
    setInventoriesNeeded(actionsNeeded, cap, `Total ${item.name}`);
    return;
  }

  // ---- Smithing special ----
  if (activeSkillKey === "smithing") {
    clearInventories();

    if (smithingMode === "forge") {
      if (resultP) resultP.textContent = `XP needed: ${fmt(xpNeeded)} | Total forges: ${fmt(actionsNeeded)}`;
      if (materialsTitle) materialsTitle.textContent = "Total materials needed";

      addMaterialRow("Total forges", actionsNeeded);

      const smithAll = (skills?.smithing && skills.smithing.items) ? skills.smithing.items : [];
      const smeltItems = smithAll.filter(isSmithingSmeltItem);
      const smeltRecipeMap = buildRecipeMap(smeltItems);

      const req = Array.isArray(item.materials) ? item.materials : [];
      const directTotals = new Map();
      for (const mat of req) addCount(directTotals, mat.name, (mat.qty || 0) * actionsNeeded);

      const directSorted = Array.from(directTotals.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty);

      for (const r of directSorted) addMaterialRow(r.name, r.qty);

      const oreTotals = new Map();
      for (const mat of req) {
        expandOneStep(smeltRecipeMap, mat.name, (mat.qty || 0) * actionsNeeded, oreTotals);
      }

      if (oreTotals.size > 0) {
        addSectionRow("Ores needed (from smelting)");
        const oreSorted = Array.from(oreTotals.entries())
          .map(([name, qty]) => ({ name, qty }))
          .sort((a, b) => b.qty - a.qty);
        for (const r of oreSorted) addMaterialRow(r.name, r.qty);
      }

      return;
    }

    if (resultP) resultP.textContent = `XP needed: ${fmt(xpNeeded)} | Total smelts: ${fmt(actionsNeeded)}`;
    if (materialsTitle) materialsTitle.textContent = "Total materials needed";

    addMaterialRow("Total smelts", actionsNeeded);

    const smeltList = getItems();
    const recipeMap = buildRecipeMap(smeltList);

    const totals = new Map();
    if (Array.isArray(item.materials) && item.materials.length > 0) {
      for (const mat of item.materials) {
        expandMaterials(recipeMap, mat.name, (mat.qty || 0) * actionsNeeded, totals);
      }
    } else {
      addCount(totals, item.name, actionsNeeded);
    }

    const sorted = Array.from(totals.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);

    for (const r of sorted) addMaterialRow(r.name, r.qty);
    return;
  }

  // ---- Default behaviour ----
  if (resultP) resultP.textContent = `XP needed: ${fmt(xpNeeded)} | ${skill.unitsLabel(item.name)}: ${fmt(actionsNeeded)}`;

  if (skill.materialsMode === "simple") {
    if (materialsTitle) materialsTitle.textContent = "Total materials needed";
    const baitName = item.meta?.bait ?? "Bait";
    addMaterialRow(item.name, actionsNeeded);
    addMaterialRow(baitName, actionsNeeded);
    return;
  }

  if (skill.materialsMode === "single") {
    if (materialsTitle) materialsTitle.textContent = "Total materials needed";
    addMaterialRow(item.name, actionsNeeded);
    return;
  }

  if (skill.materialsMode === "recipe") {
    if (materialsTitle) materialsTitle.textContent = "Total materials needed";

    if (activeSkillKey === "spellbinding") {
      const recipeMap = buildRecipeMap(skill.items || []);
      const directTotals = new Map();
      let totalBooks = 0;

      const req = Array.isArray(item.materials) ? item.materials : [];
      for (const mat of req) {
        const qty = (mat.qty || 0) * actionsNeeded;
        addCount(directTotals, mat.name, qty);
        if ((mat.name || "").toLowerCase() === "book") totalBooks += qty;
      }

      const directSorted = Array.from(directTotals.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty);

      for (const r of directSorted) addMaterialRow(r.name, r.qty);

      if (totalBooks > 0) {
        const bookMats = new Map();
        expandMaterials(recipeMap, "Book", totalBooks, bookMats);
        bookMats.delete("Book");
        bookMats.delete("Paper");

        if (bookMats.size > 0) {
          addSectionRow("Mats needed to make books");
          const bookSorted = Array.from(bookMats.entries())
            .map(([name, qty]) => ({ name, qty }))
            .sort((a, b) => b.qty - a.qty);
          for (const r of bookSorted) addMaterialRow(r.name, r.qty);
        }
      }
      return;
    }

    const recipeMap = buildRecipeMap(skill.items || []);
    const totals = new Map();

    if (Array.isArray(item.materials) && item.materials.length > 0) {
      for (const mat of item.materials) {
        expandMaterials(recipeMap, mat.name, (mat.qty || 0) * actionsNeeded, totals);
      }
    } else {
      addCount(totals, item.name, actionsNeeded);
    }

    const sorted = Array.from(totals.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);

    for (const r of sorted) addMaterialRow(r.name, r.qty);
    return;
  }

  if (skill.materialsMode === "kills") {
    if (materialsTitle) materialsTitle.textContent = "Totals";
    addMaterialRow("Total kills", actionsNeeded);
    clearInventories();
    return;
  }

  if (materialsBox) materialsBox.classList.add("hidden");
}

// ---------- Events ----------
tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    activeSkillKey = btn.dataset.skill;

    const cache = window.__coaStatCache || {};
    if (cache[activeSkillKey]?.level && currentLevelInput) {
      currentLevelInput.value = clampLevel(cache[activeSkillKey].level);
      if (currentXPInput) currentXPInput.value = 0;
    }

    if (activeSkillKey === "alchemy") {
      const list = getItems();
      selectedItemKey = list.length ? list[0].key : selectedItemKey;
    } else if (activeSkillKey === "smithing") {
      smithingMode = "smelt";
      const smeltRadio = document.querySelector('input[name="smithingMode"][value="smelt"]');
      if (smeltRadio) smeltRadio.checked = true;
      smithingBarKey = "bronze";
      const list = getItems();
      selectedItemKey = list.length ? list[0].key : selectedItemKey;
    } else if (activeSkillKey === "melee" || activeSkillKey === "mage") {
      const list = getItems();
      if (list.length) {
        selectedItemKey = list[0].key;
        mobLetterKey = getAlphaKey(list[0].name);
      }
    } else {
      selectedItemKey = (skills?.[activeSkillKey]?.items || [])[0]?.key ?? "";
    }

    renderTabs();
    renderHeader();

    if (targetLevelInput && !targetLevelInput.value) targetLevelInput.value = 5;
    if (currentXPInput && !currentXPInput.value) currentXPInput.value = 0;

    renderButtons();
    calculate();
  });
});

if (currentLevelInput) {
  currentLevelInput.addEventListener("input", () => {
    enforceLevelBoundsLive(currentLevelInput);
    renderButtons();
    calculate();
  });
  currentLevelInput.addEventListener("blur", () => {
    normalizeLevelInput(currentLevelInput);
    renderButtons();
    calculate();
  });
}

if (targetLevelInput) {
  targetLevelInput.addEventListener("input", () => {
    enforceLevelBoundsLive(targetLevelInput);
    calculate();
  });
  targetLevelInput.addEventListener("blur", () => {
    normalizeLevelInput(targetLevelInput);
    calculate();
  });
}

if (currentXPInput) {
  currentXPInput.addEventListener("input", () => {
    enforcePercentBoundsLive(currentXPInput);
    calculate();
  });
  currentXPInput.addEventListener("blur", () => {
    normalizePercentInput(currentXPInput);
    calculate();
  });
}

if (worldBoostInput) worldBoostInput.addEventListener("change", calculate);
if (bonusStarsInput) bonusStarsInput.addEventListener("change", calculate);
if (wisdomRelicInput) wisdomRelicInput.addEventListener("change", calculate);

if (infernalHammerInput) infernalHammerInput.addEventListener("change", calculate);
if (infernalRingInput) infernalRingInput.addEventListener("change", calculate);
if (prospectorsNeckInput) prospectorsNeckInput.addEventListener("change", calculate);

document.querySelectorAll('input[name="setBonus"]').forEach((r) =>
  r.addEventListener("change", calculate)
);

document.querySelectorAll('input[name="alchemyMode"]').forEach((r) =>
  r.addEventListener("change", () => {
    alchemyMode = r.value;
    if (activeSkillKey === "alchemy") {
      const list = getItems();
      selectedItemKey = list.length ? list[0].key : selectedItemKey;
      renderHeader();
      renderButtons();
      calculate();
    }
  })
);

document.querySelectorAll('input[name="smithingMode"]').forEach((r) =>
  r.addEventListener("change", () => {
    smithingMode = r.value;
    if (activeSkillKey === "smithing") {
      if (smithingMode === "forge") {
        const bars = getSmithingAvailableBarKeys();
        smithingBarKey = bars[0] || "bronze";
      }
      const list = getItems();
      selectedItemKey = list.length ? list[0].key : selectedItemKey;
      renderHeader();
      renderButtons();
      calculate();
    }
  })
);

document.querySelectorAll('input[name="miningBagTier"]').forEach((r) =>
  r.addEventListener("change", () => {
    miningBagTier = Number(r.value) || 0;
    calculate();
  })
);

// Highscores events
if (loadStatsBtn && usernameInput) {
  loadStatsBtn.addEventListener("click", async () => {
    try {
      const mode = getModeSelected();
      const user = usernameInput.value || "";

      // Hide boosts immediately if LW selected
      updateBoostVisibilityByMode(mode);

      setStatsStatus("Loading highscores...");
      if (statsSummaryList) statsSummaryList.innerHTML = "";
      setStatsSummaryVisible(false);

      const data = await loadHighscoresForUser(user, mode);

      // ✅ success => lock mode to what you loaded
      loadedAccountMode = mode;
      lockModeUI(loadedAccountMode);

      applyStatsToInputs(data);

      // Manual overrides apply on top
      refreshOverrideUI();
      applyOverridesToCache(user, mode);

      const cache = window.__coaStatCache || {};
      if (Object.keys(cache).length === 0) throw new Error("Loaded but no skill rows were cached.");

      setStatsSummaryVisible(true);

      addStatsRow("User", String(data?.name || user).trim());
      addStatsRow("Mode", mode === "lonewolf" ? "Lone Wolf" : "Normal");

      if (data?.overall) {
        addStatsRow("Overall level", fmt(data.overall.level ?? 0));
        if (Number.isFinite(data.overall.xp)) addStatsRow("Overall XP", fmt(data.overall.xp));
        addStatsRow("Overall rank", String(data.overall.rank || ""));
      }

      const order = ["melee","mage","mining","smithing","woodcutting","crafting","fishing","cooking","spellbinding","alchemy"];
      for (const k of order) {
        const lvl = cache?.[k]?.level;
        if (!Number.isFinite(lvl)) continue;
        addStatsRow(`${k[0].toUpperCase()}${k.slice(1)} lvl`, fmt(lvl));
      }

      if (cache[activeSkillKey]?.level && currentLevelInput) {
        currentLevelInput.value = clampLevel(cache[activeSkillKey].level);
        if (currentXPInput) currentXPInput.value = 0;
      }

      // Ensure boosts reflect current mode after load
      updateBoostVisibilityByMode(mode);

      setStatsStatus("Loaded! Current level auto-filled for the selected tab. (Switch tabs to auto-fill others.)");
      renderButtons();
      calculate();
    } catch (e) {
      console.error(e);
      setStatsSummaryVisible(false);

      // if load failed, don't lock mode
      loadedAccountMode = null;
      lockModeUI(null);

      const msg = String(e?.message || e || "Failed.");
      setStatsStatus(
        `Could not load User. Reason: ${msg}\n` +
        `The user does not exist or its not the matched mode.`
      );
    }
  });
}

if (clearStatsBtn) {
  clearStatsBtn.addEventListener("click", () => {
    window.__coaStatCache = {};
    loadedAccountMode = null;
    lockModeUI(null);

    if (usernameInput) usernameInput.value = "";
    setStatsStatus("");
    if (statsSummaryList) statsSummaryList.innerHTML = "";
    setStatsSummaryVisible(false);

    // still keep LW hiding if LW selected
    updateBoostVisibilityByMode(getModeSelected());
  });
}

// Manual Overrides events
if (saveOverridesBtn && usernameInput) {
  saveOverridesBtn.addEventListener("click", () => {
    const user = usernameInput.value || "";
    const mode = getModeSelected();

    if (!String(user).trim()) {
      setStatsStatus("Enter a username first (so the save is tied to your name).");
      return;
    }

    const data = readOverrideInputs();
    saveOverrides(user, mode, data);
    setStatsStatus("Saved your manual levels on this device ✅");

    applyOverridesToCache(user, mode);
    renderButtons();
    calculate();
  });
}

if (clearOverridesBtn && usernameInput) {
  clearOverridesBtn.addEventListener("click", () => {
    const user = usernameInput.value || "";
    const mode = getModeSelected();

    if (!String(user).trim()) {
      setStatsStatus("Enter a username first.");
      return;
    }

    clearOverrides(user, mode);
    fillOverrideInputs(null);
    setStatsStatus("Cleared saved levels ✅");

    renderButtons();
    calculate();
  });
}

if (overrideEnabledInput) {
  overrideEnabledInput.addEventListener("change", () => {
    const user = usernameInput?.value || "";
    const mode = getModeSelected();
    applyOverridesToCache(user, mode);
    renderButtons();
    calculate();
  });
}

if (usernameInput) {
  usernameInput.addEventListener("input", () => {
    refreshOverrideUI();
    // if user changes username, unlock mode until they load again
    if (isStatsLoaded()) {
      window.__coaStatCache = {};
      loadedAccountMode = null;
      lockModeUI(null);
      setStatsSummaryVisible(false);
      if (statsSummaryList) statsSummaryList.innerHTML = "";
      setStatsStatus("Username changed — load stats again.");
    }
  });
}

// Mode change handler:
// - before load: allowed
// - after load: blocked (because we lock radios anyway, but this adds a clear message)
document.querySelectorAll('input[name="hiscoreMode"]').forEach((r) =>
  r.addEventListener("change", () => {
    // if already loaded, prevent switching to wrong mode
    if (loadedAccountMode) {
      setModeSelected(loadedAccountMode);
      setStatsStatus("Mode is locked to the player's actual account mode. Press Clear to change.");
      return;
    }

    refreshOverrideUI();
    updateBoostVisibilityByMode(getModeSelected());
  })
);

// ---------- Init ----------
renderTabs();
renderHeader();
renderButtons();
calculate();
refreshOverrideUI();
updateBoostVisibilityByMode(getModeSelected());
lockModeUI(null);
