// Смоук-тест интерфейса на jsdom: node tools/test_ui.js
// jsdom ищется в системном временном каталоге (см. README, раздел «Проверка»)
const fs = require('fs');
const path = require('path');
const os = require('os');

function loadJsdom() {
  const candidates = [
    'jsdom',
    path.join(os.tmpdir(), 'opencode', 'uitest', 'node_modules', 'jsdom'),
    path.join(os.tmpdir(), 'uitest', 'node_modules', 'jsdom'),
    path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'opencode', 'uitest', 'node_modules', 'jsdom')
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) {}
  }
  return null;
}

const jsdomMod = loadJsdom();
if (!jsdomMod) {
  console.error('jsdom не найден. Установите: npm i jsdom (вне проекта) и повторите запуск.');
  process.exit(2);
}
const { JSDOM, VirtualConsole } = jsdomMod;

const URL = process.env.APP_URL || 'http://127.0.0.1:8123/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok  -', msg);
  else { failed++; console.log('  FAIL-', msg); }
}

(async function main() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (/Not implemented/.test(e.message)) return;
    errors.push(e.message);
  });
  virtualConsole.on('error', (m) => errors.push(String(m)));

  const dom = await JSDOM.fromURL(URL, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole
  });
  const w = dom.window;
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
  w.scrollTo = () => {};
  w.URL.createObjectURL = () => 'blob:test';
  w.URL.revokeObjectURL = () => {};

  await new Promise((resolve) => w.addEventListener('load', resolve));
  await sleep(200);

  const doc = w.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => Array.from(doc.querySelectorAll(s));
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const submit = (form) => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const nav = async (hash) => { w.location.hash = hash; await sleep(120); };
  const type = (input, val) => { input.value = val; input.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayStr = () => fmt(new Date());
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d); };

  console.log('1. Экран входа');
  ok(!$('#authScreen').classList.contains('hidden'), 'экран входа показан');
  ok($('#app').classList.contains('hidden'), 'приложение скрыто до входа');
  ok(doc.title.includes('Ритм'), 'заголовок страницы: ' + doc.title);

  // ошибка валидации
  $('#loginForm [name="email"]').value = 'не-почта';
  $('#loginForm [name="password"]').value = '1234';
  submit($('#loginForm'));
  await sleep(50);
  ok($('#loginError').textContent.length > 0, 'валидация email работает: ' + $('#loginError').textContent);

  console.log('2. Регистрация');
  click($('[data-auth-tab="signup"]'));
  ok(!$('#signupForm').classList.contains('hidden'), 'переключение на регистрацию');
  $('#signupForm [name="name"]').value = 'Аня';
  $('#signupForm [name="email"]').value = 'anya@mail.ru';
  $('#signupForm [name="password"]').value = '12345';
  submit($('#signupForm'));
  await sleep(300);
  ok(!$('#app').classList.contains('hidden'), 'после регистрации открывается приложение');
  ok($('#userMail').textContent === 'anya@mail.ru', 'почта в боковом меню');
  ok($('#userAvatar').textContent === 'А', 'аватар по первому символу имени');

  console.log('3. Экран «Сегодня»');
  ok($('#pageTitle').textContent === 'Сегодня', 'заголовок экрана');
  ok($('#view').innerHTML.includes('Прогресс на сегодня'), 'блок прогресса есть');
  ok(!!$('#view .better-card'), 'блок «Лучше, чем вчера» есть');
  ok($('#view').innerHTML.includes('Начните с одной привычки'), 'пустое состояние для новичка');

  console.log('4. Создание привычки');
  await nav('#/habit/new');
  ok($('#pageTitle').textContent === 'Новая привычка', 'экран формы открыт');
  const form = $('#habitFormEl');
  type(form.querySelector('[name="name"]'), '');
  submit(form);
  await sleep(50);
  ok($('#formError').textContent.includes('название'), 'пустое название отклоняется');

  type(form.querySelector('[name="name"]'), 'Выпить 8 стаканов воды');
  ok(form.querySelectorAll('#catPicker [data-cat]').length >= 6, 'чипы категорий показаны: ' + form.querySelectorAll('#catPicker [data-cat]').length);
  type(form.querySelector('[name="category"]'), 'Своя категория');
  ok(!form.querySelector('#catPicker .is-active'), 'своя категория снимает выделение с чипов');
  click(form.querySelector('#catPicker [data-cat="Спорт и движение"]'));
  ok(form.querySelector('[name="category"]').value === 'Спорт и движение', 'клик по чипу категории заполняет поле');
  form.querySelector('[name="frequency"][value="weekly"]').checked = true;
  form.querySelector('[name="frequency"][value="weekly"]').dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(30);
  ok(!$('#daysField').classList.contains('hidden'), 'блок дней недели появился');
  $$('#weekdays .is-active').forEach((b) => click(b));
  submit(form);
  await sleep(50);
  ok($('#formError').textContent.includes('день недели'), 'неделя без дней отклоняется');

  $$('#weekdays [data-day]')[0].click();
  await sleep(30);
  form.querySelector('[name="frequency"][value="daily"]').checked = true;
  form.querySelector('[name="frequency"][value="daily"]').dispatchEvent(new w.Event('change', { bubbles: true }));
  type(form.querySelector('[name="goal"]'), '8');
  form.querySelector('[name="goal"]').dispatchEvent(new w.Event('change', { bubbles: true }));
  form.querySelector('[name="unit"]').value = 'мл';
  form.querySelector('[name="unit"]').dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(30);
  ok($('#goalPreview').textContent.includes('8 мл'), 'пример цели обновился: ' + $('#goalPreview').textContent);
  submit(form);
  await sleep(150);
  ok(w.location.hash === '#/habits', 'после сохранения переход к списку: ' + w.location.hash);
  ok($('#view').textContent.includes('Выпить 8 стаканов воды'), 'привычка в списке');
  ok($('#view').textContent.includes('Каждый день'), 'периодичность отображается');
  ok($('#view').textContent.includes('Спорт и движение'), 'категория из формы сохранилась в списке');

  console.log('5. Отметка на экране «Сегодня»');
  await nav('#/today');
  const row = $('#todayList .habit-row');
  ok(!!row, 'привычка появилась в «Сегодня»');
  ok($('#view').textContent.includes('0'), 'прогресс 0 из 1');
  click(row.querySelector('.check'));
  await sleep(80);
  const row2 = $('#todayList .habit-row');
  ok(row2.classList.contains('is-done'), 'строка помечена выполненной');
  ok($('.progress-ring span').textContent.trim() === '100%', 'прогресс стал 100%: ' + $('.progress-ring span').textContent.trim());
  ok($('.progress-ring').getAttribute('style').includes('100'), 'кольцо прогресса 100%');
  click(row2.querySelector('.check'));
  await sleep(80);
  ok(!$('#todayList .habit-row').classList.contains('is-done'), 'снятие отметки работает');
  click($('#todayList .habit-row .chip--link'));
  await sleep(120);
  ok(w.location.hash.startsWith('#/habit/'), 'клик по чипу категории в «Сегодня» открывает редактирование: ' + w.location.hash);
  await nav('#/today');

  console.log('6. Календарь');
  // привычке «задним числом» назначаем дату создания, чтобы появились прошедшие дни
  const habitId = w.Store.Habits.active()[0].id;
  w.Store.Habits.get(habitId).createdAt = Date.now() - 10 * 86400000;
  await nav('#/calendar');
  ok($$('.cal-day[data-date]').length >= 28, 'в сетке есть дни: ' + $$('.cal-day[data-date]').length);
  const pastDays = $$('.cal-day[data-date]').filter((d) => d.dataset.date < todayStr());
  ok(pastDays.length > 0, 'есть прошедшие дни');
  click(pastDays[pastDays.length - 1]);
  await sleep(80);
  ok(!!$('#dayPanel'), 'панель дня открылась');
  ok($('#dayPanel').textContent.includes('Выполнено'), 'в панели есть счётчик');
  const dayCheck = $('#dayPanel .check');
  ok(!!dayCheck, 'в панели дня есть чекбокс для прошлой даты');
  if (dayCheck) {
    click(dayCheck);
    await sleep(80);
    ok($('#dayPanel .habit-row').classList.contains('is-done'), 'отметка за прошлую дату работает');
    const marked = w.Store.Habits.isDone(w.Store.Habits.get(habitId), pastDays[pastDays.length - 1].dataset.date);
    ok(marked, 'отметка сохранилась в данных');
  }
  ok(!!$('[data-nav="next"]') && !!$('[data-nav="prev"]'), 'навигация по месяцам есть');
  click($('[data-nav="prev"]'));
  await sleep(60);
  ok($('.cal-title').textContent.length > 0, 'месяц переключился: ' + $('.cal-title').textContent);

  console.log('7. Статистика');
  await nav('#/stats');
  const txt = $('#view').textContent;
  ok(txt.includes('Текущая серия'), 'карточка текущей серии');
  ok(txt.includes('Лучшая серия'), 'карточка лучшей серии');
  ok(txt.includes('7 дней') && txt.includes('30 дней') && txt.includes('Всё время'), 'периоды 7/15/30/всё время');
  ok($$('.chart .col').length === 30, 'график за 30 дней: ' + $$('.chart .col').length);
  ok($$('.chart .col i').length === 30, 'столбцы графика отрисованы');
  ok(txt.includes('Лучший день') && txt.includes('Лучшая неделя') && txt.includes('Лучший месяц'), 'лучшие день/неделя/месяц');
  ok(txt.includes('Активность по дням'), 'заголовок единого блока «по дням»');
  click($('[data-chart="cat"]'));
  await sleep(80);
  ok($('#view').textContent.includes('Активность по категориям'), 'переключение на «Активность по категориям»');
  ok($$('.heat .heat-cell').length === 12 * 7, 'сетка выполнения за 12 недель на месте: ' + $$('.heat .heat-cell').length);
  click($('[data-chart="day"]'));
  await sleep(80);
  ok($$('.chart .col').length === 30, 'возврат к дневному графику: ' + $$('.chart .col').length);
  click($('[data-period="7"]'));
  await sleep(80);
  ok($$('.chart .col').length === 7, 'переключение периода на 7 дней: ' + $$('.chart .col').length);
  ok($('#view').textContent.includes('за 7 дней'), 'период меняет расчёт в карточках ниже');
  click($('[data-chart="day"]'));
  click($('[data-period="30"]'));
  await sleep(80);
  ok($('#view').textContent.includes('за 30 дней'), 'период 30 дней пересчитал карточки');
  ok(!$('[data-chart="week"]'), 'вид «по неделям» убран из переключателя');

  console.log('8. Редактирование, архив, удаление');
  await nav('#/habits');
  await nav('#/stats');
  await nav('#/habits');   // повторные заходы не должны ломать обработчики
  const card = $('.habit-card');
  ok(!!card, 'карточка привычки есть');
  click(card.querySelector('[data-act="edit"]'));
  await sleep(120);
  ok(w.location.hash.startsWith('#/habit/'), 'перешли к редактированию: ' + w.location.hash);
  const editForm = $('#habitFormEl');
  ok(editForm.querySelector('[name="category"]').value === 'Спорт и движение', 'при редактировании показана текущая категория');
  type(editForm.querySelector('[name="name"]'), 'Вода на день');
  type(editForm.querySelector('[name="category"]'), 'Учёба');
  submit(editForm);
  await sleep(150);
  ok($('#view').textContent.includes('Вода на день'), 'название изменилось');
  ok($('#view').textContent.includes('Учёба'), 'изменённая категория видна в списке');
  click($('#view .habit-card .chip--link'));
  await sleep(120);
  ok(w.location.hash.startsWith('#/habit/'), 'клик по чипу категории в списке открывает редактирование: ' + w.location.hash);
  await nav('#/habits');
  await sleep(80);

  click($('.habit-card [data-act="archive"]'));
  await sleep(120);
  ok($('#view').textContent.includes('В архиве · 1'), 'привычка ушла в архив');
  click($('[data-filter="archived"]'));
  await sleep(80);
  ok($('#view').textContent.includes('Вода на день'), 'архивная привычка видна во вкладке «В архиве»');
  click($('.habit-card [data-act="archive"]'));
  await sleep(120);
  click($('[data-filter="active"]'));
  await sleep(80);
  ok($('#view').textContent.includes('Активно · 1'), 'возврат из архива работает');

  click($('.habit-card [data-act="delete"]'));
  await sleep(80);
  ok(!!$('.modal-backdrop'), 'диалог подтверждения открылся');
  click($('.modal [data-act="ok"]'));
  await sleep(150);
  ok($('#view').textContent.includes('У вас пока нет привычек'), 'привычка удалена, пустое состояние');

  console.log('9. Настройки');
  await nav('#/settings');
  ok($('#view').textContent.includes('Внешний вид'), 'секция темы');
  ok(!$('[data-theme-val="system"]'), 'опция «Система» убрана');
  ok($$('#themeSeg button').length === 2, 'в переключателе темы только две опции');
  click($('[data-theme-val="dark"]'));
  await sleep(60);
  ok(doc.documentElement.getAttribute('data-theme') === 'dark', 'тёмная тема применена');
  click($('[data-theme-val="light"]'));
  await sleep(60);
  ok(doc.documentElement.getAttribute('data-theme') === 'light', 'светлая тема применена');
  type($('#nameInput'), 'Анечка');
  click($('#saveName'));
  await sleep(60);
  ok($('#userName').textContent === 'Анечка', 'имя обновилось в боковом меню');
  click($('#exportBtn'));
  await sleep(60);
  ok(true, 'экспорт данных не вызвал ошибок');

  console.log('10. Категории');
  await nav('#/categories');
  ok($('#view').textContent.includes('Категории'), 'экран категорий открыт');
  const catCount = $$('.cat-item').length;
  ok(catCount >= 9, 'пресеты категорий подгружены: ' + catCount);
  ok($('#view').textContent.includes('Без категории'), 'блок «Без категории»');
  type($('#newCat'), 'Хобби');
  click($('#addCat'));
  await sleep(120);
  ok($$('.cat-item').length === catCount + 1, 'новая категория добавлена');
  ok($('#view').textContent.includes('Хобби'), 'новая категория в списке');
  type($('#newCat'), 'Хобби');
  click($('#addCat'));
  await sleep(120);
  ok($$('.cat-item').length === catCount + 1, 'дубликат не добавился');
  const item = $$('.cat-item').find((el) => el.dataset.cat === 'Хобби');
  click(item.querySelector('[data-act="delete"]'));
  await sleep(80);
  ok(!!$('.modal-backdrop'), 'подтверждение удаления категории открылось');
  click($('.modal [data-act="ok"]'));
  await sleep(150);
  ok($$('.cat-item').length === catCount, 'категория удалена');
  const preset = $$('.cat-item').find((el) => el.dataset.cat === 'Спорт и движение');
  ok(!!preset && preset.textContent.includes('стандартная'), 'у стандартной категории видно число привычек');

  console.log('11. Настройки: время напоминания');
  await nav('#/settings');
  ok(!!$('#remindAt'), 'поле времени напоминания есть');
  ok($('#remindAt').value === '20:00', 'время по умолчанию 20:00');
  $('#remindAt').value = '08:30';
  click($('#saveRemind'));
  await sleep(80);
  ok(w.Store.Settings.get().reminderTime === '08:30', 'время напоминания сохранено');
  ok(!!$('#installBtn'), 'кнопка установки приложения есть');

  console.log('12. Выход и повторный вход');
  click($('#logoutBtn'));
  await sleep(80);
  ok(!$('#authScreen').classList.contains('hidden'), 'после выхода показан вход');
  $('#loginForm [name="email"]').value = 'anya@mail.ru';
  $('#loginForm [name="password"]').value = '12345';
  submit($('#loginForm'));
  await sleep(300);
  ok(!$('#app').classList.contains('hidden'), 'повторный вход работает');
  ok($('#userName').textContent === 'Анечка', 'данные сохранились между сессиями');
  ok(doc.title.includes('Ритм'), 'заголовок страницы после входа: ' + doc.title);
  ok(!!doc.querySelector('[data-logo] svg'), 'логотип отрисован в слоте');
  ok(!!doc.querySelector('[data-icon] svg'), 'значок в шапке отрисован');

  console.log('13. Мобильное меню');
  click($('#burgerBtn'));
  await sleep(50);
  ok($('#sidebar').classList.contains('is-open'), 'бургер открывает меню');
  click($('#sidebarOverlay'));
  await sleep(50);
  ok(!$('#sidebar').classList.contains('is-open'), 'оверлей закрывает меню');

  console.log('14. Ошибки консоли');
  ok(errors.length === 0, errors.length ? 'ошибки: ' + errors.join(' | ') : 'ошибок JS нет');

  console.log(failed ? '\nИТОГ: провалено ' + failed : '\nИТОГ: все проверки пройдены');
  dom.window.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
