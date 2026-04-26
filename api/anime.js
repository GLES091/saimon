// api/anime.js
import * as cheerio from 'cheerio';

/**
 * Безопасный fetch с таймаутом 8 секунд
 */
async function safeFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://animevost.org/',
        ...options.headers,
      },
    });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Универсальный ответ API
 */
function json(res, data, status = 200) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.status(status).json(data);
}

/**
 * Поиск аниме
 */
async function search(query) {
  const url = `https://animevost.org/search/?do=search&subaction=search&story=${encodeURIComponent(query)}`;
  const html = await safeFetch(url).then(r => r.text());
  const $ = cheerio.load(html);

  const results = [];
  $('.searchitem').each((i, el) => {
    const $el = $(el);
    const title = $el.find('h2').text().trim();
    const link = $el.find('h2 a').attr('href') || '';
    const img = $el.find('.searchitem__img img').attr('src') || '';
    const desc = $el.find('.searchitem__text').text().trim();
    if (title && link) {
      results.push({
        id: link, // используется полный URL как идентификатор
        title,
        image: img.startsWith('http') ? img : `https://animevost.org${img}`,
        description: desc,
      });
    }
  });
  return results;
}

/**
 * Получить список серий аниме
 */
async function getEpisodes(animeUrl) {
  const html = await safeFetch(animeUrl).then(r => r.text());
  const $ = cheerio.load(html);

  const episodes = [];
  // Структура: ul.bx > li > a (ссылка на серию) и span (номер)
  $('.bx li').each((i, el) => {
    const $a = $(el).find('a');
    const epNumber = $(el).find('span').text().trim() || `Серия ${i + 1}`;
    const epUrl = $a.attr('href') || '';
    if (epUrl) {
      episodes.push({
        id: epUrl, // ссылка на страницу серии
        number: epNumber,
      });
    }
  });
  return episodes;
}

/**
 * Получить прямую ссылку на видео
 */
async function getVideo(episodeUrl) {
  const html = await safeFetch(episodeUrl).then(r => r.text());
  const $ = cheerio.load(html);

  // Ищем плеер: обычно это скрипт с var player = ... или data-config
  // Вариант 1: плеер на базе js с параметрами
  let videoUrl = '';
  const scriptContent = $('script').text();
  const fileMatch = scriptContent.match(/['"]?(https?:\/\/[^'"]+\.(?:mp4|m3u8))['"]?/);
  if (fileMatch) {
    videoUrl = fileMatch[1];
  } else {
    // Вариант 2: iframe с плеером
    const iframe = $('iframe[src*="player"]').attr('src') || $('iframe').attr('src');
    if (iframe) {
      // Иногда видео лежит внутри iframe, можно вернуть ссылку на него для клиента
      videoUrl = iframe;
    } else {
      // Вариант 3: data-config атрибут
      const config = $('[data-config]').attr('data-config');
      if (config) {
        try {
          const parsed = JSON.parse(decodeURIComponent(config));
          videoUrl = parsed.file || '';
        } catch {}
      }
    }
  }

  if (!videoUrl) throw new Error('Не удалось извлечь ссылку на видео');
  return videoUrl;
}

export default async function handler(req, res) {
  // CORS уже выставлен в json()
  const { action, query } = req.query;

  try {
    if (action === 'search' && query) {
      const results = await search(query);
      return json(res, { results });
    }

    if (action === 'info' && query) {
      // query здесь – это URL аниме (передаётся клиентом после клика)
      const episodes = await getEpisodes(query);
      return json(res, { episodes });
    }

    if (action === 'watch' && query) {
      const videoUrl = await getVideo(query);
      return json(res, {
        sources: [{ file: videoUrl, quality: 'auto', type: videoUrl.includes('.m3u8') ? 'hls' : 'mp4' }],
      });
    }

    return json(res, { error: 'Неверные параметры' }, 400);
  } catch (error) {
    console.error('API error:', error);
    return json(res, { error: 'Ошибка получения данных', details: error.message }, 500);
  }
}
