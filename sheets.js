const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

let serviceAccountAuth;

if (process.env.CREDENTIALS_PATH) {
    const credentials = require(process.env.CREDENTIALS_PATH);
    serviceAccountAuth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
} else if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
} else {
    console.error("Kredensial Google Sheets (CREDENTIALS_PATH atau EMAIL & PRIVATE_KEY) tidak ditemukan di .env!");
    process.exit(1);
}

const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);

async function getOrCreateSheet(title, headers) {
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle[title];
    if (!sheet) {
        sheet = await doc.addSheet({ title, headerValues: headers });
    } else {
        try {
            await sheet.loadHeaderRow();
        } catch (e) {
            await sheet.setHeaderRow(headers);
        }
    }
    return sheet;
}

async function saveSantriData(waktu, nama, tanggalLahir, alamat) {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow([waktu, nama, tanggalLahir, alamat]);

    // Auto insert ke Tab Absensi
    const sheetAbsen = await getOrCreateSheet('Absensi', ['Waktu', 'Nama', 'Status']);
    await sheetAbsen.addRow([waktu, nama, 'Baru Mendaftar']);

    // Auto insert ke Tab Hafalan
    const sheetHafalan = await getOrCreateSheet('Hafalan', ['Waktu', 'Nama', 'Juz/Surat']);
    await sheetHafalan.addRow([waktu, nama, 'Belum ada riwayat']);

    // Auto insert ke Tab Pembayaran
    const sheetBayar = await getOrCreateSheet('Pembayaran', ['Waktu', 'Nama', 'Nominal']);
    await sheetBayar.addRow([waktu, nama, '0']);

    return true;
  } catch (error) {
    console.error("Error saving data to spreadsheet:", error);
    return false;
  }
}

async function getListSantri() {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    if (rows.length === 0) {
      return "Belum ada santri yang terdaftar saat ini.";
    }

    let result = "*Daftar Santri PTQ At-Tibyan:*\n\n";
    rows.forEach((row, index) => {
      const nama = row._rawData[1] || 'Anonim';
      const tglLahir = row._rawData[2] || '-';
      const alamat = row._rawData[3] ? row._rawData[3] : '-';
      result += `${index + 1}. ${nama} (Lahir: ${tglLahir}, Alamat: ${alamat})\n`;
    });
    
    return result.trim();
  } catch (error) {
    console.error("Error fetching data from spreadsheet:", error);
    return "Maaf, terjadi kesalahan saat mengambil daftar santri.";
  }
}

async function getSantriArray() {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    return rows.map((row, index) => ({
      index: index + 1,
      nama: row._rawData[1] || 'Anonim',
      tglLahir: row._rawData[2] || '-',
      alamat: row._rawData[3] || '-'
    }));
  } catch (error) {
    console.error("Error fetching santri array:", error);
    return [];
  }
}

// ABSENSI
async function saveAbsensi(waktu, nama, status) {
  try {
    const sheet = await getOrCreateSheet('Absensi', ['Waktu', 'Nama', 'Status']);
    await sheet.addRow([waktu, nama, status]);
    return true;
  } catch (error) {
    console.error("Error saving absensi:", error);
    return false;
  }
}

