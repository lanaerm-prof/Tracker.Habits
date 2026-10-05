# -*- coding: utf-8 -*-
"""Скачивает линейные значки Material Symbols (outlined) и собирает js/icons.js.

Один стиль значков (линейный, геометричный) — требование брендбука, §8.
Запуск: python tools/gen_icons_js.py
"""
import os
import re
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "js", "icons.js")
BASE = "https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@latest/outlined/{}.svg"

# имя ключа → список кандидатов в порядке приоритета (первый существующий берётся)
NAMES = [
    # привычки
    "water_drop", "directions_run", "menu_book", "self_improvement", "restaurant",
    "bedtime", "medication", "edit", "music_note", "cleaning_services", "code",
    "eco", "directions_walk", "psychology", "local_cafe", ["no_smoking", "smoke_free"],
    "fitness_center", ["apple", "nutrition", "local_dining"], "sports_soccer", "target",
    # навигация и интерфейс
    "calendar_today", "calendar_month", "checklist", "bar_chart", "tag",
    "settings", "notifications", "person", "palette", "storage", "download",
    "delete", "archive", "unarchive", "add", "add_circle", "remove", "check",
    "chevron_left", "chevron_right", "local_fire_department", "emoji_events",
    "trending_up", "query_stats", "donut_large", "calendar_view_week",
    "install_desktop", "logout", "light_mode", "dark_mode", "bolt", "history",
    "sell", "close", "schedule", "done_all", "inbox", "cloud_done",
    ["error_outline", "warning"], "info", "grid_view", "menu",
]

# значков нет в Material Symbols (CDN отдаёт 404) — path нарисован вручную.
# Подставляются после скачивания, чтобы регенерация их не потеряла.
HAND_DRAWN = {
    "candy": "M280-480a200 175 0 1 0 400 0a200 175 0 1 0-400 0Z"
             "M362-480a118 92 0 1 1 236 0a118 92 0 1 1-236 0Z"
             "M355-600 110-760 235-480 110-200 355-360Z"
             "M605-600 850-760 725-480 850-200 605-360Z",
}


def fetch_one(name):
    try:
        with urllib.request.urlopen(BASE.format(name), timeout=20) as r:
            svg = r.read().decode("utf-8")
    except Exception:  # noqa: BLE001
        return None
    m = re.search(r"<path\b[^>]*\bd=\"([^\"]+)\"", svg)
    return m.group(1) if m else None


def fetch(name):
    """name — строка либо список кандидатов; возвращает (ключ, путь)."""
    for n in (name if isinstance(name, (list, tuple)) else [name]):
        d = fetch_one(n)
        if d:
            return n, d
    print("FAIL", name)
    return None


def main():
    seen = set()
    entries = []
    for n in NAMES:
        key = n[0] if isinstance(n, (list, tuple)) else n
        if key in seen:
            continue
        seen.add(key)
        got = fetch(n)
        if got:
            entries.append(got)

    # рисованные вручную значки — в конец, не дублируя уже скачанные
    for k, d in HAND_DRAWN.items():
        if k not in seen:
            seen.add(k)
            entries.append((k, d))

    lines = [
        "/* =========================================================",
        "   icons.js — линейные значки (Material Symbols, outlined)",
        "   Один стиль: геометричный, одинаковая толщина линий (брендбук §8)",
        "   ========================================================= */",
        "",
        "const ICONS = (function () {",
        "  'use strict';",
        "  var P = {",
    ]
    for i, (n, d) in enumerate(entries):
        comma = "," if i < len(entries) - 1 else ""
        lines.append("    %s: '%s'%s" % (n, d.replace("'", "\\'"), comma))
    lines += [
        "  };",
        "",
        "  /** Строка <svg> для значка. Неизвестный ключ → «info». */",
        "  function icon(name, cls) {",
        "    var d = P[name] || P.info;",
        "    return '<svg class=\"icon ' + (cls || '') + '\" viewBox=\"0 -960 960 960\"'",
        "      + ' aria-hidden=\"true\" focusable=\"false\"><path d=\"' + d + '\"></path></svg>';",
        "  }",
        "",
        "  return {",
        "    icon: icon,",
        "    has: function (name) { return !!P[name]; },",
        "    names: Object.keys(P)",
        "  };",
        "})();",
        "",
        "if (typeof window !== 'undefined') window.ICONS = ICONS;",
        "",
    ]
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("saved", OUT, len(entries), "icons")


if __name__ == "__main__":
    main()
