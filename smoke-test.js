const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const headers = { 'Content-Type': 'application/json' };
if (process.env.API_KEY) headers['X-API-Key'] = process.env.API_KEY;

async function request(path, options) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`Gateway mengembalikan respons bukan JSON (${response.status}): ${text}`);
  }
  return { response, body };
}

(async () => {
  const { response: listResponse, body: products } = await request(
    '/product-service/products',
    { headers },
  );
  if (!listResponse.ok || !Array.isArray(products)) {
    throw new Error(`Daftar produk gagal: ${listResponse.status}`);
  }
  console.log('jumlah produk:', products.length);

  const product = products.find((item) => item.id === 1);
  if (!product || product.stock < 2) throw new Error('Stok produk 1 tidak cukup untuk smoke test');

  const { response: orderResponse, body: order } = await request(
    '/order-service/orders',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ productId: 1, qty: 2 }),
    },
  );
  console.log('buat order:', orderResponse.status, order);
  if (orderResponse.status !== 201) throw new Error(`Order gagal: ${orderResponse.status}`);

  const { response: productResponse, body: updatedProduct } = await request(
    '/product-service/products/1',
    { headers },
  );
  if (!productResponse.ok || updatedProduct.stock !== product.stock - 2) {
    throw new Error('Stok produk tidak berkurang sesuai jumlah pesanan');
  }
  console.log('stok produk 1 sekarang:', updatedProduct.stock);
})().catch((error) => {
  console.error('Smoke test gagal:', error.message);
  process.exitCode = 1;
});
