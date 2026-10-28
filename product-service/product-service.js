const express = require('express');

const app = express();
app.use(express.json());

const products = [
  { id: 1, name: 'Keripik Tempe', price: 15000, stock: 10 },
  { id: 2, name: 'Batik Tulis', price: 250000, stock: 25 },
  { id: 3, name: 'Kopi Lokal', price: 85000, stock: 12 },
];

app.get('/', (req, res) => res.json({ service: 'product-service', status: 'ok' }));
app.get('/products', (req, res) => res.json(products));
app.get('/products/:id', (req, res) => {
  const product = products.find((item) => item.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });
  res.json(product);
});

app.post('/products/:id/reserve', (req, res) => {
  const product = products.find((item) => item.id === Number(req.params.id));
  const { qty } = req.body || {};
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: 'qty tidak valid' });
  }
  if (product.stock < qty) return res.status(409).json({ error: 'Stok tidak cukup' });

  product.stock -= qty;
  res.json(product);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`product-service berjalan di port ${port}`));
