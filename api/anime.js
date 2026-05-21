// api/anime.js
export default async function handler(req, res) {
  const { search, limit } = req.query;
  const url = `https://shikimori.one/api/animes?search=${search || ''}&limit=${limit || 10}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    
    const data = await response.json();
    
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch' });
  }
}
