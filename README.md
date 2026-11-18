# Toko Microservices

[![CI](https://git-eng.ukwms.ac.id/2627-web-service/09_Pemecahan_Elang/actions/workflows/ci.yml/badge.svg?branch=lab11)](https://git-eng.ukwms.ac.id/2627-web-service/09_Pemecahan_Elang/actions)

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
| Notification Service | 3002 | `http://localhost:3002/health` |
| API Gateway | 8080 | `http://localhost:8080/docs` |
| RabbitMQ AMQP | 5672 | digunakan oleh service melalui `AMQP_URL` |
| RabbitMQ Management | 15672 | dashboard broker |

RabbitMQ lokal dapat dijalankan dengan Docker Compose:

```powershell
docker compose up -d
```

Pastikan RabbitMQ aktif sebelum menjalankan Order Service dan Notification Service. Jika menggunakan broker cloud, atur `AMQP_URL` di masing-masing terminal service; jangan simpan URL atau password di repository.

Order Service memanggil Product Service untuk reservasi stok. Buat order lewat gateway dengan `POST http://localhost:8080/order-service/orders` dan JSON `{"productId":1,"qty":2}`. Endpoint gateway lainnya menggunakan prefix `/product-service` dan `/order-service`.

## Test dan monitoring

Jalankan dari root repository:

```powershell
npm test
```

`npm test` menyalakan Product Service, Order Service, dan Gateway pada port lokal yang tersedia, menjalankan test API dan test unit notification, memeriksa ID request yang sama pada log Order dan Product Service, lalu menghentikan service. Setiap eksekusi memakai proses dan stok baru, sehingga test dapat diulang tanpa menghabiskan stok dari proses sebelumnya. Dependency service harus sudah terpasang (`npm ci --prefix product-service`, `npm ci --prefix order-service`, `npm ci --prefix gateway`, dan `npm ci --prefix notification-service`). CI juga menyalakan RabbitMQ dan Notification Service, lalu menguji health endpoint-nya. Untuk menjalankan test API terhadap service yang sudah aktif, gunakan `npm run test:api` dan atur `BASE_URL` bila Gateway tidak berada di `http://localhost:8080`.

Untuk memantau health service secara berkala:

```powershell
node monitor.js
```

Endpoint `/health` tersedia di Gateway, Product Service, Order Service, dan Notification Service. Health Notification Service menjadi `503` sampai koneksi RabbitMQ dan consumer siap, lalu `200` saat siap. Health endpoint lainnya saat ini adalah liveness (service bisa merespons), bukan pemeriksaan kesiapan dependensinya.

Monitor memakai empat target contoh di atas. Untuk menggantinya dengan service proyek kelompok, atur `MONITOR_TARGETS` sebagai array JSON berisi nama dan URL health masing-masing service. Contoh PowerShell:

```powershell
$env:MONITOR_TARGETS='[{"name":"api-service","url":"http://localhost:4000"},{"name":"inventory-service","url":"http://localhost:4001"}]'
node monitor.js
```

Log request service berbentuk JSON dan membawa `id` yang diteruskan melalui header `X-Request-Id`.

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
| `PORT` | Product, Order, Notification, Gateway | `3000`, `3001`, `3002`, `8080` | Port HTTP service |
| `PRODUCT_SERVICE_URL` | Order | `http://localhost:3000` | Alamat Product Service |
| `AMQP_URL` | Order, Notification | `amqp://localhost` | URL koneksi RabbitMQ |
| `API_KEY` | Gateway | tidak aktif | Mengaktifkan autentikasi header `X-API-Key` untuk Product Service melalui gateway |
| `CATALOG_URL` | Gateway | `http://localhost:3000` | Target proxy prefix produk |
| `ORDER_URL` | Gateway | `http://localhost:3001` | Target proxy prefix pesanan |
| `MONITOR_TARGETS` | Monitor | empat target service contoh | Daftar target health proyek dalam JSON |
| `PRODUCT_DOC_URL` | Gateway | `http://localhost:3000/openapi.json` | Sumber spesifikasi Product Service |
| `ORDER_DOC_URL` | Gateway | `http://localhost:3001/openapi.json` | Sumber spesifikasi Order Service |
| `BASE_URL` | Ekspor OpenAPI | `http://localhost:8080` | Base URL gateway untuk `npm run export:openapi` |

## Continuous integration

Workflow untuk repository GitEng/Gitea berada di `.gitea/workflows/ci.yml`; workflow menyalakan RabbitMQ, memasang dependency keempat service, lalu menjalankan `npm test`, yang menguji API, consumer, health, dan korelasi ID. Workflow GitHub untuk mirror berada di `.github/workflows/ci.yml`. Badge di atas menaut ke halaman Actions GitEng pada branch `lab11`. Repository harus mengaktifkan Actions dan memiliki runner terdaftar agar run muncul; workflow belum dijalankan dari lingkungan lokal ini.
