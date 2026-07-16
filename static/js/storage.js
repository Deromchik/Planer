/* PlannerStorage — Supabase (production) + localStorage (local fallback) */
const PlannerStorage = (() => {
  const DEFAULT_THEME = '#1B2027';
  let config = { supabaseUrl: null, supabaseKey: null, rowId: 'main' };
  let data = defaultData();
  let saveTimer = null;
  let onSaved = null;

  function defaultData() {
    return { theme: { bg: DEFAULT_THEME }, months: {}, recurring: [], recurringDone: {} };
  }

  function normalizeData(raw) {
    if (!raw || typeof raw !== 'object') return defaultData();
    return {
      theme: raw.theme || { bg: DEFAULT_THEME },
      months: raw.months && typeof raw.months === 'object' ? raw.months : {},
      recurring: Array.isArray(raw.recurring) ? raw.recurring : [],
      recurringDone: raw.recurringDone && typeof raw.recurringDone === 'object' ? raw.recurringDone : {},
    };
  }

  function hasStoredContent(d) {
    return Object.keys(d.months || {}).length > 0 ||
      (d.recurring || []).length > 0 ||
      Object.keys(d.recurringDone || {}).length > 0 ||
      (d.theme?.bg && d.theme.bg !== DEFAULT_THEME);
  }

  function mergeData(base, overlay) {
    const a = normalizeData(base);
    const b = normalizeData(overlay);
    return {
      theme: b.theme?.bg && b.theme.bg !== DEFAULT_THEME ? b.theme : a.theme,
      months: { ...a.months, ...b.months },
      recurring: (b.recurring || []).length ? b.recurring : a.recurring,
      recurringDone: { ...a.recurringDone, ...b.recurringDone },
    };
  }

  function readLocalData() {
    try {
      const raw = localStorage.getItem('planner-data');
      if (raw) return normalizeData(JSON.parse(raw));

      // legacy: окремі ключі planner-month:YYYY-MM
      const months = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('planner-month:')) continue;
        const monthKey = key.slice('planner-month:'.length);
        try {
          months[monthKey] = JSON.parse(localStorage.getItem(key));
        } catch (_) { /* skip bad entry */ }
      }
      if (!Object.keys(months).length) return null;

      let theme = { bg: DEFAULT_THEME };
      try {
        const themeRaw = localStorage.getItem('planner-theme');
        if (themeRaw) {
          const parsed = JSON.parse(themeRaw);
          if (parsed?.bg) theme = { bg: parsed.bg };
        }
      } catch (_) { /* keep default */ }

      return normalizeData({ theme, months });
    } catch (e) {
      console.warn('localStorage load failed:', e);
      return null;
    }
  }

  function init(cfg, initial) {
    config = { ...config, ...cfg };
    const local = readLocalData();
    const remote = initial ? normalizeData(initial) : null;

    if (local && remote && hasStoredContent(remote)) {
      data = mergeData(remote, local);
    } else if (local && hasStoredContent(local)) {
      data = local;
    } else if (remote) {
      data = remote;
    } else {
      data = defaultData();
    }
  }

  function getThemeBg() {
    return data.theme?.bg || DEFAULT_THEME;
  }

  function setThemeBg(bg) {
    data.theme = { bg };
    scheduleSave();
  }

  function getMonth(key) {
    return data.months[key] || null;
  }

  function setMonth(key, monthData) {
    data.months[key] = monthData;
    scheduleSave();
  }

  function getAllMonths() {
    return data.months;
  }

  function getRecurring() {
    return data.recurring || [];
  }

  function setRecurring(rules) {
    data.recurring = rules;
    scheduleSave();
  }

  function getRecurringDone() {
    return data.recurringDone || {};
  }

  function setRecurringDone(done) {
    data.recurringDone = done;
    scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(), 300);
  }

  function supabasePayload(includeRecurring) {
    const payload = {
      id: config.rowId,
      theme: data.theme,
      months: data.months,
      updated_at: new Date().toISOString(),
    };
    if (includeRecurring) {
      payload.recurring = data.recurring || [];
      payload.recurring_done = data.recurringDone || {};
    }
    return payload;
  }

  async function saveSupabase(includeRecurring) {
    const headers = {
      'Content-Type': 'application/json',
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      Prefer: 'resolution=merge-duplicates',
    };
    const res = await fetch(`${config.supabaseUrl}/rest/v1/planner_store`, {
      method: 'POST',
      headers,
      body: JSON.stringify(supabasePayload(includeRecurring)),
    });
    return res.ok;
  }

  async function persist() {
    saveLocal();

    if (config.supabaseUrl && config.supabaseKey) {
      try {
        let ok = await saveSupabase(true);
        if (!ok) ok = await saveSupabase(false);
        if (!ok) console.error('Supabase save failed after retry');
      } catch (e) {
        console.error('Supabase save error:', e);
      }
    }

    if (onSaved) onSaved();
  }

  function saveLocal() {
    try {
      localStorage.setItem('planner-data', JSON.stringify(data));
    } catch (e) {
      console.error('localStorage save failed:', e);
    }
  }

  function loadLocal() {
    const local = readLocalData();
    if (local) data = local;
  }

  return {
    init,
    getThemeBg,
    setThemeBg,
    getMonth,
    setMonth,
    getAllMonths,
    getRecurring,
    setRecurring,
    getRecurringDone,
    setRecurringDone,
    scheduleSave,
    persist,
    loadLocal,
    setOnSaved(fn) { onSaved = fn; },
  };
})();
