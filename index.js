const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const { saveSantriData, getListSantri } = require('./sheets');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Variabel untuk menyimpan base64 image dari QR code terbaru
let currentQR = null;
let isReady = false;

// Endpoint pancingan untuk UptimeRobot agar Render tidak tertidur
app.get('/', (req, res) => {
    if (isReady) {
        res.send('<h1>Bot WhatsApp Aktif dan Berjalan! 🟢</h1><p>Mesin ini dijaga agar tetap bangun oleh UptimeRobot.</p>');
    } else {
        res.send('<h1>Bot WhatsApp Sedang Memulai... ⏳</h1><p>Jika bot meminta QR Code, buka <a href="/qr">/qr</a> untuk scan.</p>');
    }
});

// Endpoint untuk menampilkan QR code di browser
app.get('/qr', (req, res) => {
    if (isReady) {
        res.send('<h1>Bot sudah login! Tidak perlu scan QR lagi.</h1>');
    } else if (currentQR) {
        res.send(`
            <h2>Silakan Scan QR Code ini dengan WhatsApp Anda</h2>
            <p>Gambar akan otomatis me-refresh halaman ini setiap 5 detik jika Anda belum scan.</p>
            <img src="${currentQR}" alt="QR Code" />
            <script>
                setTimeout(() => {
                    location.reload();
                }, 5000);
            </script>
        `);
    } else {
        res.send('<h2>QR Code belum siap atau sedang dimuat. Silakan refresh (F5) beberapa detik lagi...</h2>');
    }
});

app.listen(PORT, () => {
    console.log(`Server Express berjalan di port ${PORT} (Anti-sleep aktif)`);
});

