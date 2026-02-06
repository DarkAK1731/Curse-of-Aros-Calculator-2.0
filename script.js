// script.js (FULL) - Bonus XP Stars (x2) + game-matching Relic rounding

let activeSkillKey = "fishing";
let selectedItemKey = skills[activeSkillKey].items[0].key;

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
const bonusStarsInput = document.getElementById("bonusStars"); // ✅ NEW
const wisdomRelicInput = document.getElementById("wisdomRelic");

const materialsBox = document.getElementById("materialsBox");
const materialsList = document.getElementById("materialsList");
const materialsTitle = document.getElementById("materialsTitle");

const setBonusBox = document.getElementById("setBonusBox");
const relicNameSpan = document.getElementById("relicName");

// ---------- Constants ----------
// ✅ This matches the in-game numbers you got (28348 and 42522 for Desert Wolf)
const RELIC_MULT = 1.049925925925926; // ~ +4.99259259%
// World and Stars are exact
const WORLD_MULT = 1.5;
const STARS_MULT = 2;

// ---------- Helpers ----------
function clampLevel(n) {
  return Math.max(1, Math.min(120, Math.floor(n)));
}
function clampPercent(n) {
  return Math.max(0, Math.min(100, Math.floor(n)));
}
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
function fmt(n) {
  return Number(n).toLocaleString();
}

// ---------- Multipliers ----------
function getSetMultiplier() {
  const selected = document.querySelector('input[name="setBonus"]:checked');
  return selected ? Number(selected.value) : 1;
}

function getTotalMultiplier() {
  const stars = bonusStarsInput && bonusStarsInput.checked ? STARS_MULT : 1;
  const world = worldBoostInput.checked ? WORLD_MULT : 1;
  const relic = wisdomRelicInput.checked ? RELIC_MULT : 1;

  // melee/mage ignore set bonus (same as before)
  if (activeSkillKey === "melee" || activeSkillKey === "mage") {
    return stars * world * relic;
  }

  const set = getSetMultiplier();
  return stars * world * relic * set;
}

// ---------- Data access ----------
function getSkill() {
  return skills[activeSkillKey];
}
function getItems() {
  return getSkill().items;
}
function getSelectedItem() {
  return getItems().find((i) => i.key === selectedItemKey) || getItems()[0];
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
  if (depth > 12) {
    addCount(out, name, qty);
    return;
  }
  const recipe = recipeMap.get(name);
  if (!recipe) {
    addCount(out, name, qty);
    return;
  }
  for (const mat of recipe) {
    expandMaterials(recipeMap, mat.name, mat.qty * qty, out, depth + 1);
  }
}

// ---------- UI ----------
function renderHeader() {
  const s = getSkill();
  skillTitle.textContent = s.title;
  currentLabel.textContent = s.currentLabel;
  targetLabel.textContent = s.targetLabel;
  selectHint.textContent = s.selectHint;

  if (setBonusBox) {
    setBonusBox.style.display =
      activeSkillKey === "melee" || activeSkillKey === "mage" ? "none" : "";
  }

  // ✅ Name stays correct:
  if (relicNameSpan) {
    relicNameSpan.textContent =
      activeSkillKey === "melee" || activeSkillKey === "mage"
        ? "EXP Relic"
        : "Wisdom Relic";
  }
}

function renderTabs() {
  for (const t of tabs) {
    t.classList.toggle("active", t.dataset.skill === activeSkillKey);
  }
}

function ensureValidSelection() {
  const items = getItems();
  if (!items.some((i) => i.key === selectedItemKey)) {
    selectedItemKey = items[0].key;
  }
}

function renderButtons() {
  itemButtonsDiv.innerHTML = "";
  ensureValidSelection();

  const rawCur = readNumberInput(currentLevelInput);
  const cur = rawCur === null ? 1 : clampLevel(rawCur);

  const items = getItems();
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

// ---------- Calculation ----------
function calculate() {
  const skill = getSkill();
  const item = getSelectedItem();

  const rawCurrent = readNumberInput(currentLevelInput);
  const rawTarget = readNumberInput(targetLevelInput);
  const rawPct = readNumberInput(currentXPInput);

  const current = rawCurrent === null ? 1 : clampLevel(rawCurrent);
  const target = rawTarget === null ? 1 : clampLevel(rawTarget);
  const pct = rawPct === null ? 0 : clampPercent(rawPct);

  if (current < item.level) {
    selectedItemKey = getItems()[0].key;
    renderButtons();
    calculate();
    return;
  }

  const mult = getTotalMultiplier();

  // ✅ Game-style integer XP (floor)
  const boostedXP = Math.floor(item.xp * mult);

  let extra = "";
  if (skill.materialsMode === "simple") {
    extra = `, Bait: ${item.meta?.bait ?? "?"}`;
  }
  if (skill.materialsMode === "single") {
    extra = item.meta?.tool ? `, Tool: ${item.meta.tool}` : "";
  }

  chosenP.textContent =
    `Selected: ${item.name} (Lvl ${item.level}+ )${extra}, Base XP: ${fmt(item.xp)}, Boosted XP: ${fmt(boostedXP)}`;

  if (target <= current) {
    resultP.textContent = "Target level must be higher than current level.";
    materialsBox.classList.add("hidden");
    return;
  }

  // Convert % into XP progress inside current level
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

  // avoid divide by zero just in case
  if (boostedXP <= 0) {
    resultP.textContent = "Boosted XP is 0. Check data values.";
    materialsBox.classList.add("hidden");
    return;
  }

  const actionsNeeded = Math.ceil(xpNeeded / boostedXP);
  resultP.textContent = `XP needed: ${fmt(xpNeeded)} | ${skill.unitsLabel(item.name)}: ${fmt(actionsNeeded)}`;

  // ----- Details box -----
  materialsList.innerHTML = "";

  if (skill.materialsMode === "simple") {
    materialsTitle.textContent = "Total materials needed";
    materialsBox.classList.remove("hidden");

    const baitName = item.meta?.bait ?? "Bait";
    addMaterialRow(item.name, actionsNeeded);
    addMaterialRow(baitName, actionsNeeded);
    return;
  }

  if (skill.materialsMode === "single") {
    materialsTitle.textContent = "Total materials needed";
    materialsBox.classList.remove("hidden");
    addMaterialRow(item.name, actionsNeeded);
    return;
  }

  if (skill.materialsMode === "recipe") {
    materialsTitle.textContent = "Total materials needed";
    materialsBox.classList.remove("hidden");

    const recipeMap = buildRecipeMap(skill.items);
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

    for (const r of sorted) {
      addMaterialRow(r.name, r.qty);
    }
    return;
  }

  if (skill.materialsMode === "kills") {
    materialsTitle.textContent = "Totals";
    materialsBox.classList.remove("hidden");
    addMaterialRow("Total kills", actionsNeeded);
    return;
  }

  materialsBox.classList.add("hidden");
}

// ---------- Events ----------
tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    activeSkillKey = btn.dataset.skill;
    selectedItemKey = skills[activeSkillKey].items[0].key;

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

document
  .querySelectorAll('input[name="setBonus"]')
  .forEach((r) => r.addEventListener("change", calculate));

// ---------- Initial ----------
renderTabs();
renderHeader();
renderButtons();
calculate();
