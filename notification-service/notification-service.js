const amqp = require('amqplib');

const AMQP_URL = process.env.AMQP_URL || 'amqp://localhost';
const QUEUE = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'notification-queue';
const CRASH = process.argv.includes('--crash');
const processed = new Set();

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const connection = await amqp.connect(AMQP_URL);
  connection.on('error', (error) => {
    console.error('RabbitMQ connection error:', error.message);
  });

  const channel = await connection.createChannel();
  await channel.assertExchange('orders', 'fanout', { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, 'orders', '');
  await channel.prefetch(1);
  console.log(`[${QUEUE}] menunggu pesan...`);

  channel.on('error', (error) => {
    console.error('RabbitMQ channel error:', error.message);
  });

  await channel.consume(QUEUE, async (message) => {
    if (!message) return;

    let event;
    try {
      event = JSON.parse(message.content.toString());
    } catch (error) {
      console.error('pesan rusak, dibuang');
      channel.nack(message, false, false);
      return;
    }

    if (
      event.type !== 'order.created'
      || !event.data
      || !Number.isInteger(event.data.id)
      || typeof event.data.productName !== 'string'
      || !Number.isInteger(event.data.qty)
    ) {
      console.error('format event order.created tidak valid, dibuang');
      channel.nack(message, false, false);
      return;
    }

    const messageId = message.properties.messageId;
    if (messageId && processed.has(messageId)) {
      console.log('duplikat, dilewati:', messageId);
      channel.ack(message);
      return;
    }

    try {
      await delay(1000);
      console.log(
        `[${QUEUE}] email terkirim: pesanan #${event.data.id} ${event.data.productName} x${event.data.qty}`,
      );
      if (messageId) processed.add(messageId);

      if (CRASH) {
        console.log('crash sebelum ack!');
        process.exit(1);
      }

      channel.ack(message);
    } catch (error) {
      console.error('gagal memproses pesan:', error.message);
      channel.nack(message, false, true);
    }
  }, { noAck: false });
}

main().catch((error) => {
  console.error('Gagal menjalankan notification-service:', error.message);
  process.exitCode = 1;
});
