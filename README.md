# ASOS - Server Management Panel

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.2-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

Cloudron benzeri bir self-hosted domain/mail yönetim paneli. Docker ile uygulama yükleme, domain yönetimi, e-posta hesapları ve sistem izleme özellikleri içerir.

## ✨ Özellikler

- 🌐 **Domain Yönetimi**: Domain ekleme, DNS doğrulama, SSL sertifikası
- 📧 **E-posta Yönetimi**: Postfix/Dovecot ile sanal e-posta hesapları
- 📦 **Uygulama Mağazası**: Docker ile tek tıkla uygulama kurulumu
- 🐳 **Docker Yönetimi**: Container, image, network ve volume yönetimi
- 🖥️ **Sistem İzleme**: CPU, RAM, Disk kullanımı ve servis durumları
- 🔐 **Güvenlik**: JWT tabanlı kimlik doğrulama, rol bazlı yetkilendirme
- 🔥 **Firewall**: UFW firewall yönetimi
- 🎨 **Modern UI**: EJS + Bootstrap 5 ile responsive arayüz

## 📋 Gereksinimler

- Ubuntu 20.04+ veya Debian 11+
- Root erişimi
- En az 1GB RAM (2GB önerilir)
- En az 10GB disk alanı

## 🚀 Hızlı Kurulum

Tek komutla kurulum (Cloudron tarzı):

```bash
wget -qO- https://raw.githubusercontent.com/USER/asos/main/asos-setup | sudo bash
```

veya curl ile:

```bash
curl -sL https://raw.githubusercontent.com/USER/asos/main/asos-setup | sudo bash
```

### Adım Adım Kurulum

```bash
# 1. Script'i indirin
wget https://raw.githubusercontent.com/USER/asos/main/asos-setup

# 2. Çalıştırılabilir yapın
chmod +x asos-setup

# 3. Kurulumu başlatın
sudo ./asos-setup
```

Kurulum interaktif olarak size aşağıdaki bilgileri soracak:
- Ana domain (örn: panel.example.com)
- Admin e-posta adresi
- Admin şifresi
- MongoDB URI (opsiyonel, boş bırakırsanız lokal kurulum yapılır)
- SSL sertifikası kurulumu (opsiyonel)

### Manuel Kurulum

```bash
# Projeyi klonlayın
git clone https://github.com/USER/asos.git /opt/asos
cd /opt/asos

# Bağımlılıkları yükleyin
npm install

# .env dosyasını oluşturun
cp .env.example .env
nano .env

# Servisi başlatın
npm start
```

## Kurulum Sonrası

Kurulum tamamlandıktan sonra:

1. **DNS Ayarları**: Domain'inizi sunucu IP'sine yönlendirin
2. **Panel Erişimi**: `http://your-domain.com` adresine gidin
3. **SSL (Opsiyonel)**: `sudo certbot --nginx -d your-domain.com`

## Yapılandırma

`.env` dosyasında aşağıdaki değişkenleri ayarlayın:

```env
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/asos
JWT_SECRET=your-secret-key
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-admin-password
PRIMARY_DOMAIN=example.com
```

## Servis Yönetimi

```bash
# Servisi başlat
sudo systemctl start asos

# Servisi durdur
sudo systemctl stop asos

# Servisi yeniden başlat
sudo systemctl restart asos

# Servis durumunu kontrol et
sudo systemctl status asos

# Logları görüntüle
sudo journalctl -u asos -f
```

## API Endpoints

### Kimlik Doğrulama
- `POST /api/auth/login` - Giriş yap
- `GET /api/auth/profile` - Profil bilgisi
- `GET /api/auth/users` - Kullanıcı listesi (Admin)
- `POST /api/auth/users` - Kullanıcı oluştur (Admin)

### Domainler
- `GET /api/domains` - Domain listesi
- `POST /api/domains` - Domain ekle
- `DELETE /api/domains/:id` - Domain sil
- `POST /api/domains/:id/verify` - DNS doğrula
- `POST /api/domains/:id/ssl` - SSL kur

### E-posta
- `GET /api/mail` - E-posta hesapları
- `POST /api/mail` - Hesap oluştur
- `DELETE /api/mail/:id` - Hesap sil

### Uygulamalar
- `GET /api/apps` - Uygulama listesi
- `POST /api/apps/:id/install` - Uygulama yükle
- `DELETE /api/apps/installed/:id` - Uygulama kaldır
- `POST /api/apps/installed/:id/start` - Başlat
- `POST /api/apps/installed/:id/stop` - Durdur

### Docker
- `GET /api/docker/containers` - Container listesi
- `POST /api/docker/containers/:id/start` - Başlat
- `POST /api/docker/containers/:id/stop` - Durdur
- `GET /api/docker/images` - Image listesi
- `GET /api/docker/networks` - Network listesi
- `GET /api/docker/volumes` - Volume listesi

### Sistem
- `GET /api/system/info` - Sistem bilgisi
- `GET /api/system/cpu` - CPU kullanımı
- `GET /api/system/memory` - RAM kullanımı
- `GET /api/system/disk` - Disk kullanımı
- `GET /api/system/services` - Servis durumları
- `POST /api/system/update` - Sistem güncelle
- `POST /api/system/reboot` - Yeniden başlat

## Proje Yapısı

```
asos/
├── src/
│   ├── controllers/       # İş mantığı
│   │   ├── AuthController.js
│   │   ├── DomainController.js
│   │   ├── MailController.js
│   │   ├── DockerController.js
│   │   ├── SystemController.js
│   │   └── AppsController.js
│   ├── middleware/        # Ara katman
│   │   └── auth.js
│   ├── models/           # Veritabanı modelleri
│   │   ├── User.js
│   │   ├── Domain.js
│   │   ├── MailAccount.js
│   │   ├── App.js
│   │   └── InstalledApp.js
│   ├── routes/           # API rotaları
│   │   ├── auth.js
│   │   ├── domains.js
│   │   ├── mail.js
│   │   ├── docker.js
│   │   ├── system.js
│   │   └── apps.js
│   ├── utils/            # Yardımcı fonksiyonlar
│   │   └── logger.js
│   └── server.js         # Ana uygulama
├── public/               # Frontend dosyaları
│   ├── css/
│   ├── js/
│   └── index.html
├── asos.sh              # Kurulum scripti
├── package.json
├── .env.example
└── README.md
```

## Güvenlik

- Tüm API endpoint'leri JWT ile korunmaktadır
- Admin işlemleri için ek yetkilendirme gereklidir
- Şifreler bcrypt ile hash'lenir
- HTTPS kullanımı önerilir (Let's Encrypt)
- Rate limiting uygulanabilir

## Lisans

MIT License

## Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın
