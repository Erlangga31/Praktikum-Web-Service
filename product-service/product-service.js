const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());
require('./observability')(app, 'product-service');

const products = [
  { id: 1, name: 'Keripik Tempe', category: 'Makanan ringan', price: 15000, stock: 10 },
  { id: 2, name: 'Batik Tulis', category: 'Pakaian', price: 250000, stock: 25 },
  { id: 3, name: 'Kopi Lokal', category: 'Minuman', price: 85000, stock: 12 },
];

const port = Number(process.env.PORT || 3000);
const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Product Service',
      version: '1.0.0',
      description: 'Data produk dan stok',
    },
    servers: [{ url: `http://localhost:${port}` }],
    tags: [{ name: 'Products', description: 'Katalog produk dan stok' }],
  },
  apis: [__filename],
});

app.get('/openapi.json', (req, res) => res.json(spec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

/**
 * @openapi
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       required: [id, name, category, price, stock]
 *       properties:
 *         id: { type: integer, example: 1 }
 *         name: { type: string, example: Keripik Tempe }
 *         category: { type: string, example: Makanan ringan }
 *         price: { type: integer, example: 15000 }
 *         stock: { type: integer, example: 10 }
 *     ServiceHealth:
 *       type: object
 *       required: [status, service, uptimeSec]
 *       properties:
 *         status: { type: string, example: ok }
 *         service: { type: string, example: product-service }
 *         uptimeSec: { type: integer, example: 3600 }
 *     ServiceMetrics:
 *       type: object
 *       required: [service, startedAt, requests, errors5xx, avgMs]
 *       properties:
 *         service: { type: string, example: product-service }
 *         startedAt: { type: string, format: date-time }
 *         requests: { type: integer, example: 25 }
 *         errors5xx: { type: integer, example: 1 }
 *         avgMs: { type: integer, example: 8 }
 *     ReserveRequest:
 *       type: object
 *       required: [qty]
 *       properties:
 *         qty: { type: integer, minimum: 1, example: 2 }
 *     Error:
 *       type: object
 *       required: [error]
 *       properties:
 *         error: { type: string, example: Produk tidak ditemukan }
 * /health:
 *   get:
 *     tags: [Products]
 *     summary: Health check Product Service
 *     responses:
 *       200:
 *         description: Service berjalan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ServiceHealth' }
 * /metrics:
 *   get:
 *     tags: [Products]
 *     summary: Metrik dasar Product Service
 *     responses:
 *       200:
 *         description: Metrik request service
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ServiceMetrics' }
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: Daftar semua produk
 *     responses:
 *       200:
 *         description: Daftar produk
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Product' }
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Detail satu produk
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Detail produk
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Product' }
 *       404:
 *         description: Produk tidak ditemukan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 * /products/{id}/reserve:
 *   post:
 *     tags: [Products]
 *     summary: Reservasi stok produk
 *     description: Mengurangi stok setelah memvalidasi jumlah dan ketersediaan.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ReserveRequest' }
 *     responses:
 *       200:
 *         description: Stok berhasil dikurangi
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Product' }
 *       400:
 *         description: qty tidak valid
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Produk tidak ditemukan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: Stok tidak cukup
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.get('/', (req, res) => res.json({ service: 'product-service', status: 'ok' }));
app.get('/products', (req, res) => res.json(products));
app.get('/products/:id', (req, res) => {
  const product = products.find((item) => item.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });
  res.json(product);
});

app.post('/products/:id/reserve', (req, res) => {
  const product = products.find((item) => item.id === Number(req.params.id));
  const { qty } = req.body || {};
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: 'qty tidak valid' });
  }
  if (product.stock < qty) return res.status(409).json({ error: 'Stok tidak cukup' });

  product.stock -= qty;
  res.json(product);
});

app.listen(port, () => console.log(`product-service berjalan di port ${port}`));
