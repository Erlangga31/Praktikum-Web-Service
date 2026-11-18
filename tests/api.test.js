const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const headers = { 'Content-Type': 'application/json' };
if (process.env.API_KEY) headers['X-API-Key'] = process.env.API_KEY;

const get = (path) => fetch(BASE + path, { headers });
const post = (path, body, extraHeaders = {}) => fetch(BASE + path, {
  method: 'POST',
  headers: { ...headers, ...extraHeaders },
  body: JSON.stringify(body),
});

let createdOrder;

test('GET /products mengembalikan daftar produk dengan bentuk yang benar', async () => {
  const response = await get('/product-service/products');
  assert.equal(response.status, 200);
  const products = await response.json();
  assert.ok(Array.isArray(products) && products.length > 0);

  for (const product of products) {
    assert.equal(typeof product.id, 'number');
    assert.equal(typeof product.name, 'string');
    assert.equal(typeof product.price, 'number');
    assert.equal(typeof product.stock, 'number');
  }
});

test('GET /products/:id mengembalikan satu produk', async () => {
  const response = await get('/product-service/products/1');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, 1);
});

test('GET /products/:id untuk id tidak dikenal mengembalikan 404', async () => {
  const response = await get('/product-service/products/9999');
  assert.equal(response.status, 404);
  assert.ok((await response.json()).error);
});

test('POST /orders berhasil dan mengurangi stok produk', async () => {
  const beforeResponse = await get('/product-service/products/2');
  assert.equal(beforeResponse.status, 200);
  const before = await beforeResponse.json();
  assert.ok(before.stock >= 1, 'produk 2 harus memiliki stok untuk pengujian');

  const response = await post('/order-service/orders', { productId: 2, qty: 1 });
  assert.equal(response.status, 201);
  createdOrder = await response.json();
  assert.equal(createdOrder.productId, 2);
  assert.equal(createdOrder.qty, 1);
  assert.equal(createdOrder.total, before.price);

  const afterResponse = await get('/product-service/products/2');
  assert.equal(afterResponse.status, 200);
  assert.equal((await afterResponse.json()).stock, before.stock - 1);
});

test('POST /orders dengan qty melebihi stok mengembalikan 409', async () => {
  const response = await post('/order-service/orders', { productId: 2, qty: 100000 });
  assert.equal(response.status, 409);
});

test('POST /orders dengan input tidak valid mengembalikan 400', async () => {
  const zeroQty = await post('/order-service/orders', { productId: 2, qty: 0 });
  const nonNumericQty = await post('/order-service/orders', { productId: 2, qty: 'abc' });
  assert.equal(zeroQty.status, 400);
  assert.equal(nonNumericQty.status, 400);
});

test('POST /orders untuk produk tidak dikenal mengembalikan 404', async () => {
  const response = await post('/order-service/orders', { productId: 9999, qty: 1 });
  assert.equal(response.status, 404);
});

test('GET /orders memuat pesanan yang baru dibuat', async () => {
  assert.ok(createdOrder, 'test pembuatan order harus berhasil lebih dulu');
  const response = await get('/order-service/orders');
  assert.equal(response.status, 200);
  const orders = await response.json();
  assert.ok(orders.some((order) => order.id === createdOrder.id));
});

for (const [service, path] of [
  ['gateway', '/health'],
  ['product-service', '/product-service/health'],
  ['order-service', '/order-service/health'],
]) {
  test(`GET ${path} mengembalikan status sehat untuk ${service}`, async () => {
    const response = await get(path);
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.status, 'ok');
  });
}

if (process.env.NOTIFICATION_URL) {
  test('GET /health mengembalikan status sehat untuk notification-service', async () => {
    const response = await fetch(`${process.env.NOTIFICATION_URL}/health`);
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.status, 'ok');
  });
}

test('POST /orders mengembalikan X-Request-Id', async () => {
  const requestId = process.env.CORRELATION_REQUEST_ID || `test-${randomUUID()}`;
  const response = await post(
    '/order-service/orders',
    { productId: 2, qty: 1 },
    { 'X-Request-Id': requestId },
  );
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-request-id'), requestId);
});
