// api/anime.js — Vercel serverless function
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = new URL(req.url, `http://${req.headers.host}`);
  const action    = url.searchParams.get('action');
  const query     = url.searchParams.get('query');
  const episodeId = url.searchParams.get('episodeId') || (action === 'watch' ? query : null);
  const animeId   = url.searchParams.get('animeId')   || (action === 'info'  ? query : null);

  const ANILIBRIA = 'https://api.anilibria.top/v3';

  async function safeFetch(u) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
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
      console.error('[Proxy] Fetch error:', e.message, '|', u);
      return null;
    }
  }

  try {
    // ── ПОИСК ──────────────────────────────────────────────────────────────
    // AniLibria v3 возвращает { list: [...] }, НЕ plain array
    if (action === 'search' && query) {
      const q    = query.trim();
      const data = await safeFetch(
        `${ANILIBRIA}/title/search?search=${encodeURIComponent(q)}&limit=20`
      );

      // Поддерживаем оба формата: plain array (legacy) и { list: [] } (v3)
      const list = Array.isArray(data) ? data : (data?.list ?? []);

      if (list.length) {
        const results = list.map(item => ({
          id:          item.id,
          title:       item.names?.ru || item.names?.en || 'Без названия',
          titleEn:     item.names?.en || '',
          releaseDate: item.season?.year?.toString() || '?',
          image: item.posters?.original?.url
            ? `https://anilibria.top${item.posters.original.url}`
            : (item.posters?.small?.url
                ? `https://anilibria.top${item.posters.small.url}`
                : '')
        }));
        return res.status(200).json({ results });
      }
      return res.status(200).json({ results: [] });
    }

    // ── ИНФО (список эпизодов) ─────────────────────────────────────────────
    // Эпизоды в AniLibria v3 хранятся в data.player.list (объект, ключ = номер)
    if (action === 'info' && animeId) {
      const data = await safeFetch(
        `${ANILIBRIA}/title?id=${encodeURIComponent(animeId)}&playlist_type=array`
      );

      if (data?.player?.list) {
        const episodes = Object.values(data.player.list)
          .sort((a, b) => a.episode - b.episode)
          .map(ep => ({
            // Кодируем составной ID: animeId:номерЭпизода
            id:     `${animeId}:${ep.episode}`,
            number: ep.episode
          }));
        return res.status(200).json({ episodes });
      }
      return res.status(200).json({ episodes: [] });
    }

    // ── ВИДЕО ──────────────────────────────────────────────────────────────
    // episodeId приходит в формате "animeId:номерЭпизода"
    // /title/episode не существует в AniLibria → берём HLS из player.list тайтла
    if (action === 'watch' && episodeId) {
      const parts  = String(episodeId).split(':');
      const aid    = parts[0];
      const epNum  = parts[1];

      if (!aid || epNum == null) {
        return res.status(400).json({ error: 'Неверный формат episodeId. Ожидается "animeId:номер"' });
      }

      const data = await safeFetch(
        `${ANILIBRIA}/title?id=${encodeURIComponent(aid)}&playlist_type=array`
      );

      if (data?.player?.list) {
        const ep = Object.values(data.player.list).find(
          e => String(e.episode) === String(epNum)
        );

        if (ep?.hls) {
          const host = data.player?.host || 'cache.libria.fun';
          const hls  = ep.hls.fhd || ep.hls.hd || ep.hls.sd;
          if (hls) {
            const fileUrl = hls.startsWith('http') ? hls : `https://${host}${hls}`;
            return res.status(200).json({
              sources: [{ file: fileUrl, quality: 'auto', type: 'hls' }]
            });
          }
        }
      }
      return res.status(404).json({ error: 'Видео не найдено' });
    }

    return res.status(400).json({ error: 'Неверные параметры' });

  } catch (e) {
    return res.status(500).json({ error: 'Ошибка сервера', message: e.message });
  }
    }
