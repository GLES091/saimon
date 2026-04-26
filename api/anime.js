// api/anime.js — скрапинг hianime.to через cheerio

const cheerio = require('cheerio');

const BASE = 'https://hianime.to';

// Общие заголовки, чтобы притворяться браузером
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
};

// Функция для получения HTML и создания cheerio-объекта
async function fetchHTML(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status} → ${url}`);
    const html = await res.text();
    return cheerio.load(html);
  } catch(e) {
    clearTimeout(t);
    throw e;
  }
}

// Нормализация карточки аниме (из разных мест)
function normalizeAnime(item) {
  return {
    id: item.id || '',
    title: item.title || 'Без названия',
    image: item.image || '',
    type: item.type || '',
    episodes: {
      sub: item.episodes?.sub || undefined,
      dub: item.episodes?.dub || undefined,
    },
  };
}

/* ────── ДОМАШНЯЯ СТРАНИЦА ────── */
async function getHome() {
  const $ = await fetchHTML(BASE + '/home');

  const latest = [];
  const trending = [];
  const spotlight = [];
  const topAiring = [];

  // Последние обновлённые эпизоды (блок .film_list-wrap .flw-item)
  $('.film_list-wrap .flw-item').each((i, el) => {
    if (latest.length >= 18) return;
    const id = $(el).find('.film-name a').attr('href')?.split('/').pop()?.split('?')[0] || '';
    const title = $(el).find('.film-name').text().trim();
    const image = $(el).find('.film-poster img').attr('data-src') || '';
    const type = $(el).find('.fdi-type').text().trim() || '';
    const sub = $(el).find('.tick-sub').length ? 'SUB' : undefined;
    const dub = $(el).find('.tick-dub').length ? 'DUB' : undefined;
    if (id) latest.push({ id, title, image, type, episodes: { sub, dub } });
  });

  // Тренды (возьмём из блока "Top 10" или секции trending)
  $('.trending-list .item').each((i, el) => {
    if (trending.length >= 12) return;
    const id = $(el).find('a').attr('href')?.split('/').pop()?.split('?')[0] || '';
    const title = $(el).find('.film-name').text().trim() || $(el).find('.number a').text().trim();
    const image = $(el).find('.film-poster img').attr('data-src') || '';
    const type = $(el).find('.fdi-type').text().trim() || '';
    if (id) trending.push({ id, title, image, type, episodes: {} });
  });

  // Популярное (для topAiring) – можно взять из раздела "Popular" или дублировать trending
  // Здесь оставим topAiring пустым или заполним тем же trending (для совместимости)
  topAiring.push(...trending.slice(0, 12));

  return { latest, trending, spotlight, topAiring };
}

/* ────── ПОИСК ────── */
async function searchAnime(query) {
  const $ = await fetchHTML(`${BASE}/search?keyword=${encodeURIComponent(query)}`);

  const results = [];
  $('.film_list-wrap .flw-item').each((i, el) => {
    if (results.length >= 20) return;
    const id = $(el).find('.film-name a').attr('href')?.split('/').pop()?.split('?')[0] || '';
    const title = $(el).find('.film-name').text().trim();
    const image = $(el).find('.film-poster img').attr('data-src') || '';
    const type = $(el).find('.fdi-type').text().trim() || '';
    if (id) results.push({ id, title, image, type, episodes: {} });
  });
  return results;
}

/* ────── ИНФОРМАЦИЯ ОБ АНИМЕ (ЭПИЗОДЫ) ────── */
async function getAnimeInfo(animeId) {
  const url = `${BASE}/watch/${animeId}`;
  const $ = await fetchHTML(url);

  const episodes = [];
  $('.episodes-list .ep-item a').each((i, el) => {
    const epNum = $(el).attr('data-ep') || i + 1;
    const epId = $(el).attr('href')?.split('/').pop()?.split('?')[0] || '';
    const title = $(el).attr('title') || `Episode ${epNum}`;
    episodes.push({
      id: epId,
      number: Number(epNum),
      title: title,
    });
  });

  // Если эпизодов нет, попробуем другой селектор
  if (!episodes.length) {
    $('.episode-item a, .ep-wrapper a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const epId = href.split('/').pop()?.split('?')[0];
      const epNum = $(el).text().trim().match(/\d+/)?.[0] || i + 1;
      if (epId) episodes.push({ id: epId, number: Number(epNum), title: `Episode ${epNum}` });
    });
  }

  // Сортируем по номеру
  episodes.sort((a, b) => a.number - b.number);

  return { episodes };
}

/* ────── ПОЛУЧЕНИЕ ССЫЛКИ НА ВИДЕО И СУБТИТРЫ ────── */
async function getStream(episodeId) {
  // episodeId – это полный путь, например "one-piece-100?ep=123456"
  const url = `${BASE}/watch/${episodeId}`;
  const $ = await fetchHTML(url);

  // Ищем iframe с плеером (обычно #main-player или .play-video iframe)
  const iframeSrc = $('#main-player iframe').attr('src') ||
                    $('#iframe-embed').attr('src') ||
                    $('iframe').first().attr('src');
  if (!iframeSrc) throw new Error('Не удалось найти плеер');

  // Загружаем страницу iframe
  const iframe$ = await fetchHTML(iframeSrc);
  
  // Ищем ссылку на m3u8 (встречается в <script> или в data-src)
  let m3u8Link = '';
  const scripts = iframe$('script').map((i, el) => iframe$(el).html()).get();
  for (const scr of scripts) {
    const match = scr.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
    if (match) {
      m3u8Link = match[1];
      break;
    }
  }
  if (!m3u8Link) {
    // Альтернативный поиск в data-src
    m3u8Link = iframe$('video source').attr('src') ||
               iframe$('[data-src]').attr('data-src') || '';
  }
  if (!m3u8Link) throw new Error('Ссылка на видео не найдена');

  // Субтитры (обычно .tracks или в JSON)
  const subtitles = [];
  iframe$('track').each((i, el) => {
    const file = iframe$(el).attr('src');
    const label = iframe$(el).attr('label') || 'Sub';
    if (file) subtitles.push({ file, label });
  });

  if (!subtitles.length) {
    // Попробуем вытащить из скрипта tracks
    for (const scr of scripts) {
      const match = scr.match(/tracks\s*:\s*(\[[^\]]*\])/);
      if (match) {
        try {
          const tracks = JSON.parse(match[1]);
          tracks.forEach(t => subtitles.push({ file: t.file, label: t.label || t.lang || 'Sub' }));
          break;
        } catch {}
      }
    }
  }

  return {
    streamUrl: m3u8Link,
    subtitles,
  };
}

/* ────── ОБРАБОТЧИК ЗАПРОСОВ ────── */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, query } = req.query;
  console.log(`[SCRAPE] action=${action} query=${query}`);

  try {
    if (action === 'home') {
      const data = await getHome();
      return res.json(data);
    }

    if (action === 'search') {
      const results = await searchAnime(query);
      return res.json({ results: results.map(normalizeAnime) });
    }

    if (action === 'info') {
      const info = await getAnimeInfo(query);
      return res.json(info);
    }

    if (action === 'watch') {
      const { streamUrl, subtitles } = await getStream(query);
      return res.json({
        sources: [{ file: streamUrl, quality: 'auto', type: 'hls' }],
        subtitles,
      });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error('[SCRAPE]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
