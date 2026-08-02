const fs = require('fs');
const path = require('path');

if (!fs.existsSync('www')) fs.mkdirSync('www');

const files = ['index.html', 'sw.js', 'manifest.json', 'css/app.css', 'icon-192.png', 'icon-512.png', 'icon-1024.png', 'icon-gold-192.png', 'icon-white-192.png',
               'js/coach-memory.js', 'js/coach-log.js', 'js/coach-intent.js', 'js/coach-cache.js',
               'js/coach-persona.js', 'js/coach-voice.js', 'js/coach-session.js', 'js/coach-warmup.js',
               'js/coach-cues.js', 'js/coach-rpe.js', 'js/coach-analyze.js',
               'js/coach-notify.js', 'js/coach-report.js', 'js/coach-charts.js',
               'js/workout-focus.js', 'js/workout-bar.js',
               // App-Module (Reihenfolge = Ladereihenfolge in index.html).
               // Fehlt hier eines, startet die native App ohne diese Datei.
               'js/app-i18n.js', 'js/app-native.js', 'js/app-ui.js', 'js/app-session.js',
               'js/app-plans.js', 'js/app-workout.js', 'js/app-exdb.js', 'js/app-streak.js', 'js/app-community.js',
               'js/app-coach.js', 'js/app-coach-setup.js', 'js/app-update.js', 'js/app-boot.js',
               'js/app-tabbar.js'];
if (!fs.existsSync(path.join('www', 'js'))) fs.mkdirSync(path.join('www', 'js'), { recursive: true });
if (!fs.existsSync(path.join('www', 'css'))) fs.mkdirSync(path.join('www', 'css'), { recursive: true });
files.forEach(file => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join('www', file));
    console.log('Copied', file);
  }
});
