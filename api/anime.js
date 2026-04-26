// api/anime.js
// Укажите URL вашего HiAnime API (без слеша в конце)
const YOUR_HIANIME_API = 'https://dssdsds.vercel.app'; // например, '/api' может быть частью пути

const JIKAN_BASE = 'https://api.jikan.moe/v4';

async function safeFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        ...options.headers,
      },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

function jsonResponse(res, data, status = 200) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.status(status).json(data);
}

export default async function handler(req, res) {
  const { action, query } = req.query;

  try {
    // ========== ПОИСК ==========
    if (action === 'search' && query) {
      const data = await safeFetch(`${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=15`);
      if (!data?.data) return jsonResponse(res, { results: [] });

      const results = data.data.map(anime => ({
        id: anime.mal_id.toString(),
        title: anime.title_english || anime.title,
        image: anime.images.jpg.image_url,
        year: anime.year,
        type: anime.type,
      }));
      return jsonResponse(res, { results });
    }

    // ========== ИНФО (список серий) ==========
    if (action === 'info' && query) {
      const malId = query;
      // Узнаём название по MAL ID
      const { data: { title_english, title } } = await safeFetch(`${JIKAN_BASE}/anime/${malId}`);
      const animeTitle = title_english || title;

      // Ищем на HiAnime
      const searchRes = await safeFetch(`${YOUR_HIANIME_API}/search?keyword=${encodeURIComponent(animeTitle)}`);
      if (!searchRes?.[0]?.id) return jsonResponse(res, { episodes: [] });

      const hianimeId = searchRes[0].id;
      const episodesData = await safeFetch(`${YOUR_HIANIME_API}/episodes/${hianimeId}`);

      const episodes = (episodesData || []).map(ep => ({
        id: ep.episodeId,   // для запроса stream
        number: ep.number,
      }));
      return jsonResponse(res, { episodes });
    }

    // ========== ВИДЕО ==========
    if (action === 'watch' && query) {
      const episodeId = query;
      // Получаем сервер
      const servers = await safeFetch(`${YOUR_HIANIME_API}/servers?id=${episodeId}`);
      if (!servers?.length) return jsonResponse(res, { error: 'Нет серверов' }, 404);

      const serverName = servers[0].serverName;
      // Получаем поток (субтитры)
      const streamData = await safeFetch(
        `${YOUR_HIANIME_API}/stream?id=${episodeId}&type=sub&server=${serverName}`
      );
      if (!streamData?.link) return jsonResponse(res, { error: 'Ссылка не найдена' }, 404);

      return jsonResponse(res, {
        sources: [{
          file: streamData.link,
          quality: 'auto',
          type: 'hls',
        }],
      });
    }

    return jsonResponse(res, { error: 'Неверные параметры' }, 400);
  } catch (error) {
    console.error('API error:', error);
    return jsonResponse(res, { error: 'Серверная ошибка', details: error.message }, 500);
  }
}
