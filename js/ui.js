/* =========================================================
   ui.js — вспомогательные функции интерфейса
   ========================================================= */

const UI = (function () {
  'use strict';

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------- линейные значки ---------------- */
  /** возвращает inline-SVG из набора icons.js; неизвестный ключ — точка-заполнитель */
  function icon(name, cls) {
    var body = (typeof ICONS !== 'undefined' && ICONS.has && ICONS.has(name))
      ? ICONS.icon(name)
      /* заполнитель заметен: незнакомый ключ не должен выглядеть пустым кружком */
      : '<path d="M200-120q-24 0-42-18t-18-42v-560q0-24 18-42t42-18h560q24 0 42 18t18 42v560q0 24-18 42t-42 18H200Zm0-60h560v-560H200v560Z"/>';
    return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 960 960" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  /* ---------------- человекочитаемые переводы ---------------- */
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  function plural(n, one, few, many) {
    n = Math.abs(Math.round(n)) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  /**
   * «Перевод» количественных величин в понятные:
   *   320 страниц ≈ 2 книги · 500 минут ≈ более 8 часов · 3000 мл = 3 л и т.д.
   * Возвращает строку-подпись или '', если для единицы перевода нет
   * (или величина настолько мала, что перевод совпал бы с исходной).
   */
  function humanize(count, unit) {
    count = Math.round(Number(count) || 0);
    if (count <= 0) return '';
    switch (unit) {
      case 'страниц': {
        var books = Math.round(count / 160); // средняя книга ≈ 160 страниц
        if (books < 1) return '';
        return books + ' ' + plural(books, 'книга', 'книги', 'книг');
      }
      case 'мин': {
        var hours = Math.floor(count / 60);
        if (hours < 1) return ''; // меньше часа — перевод не нужен
        var mins = count % 60;
        if (mins === 0) return hours + ' ' + plural(hours, 'час', 'часа', 'часов');
        return 'более ' + hours + ' ' + plural(hours, 'часа', 'часов', 'часов');
      }
      case 'часов': {
        var days = Math.floor(count / 24);
        if (days < 1) return ''; // меньше суток — перевод не нужен
        var h2 = count % 24;
        return (h2 === 0 ? '' : 'более ') + days + ' ' + plural(days, 'сутки', 'суток', 'суток');
      }
      case 'мл': {
        if (count < 1000) return ''; // меньше литра — перевод не нужен
        var l = count / 1000;
        var lv = (Math.round(l * 10) / 10);
        return lv + ' ' + (lv % 1 === 0 ? plural(lv, 'литр', 'литра', 'литров') : 'литра');
      }
      case 'шагов': {
        if (count < 1000) return '';
        var km = Math.round((count * 0.75 / 1000) * 10) / 10;
        return km + ' ' + plural(km, 'километр', 'километра', 'километров');
      }
      default: return ''; // км, подходов, раз — единица уже понятна
    }
  }

  /* ---------------- тосты ---------------- */
  var toastRoot;
  function toast(message, type) {
    toastRoot = toastRoot || document.getElementById('toastRoot');
    if (!toastRoot) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast--error' : '');
    el.textContent = message;
    toastRoot.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s ease, transform .3s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(function () { el.remove(); }, 320);
    }, 2400);
  }

  /* ---------------- модальные окна ---------------- */
  function openModal(opts) {
    var root = document.getElementById('modalRoot');
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<h3>' + esc(opts.title || '') + '</h3>' +
        (opts.text ? '<p>' + opts.text + '</p>' : '') +
        '<div class="modal-body">' + (opts.html || '') + '</div>' +
        '<div class="modal-actions">' + (opts.actions || '') + '</div>' +
      '</div>';
    root.appendChild(backdrop);

    function close() {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    backdrop.addEventListener('mousedown', function (e) {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', onKey);

    var modal = backdrop.querySelector('.modal');
    if (opts.onMount) opts.onMount(modal, close);

    var first = modal.querySelector('input, select, textarea, button');
    if (first) setTimeout(function () { first.focus(); }, 30);

    return { close: close, el: modal };
  }

  function confirm(opts) {
    return new Promise(function (resolve) {
      var settled = false;
      var m = openModal({
        title: opts.title || 'Подтверждение',
        text: opts.text || '',
        actions:
          '<button class="btn btn-ghost" data-act="cancel" type="button">Отмена</button>' +
          '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok" type="button">' + esc(opts.okText || 'Подтвердить') + '</button>',
        onMount: function (modal, close) {
          modal.querySelector('[data-act="cancel"]').addEventListener('click', function () {
            settled = true; close(); resolve(false);
          });
          modal.querySelector('[data-act="ok"]').addEventListener('click', function () {
            settled = true; close(); resolve(true);
          });
        },
        onClose: function () { if (!settled) resolve(false); }
      });
      return m;
    });
  }

  /* ---------------- форматирование ---------------- */
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  var WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  function fmtLongDate(date) {
    const wd = WEEKDAYS_FULL[date.getDay()];
    return wd.charAt(0).toUpperCase() + wd.slice(1) + ', ' + date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }
  function fmtShortDate(date) {
    return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }
  function greeting() {
    var h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Доброе утро';
    if (h >= 12 && h < 18) return 'Добрый день';
    if (h >= 18 && h < 23) return 'Добрый вечер';
    return 'Добрая ночь';
  }

  /* порядок дней недели: Пн … Вс (день 0 в JS — воскресенье) */
  function weekOrder(a, b) {
    var ia = (a + 6) % 7, ib = (b + 6) % 7;
    return ia - ib;
  }

  /** склонение единицы измерения: 1 раз / 2 раза / 5 раз */
  function unitForm(n, unit) {
    switch (unit) {
      case 'раз': return plural(n, 'раз', 'раза', 'раз');
      case 'страниц': return plural(n, 'страница', 'страницы', 'страниц');
      case 'часов': return plural(n, 'час', 'часа', 'часов');
      case 'подходов': return plural(n, 'подход', 'подхода', 'подходов');
      case 'шагов': return plural(n, 'шаг', 'шага', 'шагов');
      default: return unit;
    }
  }

  /** «в день» / «в неделю» / «в месяц» — для режима «несколько раз» */
  function periodWord(h) {
    var p = h.timesPeriod || 'week';
    return p === 'day' ? 'в день' : p === 'month' ? 'в месяц' : 'в неделю';
  }

  function frequencyText(h) {
    if (h.frequency === 'daily') return 'Каждый день';
    if (h.frequency === 'times') {
      var n = Math.max(1, parseInt(h.times, 10) || 1);
      return n + ' ' + plural(n, 'раз', 'раза', 'раз') + ' ' + periodWord(h);
    }
    var names = (h.days || [])
      .slice()
      .sort(weekOrder)
      .map(function (d) { return WEEKDAYS_SHORT[d]; });
    return names.length ? names.join(', ') : 'Выбранные дни';
  }

  function goalText(h) {
    var goal = h.goal || 1;
    var unit = h.unit || 'раз';
    var text = goal + ' ' + unitForm(goal, unit);
    /* единица «раз» — добавляем срок, чтобы подпись читалась целиком:
       «1 раз в день», «3 раза в день · 4 дня в неделю» */
    if (unit === 'раз') {
      if (h.frequency === 'daily') text += ' в день';
      else if (h.frequency === 'weekly') {
        /* цель за день и фактическое число дней недели — обе цифры,
           чтобы подпись не расходилась с расписанием в карточке */
        text += ' в день';
        var dn = (h.days || []).length;
        if (dn) text += ' · ' + dn + ' ' + plural(dn, 'день', 'дня', 'дней') + ' в неделю';
      }
    }
    return text;
  }

  /* ---------------- тема (только светлая / тёмная) ---------------- */
  function applyTheme(theme) {
    var resolved = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', resolved);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#171716' : '#4E736D');
  }

  /* ---------------- экспорт файла ---------------- */
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  return {
    esc: esc,
    icon: icon,
    humanize: humanize,
    plural: plural,
    MONTHS_GEN: MONTHS_GEN,
    toast: toast,
    openModal: openModal,
    confirm: confirm,
    fmtLongDate: fmtLongDate,
    fmtShortDate: fmtShortDate,
    greeting: greeting,
    frequencyText: frequencyText,
    goalText: goalText,
    unitForm: unitForm,
    periodWord: periodWord,
    weekOrder: weekOrder,
    applyTheme: applyTheme,
    download: download,
    MONTHS_NOM: MONTHS_NOM,
    WEEKDAYS_SHORT: WEEKDAYS_SHORT
  };
})();
