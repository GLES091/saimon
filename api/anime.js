// api/anime.js
export default async function handler(req, res) {
  // Разрешаем CORS (на всякий случай)
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, query, episodeId } = req.query;

  // Текущий рабочий API (GogoAnime через Consumet)
  const BASE = 'https://api.consumet.org/anime/gogoanime';

  // Безопасный fetch с таймаутом
  async function safeFetch(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NetErrror)' }
      });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      console.error('[API] Fetch error:', e.message);
      return null;
    }
  }

  try {
    // ========== ПОИСК ==========
    if (action === 'search' && query) {
      // Consumet: GET /gogoanime/{query}
      const data = await safeFetch(`${BASE}/${encodeURIComponent(query.trim())}`);
      if (data?.results?.length) {
        const results = data.results.map(r => ({
          id: r.id,
          title: r.title,
          releaseDate: r.releaseDate || '?',
          image: r.image
        }));
        return res.status(200).json({ results });
      }
      return res.status(200).json({ results: [] });
    }

    // ========== ИНФО (эпизоды) ==========
    if (action === 'info' && query) {
      // Consumet: GET /gogoanime/info/{animeId}
      const data = await safeFetch(`${BASE}/info/${encodeURIComponent(query)}`);
      if (data?.episodes?.length) {
        const episodes = data.episodes.map(ep => ({
          id: ep.id,
          number: ep.number || ep.episode
        }));
        return res.status(200).json({ episodes });
      }
      return res.status(200).json({ episodes: [] });
    }

    // ========== ССЫЛКА НА ВИДЕО ==========
    if (action === 'watch' && episodeId) {
      // Consumet: GET /gogoanime/watch/{episodeId}
      const data = await safeFetch(`${BASE}/watch/${encodeURIComponent(episodeId)}`);
      if (data?.sources?.length) {
        return res.status(200).json({ sources: data.sources });
      }
      return res.status(404).json({ error: 'Видео не найдено' });
    }

    return res.status(400).json({ error: 'Неверные параметры' });
  } catch (e) {
    return res.status(500).json({ error: 'Ошибка сервера', message: e.message });
  }
}
