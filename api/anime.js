// api/anime.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, query, episodeId } = req.query;

  // Источник 1 – Gogoanime через Consumet
  const GOGO = 'https://api.consumet.org/anime/gogoanime';
  // Источник 2 – AMVSTRM (резервный)
  const AMV = 'https://api.amvstr.me/api/v2';

  // Функция для запроса с таймаутом и повторными попытками
  async function safeFetch(url, retries = 1) {
    for (let i = 0; i <= retries; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        const r = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        clearTimeout(timeout);
        return await r.json();
      } catch (e) {
        if (i === retries) throw e;
      }
    }
  }

  try {
    // ========== ПОИСК ==========
    if (action === 'search' && query) {
      const cleanQuery = encodeURIComponent(query);
      // Пытаемся Gogo
      let data = await safeFetch(`${GOGO}/${cleanQuery}`, 0);
      if (data && data.results && data.results.length > 0) {
        return res.status(200).json({ source: 'gogo', ...data });
      }
      // Резерв – AMVSTRM (поиск по ключевым словам)
      const amvData = await safeFetch(`${AMV}/search?q=${cleanQuery}&limit=10`, 0);
      if (amvData && amvData.results && amvData.results.length > 0) {
        // Преобразуем к общему формату
        const results = amvData.results.map(item => ({
          id: item.id,
          title: item.title.romaji || item.title.english || item.title.native,
          releaseDate: item.releaseDate,
          image: item.coverImage?.large || item.coverImage?.medium,
          url: item.url
        }));
        return res.status(200).json({ source: 'amvstrm', results });
      }
      return res.status(200).json({ results: [] });
    }

    // ========== ИНФО (эпизоды) ==========
    if (action === 'info' && query) {
      const id = encodeURIComponent(query);
      // Gogo
      let data = await safeFetch(`${GOGO}/info/${id}`, 0);
      if (data && data.episodes && data.episodes.length > 0) {
        return res.status(200).json({ source: 'gogo', ...data });
      }
      // AMVSTRM
      const amvData = await safeFetch(`${AMV}/anime/${id}`, 0);
      if (amvData && amvData.episodes && amvData.episodes.length > 0) {
        return res.status(200).json({ source: 'amvstrm', episodes: amvData.episodes });
      }
      return res.status(200).json({ episodes: [] });
    }

    // ========== ССЫЛКА НА ВИДЕО ==========
    if (action === 'watch' && episodeId) {
      const epId = encodeURIComponent(episodeId);
      // Gogo
      let data = await safeFetch(`${GOGO}/watch/${epId}`, 0);
      if (data && data.sources && data.sources.length > 0) {
        return res.status(200).json({ source: 'gogo', ...data });
      }
      // AMVSTRM (требуется ID эпизода, обычно числовой)
      const amvData = await safeFetch(`${AMV}/episode/${epId}`, 0);
      if (amvData && amvData.sources && amvData.sources.length > 0) {
        return res.status(200).json({ source: 'amvstrm', ...amvData });
      }
      return res.status(404).json({ error: 'Видео не найдено' });
    }

    return res.status(400).json({ error: 'Неверные параметры' });
  } catch (e) {
    return res.status(500).json({ error: 'Ошибка сервера', message: e.message });
  }
}
