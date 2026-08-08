/* GymTrack — Drift-Test DE/EN fuer den Gruppen-Bereich (js/app-crew.js).

   Das Gruppen-Feature ging am 07.08.2026 mit komplett deutscher Oberflaeche
   live: die Sheets „Gruppe erstellen/beitreten/verwalten" waren im Code neu
   geschrieben, in I18N_EN stand aber noch die alte Crew-Wortwahl. Fuer
   EN-Nutzer blieb der ganze Bereich deutsch, ohne dass irgendwo ein Fehler
   auftauchte — genau die Sorte Luecke, die kein anderer Test findet.

   Dieser Test haengt beide Seiten aneinander:
   - `tr()` kommt aus dem ECHTEN js/app-i18n.js (Quelltext-Ausschnitt wird
     ausgewertet, keine abgetippte Kopie der Tabellen).
   - Jeder Pruefsatz traegt zusaetzlich sein Quell-Literal aus js/app-crew.js.
     Wird ein Text im Modul umformuliert, faellt der Anker auf — der Test kann
     also nicht still veralten, waehrend die Uebersetzung daneben laeuft.

   Erwartet wird bewusst NICHT der exakte englische Wortlaut (das waere nur eine
   zweite Kopie der Tabelle), sondern: der Text hat sich geaendert und enthaelt
   keine deutschen Reste mehr. */
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const WURZEL   = path.join(__dirname, '..');
const I18N_SRC = fs.readFileSync(path.join(WURZEL, 'js', 'app-i18n.js'), 'utf8');
const CREW_SRC = fs.readFileSync(path.join(WURZEL, 'js', 'app-crew.js'), 'utf8');

/* I18N_EN + I18N_RX + tr() am Stueck aus der echten Datei ausschneiden und von
   der JS-Engine auswerten lassen. Die Regex-Literale selbst nachzubauen waere
   fragiler als der Code, den der Test prueft. GT_LANG setzt der Test, weil es
   in der App aus localStorage kommt. */
function ladeTr() {
  const von = I18N_SRC.indexOf('const I18N_EN = {');
  const bis = I18N_SRC.indexOf('/* DOM-Übersetzung');
  assert.ok(von >= 0 && bis > von, 'I18N-Block in js/app-i18n.js nicht gefunden');
  const block = I18N_SRC.slice(von, bis);
  return new Function(`"use strict"; const GT_LANG='en'; ${block} return tr;`)();
}
const tr = ladeTr();

/* Deutsche Reste im Ergebnis. Umlaute plus die Woerter, die im Gruppen-Bereich
   tatsaechlich vorkommen — eine Liste, kein Sprachmodell: sie muss nur die
   Texte dieses Moduls abdecken. */
const DEUTSCH = /[äöüßÄÖÜ]|\b(Gruppe|Gruppen|Mitglied|Mitglieder|Woche|Wochen|Noch|noch|Ziel|Zielart|Trainings|Trainingszeit|Volumen|Beitrag|Beitreten|geschafft|Kopiert|Kopieren|Teilen|Speichern|Entfernen|Jemand|Jeder|Wen|einladen|nicht|keine|kein|dich|dein|deine|und|der|die|das|einen|wirklich|Fortfahren)\b/;

/* laufzeit = wie der Text im UI steht · quelle = Literal, das in
   js/app-crew.js vorkommen muss (Anker gegen stille Umformulierung). */
