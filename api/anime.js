// api/anime.js
import * as cheerio from 'cheerio';

// Основной домен источника
const BASE = 'https://animego.org';

/**
 * Безопасный fetch с таймаутом 8 секунд и "живыми" заголовками
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
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
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
 * Вспомогательная функция для отправки JSON-ответов с поддержкой CORS
 */
function jsonResponse(res, data, status = 200) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.status(status).json(data);
}

export default async function handler(req, res) {
  const { action, query } = req.query;

  try {
    // === ПОИСК АНИМЕ ===
    if (action === 'search' && query) {
      const searchUrl = `${BASE}/search/all?q=${encodeURIComponent(query)}`;
      const html = await safeFetch(searchUrl).then(r => r.text());
      const $ = cheerio.load(html);

      const results = [];
      // Парсим карточки аниме из сетки поиска
      $('.anime-list-item').each((i, el) => {
        const $el = $(el);
        const title = $el.find('.anime-list-item__title').text().trim();
        const link = $el.find('a').attr('href') || '';
        const img = $el.find('img').attr('src') || '';
        
        if (title && link) {
          results.push({
            id: link, // Относительная ссылка, например, "/anime/123-nazvanie"
            title,
            image: img.startsWith('http') ? img : `${BASE}${img}`,
          });
        }
      });
      return jsonResponse(res, { results });
    }

    // === ПОЛУЧЕНИЕ СПИСКА СЕРИЙ ===
    if (action === 'info' && query) {
      // query здесь — это URL страницы аниме (например, "/anime/123-nazvanie")
      const animeUrl = `${BASE}${query}`;
      const html = await safeFetch(animeUrl).then(r => r.text());
      const $ = cheerio.load(html);
      
      const episodes = [];
      // Ищем кнопки серий в элементе навигации
      $('.episode-navigation a').each((i, el) => {
        const $el = $(el);
        const epNumber = $el.text().trim();
        const epLink = $el.attr('href') || '';
        
        if (epNumber && epLink) {
          episodes.push({
            id: epLink, // Относительная ссылка на серию
            number: epNumber,
          });
        }
      });
      
      // Если структура другая, пробуем альтернативный вариант
      if (episodes.length === 0) {
        $('.video-player__episode-list a').each((i, el) => {
          const $el = $(el);
          const epNumber = $el.text().trim();
          const epLink = $el.attr('href') || '';
          if (epNumber && epLink) {
            episodes.push({
              id: epLink,
              number: epNumber,
            });
          }
        });
      }
      
      return jsonResponse(res, { episodes });
    }

    // === ПОЛУЧЕНИЕ ССЫЛКИ НА ВИДЕО ===
    if (action === 'watch' && query) {
      // query здесь — это ссылка на серию (например, "/anime/123-nazvanie/episode/1")
      const episodeUrl = `${BASE}${query}`;
      const html = await safeFetch(episodeUrl).then(r => r.text());
      const $ = cheerio.load(html);
      
      // AnimeGO часто встраивает плеер с кодом
      // Пытаемся найти прямую ссылку на видео в data-атрибутах или скриптах
      let videoUrl = '';
      
      // Ищем в тегах script
      $('script').each((i, el) => {
        const scriptContent = $(el).html();
        if (scriptContent) {
          // Ищем ссылки на mp4 или m3u8
          const match = scriptContent.match(/(https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)/);
          if (match) {
            videoUrl = match[1];
            return false; // Прерываем цикл
          }
        }
      });
      
      if (!videoUrl) {
        // Если не нашли в скриптах, ищем в плеере kodik или подобном
        const playerUrl = $('#player-container iframe').attr('src') || '';
        if (playerUrl) {
          videoUrl = playerUrl; // Иногда можно вернуть ссылку на iframe, если плеер поддерживает
        }
      }
      
      if (!videoUrl) {
        return jsonResponse(res, { error: 'Ссылка на видео не найдена' }, 404);
      }
      
      return jsonResponse(res, {
        sources: [{
          file: videoUrl,
          quality: 'auto',
          type: videoUrl.includes('.m3u8') ? 'hls' : 'mp4'
        }]
      });
    }

    // Если параметры не соответствуют ожидаемым
    return jsonResponse(res, { error: 'Неверные параметры запроса' }, 400);
    
  } catch (error) {
    console.error('Ошибка API:', error);
    return jsonResponse(res, { error: 'Внутренняя ошибка сервера', details: error.message }, 500);
  }
}
