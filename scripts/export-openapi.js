const fs = require('node:fs/promises');
const path = require('node:path');

const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
const headers = process.env.API_KEY ? { 'X-API-Key': process.env.API_KEY } : {};

(async () => {
  const response = await fetch(`${baseUrl}/openapi.json`, { headers });
  if (!response.ok) {
    throw new Error(`Gateway mengembalikan HTTP ${response.status}`);
  }

  const spec = await response.json();
  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    throw new Error('Spesifikasi kosong; pastikan Product Service dan Order Service berjalan');
  }

  const output = path.join(__dirname, '..', 'openapi.json');
  await fs.writeFile(output, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  console.log(`OpenAPI berhasil disimpan ke ${output}`);
})().catch((error) => {
  console.error('Gagal mengekspor OpenAPI:', error.message);
  process.exitCode = 1;
});
