// Writes made-up weekly counts, as SQL, for trying the dashboard locally:
//   node scripts/seedLocal.mjs > .wrangler/seed.sql
// (`pnpm seed:local` does this and loads it into the local D1.)

let seed = 42;
function random() {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;
  return seed / 2 ** 32;
}

const weeks = 40;
const lastMonday = new Date();
lastMonday.setUTCHours(0, 0, 0, 0);
lastMonday.setUTCDate(
  lastMonday.getUTCDate() - ((lastMonday.getUTCDay() + 6) % 7),
);
const weekAt = (i) =>
  new Date(lastMonday.getTime() - (weeks - i) * 7 * 86400000)
    .toISOString()
    .slice(0, 10);

/** Split `total` between `weights`, with a little noise. */
function split(total, weights) {
  const noisy = Object.entries(weights).map(([k, w]) => [
    k,
    w * (0.85 + random() * 0.3),
  ]);
  const sum = noisy.reduce((a, [, w]) => a + w, 0);
  return noisy
    .map(([k, w]) => [k, Math.round((w / sum) * total)])
    .filter(([, n]) => n > 0);
}

const rows = [];
const add = (week, dimension, value, installs) =>
  rows.push(
    `('investigator', '${week}', '${dimension}', '${value.replaceAll("'", "''")}', ${installs})`,
  );

for (let i = 0; i < weeks; i++) {
  const week = weekAt(i);
  const total = Math.round(310 + i * 3 + random() * 20);
  add(week, "installs", "", total);

  // a release every 5 weeks, adopted over a few weeks
  const released = Math.floor(i / 5);
  const versionWeights = {};
  for (let v = Math.max(0, released - 6); v <= released; v++) {
    const age = i - v * 5;
    versionWeights[`10.${120 + v}`] =
      v === released ? Math.min(1, (age + 1) / 4) * 6 : 6 / (released - v + 1);
  }
  versionWeights["10.98"] = 0.6;
  for (const [v, n] of split(total, versionWeights))
    add(week, "packageVersion", v, n);

  const v14 = Math.min(0.85, 0.1 + i * 0.025);
  for (const [v, n] of split(total, {
    14.367: v14 * 0.7,
    "14.360": v14 * 0.3,
    13.351: (1 - v14) * 0.8,
    12.343: (1 - v14) * 0.2,
  }))
    add(week, "foundryVersion", v, n);

  for (const [v, n] of split(total, {
    en: 60,
    de: 9,
    fr: 8,
    es: 6,
    "pt-BR": 5,
    pl: 3,
    it_IT: 3,
    ja: 2,
  }))
    add(week, "language", v, n);

  for (const [v, n] of split(total, {
    US: 40,
    GB: 15,
    DE: 9,
    FR: 8,
    CA: 7,
    AU: 5,
    ES: 4,
    BR: 4,
    PL: 3,
    IT: 2,
    NL: 2,
    SE: 1,
    JP: 1,
    unknown: 1,
  }))
    add(week, "country", v, n);

  for (const [v, n] of split(total, {
    1: 6,
    "2–3": 18,
    "4–6": 52,
    "7–10": 20,
    "11+": 4,
  }))
    add(week, "userCount", v, n);

  for (const [v, n] of split(total, {
    pathOfCthulhuPreset: 34,
    nightsBlackAgentsPreset: 14,
    fallOfDeltaGreenPreset: Math.min(20, 2 + i),
    esoterroristsPreset: 6,
    ashenStarsPreset: 7,
    mutantCityBluesPreset: 4,
    moribundWorldPreset: 3,
    custom: 5,
  }))
    add(week, "setting:preset", v, n);

  const moduleShares = {
    "lib-wrapper": 0.71,
    "dice-so-nice": 0.64,
    socketlib: 0.52,
    "monks-tokenbar": 0.31,
    "tidy5e-sheet": 0.02,
    babele: 0.18,
    "token-action-hud-core": 0.27,
    "simple-calendar": 0.22,
    "monks-active-tiles": 0.19,
    "health-estimate": 0.14,
    "chat-portrait": 0.12,
    "forien-quest-log": 0.11,
    "dice-tray": 0.09,
    popout: 0.08,
    "token-mold": 0.07,
  };
  for (const [m, share] of Object.entries(moduleShares)) {
    add(week, "module", m, Math.round(total * share * (0.9 + random() * 0.2)));
  }
}

console.log("DELETE FROM weekly_counts;");
for (let i = 0; i < rows.length; i += 200) {
  console.log(
    `INSERT INTO weekly_counts (package_id, week, dimension, value, installs) VALUES\n${rows.slice(i, i + 200).join(",\n")};`,
  );
}