async function getAbsensi() {
  try {
    const santriArray = await getSantriArray();
    if (santriArray.length === 0) return "Belum ada santri yang terdaftar.";

    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Absensi'];
    const rows = sheet ? await sheet.getRows() : [];

    const now = new Date();
    const todayFullStr = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const todayDateStr = todayFullStr.split(',')[0].trim();
    const todayParts = todayDateStr.split(/\D+/);
    const currentMonth = todayParts[1];
    const currentYear = todayParts[2];
    
    const monthNames = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const monthName = monthNames[parseInt(currentMonth, 10)] || currentMonth;
    const todayDisplay = `${todayParts[0]} ${monthName} ${currentYear}`;

    let absenHariIni = {};
    let absenBulanIni = {};

    santriArray.forEach(s => {
      absenHariIni[s.nama] = '';
      absenBulanIni[s.nama] = { H: 0, S: 0, I: 0, A: 0 };
    });

    rows.forEach(row => {
      const waktu = row._rawData[0] || '';
      const nama = row._rawData[1] || '';
      const rawStatus = (row._rawData[2] || '').toUpperCase();
      
      if (!nama || waktu === '-' || rawStatus.includes('BARU MENDAFTAR')) return;
      
      const rowDateStr = waktu.split(',')[0].trim();
      const rowParts = rowDateStr.split(/\D+/);
      if (rowParts.length < 3) return;
      
      let statusSymbol = '';
      if (rawStatus.startsWith('H')) statusSymbol = 'H';
      else if (rawStatus.startsWith('S')) statusSymbol = 'S';
      else if (rawStatus.startsWith('I')) statusSymbol = 'I';
      else if (rawStatus.startsWith('A')) statusSymbol = 'A';
      else if (rawStatus === '✓') statusSymbol = 'H';

      if (!statusSymbol) return;

      if (rowDateStr === todayDateStr) {
        if (statusSymbol === 'H') absenHariIni[nama] = '✓';
        else absenHariIni[nama] = statusSymbol;
      }

      if (rowParts[1] === currentMonth && rowParts[2] === currentYear) {
        if (absenBulanIni[nama] !== undefined) {
          absenBulanIni[nama][statusSymbol]++;
        }
      }
    });

    let result = `*Absen Hari Ini tgl ${todayDisplay}*\n`;
    santriArray.forEach((s, idx) => {
      const st = absenHariIni[s.nama];
      result += `${idx + 1}. ${s.nama} ${st ? st : ''}\n`;
    });

    result += `\n*Absen Bulan Ini*\n`;
    santriArray.forEach((s, idx) => {
      const counts = absenBulanIni[s.nama];
      let statStrs = [];
      if (counts.H > 0) statStrs.push(`H : ${counts.H}`);
      if (counts.S > 0) statStrs.push(`S : ${counts.S}`);
      if (counts.I > 0) statStrs.push(`I : ${counts.I}`);
      if (counts.A > 0) statStrs.push(`A : ${counts.A}`);
      
      let statStr = statStrs.length > 0 ? statStrs.join(', ') : '-';
      result += `${idx + 1}. ${s.nama} ${statStr}\n`;
    });

    return result.trim();
  } catch (error) {
    console.error("Error fetching absensi:", error);
    return "Maaf, terjadi kesalahan saat mengambil data absensi.";
  }
}

// HAFALAN
async function saveHafalan(waktu, nama, detail) {
  try {
    const sheet = await getOrCreateSheet('Hafalan', ['Waktu', 'Nama', 'Juz/Surat']);
    await sheet.addRow([waktu, nama, detail]);
    return true;
  } catch (error) {
    console.error("Error saving hafalan:", error);
    return false;
  }
}

async function getHafalan() {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Hafalan'];
    if (!sheet) return "Belum ada data progres hafalan.";
    const rows = await sheet.getRows();
    if (rows.length === 0) return "Belum ada data progres hafalan saat ini.";
    let result = "*Progres Hafalan Santri:*\n\n";
    rows.forEach((row, index) => {
      const waktu = row._rawData[0] || '-';
      const nama = row._rawData[1] || 'Anonim';
      const detail = row._rawData[2] || '-';
      result += `${index + 1}. ${nama} - ${detail} (${waktu})\n`;
    });
    return result.trim();
  } catch (error) {
    console.error("Error fetching hafalan:", error);
    return "Maaf, terjadi kesalahan saat mengambil data hafalan.";
  }
}

// PEMBAYARAN
async function savePembayaran(waktu, nama, nominal) {
  try {
    const sheet = await getOrCreateSheet('Pembayaran', ['Waktu', 'Nama', 'Nominal']);
    await sheet.addRow([waktu, nama, nominal]);
    return true;
  } catch (error) {
    console.error("Error saving pembayaran:", error);
    return false;
  }
}

async function getPembayaran() {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Pembayaran'];
    if (!sheet) return "Belum ada data catatan pembayaran.";
    const rows = await sheet.getRows();
    if (rows.length === 0) return "Belum ada data catatan pembayaran saat ini.";
    let result = "*Buku Catatan Pembayaran Santri:*\n\n";
    rows.forEach((row, index) => {
      const waktu = row._rawData[0] || '-';
      const nama = row._rawData[1] || 'Anonim';
      const nominal = row._rawData[2] || '-';
      result += `${index + 1}. ${nama} - Rp ${nominal} (${waktu})\n`;
    });
    return result.trim();
  } catch (error) {
    console.error("Error fetching pembayaran:", error);
    return "Maaf, terjadi kesalahan saat mengambil data pembayaran.";
  }
}

module.exports = { 
  saveSantriData, 
  getListSantri,
  getSantriArray,
  saveAbsensi,
  getAbsensi,
  saveHafalan,
  getHafalan,
  savePembayaran,
  getPembayaran
};