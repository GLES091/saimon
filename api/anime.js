// api/anime.js — HiAnime proxy для Vercel
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

// Вытаскивает HLS-ссылку из любого формата ответа стрима
function extractStreamUrl(data) {
  if (!data) return null;

  // Формат 1: { link: '...' }
  if (typeof data.link === 'string' && data.link.includes('http')) return data.link;

  // Формат 2: { url: '...' }
  if (typeof data.url === 'string' && data.url.includes('http')) return data.url;

  // Формат 3: { sources: [{ url|file|link: '...' }] }
  if (Array.isArray(data.sources) && data.sources.length > 0) {
    const src = data.sources[0];
    return src.url || src.file || src.link || null;
  }

  // Формат 4: { data: { sources: [...] } }
  if (data.data && Array.isArray(data.data.sources) && data.data.sources.length > 0) {
    const src = data.data.sources[0];
    return src.url || src.file || src.link || null;
  }

  // Формат 5: { stream: '...' }
  if (typeof data.stream === 'string' && data.stream.includes('http')) return data.stream;

  return null;
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
    /* ──────── ПОИСК ──────── */
    if (action === 'search') {
      const url = `${BASE_URL}/search?keyword=${encodeURIComponent(query || '')}`;
      console.log('[API] GET', url);
      const data = await safeFetch(url);

      // API может вернуть массив или объект с results
      const raw = Array.isArray(data) ? data : (data.results || data.data || []);
      const results = raw.map(item => ({
        id:    item.id   || item.animeId   || '',
        title: item.title || item.name      || 'Без названия',
        image: item.image || item.poster    || item.img || '',
      })).filter(x => x.id);

      return res.status(200).json({ results });
    }

    /* ──────── СЕРИИ ──────── */
    if (action === 'info') {
      const url = `${BASE_URL}/episodes/${encodeURIComponent(query)}`;
      console.log('[API] GET', url);
      const data = await safeFetch(url);

      const raw = Array.isArray(data) ? data : (data.episodes || data.data || []);
      const episodes = raw.map((ep, i) => ({
        id:     ep.episodeId || ep.id || ep.episode_id || String(i + 1),
        number: ep.number   || ep.episode || ep.num     || (i + 1),
      }));

      return res.status(200).json({ episodes });
    }

    /* ──────── ВОСПРОИЗВЕДЕНИЕ ──────── */
    if (action === 'watch') {
      // Шаг 1: получаем список серверов
      const servUrl = `${BASE_URL}/servers?id=${encodeURIComponent(query)}`;
      console.log('[API] GET', servUrl);
      const servers = await safeFetch(servUrl);

      const serverList = Array.isArray(servers) ? servers : (servers.servers || servers.data || []);
      if (serverList.length === 0) {
        return res.status(404).json({ error: 'Серверы не найдены' });
      }

      // Шаг 2: пробуем серверы по порядку до первого рабочего
      const tryServers = serverList.slice(0, 3); // максимум 3 попытки
      let streamUrl = null;

      for (const srv of tryServers) {
        const serverName = srv.serverName || srv.name || srv.server || '';
        if (!serverName) continue;

        // Пробуем sub и dub
        for (const type of ['sub', 'dub']) {
          try {
            const sUrl = `${BASE_URL}/stream?id=${encodeURIComponent(query)}&type=${type}&server=${encodeURIComponent(serverName)}`;
            console.log('[API] GET', sUrl);
            const stream = await safeFetch(sUrl);
            streamUrl = extractStreamUrl(stream);
            if (streamUrl) {
              console.log('[API] Stream found:', streamUrl.slice(0, 60));
              break;
            }
          } catch (e) {
            console.warn('[API] Server failed:', serverName, type, e.message);
          }
        }
        if (streamUrl) break;
      }

      if (!streamUrl) {
        return res.status(404).json({ error: 'Стрим не найден. Попробуйте другую серию.' });
      }

      return res.status(200).json({
        sources: [{ file: streamUrl, quality: 'auto', type: 'hls' }],
      });
    }

    return res.status(400).json({ error: 'Неизвестный action' });

  } catch (error) {
    console.error('[API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
