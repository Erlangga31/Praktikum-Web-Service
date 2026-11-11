const express = require('express');
const amqp = require('amqplib');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3000';
const AMQP_URL = process.env.AMQP_URL || 'amqp://localhost';
const port = Number(process.env.PORT || 3001);
const orders = [];
let channel = null;
let connecting = false;
let reconnectTimer = null;

function scheduleQueueReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectQueue();
  }, 3000);
}

async function connectQueue() {
  if (connecting || channel) return;
  connecting = true;
  let connection;

  try {
    connection = await amqp.connect(AMQP_URL);
    connection.on('error', (error) => {
      console.error('RabbitMQ connection error:', error.message);
    });
    connection.on('close', () => {
      channel = null;
      scheduleQueueReconnect();
    });

    const newChannel = await connection.createChannel();
    await newChannel.assertExchange('orders', 'fanout', { durable: true });
    newChannel.on('error', (error) => {
      console.error('RabbitMQ channel error:', error.message);
      channel = null;
      scheduleQueueReconnect();
    });
    channel = newChannel;
    console.log('terhubung ke RabbitMQ');
  } catch (error) {
    console.error(`RabbitMQ belum tersedia (${error.message}), coba lagi dalam 3 detik`);
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('Gagal menutup koneksi RabbitMQ:', closeError.message);
      }
    }
    scheduleQueueReconnect();
  } finally {
    connecting = false;
  }
}

function publishOrderCreated(order) {
  if (!channel) {
    console.warn('channel RabbitMQ tidak tersedia, event TIDAK terkirim:', order.id);
    return false;
  }

  const body = Buffer.from(JSON.stringify({ type: 'order.created', data: order }));
  try {
    return channel.publish('orders', '', body, {
      persistent: true,
      contentType: 'application/json',
      messageId: `order-${order.id}`,
    });
  } catch (error) {
    console.error(`Gagal menerbitkan event order.created untuk order ${order.id}:`, error.message);
    channel = null;
    scheduleQueueReconnect();
    return false;
  }
}

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Order Service',
      version: '1.0.0',
      description: 'Pembuatan dan daftar pesanan',
    },
    servers: [{ url: `http://localhost:${port}` }],
    tags: [{ name: 'Orders', description: 'Pembuatan dan pembacaan pesanan' }],
  },
  apis: [__filename],
});

app.get('/openapi.json', (req, res) => res.json(spec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

/**
 * @openapi
 * components:
 *   schemas:
 *     OrderRequest:
 *       type: object
 *       required: [productId, qty]
 *       properties:
 *         productId: { type: integer, minimum: 1, example: 1 }
 *         qty: { type: integer, minimum: 1, example: 2 }
 *     Order:
 *       type: object
 *       required: [id, productId, productName, qty, total, createdAt]
 *       properties:
 *         id: { type: integer, example: 1 }
 *         productId: { type: integer, example: 1 }
 *         productName: { type: string, example: Keripik Tempe }
 *         qty: { type: integer, example: 2 }
 *         total: { type: integer, example: 30000 }
 *         createdAt: { type: string, format: date-time, example: '2026-11-11T10:00:00.000Z' }
 *     Error:
 *       type: object
 *       required: [error]
 *       properties:
 *         error: { type: string, example: Stok tidak cukup }
 *     ServiceHealth:
 *       type: object
 *       required: [service, status]
 *       properties:
 *         service: { type: string, example: order-service }
 *         status: { type: string, example: ok }
 * /:
 *   get:
 *     tags: [Orders]
 *     summary: Status Order Service
 *     responses:
 *       200:
 *         description: Service berjalan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ServiceHealth' }
 * /orders:
 *   post:
 *     tags: [Orders]
 *     summary: Buat pesanan baru
 *     description: Mereservasi stok melalui Product Service lalu menyimpan pesanan dan menerbitkan event order.created.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/OrderRequest' }
 *     responses:
 *       201:
 *         description: Pesanan dibuat
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Order' }
 *       400:
 *         description: productId atau qty tidak valid
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
 *       502:
 *         description: Respons atau data Product Service tidak valid
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       503:
 *         description: Product Service tidak tersedia atau timeout
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *   get:
 *     tags: [Orders]
 *     summary: Daftar semua pesanan
 *     responses:
 *       200:
 *         description: Daftar pesanan
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Order' }
 */
app.get('/', (req, res) => res.json({ service: 'order-service', status: 'ok' }));
app.post('/orders', async (req, res) => {
  const { productId, qty } = req.body || {};
  if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: 'productId dan qty harus bilangan bulat > 0' });
  }

  let productResponse;
  try {
    productResponse = await fetch(
      `${PRODUCT_SERVICE_URL}/products/${productId}/reserve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty }),
        signal: AbortSignal.timeout(2000),
      },
    );
  } catch (error) {
    const reason = error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'timeout'
      : 'tidak tersedia';
    return res.status(503).json({
      error: `product-service ${reason}, coba lagi nanti`,
    });
  }

  let product;
  try {
    product = await productResponse.json();
  } catch (error) {
    return res.status(502).json({ error: 'Respons product-service tidak valid' });
  }

  if (!productResponse.ok) return res.status(productResponse.status).json(product);
  if (typeof product.name !== 'string' || typeof product.price !== 'number') {
    return res.status(502).json({ error: 'Data produk dari product-service tidak valid' });
  }

  const order = {
    id: orders.length + 1,
    productId,
    productName: product.name,
    qty,
    total: product.price * qty,
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  publishOrderCreated(order);
  res.status(201).json(order);
});

app.get('/orders', (req, res) => res.json(orders));

app.listen(port, () => {
  console.log(`order-service berjalan di port ${port}`);
  connectQueue();
});
