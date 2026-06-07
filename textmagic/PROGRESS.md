# Pearl — project status / handoff

> Открыл новый чат? Скажи: «прочитай textmagic/PROGRESS.md» — и продолжаем с контекстом.

## Что это
**Pearl** — браузерное расширение (Chrome/Arc, Manifest V3): в любом текстовом поле
появляется стеклянный кружок-«жемчужина», по клику открывается панель для
редактуры / перевода / генерации текста через **Claude API** (Anthropic).

Автор: Лиза Чуйко (Lizachuiko, vanpelz8@gmail.com).

## Где файлы
- Рабочая копия (правим тут): `/Users/liza/Documents/liza coder shmoder /textmagic/`
- Git-репо: папка `portfolio/` → remote `github.com/Lizachuiko/Lizachuiko.github.io`, ветка `main`
- Перед каждым пушем синхронизируем копию:
  `rsync -a --delete --exclude '.DS_Store' --exclude '.claude/' "<…>/textmagic/" "<…>/portfolio/textmagic/"`
- Live демо: https://lizachuiko.github.io/textmagic/

### Файлы расширения
- `manifest.json` — MV3, иконки PNG (`icons/icon16|48|128.png`), имя «Pearl — AI in every input»
- `content.js` — кружок (позиция в конце текста, mirror-техника), панель, инжект SVG-фильтра преломления + Nunito Sans, итеративные генерации + откат
- `content.css` — стили панели (Liquid Glass), кнопки, флаги, кружок
- `background.js` — service worker, запрос в Anthropic `v1/messages`, модель `claude-sonnet-4-6`
- `popup.html` / `popup.js` — настройки: ключ Anthropic (`sk-ant-…`) + стиль письма → `chrome.storage.sync`
- `demo.html` / `index.html` — кликабельное превью UI (index = копия demo, для localhost и Pages)
- `icons/pearl.svg` — исходник иконки (рендер: `qlmanage -t -s 512 -o . pearl.svg` → `sips -z N N`)

## Что готово
- Жемчужный кружок с реальным преломлением (SVG `feDisplacementMap` + хром. аберрация), полупрозрачный нейтральный край (виден на любом фоне)
- Кружок стоит в конце текста, открывается кликом или долгим зажатием Shift
- Панель: 2 вкладки **Edit** (Format & edit / Fix grammar / Translate / Formal / Rewrite / Structure) и **Generate** (предзаполняется текстом поля); перетаскивается; встаёт под последней строкой текста
- **Translate** → флаги 🇪🇸🇫🇷🇩🇪🇷🇺 + «⋯» (полный список языков)
- Итеративное редактирование: повторный клик правит уже полученный результат; кнопка ↶ откат к прошлой генерации
- Поля авто-растут до 10 строк, дальше скролл + ручной ресайз
- Дизайн: Liquid Glass (матовое стекло, iOS-края), шрифт Nunito Sans, градиент `#f0eaee → #e8dee1`
- Бэкенд на Claude API; «стиль письма» из настроек реально применяется

## Как запускать
- **Превью UI:** preview-сервер на :4599 (`.claude/launch.json`, имя `tecs-demo`, отдаёт папку `textmagic`) → открыть `http://localhost:4599/demo.html`. После правок CSS бампать `?v=N` в ссылке на `content.css` в `demo.html`.
- **Расширение:** `arc://extensions` (или `chrome://extensions`) → Developer mode → Load unpacked → папка `textmagic`. После изменений — **↻ Reload** на карточке.
- **Ключ:** только в попапе расширения (поле Anthropic API Key), НИКОГДА не в чат/код.

## TODO / дальше
- Окно истории генераций (кнопка ⤢ уже есть → открывает `history.html`, которого пока нет; хранить в `chrome.storage.local`)
- v2: голосовой ввод (диктовка), хоткеи, шаблоны промптов
- Возможный порт в десктоп-приложение (как Wispr), переиспользуя логику
- При желании — упаковать Nunito Sans в расширение (`.woff2`), чтобы не зависеть от Google Fonts на сайтах со строгим CSP

## ⚠️ Безопасность
API-ключи вставляются ТОЛЬКО в настройки расширения. Любой ключ, попавший в чат,
считается скомпрометированным — отозвать на console.anthropic.com и создать новый.
