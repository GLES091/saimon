// api/anime.js
// Укажи свой рабочий домен HiAnime API
const BASE_URL = 'https://dssdsds.vercel.app'; // твой экземпляр

async function safeFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
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
      throw new Error(`External API ${res.status}: ${text.slice(0, 100)}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, query } = req.query;

  console.log(`[API] action=${action}, query=${query}`);

  if (!action) return res.status(400).json({ error: 'action required' });

  try {
    // ======== ПОИСК ========
    if (action === 'search') {
      // Типичный путь: /api/v1/search?q=...
      const url = `${BASE_URL}/api/v1/search?q=${encodeURIComponent(query || '')}`;
      console.log('[API] GET', url);
      const data = await safeFetch(url);
      // Ответ может быть { results: [...] } или сразу массив
      const items = Array.isArray(data) ? data : (data.results || []);
      const results = items.map(item => ({
        id: item.id,
        title: item.title,
        image: item.image || '',
      }));
      return res.status(200).json({ results });
    }

    // ======== ИНФОРМАЦИЯ ОБ АНИМЕ (эпизоды) ========
    if (action === 'info') {
      // Типичный путь: /api/v1/anime/info?id=...
      const url = `${BASE_URL}/api/v1/anime/info?id=${encodeURIComponent(query)}`;
      console.log('[API] GET', url);
      const data = await safeFetch(url);
      // Может быть { episodes: [...] } или { data: { episodes: [...] } }
      let episodes = Array.isArray(data) ? data : (data.episodes || (data.data && data.data.episodes) || []);
      episodes = episodes.map(ep => ({
        id: ep.episodeId || ep.id,
        number: ep.number,
      }));
      return res.status(200).json({ episodes });
    }

    // ======== ПОЛУЧЕНИЕ ССЫЛКИ НА ВИДЕО ========
    if (action === 'watch') {
      // 1. Получить список серверов
      const servUrl = `${BASE_URL}/api/v1/episode/servers?episodeId=${encodeURIComponent(query)}`;
      console.log('[API] GET', servUrl);
      const serversData = await safeFetch(servUrl);
      const servers = Array.isArray(serversData) ? serversData : (serversData.servers || []);
      if (servers.length === 0) {
        return res.status(404).json({ error: 'servers not found' });
      }
      const server = servers[0].serverName || servers[0].name; // иногда поле name

      // 2. Получить поток
      const streamUrl = `${BASE_URL}/api/v1/episode/stream?episodeId=${encodeURIComponent(query)}&server=${encodeURIComponent(server)}`;
      console.log('[API] GET', streamUrl);
      const streamData = await safeFetch(streamUrl);
      const link = streamData.link || (streamData.sources && streamData.sources[0]?.file);
      if (!link) return res.status(404).json({ error: 'stream link not found' });

      return res.status(200).json({
        sources: [{ file: link, quality: 'auto', type: 'hls' }],
      });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (error) {
    console.error('[API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
