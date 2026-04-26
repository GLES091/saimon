// api/anime.js — прокси для API https://dssdsds.vercel.app/
// Документация: https://github.com/abhaythakur71181/Anime-API?tab=readme-ov-file#readme

const BASE = 'https://dssdsds.vercel.app/api';

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
    const data = await r.json();
    if (data && data.success === false) throw new Error(data.message || 'API error');
    return data;
  } catch(e) { clearTimeout(t); throw e; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, query } = req.query;
  console.log(`[API] action=${action} query=${query}`);

  try {
    /* ── ГЛАВНАЯ СТРАНИЦА ── */
    if (action === 'home') {
      const data = await safeFetch(`${BASE}/`);
      if (!data?.results) throw new Error('Некорректный ответ от API');
      const r = data.results;
      const latest    = (r.latestEpisode   || []).slice(0, 18).map(normalizeAnime);
      const trending  = (r.trending        || []).slice(0, 12).map(normalizeAnime);
      const spotlight = (r.spotlights      || []).slice(0,  6).map(normalizeAnime);
      const topAiring = (r.topAiring       || []).slice(0, 12).map(normalizeAnime);
      return res.json({ latest, trending, spotlight, topAiring });
    }

    /* ── ПОИСК ── */
    if (action === 'search') {
      const data = await safeFetch(`${BASE}/search?keyword=${encodeURIComponent(query||'')}`);
      const arr = Array.isArray(data?.results) ? data.results : [];
      const results = arr.map(normalizeAnime);
      return res.json({ results });
    }

    /* ── СПИСОК ЭПИЗОДОВ ── */
    if (action === 'info') {
      const data = await safeFetch(`${BASE}/episodes/${encodeURIComponent(query)}`);
      const raw = data?.results?.episodes || data?.episodes || [];
      const episodes = raw.map((ep, i) => ({
        id:     ep.id || `${query}?ep=${ep.data_id || i}`,
        number: ep.episode_no || (i + 1),
        title:  ep.title || ep.jname || '',
      }));
      return res.json({ episodes });
    }

    /* ── ВОСПРОИЗВЕДЕНИЕ ── */
    if (action === 'watch') {
      let streamUrl = null, subtitles = [];

      for (const cat of ['sub', 'dub']) {
        for (const srv of ['hd-1', 'hd-2', 'megacloud']) {
          if (streamUrl) break;
          try {
            const url = `${BASE}/stream?id=${encodeURIComponent(query)}&server=${srv}&type=${cat}`;
            console.log('[API] GET', url);
            const d = await safeFetch(url);
            const link = d?.results?.streamingLink?.[0]?.link;
            if (link?.file?.startsWith?.('http')) {
              streamUrl  = link.file;
              subtitles  = (d.results.streamingLink[0].tracks || []).map(t => ({
                file: t.file, label: t.label || 'Sub',
              })).filter(s => s.file);
            }
          } catch(_) {}
        }
        if (streamUrl) break;
      }

      // Fallback
      if (!streamUrl) {
        for (const cat of ['sub', 'dub']) {
          for (const srv of ['hd-1', 'hd-2', 'megacloud']) {
            if (streamUrl) break;
            try {
              const url = `${BASE}/stream/fallback?id=${encodeURIComponent(query)}&server=${srv}&type=${cat}`;
              const d = await safeFetch(url);
              const link = d?.results?.streamingLink?.[0]?.link;
              if (link?.file?.startsWith?.('http')) {
                streamUrl  = link.file;
                subtitles  = (d.results.streamingLink[0].tracks || []).map(t => ({
                  file: t.file, label: t.label || 'Sub',
                })).filter(s => s.file);
              }
            } catch(_) {}
          }
          if (streamUrl) break;
        }
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
    id:    item.id   || item.animeId || item.data_id || '',
    title: item.name || item.title   || 'Без названия',
    image: item.poster || item.img  || item.image || '',
    episodes: {
      sub: item.tvInfo?.sub ?? (item.episodes?.sub ?? undefined),
      dub: item.tvInfo?.dub ?? (item.episodes?.dub ?? undefined),
    },
    type:  item.tvInfo?.showType || item.showType || item.type || '',
  };
}
