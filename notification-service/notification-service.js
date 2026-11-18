const amqp = require('amqplib');
const http = require('node:http');
const createMessageHandler = require('./notification-core');

const AMQP_URL = process.env.AMQP_URL || 'amqp://localhost';
const QUEUE = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'notification-queue';
const CRASH = process.argv.includes('--crash');
const port = Number(process.env.PORT || 3002);
const processed = new Set();
let ready = false;

const healthServer = http.createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/health') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route tidak ditemukan' }));
    return;
  }

  const status = ready ? 200 : 503;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: ready ? 'ok' : 'unavailable',
    service: 'notification-service',
  }));
});

healthServer.listen(port, () => {
  console.log(`notification-service health berjalan di port ${port}`);
});

async function main() {
  const connection = await amqp.connect(AMQP_URL);
  connection.on('error', (error) => {
    ready = false;
    console.error('RabbitMQ connection error:', error.message);
  });
  connection.on('close', () => {
    ready = false;
  });

  const channel = await connection.createChannel();
  await channel.assertExchange('orders', 'fanout', { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, 'orders', '');
  await channel.prefetch(1);
  console.log(`[${QUEUE}] menunggu pesan...`);

  channel.on('error', (error) => {
    ready = false;
    console.error('RabbitMQ channel error:', error.message);
  });
  channel.on('close', () => {
    ready = false;
  });
  await channel.consume(
    QUEUE,
    createMessageHandler({ channel, queue: QUEUE, processed, crash: CRASH }),
    { noAck: false },
  );
  ready = true;
}

main().catch((error) => {
  console.error('Gagal menjalankan notification-service:', error.message);
  healthServer.close();
  process.exitCode = 1;
});
