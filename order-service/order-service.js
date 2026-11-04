const express = require('express');
const amqp = require('amqplib');

const app = express();
app.use(express.json());

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3000';
const AMQP_URL = process.env.AMQP_URL || 'amqp://localhost';
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

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`order-service berjalan di port ${port}`);
  connectQueue();
});
