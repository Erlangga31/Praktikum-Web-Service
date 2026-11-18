function createMessageHandler({
  channel,
  queue,
  processed,
  crash = false,
  delayMs = 1000,
  log = console.log,
  error = console.error,
  exit = (code) => process.exit(code),
}) {
  return async function handleMessage(message) {
    if (!message) return;

    let event;
    try {
      event = JSON.parse(message.content.toString());
    } catch {
      error('pesan rusak, dibuang');
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
      error('format event order.created tidak valid, dibuang');
      channel.nack(message, false, false);
      return;
    }

    const messageId = message.properties.messageId;
    if (messageId && processed.has(messageId)) {
      log('duplikat, dilewati:', messageId);
      channel.ack(message);
      return;
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      log(`[${queue}] email terkirim: pesanan #${event.data.id} ${event.data.productName} x${event.data.qty}`);
      if (messageId) processed.add(messageId);

      if (crash) {
        log('crash sebelum ack!');
        exit(1);
        return;
      }

      channel.ack(message);
    } catch (processingError) {
      error('gagal memproses pesan:', processingError.message);
      channel.nack(message, false, true);
    }
  };
}

module.exports = createMessageHandler;