// Inisialisasi Bot WhatsApp
async function startBot() {
    let authStrategy;

    // Cek apakah user menggunakan MongoDB untuk penyimpanan sesi permanen
    if (process.env.MONGODB_URI) {
        console.log('Menghubungkan ke MongoDB untuk sesi permanen...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB terhubung!');
        
        const store = new MongoStore({ mongoose: mongoose });
        authStrategy = new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000
        });
    } else {
        console.log('MONGODB_URI tidak ditemukan. Menggunakan penyimpanan sesi lokal (LocalAuth).');
        authStrategy = new LocalAuth();
    }

    const puppeteerOptions = {
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Sangat penting untuk Termux (Android)
            '--disable-gpu'
        ], // Wajib untuk server Linux/Render/Termux
    };
    
    // Gunakan executable custom jika ada di environment variable
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } 
    // Deteksi otomatis jika berjalan di dalam Termux Android (tanpa perlu export)
    else if (process.env.PREFIX && process.env.PREFIX.includes('com.termux')) {
        puppeteerOptions.executablePath = '/data/data/com.termux/files/usr/bin/chromium-browser';
    }

    const client = new Client({
        authStrategy: authStrategy,
        puppeteer: puppeteerOptions
    });

    client.on('qr', async (qr) => {
        // Tampilkan di terminal lokal
        qrcodeTerminal.generate(qr, { small: true });
        console.log('Silakan scan QR code di atas, atau buka URL web (http://localhost:' + PORT + '/qr) untuk scan.');
        
        // Simpan sebagai Base64 untuk ditampilkan di web (/qr)
        currentQR = await qrcode.toDataURL(qr);
        
        // Simpan juga ke file gambar untuk ditampilkan di obrolan Gemini (lokal)
        try {
            const artifactPath = path.join('C:\\Users\\HP\\.gemini\\antigravity\\brain\\ec3493fe-3130-4323-bcc2-23ea0a23c993', 'qr-code-v2.png');
            await qrcode.toFile(artifactPath, qr);
        } catch (err) {}
    });

    client.on('ready', () => {
        isReady = true;
        currentQR = null; // Hapus QR dari memori setelah login
        console.log('Bot WhatsApp sudah siap dan berjalan!');
    });

    client.on('remote_session_saved', () => {
        console.log('Sesi WhatsApp berhasil dicadangkan ke MongoDB!');
    });

    // Variabel untuk melacak user yang sedang dalam masa jeda (Anti-Spam)
    const userCooldowns = new Set();
    const COOLDOWN_TIME_MS = 3000; // Jeda 3 detik setiap balasan

    client.on('message', async (msg) => {
        if (msg.fromMe) return;

        const chat = await msg.getChat();
        
        // Cek apakah pesan berasal dari grup
        if (chat.isGroup) {
            const mentions = await msg.getMentions();
            const isMentioned = mentions.some(contact => contact.isMe);
            if (!isMentioned) {
                return; // Abaikan pesan grup yang tidak me-mention bot
            }
        }

        // Fitur Anti-Spam (Rate Limiter)
        if (userCooldowns.has(msg.from)) {
            console.log(`[Anti-Spam] Mengabaikan spam dari: ${msg.from}`);
            return; // Abaikan pesan jika user spam
        }

        // Masukkan user ke daftar antrean cooldown
        userCooldowns.add(msg.from);
        setTimeout(() => {
            userCooldowns.delete(msg.from); // Bebaskan user setelah 3 detik
        }, COOLDOWN_TIME_MS);

        // Helper untuk membalas dengan efek "sedang mengetik..." seperti manusia
        const replyHuman = async (text) => {
            await chat.sendStateTyping();
            // Jeda acak antara 1,5 sampai 3 detik
            const delay = Math.floor(Math.random() * 1500) + 1500;
            await new Promise(resolve => setTimeout(resolve, delay));
            await msg.reply(text);
        };

        let text = msg.body.trim();
        
        // Jika di grup, bersihkan teks dari "tag/mention" (@nomor_bot) agar tidak merusak format parsing
        if (chat.isGroup && client.info && client.info.wid) {
            const botNumber = client.info.wid.user;
            text = text.replace(new RegExp(`@${botNumber}\\b`, 'g'), '').trim();
        }

        const lines = text.split('\n').map(line => line.trim());
        
        // Pengecekan dibuat lebih fleksibel menggunakan includes
        // agar walau ada sisa kata lain dari mention, tetap terdeteksi
        if (text.toUpperCase().includes('LIST SANTRI')) {
            await replyHuman('Sedang mengambil daftar santri dari database, mohon tunggu sebentar...');
            const listText = await getListSantri();
            await replyHuman(listText);
            return;
        }

        // Logika Pendaftaran Khusus Grup (Format Pendek: Nama, Tanggal Lahir)
        if (chat.isGroup) {
            if (!text) return; // Jika cuma mention kosong
            
            const parts = text.split(',');
            if (parts.length === 2) {
                const nama = parts[0].trim();
                const tanggalLahir = parts[1].trim();

                // Pastikan keduanya ada isinya
                if (nama && tanggalLahir) {
                    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
                    
                    await replyHuman('Sedang memproses data Anda, mohon tunggu sebentar...');
                    
                    const success = await saveSantriData(waktu, nama, tanggalLahir);
                    if (success) {
                        await replyHuman(`Terima kasih! Data Anda telah berhasil disimpan sebagai santri.\n\nNama: ${nama}\nTanggal Lahir: ${tanggalLahir}`);
                    } else {
                        await replyHuman('Maaf, terjadi kesalahan saat menyimpan data ke sistem kami. Silakan coba lagi nanti.');
                    }
                }
            }
            
            // Karena di grup, kita akhiri proses di sini (diam jika format salah)
            return;
        }

        // Logika Pendaftaran Khusus Jalur Pribadi (Japri) dengan Format Lengkap
        const namaLine = lines.find(line => line.toUpperCase().startsWith('NAMA LENGKAP'));
        const tglLine = lines.find(line => line.toUpperCase().startsWith('TANGGAL LAHIR'));

        if (namaLine && tglLine) {
            const namaParts = namaLine.split(':');
            const tglParts = tglLine.split(':');

            if (namaParts.length >= 2 && tglParts.length >= 2) {
                const nama = namaParts.slice(1).join(':').trim();
                const tanggalLahir = tglParts.slice(1).join(':').trim();

                if (nama && tanggalLahir) {
                    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
                    
                    await replyHuman('Sedang memproses data Anda, mohon tunggu sebentar...');
                    
                    const success = await saveSantriData(waktu, nama, tanggalLahir);
                    if (success) {
                        await replyHuman(`Terima kasih! Data Anda telah berhasil disimpan sebagai santri.\n\nNama: ${nama}\nTanggal Lahir: ${tanggalLahir}`);
                    } else {
                        await replyHuman('Maaf, terjadi kesalahan saat menyimpan data ke sistem kami. Silakan coba lagi nanti.');
                    }
                } else {
                    if (!chat.isGroup) await replyHuman('Format pengisian salah. Pastikan Anda menuliskan nama dan tanggal lahir setelah tanda titik dua (:).');
                }
            } else {
                if (!chat.isGroup) await replyHuman('Format yang Anda masukkan salah. Pastikan menggunakan tanda titik dua (:) sebagai pemisah.\n\nContoh:\nNama Lengkap : Ahmad Zulfikar\nTanggal Lahir : 09-12-1996');
            }
        } else if (text.toUpperCase().includes('NAMA LENGKAP') || text.toUpperCase().includes('TANGGAL LAHIR')) {
             if (!chat.isGroup) await replyHuman('Format pendaftaran belum lengkap. Pastikan Anda mengirimkan baris "Nama Lengkap :" dan "Tanggal Lahir :" dalam satu pesan yang sama.\n\nContoh:\nNama Lengkap : Ahmad Zulfikar\nTanggal Lahir : 09-12-1996');
        } else {
            if (!chat.isGroup) await replyHuman('Assalamualaikum!\nSelamat datang di chatbot pendaftaran Santri PTQ At-Tibyan.\nUntuk mendaftar, silakan kirim data diri Anda dengan format persis seperti di bawah ini:\n\nNama Lengkap : \nTanggal Lahir : \n\nContoh:\nNama Lengkap : Ahmad Zulfikar\nTanggal Lahir : 09-12-1996');
        }
    });

    client.initialize();
}

startBot().catch(console.error);