const PRUEFSAETZE = [
  // Sheet „Gruppe erstellen"
  ['Gruppe erstellen',            `_crewSheet('Gruppe erstellen'`],
  ['Gym Gruppe',                  `placeholder="Gym Gruppe"`],
  ['Ziel der Woche',              '<label>Ziel der Woche</label>'],
  ['Trainings',                   `label: 'Trainings'`],
  ['Volumen',                     `label: 'Volumen'`],
  ['Trainingszeit',               `label: 'Trainingszeit'`],
  ['Jeder X-mal',                 `label: 'Jeder X-mal'`],
  ['Alle Trainings der Gruppe zusammen.',                   'Alle Trainings der Gruppe zusammen.'],
  ['Bewegtes Gewicht der ganzen Gruppe.',                   'Bewegtes Gewicht der ganzen Gruppe.'],
  ['Trainingsminuten aller Mitglieder.',                    'Trainingsminuten aller Mitglieder.'],
  ['Geschafft nur, wenn JEDES Mitglied so oft trainiert.',  'Geschafft nur, wenn JEDES Mitglied so oft trainiert.'],
  ['Wen einladen',                '<label>Wen einladen'],
  ['Noch keine Freunde — du kannst die Gruppe auch später per Code teilen.',
   'Noch keine Freunde — du kannst die Gruppe auch später per Code teilen.'],

  // Sheet „Gruppe beitreten"
  ['Gruppe beitreten',            `_crewSheet('Gruppe beitreten'`],
  ['Gruppen-Code',                '>Gruppen-Code</label>'],
  ['Den Code bekommst du von jemandem aus der Gruppe. Gruppen sind nicht durchsuchbar.',
   'Den Code bekommst du von jemandem aus der Gruppe. Gruppen sind nicht durchsuchbar.'],
  ['Beitreten',                   '>Beitreten</button>'],

  // Sheet „Gruppe verwalten"
  ['Gruppe verwalten',            `_crewSheet('Gruppe verwalten'`],
  ['Wochenziel · Trainings',      '<label>Wochenziel · '],
  ['Die Zielart lässt sich nachträglich nicht ändern — sonst stünde die Historie in zwei Einheiten da.',
   'Die Zielart lässt sich nachträglich nicht ändern — sonst stünde die Historie in zwei Einheiten da.'],
  ['Speichern',                   '>Speichern</button>'],
  ['Mitglieder',                  '>Mitglieder</div>'],
  ['Entfernen',                   '>Entfernen</button>'],
  ['Gruppe auflösen',             '>Gruppe auflösen</button>'],

  // Uebersicht + Einladungen
  ['Gruppen',                     '<span>Gruppen</span>'],
  ['Gruppe hinzufügen',           '>Gruppe hinzufügen</span>'],
  ['Jemand lädt dich ein',        ' lädt dich ein'],
  ['Nein',                        '>Nein</button>'],

  // Karten (Balken, Streak, Historie)
  ['Ziel geschafft',              `'Ziel geschafft'`],
  ['3 Wochen in Folge',           `' Wochen in Folge'`],
  ['1 Woche in Folge',            `' Woche in Folge'`],
  ['Noch 5',                      `'Noch ' + _crewVal(rest, typ)`],
  ['Noch 25.000 kg',              `einheit: 'kg'`],
  ['2 fehlen noch',               `' fehlen noch'`],
  ['1 fehlt noch',                `' fehlt noch'`],
  ['Letzter Tag der Woche',       `'Letzter Tag der Woche'`],
  ['Noch 3 Tage',                 `'Noch ' + tage`],
  ['Noch 5 bis Sonntag',          ` bis Sonntag'`],
  ['2 Mitglieder haben ihr Ziel noch nicht',  `' Mitglieder haben ihr Ziel noch nicht'`],
  ['1 Mitglied hat sein Ziel noch nicht',     `' Mitglied hat sein Ziel noch nicht'`],
  ['Wochenziel geschafft — jeder mit Beitrag bekommt 120 Punkte, der Streak wächst am Montag.',
   `'Wochenziel geschafft — jeder mit Beitrag bekommt '`],
  ['Dein Beitrag',                '>Dein Beitrag<'],
  ['Mitglied',                    `: 'Mitglied'`],
  ['Gründer',                     '>Gründer</span>'],
  ['geschafft',                   '>geschafft</span>'],
  ['Letzte 8 Wochen',             `'Letzte ' + hist.length + ' Wochen'`],
  ['Kopieren',                    '>Kopieren</button>'],
  ['Teilen',                      '>Teilen</button>'],
  ['Gruppe verlassen',            '>Gruppe verlassen</button>'],
  ['Lade Gruppe…',                'Lade Gruppe…'],
  ['Gruppe konnte nicht geladen werden.',  'Gruppe konnte nicht geladen werden.'],

  // Dialoge (alert/confirm laufen ueber die tr()-Wrapper in app-i18n.js)
  ['Dafür musst du angemeldet sein und die Community aktiviert haben.',
   'Dafür musst du angemeldet sein und die Community aktiviert haben.'],
  ['Mehr als 5 Gruppen gehen nicht.',      `' Gruppen gehen nicht.'`],
  ['Gib deiner Gruppe einen Namen.',       'Gib deiner Gruppe einen Namen.'],
  ['Gruppe konnte nicht angelegt werden.', 'Gruppe konnte nicht angelegt werden.'],
  ['Der Gruppen-Code besteht aus 6 Zeichen.', 'Der Gruppen-Code besteht aus 6 Zeichen.'],
  ['Keine Gruppe mit diesem Code gefunden.',  'Keine Gruppe mit diesem Code gefunden.'],
  ['Diese Gruppe ist voll (20 Mitglieder).',  `'Diese Gruppe ist voll ('`],
  ['Beitritt fehlgeschlagen.',    'Beitritt fehlgeschlagen.'],
  ['Hat nicht geklappt.',         'Hat nicht geklappt.'],
  ['Gruppe wird für alle 4 Mitglieder aufgelöst. Fortfahren?', `' aufgelöst. Fortfahren?'`],
  ['Gruppe „Eisenpark" wirklich verlassen?',  `wirklich verlassen?'`],
  ['Max aus der Gruppe entfernen?',           `' aus der Gruppe entfernen?'`],
  ['Komm in meine Gruppe „Eisenpark" bei MyGymTrack — Code: ABC123',
   `'Komm in meine Gruppe „'`],
];

test('Gruppen-Texte sind vollstaendig uebersetzt (kein deutscher Rest)', () => {
  for (const [laufzeit] of PRUEFSAETZE) {
    const en = tr(laufzeit);
    assert.notStrictEqual(en, laufzeit, `nicht uebersetzt: "${laufzeit}"`);
    assert.ok(!DEUTSCH.test(en), `deutscher Rest in "${laufzeit}" → "${en}"`);
  }
});

test('Pruefsaetze haengen am echten Quelltext von js/app-crew.js', () => {
  for (const [laufzeit, quelle] of PRUEFSAETZE) {
    assert.ok(CREW_SRC.includes(quelle),
      `Anker fehlt in js/app-crew.js: ${quelle}\n(Text "${laufzeit}" wurde umformuliert — I18N_EN/I18N_RX und diesen Test mitziehen)`);
  }
});

/* Der Teilen-Text geht per navigator.share nach draussen und nie durchs DOM —
   ohne den ausdruecklichen tr()-Aufruf uebersetzt ihn niemand. */
test('Teilen-Text laeuft durch tr()', () => {
  assert.match(CREW_SRC, /const txt = tr\('Komm in meine Gruppe/);
});
