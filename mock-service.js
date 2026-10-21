const express = require('express');

const [name, port] = process.argv.slice(2);

if (!['catalog', 'order'].includes(name) || !port || !Number.isInteger(Number(port))) {
  console.error('Usage: node mock-service.js <catalog|order> <port>');
  process.exit(1);
}

const app = express();
const data = {
  catalog: [
    { id: 1, name: 'Keripik Tempe', price: 15000 },
    { id: 2, name: 'Batik Tulis', price: 250000 },
  ],
  order: [{ id: 1, productId: 1, qty: 2, status: 'PENDING' }],
};

app.get('/', (req, res) => res.json({ service: name, status: 'ok' }));
app.get(name === 'catalog' ? '/products' : '/orders', (req, res) => res.json(data[name]));

app.listen(Number(port), () => console.log(`${name} jalan di port ${port}`));
