// api/anime.js
import fetch from 'node-fetch';

// Твой рабочий HiAnime API
const BASE = 'https://dssdsds.vercel.app';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { action, query } = req.query;
  if (!action) {
    return res.status(400).json({ error: 'action required' });
  }

  try {
    // ========== ПОИСК ==========
    if (action === 'search') {
      const url = `${BASE}/search?keyword=${encodeURIComponent(query || '')}`;
      console.log('[API] search =>', url);
      const apiRes = await fetch(url);
      if (!apiRes.ok) throw new Error(`HiAnime search error: ${apiRes.status}`);
      const data = await apiRes.json();
      const results = (Array.isArray(data) ? data : []).map(item => ({
        id: item.id,
        title: item.title,
        image: item.image || '',
      }));
      return res.status(200).json({ results });
    }

    // ========== ЭПИЗОДЫ ==========
    if (action === 'info') {
      const url = `${BASE}/episodes/${encodeURIComponent(query)}`;
      console.log('[API] episodes =>', url);
      const apiRes = await fetch(url);
      if (!apiRes.ok) throw new Error(`HiAnime episodes error: ${apiRes.status}`);
      const data = await apiRes.json();
      const episodes = (Array.isArray(data) ? data : []).map(ep => ({
        id: ep.episodeId,
        number: ep.number,
      }));
      return res.status(200).json({ episodes });
    }

    // ========== ВИДЕО ==========
    if (action === 'watch') {
      // 1. Сервера
      const serversUrl = `${BASE}/servers?id=${encodeURIComponent(query)}`;
      console.log('[API] servers =>', serversUrl);
      const servRes = await fetch(serversUrl);
      if (!servRes.ok) throw new Error(`Servers error: ${servRes.status}`);
      const servers = await servRes.json();
      if (!Array.isArray(servers) || servers.length === 0) {
        return res.status(404).json({ error: 'servers not found' });
      }
      const server = servers[0].serverName;

      // 2. Стрим
      const streamUrl = `${BASE}/stream?id=${encodeURIComponent(query)}&type=sub&server=${encodeURIComponent(server)}`;
      console.log('[API] stream =>', streamUrl);
      const streamRes = await fetch(streamUrl);
      if (!streamRes.ok) throw new Error(`Stream error: ${streamRes.status}`);
      const stream = await streamRes.json();
      if (!stream.link) {
        return res.status(404).json({ error: 'stream link not found' });
      }
      return res.status(200).json({
        sources: [{ file: stream.link, quality: 'auto', type: 'hls' }],
      });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (error) {
    console.error('[API] FATAL ERROR:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
