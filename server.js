import express from 'express';
import cors from 'cors';
import { expressGuard } from './appGuard.js';
import {
  scrapeHome,
  searchAnime,
  scrapeAnimeDetail,
  scrapeEpisodeSources,
  browseAnime,
} from './scraper/scraper.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Only the AniHub app (signed requests) may use this API.
app.use(expressGuard);

// =========================================
// Homepage - featured and latest episodes
// =========================================
app.get('/api/home', async (req, res) => {
  try {
    const data = await scrapeHome();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================
// Search anime
// =========================================
app.get('/api/search', async (req, res) => {
  const { q, page = 1 } = req.query;
  if (!q) {
    return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
  }
  try {
    const data = await searchAnime(q, parseInt(page));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================
// Anime detail + episode list
// =========================================
app.get('/api/anime/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const data = await scrapeAnimeDetail(slug);
    if (!data.title) {
      return res.status(404).json({ success: false, error: 'Anime not found' });
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================
// Episode streaming sources
// =========================================
app.get('/api/episode/:slug/:episode', async (req, res) => {
  const { slug, episode } = req.params;
  try {
    const data = await scrapeEpisodeSources(slug, episode);
    if (!data.title && data.servers.length === 0) {
      return res.status(404).json({ success: false, error: 'Episode not found' });
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================
// Browse by genre, type, status, etc.
// =========================================
app.get('/api/browse/:category/:value?', async (req, res) => {
  const { category, value } = req.params;
  const { page = 1 } = req.query;
  
  const validCategories = ['genre', 'type', 'status', 'latest', 'new', 'popular'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({
      success: false,
      error: `Invalid category. Valid: ${validCategories.join(', ')}`,
    });
  }
  
  if ((category === 'genre' || category === 'type' || category === 'status') && !value) {
    return res.status(400).json({
      success: false,
      error: `Value required for category "${category}"`,
    });
  }

  try {
    const data = await browseAnime(category, value, parseInt(page));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================
// Available genres/types/statuses
// =========================================
app.get('/api/filters', async (req, res) => {
  try {
    const html = await (await import('./scraper/client.js')).fetchHTML('/home');
    const $ = (await import('cheerio')).load(html);
    
    const genres = [];
    const types = [];
    const statuses = [];

    $('#menu ul li ul.c4 li a').each((i, el) => {
      const $el = $(el);
      genres.push({
        name: $el.find('h3').text().trim(),
        slug: $el.attr('href').replace('/genre/', ''),
        url: `https://anikototv.to${$el.attr('href')}`,
      });
    });

    $('#menu ul li ul.c1 li a').each((i, el) => {
      const $el = $(el);
      types.push({
        name: $el.find('h3').text().trim(),
        slug: $el.attr('href').replace('/type/', ''),
        url: `https://anikototv.to${$el.attr('href')}`,
      });
    });

    // Extract status links from nav
    $('header #menu ul li:not(.mb) > a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const match = href.match(/\/status\/(.+)/);
      if (match) {
        statuses.push({
          name: $el.text().trim(),
          slug: match[1],
          url: `https://anikototv.to${href}`,
        });
      }
    });

    res.json({
      success: true,
      data: { genres, types, statuses },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================
// Health check
// =========================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend
app.use(express.static('public'));

// Fallback API docs at /api
app.get('/api', (req, res) => {
  res.json({
    name: 'Anikoto Scraper API',
    version: '1.0.0',
    endpoints: {
      'GET /api/health': 'Health check',
      'GET /api/home': 'Get featured anime, latest episodes, trending',
      'GET /api/search?q={query}&page={page}': 'Search anime by keyword',
      'GET /api/anime/{slug}': 'Get anime detail and episode list',
      'GET /api/episode/{slug}/{episode}': 'Get streaming sources for an episode',
      'GET /api/browse/genre/{genre}': 'Browse anime by genre',
      'GET /api/browse/type/{type}': 'Browse by type',
      'GET /api/browse/status/{status}': 'Browse by status',
      'GET /api/browse/latest': 'Latest updated episodes',
      'GET /api/browse/new': 'Newly added anime',
      'GET /api/browse/popular': 'Most viewed/popular anime',
      'GET /api/filters': 'Get all available genres, types, and statuses',
    },
  });
});

app.listen(PORT, () => {
  console.log(`🎬 Anikoto Scraper API running on http://localhost:${PORT}`);
  console.log(`📖 API docs: http://localhost:${PORT}/`);
});
