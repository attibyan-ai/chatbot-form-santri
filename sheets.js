const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

const credentials = require(process.env.CREDENTIALS_PATH);

// Initialize auth
const serviceAccountAuth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});

const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);

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
