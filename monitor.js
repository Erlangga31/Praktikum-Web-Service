const DEFAULT_TARGETS = [
  { name: 'gateway', url: process.env.GATEWAY_URL || 'http://localhost:8080' },
  { name: 'product-service', url: process.env.PRODUCT_URL || 'http://localhost:3000' },
  { name: 'order-service', url: process.env.ORDER_URL || 'http://localhost:3001' },
  { name: 'notification-service', url: process.env.NOTIFICATION_URL || 'http://localhost:3002' },
];
function loadTargets() {
  if (!process.env.MONITOR_TARGETS) return DEFAULT_TARGETS;
  const targets = JSON.parse(process.env.MONITOR_TARGETS);
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('MONITOR_TARGETS harus berupa array JSON yang tidak kosong');
  }
  for (const target of targets) {
    if (!target || typeof target.name !== 'string' || !target.name.trim()) {
      throw new Error('Setiap target MONITOR_TARGETS harus memiliki name');
    }
    if (typeof target.url !== 'string') {
      throw new Error(`Target ${target.name} harus memiliki url`);
    }
    const url = new URL(target.url);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`URL target ${target.name} harus menggunakan HTTP atau HTTPS`);
    }
  }
  if (new Set(targets.map((target) => target.name)).size !== targets.length) {
    throw new Error('Nama target MONITOR_TARGETS harus unik');
  }
  return targets;
}

const TARGETS = loadTargets();
const INTERVAL = Number(process.env.INTERVAL_MS) || 5000;
const last = {};

async function check(target) {
  const started = Date.now();
  try {
    const response = await fetch(`${target.url}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return { up: response.ok, ms: Date.now() - started };
  } catch (error) {
    return { up: false, ms: Date.now() - started };
  }
}

async function tick() {
  const results = await Promise.all(TARGETS.map(check));
  console.log(
    new Date().toISOString().slice(11, 19),
    TARGETS.map((target, index) => (
      `${target.name}=${results[index].up ? 'UP' : 'DOWN'}(${results[index].ms}ms)`
    )).join('  '),
  );

  TARGETS.forEach((target, index) => {
    const up = results[index].up;
    if (last[target.name] === true && !up) console.log(`ALERT: ${target.name} DOWN`);
    if (last[target.name] === false && up) console.log(`RECOVERED: ${target.name}`);
    last[target.name] = up;
  });
}

tick();
setInterval(tick, INTERVAL);
