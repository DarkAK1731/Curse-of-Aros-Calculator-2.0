// script.js (FULL) - Bonus XP Stars (x2) + Relic rounding style + Alchemy split + Smithing Smelt/Forge
// ✅ Smithing FORGE grouped by BAR category (Bronze / Iron / Steel / etc.)
// ✅ Smithing-only boosts: Infernal Hammer (+4%) + Infernal Ring (+4%)
// ✅ Mining-only boost: Prospector's Neck (+5%)
// ✅ FIXED: Crimsteel items no longer incorrectly go into Steel tab
// ✅ Forge materials: shows BOTH (A) bars/logs/etc AND (B) ores needed from smelting (without removing bars)

let activeSkillKey = "fishing";
let selectedItemKey = skills[activeSkillKey].items[0].key;

// Alchemy (2 modes)
let alchemyMode = "gather_only"; // gather_only | brew_only

// Smithing (2 modes)
let smithingMode = "smelt"; // smelt | forge
let smithingBarKey = "bronze"; // bronze|iron|steel|crimsteel|silver|gold|mythan|cobalt|varaxite|magic|other

// ---------- Elements ----------
const tabs = Array.from(document.querySelectorAll(".tab"));
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

// smithing-only boosts (only exist in your updated index)
const smithingInfernalBox = document.getElementById("smithingInfernalBox");
const infernalHammerInput = document.getElementById("infernalHammer");
const infernalRingInput = document.getElementById("infernalRing");

// ✅ mining-only boost (only exists if you add it to index.html)
const miningProspectorBox = document.getElementById("miningProspectorBox");
const prospectorsNeckInput = document.getElementById("prospectorsNeck");

const materialsBox = document.getElementById("materialsBox");
const materialsList = document.getElementById("materialsList");
const materialsTitle = document.getElementById("materialsTitle");
const setBonusBox = document.getElementById("setBonusBox");
const relicNameSpan = document.getElementById("relicName");
const alchemyModeBox = document.getElementById("alchemyModeBox");
const smithingModeBox = document.getElementById("smithingModeBox");
const smithingBarBox = document.getElementById("smithingBarBox");
const smithingBarTabs = document.getElementById("smithingBarTabs");

// ---------- Constants ----------
const RELIC_MULT = 1.049925925925926; // ~ +4.99259259%
const WORLD_MULT = 1.5;
const STARS_MULT = 2;
const INFERNAL_MULT = 1.04;
const PROSPECTORS_NECK_MULT = 1.05;

// ---------- Helpers ----------
function clampLevel(n) { return Math.max(1, Math.min(120, Math.floor(n))); }
function clampPercent(n) { return Math.max(0, Math.min(100, Math.floor(n))); }

