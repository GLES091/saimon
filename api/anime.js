// api/anime.js — HiAnime proxy, правильные эндпоинты по документации
// https://github.com/JustAnimeCore/HiAnime-Api

const BASE_URL = 'https://dssdsds.vercel.app';

async function safeFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upstream ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, query } = req.query;
  console.log(`[API] action=${action} query=${query}`);
  if (!action) return res.status(400).json({ error: 'action required' });

  try {
    /* ──────────────────────────────
       ПОИСК: /api/search?keyword=...
       Ответ: { success, results: [{ id, poster, title, ... }] }
    ────────────────────────────── */
    if (action === 'search') {
      const url = `${BASE_URL}/api/search?keyword=${encodeURIComponent(query || '')}`;
      console.log('[API] GET', url);
      const data = await safeFetch(url);

      const raw = Array.isArray(data.results) ? data.results : [];
      const results = raw.map(item => ({
        id:    item.id || '',
        title: item.title || item.japanese_title || 'Без названия',
        image: item.poster || '',
      })).filter(x => x.id);

      return res.status(200).json({ results });
    }

    /* ──────────────────────────────
       СЕРИИ: /api/episodes/{animeId}
       Ответ: { success, results: { totalEpisodes, episodes: [{ id, episode_no }] } }
       episode.id = "anime-slug?ep=12345"
    ────────────────────────────── */
    if (action === 'info') {
      const url = `${BASE_URL}/api/episodes/${encodeURIComponent(query)}`;
      console.log('[API] GET', url);
      const data = await safeFetch(url);

      const raw = data.results?.episodes || data.results || [];
      const episodes = (Array.isArray(raw) ? raw : []).map((ep, i) => ({
        id:     ep.id || `${query}?ep=${ep.data_id || i}`,
        number: ep.episode_no || ep.number || (i + 1),
      }));

      return res.status(200).json({ episodes });
    }

    /* ──────────────────────────────
       ПРОСМОТР
       Шаг 1: GET /api/servers/{episodeFullId}
         Ответ: { success, results: [{ serverName, type, ... }] }

       Шаг 2: GET /api/stream?id={episodeFullId}&server={serverName}&type=sub
         Ответ: { success, results: {
           streamingLink: [{ link: { file, type }, tracks: [...] }]
         }}
    ────────────────────────────── */
    if (action === 'watch') {
      const episodeId = query; // формат: "anime-slug?ep=12345"

      // --- Получаем серверы ---
      const servUrl = `${BASE_URL}/api/servers/${episodeId}`;
      console.log('[API] GET', servUrl);
      const serversData = await safeFetch(servUrl);
      const serverList = Array.isArray(serversData.results) ? serversData.results : [];

      if (serverList.length === 0) {
        return res.status(404).json({ error: 'Серверы не найдены для этой серии' });
      }

      // --- Перебираем серверы, пробуем sub потом dub ---
      let streamFile = null;
      let subtitles = [];

      for (const srv of serverList.slice(0, 4)) {
        const serverName = srv.serverName || srv.server_name || srv.name || '';
        if (!serverName) continue;

        for (const type of ['sub', 'dub']) {
          try {
            const streamUrl = `${BASE_URL}/api/stream?id=${encodeURIComponent(episodeId)}&server=${encodeURIComponent(serverName)}&type=${type}`;
            console.log('[API] GET', streamUrl);
            const streamData = await safeFetch(streamUrl);

            // results.streamingLink[0].link.file
            const linkArr = streamData.results?.streamingLink;
            if (Array.isArray(linkArr) && linkArr.length > 0) {
              const file = linkArr[0]?.link?.file;
              if (file && file.startsWith('http')) {
                streamFile = file;
                subtitles = linkArr[0]?.tracks || [];
                console.log('[API] Stream OK:', file.slice(0, 80));
                break;
              }
            }
          } catch (e) {
            console.warn(`[API] ${serverName}/${type} failed:`, e.message);
          }

          // Резервный fallback эндпоинт
          if (!streamFile) {
            try {
              const fbUrl = `${BASE_URL}/api/stream/fallback?id=${encodeURIComponent(episodeId)}&server=${encodeURIComponent(serverName)}&type=${type}`;
              console.log('[API] Fallback GET', fbUrl);
              const fb = await safeFetch(fbUrl);
              const file = fb.results?.streamingLink?.[0]?.link?.file;
              if (file && file.startsWith('http')) {
                streamFile = file;
                subtitles = fb.results?.streamingLink?.[0]?.tracks || [];
                console.log('[API] Fallback OK:', file.slice(0, 80));
                break;
              }
            } catch (e) {
              console.warn('[API] Fallback failed:', e.message);
            }
          }
        }
        if (streamFile) break;
      }

      if (!streamFile) {
        return res.status(404).json({ error: 'Стрим не найден. Попробуйте другую серию или зайдите позже.' });
      }

      const subs = subtitles
        .filter(t => t.kind === 'captions' || t.kind === 'subtitles')
        .map(t => ({ file: t.file, label: t.label || 'Sub', default: !!t.default }));

      return res.status(200).json({
        sources: [{ file: streamFile, quality: 'auto', type: 'hls' }],
        subtitles: subs,
      });
    }

    return res.status(400).json({ error: 'Неизвестный action' });

  } catch (error) {
    console.error('[API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
