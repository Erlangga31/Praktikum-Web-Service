const express = require('express');
const crypto = require('node:crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { rateLimit } = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.set('trust proxy', 1);

app.use(rateLimit({
  windowMs: 10 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use((req, res, next) => {
  const suppliedId = req.get('X-Request-Id');
  const id = suppliedId && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedId)
    ? suppliedId
    : crypto.randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-Id', id);
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gateway' }));

const requireApiKey = (req, res, next) => {
  if (!process.env.API_KEY || req.get('X-API-Key') !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const DOC_SOURCES = [
  {
    prefix: '/product-service',
    url: process.env.PRODUCT_DOC_URL || 'http://localhost:3000/openapi.json',
  },
  {
    prefix: '/order-service',
    url: process.env.ORDER_DOC_URL || 'http://localhost:3001/openapi.json',
  },
];

async function buildSpec() {
  const merged = {
    openapi: '3.0.3',
    info: { title: 'Toko API (via Gateway)', version: '1.0.0' },
    servers: [{ url: '/' }],
    tags: [],
    paths: {},
    components: { schemas: {} },
  };
  const tags = new Map();

  for (const source of DOC_SOURCES) {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(2000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const spec = await response.json();

      for (const tag of spec.tags || []) tags.set(tag.name, tag);
      for (const [path, operations] of Object.entries(spec.paths || {})) {
        const prefixedPath = `${source.prefix}${path}`;
        const prefixedOperations = { ...operations };
        for (const operation of Object.values(prefixedOperations)) {
          if (operation && typeof operation === 'object' && operation.responses) {
            operation.responses['429'] = {
              description: 'Batas request gateway terlampaui',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            };
            if (process.env.API_KEY && source.prefix === '/product-service') {
              operation.security = [{ ApiKeyAuth: [] }];
              operation.responses['401'] = {
                description: 'API key tidak ada atau tidak valid',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Error' },
                  },
                },
              };
            }
          }
        }
        merged.paths[prefixedPath] = prefixedOperations;
      }

      Object.assign(merged.components.schemas, spec.components?.schemas || {});
    } catch (error) {
      console.warn(`Dokumentasi gagal diambil dari ${source.url}: ${error.message}`);
    }
  }

  merged.tags = [...tags.values()];
  if (process.env.API_KEY) {
    merged.components.securitySchemes = {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    };
  }
  return merged;
}

app.get('/openapi.json', async (req, res) => {
  try {
    res.json(await buildSpec());
  } catch (error) {
    console.error('Gagal menggabungkan dokumentasi OpenAPI:', error.message);
    res.status(500).json({ error: 'Dokumentasi OpenAPI gagal dibuat' });
  }
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(null, {
  swaggerOptions: { url: '/openapi.json' },
}));

if (process.env.API_KEY) {
  app.use(['/catalog', '/product-service'], requireApiKey);
}

app.use(createProxyMiddleware({
  pathFilter: (path) => ['/catalog', '/product-service'].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  ),
  target: process.env.CATALOG_URL || 'http://localhost:3000',
  changeOrigin: true,
  pathRewrite: (path) => path.replace(/^\/(?:catalog|product-service)/, ''),
}));

app.use(createProxyMiddleware({
  pathFilter: (path) => ['/order', '/order-service'].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  ),
  target: process.env.ORDER_URL || 'http://localhost:3001',
  changeOrigin: true,
  pathRewrite: (path) => path.replace(/^\/(?:order-service|order)/, ''),
}));

app.use((req, res) => res.status(404).json({ error: 'Route tidak ditemukan' }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Gateway berjalan di port ${port}`));
