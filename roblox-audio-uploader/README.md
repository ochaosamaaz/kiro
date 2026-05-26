# Roblox Audio Uploader

Tool untuk download lagu dari YouTube atau sumber lain dan upload langsung ke Roblox.

![Preview](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=flat-square&logo=tailwindcss)

## Fitur

- **Download dari YouTube** - Paste URL YouTube untuk mengambil audio
- **Upload file langsung** - Support MP3 dan OGG file
- **Upload ke Roblox** - Langsung upload ke akun Roblox Anda menggunakan Open Cloud API
- **UI Modern** - Interface yang clean dan mudah digunakan

## Cara Mendapatkan Roblox API Key

1. Buka [Roblox Creator Hub](https://create.roblox.com/credentials)
2. Login dengan akun Roblox Anda
3. Klik **"Create API Key"**
4. Isi nama (contoh: "Audio Uploader")
5. Di bagian **API Systems**, pilih:
   - **Assets API** - centang **Read** dan **Write**
6. Di bagian **Accepted IP Addresses**, masukkan:
   - `0.0.0.0/0` (untuk development) atau IP server Anda
7. Di bagian **Accepted User IDs**, masukkan User ID Roblox Anda
8. Klik **"Save & Generate Key"**
9. Copy API Key yang muncul

## Cara Mendapatkan User ID Roblox

1. Buka profil Roblox Anda di browser
2. Lihat URL-nya, contoh: `https://www.roblox.com/users/123456789/profile`
3. Angka `123456789` adalah User ID Anda

## Instalasi

### Prerequisites

- Node.js 18+ 
- npm atau yarn
- FFmpeg (untuk konversi audio)

### Setup

```bash
# Clone atau download project
cd roblox-audio-uploader

# Install dependencies
npm install

# Jalankan development server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser Anda.

## Deployment

### Deploy ke Vercel (Recommended)

1. Push code ke GitHub
2. Buka [Vercel](https://vercel.com)
3. Import repository dari GitHub
4. Deploy otomatis!

### Deploy Manual

```bash
# Build production
npm run build

# Start production server
npm start
```

## Struktur Project

```
roblox-audio-uploader/
├── src/
│   └── app/
│       ├── api/
│       │   ├── download/     # API untuk download audio
│       │   │   └── route.ts
│       │   └── upload/       # API untuk upload ke Roblox
│       │       └── route.ts
│       ├── globals.css       # Styles
│       ├── layout.tsx        # Root layout
│       └── page.tsx          # Main page
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── next.config.js
```

## Penggunaan

### Metode 1: Download dari YouTube

1. Paste URL YouTube di input field
2. Klik "Download dari URL"
3. Tunggu proses download selesai
4. Masukkan API Key dan User ID Roblox
5. Klik "Upload ke Roblox"
6. Selesai! Copy Asset ID yang muncul

### Metode 2: Upload File Langsung

1. Klik "Pilih File Audio"
2. Pilih file MP3 atau OGG dari komputer
3. Masukkan API Key dan User ID Roblox
4. Klik "Upload ke Roblox"
5. Selesai! Copy Asset ID yang muncul

## Menggunakan Audio di Roblox Studio

Setelah upload berhasil, Anda akan mendapat Asset ID. Gunakan di Roblox Studio:

```lua
-- Di Sound object
local sound = Instance.new("Sound")
sound.SoundId = "rbxassetid://YOUR_ASSET_ID"
sound.Parent = workspace
sound:Play()
```

## Batasan Roblox Audio

- **Durasi maksimal**: 7 menit (420 detik) untuk user biasa
- **Ukuran file**: Maksimal 19.5 MB
- **Format**: MP3 atau OGG disarankan
- **Konten**: Harus sesuai dengan Roblox Community Guidelines

## Troubleshooting

### Error "API Key tidak valid"
- Pastikan API Key sudah benar dan belum expired
- Cek apakah User ID sudah ditambahkan di API Key permissions

### Error "Permission denied"
- Pastikan Assets API sudah diaktifkan dengan permission Write
- Pastikan IP address sudah di-whitelist

### Error "File terlalu besar"
- Compress file audio Anda
- Gunakan format OGG yang lebih kecil

### Audio tidak muncul di Roblox
- Tunggu beberapa menit, moderasi audio membutuhkan waktu
- Cek di [Creator Dashboard](https://create.roblox.com/creations) > Audio

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Audio Processing**: ytdl-core, fluent-ffmpeg
- **API**: Roblox Open Cloud API

## License

MIT License - bebas digunakan dan dimodifikasi

## Disclaimer

Tool ini dibuat untuk tujuan edukasi. Pastikan Anda memiliki hak untuk menggunakan audio yang Anda upload. Tidak untuk penggunaan ilegal atau melanggar hak cipta.
