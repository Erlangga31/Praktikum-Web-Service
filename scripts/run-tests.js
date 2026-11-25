const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const services = [];
const correlationId = `ci-${randomUUID()}`;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function startService(name, entry, env) {
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const service = { name, child, output: '' };
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      service.output += chunk;
    });
  }
  services.push(service);
  return service;
}

async function waitForHealth(service, url) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (service.child.exitCode !== null) {
      throw new Error(`${service.name} exited before becoming healthy`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${service.name} did not become healthy at ${url}`);
}

function runApiTests(baseUrl, requestId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--test',
      'tests/api.test.js',
      'tests/notification.test.js',
    ], {
      cwd: root,
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        API_KEY: '',
        CORRELATION_REQUEST_ID: requestId,
      },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`API test runner exited with code ${code}`));
    });
  });
}

function assertCorrelatedLogs(requestId) {
  for (const name of ['order-service', 'product-service']) {
    const service = services.find((item) => item.name === name);
    const matched = service.output.split(/\r?\n/).some((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.service === name && entry.id === requestId;
      } catch {
        return false;
      }
    });
    if (!matched) {
      throw new Error(`Request ID ${requestId} tidak ditemukan pada log ${name}`);
    }
  }
}

async function stopServices() {
  const running = services.filter(({ child }) => child.exitCode === null);
  for (const { child } of running) child.kill();
  await Promise.all(running.map(({ child }) => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('close', resolve);
    const timeout = setTimeout(resolve, 3000);
    timeout.unref();
  })));
}

function printLogs() {
  for (const { name, output } of services) {
    console.log(`\n=== ${name} logs ===`);
    if (output.trim()) process.stdout.write(output);
    else console.log('(no output)');
  }
}

async function main() {
  if (process.env.BASE_URL) {
    await runApiTests(process.env.BASE_URL, correlationId);
    return;
  }

  const [productPort, orderPort, gatewayPort] = await Promise.all([
    getFreePort(),
    getFreePort(),
    getFreePort(),
  ]);
  const notificationPort = process.env.RUN_NOTIFICATION === 'true'
    ? await getFreePort()
    : null;
  const productUrl = `http://127.0.0.1:${productPort}`;
  const orderUrl = `http://127.0.0.1:${orderPort}`;
  const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
  const notificationUrl = notificationPort
    ? `http://127.0.0.1:${notificationPort}`
    : '';

  try {
    const product = startService('product-service', 'product-service/product-service.js', {
      PORT: String(productPort),
    });
    const order = startService('order-service', 'order-service/order-service.js', {
      PORT: String(orderPort),
      PRODUCT_SERVICE_URL: productUrl,
      AMQP_URL: process.env.RUN_NOTIFICATION === 'true'
        ? process.env.AMQP_URL || 'amqp://localhost'
        : 'amqp://127.0.0.1:1',
    });
    const gateway = startService('gateway', 'gateway/gateway.js', {
      PORT: String(gatewayPort),
      PRODUCT_SERVICE_URL: productUrl,
      ORDER_SERVICE_URL: orderUrl,
      API_KEY: '',
    });
    const notification = notificationPort
      ? startService(
        'notification-service',
        'notification-service/notification-service.js',
        {
          PORT: String(notificationPort),
          AMQP_URL: process.env.AMQP_URL || 'amqp://localhost',
        },
      )
      : null;

    const healthChecks = [
      waitForHealth(product, `${productUrl}/health`),
      waitForHealth(order, `${orderUrl}/health`),
      waitForHealth(gateway, `${gatewayUrl}/health`),
    ];
    if (notification) {
      healthChecks.push(waitForHealth(notification, `${notificationUrl}/health`));
    }
    await Promise.all(healthChecks);
    await runApiTests(gatewayUrl, correlationId);
    assertCorrelatedLogs(correlationId);
    console.log(`Request ID ${correlationId} ditemukan pada log Order dan Product Service.`);
  } finally {
    await stopServices();
    printLogs();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
