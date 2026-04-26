// api/anime.js — HiAnime прокси через api-anime-rouge.vercel.app
// Документация: https://github.com/abhaythakur71181/Anime-API

const BASE = 'https://api-anime-rouge.vercel.app/aniwatch';

async function safeFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    clearTimeout(t);
    if (!r.ok) throw new Error(`Upstream ${r.status} → ${url}`);
    return r.json();
  } catch(e) { clearTimeout(t); throw e; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, query } = req.query;
  console.log(`[API] action=${action} query=${query}`);

  try {
    /* ── ГЛАВНАЯ СТРАНИЦА: новинки + трендовые ── */
    if (action === 'home') {
      const data = await safeFetch(`${BASE}/`);
      // latestEpisodes и topAiringAnimes — самые свежие
      const latest  = (data.latestEpisodes     || []).slice(0, 18).map(normalizeAnime);
      const trending = (data.trendingAnimes    || []).slice(0, 12).map(normalizeAnime);
      const spotlight = (data.spotlightAnimes  || []).slice(0,  6).map(normalizeAnime);
      return res.json({ latest, trending, spotlight });
    }

    /* ── ПОИСК ── */
    if (action === 'search') {
      // Пробуем разные пути поиска
      let results = [];
      for (const path of [
        `${BASE}/search?keyword=${encodeURIComponent(query||'')}`,
        `${BASE}/search?q=${encodeURIComponent(query||'')}`,
        `${BASE}/q?keyword=${encodeURIComponent(query||'')}`,
      ]) {
        try {
          const d = await safeFetch(path);
          const arr = d.animes || d.results || d.data || (Array.isArray(d) ? d : []);
          if (arr.length) { results = arr.map(normalizeAnime); break; }
        } catch(_) {}
      }
      return res.json({ results });
    }

    /* ── СПИСОК СЕРИЙ ── */
    if (action === 'info') {
      const data = await safeFetch(`${BASE}/episodes/${encodeURIComponent(query)}`);
      // Ответ: { episodes: [{ id, episodeId, title, episode_no, number }] }
      const raw = data.episodes || data.results?.episodes || data.results || [];
      const episodes = raw.map((ep, i) => ({
        id:     ep.episodeId || ep.id || `${query}?ep=${ep.data_id||i}`,
        number: ep.number || ep.episode_no || (i + 1),
        title:  ep.title || ep.jname || '',
      }));
      return res.json({ episodes });
    }

    /* ── ВОСПРОИЗВЕДЕНИЕ ── */
    if (action === 'watch') {
      // episodeId = "anime-slug?ep=12345"
      let streamUrl = null, subtitles = [];

      // Формат 1: /episode/sources?animeEpisodeId=...&server=hd-1&category=sub
      for (const cat of ['sub', 'dub']) {
        for (const srv of ['hd-1', 'hd-2', 'megacloud']) {
          if (streamUrl) break;
          try {
            const url = `${BASE}/episode/sources?animeEpisodeId=${encodeURIComponent(query)}&server=${srv}&category=${cat}`;
            console.log('[API] GET', url);
            const d = await safeFetch(url);
            // { sources: [{ url, isM3U8 }], subtitles: [{ lang, url }] }
            const src = (d.sources||[])[0];
            if (src?.url?.startsWith('http')) {
              streamUrl  = src.url;
              subtitles  = (d.subtitles || d.tracks || []).map(s => ({
                file: s.url || s.file, label: s.lang || s.label || 'Sub',
              })).filter(s => s.file);
            }
          } catch(_) {}
        }
        if (streamUrl) break;
      }

      if (!streamUrl) return res.status(404).json({ error: 'Стрим не найден. Попробуйте другую серию.' });

      return res.json({
        sources: [{ file: streamUrl, quality: 'auto', type: 'hls' }],
        subtitles,
      });
    }

    return res.status(400).json({ error: 'unknown action' });

  } catch(err) {
    console.error('[API]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

function normalizeAnime(item) {
  return {
    id:    item.id   || item.animeId || '',
    title: item.name || item.title   || 'Без названия',
    image: item.img  || item.poster  || item.image || '',
    episodes: item.episodes || {},
    type:  item.category || item.showType || item.type || '',
  };
}
