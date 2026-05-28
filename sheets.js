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

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

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
      const nama = toTitleCase(row._rawData[1] || 'Anonim');
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
      nama: toTitleCase(row._rawData[1] || 'Anonim'),
      tglLahir: row._rawData[2] || '-',
      alamat: row._rawData[3] || '-'
    }));
  } catch (error) {
    console.error("Error fetching santri array:", error);
    return [];
  }
}



module.exports = { saveSantriData, getListSantri, getSantriArray };