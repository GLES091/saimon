// api/anime.js (версия для Vercel с AniLibria API)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, query, episodeId } = req.query;

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
      console.error('[AniLibria API] Fetch error:', e.message);
      return null;
    }
  }

  try {
    // ========== ПОИСК ==========
    if (action === 'search' && query) {
      // AniLibria: POST /title/search
      const searchUrl = `${BASE}/title/search?search=${encodeURIComponent(query)}`;
      const data = await safeFetch(searchUrl);
      if (data && Array.isArray(data)) {
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

    // ========== ИНФО (эпизоды) ==========
    if (action === 'info' && query) {
      // AniLibria: GET /title?id=...
      const data = await safeFetch(`${BASE}/title?id=${encodeURIComponent(query)}`);
      if (data && data.episodes && data.episodes.length > 0) {
        const episodes = data.episodes.map(ep => ({
          id: ep.id,
          number: ep.episode
        }));
        return res.status(200).json({ episodes });
      }
      return res.status(200).json({ episodes: [] });
    }

    // ========== ССЫЛКА НА ВИДЕО ==========
    if (action === 'watch' && episodeId) {
      // AniLibria: GET /title/episode?id=...
      const data = await safeFetch(`${BASE}/title/episode?id=${encodeURIComponent(episodeId)}`);
      if (data) {
        // Ищем 1080p или 720p mp4
        const hdUrl = data.hls_1080p || data.hls_720p || data.hls_480p || data.hls_360p;
        if (hdUrl) {
          // AniLibria отдает прямые ссылки на .mp4/.m3u8
          return res.status(200).json({
            sources: [
              { file: hdUrl, quality: hdUrl.includes('1080') ? '1080p' : '720p', type: 'hls' }
            ]
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
