const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

let serviceAccountAuth;

if (process.env.CREDENTIALS_PATH) {
    // Jalur lama: menggunakan file JSON
    const credentials = require(process.env.CREDENTIALS_PATH);
    serviceAccountAuth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
} else if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    // Jalur baru: menggunakan variabel lingkungan (Termux/Render)
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

async function saveSantriData(waktu, nama, tanggalLahir) {
  try {
    await doc.loadInfo(); // loads document properties and worksheets
    const sheet = doc.sheetsByIndex[0]; // first sheet
    
    // Menambahkan baris data menggunakan array
    await sheet.addRow([waktu, nama, tanggalLahir]);
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
      // Menyiasati struktur kolom: [Waktu, Nama, Tanggal Lahir]
      const nama = row._rawData[1] || 'Anonim';
      const tglLahir = row._rawData[2] || '-';
      result += `${index + 1}. ${nama} (Lahir: ${tglLahir})\n`;
    });
    
    return result.trim();
  } catch (error) {
    console.error("Error fetching data from spreadsheet:", error);
    return "Maaf, terjadi kesalahan saat mengambil daftar santri.";
  }
}

module.exports = { saveSantriData, getListSantri };
