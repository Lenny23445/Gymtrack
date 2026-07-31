const fs = require('fs');
const path = require('path');

if (!fs.existsSync('www')) fs.mkdirSync('www');

const files = ['index.html', 'sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-1024.png', 'icon-gold-192.png', 'icon-white-192.png',
               'js/coach-memory.js', 'js/coach-log.js', 'js/coach-intent.js', 'js/coach-cache.js',
               'js/coach-persona.js', 'js/coach-voice.js', 'js/coach-session.js', 'js/coach-warmup.js',
               'js/coach-cues.js', 'js/coach-rpe.js', 'js/coach-analyze.js',
               'js/coach-notify.js', 'js/coach-report.js', 'js/coach-charts.js',
               'js/workout-focus.js'];
if (!fs.existsSync(path.join('www', 'js'))) fs.mkdirSync(path.join('www', 'js'), { recursive: true });
files.forEach(file => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join('www', file));
    console.log('Copied', file);
  }
});
