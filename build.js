const fs = require('fs');
const path = require('path');

if (!fs.existsSync('www')) fs.mkdirSync('www');

const files = ['index.html', 'sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-1024.png', 'icon-gold-192.png', 'icon-white-192.png'];
files.forEach(file => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join('www', file));
    console.log('Copied', file);
  }
});
