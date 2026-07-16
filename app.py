import json
import os
from pathlib import Path

import requests
import streamlit as st
import streamlit.components.v1 as components

ROOT = Path(__file__).parent
STATIC = ROOT / "static"


def read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def get_secrets() -> dict:
    try:
        return dict(st.secrets)
    except Exception:
        return {}


def supabase_load(url: str, key: str, row_id: str) -> dict:
    """Завантажити дані з Supabase або повернути дефолт."""
    default = {"theme": {"bg": "#1B2027"}, "months": {}}
    if not url or not key:
        return default

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    try:
        res = requests.get(
            f"{url}/rest/v1/planner_store",
            params={"id": f"eq.{row_id}", "select": "theme,months"},
            headers=headers,
            timeout=10,
        )
        if res.status_code == 200:
            rows = res.json()
            if rows:
                row = rows[0]
                return {
                    "theme": row.get("theme") or default["theme"],
                    "months": row.get("months") or {},
                }
        # Якщо запису немає — створити
        requests.post(
            f"{url}/rest/v1/planner_store",
            headers={**headers, "Content-Type": "application/json", "Prefer": "return=minimal"},
            json={"id": row_id, "theme": default["theme"], "months": {}},
            timeout=10,
        )
    except Exception as e:
        st.warning(f"Не вдалося завантажити з Supabase: {e}")
    return default


def build_planner_html(data: dict, config: dict) -> str:
  html = read_file(STATIC / "index.html")
  css = read_file(STATIC / "css" / "planner.css")
  storage_js = read_file(STATIC / "js" / "storage.js")
  planner_js = read_file(STATIC / "js" / "planner.js")

  config_script = (
      "<script>window.__PLANNER_CONFIG__ = "
      + json.dumps(config, ensure_ascii=False)
      + ";</script>"
  )
  data_script = (
      "<script>window.__PLANNER_DATA__ = "
      + json.dumps(data, ensure_ascii=False)
      + ";</script>"
  )

  html = html.replace("<!-- PLANNER_CSS -->", f"<style>{css}</style>")
  html = html.replace("<!-- PLANNER_CONFIG -->", config_script + data_script)
  html = html.replace("<!-- PLANNER_STORAGE_JS -->", f"<script>{storage_js}</script>")
  html = html.replace("<!-- PLANNER_JS -->", f"<script>{planner_js}</script>")
  return html


def hide_streamlit_chrome():
    st.markdown(
        """
        <style>
          .stApp, [data-testid="stAppViewContainer"], .main, section.main {
            background-color: #1B2027 !important;
          }
          header[data-testid="stHeader"] {display: none !important; height: 0 !important;}
          footer {visibility: hidden;}
          .block-container {
            padding: 0 !important;
            max-width: 100% !important;
          }
          iframe[title="streamlit_components_v1"] {
            border: none;
            width: 100% !important;
            min-height: 100vh !important;
            display: block;
          }
        </style>
        <script>
          function resizePlannerIframe(h) {
            var iframe = document.querySelector('iframe[title="streamlit_components_v1"]');
            if (!iframe) return;
            var minH = Math.max(h || 0, window.innerHeight);
            iframe.style.height = minH + 'px';
          }
          window.addEventListener('message', function(e) {
            if (e.data && e.data.type === 'planner-resize') {
              resizePlannerIframe(e.data.height);
            }
          });
          window.addEventListener('resize', function() {
            resizePlannerIframe(window.innerHeight);
          });
          resizePlannerIframe(window.innerHeight);
        </script>
        """,
        unsafe_allow_html=True,
    )


def main():
    st.set_page_config(
        page_title="Гросбух — планувальник",
        page_icon="📅",
        layout="wide",
        initial_sidebar_state="collapsed",
    )
    hide_streamlit_chrome()

    secrets = get_secrets()
    supabase_url = secrets.get("SUPABASE_URL", os.environ.get("SUPABASE_URL", ""))
    supabase_key = secrets.get("SUPABASE_ANON_KEY", os.environ.get("SUPABASE_ANON_KEY", ""))
    row_id = secrets.get("PLANNER_ROW_ID", "main")

    config = {
        "supabaseUrl": supabase_url or None,
        "supabaseKey": supabase_key or None,
        "rowId": row_id,
    }

    data = supabase_load(supabase_url, supabase_key, row_id) if supabase_url and supabase_key else {
        "theme": {"bg": "#1B2027"},
        "months": {},
    }

    if not supabase_url or not supabase_key:
        st.info(
            "Режим без хмари: дані зберігаються лише в браузері (localStorage). "
            "Додайте SUPABASE_URL і SUPABASE_ANON_KEY у Secrets для синхронізації між пристроями.",
            icon="ℹ️",
        )

    html = build_planner_html(data, config)
    components.html(html, height=1200, scrolling=False)


if __name__ == "__main__":
    main()
