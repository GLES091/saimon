// api/anime.js – Vercel serverless function (Node.js)
export default async function handler(req, res) {
  // Разрешаем всем доменам (на всякий случай)
  res.setHeader('Access-Control-Allow-Origin', '*');

  // --- Парсим параметры вручную (не req.query, потому что это не Next.js) ---
  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get('action');
  const query  = url.searchParams.get('query');
  // Для watch твой фронтенд передаёт episodeId внутри параметра query
  const episodeId = (action === 'watch') ? query : url.searchParams.get('episodeId');
  const animeId   = (action === 'info') ? query : url.searchParams.get('animeId');

  // --- Новый рабочий домен AniLibria ---
  const ANILIBRIA = 'https://api.anilibria.top/v3';

  async function safeFetch(u) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(u, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'GOD_AE86-Player/1.0' }
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      clearTimeout(timer);
      console.error('[AniLibria Proxy] Fetch error:', e.message);
      return null;
    }
  }

  try {
    // ========== ПОИСК ==========
    if (action === 'search' && query) {
      const data = await safeFetch(`${ANILIBRIA}/title/search?search=${encodeURIComponent(query.trim())}`);
      if (Array.isArray(data)) {
        const results = data.map(item => ({
          id: item.id,
          title: item.names?.ru || item.names?.en || 'Без названия',
          releaseDate: item.season?.year?.toString() || '?',
          image: item.posters?.original?.url
            ? `https://anilibria.top${item.posters.original.url}`
            : (item.posters?.small?.url ? `https://anilibria.top${item.posters.small.url}` : '')
        }));
        return res.status(200).json({ results });
      }
      return res.status(200).json({ results: [] });
    }

    // ========== ИНФО (эпизоды) ==========
    if (action === 'info' && animeId) {
      const data = await safeFetch(`${ANILIBRIA}/title?id=${encodeURIComponent(animeId)}`);
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
      const data = await safeFetch(`${ANILIBRIA}/title/episode?id=${encodeURIComponent(episodeId)}`);
      if (data) {
        const hd = data.hls_1080p || data.hls_720p || data.hls_480p || data.hls_360p;
        if (hd) {
          return res.status(200).json({ sources: [{ file: hd, quality: 'auto', type: 'hls' }] });
        }
      }
      return res.status(404).json({ error: 'Видео не найдено' });
    }

    return res.status(400).json({ error: 'Неверные параметры' });
  } catch (e) {
    return res.status(500).json({ error: 'Ошибка сервера', message: e.message });
  }
}
