const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { rateLimit } = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);

app.use(rateLimit({
  windowMs: 10 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
}));

const requireApiKey = (req, res, next) => {
  if (!process.env.API_KEY || req.get('X-API-Key') !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

if (process.env.API_KEY) {
  app.use('/catalog', requireApiKey);
}

app.use(createProxyMiddleware({
  pathFilter: (path) => path === '/catalog' || path.startsWith('/catalog/'),
  target: process.env.CATALOG_URL || 'http://localhost:3000',
  changeOrigin: true,
  pathRewrite: { '^/catalog': '' },
}));

app.use(createProxyMiddleware({
  pathFilter: (path) => path === '/order' || path.startsWith('/order/'),
  target: process.env.ORDER_URL || 'http://localhost:3001',
  changeOrigin: true,
  pathRewrite: { '^/order': '' },
}));

app.use((req, res) => res.status(404).json({ error: 'Route tidak ditemukan' }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Gateway berjalan di port ${port}`));
