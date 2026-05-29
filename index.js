const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const { saveSantriData, getListSantri, getSantriArray } = require('./sheets');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

let currentQR = null;
let isReady = false;

app.get('/', (req, res) => {
    if (isReady) {
        res.send('<h1>Bot WhatsApp Aktif dan Berjalan! 🟢</h1><p>Mesin ini dijaga agar tetap bangun oleh UptimeRobot.</p>');
    } else {
        res.send('<h1>Bot WhatsApp Sedang Memulai... ⏳</h1><p>Jika bot meminta QR Code, buka <a href="/qr">/qr</a> untuk scan.</p>');
    }
});

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

const userSessions = {};
const ADMIN_NUMBERS = ['6285888892326@c.us', '628816604554@c.us'];

// Chat AI via OpenRouter
async function chatWithAI(userMessage) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return 'Maaf, fitur AI belum dikonfigurasi oleh admin.';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openrouter/owl-alpha',
        messages: [
          {
            role: 'system',
            content: 'Kamu adalah asisten AI yang cerdas dan ramah. Jawab semua pertanyaan dengan bahasa Indonesia yang baik dan informatif. Kamu bisa membahas topik apa saja.'
          },
          {
            role: 'user',
            content: userMessage
          }
        ]
      })
    });

    const data = await response.json();

    if (data.choices && data.choices[0] && data.choices[0].message) {
      return formatForWhatsApp(data.choices[0].message.content);
    } else {
      console.error('OpenRouter response error:', JSON.stringify(data));
      return 'Maaf, AI sedang tidak bisa merespons saat ini. Silakan coba lagi nanti.';
    }
  } catch (error) {
    console.error('Error calling OpenRouter:', error);
    return 'Maaf, terjadi kesalahan saat menghubungi AI. Silakan coba lagi nanti.';
  }
}

