// api/anime.js
const BASE_URL = 'https://dssdsds.vercel.app'; // твой домен API

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
    // ── ПОИСК ──
    if (action === 'search') {
      const url = `${BASE_URL}/api/search?keyword=${encodeURIComponent(query || '')}`;
      console.log('[API] GET', url);
      const data = await safeFetch(url);
      const items = data?.results || [];
      const results = items.map(item => ({
        id: item.id,
        title: item.title,
        image: item.poster || item.image || '',
      }));
      return res.status(200).json({ results });
    }

    // ── ЭПИЗОДЫ (информация об аниме) ──
    if (action === 'info') {
      const animeId = query;
      const url = `${BASE_URL}/api/episodes/${encodeURIComponent(animeId)}`;
      console.log('[API] GET', url);
      const data = await safeFetch(url);
      const episodesRaw = data?.results?.episodes || [];
      const episodes = episodesRaw.map(ep => ({
        // формируем составной ID для последующих запросов серверов / стрима
        id: `${animeId}?ep=${ep.data_id}`,
        number: ep.episode_no,
      }));
      return res.status(200).json({ episodes });
    }

    // ── ВОСПРОИЗВЕДЕНИЕ (получение ссылки) ──
    if (action === 'watch') {
      // query = "animeId?ep=epDataId"
      const [animeId, epPart] = query.split('?ep=');
      const epDataId = epPart;
      if (!animeId || !epDataId) return res.status(400).json({ error: 'invalid episode id' });

      // 1. Получаем список серверов
      const servUrl = `${BASE_URL}/api/servers/${encodeURIComponent(animeId)}?ep=${encodeURIComponent(epDataId)}`;
      console.log('[API] GET', servUrl);
      const serversData = await safeFetch(servUrl);
      const servers = serversData?.results || [];
      if (servers.length === 0) return res.status(404).json({ error: 'no servers found' });
      const server = servers[0].serverName || servers[0].server_name;

      // 2. Получаем стрим
      const streamUrl = `${BASE_URL}/api/stream?id=${encodeURIComponent(query)}&server=${encodeURIComponent(server)}&type=sub`;
      console.log('[API] GET', streamUrl);
      const streamData = await safeFetch(streamUrl);
      const streamingLink = streamData?.results?.streamingLink;
      if (!streamingLink || !streamingLink[0]) return res.status(404).json({ error: 'stream link not found' });
      const file = streamingLink[0].link?.file;
      if (!file) return res.status(404).json({ error: 'file link absent' });

      return res.status(200).json({
        sources: [{ file, quality: 'auto', type: 'hls' }],
      });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (error) {
    console.error('[API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
