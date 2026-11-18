const test = require('node:test');
const assert = require('node:assert/strict');
const createMessageHandler = require('../notification-service/notification-core');

function createChannel() {
  return {
    acked: [],
    nacked: [],
    ack(message) {
      this.acked.push(message);
    },
    nack(message, allUpTo, requeue) {
      this.nacked.push({ message, allUpTo, requeue });
    },
  };
}

function createMessage(event, messageId = 'order-1') {
  return {
    content: Buffer.from(JSON.stringify(event)),
    properties: { messageId },
  };
}

test('notification acknowledges a valid order event and records its message ID', async () => {
  const channel = createChannel();
  const processed = new Set();
  const message = createMessage({
    type: 'order.created',
    data: { id: 1, productName: 'Kopi Lokal', qty: 2 },
  });
  const handle = createMessageHandler({
    channel,
    queue: 'test-queue',
    processed,
    delayMs: 0,
    log() {},
  });

  await handle(message);

  assert.deepEqual(channel.acked, [message]);
  assert.equal(channel.nacked.length, 0);
  assert.equal(processed.has('order-1'), true);
});

test('notification rejects a malformed event without requeueing', async () => {
  const channel = createChannel();
  const handle = createMessageHandler({
    channel,
    queue: 'test-queue',
    processed: new Set(),
    error() {},
  });

  await handle({
    content: Buffer.from('{invalid'),
    properties: { messageId: 'bad-message' },
  });

  assert.equal(channel.acked.length, 0);
  assert.equal(channel.nacked.length, 1);
  assert.equal(channel.nacked[0].message.content.toString(), '{invalid');
  assert.equal(channel.nacked[0].allUpTo, false);
  assert.equal(channel.nacked[0].requeue, false);
});

test('notification deduplicates a previously processed event', async () => {
  const channel = createChannel();
  const processed = new Set();
  const logged = [];
  const message = createMessage({
    type: 'order.created',
    data: { id: 1, productName: 'Kopi Lokal', qty: 2 },
  });
  const handle = createMessageHandler({
    channel,
    queue: 'test-queue',
    processed,
    delayMs: 0,
    log(...values) {
      logged.push(values.join(' '));
    },
  });

  await handle(message);
  await handle(message);

  assert.equal(channel.acked.length, 2);
  assert.equal(logged.filter((line) => line.includes('email terkirim')).length, 1);
  assert.equal(logged.filter((line) => line.includes('duplikat, dilewati')).length, 1);
});
