/* =========================================================
   views.js — экраны приложения
   ========================================================= */

const Views = (function () {
  'use strict';

  const D = Store.dates;
  const H = Store.Habits;
  const S = Store.stats;
  const esc = UI.esc;

  /* ---------------- общие помощники ---------------- */
  function tint(hex, alpha) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 'var(--surface-2)';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function progressText(n) {
    return `${n} ${plural(n, 'день', 'дня', 'дней')}`;
  }

  /* значки категорий: пресеты — по смыслу, свои — по смыслу названия */
  const CAT_ICONS = {
    'Здоровье': 'medication',
    'Работа': 'checklist',
    'Образование': 'menu_book',
    'Учёба и работа': 'menu_book',
    'Спорт': 'directions_run',
    'Спорт и движение': 'directions_run',
    'Питание': 'nutrition',
    'Дом': 'cleaning_services',
    'Дом и быт': 'cleaning_services',
    'Вредные привычки': 'smoke_free',
    'Творчество': 'palette',
    'Сон': 'bedtime',
    'Сон и отдых': 'bedtime'
  };
  /* свои категории: значок по смыслу названия, а не случайный из запаса */
  const CAT_ICON_RULES = [
    [/расхлам|убор|чист|порядок|мусор|лишн/i, 'cleaning_services'],
    [/коф|ча[йя]|caffe|напит/i, 'local_cafe'],
    [/сладк|конфет|сахар|десерт/i, 'candy'],
    [/кур|сигар|табак/i, 'smoke_free'],
    [/алког|пив|вино|бар/i, 'local_bar'],
    [/вод|пить|гидрат/i, 'water_drop'],
    [/еда|питан|диет|калор|белок/i, 'nutrition'],
    [/спорт|зал|трен|фитн|бег|кач/i, 'directions_run'],
    [/ходьб|прогул|шаг/i, 'directions_walk'],
    [/книг|чтен|учеб|обуч/i, 'menu_book'],
    [/сон|спаль|подъём|отдых/i, 'bedtime'],
    [/йог|дыхан|медит|расслаб|покой/i, 'self_improvement'],
    [/пис|рисов|твор|музык|гитар/i, 'palette'],
    [/финанс|деньг|бюджет|эконом/i, 'sell'],
    [/план|дел|задач|список|срок/i, 'checklist'],
    [/распис|врем/i, 'schedule'],
    [/растен|цвет|зелен/i, 'eco'],
    [/дом|квартир|быт/i, 'cleaning_services'],
    [/энерг|баланс|сил/i, 'bolt'],
    [/цел/i, 'target']
  ];
  const CAT_ICON_FALLBACK = ['tag', 'target', 'bolt', 'inbox', 'schedule', 'psychology', 'eco', 'local_cafe', 'fitness_center'];
  function catIcon(name) {
    if (CAT_ICONS[name]) return CAT_ICONS[name];
    /* категория, порождённая группой значков формы, — её же значок */
    for (let i = 0; i < ICON_GROUPS.length; i++) {
      if (ICON_GROUPS[i].cat === name) return ICON_GROUPS[i].icons[0];
    }
    for (let i = 0; i < CAT_ICON_RULES.length; i++) {
      if (CAT_ICON_RULES[i][0].test(name)) return CAT_ICON_RULES[i][1];
    }
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return CAT_ICON_FALLBACK[sum % CAT_ICON_FALLBACK.length];
  }

  /* тепловая карта за 12 недель: подписи месяцев и дней недели, подсказки по ячейкам */
  function heatBlockHTML() {
    const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const todayDate = new Date();
    const end = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    const offset = (end.getDay() + 6) % 7;
    const start = D.addDays(end, -offset - 7 * 11);
    const cells = [];
    const months = [];
    let lastMonth = -1;
    for (let i = 0; i < 12 * 7; i++) {
      const d = D.addDays(start, i);
      const ds = D.ymd(d);
      const st = S.dayStat(ds);
      const future = ds > D.today();
      /* уровень цвета: 0 — не выполнено, 1..3 — частично, 4 — выполнено целиком;
         «none» — в этот день по расписанию привычек не было */
      let lv = 'none';
      if (!future && st.due > 0) {
        const ratio = st.done / st.due;
        lv = ratio === 1 ? 4 : ratio >= 0.66 ? 3 : ratio >= 0.34 ? 2 : st.done > 0 ? 1 : 0;
      }
      const pct = st.due > 0 ? Math.round(st.done / st.due * 100) : 0;
      const info = st.due > 0
        ? `${UI.fmtShortDate(d)} · выполнено ${st.done} из ${st.due} (${pct}%)`
        : `${UI.fmtShortDate(d)} · по расписанию привычек нет`;
      cells.push(`<i class="heat-cell${future ? ' is-future' : ''}" data-lv="${future ? '' : lv}" data-info="${esc(info)}" aria-label="${esc(info)}"></i>`);
      if (i % 7 === 0) {
        const m = d.getMonth();
        months.push(`<span>${m !== lastMonth ? MONTHS_SHORT[m] : ''}</span>`);
        lastMonth = m;
      }
    }
    return `
      <div class="heat-months">${months.join('')}</div>
      <div class="heat-layout">
        <div class="heat-weekdays">
          <span>пн</span><span>вт</span><span>ср</span><span>чт</span><span>пт</span><span>сб</span><span>вс</span>
        </div>
        <div class="heat">${cells.join('')}</div>
      </div>
      <div class="chart-legend heat-legend">
        <span class="legend-head">цвет = доля выполненного за день</span>
        <span><i class="heat-cell" data-lv="none"></i>нет задач</span>
        <span><i class="heat-cell" data-lv="0"></i>не выполнено</span>
        <span><i class="heat-cell" data-lv="1"></i>меньше половины</span>
        <span><i class="heat-cell" data-lv="2"></i>около половины</span>
        <span><i class="heat-cell" data-lv="3"></i>почти всё</span>
        <span><i class="heat-cell" data-lv="4"></i>выполнено полностью</span>
        <span><i class="heat-cell is-future"></i>будущее</span>
      </div>
      <p class="heat-readout" id="heatReadout">Наведите курсор на ячейку — здесь появится дата и результат дня.</p>`;
  }

  /* строка привычки на экране «Сегодня» */
  function rowHTML(h, dateStr, opts) {
    opts = opts || {};
    const goal = h.goal || 1;
    const count = H.countFor(dateStr, h.id);
    const done = H.isDone(h, dateStr);
    const streak = S.habitStreak(h);
    const disabled = opts.disabled ? ' disabled' : '';

    const stepper = goal > 1
      ? `<div class="stepper">
           <button type="button" data-act="minus" aria-label="Меньше"${count <= 0 || opts.disabled ? ' disabled' : ''}>−</button>
           <b>${count}/${goal}</b>
           <button type="button" data-act="plus" aria-label="Больше"${count >= goal || opts.disabled ? ' disabled' : ''}>+</button>
         </div>`
      : '';

    const side = (opts.noSide || !stepper) ? '' : `<div class="habit-side">${stepper}</div>`;

    return `
      <li class="habit-row${done ? ' is-done' : ''}" data-id="${h.id}">
        <button type="button" class="check" data-act="toggle" aria-pressed="${done}" aria-label="Отметить выполнение" title="Отметить выполнение"${disabled}>${UI.icon('check')}</button>
        <span class="habit-icon" title="${esc(h.name)}" style="background:${tint(h.color, .16)};color:${h.color}">${UI.icon(h.icon)}</span>
        <div class="habit-main">
          <div class="habit-name">
            <span class="name-text">${esc(h.name)}</span>
            <button type="button" class="chip chip--link" data-act="edit" title="Редактировать привычку и категорию" aria-label="Редактировать привычку ${esc(h.name)}">${esc(h.category || 'Без категории')}</button>
          </div>
          <div class="habit-meta">
            <span title="Текущая серия" class="meta-streak${streak > 0 ? ' is-on' : ''}">${UI.icon('local_fire_department')}${streak > 0 ? progressText(streak) : 'серия не начата'}</span>
            <span>${esc(UI.frequencyText(h))}</span>
            ${done ? `<span class="chip chip--success">${UI.icon('check')}Готово</span>` : ''}
          </div>
        </div>
        ${side}
      </li>`;
  }

  function emptyState(iconName, title, text, btnLabel, btnHref) {
    return `
      <div class="empty">
        <div class="empty-emoji">${UI.icon(iconName)}</div>
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
        ${btnLabel ? `<a class="btn btn-primary" href="${btnHref}">${esc(btnLabel)}</a>` : ''}
      </div>`;
  }

  /** сообщение-состояние вместо разметки (Completed / Incomplete / First day…) */
  function statusNote(kind, text) {
    const map = { done: 'check', todo: 'schedule', hint: 'info', warn: 'warning', streak: 'local_fire_department' };
    return `<div class="status-note status-note--${kind}">${UI.icon(map[kind] || 'info')}<span>${esc(text)}</span></div>`;
  }

  function go(hash) { location.hash = hash; }

  /**
   * Делегирование события на корневой элемент экрана.
   * Экран перерисовывается многократно, а корень (#view) живёт вечно,
   * поэтому предыдущий обработчик обязательно снимается — иначе клики
   * начнут срабатывать несколько раз после повторных заходов.
   */
  function delegate(root, type, handler) {
    const key = '__delegate_' + type;
    if (root[key]) root.removeEventListener(type, root[key]);
    root[key] = handler;
    root.addEventListener(type, handler);
  }

  /**
   * Стрелки прокрутки для горизонтальных галерей («Привычки», «Категории»).
   * На ПК галереи листаются стрелками, на узких экранах кнопки скрыты в CSS —
   * там остаётся свайп-прокрутка. Кнопка, листать некуда, гасится.
   */
  function attachGalleries(root) {
    root.querySelectorAll('[data-gal]').forEach(gal => {
      const scroller = gal.querySelector('[data-gal-scroller]');
      if (!scroller) return;

      const step = () => {
        const first = scroller.firstElementChild;
        const w = first ? first.getBoundingClientRect().width : scroller.clientWidth;
        const gap = parseFloat(getComputedStyle(scroller).columnGap) || 0;
        return Math.max(160, w + gap);
      };

      const sync = () => {
        const max = scroller.scrollWidth - scroller.clientWidth;
        gal.classList.toggle('is-start', scroller.scrollLeft <= 2);
        gal.classList.toggle('is-end', max <= 2 || scroller.scrollLeft >= max - 2);
      };

      gal.querySelectorAll('[data-gal-btn]').forEach(btn => {
        btn.addEventListener('click', () => {
          scroller.scrollBy({
            left: (btn.dataset.galBtn === 'prev' ? -1 : 1) * step(),
            behavior: 'smooth'
          });
        });
      });

      scroller.addEventListener('scroll', sync, { passive: true });

      /* следим за размерами: перерисовка экрана заменяет элементы целиком,
         поэтому наблюдатель сам отключается вместе с ними */
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(sync);
        ro.observe(scroller);
        Array.prototype.forEach.call(scroller.children, ch => ro.observe(ch));
      }
      sync();
    });
  }

  /* =======================================================
     1. ЭКРАН «СЕГОДНЯ»
     ======================================================= */
  /* последнее значение круга: кольцо пересоздаётся при каждой перерисовке,
     поэтому стартуем анимацию заполнения с прежнего процента, а не с нуля */
  let ringP = 0;

  function today(root) {
    function render() { today(root); }
    /* входим на экран — кольцо показываем с анимацией; при отметке привычки
       (перерисовка того же экрана) анимацию входа не повторяем */
    const intro = root.dataset.screen !== 'today';
    root.dataset.screen = 'today';

    const dateStr = D.today();
    const date = new Date();
    const name = Store.Settings.get().name;
    const due = H.active().filter(h => H.isDue(h, dateStr));
    const done = due.filter(h => H.isDone(h, dateStr));

    const yest = D.ymd(D.addDays(new Date(), -1));
    const yestStat = S.dayStat(yest);
    const todayPct = due.length ? Math.round((done.length / due.length) * 100) : 0;

    const diff = done.length - yestStat.done;
    let betterTitle, betterText;
    if (!due.length && !H.active().length) {
      betterTitle = 'Начните с одной привычки';
      betterText = 'Добавьте привычку — и завтра здесь появится ваш прогресс.';
    } else if (!due.length) {
      betterTitle = 'Сегодня отдыхаем';
      betterText = 'По расписанию на сегодня привычек нет. Загляните в раздел «Привычки».';
    } else if (done.length === due.length) {
      betterTitle = 'Отлично! Все привычки выполнены.';
      betterText = 'План на сегодня закрыт целиком. Хорошая работа.';
    } else if (!yestStat.due) {
      betterTitle = 'Новый день — новый результат';
      betterText = 'Вчера отметок не было, так что сегодняшний результат задаст планку.';
    } else if (diff > 0) {
      betterTitle = 'Лучше, чем вчера';
      betterText = `Вы уже на ${progressText(diff)} впереди вчерашнего результата.`;
    } else if (diff === 0) {
      betterTitle = 'Лучше, чем вчера';
      betterText = 'Пока на уровне вчерашнего дня — ещё есть время его перепрыгнуть.';
    } else {
      betterTitle = 'Хороший результат';
      betterText = `Осталось ещё ${due.length - done.length} ${plural(due.length - done.length, 'привычка', 'привычки', 'привычек')}. Вчера было ${yestStat.done} из ${yestStat.due}.`;
    }

    /* полезная статистика за 7 дней и текущая серия */
    const r7 = S.periodStat(7);
    const curStreak = S.overallStreak();

    /* количественные привычки: человекочитаемые переводы за 7 дней */
    const quantRows = H.active()
      .map(h => ({ h, total: S.habitTotal(h, 7) }))
      .filter(x => x.total > 0 && UI.humanize(x.total, x.h.unit))
      .slice(0, 3);
    const quantHTML = quantRows.length ? `
      <section class="card chart-card quant-card">
        <h3 class="card-title">Перевод в понятные величины</h3>
        <ul class="quant-list">
          ${quantRows.map(({ h, total }) => `
            <li>
              <span class="quant-name">${UI.icon(h.icon)}${esc(h.name)}</span>
              <span class="quant-value">${total} ${esc(h.unit)} <span class="muted">≈ ${esc(UI.humanize(total, h.unit))}</span></span>
            </li>`).join('')}
        </ul>
      </section>` : '';

    /* первые дни и длинные серии */
    const createdDays = H.active().length ? Math.min(3650, D.daysBetween(D.ymd(new Date(H.active().map(h => h.createdAt).sort((a, b) => a - b)[0])), dateStr)) : 0;
    let note = '';
    if (H.active().length && !r7.done && createdDays <= 1) {
      note = statusNote('hint', 'Первый день. Просто отметьте первую привычку.');
    } else if (curStreak >= 30) {
      note = statusNote('streak', `${curStreak} ${plural(curStreak, 'день', 'дня', 'дней')} подряд — отличная серия!`);
    } else if (due.length && done.length < due.length && !done.length) {
      note = statusNote('todo', 'Сегодня не получилось. Завтра продолжаем.');
    } else if (due.length && done.length === due.length) {
      note = statusNote('done', 'Отлично! Все привычки выполнены.');
    }

    root.innerHTML = `
      <div class="page-head">
        <div>
          <p class="eyebrow">${esc(UI.fmtLongDate(date))}</p>
          <h1>${esc(UI.greeting())}${name ? ', ' + esc(name) : ''}</h1>
        </div>
      </div>

      <div class="today-layout">
        <div class="today-col today-col--hero">
          <section class="today-hero">
            <p class="eyebrow">Прогресс на сегодня</p>
            <div class="progress-ring${due.length && todayPct === 100 ? ' is-full' : ''}${intro ? ' is-intro' : ''}"><span>${todayPct}%</span></div>
            <p class="hero-lead">${due.length
              ? (due.length - done.length
                  ? `Осталось: ${due.length - done.length} ${plural(due.length - done.length, 'привычка', 'привычки', 'привычек')}`
                  : 'Задание на сегодня выполнено')
              : 'На сегодня привычек по расписанию нет'}</p>
            <section class="better-card">
              <p class="better-title">${esc(betterTitle)}</p>
              <p class="better-text">${esc(betterText)}</p>
              <div class="better-numbers">
                <div><b>${yestStat.done}/${yestStat.due}</b><span>вчера</span></div>
                <div><b>${done.length}/${due.length}</b><span>сегодня</span></div>
              </div>
            </section>
          </section>

          ${note}
        </div>

        <div class="today-col today-col--list">
          ${due.length
            ? `<ul class="habit-list" id="todayList">${due.map(h => rowHTML(h, dateStr)).join('')}</ul>`
            : (H.active().length
                ? emptyState('calendar_today', 'Сегодня отдыхаем', 'На сегодня по расписанию нет привычек. Загляните в раздел «Привычки».', 'Все привычки', '#/habits')
                : emptyState('target', 'Начните с одной привычки', 'Создайте привычку — она появится здесь и начнёт вашу серию.', 'Создать привычку', '#/habit/new'))}

          ${quantHTML}
        </div>
      </div>
    `;

    /* плавно доводим заливку до текущего процента: элемент кольца создаётся
       заново, поэтому без явного старта от прежнего значения перехода не будет */
    const ring = root.querySelector('.progress-ring');
    if (ring) {
      const from = intro ? 0 : ringP;
      ring.style.setProperty('--p', String(from));
      const nextFrame = (f) => (typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(f)
        : setTimeout(f, 16));
      nextFrame(() => nextFrame(() => ring.style.setProperty('--p', String(todayPct))));
      ringP = todayPct;
    }

    const list = root.querySelector('#todayList');
    if (list) {
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const row = btn.closest('.habit-row');
        const id = row.dataset.id;
        const act = btn.dataset.act;
        if (act === 'toggle') {
          H.toggle(id, dateStr);
          render();
          const h = H.get(id);
          if (h && H.isDone(h, dateStr)) UI.toast(`«${h.name}» — выполнено ✓`);
        } else if (act === 'plus' || act === 'minus') {
          const cur = H.countFor(dateStr, id);
          H.setCount(id, dateStr, act === 'plus' ? cur + 1 : cur - 1);
          render();
        } else if (act === 'edit') {
          go('#/habit/' + id);
        }
      });
    }
  }

  /* =======================================================
     2. ЭКРАН «ПРЫВЫЧКИ»
     ======================================================= */
  let habitsFilter = 'active';

  function habits(root) {
    function render() {
      const list = habitsFilter === 'active' ? H.active() : H.archived();
      const total = { active: H.active().length, archived: H.archived().length };
      const dateStr = D.today();

      /* состояние «превышен лимит пропусков» */
      const over = habitsFilter === 'active'
        ? H.active().filter(h => Store.missStats(h).exceeded)
        : [];
      const warnNote = over.length
        ? statusNote('warn', over.length === 1
            ? `У привычки «${over[0].name}» пропущено больше нормы в этом месяце. Норму можно изменить в настройках привычки.`
            : `У ${over.length} ${plural(over.length, 'привычки', 'привычек', 'привычек')} пропущено больше нормы в этом месяце.`)
        : '';

      root.innerHTML = `
        <div class="page-head">
          <div class="page-head__main">
            <p class="eyebrow">Управление</p>
            <div class="page-head__row">
              <h1>Привычки</h1>
              <button class="btn btn-primary page-add" id="pageAddBtn" type="button"><span data-icon="add"></span>Привычка</button>
            </div>
          </div>
        </div>

        <div class="toolbar">
          <div class="segmented" role="tablist">
            <button type="button" data-filter="active" class="${habitsFilter === 'active' ? 'is-active' : ''}">Активно · ${total.active}</button>
            <button type="button" data-filter="archived" class="${habitsFilter === 'archived' ? 'is-active' : ''}">В архиве · ${total.archived}</button>
          </div>
        </div>

        ${warnNote}

        ${list.length
          ? `<div class="gal" data-gal>
              <button class="gal-btn" type="button" data-gal-btn="prev" aria-label="Предыдущие карточки">${UI.icon('chevron_left')}</button>
              <div class="card-list" data-gal-scroller>${list.map(h => cardHTML(h, dateStr)).join('')}</div>
              <button class="gal-btn" type="button" data-gal-btn="next" aria-label="Следующие карточки">${UI.icon('chevron_right')}</button>
            </div>`
          : (habitsFilter === 'active'
              ? emptyState('target', 'У вас пока нет привычек', 'Создайте первую привычку — это займёт меньше минуты.', 'Создать привычку', '#/habit/new')
              : emptyState('archive', 'Архив пуст', 'Архивированные привычки появятся здесь.'))}
        `;
      attachGalleries(root);
    }

    function cardHTML(h, dateStr) {
      const streak = S.habitStreak(h);
      const best = S.habitBest(h);
      const pct30 = S.rangeOfHabit(h, 30);
      const scheduledToday = H.isScheduled(h, dateStr) && !h.archived;
      const count = H.countFor(dateStr, h.id);
      const goal = h.goal || 1;

      /* допустимые пропуски в этом месяце */
      const miss = Store.missStats(h);
      let missChip = '';
      if (!h.archived && miss.limit > 0) {
        if (miss.exceeded) missChip = `<span class="chip chip--warn" title="Пропущено ${miss.missed} из ${miss.limit} допустимых">${UI.icon('warning')}Пропущено ${miss.missed} ${plural(miss.missed, 'день', 'дня', 'дней')}</span>`;
        else if (miss.remaining >= 0) missChip = `<span class="chip chip--ok" title="В этом месяце">Осталось ${miss.remaining} ${plural(miss.remaining, 'пропуск', 'пропуска', 'пропусков')}</span>`;
      }

      /* количественный «перевод» цели */
      const goalHuman = goal > 1 ? UI.humanize(goal, h.unit) : '';

      let todayLine;
      if (h.archived) todayLine = `<span class="chip chip--muted">${UI.icon('archive')}В архиве</span>`;
      else if (!scheduledToday) todayLine = '<span class="chip chip--muted">Сегодня не по расписанию</span>';
      else if (count >= goal) todayLine = `<span class="chip chip--success">${UI.icon('check')}Сегодня выполнено</span>`;
      else todayLine = '<span class="chip chip--accent">Сегодня</span>';

      return `
        <article class="card habit-card" data-id="${h.id}">
          <div class="habit-card-head">
            <span class="habit-icon" title="${esc(h.name)}" style="background:${tint(h.color, .16)};color:${h.color}">${UI.icon(h.icon)}</span>
            <div class="habit-main">
              <div class="habit-name"><span class="name-text">${esc(h.name)}</span></div>
              <div class="habit-meta">
                <button type="button" class="chip chip--link" data-act="edit" title="Редактировать привычку и категорию" aria-label="Редактировать привычку ${esc(h.name)}">${esc(h.category || 'Без категории')}</button>
                <span>${esc(UI.frequencyText(h))}</span>
                <span title="Цель">Цель: ${esc(UI.goalText(h))}${goalHuman ? ` <span class="muted">≈ ${esc(goalHuman)}</span>` : ''}</span>
              </div>
            </div>
          </div>

          <div class="habit-goal">
            ${todayLine}
            ${scheduledToday ? `<span class="goal-count">${count} <span class="muted">из ${goal}</span></span>` : ''}
          </div>

          ${missChip ? `<div class="habit-miss">${missChip}</div>` : ''}

          <div class="habit-card-foot">
            <div class="stat-mini">
              <div title="Текущая серия"><b>${streak}</b><span>серия</span></div>
              <div title="Лучшая серия"><b>${best}</b><span>лучшая серия</span></div>
              <div title="Выполнение за 30 дней"><b>${pct30}%</b><span>30 дней</span></div>
            </div>
            <div class="habit-actions">
              <button class="icon-btn" data-act="edit" type="button" title="Редактировать" aria-label="Редактировать привычку">${UI.icon('edit')}</button>
              <button class="icon-btn" data-act="archive" type="button" title="${h.archived ? 'Вернуть из архива' : 'В архив'}" aria-label="${h.archived ? 'Вернуть из архива' : 'Архивировать'}">${UI.icon(h.archived ? 'unarchive' : 'archive')}</button>
              <button class="icon-btn" data-act="delete" type="button" title="Удалить" aria-label="Удалить привычку">${UI.icon('delete')}</button>
            </div>
          </div>
        </article>`;
    }

    render();

    delegate(root, 'click', (e) => {
      const filterBtn = e.target.closest('[data-filter]');
      if (filterBtn) {
        habitsFilter = filterBtn.dataset.filter;
        render();
        return;
      }
      const btn = e.target.closest('[data-act]');
      const card = e.target.closest('.habit-card');
      if (!btn || !card) return;
      const id = card.dataset.id;
      const habit = H.get(id);
      if (!habit) return;

      if (btn.dataset.act === 'edit') {
        go('#/habit/' + id);
      } else if (btn.dataset.act === 'archive') {
        H.setArchived(id, !habit.archived);
        UI.toast(habit.archived ? `«${habit.name}» возвращена из архива` : `«${habit.name}» отправлена в архив`);
        render();
      } else if (btn.dataset.act === 'delete') {
        const best = S.habitBest(habit);
        UI.confirm({
          title: 'Удалить привычку?',
          text: `Привычка «${esc(habit.name)}» и вся её история будут удалены безвозвратно.` +
                (best > 1 ? ` Лучшая серия — ${best} ${plural(best, 'день', 'дня', 'дней')} — тоже исчезнет.` : ''),
          okText: 'Удалить',
          danger: true
        }).then(ok => {
          if (!ok) return;
          H.remove(id);
          UI.toast('Привычка удалена');
          render();
        });
      }
    });
  }

  /* =======================================================
     3. ЭКРАН «СОЗДАТЬ / РЕДАКТИРОВАТЬ ПРЫВЫЧКУ»
     ======================================================= */
  function missHintText(v) {
    const n = Math.max(0, Math.min(31, parseInt(v, 10) || 0));
    if (n === 0) return 'Без лимита — пропуски не будут считаться';
    if (n === 1) return 'Допустим 1 пропуск в этом месяце';
    return `Допустимо ${n} ${plural(n, 'пропуск', 'пропуска', 'пропусков')} в этом месяце`;
  }

  /* ---- значки формы: русские подписи и смысловые группы ---- */
  const ICON_RU = {
    /* спорт и движение */
    directions_run: 'Бег', fitness_center: 'Тренировки',
    directions_bike: 'Велосипед', emoji_people: 'Танцы',
    /* питание */
    nutrition: 'Здоровое питание', restaurant: 'Диета',
    local_cafe: 'Кофе', water_drop: 'Вода',
    /* дом и быт */
    cleaning_services: 'Генеральная уборка', storage: 'Порядок',
    local_grocery_store: 'Продукты',
    /* вредные привычки */
    smoke_free: 'Курение', candy: 'Сладости', local_bar: 'Алкоголь',
    face_retouching_natural: 'Прыщи', back_hand: 'Грызть ногти',
    /* сон и отдых */
    bedtime: 'Режим сна', eco: 'Природа', bolt: 'Энергия',
    /* творчество */
    headphones: 'Музыка', palette: 'Рисование', interests: 'Хобби',
    /* здоровье */
    medication: 'Лекарства', self_improvement: 'Медитация', psychology: 'Психология',
    /* учёба и работа */
    menu_book: 'Чтение', target: 'Цель', checklist: 'Задачи', schedule: 'Расписание'
  };

  /* cat — категория, которая проставляется автоматически при выборе значка;
     bad — группа «вредных привычек»: значки перечёркиваются */
  const ICON_GROUPS = [
    { title: 'Спорт и движение', cat: 'Спорт и движение', icons: ['directions_run', 'fitness_center', 'directions_bike', 'emoji_people'] },
    { title: 'Питание', cat: 'Питание', icons: ['nutrition', 'restaurant', 'local_cafe', 'water_drop'] },
    { title: 'Дом и быт', cat: 'Дом и быт', icons: ['cleaning_services', 'storage', 'local_grocery_store'] },
    { title: 'Вредные привычки', cat: 'Вредные привычки', bad: true, icons: ['smoke_free', 'candy', 'local_bar', 'face_retouching_natural', 'back_hand'] },
    { title: 'Сон и отдых', cat: 'Сон и отдых', icons: ['bedtime', 'eco', 'bolt'] },
    { title: 'Творчество', cat: 'Творчество', icons: ['headphones', 'palette', 'interests'] },
    { title: 'Здоровье', cat: 'Здоровье', icons: ['medication', 'self_improvement', 'psychology'] },
    { title: 'Учёба и работа', cat: 'Учёба и работа', icons: ['menu_book', 'target', 'checklist', 'schedule'] }
  ];

  function groupOfIcon(name) {
    for (let i = 0; i < ICON_GROUPS.length; i++) {
      if (ICON_GROUPS[i].icons.indexOf(name) !== -1) return ICON_GROUPS[i];
    }
    return null;
  }

  /* общий контейнер #iconPicker — обработчик клика остаётся прежним */
  function iconPickerHTML(current) {
    return `<div class="icon-groups" id="iconPicker">${ICON_GROUPS.map(g => `
      <div class="icon-group${g.bad ? ' icon-group--bad' : ''}">
        <span class="icon-group__title">${g.title}</span>
        <div class="picker picker--icons${g.bad ? ' picker--bad' : ''}">
          ${g.icons.map(i => `<button type="button" class="${i === current ? 'is-active' : ''}" data-icon="${i}"${g.bad && i !== 'smoke_free' ? ' data-bad="1"' : ''} aria-label="${ICON_RU[i] || i}" title="${ICON_RU[i] || i}">${UI.icon(i)}</button>`).join('')}
        </div>
      </div>`).join('')}
    </div>`;
  }

  /* чипы категорий: свои (не из пресета) получают кнопку удаления */
  function catPickerHTML(current) {
    const presets = Store.meta.PRESET_CATEGORIES;
    return Store.Categories.all().map(c => {
      const on = c === current;
      const custom = presets.indexOf(c) === -1;
      return `<span class="cat-chip${custom ? ' cat-chip--custom' : ''}">
        <button type="button" class="${on ? 'is-active' : ''}" data-cat="${esc(c)}" aria-pressed="${on}">${esc(c)}</button>
        ${custom ? `<button type="button" class="cat-chip__del" data-del-cat="${esc(c)}" title="Удалить категорию «${esc(c)}»" aria-label="Удалить категорию ${esc(c)}">${UI.icon('close')}</button>` : ''}
      </span>`;
    }).join('');
  }

  function habitForm(root, params) {
    const editing = params && params.id ? H.get(params.id) : null;
    if (params && params.id && !editing) {
      root.innerHTML = emptyState('info', 'Привычка не найдена', 'Возможно, она была удалена.', 'К списку привычек', '#/habits');
      return;
    }

    const presets = Store.Categories.all();
    const presetNames = Store.meta.PRESET_CATEGORIES;
    const model = editing
      ? Object.assign({}, editing, { days: (editing.days || []).slice() })
      : {
          name: '', icon: '', color: '#B83729',
          category: '', frequency: 'daily', days: [1, 3, 5],
          times: 1, timesPeriod: 'week',
          reminder: '', unit: 'раз', goal: 1,
          missLimit: Store.meta.DEFAULT_MISS_LIMIT
        };
    if (typeof model.missLimit !== 'number') model.missLimit = Store.meta.DEFAULT_MISS_LIMIT;
    if (model.frequency === 'times') {
      model.times = Math.max(1, parseInt(model.times, 10) || 1);
      if (model.timesPeriod !== 'day' && model.timesPeriod !== 'month') model.timesPeriod = 'week';
    }

    /* режим категории: 'auto' — проставляется по группе значка,
       'custom' — пользователь ввёл свою; режимы взаимоисключающие */
    const startGroup = groupOfIcon(model.icon);
    let catMode = 'auto';
    if (editing && model.category && (!startGroup || startGroup.cat !== model.category)) catMode = 'custom';

    const weekOrder = [1, 2, 3, 4, 5, 6, 0];

    root.innerHTML = `
      <form class="card form-card" id="habitFormEl" novalidate>
        <div class="page-head">
          <div>
            <p class="eyebrow back-link"><a href="#/habits">${UI.icon('chevron_left')}Привычки</a></p>
            <h1>${editing ? 'Редактировать привычку' : 'Создать привычку'}</h1>
          </div>
        </div>

        <div class="form-grid">
          <label class="field span-2">
            <span>Название *</span>
            <input type="text" name="name" maxlength="80" required placeholder="Например: Выпить 8 стаканов воды" value="${esc(model.name)}">
            <span class="field-error" id="errName"></span>
          </label>

          <div class="field span-2">
            <span>Значок</span>
            ${iconPickerHTML(model.icon)}
            <div class="lock-row" id="iconLockRow" hidden>
              <span class="field-hint">Значки недоступны: выбрана своя категория</span>
              <button class="btn btn-ghost btn-sm" type="button" id="iconUnlock">${UI.icon('add')}Выбрать значок</button>
            </div>
          </div>

          <div class="field">
            <span>Цвет</span>
            <div class="color-picker" id="colorPicker">
              ${Store.meta.COLORS.map(c => `<button type="button" class="${c.toLowerCase() === String(model.color).toLowerCase() ? 'is-active' : ''}" data-color="${c}" style="background:${c}" aria-label="Цвет ${c}"></button>`).join('')}
            </div>
          </div>

          <div class="field">
            <span>Пропуски в месяц</span>
            <div class="stepper stepper--lg" id="missStepper">
              <button type="button" data-step="-1" aria-label="Уменьшить лимит пропусков">−</button>
              <input class="step-val" type="number" id="missOut" name="missLimit" min="0" max="31"
                     value="${model.missLimit}" aria-label="Лимит пропусков в месяц">
              <button type="button" data-step="1" aria-label="Увеличить лимит пропусков">+</button>
            </div>
            <span class="field-hint" id="missHint">${missHintText(model.missLimit)}</span>
          </div>

          <div class="field span-2" id="catField">
            <span>Категория</span>
            <div class="picker cat-picker" id="catPicker">${catPickerHTML(model.category)}</div>
            <div class="field-row">
              <input type="text" name="category" maxlength="40" placeholder="Или впишите свою категорию" value="${esc(model.category)}">
              <a class="btn btn-ghost btn-sm" href="#/categories">Управлять</a>
            </div>
            <div class="lock-row" id="catLockRow">
              <span class="field-hint" id="catAutoHint">Категория подобрана по значку</span>
              <button class="btn btn-ghost btn-sm" type="button" id="catUnlock">Своя категория</button>
            </div>
            <span class="field-hint">Выберите готовую категорию или введите свою — её всегда можно поменять</span>
          </div>

          <div class="field span-2">
            <span>Периодичность</span>
            <div class="segmented segmented--form" id="freqRow" role="radiogroup" aria-label="Периодичность">
              <label class="seg-opt ${model.frequency === 'daily' ? 'is-active' : ''}">
                <input type="radio" name="frequency" value="daily" ${model.frequency === 'daily' ? 'checked' : ''}> Каждый день
              </label>
              <label class="seg-opt ${model.frequency === 'weekly' ? 'is-active' : ''}">
                <input type="radio" name="frequency" value="weekly" ${model.frequency === 'weekly' ? 'checked' : ''}> Дни недели
              </label>
              <label class="seg-opt ${model.frequency === 'times' ? 'is-active' : ''}">
                <input type="radio" name="frequency" value="times" ${model.frequency === 'times' ? 'checked' : ''}> Несколько раз
              </label>
            </div>
          </div>

          <div class="field span-2 ${model.frequency === 'times' ? '' : 'hidden'}" id="timesField">
            <span>Сколько раз и с какой периодичностью</span>
            <div class="goal-row">
              <div class="stepper stepper--lg" id="timesStepper">
                <button type="button" data-step="-1" aria-label="Уменьшить количество раз">−</button>
                <input class="step-val" type="number" id="timesOut" name="times" min="1" max="60"
                       value="${model.times || 1}" aria-label="Сколько раз">
                <button type="button" data-step="1" aria-label="Увеличить количество раз">+</button>
              </div>
              <select name="timesPeriod" aria-label="Период">
                <option value="day" ${model.timesPeriod === 'day' ? 'selected' : ''}>в день</option>
                <option value="week" ${model.timesPeriod === 'week' || !model.timesPeriod ? 'selected' : ''}>в неделю</option>
                <option value="month" ${model.timesPeriod === 'month' ? 'selected' : ''}>в месяц</option>
              </select>
            </div>
            <span class="field-error" id="errTimes"></span>
            <span class="field-hint">Например: 2 раза в неделю или 5 раз в месяц</span>
          </div>

          <div class="field ${model.frequency === 'weekly' ? '' : 'hidden'}" id="daysField">
            <span>Дни недели</span>
            <div class="weekdays" id="weekdays">
              ${weekOrder.map(d => `<button type="button" data-day="${d}" class="${model.days.indexOf(d) !== -1 ? 'is-active' : ''}" aria-pressed="${model.days.indexOf(d) !== -1}">${UI.WEEKDAYS_SHORT[d]}</button>`).join('')}
            </div>
            <span class="field-error" id="errDays"></span>
          </div>

          <label class="field">
            <span>Напоминание</span>
            <input type="time" name="reminder" value="${esc(model.reminder || '')}">
            <span class="field-hint">Push-напоминание, когда приложение открыто</span>
          </label>

          <div class="field span-2">
            <span>Цель и единица измерения</span>
            <div class="goal-row">
              <div class="stepper stepper--lg" id="goalStepper">
                <button type="button" data-step="-1" aria-label="Уменьшить цель">−</button>
                <input class="step-val" type="number" id="goalOut" name="goal" min="1" max="999"
                       value="${model.goal || 1}" aria-label="Цель">
                <button type="button" data-step="1" aria-label="Увеличить цель">+</button>
              </div>
              <select name="unit">
                ${Store.meta.UNITS.map(u => `<option value="${u}" ${u === model.unit ? 'selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
            <span class="field-hint">Впишите число вручную или задайте его кнопками «−/+», затем выберите единицу</span>
          </div>

          <div class="field span-2">
            <span>Пример</span>
            <p class="field-hint" id="goalPreview">${esc(previewText(model))}</p>
          </div>
        </div>

        <p class="form-error sr-only" id="formError" aria-live="polite"></p>

        <div class="form-actions">
          <button class="btn btn-primary" type="submit">${editing ? 'Сохранить изменения' : 'Создать привычку'}</button>
          <button class="btn btn-ghost" type="button" data-act="cancel">Отмена</button>
          <span class="spacer"></span>
          ${editing
            ? `<button class="btn btn-ghost" type="button" data-act="archive">${editing.archived ? 'Вернуть из архива' : 'В архив'}</button>
               <button class="btn btn-danger" type="button" data-act="delete">Удалить</button>`
            : ''}
        </div>
      </form>
    `;

    const form = root.querySelector('#habitFormEl');
    const errEl = root.querySelector('#formError');
    const F = (n) => form.querySelector('[name="' + n + '"]');
    const FREQ = () => (form.querySelector('[name="frequency"]:checked') || { value: 'daily' }).value;

    function previewText(m) {
      const goal = Math.max(1, parseInt(m.goal, 10) || 1);
      const unit = m.unit || 'раз';
      let when;
      if (m.frequency === 'weekly') {
        when = (m.days || []).length
          ? ` (${(m.days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => UI.WEEKDAYS_SHORT[d]).join(', ')})`
          : ' (дни не выбраны)';
      } else if (m.frequency === 'times') {
        when = ` (${UI.frequencyText({ frequency: 'times', times: m.times, timesPeriod: m.timesPeriod })})`;
      } else {
        when = ' (каждый день)';
      }
      const human = UI.humanize(goal, unit);
      return `Цель: ${goal} ${UI.unitForm(goal, unit)}${human ? ` ≈ ${human}` : ''}${when}`;
    }

    function syncPreview() {
      model.goal = Math.max(1, parseInt(F('goal').value, 10) || 1);
      model.unit = F('unit').value;
      model.frequency = FREQ();
      model.days = selectedDays();
      if (model.frequency === 'times') {
        model.times = Math.max(1, parseInt(F('times').value, 10) || 1);
        model.timesPeriod = F('timesPeriod').value;
      }
      const goalOut = root.querySelector('#goalOut');
      if (goalOut) goalOut.value = model.goal;
      root.querySelector('#goalPreview').textContent = previewText(model);
      root.querySelector('#daysField').classList.toggle('hidden', model.frequency !== 'weekly');
      const timesField = root.querySelector('#timesField');
      if (timesField) timesField.classList.toggle('hidden', model.frequency !== 'times');
      root.querySelectorAll('#freqRow .seg-opt, #freqRow .radio-card').forEach(el => {
        const input = el.querySelector('input');
        el.classList.toggle('is-active', !!(input && input.checked));
      });
      updateDaysHint();
    }

    function updateDaysHint() {
      const hint = root.querySelector('#errDays');
      if (!hint) return;
      hint.textContent = (model.frequency === 'weekly' && !selectedDays().length)
        ? 'Выберите хотя бы один день недели'
        : '';
    }

    function setError(sel, msg) {
      const el = root.querySelector(sel);
      if (el) el.textContent = msg || '';
    }

    function selectedDays() {
      return Array.from(root.querySelectorAll('#weekdays .is-active')).map(b => Number(b.dataset.day));
    }

    form.addEventListener('change', syncPreview);
    form.addEventListener('input', (e) => {
      if (e.target.name === 'name') setError('#errName', '');
      if (e.target.name === 'goal' || e.target.name === 'unit' ||
          e.target.name === 'times' || e.target.name === 'timesPeriod') syncPreview();
    });

    /* категория: чипы-подсказки + свободный ввод */
    const catInput = F('category');
    function syncCatChips() {
      const v = catInput.value.trim();
      root.querySelectorAll('#catPicker [data-cat]').forEach(b => {
        const on = b.dataset.cat === v;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }

    /* ---- значок и категория: один выбирается, второй подставляется ---- */
    function applyLocks() {
      const group = groupOfIcon(model.icon);
      /* категория «прилипла» к значку — строка категории закрыта для ввода */
      const autoLocked = catMode === 'auto' && !!group && catInput.value.trim() === group.cat;
      const iconsLocked = catMode === 'custom';

      const catField = root.querySelector('#catField');
      if (catField) catField.classList.toggle('is-locked', autoLocked);
      catInput.disabled = autoLocked;
      root.querySelectorAll('#catPicker [data-cat]').forEach(b => { b.disabled = autoLocked; });
      const manage = root.querySelector('#catField .field-row .btn');
      if (manage) { manage.classList.toggle('is-disabled', autoLocked); manage.setAttribute('aria-disabled', String(autoLocked)); }
      const catLockRow = root.querySelector('#catLockRow');
      if (catLockRow) {
        catLockRow.hidden = !autoLocked;
        const hint = root.querySelector('#catAutoHint');
        if (hint && group) hint.textContent = `«${ICON_RU[model.icon] || model.icon}» → категория «${group.cat}»`;
      }

      const picker = root.querySelector('#iconPicker');
      if (picker) picker.classList.toggle('is-locked', iconsLocked);
      root.querySelectorAll('#iconPicker button').forEach(b => { b.disabled = iconsLocked; });
      const iconLockRow = root.querySelector('#iconLockRow');
      if (iconLockRow) iconLockRow.hidden = !iconsLocked;
    }

    function toCustomMode() {
      if (catMode !== 'custom') { catMode = 'custom'; applyLocks(); }
    }

    function removeCategory(name) {
      UI.confirm({
        title: 'Удалить категорию?',
        text: `Категория «${esc(name)}» будет удалена. Привычки с ней получат статус «Без категории» — история сохранится.`,
        okText: 'Удалить',
        danger: true
      }).then(ok => {
        if (!ok) return;
        if (model.category === name) { model.category = ''; catInput.value = ''; }
        Store.Categories.remove(name);
        root.querySelector('#catPicker').innerHTML = catPickerHTML(catInput.value.trim());
        UI.toast('Категория удалена');
        syncCatChips();
        applyLocks();
      });
    }

    root.querySelector('#iconPicker').addEventListener('click', (e) => {
      const b = e.target.closest('[data-icon]');
      if (!b) return;
      model.icon = b.dataset.icon;
      root.querySelectorAll('#iconPicker button').forEach(x => x.classList.toggle('is-active', x === b));
      const group = groupOfIcon(model.icon);
      if (catMode === 'auto' && group) {
        model.category = group.cat;
        catInput.value = group.cat;
        syncCatChips();
      }
      applyLocks();
    });

    root.querySelector('#colorPicker').addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (!b) return;
      model.color = b.dataset.color;
      root.querySelectorAll('#colorPicker button').forEach(x => x.classList.toggle('is-active', x === b));
    });

    root.querySelector('#catPicker').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del-cat]');
      if (del) { removeCategory(del.dataset.delCat); return; }
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      catInput.value = b.dataset.cat;
      model.category = b.dataset.cat;
      toCustomMode();
      syncCatChips();
    });
    catInput.addEventListener('input', () => {
      model.category = catInput.value.trim();
      toCustomMode();
      syncCatChips();
    });

    const catUnlock = root.querySelector('#catUnlock');
    if (catUnlock) catUnlock.addEventListener('click', () => {
      catMode = 'custom';
      applyLocks();
      catInput.focus();
    });
    const iconUnlock = root.querySelector('#iconUnlock');
    if (iconUnlock) iconUnlock.addEventListener('click', () => {
      catMode = 'auto';
      model.icon = '';
      root.querySelectorAll('#iconPicker button').forEach(x => x.classList.remove('is-active'));
      applyLocks();
    });

    root.querySelector('#weekdays').addEventListener('click', (e) => {
      const b = e.target.closest('[data-day]');
      if (!b) return;
      b.classList.toggle('is-active');
      b.setAttribute('aria-pressed', b.classList.contains('is-active'));
      /* выбранные дни сразу попадают в «Пример» — иначе он показывает старые */
      model.days = selectedDays();
      setError('#errDays', '');
      syncPreview();
    });

    /* лимит пропусков: крупные кнопки «− / +» + ручной ввод числа */
    const missOut = root.querySelector('#missOut');
    const missHint = root.querySelector('#missHint');
    function applyMiss(v) {
      const next = Math.max(0, Math.min(31, parseInt(v, 10) || 0));
      missOut.value = next;
      missHint.textContent = missHintText(next);
      missOut.classList.remove('bump');
      void missOut.offsetWidth;
      missOut.classList.add('bump');
      return next;
    }
    root.querySelector('#missStepper').addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      const cur = parseInt(missOut.value, 10) || 0;
      const next = cur + Number(b.dataset.step);
      if (next < 0 || next > 31) {
        UI.toast(next > 31 ? 'Максимум — 31 пропуск' : '0 — лимит отключён');
        return;
      }
      applyMiss(next);
    });
    missOut.addEventListener('input', () => {
      const next = Math.max(0, Math.min(31, parseInt(missOut.value, 10) || 0));
      missHint.textContent = missHintText(next);
    });
    missOut.addEventListener('change', () => { applyMiss(missOut.value); });

    /* цель: крупные «− / +» и ручной ввод числа */
    const goalOut = root.querySelector('#goalOut');
    root.querySelector('#goalStepper').addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      const cur = parseInt(goalOut.value, 10) || 1;
      const next = cur + Number(b.dataset.step);
      if (next < 1 || next > 999) {
        UI.toast(next > 999 ? 'Максимум — 999' : 'Минимум — 1');
        return;
      }
      goalOut.value = next;
      goalOut.classList.remove('bump');
      void goalOut.offsetWidth;
      goalOut.classList.add('bump');
      syncPreview();
    });
    goalOut.addEventListener('change', () => {
      goalOut.value = Math.max(1, Math.min(999, parseInt(goalOut.value, 10) || 1));
      syncPreview();
    });

    /* «сколько раз» для режима «Несколько раз» */
    const timesOut = root.querySelector('#timesOut');
    if (timesOut) {
      root.querySelector('#timesStepper').addEventListener('click', (e) => {
        const b = e.target.closest('[data-step]');
        if (!b) return;
        const cur = parseInt(timesOut.value, 10) || 1;
        const next = cur + Number(b.dataset.step);
        if (next < 1 || next > 60) {
          UI.toast(next > 60 ? 'Максимум — 60 раз' : 'Минимум — 1 раз');
          return;
        }
        timesOut.value = next;
        timesOut.classList.remove('bump');
        void timesOut.offsetWidth;
        timesOut.classList.add('bump');
        setError('#errTimes', '');
        syncPreview();
      });
      timesOut.addEventListener('change', () => {
        timesOut.value = Math.max(1, Math.min(60, parseInt(timesOut.value, 10) || 1));
        setError('#errTimes', '');
        syncPreview();
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = F('name').value.trim();
      const frequency = FREQ();
      const days = selectedDays();

      setError('#errName', '');
      setError('#errDays', '');
      errEl.textContent = '';

      if (!name) {
        /* ошибка висит прямо под названием, а не под целью */
        setError('#errName', 'Введите название привычки');
        errEl.textContent = 'Введите название привычки';
        F('name').focus();
        return;
      }
      if (frequency === 'weekly' && !days.length) {
        setError('#errDays', 'Выберите хотя бы один день недели');
        errEl.textContent = 'Выберите хотя бы один день недели';
        return;
      }
      const times = Math.max(1, parseInt(F('times') ? F('times').value : 1, 10) || 1);
      if (frequency === 'times' && !(times >= 1)) {
        setError('#errTimes', 'Укажите, сколько раз');
        errEl.textContent = 'Укажите, сколько раз';
        return;
      }

      const category = Store.Categories.ensure(F('category').value.trim());
      const payload = {
        name,
        icon: model.icon,
        color: model.color,
        category,
        frequency,
        days,
        times,
        timesPeriod: (F('timesPeriod') && F('timesPeriod').value) || 'week',
        reminder: F('reminder').value || '',
        unit: F('unit').value,
        goal: Math.max(1, parseInt(F('goal').value, 10) || 1),
        missLimit: Math.max(0, Math.min(31, parseInt(F('missLimit').value, 10) || 0))
      };

      if (editing) {
        H.update(editing.id, payload);
        UI.toast('Привычка обновлена');
      } else {
        H.add(payload);
        UI.toast('Привычка создана ✓');
      }
      go('#/habits');
    });

    root.querySelector('.form-actions').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'cancel') {
        go(editing ? '#/habits' : '#/today');
      } else if (act === 'archive' && editing) {
        H.setArchived(editing.id, !editing.archived);
        UI.toast(editing.archived ? 'Привычка возвращена из архива' : 'Привычка отправлена в архив');
        go('#/habits');
      } else if (act === 'delete' && editing) {
        UI.confirm({
          title: 'Удалить привычку?',
          text: `«${esc(editing.name)}» и вся история выполнения будут удалены безвозвратно.`,
          okText: 'Удалить',
          danger: true
        }).then(ok => {
          if (!ok) return;
          H.remove(editing.id);
          UI.toast('Привычка удалена');
          go('#/habits');
        });
      }
    });

    /* первый расчёт: пример цели, подсказки дней и блокировка строк */
    syncPreview();
    syncCatChips();
    applyLocks();
  }

  /* =======================================================
     4. ЭКРАН «КАЛЕНДАРЬ / ИСТОРИЯ»
     ======================================================= */
  function calendar(root) {
    const now = new Date();
    const state = {
      month: new Date(now.getFullYear(), now.getMonth(), 1),
      selected: D.today()
    };
    const weekOrder = [1, 2, 3, 4, 5, 6, 0];

    function render() {
      const y = state.month.getFullYear();
      const m = state.month.getMonth();
      const first = new Date(y, m, 1);
      const offset = (first.getDay() + 6) % 7; // понедельник — первый
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const cells = [];

      for (let i = 0; i < offset; i++) cells.push(null);
      for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
      while (cells.length % 7 !== 0) cells.push(null);

      const grid = cells.map(date => {
        if (!date) return '<div class="cal-day is-empty"></div>';
        const ds = D.ymd(date);
        const st = S.dayStat(ds);
        const cls = ['cal-day'];
        if (ds === D.today()) cls.push('is-today');
        if (ds === state.selected) cls.push('is-selected');
        if (st.due > 0 && st.done === st.due) cls.push('is-full');
        if (ds > D.today()) cls.push('is-future');
        const label = `${st.done}/${st.due}`;
        return `<button type="button" class="${cls.join(' ')}" data-date="${ds}" title="${esc(UI.fmtShortDate(date))}: выполнено ${st.done} из ${st.due}">
                  <span class="d">${date.getDate()}</span>
                  ${st.due > 0 ? `<span class="c">${label}</span>` : '<span class="c">·</span>'}
                </button>`;
      }).join('');

      root.innerHTML = `
        <div class="page-head">
          <div>
            <p class="eyebrow">История</p>
            <h1>Календарь</h1>
            <p class="head-note">Месяц и карточка выбранного дня — правьте отметки прямо в истории.</p>
          </div>
        </div>

        <div class="calendar-layout">
          <section class="card calendar-card">
            <div class="cal-head">
              <div class="cal-title">${UI.MONTHS_NOM[m]} ${y}</div>
              <div class="cal-nav">
                <button class="icon-btn" type="button" data-nav="prev" aria-label="Предыдущий месяц">${UI.icon('chevron_left')}</button>
                <button class="btn btn-sm btn-ghost" type="button" data-nav="today">Сегодня</button>
                <button class="icon-btn" type="button" data-nav="next" aria-label="Следующий месяц">${UI.icon('chevron_right')}</button>
              </div>
            </div>
            <div class="cal-week">${weekOrder.map(d => `<span>${UI.WEEKDAYS_SHORT[d]}</span>`).join('')}</div>
            <div class="cal-grid">${grid}</div>
            <div class="chart-legend">
              <span><i style="background:var(--success-soft);border:1px solid var(--success)"></i>день выполнен полностью</span>
              <span><i style="background:var(--accent)"></i>выбранный день</span>
              <span>под числом — выполнено/по плану</span>
            </div>
          </section>

          <section class="card day-panel" id="dayPanel">${dayPanelHTML()}</section>
        </div>
      `;
    }

    /* тепловая карта переехала в статистику — см. heatBlockHTML() */

    function dayPanelHTML() {
      const ds = state.selected;
      const st = S.dayStat(ds);
      const date = D.parseYMD(ds);
      const isFuture = ds > D.today();

      const body = st.habits.length
        ? `<ul class="day-habits">${st.habits.map(h => rowHTML(h, ds, { disabled: isFuture, noSide: false })).join('')}</ul>`
        : (isFuture
            ? '<p class="muted" style="margin-top:12px">На этот день привычек по расписанию нет.</p>'
            : '<p class="muted" style="margin-top:12px">В этот день не было запланировано привычек.</p>');

      return `
        <h3>${esc(UI.fmtShortDate(date))}</h3>
        <p class="muted">${UI.WEEKDAYS_SHORT[date.getDay()]} · Выполнено ${st.done} из ${st.due}${isFuture ? ' · предстоящий день' : ' · можно изменить'}</p>
        ${body}`;
    }

    function rerender() {
      render();
    }

    render();

    delegate(root, 'click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        const mode = nav.dataset.nav;
        if (mode === 'prev') state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
        if (mode === 'next') state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
        if (mode === 'today') {
          const n = new Date();
          state.month = new Date(n.getFullYear(), n.getMonth(), 1);
          state.selected = D.today();
        }
        render();
        return;
      }

      const dayBtn = e.target.closest('.cal-day[data-date]');
      if (dayBtn) {
        state.selected = dayBtn.dataset.date;
        const parts = state.selected.split('-');
        state.month = new Date(+parts[0], +parts[1] - 1, 1);
        render();
        return;
      }

      const act = e.target.closest('[data-act]');
      const row = e.target.closest('.habit-row');
      if (!act || !row) return;
      const id = row.dataset.id;
      const ds = state.selected;
      if (act.dataset.act === 'toggle') {
        if (ds > D.today()) { UI.toast('Будущие дни отмечать нельзя', 'error'); return; }
        H.toggle(id, ds);
        rerender();
      } else if (act.dataset.act === 'plus' || act.dataset.act === 'minus') {
        if (ds > D.today()) return;
        const cur = H.countFor(ds, id);
        H.setCount(id, ds, act.dataset.act === 'plus' ? cur + 1 : cur - 1);
        rerender();
      }
    });
  }

  /* =======================================================
     5. ЭКРАН «СТАТИСТИКА»
     ======================================================= */
  const PERIODS = [
    { key: '7', label: '7 дней' },
    { key: '15', label: '15 дней' },
    { key: '30', label: '30 дней' },
    { key: 'all', label: 'Всё время' }
  ];
  const PERIOD_LABEL = { '7': 'за 7 дней', '15': 'за 15 дней', '30': 'за 30 дней', 'all': 'за всё время' };

  let statsPeriod = '30';
  /* вид блока графика: по дням / по неделям / по категориям */
  let statsChart = 'day';

  function stats(root) {
    function render() {
      const period = statsPeriod;
      /* режим «по неделям» убран — остаются дни и категории */
      const chart = statsChart === 'week' ? 'day' : statsChart;
      const current = S.overallStreak();
      const best = S.overallBest();
      const stat = S.periodStat(period);
      const days = Math.max(1, Math.round((D.parseYMD(stat.to) - D.parseYMD(stat.from)) / 86400000) + 1);
      const chartData = S.chartDaily(days);
      const bestDay = S.bestDay(period);
      const bestWeek = S.bestBucket(period, 'week');
      const bestMonth = S.bestBucket(period, 'month');
      const cats = S.categoryActivity(period).filter(c => c.due > 0);
      const ranking = S.rankingByPeriod(3, period);
      const quant = S.unitTotals(period);

      /* доля колонки под подписи — на длинных периодах подписи режем */
      const step = Math.max(1, Math.ceil(chartData.length / 8));
      /* четыре уровня заливки: макс / частично / минимум / пропуск (+ нет данных) */
      const bars = chartData.map((c, i) => {
        const h = Math.max(3, Math.round(c.ratio * 100));
        const showLabel = i % step === 0 || c.today;
        const cls = ['col'];
        if (!c.due) cls.push('is-none');
        else if (!c.done) cls.push('is-zero');
        else if (c.ratio >= 0.999) cls.push('lv-max');
        else if (c.ratio >= 0.34) cls.push('lv-part');
        else cls.push('lv-low');
        if (c.today) cls.push('today');
        const title = `${esc(UI.fmtShortDate(D.parseYMD(c.date)))}: ${c.done}/${c.due}`;
        return `<div class="${cls.join(' ')}" title="${title}">
                  <i style="height:${c.due ? h : 3}%"></i>
                  <span>${showLabel ? c.label : ''}</span>
                </div>`;
      }).join('');

      const periodTitle = period === 'all' ? `с ${UI.fmtShortDate(D.parseYMD(stat.from))}` : PERIOD_LABEL[period];

      /* заголовок блока зависит от выбранного вида */
      const chartTitle = chart === 'cat'
        ? `Активность по категориям ${periodTitle}`
        : `Активность по дням ${periodTitle}`;

      let chartBody = '';
      if (chart === 'cat') {
        chartBody = cats.length
          ? `<ul class="cat-activity">
              ${cats.map(c => `
                <li>
                  <div class="cat-activity-top">
                    <span class="cat-activity-name"><span class="cat-activity-ico">${UI.icon(catIcon(c.name))}</span>${esc(c.name)}</span>
                    <span class="muted">${c.done}/${c.due} · ${c.percent}%</span>
                  </div>
                  <div class="bar"><i style="width:${c.percent}%"></i></div>
                </li>`).join('')}
            </ul>`
          : '<p class="muted">За выбранный период нет данных по категориям.</p>';
      } else {
        chartBody = `
          <div class="chart">${bars}</div>
          <div class="chart-legend">
            <span><i class="leg-max"></i>выполнено полностью</span>
            <span><i class="leg-part"></i>частично</span>
            <span><i class="leg-low"></i>минимум</span>
            <span><i class="leg-zero"></i>пропуск</span>
            <span><i class="leg-none"></i>нет данных</span>
          </div>`;
      }

      /* количественные итоги */
      const quantHTML = quant.length ? `
        <section class="card chart-card">
          <h3 class="card-title">Итоги в понятных величинах</h3>
          <ul class="quant-list">
            ${quant.map(q => `<li>
              <span class="quant-name">${UI.icon(q.habits[0] ? q.habits[0].habit.icon : 'target')}${q.habits.map(x => esc(x.habit.name)).join(', ')}</span>
              <span class="quant-value">${q.total} ${esc(q.unit)}${UI.humanize(q.total, q.unit) ? ` <span class="muted">≈ ${esc(UI.humanize(q.total, q.unit))}</span>` : ''}</span>
            </li>`).join('')}
          </ul>
        </section>` : '';

      const empty = stat.due === 0;

      root.innerHTML = `
        <div class="page-head">
          <div>
            <p class="eyebrow">Аналитика</p>
            <h1>Статистика</h1>
          </div>
        </div>

        <div class="toolbar">
          <div class="segmented" id="periodSeg" role="tablist" aria-label="Период">
            ${PERIODS.map(p => `<button type="button" data-period="${p.key}" class="${p.key === period ? 'is-active' : ''}">${p.label}</button>`).join('')}
          </div>
        </div>

        ${empty
          ? `<div class="card chart-card"><p class="muted">Пока недостаточно данных для статистики.</p><p class="small muted">Отметьте привычки хотя бы за один день — и здесь появятся графики.</p></div>`
          : `
        <div class="stats-grid">
          <div class="card stat-card">
            <span class="stat-ico">${UI.icon('local_fire_department')}</span>
            <span class="label">Текущая серия</span>
            <span class="value">${current}</span>
            <span class="sub">${current > 0 ? progressText(current) + ' подряд' : 'серия не начата'}</span>
          </div>
          <div class="card stat-card">
            <span class="stat-ico">${UI.icon('emoji_events')}</span>
            <span class="label">Лучшая серия</span>
            <span class="value">${best}</span>
            <span class="sub">${best > 0 ? progressText(best) + ' — рекорд' : 'рекорда пока нет'}</span>
          </div>
          <div class="card stat-card">
            <span class="stat-ico">${UI.icon('done_all')}</span>
            <span class="label">Выполнение ${periodTitle}</span>
            <span class="value">${stat.percent}%</span>
            <span class="sub">${stat.done} из ${stat.due} отметок · безупречно ${stat.perfect} ${plural(stat.perfect, 'день', 'дня', 'дней')}</span>
          </div>
          <div class="card stat-card">
            <span class="stat-ico">${UI.icon('calendar_today')}</span>
            <span class="label">Активных дней</span>
            <span class="value">${stat.days}</span>
            <span class="sub">из ${days} ${plural(days, 'дня', 'дней', 'дней')} в периоде</span>
          </div>
        </div>

        <div class="stats-grid stats-grid--3">
          <div class="card stat-card">
            <span class="label">Лучший день</span>
            <span class="value value--sm">${bestDay ? esc(UI.fmtShortDate(D.parseYMD(bestDay.date))) : '—'}</span>
            <span class="sub">${bestDay ? `${bestDay.done} из ${bestDay.due} привычек` : 'нет данных'}</span>
          </div>
          <div class="card stat-card">
            <span class="label">Лучшая неделя</span>
            <span class="value value--sm">${bestWeek ? 'неделя с ' + esc(UI.fmtShortDate(D.parseYMD(bestWeek.key))) : '—'}</span>
            <span class="sub">${bestWeek ? `${bestWeek.percent}% · ${bestWeek.done} отметок` : 'нет данных'}</span>
          </div>
          <div class="card stat-card">
            <span class="label">Лучший месяц</span>
            <span class="value value--sm">${bestMonth ? esc(bestMonthName(bestMonth.key)) : '—'}</span>
            <span class="sub">${bestMonth ? `${bestMonth.percent}% · ${bestMonth.done} отметок` : 'нет данных'}</span>
          </div>
        </div>

        <section class="card chart-card">
          <div class="card-head">
            <h3 class="card-title">${chartTitle}</h3>
            <div class="segmented" id="chartSeg" role="tablist" aria-label="Вид графика">
              <button type="button" data-chart="day" class="${chart === 'day' ? 'is-active' : ''}">По дням</button>
              <button type="button" data-chart="cat" class="${chart === 'cat' ? 'is-active' : ''}">По категориям</button>
            </div>
          </div>
          ${chartBody}
        </section>

        <section class="card chart-card" id="heatCard">
          <div class="card-head">
            <h3 class="card-title">Сетка выполнения за 12 недель</h3>
            <span class="muted small">наведите курсор на ячейку — результат дня появится под сеткой</span>
          </div>
          ${heatBlockHTML()}
        </section>
        `}

        <section class="card chart-card">
          <div class="card-head">
            <h3 class="card-title">Успешные привычки</h3>
            <span class="chart-legend legend-inline"><span><i style="background:var(--teal)"></i>топ ${ranking.length}</span></span>
          </div>
          ${ranking.length
            ? `<ul class="rank-list">${ranking.map((r, i) => `
                <li class="rank-item">
                  <span class="pos">${i + 1}</span>
                  <span class="habit-icon" style="background:${tint(r.habit.color, .16)};color:${r.habit.color};width:38px;height:38px;flex-basis:38px">${UI.icon(r.habit.icon)}</span>
                  <div class="habit-main">
                    <div class="habit-name"><span class="name-text">${esc(r.habit.name)}</span></div>
                    <div class="habit-meta">
                      <span class="meta-streak${r.streak > 0 ? ' is-on' : ''}">${UI.icon('local_fire_department')}${r.streak > 0 ? progressText(r.streak) : 'серия не начата'}</span>
                      <span>${r.percent}% ${PERIOD_LABEL[period]}</span>
                      <span>${r.best > 0 ? `Лучшая серия — ${progressText(r.best)}` : 'Рекорда пока нет'}</span>
                    </div>
                  </div>
                </li>`).join('')}</ul>`
            : '<p class="muted small">Создайте привычки — и здесь появится рейтинг.</p>'}
        </section>

        ${quantHTML}
      `;

      root.querySelector('#periodSeg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-period]');
        if (!b) return;
        statsPeriod = b.dataset.period;
        render();
      });
      root.querySelector('#chartSeg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-chart]');
        if (!b) return;
        statsChart = b.dataset.chart;
        render();
      });

      /* подсказка под сеткой: при наведении на ячейку — дата и результат дня */
      const heatCard = root.querySelector('#heatCard');
      const readout = root.querySelector('#heatReadout');
      if (heatCard && readout) {
        const base = readout.textContent;
        heatCard.addEventListener('pointerover', (e) => {
          const cell = e.target.closest('.heat-cell[data-info]');
          if (!cell) return;
          readout.textContent = cell.dataset.info;
          readout.classList.add('is-active');
        });
        heatCard.addEventListener('pointerout', (e) => {
          /* ушли на другую ячейку — там своё сообщение; иначе возвращаем подсказку */
          const to = e.relatedTarget;
          if (to && to.closest && to.closest('.heat-cell[data-info]')) return;
          readout.textContent = base;
          readout.classList.remove('is-active');
        });
      }
    }

    render();
  }

  function bestMonthName(key) {
    const parts = String(key).split('-');
    const names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    return `${names[+parts[1] - 1] || ''} ${parts[0]}`;
  }

  /* =======================================================
     6. ЭКРАН «НАСТРОЙКИ»
     ======================================================= */
  function settings(root) {
    const st = Store.Settings.get();
    const user = Store.Auth.user();
    const theme = st.theme === 'dark' ? 'dark' : 'light';
    const notifSupported = ('Notification' in window);
    const notifState = !notifSupported ? 'unsupported' : Notification.permission;

    function notifText() {
      if (!notifSupported) return 'Браузер не поддерживает уведомления';
      if (Notification.permission === 'granted') return st.notifications ? 'Уведомления включены' : 'Уведомления выключены';
      if (Notification.permission === 'denied') return 'Уведомления заблокированы в настройках браузера';
      return 'Разрешение ещё не запрошено';
    }

    root.innerHTML = `
      <div class="page-head">
        <div>
          <p class="eyebrow">Профиль и приложение</p>
          <h1>Настройки</h1>
        </div>
      </div>

      <div class="settings">
        <section class="card settings-card">
          <h3>${UI.icon('person')}Профиль</h3>
          <div class="setting-row">
            <div class="setting-info">
              <b>Имя</b>
              <span>Отображается на экране «Сегодня»</span>
            </div>
            <div class="setting-control">
              <input class="input" id="nameInput" maxlength="40" value="${esc(st.name || '')}" placeholder="Ваше имя">
              <button class="btn btn-primary" type="button" id="saveName">Сохранить</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <b>Логин</b>
              <span>${esc(user ? user.email : '—')}</span>
            </div>
            <div class="setting-actions">
              <button class="btn btn-ghost" type="button" id="logout2">${UI.icon('logout')}Выйти</button>
              <button class="btn btn-danger" type="button" id="deleteProfile">${UI.icon('delete')}Удалить профиль</button>
            </div>
          </div>
          <p class="field-hint">Удаление профиля необратимо: аккаунт, привычки, история и настройки.</p>
        </section>

        <section class="card settings-card">
          <h3>${UI.icon('palette')}Внешний вид</h3>
          <div class="setting-row">
            <div class="setting-info">
              <b>Тема оформления</b>
              <span>Светлая или тёмная тема</span>
            </div>
            <div class="segmented" id="themeSeg">
              <button type="button" data-theme-val="light" class="${theme === 'light' ? 'is-active' : ''}">${UI.icon('light_mode')}Светлая</button>
              <button type="button" data-theme-val="dark" class="${theme === 'dark' ? 'is-active' : ''}">${UI.icon('dark_mode')}Тёмная</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <b>Категории привычек</b>
              <span>${Store.Categories.all().length} ${plural(Store.Categories.all().length, 'категория', 'категории', 'категорий')} · создание, переименование, удаление</span>
            </div>
            <a class="btn btn-ghost" href="#/categories">${UI.icon('tag')}Открыть</a>
          </div>
        </section>

        <section class="card settings-card">
          <h3>${UI.icon('notifications')}Уведомления</h3>
          <div class="setting-row">
            <div class="setting-info">
              <b>Напоминания о привычках</b>
              <span id="notifStatus">${esc(notifText())}</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="notifToggle" ${st.notifications && notifState === 'granted' ? 'checked' : ''}>
              <span class="track"></span>
            </label>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <b>Время напоминания</b>
              <span>Ежедневное напоминание открыть приложение</span>
            </div>
            <div class="setting-control">
              <input class="input input--time" type="time" id="remindAt" value="${esc(st.reminderTime || '20:00')}">
              <button class="btn btn-ghost btn-sm" type="button" id="saveRemind">Сохранить</button>
            </div>
          </div>
          <p class="field-hint">Push создаёт сам браузер — сервер приложения их не отправляет.</p>
        </section>

        <section class="card settings-card">
          <h3>${UI.icon('install_desktop')}Приложение</h3>
          <div class="setting-row" id="installRow">
            <div class="setting-info">
              <b>Установить «Ритм»</b>
              <span>На рабочий стол или в меню «Домой» — работает офлайн</span>
            </div>
            <button class="btn btn-primary" type="button" id="installBtn" disabled>Установить приложение</button>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <b>Режим работы</b>
              <span id="pwaStatus">${esc(pwaText())}</span>
            </div>
          </div>
        </section>

        <section class="card settings-card">
          <h3>${UI.icon('storage')}Данные</h3>
          <div class="setting-row">
            <div class="setting-info">
              <b>Экспорт данных</b>
              <span>Скачать привычки, категории и историю в JSON</span>
            </div>
            <button class="btn btn-ghost" type="button" id="exportBtn">${UI.icon('download')}Экспорт</button>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <b>Удаление данных</b>
              <span>Удалить все привычки и историю (аккаунт останется)</span>
            </div>
            <button class="btn btn-danger" type="button" id="wipeBtn">${UI.icon('delete')}Удалить данные</button>
          </div>
        </section>
      </div>
    `;

    function pwaText() {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return 'Приложение установлено и работает автономно';
      return 'Работает в браузере · офлайн доступен после первого открытия';
    }

    root.querySelector('#saveName').addEventListener('click', () => {
      const val = root.querySelector('#nameInput').value.trim();
      Store.Auth.updateProfile(val);
      UI.toast('Имя сохранено');
      app.refreshUserChip();
    });

    root.querySelector('#themeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme-val]');
      if (!b) return;
      Store.Settings.set({ theme: b.dataset.themeVal });
      UI.applyTheme(b.dataset.themeVal);
      root.querySelectorAll('#themeSeg button').forEach(x => x.classList.toggle('is-active', x === b));
      UI.toast('Тема изменена');
    });

    root.querySelector('#notifToggle').addEventListener('change', async (e) => {
      const want = e.target.checked;
      if (want) {
        if (!('Notification' in window)) {
          e.target.checked = false;
          UI.toast('Уведомления не поддерживаются', 'error');
          return;
        }
        let perm = Notification.permission;
        if (perm === 'default') perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          e.target.checked = false;
          Store.Settings.set({ notifications: false });
          root.querySelector('#notifStatus').textContent = notifText();
          UI.toast('Нет разрешения на уведомления', 'error');
          return;
        }
        Store.Settings.set({ notifications: true });
        UI.toast('Уведомления включены');
      } else {
        Store.Settings.set({ notifications: false });
        UI.toast('Уведомления выключены');
      }
      root.querySelector('#notifStatus').textContent = notifText();
    });

    root.querySelector('#saveRemind').addEventListener('click', () => {
      const v = root.querySelector('#remindAt').value || '20:00';
      Store.Settings.set({ reminderTime: v });
      UI.toast('Время напоминания сохранено');
      if (app.syncNotifications) app.syncNotifications();
    });

    const installBtn = root.querySelector('#installBtn');
    const deferred = app.deferredInstall || null;
    if (deferred) {
      installBtn.disabled = false;
      installBtn.addEventListener('click', () => app.promptInstall());
    } else if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      installBtn.disabled = true;
      installBtn.textContent = 'Уже установлено';
    } else {
      installBtn.addEventListener('click', () => {
        UI.toast('Установка доступна из меню браузера: «Установить приложение»');
      });
    }

    root.querySelector('#exportBtn').addEventListener('click', () => {
      const payload = Store.exportPayload();
      UI.download(`ritm-${D.today()}.json`, JSON.stringify(payload, null, 2));
      UI.toast('Файл экспортирован');
    });

    root.querySelector('#wipeBtn').addEventListener('click', () => {
      const n = Store.Habits.all().length;
      UI.confirm({
        title: 'Удалить все данные?',
        text: `${n ? `Все ${n} ${plural(n, 'привычка', 'привычки', 'привычек')}` : 'Все привычки'}, история выполнения и настройки будут удалены безвозвратно. Отменить это действие нельзя.`,
        okText: 'Удалить всё',
        danger: true
      }).then(ok => {
        if (!ok) return;
        Store.wipe();
        UI.toast('Данные удалены');
        app.rerender();
      });
    });

    root.querySelector('#logout2').addEventListener('click', () => app.signOut());

    root.querySelector('#deleteProfile').addEventListener('click', () => {
      const n = Store.Habits.all().length;
      UI.confirm({
        title: 'Удалить профиль?',
        text: `Аккаунт, ${n ? `все ${n} ${plural(n, 'привычка', 'привычки', 'привычек')} и` : 'все'} история выполнения, категории и настройки будут удалены безвозвратно. Восстановить данные после этого будет нельзя.`,
        okText: 'Удалить профиль',
        danger: true
      }).then(ok => { if (ok) app.deleteProfile(); });
    });
  }

  /* =======================================================
     7. ЭКРАН «КАТЕГОРИИ»
     ======================================================= */
  function categories(root) {
    function render() {
      const list = Store.Categories.all();
      const presets = Store.meta.PRESET_CATEGORIES;
      const bare = Store.Habits.all().filter(h => !h.category).length;

      root.innerHTML = `
        <div class="page-head">
          <div class="page-head__main">
            <p class="eyebrow">Управление</p>
            <div class="page-head__row">
              <h1>Категории</h1>
              <button class="btn btn-primary page-add" id="pageAddBtn" type="button"><span data-icon="add"></span>Привычка</button>
            </div>
            <p class="head-note">${list.length
              ? `${list.length} ${plural(list.length, 'категория', 'категории', 'категорий')} · помогают смотреть активность в статистике`
              : 'Группируйте привычки — так удобнее следить за активностью.'}</p>
          </div>
          <div class="cat-add">
            <input class="input" id="newCat" maxlength="40" placeholder="Например: Хобби" aria-label="Название новой категории">
            <button class="btn btn-soft" type="button" id="addCat">${UI.icon('add')}Добавить</button>
          </div>
        </div>

        ${list.length
          ? `${list.length >= 5 ? `<p class="cat-hint">${UI.icon('chevron_right')}Карточек больше, чем помещается — листайте галерею стрелками или прокруткой</p>` : ''}
            <div class="cat-gallery gal" data-gal>
              <button class="gal-btn" type="button" data-gal-btn="prev" aria-label="Предыдущие категории">${UI.icon('chevron_left')}</button>
              <ul class="cat-list" data-gal-scroller>
              ${list.map(c => {
                const n = Store.Categories.count(c);
                const active = Store.Categories.countActive(c);
                const isPreset = presets.indexOf(c) !== -1;
                return `<li class="cat-item" data-cat="${esc(c)}">
                  <div class="cat-head">
                    <span class="cat-badge">${UI.icon(catIcon(c))}</span>
                    <span class="cat-name">${esc(c)}</span>
                  </div>
                  <div class="cat-tags">
                    <span class="chip chip--ok">${UI.icon('check')}<b>${n}</b>&nbsp;${plural(n, 'привычка', 'привычки', 'привычек')}</span>
                    ${isPreset ? '<span class="chip chip--accent">стандартная</span>' : '<span class="chip chip--muted">своя</span>'}
                  </div>
                  <div class="cat-foot">
                    <span class="cat-count">активно <b>${active}</b></span>
                    <span class="cat-actions">
                      <button class="icon-btn" type="button" data-act="rename" title="Переименовать" aria-label="Переименовать категорию ${esc(c)}">${UI.icon('edit')}</button>
                      <button class="icon-btn" type="button" data-act="delete" title="Удалить" aria-label="Удалить категорию ${esc(c)}">${UI.icon('delete')}</button>
                    </span>
                  </div>
                </li>`;
              }).join('')}
              </ul>
              <button class="gal-btn" type="button" data-gal-btn="next" aria-label="Следующие категории">${UI.icon('chevron_right')}</button>
            </div>`
          : emptyState('tag', 'Категорий пока нет', 'Создайте первую категорию — она появится здесь.')}

        <div class="stats-grid stats-grid--3">
          <div class="card stat-card">
            <span class="stat-ico">${UI.icon('tag')}</span>
            <span class="label">Всего категорий</span>
            <span class="value">${list.length}</span>
            <span class="sub">${presets.filter(p => list.indexOf(p) !== -1).length} стандартных, остальные — ваши</span>
          </div>
          <div class="card stat-card">
            <span class="stat-ico">${UI.icon('inbox')}</span>
            <span class="label">Без категории</span>
            <span class="value">${bare}</span>
            <span class="sub">${bare ? 'отображаются как «Без категории»' : 'у всех привычек есть категория'}</span>
          </div>
          <div class="card stat-card">
            <span class="stat-ico">${UI.icon('checklist')}</span>
            <span class="label">Всего привычек</span>
            <span class="value">${Store.Habits.all().length}</span>
            <span class="sub">по всем категориям и архиву</span>
          </div>
        </div>
      `;
      attachGalleries(root);
    }

    render();

    function addCategory() {
      const field = root.querySelector('#newCat');
      if (!field) return;
      const v = field.value.trim();
      if (!v) { UI.toast('Введите название категории', 'error'); field.focus(); return; }
      if (!Store.Categories.add(v)) { UI.toast('Такая категория уже есть', 'error'); return; }
      UI.toast(`Категория «${v}» добавлена`);
      render();
      const again = root.querySelector('#newCat');
      if (again) again.focus();
    }

    /* кнопка и поле добавления живут на корне: переживают перерисовку.
       Только delegate — прямые слушатели на #view накапливались бы
       с каждым заходом на экран. */
    delegate(root, 'keydown', (e) => {
      if (e.target.id !== 'newCat') return;
      if (e.key === 'Enter') { e.preventDefault(); addCategory(); }
    });

    delegate(root, 'click', (e) => {
      if (e.target.closest('#addCat')) { addCategory(); return; }

      const btn = e.target.closest('[data-act]');
      const item = e.target.closest('.cat-item');
      if (!btn || !item) return;
      const name = item.dataset.cat;
      const affected = Store.Categories.count(name);

      if (btn.dataset.act === 'rename') {
        const next = window.prompt('Новое название категории:', name);
        if (next == null) return;
        const trimmed = next.trim();
        if (!trimmed || trimmed === name) return;
        if (!Store.Categories.rename(name, trimmed)) { UI.toast('Не удалось переименовать: имя занято', 'error'); return; }
        UI.toast(`Категория переименована в «${trimmed}»`);
        render();
      } else if (btn.dataset.act === 'delete') {
        UI.confirm({
          title: 'Удалить категорию?',
          text: `Категория «${esc(name)}» будет удалена.` +
            (affected ? ` ${affected} ${plural(affected, 'привычка', 'привычки', 'привычек')} получит статус «Без категории» — история сохранится.` : ''),
          okText: 'Удалить',
          danger: true
        }).then(ok => {
          if (!ok) return;
          Store.Categories.remove(name);
          UI.toast('Категория удалена');
          render();
        });
      }
    });
  }

  return {
    today,
    habits,
    habitForm,
    categories,
    calendar,
    stats,
    settings,
    _helpers: { tint, plural, progressText, rowHTML }
  };
})();