// Konversi format Markdown AI → format WhatsApp
function formatForWhatsApp(text) {
  if (!text) return '';

  let result = text;

  // ### Header / ## Header / # Header → *Header* (bold di WA)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // **bold** → *bold* (WA pakai single asterisk)
  result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // __bold__ → *bold*
  result = result.replace(/__(.+?)__/g, '*$1*');

  // *italic* yang tersisa (bukan bold) → _italic_ (WA pakai underscore)
  // Skip ini karena single * di markdown = italic, tapi di WA = bold. Biarkan saja.

  // `inline code` → tetap (WA tidak support, hapus backtick saja)
  result = result.replace(/`([^`]+)`/g, '$1');

  // ```code block``` → hapus triple backtick
  result = result.replace(/```[\w]*\n?([\s\S]*?)```/g, '$1');

  // - list → • list
  result = result.replace(/^[\-\*]\s+/gm, '• ');

  // Bersihkan double bold yang terjadi akibat konversi ganda *(*text*)* → *text*
  result = result.replace(/\*{2,}/g, '*');

  return result.trim();
}

async function startBot() {
    let authStrategy;

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
            '--single-process',
            '--disable-gpu'
        ],
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else if (process.env.PREFIX && process.env.PREFIX.includes('com.termux')) {
        puppeteerOptions.executablePath = '/data/data/com.termux/files/usr/bin/chromium-browser';
    }

    const client = new Client({
        authStrategy: authStrategy,
        puppeteer: puppeteerOptions
    });

    client.on('qr', async (qr) => {
        qrcodeTerminal.generate(qr, { small: true });
        console.log('Silakan scan QR code di atas, atau buka URL web (http://localhost:' + PORT + '/qr) untuk scan.');
        currentQR = await qrcode.toDataURL(qr);

        try {
            const artifactPath = path.join('C:\\Users\\hp_3R\\.gemini\\antigravity\\brain\\ec3493fe-3130-4323-bcc2-23ea0a23c993', 'qr-code-v2.png');
            await qrcode.toFile(artifactPath, qr);
        } catch (err) { }
    });

    client.on('ready', () => {
        isReady = true;
        currentQR = null;
        console.log('Bot WhatsApp sudah siap dan berjalan!');
    });

    client.on('remote_session_saved', () => {
        console.log('Sesi WhatsApp berhasil dicadangkan ke MongoDB!');
    });

    const userCooldowns = new Set();
    const COOLDOWN_TIME_MS = 3000;

    client.on('message', async (msg) => {
        if (msg.fromMe) return;

        const chat = await msg.getChat();

        if (chat.isGroup) {
            const mentions = await msg.getMentions();
            const isMentioned = mentions.some(contact => contact.isMe);
            if (!isMentioned) {
                return;
            }
        }

        if (userCooldowns.has(msg.from)) {
            console.log(`[Anti-Spam] Mengabaikan spam dari: ${msg.from}`);
            return;
        }

        userCooldowns.add(msg.from);
        setTimeout(() => {
            userCooldowns.delete(msg.from);
        }, COOLDOWN_TIME_MS);

        const replyHuman = async (text) => {
            await chat.sendStateTyping();
            const delay = Math.floor(Math.random() * 1500) + 1500;
            await new Promise(resolve => setTimeout(resolve, delay));
            await msg.reply(text);
        };

        let text = msg.body.trim();

        if (chat.isGroup) {
            text = text.replace(/@\d+/g, '').trim();
        }

        const lines = text.split('\n').map(line => line.trim());
        const textUpper = text.toUpperCase();


        // CEK SESSION AI CHAT
        if (userSessions[msg.from] && userSessions[msg.from].mode === 'AI_CHAT') {
            if (textUpper === 'MENU' || textUpper === 'BATAL') {
                delete userSessions[msg.from];
                // Jangan return, biarkan jatuh ke logika MENU di bawah
            } else {
                await chat.sendStateTyping();
                const aiReply = await chatWithAI(text);
                await msg.reply(aiReply);
                return;
            }
        }

        const menuText = `Assalamualaikum! Selamat datang di ChatBot PTQ At-Tibyan.\n\n` +
            `*MENU UTAMA*\n\n` +
            `Silakan balas dengan *angka* menu yang ingin diakses:\n` +
            `1. Profil Pesantren\n` +
            `2. Kegiatan Pesantren\n` +
            `3. Informasi Biaya Pesantren\n` +
            `4. Pendaftaran Santri\n` +
            `5. Daftar Santri\n` +
            `6. Chat dengan AI 🤖\n\n` +
            `Balas dengan angka 1 - 6.`;

        if (['1', '2', '3', '4', '5', '6'].includes(textUpper)) {
            switch (textUpper) {
                case '1':
                    await replyHuman(`*PROFIL PESANTREN PTQ AT-TIBYAN*\n\nPesantren Tahfidz Qur'an At-Tibyan adalah lembaga pendidikan yang berfokus pada tahfidz Al-Qur'an dan pembentukan akhlak mulia. Misi kami adalah mencetak generasi penghafal Qur'an yang berwawasan luas dan berbudi pekerti luhur.\n\n*Pendiri:* KH Abdur Rouf Al-Hafidz\n*Pengasuh Saat Ini:* KH Jaza Abdul Ghoni Al-Hafidz\n*Lokasi:* Desa Laren, Kec. Bumiayu, Kab. Brebes, Jawa Tengah`);
                    return;
                case '2':
                    await replyHuman(`*KEGIATAN PESANTREN*\n\nKegiatan Harian Santri:\n04:30 - Sholat Subuh Berjamaah & Zikir\n05:00 - Halaqah Tahfidz (Sesi 1)\n06:00 - Mandi & Sarapan\n07:00 - Belajar di Madrasah\n12:00 - Sholat Dzuhur\n15:30 - Sholat Ashar & Halaqah Tahfidz (Sesi 2)\n17:00 - Kajian Kitab\n17:30 - Persiapan Maghrib & Makan Malam\n18:30 - Sholat Maghrib & Murojaah\n19:30 - Sholat Isya, Tadarus Binnadzor, Halaqah Tahfidz, dan Iqra\n21:00 - Istirahat Malam`);
                    return;
                case '3':
                    await replyHuman(`*INFORMASI BIAYA PESANTREN*\n\n1. Infaq Bangunan (sekali bayar): Rp 800.000\n2. Bulanan (asrama/makan/listrik/air): Rp 350.000\n\nUntuk detail lebih lanjut, silakan hubungi admin.`);
                    return;
                case '4':
                    await replyHuman('Untuk mendaftar, silakan kirim data diri Anda dengan format persis seperti di bawah ini:\n\nNama Lengkap : \nTanggal Lahir : \nAlamat : \n\nContoh:\nNama Lengkap : Ahmad Zulfikar\nTanggal Lahir : 09-12-1996\nAlamat : Laren Bumiayu');
                    return;
                case '5':
                    await replyHuman('Sedang mengambil daftar santri dari database, mohon tunggu sebentar...');
                    const listText = await getListSantri();
                    await replyHuman(listText);
                    return;
                case '6':
                    userSessions[msg.from] = { mode: 'AI_CHAT' };
                    await replyHuman(`🤖 *MODE CHAT AI AKTIF*\n\nAnda sekarang terhubung dengan asisten AI PTQ At-Tibyan. Silakan ketik pertanyaan apa saja!\n\nKetik *MENU* untuk kembali ke menu utama.`);
                    return;
            }
        }

        // 4. LOGIKA LAMA (List Santri dan Pendaftaran Manual)
        if (textUpper.includes('LIST SANTRI')) {
            await replyHuman('Sedang mengambil daftar santri dari database, mohon tunggu sebentar...');
            const listText = await getListSantri();
            await replyHuman(listText);
            return;
        }

        // Logika Pendaftaran Khusus Grup (Format Pendek: Nama, Tanggal Lahir, Alamat)
        if (chat.isGroup) {
            if (text && text.includes(',')) {
                const parts = text.split(',');
                if (parts.length >= 3) {
                    const nama = parts[0].trim();
                    const tanggalLahir = parts[1].trim();
                    const alamat = parts.slice(2).join(',').trim();

                    if (nama && tanggalLahir && alamat) {
                        const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

                        await replyHuman('Sedang memproses data Anda, mohon tunggu sebentar...');

                        const success = await saveSantriData(waktu, nama, tanggalLahir, alamat);
                        if (success) {
                            await replyHuman(`Terima kasih! Data Anda telah berhasil disimpan sebagai santri.\n\nNama: ${nama}\nTanggal Lahir: ${tanggalLahir}\nAlamat: ${alamat}`);
                        } else {
                            await replyHuman('Maaf, terjadi kesalahan saat menyimpan data ke sistem kami. Silakan coba lagi nanti.');
                        }
                        return; // Berhenti di sini jika pendaftaran berhasil diproses
                    }
                }
            }
            // Jika tidak cocok dengan format pendaftaran, biarkan berlanjut ke bawah
        }

        // Logika Pendaftaran Khusus Jalur Pribadi (Japri) dengan Format Lengkap
        const namaLine = lines.find(line => line.toUpperCase().startsWith('NAMA LENGKAP'));
        const tglLine = lines.find(line => line.toUpperCase().startsWith('TANGGAL LAHIR'));
        const alamatLine = lines.find(line => line.toUpperCase().startsWith('ALAMAT'));

        if (namaLine && tglLine && alamatLine) {
            const namaParts = namaLine.split(':');
            const tglParts = tglLine.split(':');
            const alamatParts = alamatLine.split(':');

            if (namaParts.length >= 2 && tglParts.length >= 2 && alamatParts.length >= 2) {
                const nama = namaParts.slice(1).join(':').trim();
                const tanggalLahir = tglParts.slice(1).join(':').trim();
                const alamat = alamatParts.slice(1).join(':').trim();

                if (nama && tanggalLahir && alamat) {
                    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

                    await replyHuman('Sedang memproses data Anda, mohon tunggu sebentar...');

                    const success = await saveSantriData(waktu, nama, tanggalLahir, alamat);
                    if (success) {
                        await replyHuman(`Terima kasih! Data Anda telah berhasil disimpan sebagai santri.\n\nNama: ${nama}\nTanggal Lahir: ${tanggalLahir}\nAlamat: ${alamat}`);
                    } else {
                        await replyHuman('Maaf, terjadi kesalahan saat menyimpan data ke sistem kami. Silakan coba lagi nanti.');
                    }
                } else {
                    if (!chat.isGroup) await replyHuman('Format pengisian salah. Pastikan Anda mengisi nama, tanggal lahir, dan alamat setelah tanda titik dua (:).');
                }
            } else {
                if (!chat.isGroup) await replyHuman('Format yang Anda masukkan salah. Pastikan menggunakan tanda titik dua (:) sebagai pemisah.\n\nContoh:\nNama Lengkap : Ahmad Zulfikar\nTanggal Lahir : 09-12-1996\nAlamat : Laren Bumiayu');
            }
        } else if (textUpper.includes('NAMA LENGKAP') || textUpper.includes('TANGGAL LAHIR') || textUpper.includes('ALAMAT')) {
            if (!chat.isGroup) await replyHuman('Format pendaftaran belum lengkap. Pastikan Anda mengirimkan baris "Nama Lengkap :", "Tanggal Lahir :", dan "Alamat :" dalam satu pesan yang sama.\n\nContoh:\nNama Lengkap : Ahmad Zulfikar\nTanggal Lahir : 09-12-1996\nAlamat : Laren Bumiayu');
        } else {
            // Fallback: Apapun pesannya (tidak dikenal/kosong), langsung berikan Menu Utama
            // Tidak perlu lagi membalas "Ketik MENU", tapi langsung sodorkan menunya
            if (!chat.isGroup || !text) {
                await replyHuman(menuText);
            } else if (chat.isGroup) {
                // Di grup, jika ada teks tak dikenal hasil mention, langsung berikan menu juga
                await replyHuman(menuText);
            }
        }
    });

    client.initialize();
}

startBot().catch(console.error);