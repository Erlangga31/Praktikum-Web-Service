# Toko Microservices

[![CI](https://github.com/Erlangga31/Praktikum-Web-Service/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Erlangga31/Praktikum-Web-Service/actions/workflows/ci.yml)

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

Pastikan RabbitMQ aktif sebelum menjalankan Order Service dan Notification Service secara manual. Untuk menjalankan broker bersama seluruh aplikasi gunakan bagian Docker Compose di bawah. Jika menggunakan broker cloud, atur `AMQP_URL` di masing-masing terminal service; jangan simpan URL atau password di repository.

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

## Menjalankan dengan Docker Compose

Prasyarat: Docker Desktop aktif dan mendukung Docker Compose v2. Buat file konfigurasi lokal yang tidak di-commit:

```powershell
Copy-Item .env.example .env
```

Isi `RABBITMQ_USER` dan `RABBITMQ_PASSWORD` di `.env` dengan kredensial lokal yang tidak dipakai di produksi. Gunakan karakter alfanumerik untuk menghindari masalah encoding URL. File `.env` diabaikan Git; jangan memasukkan kredensial produksi ke repository. Untuk produksi, berikan rahasia melalui secret manager atau mekanisme secret platform deployment.

Bangun dan jalankan seluruh stack dari root repository:

```powershell
docker compose up --build
```

Service berkomunikasi memakai nama service pada jaringan Compose: Order Service memakai `http://product-service:3000`, Gateway memakai `http://product-service:3000` dan `http://order-service:3001`, sementara Order dan Notification memakai broker `rabbitmq`. Hanya Gateway (`http://localhost:8080`) dan dashboard RabbitMQ (`http://localhost:15672`) yang dipublikasikan ke host; port Product, Order, dan AMQP tetap internal. `depends_on` menunggu dependency berstatus healthy sebelum menyalakan service yang memerlukannya.

Di terminal lain, periksa status dan jalankan test ke stack Compose yang sedang hidup:

```powershell
docker compose ps
$env:BASE_URL = 'http://localhost:8080'
npm test
```

Notification Service tidak mempublikasikan port ke host; status sehatnya diperiksa oleh Docker Compose melalui health check di dalam container.

Untuk latihan kegagalan dan pemulihan:

```powershell
docker compose stop product-service
```

Kirim `POST` ke `http://localhost:8080/order-service/orders` dengan body `{"productId":1,"qty":1}`; respons yang diharapkan `503`. Nyalakan kembali Product Service dan tunggu statusnya healthy:

```powershell
docker compose start product-service
docker compose ps
```

Kirim POST yang sama lagi; respons yang diharapkan `201`. Hentikan stack dengan `docker compose down`. RabbitMQ memakai named volume, tetapi produk dan pesanan disimpan di memori sehingga kembali ke data awal ketika container dibuat ulang. Sistem nyata memerlukan database atau penyimpanan persisten yang sesuai.

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
| `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | Compose | wajib di `.env` lokal | Kredensial RabbitMQ lokal; jangan gunakan sebagai rahasia produksi |
| `API_KEY` | Gateway | tidak aktif | Mengaktifkan autentikasi header `X-API-Key` untuk Product Service melalui gateway |
| `PRODUCT_SERVICE_URL` | Gateway | `http://localhost:3000` | Target proxy prefix produk |
| `ORDER_SERVICE_URL` | Gateway | `http://localhost:3001` | Target proxy prefix pesanan |
| `MONITOR_TARGETS` | Monitor | empat target service contoh | Daftar target health proyek dalam JSON |
| `PRODUCT_DOC_URL` | Gateway | `http://localhost:3000/openapi.json` | Sumber spesifikasi Product Service |
| `ORDER_DOC_URL` | Gateway | `http://localhost:3001/openapi.json` | Sumber spesifikasi Order Service |
| `BASE_URL` | Test, Ekspor OpenAPI | `http://localhost:8080` | Base URL Gateway untuk test API dan ekspor OpenAPI |

## Continuous integration

GitHub Actions di `.github/workflows/ci.yml` membangun dan menyalakan seluruh stack menggunakan `docker compose up -d --build --wait`, menjalankan `npm test` terhadap Gateway dan Notification Service Compose, menampilkan log, lalu menghentikan stack. Badge di atas menampilkan status workflow branch `main`.
