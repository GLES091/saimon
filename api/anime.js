// api/anime.js – serverless-функция для Vercel (Node.js)
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Парсим параметры вручную
  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get('action');
  const query = url.searchParams.get('query');
  const episodeId = url.searchParams.get('episodeId'); // если передаём, но у нас episodeId?

  // В твоём коде используется "episodeId", но в запросах оно может называться иначе.
  // В api/anime.js для watch мы ожидаем episodeId, а в index.html передаётся action=watch&query=ID_эпизода.
  // Исправим: пусть episodeId = query для action === 'watch'
  const realEpisodeId = action === 'watch' ? query : episodeId;
  const animeIdForInfo = action === 'info' ? query : null;
  const searchQuery = action === 'search' ? query : null;

  const BASE = 'https://api.anilibria.tv/v3';

  async function safeFetch(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'GOD_AE86-Player/1.0' }
      });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      console.error('[AniLibria] Fetch error:', e.message);
      return null;
    }
  }

  try {
    // -- ПОИСК --
    if (action === 'search' && searchQuery) {
      const data = await safeFetch(`${BASE}/title/search?search=${encodeURIComponent(searchQuery)}`);
      if (Array.isArray(data)) {
        const results = data.map(item => ({
          id: item.id,
          title: item.names?.ru || item.names?.en || 'Без названия',
          releaseDate: item.season?.year?.toString() || '?',
          image: `https://anilibria.tv${item.posters?.original?.url || item.posters?.small?.url || ''}`
        }));
        return res.status(200).json({ results });
      }
      return res.status(200).json({ results: [] });
    }

    // -- ИНФО (эпизоды) --
    if (action === 'info' && animeIdForInfo) {
      const data = await safeFetch(`${BASE}/title?id=${encodeURIComponent(animeIdForInfo)}`);
      if (data && data.episodes && data.episodes.length > 0) {
        const episodes = data.episodes.map(ep => ({
          id: ep.id,
          number: ep.episode
        }));
        return res.status(200).json({ episodes });
      }
      return res.status(200).json({ episodes: [] });
    }

    // -- ВИДЕО --
    if (action === 'watch' && realEpisodeId) {
      const data = await safeFetch(`${BASE}/title/episode?id=${encodeURIComponent(realEpisodeId)}`);
      if (data) {
        const hdUrl = data.hls_1080p || data.hls_720p || data.hls_480p || data.hls_360p;
        if (hdUrl) {
          return res.status(200).json({
            sources: [{ file: hdUrl, quality: hdUrl.includes('1080') ? '1080p' : '720p', type: 'hls' }]
          });
        }
      }
      return res.status(404).json({ error: 'Видео не найдено' });
    }

    return res.status(400).json({ error: 'Неверные параметры' });
  } catch (e) {
    return res.status(500).json({ error: 'Ошибка сервера', message: e.message });
  }
}