function readNumberInput(el) {
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

// ---------- Multipliers ----------
function getSetMultiplier() {
  const selected = document.querySelector('input[name="setBonus"]:checked');
  return selected ? Number(selected.value) : 1;
}

function getTotalMultiplier() {
  const stars = bonusStarsInput && bonusStarsInput.checked ? STARS_MULT : 1;
  const world = worldBoostInput.checked ? WORLD_MULT : 1;
  const relic = wisdomRelicInput.checked ? RELIC_MULT : 1;

  // smithing-only boosts
  const infernalHammer =
    (activeSkillKey === "smithing" && infernalHammerInput && infernalHammerInput.checked)
      ? INFERNAL_MULT
      : 1;

  const infernalRing =
    (activeSkillKey === "smithing" && infernalRingInput && infernalRingInput.checked)
      ? INFERNAL_MULT
      : 1;

  // ✅ mining-only boost
  const prospectorsNeck =
    (activeSkillKey === "mining" && prospectorsNeckInput && prospectorsNeckInput.checked)
      ? PROSPECTORS_NECK_MULT
      : 1;

  // melee/mage ignore set bonus
  if (activeSkillKey === "melee" || activeSkillKey === "mage") {
    return stars * world * relic * infernalHammer * infernalRing * prospectorsNeck;
  }

  const set = getSetMultiplier();
  return stars * world * relic * infernalHammer * infernalRing * prospectorsNeck * set;
}

// ---------- Data access ----------
function getSkill() {
  return skills[activeSkillKey];
}

// ✅ Smithing classifier: decide if an item is "smelt" or "forge"
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

// ✅ Determine which BAR category a FORGE item belongs to (based on its materials)
function getSmithingForgeBarKey(it) {
  const mats = Array.isArray(it.materials) ? it.materials : [];
  const matNames = mats.map(m => (m?.name || "").toLowerCase());
  const has = (txt) => matNames.some(n => n.includes(txt));

  // ✅ IMPORTANT: check "crimsteel" BEFORE "steel" because "crimsteel bar" contains "steel bar"
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

  // fallback by item name
  const nm = (it.name || "").toLowerCase();
  if (nm.includes("bronze")) return "bronze";
  if (nm.includes("iron")) return "iron";
  if (nm.includes("crimsteel")) return "crimsteel";
  if (nm.includes("steel")) return "steel";

  // jewelry-ish fallback
  if (
    nm.includes("sapphire") || nm.includes("ruby") || nm.includes("emerald") ||
    nm.includes("arosite") || nm.includes("magnetite") || nm.includes("battle necklace") || nm.includes("ring")
  ) {
    if (has("silver")) return "silver";
    if (has("gold")) return "gold";
  }
  return "other";
}

const SMITHING_BAR_ORDER = [
  "bronze",
  "iron",
  "steel",
  "crimsteel",
  "silver",
  "gold",
  "mythan",
  "cobalt",
  "varaxite",
  "magic",
  "other"
];

const SMITHING_BAR_LABELS = {
  bronze: "Bronze",
  iron: "Iron",
  steel: "Steel",
  crimsteel: "Crimsteel",
  silver: "Silver",
  gold: "Gold",
  mythan: "Mythan",
  cobalt: "Cobalt",
  varaxite: "Varaxite",
  magic: "Magic",
  other: "Other"
};

function getSmithingForgeItemsAll() {
  const s = skills.smithing;
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

  // Alchemy swap list by mode
  if (activeSkillKey === "alchemy") {
    return alchemyMode === "brew_only" ? (s.brews || []) : (s.plants || []);
  }

  // Smithing uses ONE list in your data.js: s.items
  if (activeSkillKey === "smithing") {
    const all = s.items || [];
    if (smithingMode === "smelt") return all.filter(isSmithingSmeltItem);

    // forge mode: filter by selected bar category
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

// expands fully using recipeMap (used in recipe-mode skills + smithing smelt)
function expandMaterials(recipeMap, name, qty, out, depth = 0) {
  if (depth > 12) { addCount(out, name, qty); return; }
  const recipe = recipeMap.get(name);
  if (!recipe) { addCount(out, name, qty); return; }
  for (const mat of recipe) {
    expandMaterials(recipeMap, mat.name, mat.qty * qty, out, depth + 1);
  }
}

// expands ONLY one step (bar/alloy -> its ingredients), without expanding deeper
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
  const s = getSkill();
  skillTitle.textContent = s.title;
  currentLabel.textContent = s.currentLabel;
  targetLabel.textContent = s.targetLabel;

  // set bonus hidden on melee/mage
  if (setBonusBox) {
    setBonusBox.style.display = (activeSkillKey === "melee" || activeSkillKey === "mage") ? "none" : "";
  }

  // relic name swap melee/mage
  if (relicNameSpan) {
    relicNameSpan.textContent =
      (activeSkillKey === "melee" || activeSkillKey === "mage") ? "EXP Relic" : "Wisdom Relic";
  }

  // ✅ Smithing-only infernal UI
  if (smithingInfernalBox) {
    if (activeSkillKey === "smithing") {
      smithingInfernalBox.style.display = "";
    } else {
      smithingInfernalBox.style.display = "none";
      if (infernalHammerInput) infernalHammerInput.checked = false;
      if (infernalRingInput) infernalRingInput.checked = false;
    }
  }

  // ✅ Mining-only Prospector UI
  if (miningProspectorBox) {
    if (activeSkillKey === "mining") {
      miningProspectorBox.style.display = "";
    } else {
      miningProspectorBox.style.display = "none";
      if (prospectorsNeckInput) prospectorsNeckInput.checked = false;
    }
  }

  // Alchemy mode UI
  if (alchemyModeBox) {
    alchemyModeBox.style.display = activeSkillKey === "alchemy" ? "" : "none";
  }

  // Smithing mode UI
  if (smithingModeBox) {
    smithingModeBox.style.display = activeSkillKey === "smithing" ? "" : "none";
  }

  // Smithing bar tabs UI only when Smithing + Forge
  if (smithingBarBox) {
    smithingBarBox.style.display = (activeSkillKey === "smithing" && smithingMode === "forge") ? "" : "none";
  }

  // Hint text
  if (activeSkillKey === "alchemy") {
    selectHint.textContent =
      alchemyMode === "brew_only"
        ? "Select a potion/brew to brew (locked until you reach the required level)"
        : "Select a plant to gather (locked until you reach the required level)";
  } else if (activeSkillKey === "smithing") {
    selectHint.textContent =
      smithingMode === "forge"
        ? "Select equipment to forge (locked until you reach the required level)"
        : "Select a bar/alloy to smelt (locked until you reach the required level)";
  } else {
    selectHint.textContent = s.selectHint;
  }

  renderSmithingBarTabs();
}

function renderButtons() {
  itemButtonsDiv.innerHTML = "";
  ensureValidSelection();

  const rawCur = readNumberInput(currentLevelInput);
  const cur = rawCur === null ? 1 : clampLevel(rawCur);

  const items = getItems();
  if (!items.length) return;

  const selected = getSelectedItem();
  if (cur < selected.level) {
    const firstAvail = items.find((i) => i.level <= cur) || items[0];
    selectedItemKey = firstAvail.key;
  }

  for (const it of items) {
    const btn = document.createElement("button");
    btn.className = "item-btn";
    btn.textContent = it.name;

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

// ---------- Calculation ----------
function calculate() {
  const skill = getSkill();
  const items = getItems();

  if (!items.length) {
    chosenP.textContent = "";
    resultP.textContent = "No items available.";
    materialsBox.classList.add("hidden");
    return;
  }

  const item = getSelectedItem();

  const rawCurrent = readNumberInput(currentLevelInput);
  const rawTarget = readNumberInput(targetLevelInput);
  const rawPct = readNumberInput(currentXPInput);

  const current = rawCurrent === null ? 1 : clampLevel(rawCurrent);
  const target = rawTarget === null ? 1 : clampLevel(rawTarget);
  const pct = rawPct === null ? 0 : clampPercent(rawPct);

  if (current < item.level) {
    selectedItemKey = items[0].key;
    renderButtons();
    calculate();
    return;
  }

  const mult = getTotalMultiplier();
  const boostedXP = Math.floor(item.xp * mult);

  chosenP.textContent =
    `Selected: ${item.name} (Lvl ${item.level}+), Base XP: ${fmt(item.xp)}, Boosted XP: ${fmt(boostedXP)}`;

  if (target <= current) {
    resultP.textContent = "Target level must be higher than current level.";
    materialsBox.classList.add("hidden");
    return;
  }

  const curBase = levelXP[current];
  const nextBase = current < 120 ? levelXP[current + 1] : levelXP[120];
  const toNext = current < 120 ? nextBase - curBase : 0;
  const xpIntoLevel = current >= 120 ? 0 : Math.floor(toNext * (pct / 100));

  const currentTotalXP = curBase + xpIntoLevel;
  const targetTotalXP = levelXP[target];
  const xpNeeded = targetTotalXP - currentTotalXP;

  if (xpNeeded <= 0) {
    resultP.textContent = "You already have enough XP for the target level.";
    materialsBox.classList.add("hidden");
    return;
  }

  if (boostedXP <= 0) {
    resultP.textContent = "Boosted XP is 0. Check data values.";
    materialsBox.classList.add("hidden");
    return;
  }

  const actionsNeeded = Math.ceil(xpNeeded / boostedXP);

  materialsList.innerHTML = "";
  materialsBox.classList.remove("hidden");

  // ---- Alchemy special ----
  if (activeSkillKey === "alchemy") {
    if (alchemyMode === "brew_only") {
      resultP.textContent = `XP needed: ${fmt(xpNeeded)} | Total brews: ${fmt(actionsNeeded)}`;
      materialsTitle.textContent = "Totals";
      addMaterialRow("Total brews", actionsNeeded);

      const totals = new Map();
      const ing = Array.isArray(item.materials) ? item.materials : [];
      for (const mat of ing) addCount(totals, mat.name, mat.qty * actionsNeeded);

      const sorted = Array.from(totals.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty);

      for (const r of sorted) addMaterialRow(r.name, r.qty);
      return;
    }

    // gather_only
    resultP.textContent = `XP needed: ${fmt(xpNeeded)} | Total plants: ${fmt(actionsNeeded)}`;
    materialsTitle.textContent = "Totals";
    addMaterialRow(item.name, actionsNeeded);
    return;
  }

  // ---- Smithing special ----
  if (activeSkillKey === "smithing") {
    // Forge mode: show bars/logs/etc AND ores from smelting (without removing bars)
    if (smithingMode === "forge") {
      resultP.textContent = `XP needed: ${fmt(xpNeeded)} | Total forges: ${fmt(actionsNeeded)}`;
      materialsTitle.textContent = "Total materials needed";
      addMaterialRow("Total forges", actionsNeeded);

      const smithAll = (skills.smithing && skills.smithing.items) ? skills.smithing.items : [];
      const smeltItems = smithAll.filter(isSmithingSmeltItem);
      const smeltRecipeMap = buildRecipeMap(smeltItems);
      const req = Array.isArray(item.materials) ? item.materials : [];

      // A) direct requirements (bars/logs/thread/etc)  ✅ keep bars
      const directTotals = new Map();
      for (const mat of req) addCount(directTotals, mat.name, mat.qty * actionsNeeded);

      const directSorted = Array.from(directTotals.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty);

      for (const r of directSorted) addMaterialRow(r.name, r.qty);

      // B) ores breakdown (from bars/alloys only) ✅ show ores too
      const oreTotals = new Map();
      for (const mat of req) {
        // only expand one step (Bar -> Ore), don’t deep-expand nuggets->ore->etc
        expandOneStep(smeltRecipeMap, mat.name, mat.qty * actionsNeeded, oreTotals);
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

    // Smelt mode: fully expand within smelt list (bars -> ores, nuggets -> ore, etc)
    resultP.textContent = `XP needed: ${fmt(xpNeeded)} | Total smelts: ${fmt(actionsNeeded)}`;
    materialsTitle.textContent = "Total materials needed";
    addMaterialRow("Total smelts", actionsNeeded);

    const smeltList = getItems(); // already filtered to smelt items in smelt mode
    const recipeMap = buildRecipeMap(smeltList);
    const totals = new Map();

    if (Array.isArray(item.materials) && item.materials.length > 0) {
      for (const mat of item.materials) {
        expandMaterials(recipeMap, mat.name, mat.qty * actionsNeeded, totals);
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

  // ---- Default behaviour for other skills ----
  resultP.textContent = `XP needed: ${fmt(xpNeeded)} | ${skill.unitsLabel(item.name)}: ${fmt(actionsNeeded)}`;

  if (skill.materialsMode === "simple") {
    materialsTitle.textContent = "Total materials needed";
    const baitName = item.meta?.bait ?? "Bait";
    addMaterialRow(item.name, actionsNeeded);
    addMaterialRow(baitName, actionsNeeded);
    return;
  }

  if (skill.materialsMode === "single") {
    materialsTitle.textContent = "Total materials needed";
    addMaterialRow(item.name, actionsNeeded);
    return;
  }

  if (skill.materialsMode === "recipe") {
    materialsTitle.textContent = "Total materials needed";
    const recipeMap = buildRecipeMap(skill.items || []);
    const totals = new Map();

    if (Array.isArray(item.materials) && item.materials.length > 0) {
      for (const mat of item.materials) {
        expandMaterials(recipeMap, mat.name, mat.qty * actionsNeeded, totals);
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
    materialsTitle.textContent = "Totals";
    addMaterialRow("Total kills", actionsNeeded);
    return;
  }

  materialsBox.classList.add("hidden");
}

// ---------- Events ----------
tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    activeSkillKey = btn.dataset.skill;

    // reset selection safely per skill
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
    } else {
      selectedItemKey = (skills[activeSkillKey].items || [])[0]?.key ?? "";
    }

    renderTabs();
    renderHeader();
    currentLevelInput.value = 1;
    targetLevelInput.value = 5;
    currentXPInput.value = 0;
    renderButtons();
    calculate();
  });
});

currentLevelInput.addEventListener("input", () => {
  enforceLevelBoundsLive(currentLevelInput);
  renderButtons();
  calculate();
});

targetLevelInput.addEventListener("input", () => {
  enforceLevelBoundsLive(targetLevelInput);
  calculate();
});

currentXPInput.addEventListener("input", () => {
  enforcePercentBoundsLive(currentXPInput);
  calculate();
});

currentLevelInput.addEventListener("blur", () => {
  normalizeLevelInput(currentLevelInput);
  renderButtons();
  calculate();
});

targetLevelInput.addEventListener("blur", () => {
  normalizeLevelInput(targetLevelInput);
  calculate();
});

currentXPInput.addEventListener("blur", () => {
  normalizePercentInput(currentXPInput);
  calculate();
});

worldBoostInput.addEventListener("change", calculate);
if (bonusStarsInput) bonusStarsInput.addEventListener("change", calculate);
wisdomRelicInput.addEventListener("change", calculate);

// smithing-only boosts listeners
if (infernalHammerInput) infernalHammerInput.addEventListener("change", calculate);
if (infernalRingInput) infernalRingInput.addEventListener("change", calculate);

// ✅ mining-only boost listener
if (prospectorsNeckInput) prospectorsNeckInput.addEventListener("change", calculate);

document.querySelectorAll('input[name="setBonus"]').forEach((r) =>
  r.addEventListener("change", calculate)
);

// ✅ Alchemy mode listeners
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

// ✅ Smithing mode listeners
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

// ---------- Init ----------
renderTabs();
renderHeader();
renderButtons();
calculate();
