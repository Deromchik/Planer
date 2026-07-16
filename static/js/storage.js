/* PlannerStorage — Supabase (production) + localStorage (local fallback) */
const PlannerStorage = (() => {
  const DEFAULT_THEME = '#1B2027';
  let config = { supabaseUrl: null, supabaseKey: null, rowId: 'main' };
  let data = { theme: { bg: DEFAULT_THEME }, months: {} };
  let saveTimer = null;
  let onSaved = null;

  function init(cfg, initial) {
    config = { ...config, ...cfg };
    if (initial) {
      data = {
        theme: initial.theme || { bg: DEFAULT_THEME },
        months: initial.months || {},
      };
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

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(), 300);
  }

  async function persist() {
    if (config.supabaseUrl && config.supabaseKey) {
      try {
        const payload = {
          id: config.rowId,
          theme: data.theme,
          months: data.months,
          updated_at: new Date().toISOString(),
        };
        const headers = {
          'Content-Type': 'application/json',
          apikey: config.supabaseKey,
          Authorization: `Bearer ${config.supabaseKey}`,
          Prefer: 'resolution=merge-duplicates',
        };
        const res = await fetch(`${config.supabaseUrl}/rest/v1/planner_store`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error('Supabase save failed:', err);
          saveLocal();
        }
      } catch (e) {
        console.error('Supabase save error:', e);
        saveLocal();
      }
    } else {
      saveLocal();
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
    try {
      const raw = localStorage.getItem('planner-data');
      if (raw) {
        const parsed = JSON.parse(raw);
        data = {
          theme: parsed.theme || { bg: DEFAULT_THEME },
          months: parsed.months || {},
        };
      }
    } catch (e) {
      console.warn('localStorage load failed:', e);
    }
  }

  return {
    init,
    getThemeBg,
    setThemeBg,
    getMonth,
    setMonth,
    getAllMonths,
    scheduleSave,
    persist,
    loadLocal,
    setOnSaved(fn) { onSaved = fn; },
  };
})();
