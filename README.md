# Toko Microservices

Project praktikum dengan Product Service untuk data produk dan stok, Order Service untuk pesanan, API Gateway, serta RabbitMQ untuk event `order.created`.

## Menjalankan

Gunakan Node.js 18 atau lebih baru. Jalankan setiap perintah di terminal terpisah dari folder repository:

```powershell
npm run start:product
npm run start:orders
npm run start:notifications
npm run start:gateway
```

Port default:

| Service | Port | Dokumentasi |
|---|---:|---|
| Product Service | 3000 | `http://localhost:3000/docs` |
| Order Service | 3001 | `http://localhost:3001/docs` |
| API Gateway | 8080 | `http://localhost:8080/docs` |
| RabbitMQ AMQP | 5672 | digunakan oleh service melalui `AMQP_URL` |
| RabbitMQ Management | 15672 | dashboard broker |

RabbitMQ lokal dapat dijalankan dengan Docker Compose:

```powershell
docker compose up -d
```

Pastikan RabbitMQ aktif sebelum menjalankan Order Service dan Notification Service. Jika menggunakan broker cloud, atur `AMQP_URL` di masing-masing terminal service; jangan simpan URL atau password di repository.

Order Service memanggil Product Service untuk reservasi stok. Buat order lewat gateway dengan `POST http://localhost:8080/order-service/orders` dan JSON `{"productId":1,"qty":2}`. Endpoint gateway lainnya menggunakan prefix `/product-service` dan `/order-service`.

## OpenAPI

Masing-masing service menyajikan `/openapi.json` dan `/docs`. Gateway menggabungkan spesifikasi service saat diminta di `http://localhost:8080/openapi.json`, lalu Swagger UI tersedia di `http://localhost:8080/docs`.

Setelah Product Service, Order Service, dan Gateway berjalan, simpan spesifikasi gabungan ke root repository:

```powershell
npm run export:openapi
```

Jika gateway dikonfigurasi dengan API key, set `API_KEY` pada terminal gateway dan terminal ekspor. Variabel endpoint dokumentasi internal dapat diatur dengan `PRODUCT_DOC_URL` dan `ORDER_DOC_URL`.

## Variabel environment

| Variabel | Service | Default | Kegunaan |
|---|---|---|---|
| `PORT` | Product, Order, Gateway | `3000`, `3001`, `8080` | Port HTTP service |
| `PRODUCT_SERVICE_URL` | Order | `http://localhost:3000` | Alamat Product Service |
| `AMQP_URL` | Order, Notification | `amqp://localhost` | URL koneksi RabbitMQ |
| `API_KEY` | Gateway | tidak aktif | Mengaktifkan autentikasi header `X-API-Key` untuk Product Service melalui gateway |
| `CATALOG_URL` | Gateway | `http://localhost:3000` | Target proxy prefix produk |
| `ORDER_URL` | Gateway | `http://localhost:3001` | Target proxy prefix pesanan |
| `PRODUCT_DOC_URL` | Gateway | `http://localhost:3000/openapi.json` | Sumber spesifikasi Product Service |
| `ORDER_DOC_URL` | Gateway | `http://localhost:3001/openapi.json` | Sumber spesifikasi Order Service |
| `BASE_URL` | Ekspor OpenAPI | `http://localhost:8080` | Base URL gateway untuk `npm run export:openapi` |
