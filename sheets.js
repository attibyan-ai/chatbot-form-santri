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

module.exports = { saveSantriData };
