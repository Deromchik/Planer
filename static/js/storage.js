/* PlannerStorage — Supabase (production) + localStorage (offline cache) */
const PlannerStorage = (() => {
  const DEFAULT_THEME = '#1B2027';
  let config = { supabaseUrl: null, supabaseKey: null, rowId: 'main' };
  let data = defaultData();
  let updatedAt = '';
  let saveTimer = null;
  let onSaved = null;
  let onSynced = null;
  let applyingRemote = false;

  function defaultData() {
    return { theme: { bg: DEFAULT_THEME }, months: {}, recurring: [], recurringDone: {} };
  }

  function hasSupabase() {
    return !!(config.supabaseUrl && config.supabaseKey);
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

  function parseSupabaseRow(row) {
    if (!row) return null;
    return {
      data: normalizeData({
        theme: row.theme,
        months: row.months,
        recurring: row.recurring,
        recurringDone: row.recurring_done,
      }),
      updatedAt: row.updated_at || '',
    };
  }

  function readLocalCache() {
    try {
      const raw = localStorage.getItem('planner-data');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          data: normalizeData(parsed),
          updatedAt: parsed._updatedAt || '',
        };
      }

      // legacy: окремі ключі planner-month:YYYY-MM
      const months = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('planner-month:')) continue;
        const monthKey = key.slice('planner-month:'.length);
        try {
          months[monthKey] = JSON.parse(localStorage.getItem(key));
        } catch (_) { /* skip */ }
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

      return { data: normalizeData({ theme, months }), updatedAt: '' };
    } catch (e) {
      console.warn('localStorage load failed:', e);
      return null;
    }
  }

  function applyData(next, nextUpdatedAt) {
    applyingRemote = true;
    data = normalizeData(next);
    updatedAt = nextUpdatedAt || '';
    applyingRemote = false;
  }

  function saveLocal() {
    try {
      localStorage.setItem('planner-data', JSON.stringify({
        ...data,
        _updatedAt: updatedAt,
      }));
    } catch (e) {
      console.error('localStorage save failed:', e);
    }
  }

  function init(cfg, initial) {
    config = { ...config, ...cfg };

    if (!hasSupabase()) {
      const local = readLocalCache();
      if (local) {
        applyData(local.data, local.updatedAt);
      } else if (initial) {
        applyData(initial, '');
      } else {
        applyData(defaultData(), '');
      }
      return Promise.resolve(false);
    }

    const local = readLocalCache();
    const bootstrap = initial ? normalizeData(initial) : defaultData();
    applyData(bootstrap, local?.updatedAt || '');

    return reconcile(local);
  }

  async function fetchFromSupabase() {
    const headers = {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
    };
    const selects = [
      'theme,months,recurring,recurring_done,updated_at',
      'theme,months,updated_at',
    ];
    for (const select of selects) {
      try {
        const res = await fetch(
          `${config.supabaseUrl}/rest/v1/planner_store?id=eq.${encodeURIComponent(config.rowId)}&select=${select}`,
          { headers }
        );
        if (!res.ok) continue;
        const rows = await res.json();
        if (rows.length) return parseSupabaseRow(rows[0]);
        return { data: defaultData(), updatedAt: '' };
      } catch (e) {
        console.warn('Supabase fetch failed:', e);
      }
    }
    return null;
  }

  function isNewer(a, b) {
    const ta = a ? new Date(a).getTime() : 0;
    const tb = b ? new Date(b).getTime() : 0;
    return ta > tb;
  }

  async function reconcile(localCache) {
    const local = localCache || readLocalCache();
    const remote = await fetchFromSupabase();

    if (!remote) {
      if (local) applyData(local.data, local.updatedAt);
      saveLocal();
      return false;
    }

    const localAt = local?.updatedAt || '';
    const remoteAt = remote.updatedAt || '';

    if (isNewer(remoteAt, localAt)) {
      applyData(remote.data, remoteAt);
      saveLocal();
      return true;
    }

    if (isNewer(localAt, remoteAt)) {
      applyData(local.data, localAt);
      await persist();
      return true;
    }

    applyData(remote.data, remoteAt);
    saveLocal();
    return false;
  }

  async function syncFromRemote() {
    if (!hasSupabase()) return false;

    const remote = await fetchFromSupabase();
    if (!remote) return false;

    const remoteAt = remote.updatedAt || '';
    if (remoteAt && remoteAt === updatedAt) return false;
    if (!isNewer(remoteAt, updatedAt)) return false;

    applyData(remote.data, remoteAt);
    saveLocal();
    if (onSynced) onSynced();
    return true;
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
    if (applyingRemote) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(), 300);
  }

  function supabasePayload(includeRecurring) {
    updatedAt = new Date().toISOString();
    const payload = {
      id: config.rowId,
      theme: data.theme,
      months: data.months,
      updated_at: updatedAt,
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
    if (!applyingRemote) {
      updatedAt = new Date().toISOString();
    }
    saveLocal();

    if (hasSupabase()) {
      try {
        let ok = await saveSupabase(true);
        if (!ok) ok = await saveSupabase(false);
        if (!ok) {
          console.error('Supabase save failed after retry');
        } else {
          saveLocal();
        }
      } catch (e) {
        console.error('Supabase save error:', e);
      }
    }

    if (onSaved) onSaved();
  }

  return {
    init,
    reconcile,
    syncFromRemote,
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
    hasSupabase,
    setOnSaved(fn) { onSaved = fn; },
    setOnSynced(fn) { onSynced = fn; },
  };
})();
