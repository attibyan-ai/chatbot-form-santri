# Menggunakan image Node.js versi ringan
FROM node:18-bullseye-slim

# Install dependencies sistem yang dibutuhkan oleh Puppeteer/Chrome
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set direktori kerja
WORKDIR /usr/src/app

# Copy package.json dan package-lock.json
COPY package*.json ./

# Install dependencies Node.js
RUN npm install

# Copy seluruh kode aplikasi
COPY . .

# Beritahu Puppeteer agar tidak mendownload Chromium (karena kita sudah install Google Chrome di atas)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Buka port yang diperlukan oleh Express
EXPOSE 3000

# Jalankan aplikasi
CMD ["npm", "start"]
