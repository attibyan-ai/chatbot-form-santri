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

async function saveSantriData(waktu, nama, tanggalLahir, alamat) {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow([waktu, nama, tanggalLahir, alamat]);
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

// ABSENSI (Sheet 1)
async function saveAbsensi(waktu, nama, status) {
  try {
    await doc.loadInfo();
    let sheet = doc.sheetsByIndex[1];
    if (!sheet) sheet = await doc.addSheet({ title: 'Absensi', headerValues: ['Waktu', 'Nama', 'Status'] });
    await sheet.addRow([waktu, nama, status]);
    return true;
  } catch (error) {
    console.error("Error saving absensi:", error);
    return false;
  }
}

async function getAbsensi() {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[1];
    if (!sheet) return "Belum ada data absensi.";
    const rows = await sheet.getRows();
    if (rows.length === 0) return "Belum ada data absensi saat ini.";
    let result = "*Daftar Absensi Santri:*\n\n";
    rows.forEach((row, index) => {
      const waktu = row._rawData[0] || '-';
      const nama = row._rawData[1] || 'Anonim';
      const status = row._rawData[2] || '-';
      result += `${index + 1}. ${nama} - ${status} (${waktu})\n`;
    });
    return result.trim();
  } catch (error) {
    console.error("Error fetching absensi:", error);
    return "Maaf, terjadi kesalahan saat mengambil data absensi.";
  }
}

// HAFALAN (Sheet 2)
async function saveHafalan(waktu, nama, detail) {
  try {
    await doc.loadInfo();
    let sheet = doc.sheetsByIndex[2];
    if (!sheet) sheet = await doc.addSheet({ title: 'Hafalan', headerValues: ['Waktu', 'Nama', 'Juz/Surat'] });
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
    const sheet = doc.sheetsByIndex[2];
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

// PEMBAYARAN (Sheet 3)
async function savePembayaran(waktu, nama, nominal) {
  try {
    await doc.loadInfo();
    let sheet = doc.sheetsByIndex[3];
    if (!sheet) sheet = await doc.addSheet({ title: 'Pembayaran', headerValues: ['Waktu', 'Nama', 'Nominal'] });
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
    const sheet = doc.sheetsByIndex[3];
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