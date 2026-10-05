/* =========================================================
   store.js — состояние, авторизация, данные, статистика
   Хранение: localStorage (данные переживают перезапуск сессии)
   ========================================================= */

const Store = (function () {
  'use strict';

  var K = {
    users: 'ht:users:v1',
    session: 'ht:session:v1',
    data: 'ht:data:v1:'           // + userId
  };

  /* ---------------- хранилище ---------------- */
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  /* ---------------- даты ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function ymd(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  function parseYMD(str) {
    var p = String(str).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0, 0);
  }
  function addDays(date, n) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }
  function today() { return ymd(new Date()); }
  function daysBetween(aStr, bStr) { // b - a в днях
    return Math.round((parseYMD(bStr) - parseYMD(aStr)) / 86400000);
  }

  /* ---------------- данные пользователя ---------------- */
  var memory = {};   // запасной вариант, если localStorage недоступен
  var currentUserId = null;

  function dataKey(uid) { return K.data + (uid || currentUserId); }

  function emptyData(name) {
    return {
      habits: [],
      logs: {},
      categories: PRESET_CATEGORIES.slice(),
      settings: { name: name || '', theme: 'light', notifications: false, reminderTime: '20:00' }
    };
  }

  /** миграция старых данных: иконки, категории, пропуски, пресеты категорий */
  function migrate(d) {
    var hadCats = Array.isArray(d.categories);
    /* названия пресетов совпадают с группами значков: переименовываем и в списке
       категорий, и у привычек; пустые и повторы («Работа» → «Учёба и работа») убираем */
    var cats = (hadCats ? d.categories : []).map(function (c) {
      c = String(c);
      return CATEGORY_RENAME.hasOwnProperty(c) ? CATEGORY_RENAME[c] : c;
    }).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
    d.habits.forEach(function (h) {
      // эмодзи → ключ иконки
      if (EMOJI_ICON_MAP[h.icon]) h.icon = EMOJI_ICON_MAP[h.icon];
      /* значок «сладости» заменён на конфету */
      if (h.icon === 'donut_large') h.icon = 'candy';
      if (ICONS.indexOf(h.icon) === -1) h.icon = 'target';
      // цвета вне палитры → основной цвет брендбука
      if (COLORS.indexOf(String(h.color).toLowerCase()) === -1 &&
          COLORS.indexOf(String(h.color)) === -1) h.color = COLOR_DEFAULT;
      // старые названия категорий → новые
      var cat = String(h.category || '');
      if (CATEGORY_RENAME.hasOwnProperty(cat)) cat = CATEGORY_RENAME[cat];
      h.category = cat;
      if (cat && cats.indexOf(cat) === -1) cats.push(cat);
      // допустимые пропуски
      if (typeof h.missLimit !== 'number') h.missLimit = DEFAULT_MISS_LIMIT;
      // режим «несколько раз в период» — нормализуем числа
      if (h.frequency === 'times') {
        h.times = Math.max(1, Math.min(60, parseInt(h.times, 10) || 1));
        if (h.timesPeriod !== 'day' && h.timesPeriod !== 'month') h.timesPeriod = 'week';
      }
    });
    // пресеты семятся один раз: при отсутствии поля у старых данных
    // (удалённые пользователем пресеты не возрождаются)
    d.categories = hadCats
      ? cats
      : PRESET_CATEGORIES.concat(cats.filter(function (c) { return PRESET_CATEGORIES.indexOf(c) === -1; }));
    return d;
  }

  function loadData() {
    if (!currentUserId) return emptyData();
    var key = dataKey();
    var d = read(key, null) || memory[key] || null;
    if (!d) d = emptyData();
    d.habits = d.habits || [];
    d.logs = d.logs || {};
    d.settings = d.settings || emptyData().settings;
    // опция «Система» удалена: старое значение переводим в светлую тему
    if (d.settings.theme === 'system') d.settings.theme = 'light';
    if (!d.settings.reminderTime) d.settings.reminderTime = '20:00';
    migrate(d);
    return d;
  }

  var cache = null;
  function save() {
    if (!currentUserId || !cache) return;
    var key = dataKey();
    if (!write(key, cache)) memory[key] = cache;
  }
  function refresh() { cache = loadData(); return cache; }
  function db() { if (!cache) refresh(); return cache; }

  /* ---------------- пароли ---------------- */
  function fallbackHash(str) {
    var h1 = 0x811c9dc5, h2 = 0x1000193;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 + c + i, 0x85ebca6b);
    }
    return 'fb$' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }
  function hash(password, salt) {
    var src = salt + '::' + password;
    var fallback = Promise.resolve(fallbackHash(src));
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(src)).then(function (buf) {
          return Array.from(new Uint8Array(buf)).map(function (b) {
            return b.toString(16).padStart(2, '0');
          }).join('');
        }).catch(function () { return fallback; });
      }
    } catch (e) {}
    return fallback;
  }

  /* ---------------- авторизация ---------------- */
  function uid() {
    return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function genId(prefix) {
    return (prefix || 'h') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  var Auth = {
    users: function () { return read(K.users, []); },

    signUp: function (email, password, name) {
      email = String(email || '').trim().toLowerCase();
      return hash(password, email).then(function (hp) {
        var users = Auth.users();
        if (users.some(function (u) { return u.email === email; })) {
          return { ok: false, error: 'Аккаунт с таким логином уже существует' };
        }
        var user = { id: uid(), email: email, name: String(name || '').trim(), hash: hp, createdAt: Date.now() };
        users.push(user);
        if (!write(K.users, users)) return { ok: false, error: 'Не удалось сохранить данные (localStorage недоступен)' };
        write(K.session, user.id);
        currentUserId = user.id;
        refresh();
        if (!cache.settings.name) { cache.settings.name = user.name || email.split('@')[0]; save(); }
        return { ok: true, user: user };
      });
    },

    signIn: function (email, password) {
      email = String(email || '').trim().toLowerCase();
      var users = Auth.users();
      var user = users.find(function (u) { return u.email === email; });
      if (!user) return Promise.resolve({ ok: false, error: 'Пользователь не найден' });
      return hash(password, user.email).then(function (hp) {
        if (hp !== user.hash) return { ok: false, error: 'Неверный пароль' };
        write(K.session, user.id);
        currentUserId = user.id;
        refresh();
        return { ok: true, user: user };
      });
    },

    signOut: function () {
      remove(K.session);
      currentUserId = null;
      cache = null;
    },

    /** удаление профиля: аккаунт, его данные и сессия стираются безвозвратно */
    deleteAccount: function () {
      var sid = currentUserId;
      if (!sid) return { ok: false, error: 'Нет активного профиля' };
      var users = Auth.users().filter(function (u) { return u.id !== sid; });
      if (!write(K.users, users)) return { ok: false, error: 'Не удалось сохранить данные (localStorage недоступен)' };
      remove(dataKey(sid));
      delete memory[dataKey(sid)];
      remove(K.session);
      currentUserId = null;
      cache = null;
      return { ok: true };
    },

    restore: function () {
      var sid = read(K.session, null);
      if (!sid) return null;
      var user = Auth.users().find(function (u) { return u.id === sid; });
      if (!user) { remove(K.session); return null; }
      currentUserId = user.id;
      refresh();
      return user;
    },

    user: function () {
      var sid = currentUserId;
      if (!sid) return null;
      return Auth.users().find(function (u) { return u.id === sid; }) || null;
    },

    updateProfile: function (name) {
      var u = Auth.user();
      if (!u) return;
      var users = Auth.users();
      var target = users.find(function (x) { return x.id === u.id; });
      if (target) { target.name = String(name || '').trim(); write(K.users, users); }
      db().settings.name = String(name || '').trim();
      save();
    }
  };

  /* ---------------- привычки ---------------- */
  /* иконки — ключи линейного набора Material Symbols (см. js/icons.js) */
  /* значки, доступные в форме: сгруппированы по смыслу (см. ICON_GROUPS в views.js) */
  var ICONS = ['water_drop', 'directions_run', 'menu_book', 'self_improvement', 'restaurant',
    'bedtime', 'medication', 'edit', 'music_note', 'cleaning_services', 'code', 'eco',
    'directions_walk', 'psychology', 'local_cafe', 'smoke_free', 'fitness_center', 'nutrition',
    'sports_soccer', 'target',
    /* новые — чтобы каждая группа имела осмысленный набор */
    'candy', 'palette', 'storage', 'checklist', 'schedule', 'bolt'];

  /* миграция старых эмодзи-иконок в ключи */
  var EMOJI_ICON_MAP = {
    '💧': 'water_drop', '🏃': 'directions_run', '📚': 'menu_book', '🧘': 'self_improvement',
    '🥗': 'restaurant', '😴': 'bedtime', '💊': 'medication', '✍️': 'edit', '✍': 'edit',
    '🎸': 'music_note', '🧹': 'cleaning_services', '💻': 'code', '🌱': 'eco',
    '🚶': 'directions_walk', '🧠': 'psychology', '☕': 'local_cafe', '🚭': 'smoke_free',
    '💪': 'fitness_center', '🍎': 'nutrition', '⚽': 'sports_soccer', '🎯': 'target'
  };

  /* палитра брендбука: ржаво-оранжевый, бирюзовый, нейтральные */
  var COLORS = ['#B83729', '#D45A4E', '#8A291F', '#8FB8B2', '#B9D1CD', '#668F89', '#716E67', '#9A968E'];
  var COLOR_DEFAULT = '#B83729';

  var UNITS = ['раз', 'мин', 'мл', 'страниц', 'км', 'шагов', 'подходов', 'часов'];

  /* пресеты категорий (семятся при первом запуске, далее пользовательские).
     Названия совпадают с группами значков в форме добавления привычки */
  var PRESET_CATEGORIES = ['Здоровье', 'Учёба и работа', 'Спорт и движение', 'Питание', 'Дом и быт',
    'Вредные привычки', 'Творчество', 'Сон и отдых'];
  /* старые категории → названия групп значков (маппинг одноразовый: новый ключ уже целевой) */
  var CATEGORY_RENAME = {
    'Учёба': 'Учёба и работа', 'Образование': 'Учёба и работа',
    'Работа': 'Учёба и работа', 'Финансы': 'Учёба и работа',
    'Спорт': 'Спорт и движение', 'Дом': 'Дом и быт', 'Сон': 'Сон и отдых',
    'Отдых': 'Творчество', 'Другое': ''
  };

  var DEFAULT_MISS_LIMIT = 4; // допустимых пропусков в месяц (0 — без лимита)

  function getHabit(id) {
    return db().habits.find(function (h) { return h.id === id; }) || null;
  }

  /** попадает ли день в режим «N раз в период» */
  function isTimesDay(h, date) {
    var n = Math.max(1, Math.min(60, parseInt(h.times, 10) || 1));
    var p = h.timesPeriod || 'week';
    if (p === 'day') return true;
    if (p === 'week') {
      if (n >= 7) return true;
      return ((date.getDay() + 6) % 7) < n;   // Пн, Вт, … — первые n дней недели
    }
    var dim = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    if (n >= dim) return true;
    var day = date.getDate();
    for (var i = 0; i < n; i++) {
      if (day === Math.round(i * (dim - 1) / Math.max(1, n - 1)) + 1) return true;
    }
    return false;
  }

  function isScheduled(h, dateStr) {
    if (dateStr < ymd(new Date(h.createdAt))) return false;
    if (h.frequency === 'weekly') {
      var days = h.days || [];
      return days.indexOf(parseYMD(dateStr).getDay()) !== -1;
    }
    if (h.frequency === 'times') return isTimesDay(h, parseYMD(dateStr));
    return true;
  }

  function isActiveOn(h, dateStr) {
    if (!h.archived) return true;
    if (!h.archivedAt) return false;
    return dateStr < ymd(new Date(h.archivedAt));
  }

  function isDue(h, dateStr) {
    return isActiveOn(h, dateStr) && isScheduled(h, dateStr);
  }

  function countFor(dateStr, habitId) {
    var day = db().logs[dateStr];
    return (day && day[habitId]) || 0;
  }

  function isDone(h, dateStr) {
    return countFor(dateStr, h.id) >= (h.goal || 1);
  }

  function setCount(dateStr, habitId, count) {
    var logs = db().logs;
    if (!logs[dateStr]) logs[dateStr] = {};
    count = Math.max(0, Math.round(count || 0));
    if (count <= 0) {
      delete logs[dateStr][habitId];
      if (!Object.keys(logs[dateStr]).length) delete logs[dateStr];
    } else {
      logs[dateStr][habitId] = count;
    }
    save();
  }

  var Habits = {
    all: function () { return db().habits.slice(); },
    active: function () { return db().habits.filter(function (h) { return !h.archived; }); },
    archived: function () { return db().habits.filter(function (h) { return h.archived; }); },
    get: getHabit,

    add: function (payload) {
      var h = normalize(payload);
      h.id = genId('h');
      h.createdAt = Date.now();
      h.archived = false;
      h.archivedAt = null;
      db().habits.push(h);
      save();
      return h;
    },

    update: function (id, payload) {
      var h = getHabit(id);
      if (!h) return null;
      var next = normalize(payload);
      Object.keys(next).forEach(function (k) { h[k] = next[k]; });
      save();
      return h;
    },

    setArchived: function (id, archived) {
      var h = getHabit(id);
      if (!h) return;
      h.archived = !!archived;
      h.archivedAt = archived ? Date.now() : null;
      save();
    },

    remove: function (id) {
      var d = db();
      d.habits = d.habits.filter(function (h) { return h.id !== id; });
      Object.keys(d.logs).forEach(function (date) {
        if (d.logs[date]) {
          delete d.logs[date][id];
          if (!Object.keys(d.logs[date]).length) delete d.logs[date];
        }
      });
      save();
    },

    /** выполнение за дату: возвращает новое значение (0 или goal) */
    toggle: function (id, dateStr) {
      var h = getHabit(id);
      if (!h) return 0;
      var goal = h.goal || 1;
      var next = isDone(h, dateStr) ? 0 : goal;
      setCount(dateStr, id, next);
      return next;
    },

    setCount: function (id, dateStr, count) {
      var h = getHabit(id);
      if (!h) return;
      setCount(dateStr, id, Math.min(count, h.goal || 1));
    },

    countFor: countFor,
    isDone: isDone,
    isDue: isDue,
    isScheduled: isScheduled,
    isActiveOn: isActiveOn
  };

  /* ---------------- категории ---------------- */
  var Categories = {
    all: function () { return db().categories.slice(); },

    /** количество привычек в категории */
    count: function (name) {
      return db().habits.filter(function (h) { return h.category === name; }).length;
    },

    /** количество активных (не архивных) привычек в категории */
    countActive: function (name) {
      return db().habits.filter(function (h) { return h.category === name && !h.archived; }).length;
    },

    /** добавить (без дубликатов); возвращает true, если создана */
    add: function (name) {
      name = String(name || '').trim().slice(0, 40);
      if (!name) return false;
      if (db().categories.indexOf(name) !== -1) return false;
      db().categories.push(name);
      save();
      return true;
    },

    /** переименование: правит категорию у всех привычек */
    rename: function (oldName, newName) {
      newName = String(newName || '').trim().slice(0, 40);
      if (!newName || oldName === newName) return false;
      var d = db();
      if (d.categories.indexOf(newName) !== -1) return false;
      var i = d.categories.indexOf(oldName);
      if (i === -1) return false;
      d.categories[i] = newName;
      d.habits.forEach(function (h) { if (h.category === oldName) h.category = newName; });
      save();
      return true;
    },

    /** удаление: привычки получают пустую категорию («Без категории») */
    remove: function (name) {
      var d = db();
      var i = d.categories.indexOf(name);
      if (i === -1) return false;
      d.categories.splice(i, 1);
      d.habits.forEach(function (h) { if (h.category === name) h.category = ''; });
      save();
      return true;
    },

    /** гарантирует наличие категории (вызывается при сохранении привычки) */
    ensure: function (name) {
      name = String(name || '').trim().slice(0, 40);
      if (name && db().categories.indexOf(name) === -1) {
        db().categories.push(name);
        save();
      }
      return name;
    }
  };

  /* ---------------- допустимые пропуски ---------------- */
  /** пропущенные запланированные дни месяца (созданные привычкой, до вчера) */
  function missStats(h, refDate) {
    var limit = typeof h.missLimit === 'number' ? h.missLimit : DEFAULT_MISS_LIMIT;
    var ref = refDate ? parseYMD(refDate) : new Date();
    var y = ref.getFullYear(), m = ref.getMonth();
    var start = new Date(y, m, 1);
    var created = parseYMD(ymd(new Date(h.createdAt)));
    if (created > start) start = created;
    var missed = 0, planned = 0;
    var end = addDays(new Date(), -1); // считаем только завершённые дни
    for (var d = start; d <= end; d = addDays(d, 1)) {
      var s = ymd(d);
      if (s.slice(0, 7) !== ymd(ref).slice(0, 7)) continue;
      if (!isDue(h, s)) continue;
      planned++;
      if (!isDone(h, s)) missed++;
    }
    return {
      limit: limit,
      missed: missed,
      planned: planned,
      remaining: limit > 0 ? Math.max(0, limit - missed) : -1, // -1 — без лимита
      exceeded: limit > 0 && missed > limit
    };
  }

  function normalize(p) {
    var frequency = p.frequency === 'weekly' || p.frequency === 'times' ? p.frequency : 'daily';
    var days = (p.days || []).map(Number).filter(function (n) { return n >= 0 && n <= 6; });
    if (frequency === 'weekly' && !days.length) days = [1, 3, 5];
    var times = Math.max(1, Math.min(60, parseInt(p.times, 10) || 1));
    var timesPeriod = p.timesPeriod === 'day' || p.timesPeriod === 'month' ? p.timesPeriod : 'week';
    var icon = String(p.icon || '');
    if (EMOJI_ICON_MAP[icon]) icon = EMOJI_ICON_MAP[icon];
    if (ICONS.indexOf(icon) === -1) icon = 'target';
    var color = String(p.color || '');
    if (!color || (COLORS.indexOf(color) === -1 && COLORS.indexOf(color.toLowerCase()) === -1)) color = COLOR_DEFAULT;
    // допустимые пропуски в месяц: 0..31, 0 — без лимита
    var miss = parseInt(p.missLimit, 10);
    if (isNaN(miss)) miss = DEFAULT_MISS_LIMIT;
    miss = Math.max(0, Math.min(31, miss));
    return {
      name: String(p.name || '').trim().slice(0, 80) || 'Привычка',
      icon: icon,
      color: color,
      category: String(p.category || '').trim().slice(0, 40),
      frequency: frequency,
      days: frequency === 'weekly' ? days.sort() : [],
      times: times,
      timesPeriod: timesPeriod,
      reminder: p.reminder || '',
      unit: p.unit || 'раз',
      goal: Math.max(1, Math.min(999, parseInt(p.goal, 10) || 1)),
      missLimit: miss
    };
  }

  /* ---------------- статистика ---------------- */
  function dueList(dateStr) {
    return db().habits.filter(function (h) { return isDue(h, dateStr); });
  }

  function dayStat(dateStr) {
    var due = dueList(dateStr);
    var done = due.filter(function (h) { return isDone(h, dateStr); });
    return { date: dateStr, due: due.length, done: done.length, habits: due };
  }

  function rangeStat(days) {
    var res = { due: 0, done: 0, days: 0, perfect: 0 };
    var d = new Date();
    for (var i = 0; i < days; i++) {
      var s = ymd(d);
      var st = dayStat(s);
      res.due += st.due;
      res.done += st.done;
      if (st.due > 0) res.days++;
      if (st.due > 0 && st.done === st.due) res.perfect++;
      d = addDays(d, -1);
    }
    res.percent = res.due ? Math.round((res.done / res.due) * 100) : 0;
    return res;
  }

  /** текущая серия привычки (дней подряд, включая незавершённое «сегодня») */
  function habitStreak(h) {
    var streak = 0;
    var start = new Date();
    var todayStr = ymd(start);
    if (isDue(h, todayStr) && isDone(h, todayStr)) streak++;
    var d = addDays(start, -1);
    var created = ymd(new Date(h.createdAt));
    for (var i = 0; i < 2000; i++) {
      var s = ymd(d);
      if (s < created) break;
      if (isDue(h, s)) {
        if (isDone(h, s)) streak++;
        else break;
      }
      d = addDays(d, -1);
    }
    return streak;
  }

  /** лучшая серия привычки */
  function habitBest(h) {
    var best = 0, cur = 0;
    var created = ymd(new Date(h.createdAt));
    var d = parseYMD(created);
    var end = new Date();
    var guard = 0;
    while (ymd(d) <= ymd(end) && guard++ < 4000) {
      var s = ymd(d);
      if (isDue(h, s)) {
        if (isDone(h, s)) { cur++; if (cur > best) best = cur; }
        else cur = 0;
      }
      d = addDays(d, 1);
    }
    return best;
  }

  /** общая активная серия: дни подряд, когда выполнена хотя бы одна привычка */
  function overallStreak() {
    var streak = 0;
    var d = new Date();
    var st = dayStat(ymd(d));
    if (st.done > 0) streak++;
    d = addDays(d, -1);
    for (var i = 0; i < 4000; i++) {
      var s = dayStat(ymd(d));
      if (s.done > 0) streak++;
      else if (s.due > 0) break;
      d = addDays(d, -1);
      if (streak > 4000) break;
    }
    return streak;
  }

  function overallBest() {
    var best = 0, cur = 0;
    var d = addDays(new Date(), -730);
    for (var i = 0; i < 731; i++) {
      var s = dayStat(ymd(d));
      if (s.done > 0) { cur++; if (cur > best) best = cur; }
      else if (s.due > 0) cur = 0;
      d = addDays(d, 1);
    }
    return best;
  }

  function chart(days) {
    var out = [];
    var d = new Date();
    for (var i = days - 1; i >= 0; i--) {
      var date = addDays(d, -i);
      var s = dayStat(ymd(date));
      out.push({
        date: ymd(date),
        label: date.getDate(),
        due: s.due,
        done: s.done,
        ratio: s.due ? s.done / s.due : 0,
        today: ymd(date) === today()
      });
    }
    return out;
  }

  function ranking(limit) {
    return Habits.active()
      .map(function (h) {
        return { habit: h, streak: habitStreak(h), best: habitBest(h), percent: rangeOfHabit(h, 30) };
      })
      .sort(function (a, b) { return b.streak - a.streak || b.percent - a.percent; })
      .slice(0, limit || 5);
  }

  /** % выполнения привычки за N дней */
  function rangeOfHabit(h, days) {
    var due = 0, done = 0;
    var d = new Date();
    for (var i = 0; i < days; i++) {
      var s = ymd(d);
      if (isDue(h, s)) {
        due++;
        if (isDone(h, s)) done++;
      }
      d = addDays(d, -1);
    }
    return due ? Math.round((done / due) * 100) : 0;
  }

  /* ---------------- расширенная статистика ---------------- */

  /** самая ранняя дата с данными (создание привычки или первая отметка) */
  function historyStart() {
    var min = null;
    db().habits.forEach(function (h) {
      var s = ymd(new Date(h.createdAt));
      if (!min || s < min) min = s;
    });
    Object.keys(db().logs).forEach(function (d) {
      if (!min || d < min) min = d;
    });
    return min || today();
  }

  /**
   * Статистика за период: 7 | 15 | 30 | 'all'
   * Возвращает {due, done, days, perfect, percent, from, to}
   */
  function periodStat(period) {
    var to = new Date(), from;
    if (period === 'all') {
      from = parseYMD(historyStart());
      // не досчитываем в будущее
      if (from > to) from = to;
    } else {
      from = addDays(to, -(Math.max(1, parseInt(period, 10) || 30) - 1));
    }
    var res = { due: 0, done: 0, days: 0, perfect: 0, from: ymd(from), to: ymd(to) };
    var guard = 0;
    for (var d = from; d <= to && guard++ < 4000; d = addDays(d, 1)) {
      var st = dayStat(ymd(d));
      res.due += st.due;
      res.done += st.done;
      if (st.due > 0) res.days++;
      if (st.due > 0 && st.done === st.due) res.perfect++;
    }
    res.percent = res.due ? Math.round((res.done / res.due) * 100) : 0;
    return res;
  }

  /** лучший день за период: максимум выполненных, затем — максимум доли */
  function bestDay(period) {
    var stat = periodStat(period);
    var from = parseYMD(stat.from), to = parseYMD(stat.to);
    var best = null, guard = 0;
    for (var d = from; d <= to && guard++ < 4000; d = addDays(d, 1)) {
      var s = ymd(d);
      var st = dayStat(s);
      if (!st.due) continue;
      var ratio = st.done / st.due;
      if (!best || st.done > best.done || (st.done === best.done && ratio > best.ratio)) {
        best = { date: s, done: st.done, due: st.due, ratio: ratio };
      }
    }
    return best;
  }

  /** агрегация по неделям (пн–вс) и по месяцам за период */
  function periodBuckets(period, unit) {
    var stat = periodStat(period);
    var from = parseYMD(stat.from), to = parseYMD(stat.to);
    var map = {}, order = [];
    var guard = 0;
    for (var d = from; d <= to && guard++ < 4000; d = addDays(d, 1)) {
      var s = ymd(d);
      var key;
      if (unit === 'month') {
        key = s.slice(0, 7);
      } else {
        // понедельник недели
        var off = (d.getDay() + 6) % 7;
        key = ymd(addDays(d, -off));
      }
      if (!map[key]) { map[key] = { key: key, due: 0, done: 0, days: 0 }; order.push(key); }
      var st = dayStat(s);
      map[key].due += st.due;
      map[key].done += st.done;
      if (st.due) map[key].days++;
    }
    return order.map(function (k) {
      var b = map[k];
      b.percent = b.due ? Math.round((b.done / b.due) * 100) : 0;
      b.ratio = b.due ? b.done / b.due : 0;
      return b;
    });
  }

  /** лучшая неделя / лучший месяц за период */
  function bestBucket(period, unit) {
    var list = periodBuckets(period, unit).filter(function (b) { return b.done > 0; });
    if (!list.length) return null;
    return list.sort(function (a, b) {
      return b.percent - a.percent || b.done - a.done || (a.key < b.key ? 1 : -1);
    })[0];
  }

  /** активность по категориям за период */
  function categoryActivity(period) {
    var stat = periodStat(period);
    var from = stat.from, to = stat.to;
    var map = {};
    Habits.all().forEach(function (h) {
      var key = h.category || 'Без категории';
      if (!map[key]) map[key] = { name: key, done: 0, due: 0 };
    });
    var d = parseYMD(from), end = parseYMD(to), guard = 0;
    for (; d <= end && guard++ < 4000; d = addDays(d, 1)) {
      var s = ymd(d);
      dueList(s).forEach(function (h) {
        var key = h.category || 'Без категории';
        if (!map[key]) map[key] = { name: key, done: 0, due: 0 };
        map[key].due++;
        if (isDone(h, s)) map[key].done++;
      });
    }
    return Object.keys(map).map(function (k) {
      var m = map[k];
      m.percent = m.due ? Math.round((m.done / m.due) * 100) : 0;
      return m;
    }).sort(function (a, b) { return b.due - a.due; });
  }

  /** график по дням (существующий) за период в днях */
  function chartDaily(days) { return chart(days); }

  /** график по неделям за период в днях */
  function chartWeekly(days) {
    var buckets = periodBuckets(days, 'week');
    return buckets.map(function (b, i) {
      var parts = b.key.split('-');
      return {
        date: b.key,
        label: i + 1,
        due: b.due,
        done: b.done,
        ratio: b.ratio,
        today: i === buckets.length - 1
      };
    });
  }

  /** суммарный счётчик количественной привычки за период */
  function habitTotal(h, period) {
    var stat = periodStat(period);
    var from = parseYMD(stat.from), to = parseYMD(stat.to);
    var total = 0, guard = 0;
    for (var d = from; d <= to && guard++ < 4000; d = addDays(d, 1)) {
      var s = ymd(d);
      if (isDue(h, s)) total += countFor(s, h.id);
    }
    return total;
  }

  /** человекочитаемые итоги по количественным единицам (страницы, минуты…) */
  function unitTotals(period) {
    var map = {};
    Habits.active().forEach(function (h) {
      var u = h.unit || 'раз';
      if (!QUANT_UNITS[u]) return;
      var total = habitTotal(h, period);
      if (total <= 0) return;
      if (!map[u]) map[u] = { unit: u, total: 0, habits: [] };
      map[u].total += total;
      map[u].habits.push({ habit: h, total: total });
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.total - a.total; });
  }

  /** единицы, для которых есть «перевод» в человекочитаемые величины */
  var QUANT_UNITS = { 'страниц': 1, 'мин': 1, 'мл': 1, 'шагов': 1, 'часов': 1, 'км': 1, 'подходов': 1 };

  /** самые успешные привычки: % выполнения за период */
  function rankingByPeriod(limit, period) {
    var stat = periodStat(period);
    var days = Math.max(1, Math.round((parseYMD(stat.to) - parseYMD(stat.from)) / 86400000) + 1);
    return Habits.active()
      .map(function (h) {
        return {
          habit: h,
          streak: habitStreak(h),
          best: habitBest(h),
          percent: rangeOfHabit(h, days),
          total: QUANT_UNITS[h.unit] ? habitTotal(h, period) : 0
        };
      })
      .sort(function (a, b) { return b.percent - a.percent || b.streak - a.streak; })
      .slice(0, limit || 5);
  }

  /* ---------------- настройки / данные ---------------- */
  var Settings = {
    get: function () { return db().settings; },
    set: function (patch) {
      Object.assign(db().settings, patch || {});
      // опция «Система» удалена: допускаем только светлую и тёмную темы
      if (db().settings.theme !== 'dark') db().settings.theme = 'light';
      save();
      return db().settings;
    }
  };

  function exportPayload() {
    var u = Auth.user();
    var d = db();
    return {
      app: 'Ритм — трекер привычек',
      version: 2,
      exportedAt: new Date().toISOString(),
      user: u ? { email: u.email, name: d.settings.name } : null,
      settings: d.settings,
      categories: d.categories,
      habits: d.habits,
      logs: d.logs
    };
  }

  function wipe() {
    var key = dataKey();
    remove(key);
    delete memory[key];
    cache = emptyData();
    save();
  }

  return {
    dates: { ymd: ymd, parseYMD: parseYMD, addDays: addDays, today: today, daysBetween: daysBetween },
    meta: {
      ICONS: ICONS, COLORS: COLORS, UNITS: UNITS,
      PRESET_CATEGORIES: PRESET_CATEGORIES, DEFAULT_MISS_LIMIT: DEFAULT_MISS_LIMIT
    },
    Auth: Auth,
    Habits: Habits,
    Categories: Categories,
    missStats: missStats,
    Settings: Settings,
    stats: {
      dayStat: dayStat,
      dueList: dueList,
      rangeStat: rangeStat,
      periodStat: periodStat,
      bestDay: bestDay,
      bestBucket: bestBucket,
      periodBuckets: periodBuckets,
      categoryActivity: categoryActivity,
      chartDaily: chartDaily,
      chartWeekly: chartWeekly,
      habitTotal: habitTotal,
      unitTotals: unitTotals,
      rankingByPeriod: rankingByPeriod,
      historyStart: historyStart,
      habitStreak: habitStreak,
      habitBest: habitBest,
      overallStreak: overallStreak,
      overallBest: overallBest,
      chart: chart,
      ranking: ranking,
      rangeOfHabit: rangeOfHabit
    },
    exportPayload: exportPayload,
    wipe: wipe
  };
})();

// отладочный доступ (используется тестами и консолью браузера)
if (typeof window !== 'undefined') window.Store = Store;
