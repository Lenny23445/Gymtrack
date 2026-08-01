// ── DATA ──────────────────────────────────────────────
/* ── ICON-BIBLIOTHEK ── */
const ICON_CATS = [
  { label:'⭐ Zuletzt',   icons:['🏋️','💪','🦵','🧘','🏃','🚴','🤸','⚡','🔥','🥊','🎯','🏅'] },
  { label:'🏋️ Fitness',  icons:['🏋️','💪','🦵','🤸','🧘','🤼','🥊','🎽','🥋','🤺','🦾','🦿','🏃','🚶','🧎','🤾','🤽','🚵','🧗','🏇','🏊','🚣','🏄','⛹️','🤿','🪂','🎣','🛶'] },
  { label:'⚽ Sport',     icons:['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🥏','🏒','🏓','🏸','🏑','🏏','🪃','🥌','🛹','🛷','🎳','🏹','🎿','⛷️','🏂','🪁','🤺','🎯','🎱','🏆','🥇','🥈','🥉','🎖️','🏅'] },
  { label:'🫀 Körper',   icons:['🫀','🫁','🦴','🦷','🧠','👁️','🦶','🦵','💪','🦾','🦿','🩺','🩹','🩻','💊','🩸','🧬','🌡️','🏥','💆','🛁','🚿','🧖','🫶','🤲','👐','🙌','🤝','👊','✊'] },
  { label:'🏆 Erfolg',   icons:['🏆','🥇','🥈','🥉','🎖️','🏅','⭐','🌟','✨','💫','🎯','👑','🔱','⚜️','🌈','🌠','🦋','🦅','🦁','🐯','🦊','🐺','🦄','🐉','🦈','🦏','🏔️','🌋','🗻','🌅'] },
  { label:'⚡ Power',     icons:['⚡','🔥','💥','🚀','💢','🌪️','⚔️','🛡️','🗡️','🔮','💠','❇️','✴️','🌀','☄️','🌩️','💡','🔋','⚙️','🔩','🧲','🔧','🔨','⛏️','🪛','🪚','💣','🎆','🎇','🧨'] },
  { label:'🥩 Nutrition', icons:['🥩','🍗','🥚','🥛','🧃','💧','🫗','🥑','🥦','🥕','🍌','🍎','🍊','🥝','🍇','🫐','🍓','🥜','🫘','🌾','🍚','🥗','🫙','🧈','🫒','🍳','🥞','🍱','🥣','🧇','🫕','🧆'] },
  { label:'🎨 Symbole',  icons:['🔴','🟡','🟢','🟣','🔵','🟠','⚫','⚪','🔶','🔷','🔸','🔹','💎','♾️','📊','📈','📉','⏱️','⏰','🕐','🎮','🎲','🃏','🎪','🎨','✏️','📌','🔑','🗝️','🪬','🧿','☯️','☮️','✡️','🔯'] },
  { label:'🐾 Tiere',    icons:['🦁','🐯','🐻','🦊','🐺','🦅','🦆','🐧','🦋','🐝','🦎','🐬','🦈','🐙','🦑','🦞','🦀','🐊','🦏','🦛','🦒','🐘','🦓','🏇','🐎','🦌','🦬','🐂','🦣','🫏'] },
];

/* Quick-Pick (erste 14 Icons aus den Top-Kategorien) */
const EMOJIS = ICON_CATS[0].icons.concat(['🦵','🔥','💥','🏊','🧗','🫀','🦴','🟢','🟣','🔵','🟡','🔴','⭐','💎','⚡','🎯','🏆','🥊']);

/* ── APP VERSION (sync mit sw.js – Deploy-Script hält beide gleich) ── */
const APP_VERSION = 'gymtrack-v202608030449';

/* Der eingeloggte Firebase-Nutzer. Die Deklaration steht HIER und nicht unten im
   Konto-Block, obwohl sie dorthin gehoert: `let` liegt bis zu seiner Zeile in der
   temporalen Toten Zone, und ein Zugriff davor wirft — er ergibt nicht etwa
   undefined. Genau das passierte beim allerersten Rendern der Startseite:
   _renderHdrAva() liest ueber _profileName() den Anzeigenamen, lange bevor der
   Konto-Block ausgefuehrt ist. Die Folge war ein ReferenceError mitten in
   renderHome() — die Heute-Seite blieb leer und der Rest des Starts (bis hin zum
   Onboarding neuer Nutzer) lief nie an. Ein try/catch an der Lesestelle wuerde
   den Fehler nur verstecken; die Variable muss vor dem ersten Render existieren.
   typeof hilft hier uebrigens nicht: auf eine let-Variable in der TDZ angewendet
   wirft es genauso. */
let _fbUser = null;

/* ⚠️ DEMO/SIMULATIONS-DATEN — nur für Screenshots im iOS-Simulator.
   true = überschreibt beim Start S.sessions/S.exercises im Speicher (NICHT persistiert,
   NICHT gepusht). VOR jedem Upload/Push wieder auf false setzen! */
const DEMO_SEED = true;   // NUR für Promo-Screenshots auf true — NIE committen!

/* Echte Push (APNs) bei Flammen-Reaktion — auch bei geschlossener App.
   Absender = Cloudflare Worker (hält geheimen .p8, sendet an Apple APNs).
   Ablauf: iOS holt Device-Token via @capacitor/push-notifications → Token in
   profiles/{uid}.pushToken → beim Flammen-Tap ruft der Absender den Worker,
   der die Push an den Post-Besitzer schickt. Kein Blaze, kein Firebase-SDK. */
const PUSH_WORKER_URL = 'https://gymtrack-push.wolterlenny362.workers.dev';
let _pushToken = null;    // APNs-Device-Token dieses Geräts (in profiles/{uid}.pushToken)
let _pushReg   = false;   // registration-Listener nur einmal binden

/* ══ I18N — Englische Übersetzung als Display-Layer ══════════════════════
   Interne Daten (Übungsnamen, Gruppen-IDs, Cloud-Felder) bleiben deutsch —
   nur die ANZEIGE wird übersetzt. So brechen weder PLAN_TEMPLATES-Lookups
   noch Firestore-Rules (hasOnly). Sprache: localStorage 'gt_lang'
   ('auto'|'de'|'en'); 'auto' = Gerätesprache (nicht-deutsch → Englisch). */
const GT_LANG_PREF = localStorage.getItem('gt_lang') || 'auto';
const GT_LANG = GT_LANG_PREF !== 'auto' ? GT_LANG_PREF
  : (((navigator.language || (navigator.languages || [])[0] || 'de')).toLowerCase().startsWith('de') ? 'de' : 'en');
const GT_LOCALE = GT_LANG === 'en' ? 'en-US' : 'de-DE';
const GT_DEC = GT_LANG === 'en' ? '.' : ',';
document.documentElement.lang = GT_LANG;
function setAppLang(v) {
  localStorage.setItem('gt_lang', v);
  location.reload();
}

/* Exakte Phrasen (getrimmter Textknoten → Übersetzung) */
const I18N_EN = {
  /* Workout-Share-Flow + Community-Pager */
  'Dein Look':'Your look','Tippen zum Festlegen':'Tap to lock in','Foto':'Photo','Foto aufnehmen':'Take photo',
  'Kein Kamera-Zugriff':'No camera access',
  'Erlaube die Kamera in den iOS-Einstellungen oder wähle ein Foto aus der Galerie.':'Allow camera access in iOS Settings or pick a photo from your library.',
  'Aus Galerie wählen':'Choose from library','Ohne Foto weiter':'Continue without photo','Layout wählen':'Pick a layout','Farbe wählen':'Choose color',
  'Nur dein Freundeskreis':'Only your friends','Öffentlich für alle MyGymTrack-Nutzer':'Public for all MyGymTrack users',
  // Kopfzeile des Community-Pagers (cpg-zone) — wird per tr() zur Laufzeit gebaut,
  // deshalb greift der DOM-MutationObserver nicht und der Eintrag muss hier stehen.
  'Alle MyGymTrack-Nutzer':'All MyGymTrack users','Nur deine Freunde':'Friends only',
  'Community aus':'Community off',
  'Aktiviere die Community im Community-Tab, um Beiträge zu posten.':'Enable the community in the Community tab to post.',
  'Extern teilen':'Share externally','Posten':'Post','Wird gepostet…':'Posting…','Gründer':'Founder',
  'Gründer von MyGymTrack':'Founder of MyGymTrack',
  'Dein Level':'Your level','Level':'Level','Punkte':'points','So sammelst du Punkte':'How you earn points',
'pro Training':'per workout','pro Streak-Woche':'per streak week','pro erhaltener Flamme':'per flame received',
  'Aktuell':'Current','Level up! Du bist jetzt':'Level up! You are now','Maximales Level erreicht':'Maximum level reached',
  'Level steigt mit Trainings, Streak & Flammen.':'Level rises with workouts, streak & flames.',
  'Posten fehlgeschlagen — bist du offline?':'Posting failed — are you offline?',
  'gerade eben':'just now','vor':'ago',
  'Lade Feed…':'Loading feed…','Feed konnte nicht geladen werden':'Couldn’t load the feed',
  'Bist du offline? Versuch es gleich nochmal.':'Are you offline? Try again in a moment.','Versuch es gleich nochmal.':'Try again in a moment.','Nochmal versuchen':'Try again',
  'Neuer Rekord':'New record','Wochen-Streak':'week streak','Optionen':'Options','Flamme':'Flame','Flammen':'Flames','Erste Flamme geben':'Give the first flame',
  'Noch nichts von deinen Freunden':'Nothing from your friends yet','Noch keine Community-Posts':'No community posts yet',
  'Beende ein Training und teile es — es landet hier.':'Finish a workout and share it — it shows up here.',
  'Füge zuerst Freunde hinzu — oben rechts über das +.':'Add friends first — via the + at the top right.',
  'Teile dein nächstes Training mit der Community!':'Share your next workout with the community!',
  'Alles gesehen!':'All caught up!','Neu laden':'Reload',
  'Beitrag':'Post','Beitrag löschen':'Delete post','Beitrag ausblenden':'Hide post','Beitrag melden':'Report post',
  'Nutzer blockieren':'Block user','Danke! Der Beitrag wurde gemeldet.':'Thanks! The post has been reported.',
  'Nutzer blockieren? Seine Beiträge verschwinden aus deinem Feed.':'Block this user? Their posts will disappear from your feed.',
  'Diesen Beitrag löschen?':'Delete this post?',
  'Reaktionen':'Reactions','Jemand':'Someone','feiert dein Training':'cheered your workout','Neue Flamme':'New flame',
  'hat mit einer Flamme auf deinen Post reagiert':'reacted to your post with a flame',
  'hat einen neuen Post geteilt':'shared a new post','Neue Posts von deinen Freunden':'New posts from your friends','Ein Freund':'A friend',
  'Noch keine Reaktionen.':'No reactions yet.','Teile ein Training — Flammen landen hier.':'Share a workout — flames land here.',
  'Heute':'Today','Übungen':'Exercises','Statistik':'Stats','Einstellungen':'Settings','Freunde':'Friends',
  'Training':'Workout','Speichern':'Save','Abbrechen':'Cancel','Bearbeiten':'Edit','Entfernen':'Remove',
  'Löschen':'Delete','Fertig':'Done','Fertig ✓':'Done ✓','Zurück':'Back','Weiter →':'Next →','Übernehmen':'Apply',
  'Aktualisieren':'Refresh','Aktualisieren…':'Refreshing…','Suchen…':'Search…','Ändern':'Change','Teilen':'Share',
  'Kopieren':'Copy','Aktivieren':'Enable','Verstanden':'Got it','Überspringen':'Skip','Hinweis:':'Note:',
  'Alle':'All','Datum':'Date','Zeit':'Time','Woche':'Week','Monat':'Month','Jahr':'Year','Gesamt':'Total',
  'Verlauf':'History','Ziele':'Goals','Ziel':'Goal','Ziel:':'Goal:','· Ziel:':'· Goal:','· Ziel':'· Goal',
  'Sätze':'Sets','Wdh':'Reps','Volumen':'Volume','Einheit':'Unit','Einheiten':'Sessions','Gewicht':'Weight',
  'Standard':'Default','Bald verfügbar':'Coming soon','Bitte halte dein Gerät im Hochformat.':'Please hold your device in portrait mode.',
  'Sprache · Language':'Language','App-Sprache':'App language','Automatisch = Gerätesprache':'Automatic = device language',
  'Diese Woche':'This week','diese Woche':'this week','× diese Woche':'× this week',
  'Training starten ▶':'Start workout ▶','Training starten':'Start workout','Aktives Training':'Active workout',
  'Training läuft':'Workout in progress','Welche Übungen heute?':'Which exercises today?',
  'Los geht’s':"Let's go","Los geht's!":"Let's go!",'Bereit für deine heutige Einheit?':"Ready for today's session?",
  'Zeit fürs Training!':'Time to work out!',
  'Letzte Trainings':'Recent workouts','Letztes Training':'Last workout','Letzte Einheiten':'Recent sessions',
  'Noch kein Training':'No workout yet','Noch keine Trainings':'No workouts yet','Noch keine Trainings.':'No workouts yet.',
  'Noch kein Training. Starte heute!':'No workout yet. Start today!','Noch keine Daten':'No data yet',
  'Noch keine Einträge':'No entries yet','Noch kein Verlauf':'No history yet','Noch keine Aktivität':'No activity yet',
  'Noch keine Trainings diese Woche':'No workouts this week yet','Noch keine 1RM-Daten':'No 1RM data yet',
  'Noch keine Einheiten':'No sessions yet','Wochen in Folge':'weeks in a row','Woche in Folge':'week in a row',
  'Wochen in Folge trainiert':'weeks trained in a row','Kalender ansehen →':'View calendar →','Kalender →':'Calendar →',
  'Erholung':'Recovery','Überblick':'Overview','Tap für Vollbild':'Tap for fullscreen','Weiter so!':'Keep it up!',
  'Deine Ziele warten — leg los!':'Your goals are waiting — get started!','Ziele erreicht':'goals reached','hinzufügen':'add',
  'Körpergewicht':'Body weight','Gewicht eintragen':'Log weight','Gewichtsverlauf':'Weight history','Einträge':'Entries',
  'Ziel bearbeiten':'Edit goal','Startgewicht':'Starting weight','Zielgewicht':'Goal weight','Ziel speichern':'Save goal',
  'Ziel zurücksetzen':'Reset goal','Ziel setzen →':'Set a goal →','🎉 Ziel erreicht!':'🎉 Goal reached!',
  'noch bis Ziel':'to go until goal','✎ Ziel anpassen':'✎ Adjust goal',
  'Trage dein Startgewicht und Zielgewicht ein. Der Fortschritt wird automatisch berechnet.':'Enter your starting weight and goal weight. Progress is calculated automatically.',
  'Start- und Zielgewicht wirklich zurücksetzen?':'Really reset starting and goal weight?',
  'Letzte 12 Wochen':'Last 12 weeks','Bester Streak':'Best streak','Trainingswochen gesamt':'Total training weeks',
  'Wochen-Streak':'Week streak','Gesamt-Volumen & Trend':'Total volume & trend','Gesamt-Volumen ·':'Total volume ·',
  'Alle Muskeln erholt':'All muscles recovered','Alle Muskeln erholt':'All muscles recovered',
  'Trainingskalender':'Training calendar','Trainingsvolumen':'Training volume',
  'Monate':'Months','Matrix':'Matrix','3 Monate':'3 months','6 Monate':'6 months','1 Jahr':'1 year',
  'Feld antippen für Details':'Tap a square for details','Kein Training':'No workout',
  'Trainings':'Workouts','Ø pro Woche':'Avg per week','Beste Serie':'Best streak',
  'Keine Widgets.':'No widgets.','Lange auf die Seite drücken oder ＋ tippen, um welche hinzuzufügen.':'Long-press the page or tap ＋ to add some.',
  'Widget hinzufügen':'Add widget','Größe ziehen':'Drag to resize','1RM-Best':'1RM best','Üb.':'ex.',
  'Wirklich alle Widgets von der Startseite entfernen?':'Really remove all widgets from the home page?',
  '🗑 Entfernen':'🗑 Remove','Keine Einheiten in den letzten 7 Tagen.':'No sessions in the last 7 days.',
  'Deine Trainingspläne':'Your training plans','Trainingspläne':'Training plans','Pläne mit einem Tipp starten':'Start plans with one tap',
  'Pläne':'Plans','Noch keine Pläne':'No plans yet','Noch keine Pläne. Mit':'No plans yet. With',
  'stellst du z. B. „Oberkörper 1" aus deinen Übungen zusammen und startest ihn künftig mit einem Tipp.':'you can build e.g. “Upper Body 1” from your exercises and start it with one tap in the future.',
  'Gestern':'Yesterday','gerade eben':'just now',
  'Wochenziel festlegen':'Set weekly goal','Eigene Kategorie':'Custom category','Name der Kategorie':'Category name',
  'Kategorie hinzufügen':'Add category','+ Eigene erstellen ...':'+ Create your own ...',
  'Wie oft pro Woche möchtest du':'How often per week do you want to','Wie oft pro Woche?':'How often per week?',
  'Ziel ändern:':'Change goal:','Kategorie entfernen':'Remove category',
  'Meine Übungen':'My Exercises','Übung suchen…':'Search exercises…','＋ Neue Übung erstellen':'＋ Create new exercise',
  'Übung hinzufügen':'Add exercise','+ Übung hinzufügen':'+ Add exercise','＋ Übung hinzufügen':'＋ Add exercise',
  'Übung bearbeiten':'Edit exercise','Übung löschen':'Delete exercise','Übung wirklich löschen?':'Really delete this exercise?',
  'Übung':'Exercise','Muskelgruppen':'Muscle groups','Muskelgruppe':'Muscle group','Muskelgruppe oder Split':'Muscle group or split',
  'Bitte eine Muskelgruppe oder einen Split wählen.':'Please choose a muscle group or split.',
  'Aus Bibliothek wählen':'Choose from library','Über 70 fertige Standard-Übungen mit Muskelgruppe':'Over 70 ready-made exercises with muscle groups',
  'Bild (optional)':'Image (optional)','Bild wählen':'Choose image','Bild konnte nicht geladen werden.':'Image could not be loaded.',
  'Bild zu groß zum Speichern — bitte kleineres wählen.':'Image too large to save — please choose a smaller one.',
  'Ziel pro Einheit':'Goal per session','Wiederholungsbereich':'Rep range','Gewichts-Schema über die Sätze':'Weight scheme across sets',
'Um wie viel das Gewicht steigt, sobald du alle Sätze am oberen Bereichsende schaffst. Leer = globaler Standard.':'How much the weight increases once you hit the top of the range on all sets. Empty = global default.',
  'Scheiben-Rechner im Training':'Plate calculator in workout',
  'Zeigt beim Gewicht-Rad, welche Scheiben pro Seite aufzustecken sind — für Langhantel-Übungen.':'Shows in the weight wheel which plates to load per side — for barbell exercises.',
'Wochentag(e) für diese Übung':'Weekday(s) for this exercise',
  'Tippe Tage an, an denen du diese Übung trainieren willst — sie erscheint im Wochenplan.':'Tap the days you want to train this exercise — it will appear in your weekly plan.',
  'Erstelle deine eigenen Übungen und baue deinen Trainingsplan auf.':'Create your own exercises and build your training plan.',
  'Noch keine Übungen':'No exercises yet','Noch keine Übungen angelegt.':'No exercises created yet.',
  'Noch keine Übungen — füge zuerst Übungen hinzu.':'No exercises yet — add exercises first.',
  'Nichts gefunden':'Nothing found','Keine Übungen hier':'No exercises here','Keine Übungen in dieser Gruppe.':'No exercises in this group.',
'Keine Übungen gefunden.':'No exercises found.','Keine Übungen gefunden':'No exercises found','Keine Übung gefunden.':'No exercise found.',
  'Keine passende Übung gefunden.':'No matching exercise found.',
  'Lege Übungen mit Muskelgruppen an, um hier eine Übersicht zu sehen.':'Create exercises with muscle groups to see an overview here.',
'z. B. Bankdrücken':'e.g. Bench Press','(schon im Training)':'(already in workout)','ohne MG':'no group',
  'Erstelle Übungen im Tab „Übungen".':'Create exercises in the “Exercises” tab.','Keine Übungen für':'No exercises for',
  'Wochenplan':'Weekly plan','Wochenplan öffnen':'Open weekly plan',
  'Plan teilen':'Share plan','Split teilen':'Share split','Plan importieren':'Import plan','Split importieren':'Import split',
  'Importieren':'Import','Trainingstage':'training days','Trainingsplan in MyGymTrack importieren':'Import training plan into MyGymTrack',
  'Freund scannt den Code mit der Kamera – der Plan öffnet direkt in GymTrack.':'A friend scans the code with their camera – the plan opens straight in GymTrack.',
  'Link teilen':'Share link','Link kopieren':'Copy link','Link kopiert':'Link copied','Kopieren nicht möglich':'Could not copy',
'QR offline nicht verfügbar – bitte mit Internet erneut öffnen.':'QR unavailable offline – reopen with internet.',
'Plan zu groß für einen QR-Code – teile einzelne Splits.':'Plan too large for a QR code – share single splits.',
'In der MyGymTrack-App öffnen':'Open in the MyGymTrack app',
'Dein Wochenplan ist noch leer.':'Your weekly plan is still empty.','Split zuerst speichern, dann teilen.':'Save the split first, then share.',
  'Dieser Split hat noch keine Übungen.':'This split has no exercises yet.','Ungültiger Plan-Link':'Invalid plan link',
  'Fehlende Übungen werden automatisch in deine Bibliothek angelegt.':'Missing exercises are added to your library automatically.',
'Beim Importieren wird dein aktueller Wochenplan ersetzt. Fehlende Übungen werden automatisch angelegt.':'Importing replaces your current weekly plan. Missing exercises are added automatically.',
'Keine Übungen im Split.':'No exercises in this split.','Importierter Split':'Imported split','(Import)':'(import)',
'Split importiert':'Split imported','Plan importiert':'Plan imported','Import fehlgeschlagen':'Import failed',
  'Plane pro Wochentag eine Trainingsgruppe oder einzelne Übungen. Wiederholt sich jede Woche.':'Plan a training group or individual exercises per weekday. Repeats every week.',
  'Vorlage laden':'Load template','PPL, Upper-Lower, Full Body … mit einem Tap übernehmen':'PPL, Upper-Lower, Full Body … apply with one tap',
  '⠿ Splits in einen Tag ziehen:':'⠿ Drag splits onto a day:','⠿ Übungen auf einen Tag ziehen, um sie hinzuzufügen':'⠿ Drag exercises onto a day to add them',
  'Übungs-Bibliothek':'Exercise library','Trainingsplan-Vorlagen':'Training plan templates',
  'Beim Übernehmen wird dein aktueller Wochenplan ersetzt. Fehlende Übungen werden automatisch in deine Bibliothek angelegt.':'Applying will replace your current weekly plan. Missing exercises are added to your library automatically.',
  'Tage und Übungen lassen sich danach jederzeit individuell anpassen oder aussetzen.':'Days and exercises can be adjusted or skipped individually at any time afterwards.',
  'Montag':'Monday','Dienstag':'Tuesday','Mittwoch':'Wednesday','Donnerstag':'Thursday','Freitag':'Friday','Samstag':'Saturday','Sonntag':'Sunday',
  'Frei':'Rest day','Gruppe':'Group','Trainingsgruppe':'Training group','Kein Training für diesen Tag geplant.':'No workout planned for this day.',
  'Icon wählen':'Choose icon','Deine Pläne':'Your plans','Oder einzeln wählen':'Or choose individually','Trainingszeit':'Training time',
  'Deine Splits':'Your splits','Neuer Split':'New split','Split bearbeiten':'Edit split','Name des Splits':'Split name',
  'Farbe':'Color','Trainingstage':'Training days','Split löschen':'Delete split',
  'Eigene Farbe':'Custom color',
  'Welchen Split trainierst du an diesem Tag?':'Which split do you train on this day?',
  'Erweitert: Gruppe oder Einzelübungen …':'Advanced: group or individual exercises …',
  'Erstelle deinen ersten Split':'Create your first split',
  'Vorlagen':'Templates','Split starten':'Start split',
  'Noch keine Splits – erstelle zuerst einen Split.':'No splits yet – create one first.',
  '⠿ Split auf einen Wochentag ziehen · oder Tag antippen':'⠿ Drag a split onto a weekday · or tap a day',
  'Kein Training':'No workout','kein Training':'no workout',
  'Bitte eine Gruppe wählen oder „Frei" auswählen.':'Please choose a group or select “Rest day”.',
  'Bereits an diesem Tag ✓':'Already on this day ✓','Plan bearbeiten':'Edit plan','Neuer Plan':'New plan',
  'Name des Plans':'Plan name','Plan löschen':'Delete plan','Gib dem Plan einen Namen.':'Give the plan a name.',
  'Wähle mindestens eine Übung.':'Choose at least one exercise.','Wähle mindestens eine Übung!':'Choose at least one exercise!',
  'Füge zuerst eine Übung hinzu!':'Add an exercise first!','Lege zuerst Übungen an!':'Create exercises first!',
  '– Übungen auswählen':'– choose exercises','Plan enthält keine vorhandenen Übungen':'Plan contains no existing exercises',
  'Übungen wählen':'Choose exercises','vorausgewählt':'preselected','aus deinem Wochenplan vorausgewählt':'preselected from your weekly plan',
  'dein Tagesplan':'your daily plan','der Plan':'the plan',
  'Push · Pull · Legs (6×/Woche)':'Push · Pull · Legs (6×/week)','Push · Pull · Legs (3×/Woche)':'Push · Pull · Legs (3×/week)',
  'Upper · Lower (4×/Woche)':'Upper · Lower (4×/week)','Full Body (3×/Woche)':'Full Body (3×/week)','Arnold Split (6×/Woche)':'Arnold Split (6×/week)',
  '6 Tage':'6 days','4 Tage':'4 days','3 Tage':'3 days',
  'Klassisches Bodybuilding-Schema. Push (Brust/Schulter/Trizeps), Pull (Rücken/Bizeps), Legs zweimal die Woche.':'Classic bodybuilding scheme. Push (chest/shoulders/triceps), pull (back/biceps), legs twice a week.',
  'Einsteiger-Variante: Eine PPL-Runde pro Woche mit 1–2 Tagen Pause zwischen Einheiten.':'Beginner variant: one PPL round per week with 1–2 rest days between sessions.',
  'Oberkörper- und Unterkörper-Splits jeweils zweimal. Solide Mischung aus Volumen und Erholung.':'Upper and lower body splits twice each. A solid mix of volume and recovery.',
  'Ganzkörper jeweils Mo/Mi/Fr. Ideal für Einsteiger oder bei wenig Zeit.':'Full body on Mon/Wed/Fri. Ideal for beginners or when short on time.',
  'Brust+Rücken, Schultern+Arme, Beine — zweimal pro Woche. Hohes Volumen, fortgeschritten.':'Chest+back, shoulders+arms, legs — twice a week. High volume, advanced.',
  'Empfohlen für dich':'Recommended for you','Plan übernehmen':'Apply plan','Ohne Plan starten':'Start without a plan',
  'Ohne Einrichtung starten — alles selbst anlegen':'Start without setup — create everything yourself',
  'Brust':'Chest','Rücken':'Back','Beine':'Legs','Arme':'Arms','Schultern':'Shoulders','Muskeln':'Muscles',
  'Oberkörper':'Upper body','Unterkörper':'Lower body','Ganzkörper':'Full body','Ober · Unter':'Upper · Lower',
  'Ober- / Unterkörper':'Upper / lower body','Ober- · Unterkörper':'Upper · lower body','Eigener Split':'Custom split',
  'Vordere Schulter':'Front delts','Seitliche Schulter':'Side delts','Hintere Schulter':'Rear delts',
  'Trapezius':'Traps','Mittlerer Rücken':'Mid back','Latissimus':'Lats','Unterer Rücken':'Lower back',
  'Bizeps':'Biceps','Trizeps':'Triceps','Bauchmuskeln':'Abs','Schräge Bauchmuskeln':'Obliques',
  'Gesäß':'Glutes','Quadrizeps':'Quads','Beinbeuger':'Leg Curls','Waden':'Calves',
  'Bankdrücken':'Bench Press','Schrägbankdrücken':'Incline Bench Press','Kurzhantel-Bankdrücken':'Dumbbell Bench Press',
  'Fliegende':'Dumbbell Flys','Liegestütze':'Push-Ups','Butterfly (Maschine)':'Pec Deck (Machine)','Kabelzug Brust':'Cable Chest Fly',
  'Klimmzüge':'Pull-Ups','Latzug':'Lat Pulldown','Rudern (Langhantel)':'Barbell Row','Kurzhantel-Rudern':'Dumbbell Row',
  'T-Bar Rudern':'T-Bar Row','Kreuzheben':'Deadlift','Rumänisches Kreuzheben':'Romanian Deadlift','Hyperextensions':'Back Extensions',
  'Überzüge':'Pullovers','Rückenheber':'Back Raises',
  'Kniebeugen':'Squats','Front-Kniebeuge':'Front Squat','Beinpresse':'Leg Press','Ausfallschritte':'Lunges',
'Beinstrecker':'Leg Extensions','Wadenheben':'Calf Raises',
'Schulterdrücken':'Overhead Press','KH-Schulterdrücken':'Dumbbell Shoulder Press','Seitheben':'Lateral Raises',
  'Frontheben':'Front Raises','Aufrechtes Rudern':'Upright Row',
  'Bizeps-Curls (KH)':'Dumbbell Curls','Bizeps-Curls (LH)':'Barbell Curls','Hammer-Curls':'Hammer Curls',
  'Konzentrations-Curls':'Concentration Curls','Trizeps-Dips':'Triceps Dips','Trizepsdrücken (Kabel)':'Triceps Pushdown (Cable)',
'French Press':'Skull Crushers','Engers Bankdrücken':'Close-Grip Bench Press','Unterarm-Curls':'Wrist Curls',
'Seitlicher Plank':'Side Plank','Beinheben':'Leg Raises','Käfer':'Dead Bug','Hängendes Beinheben':'Hanging Leg Raises',
'Laufband':'Treadmill','Rad fahren':'Cycling','Rudern (Cardio)':'Rowing (Cardio)','Seilspringen':'Jump Rope',
'Trag mindestens einen Satz ein!':'Log at least one set!',
'Training abbrechen? Eingetragene Daten werden verworfen.':'Cancel workout? Entered data will be discarded.',
'Letztes Training wirklich löschen?':'Really delete your last workout?','Training beenden':'Finish workout',
  'Training abbrechen':'Cancel workout','Pause':'Rest','Pause vorbei':'Rest over','Pause · Auto':'Rest · Auto',
  'Weiter geht’s – nächster Satz!':'Keep going – next set!','Partner-Übung':'partner exercise',
  'Superset gelöst':'Superset removed','Superset erstellt':'🔗 Superset created','Superset lösen':'🔗 Remove superset',
  'Beide Übungen im Wechsel — die Pause startet erst, wenn beide ihren Satz beendet haben.':'Both exercises alternate — the rest timer starts only when both have finished their set.',
  'Superset mit nächster Übung':'Superset with next exercise','Name (für dieses Training)':'Name (for this workout)',
  'Namen speichern':'Save name','Ziel: Sätze & Wiederholungen':'Goal: sets & reps','Wdh von':'Reps from','Wdh bis':'Reps to',
  'Bereich speichern':'Save range','⇄ Durch andere Übung ersetzen':'⇄ Replace with another exercise',
  'Übung tauschen':'Swap exercise','Übung getauscht':'Exercise swapped','Name darf nicht leer sein.':'Name must not be empty.',
  'Verlauf & Diagramm':'History & chart','Vollbild-Diagramm':'Fullscreen chart','TYP':'TYPE','+ Satz':'+ Set','kg Vol.':'kg vol.',
  'Satz-Typ wählen':'Choose set type','Aufwärmsatz':'Warm-up set','Top-Satz':'Top set','Drop-Satz':'Drop set',
  'Bis zum Versagen':'To failure','Aufwärmen':'Warm-up',
  'Regulärer Arbeitssatz mit deinem normalen Trainingsgewicht. Zählt voll zum Trainingsvolumen.':'Regular working set with your normal training weight. Counts fully towards training volume.',
  'Leichter Satz mit weniger Gewicht (ca. 40–60 %), um Muskeln, Gelenke und Nervensystem aufzuwärmen. Zählt nicht zum Trainingsvolumen.':'Light set with less weight (approx. 40–60%) to warm up muscles, joints and the nervous system. Does not count towards training volume.',
'Dein schwerster Arbeitssatz des Tages mit maximalem Gewicht und hoher Intensität (RPE 8–10). Meist nur 1 Satz pro Übung.':'Your heaviest working set of the day with maximum weight and high intensity (RPE 8–10). Usually just 1 set per exercise.',
'Direkt nach dem Versagen Gewicht um 20–40 % reduzieren und ohne Pause weitermachen, bis du erneut versagst. Sehr hohe Intensität.':'Right after failure, reduce the weight by 20–40% and continue without rest until you fail again. Very high intensity.',
  'Wiederholungen bis zur kompletten muskulären Erschöpfung — keine Reps in Reserve. Sparsam einsetzen wegen hoher Belastung.':'Reps until complete muscular exhaustion — no reps in reserve. Use sparingly due to the high strain.',
'Persönlicher Rekord!':'Personal record!','Neues Max-Gewicht':'New max weight','Neues 1RM (geschätzt)':'New estimated 1RM',
'NEUER PR':'NEW PR','Neue Bestleistung':'New personal best',
'Wert wählen':'Pick a value','oder eintippen':'or type it in','Scheiben pro Seite':'Plates per side',
  'Verfügbare Scheiben':'Available plates','Verfügbare Scheiben wählen':'Choose available plates',
'Wähle, welche Scheiben es in deinem Studio gibt. Der Rechner schlägt dann nur noch Scheiben vor, die du wirklich hast.':'Choose which plates your gym has. The calculator will then only suggest plates you actually have.',
'Alle Scheiben aktivieren':'Enable all plates','Wähle ein Gewicht …':'Pick a weight …',
'Nur die Stange — keine Scheiben nötig':'Just the bar — no plates needed',
'Training beendet!':'Workout complete!','Minuten':'Minutes','Max Gewicht':'Max weight','Meiste Sätze':'Most sets',
  'Trainings gespeichert':'workouts saved','↑ Teilen':'↑ Share','Perfekt!':'Perfect!',
'Notiz zum Training (optional)…':'Workout note (optional)…',
'1RM-Verlauf':'1RM history','(geschätzt · Epley)':'(estimated · Epley)','Volumen-Verlauf':'Volume history',
'Noch kein Training für diese Muskelgruppe.':'No workout for this muscle group yet.',
'Deine letzten Einheiten':'Your recent sessions','Top-Übungen (Epley)':'Top exercises (Epley)','Bestes 1RM':'Best 1RM',
'Geschätztes 1RM':'Estimated 1RM','Sätze · Max':'Sets · Max','Wdh · 1RM':'Reps · 1RM','Letzte':'Last',
'Gesamterholung':'Overall recovery','Trainings-Historie':'Workout history','Trainings-Historie (7 Tage)':'Workout history (7 days)',
  'Übungen in dieser Gruppe':'Exercises in this group','Empfohlene Pause':'Recommended rest',
'Leichte Ermüdung':'Light fatigue','Mittlere Ermüdung':'Moderate fatigue','Starke Ermüdung':'Heavy fatigue',
'Vollständig erholt':'Fully recovered','Nicht erholt':'Not recovered','Wenig erholt':'Barely recovered','Fast bereit':'Almost ready','Bereit':'Ready',
/* Die Erholungsliste liefert 'bereit' KLEIN (siehe _recWhen) — ohne eigenen
   Eintrag blieb in der englischen App überall „bereit" stehen. */
'bereit':'ready',
/* ── Autoregulation: Check-in, Deload, Tagesempfehlung ────────────────── */
'Alles im grünen Bereich':'All in the green',
'Plan läuft':'On plan',
'Etwas zurückgenommen':'Eased off a little',
'Erholung geht heute vor':'Recovery comes first today',
'Heute halten, nicht steigern':'Hold today, don’t push',
'Gewicht halten':'Hold the weight',
'Du hast Luft nach oben':'You have room to grow',
'Einheit im Kasten':'Session in the bag',
'Beine schwer':'Heavy legs',
'Brust & Rücken':'Chest & back',
'Größere Steigerung ist freigegeben.':'A bigger jump is unlocked.',
'Deload aktiv: ~8 % weniger Gewicht, längere Pausen.':'Deload active: ~8% less weight, longer rests.',
'Deload: ich habe die Vorschläge um ~8 % gesenkt und die Pausen verlängert.':'Deload: I lowered the suggestions by ~8% and extended your rests.',
'Leicht gesenkt, Pausen etwas länger.':'Eased down slightly, rests a little longer.',
'Energie war niedrig: Vorschläge leicht gesenkt, Pausen länger.':'Energy was low: suggestions eased down, rests longer.',
'Check-in war stark: größere Steigerung freigegeben.':'Strong check-in: a bigger jump is unlocked.',
'Letzter Check-in unauffällig — normale Progression.':'Last check-in was unremarkable — normal progression.',
'Nach deinem Check-in: Gewichte halten, Pausen etwas länger.':'After your check-in: hold the weights, rest a little longer.',
'Dein letzter Check-in passt zum Plan — normale Progression, normale Pausen.':'Your last check-in matches the plan — normal progression, normal rests.',
'Anstrengend bei niedriger Energie — ich habe die Vorschläge leicht gesenkt und die Pausen verlängert.':'Tough on low energy — I eased the suggestions down and extended your rests.',
'Letztes Training locker bei voller Energie — ich gebe die größere Steigerung frei und kürze die Pausen leicht.':'Last session felt easy on full energy — I’m unlocking the bigger jump and trimming your rests.',
'Dein letztes Training war sehr schwer. Gleiche Gewichte, etwas mehr Pause — sauber wiederholen schlägt heute jeden Sprung.':'Your last session was very hard. Same weights, a little more rest — repeating it cleanly beats any jump today.',
'Deine Muskulatur erholt sich noch. Ein ruhiger Tag zahlt sich morgen aus.':'Your muscles are still recovering. A quiet day pays off tomorrow.',
'Erholung läuft. Ich beobachte deine Muskelgruppen und melde mich, sobald wieder was bereit ist.':'Recovery is running. I’m watching your muscle groups and will speak up as soon as something is ready again.',
/* ── Live-Coach im Satz ───────────────────────────────────────────────── */
'Aufwärmsatz notiert — Technik sitzt schon.':'Warm-up set logged — your technique is already dialled in.',
'Aufgewärmt. Jetzt sauber ins Arbeitsgewicht.':'Warmed up. Now move cleanly into your working weight.',
'Das ist fast schon Arbeitsgewicht — nächster Satz zählt richtig.':'That’s nearly working weight — the next set is the real one.',
'Bis zum Versagen — den Reiz hast du gesetzt.':'To failure — you’ve set the stimulus.',
'Alles rausgeholt. Jetzt vollständig pausieren.':'Everything out of it. Now rest fully.',
'Letzter Satz steht — weiter zur nächsten Übung.':'Last set is done — on to the next exercise.',
/* ── Premium/Paywall ──────────────────────────────────────────────────── */
'Dein Coach kennt dein Training — Pläne, Technik und Fortschritt, jederzeit im Chat.':'Your coach knows your training — plans, technique and progress, in chat anytime.',
'Automatische Auswertung deiner Statistik — du siehst sofort, was wirkt.':'Automatic analysis of your stats — you see straight away what works.',
'Feedback nach jedem Satz und passende Empfehlungen in Echtzeit.':'Feedback after every set and matching recommendations in real time.',
'KI bewertet Volumen, Balance und Technik-Trends mit klarem Score.':'AI rates volume, balance and technique trends with a clear score.',
'Gerät fotografieren — Übungen und Ausführung sofort erklärt.':'Photograph a machine — exercises and form explained instantly.',
/* ── Meldungen und Fehler ─────────────────────────────────────────────── */
'Datei konnte nicht gelesen werden!':'The file could not be read.',
'Daten wiederhergestellt! App wird neu geladen.':'Data restored. The app is reloading.',
'Apple Sign In nicht verfügbar.':'Sign in with Apple is unavailable.',
'Punkte → Level':'Points → level',
'„vor 2 Stunden", „gestern" …':'“2 hours ago”, “yesterday” …',
'Wochen-Streak':'Week streak','Persönliche Rekorde':'Personal records',
/* Labels im Uebungs-Formular (SCHEME_SHORT + Wdh-Bereich) */
'Gleich':'Straight','Aufsteigend':'Ascending','Pyramide':'Pyramid','Umgekehrt':'Reverse',
'von':'from','bis':'to',
'Letzte Übung für diesen Muskel:':'Last exercise for this muscle:',
'Pro Satz wird ein geschätztes Einer-Maximum (1RM) berechnet —':'For each set an estimated one-rep max (1RM) is calculated —',
'einer Übung, „Bestwert" dein bisher bester Satz. Die 1RM aller Übungen der Gruppe werden summiert.':'of an exercise, “Best” your best set so far. The 1RMs of all exercises in the group are added up.',
/* ── Block 2: restliche sichtbare Texte ───────────────────────────────── */
'Dein Plan':'Your plan','Über mich':'About me','Ziel erreicht!':'Goal reached!',
'Ungültige Backup-Datei!':'Invalid backup file.',
'Warm genug. Ab jetzt Arbeitssätze.':'Warm enough. Working sets from here.',
'Übung abgeschlossen. Sauber durchgezogen.':'Exercise complete. Cleanly done.',
'denkt nach…':'thinking…','grün':'green','deine Muskulatur':'your muscles',
'starte jetzt':'start now','steigere jetzt':'increase now','steigere weiter':'keep increasing',
'direkt im Split übernommen':'applied directly to the split',
'Deine letzten Einheiten waren schwer bei wenig Energie. Ich nehme rund 8 % Gewicht raus und gebe dir längere Pausen.':'Your recent sessions were hard on low energy. I’m taking about 8% off the weights and giving you longer rests.',
'Letzte Einheit als „Sehr schwer" bewertet — App setzt Progression aus und verlängert Pausen um 20 %.':'Last session rated “very hard” — progression paused and rests extended by 20%.',
'Letzte Einheit anstrengend bei niedriger Energie — App hat Gewichte um 4 % gesenkt.':'Last session was tough on low energy — weights lowered by 4%.',
'Letzte Einheit leicht bei hoher Energie — App gibt größere Steigerung frei und kürzt Pausen um 8 %.':'Last session was easy on high energy — a bigger jump is unlocked and rests trimmed by 8%.',
'Letzte Einheiten mehrfach schwer bei niedriger Energie — App hat Gewichte um 8 % gesenkt und Pausen um 25 % verlängert.':'Several recent sessions were hard on low energy — weights lowered by 8% and rests extended by 25%.',
'Simulator: mit deinem Founder-Konto anmelden, um KI-Funktionen zu testen.':'Simulator: sign in with your founder account to test the AI features.',
'Erste Einheit':'First session','Muskel':'Muscle','Kraftaufbau':'Strength gain','Kraftsteigerung pro Muskel':'Strength gain per muscle',
'Kraftverteilung':'Strength balance','Jetzt':'Now','Start':'Start','Ecke antippen für Details':'Tap a corner for details','Meilensteine ·':'Milestones ·','Meilenstein erreicht':'Milestone reached','Ausgangskraft':'Starting strength','Zuwachs':'Gain',
  'Tippen für Details ›':'Tap for details ›','Gruppe gesamt':'Group total',
'Noch keine verwertbaren Sätze für diese Gruppe.':'No usable sets for this group yet.',
'So entsteht der Wert:':'How this value is calculated:',
'Pro Satz wird ein geschätztes Einer-Maximum (1RM) berechnet —':'For each set an estimated one-rep max (1RM) is calculated —',
'Gewicht × (1 + Wdh ÷ 30)':'Weight × (1 + reps ÷ 30)',
/* Auch hier fehlte im Schlüssel ein Leerzeichen — der Satz blieb deutsch. */
'. „Start" ist der beste Satz deiner':'. “Start” is the best set of your','ersten Einheit':'first session','einer Übung,':'of an exercise,',
'„Bestwert"dein bisher bester Satz. Die 1RM aller Übungen der Gruppe werden summiert.':'“Best” is your best set so far. The 1RMs of all exercises in the group are summed.',
  'Trage Gewicht & Wiederholungen ein, um deine Kraftentwicklung pro Muskel zu sehen.':'Log weight & reps to see your strength development per muscle.',
'In diesem Zeitraum gibt es noch nicht genug Trainings für eine Auswertung. Wähle einen längeren Zeitraum.':'Not enough workouts in this period for an analysis. Choose a longer period.',
'Dieser Monat':'This month','Dieses Jahr':'This year','aktueller Zeitraum':'current period','· Trainingszeit ·':'· training time ·',
/* „Awards" statt „Achievements": passt als Tab-Label in seine Spalte, ohne
   dass der Text am Rand der Leiste abreißt. */
'Erfolge':'Awards','Zurück zu Erfolge':'Back to awards','10 Std. Training':'10 h of training','50 Std. Training':'50 h of training',
'10 t Volumen':'10 t of volume','100 t Volumen':'100 t of volume','Geschafft':'Done',
'Logge dein erstes Workout, um deine Erholung zu sehen.':'Log your first workout to see your recovery.',
'Absolviere dein erstes Training, um Vorschläge zu erhalten.':'Complete your first workout to get suggestions.',
'Füge deine erste Übung hinzu und starte deinen eigenen Trainingsplan.':'Add your first exercise and start your own training plan.',
'Vorschlag fürs nächste Mal:':'Suggestion for next time:','Top-Satz 2× geschafft':'Top set done 2×',
'2× alle Ziel-Wdh geschafft':'All target reps hit 2×','Fortschritt ↑':'Progress ↑','Rückgang ↓':'Decline ↓',
  'Gleichstand →':'No change →','Erstes Training':'First workout','Weniger anzeigen':'Show less',
  "Progression – so funktioniert's":'Progression – how it works','Ausführliche Erklärung':'Detailed explanation',
  'Wie MyGymTrack dein nächstes Gewicht und deine Wdh vorschlägt':'How MyGymTrack suggests your next weight and reps',
  'Gewicht erhöhen':'Increase weight',
'Wenn du alle Sätze am oberen Bereichsende schaffst → Gewicht steigt, Wdh starten wieder unten.':'If you hit the top of the range on all sets → weight goes up, reps restart at the bottom.',
'Wdh-Fokus':'Rep focus',
'Wenn noch nicht alle Sätze vollständig → Gewicht halten, Wdh optimieren':'If not all sets are complete yet → keep the weight, optimise reps',
'Standard-Steigerung':'Default increment',
  'Gewichts-Schritt für alle Übungen ohne eigenen Wert. Leer = automatisch (+2,5 kg leicht / +5 kg schwer).':'Weight step for all exercises without their own value. Empty = automatic (+2.5 kg light / +5 kg heavy).',
  'So funktioniert Progression':'How progression works',
'1. Wiederholungsbereich (Double Progression)':'1. Rep range (double progression)',
  '2. Arbeitssätze zählen':'2. Working sets count','Nur':'Only','Normal-, Top- und Versagen-Sätze':'normal, top and failure sets',
'fließen in die Progression ein.':'feed into progression.','Aufwärmsätze (W)':'Warm-up sets (W)',
'werden ignoriert — ihr Gewicht wählst du frei (zuletzt genutztes wird vorbelegt).':'are ignored — you choose their weight freely (last used is prefilled).',
'3. Satz-Typen werden übernommen':'3. Set types carry over',
'Deine Typen (Aufwärmen, Top, Drop …) und das Schema werden ins nächste Training derselben Übung automatisch vorbelegt.':'Your types (warm-up, top, drop …) and the scheme are automatically prefilled in the next workout of the same exercise.',
'4. Gewichts-Schema über die Sätze':'4. Weight scheme across sets','Gleichbleibend:':'Straight:','Aufsteigend:':'Ascending:',
'letzter Satz am schwersten ·':'last set heaviest ·','Pyramide:':'Pyramid:','Umgekehrt:':'Reverse:',
'schwerster Satz zuerst. MyGymTrack rechnet die Einzelgewichte pro Satz aus.':'heaviest set first. MyGymTrack calculates the individual weights per set.',
'5. Top-Satz & Versagen':'5. Top set & failure','Top-Satz (T):':'Top set (T):','ein schwerer Maximalsatz (RPE 8–10).':'a heavy max set (RPE 8–10).',
'Bis zum Versagen (F):':'To failure (F):','gilt automatisch als oberes Bereich-Ende erreicht.':'automatically counts as hitting the top of the range.',
'Tipp: Trägst du im Training einen Rekord ein, wird er direkt im Eingabe-Fenster gefeiert.':'Tip: if you log a record during your workout, it’s celebrated right in the input window.',
'Alle Arbeitssätze mit demselben Gewicht (Straight Sets).':'All working sets with the same weight (straight sets).',
'Jeder Satz etwas schwerer — der letzte Satz ist der schwerste.':'Each set a bit heavier — the last set is the heaviest.',
'Erst schwerer werden bis zur Mitte, danach wieder leichter.':'Get heavier up to the middle, then lighter again.',
'Schwerster Satz zuerst, danach von Satz zu Satz leichter (Reverse Pyramid).':'Heaviest set first, then lighter set by set (reverse pyramid).',
'Eigenen Split erstellen':'Create your own split','Split bearbeiten':'Edit split','Was ist ein Split?':'What is a split?',
'Ein Split ist dein':'A split is your','Trainingsplan':'training plan',
': Du teilst dein Training in':': you divide your training into','Tage/Gruppen':'days/groups',
/* Schlüssel muss dem Textknoten ZEICHENGENAU entsprechen — hier fehlte das
   Leerzeichen vor dem Gleichheitszeichen, deshalb blieb der halbe Absatz deutsch. */
/* Satzgrenze bewusst hier: „Muskelgruppen" wird global als „Muscle groups"
   übersetzt (Großschreibung), das steht nur am Satzanfang richtig. */
'auf (z. B. „Push" = Brust, Schulter, Trizeps). Jeder Gruppe ordnest du die':'(e.g. “Push” = chest, shoulders, triceps).',
'zu, die an dem Tag drankommen. Beim Training filterst du dann bequem nach diesen Gruppen.':'are assigned to each group and trained on that day. During your workout you then simply filter by these groups.',
  'Schnell-Vorlage':'Quick template','1. Name des Splits':'1. Split name','2. Deine Trainings-Gruppen':'2. Your training groups',
'+ Gruppe hinzufügen':'+ Add group','Split löschen':'Delete split','Bitte gib dem Split einen Namen.':'Please give the split a name.',
'Mindestens eine Gruppe mit Muskeln benötigt.':'At least one group with muscles is required.',
'Diesen Split wirklich löschen?':'Really delete this split?','Bitte Namen eingeben!':'Please enter a name!',
  'Gruppen-Name (z.B. Push A)':'Group name (e.g. Push A)','z. B. Mein PPL+':'e.g. My PPL+','z. B. Oberkörper 1':'e.g. Upper Body 1',
'Willkommen bei MyGymTrack':'Welcome to MyGymTrack',
'Dein Trainings-Tagebuch mit Gewichtsvorschlägen, Plänen, Statistiken und Freunde-Rangliste. In einer Minute eingerichtet.':'Your training log with weight suggestions, plans, stats and a friends leaderboard. Set up in one minute.',
'Wie heißt du?':"What's your name?",'Optional — wird in der Freunde-Rangliste angezeigt.':'Optional — shown in the friends leaderboard.',
'Dein Vorname':'Your first name','Was ist dein Ziel?':"What's your goal?",
'Hilft uns, dir die richtigen Vorschläge zu machen.':'Helps us make the right suggestions for you.',
  'Muskeln aufbauen':'Build muscle','Mehr Masse, bessere Form':'More mass, better shape','Stärker werden':'Get stronger',
'Mehr Gewicht auf der Stange':'More weight on the bar','Abnehmen':'Lose weight','Kalorien verbrennen, definieren':'Burn calories, get lean',
'Fit & gesund bleiben':'Stay fit & healthy','Regelmäßig in Bewegung':'Move regularly',
'Wie viel Erfahrung hast du?':'How much experience do you have?','Bestimmt, welcher Trainingsplan zu dir passt.':'Determines which training plan suits you.',
  'Anfänger':'Beginner','Unter 1 Jahr Training':'Less than 1 year of training','Fortgeschritten':'Intermediate',
  '1–3 Jahre Training':'1–3 years of training','Profi':'Advanced','Über 3 Jahre Training':'Over 3 years of training',
  'Wie oft pro Woche willst du trainieren?':'How often per week do you want to train?',
  'Realistisch bleiben — lieber konstant 3× als geplant 6×.':'Stay realistic — a consistent 3× beats a planned 6×.',
  'Tage pro Woche':'days per week','Dein Startplan':'Your starting plan',
  'Basierend auf deinen Angaben. Übungen und Tage kannst du jederzeit anpassen.':'Based on your answers. You can adjust exercises and days at any time.',
  'Alles bereit':'All set',
  'Dein Wochenplan ist eingerichtet — du findest ihn im Heute-Tab. Zeit für dein erstes Training.':'Your weekly plan is set up — you’ll find it in the Today tab. Time for your first workout.',
  'Leg direkt los: Erstelle Übungen oder starte dein erstes Training im Heute-Tab.':'Get started right away: create exercises or start your first workout in the Today tab.',
  'Melde dich an':'Sign in',
  'Ein Konto braucht’s, damit deine Trainings sicher sind und du mit Freunden trainieren kannst.':'You need an account so your workouts stay safe and you can train with friends.',
  'Automatisches Cloud-Backup':'Automatic cloud backup',
  'Nie wieder Daten verlieren — auch beim Handywechsel.':'Never lose data again — even when switching phones.',
  'Freunde & Rangliste':'Friends & leaderboard',
  'Vergleiche dich und bleib gemeinsam dran.':'Compare yourself and stay on track together.',
  'Community & Flammen':'Community & flames',
  'Teile Erfolge und sammle deine Wochen-Streak.':'Share achievements and build your weekly streak.',
  'Mit Apple fortfahren':'Continue with Apple',
  'Mit Google fortfahren':'Continue with Google',
  'Mit der Anmeldung akzeptierst du unsere':'By signing in you accept our',
  'Datenschutzerklärung':'privacy policy',
  '. Wir posten nichts ohne dich.':'. We never post without you.',
  'Benachrichtigungen':'Notifications','Trainings-Erinnerungen':'Workout reminders',
  'Erinnert dich an geplante Trainings':'Reminds you of planned workouts','Uhrzeit der Erinnerung':'Reminder time',
  'Täglich zu dieser Zeit':'Daily at this time','Pausenintelligenz':'Smart rest',
  'Wählt die Satzpause automatisch je nach Übung, Belastung & Gewicht':'Chooses the rest time automatically based on exercise, strain & weight',
  'Standard-Pause':'Default rest','Feste Satzpause in Sekunden':'Fixed rest between sets in seconds',
  'Trainings und Gewicht in Apple Health sichern':'Save workouts and weight to Apple Health',
  'Community aktivieren':'Enable community',
  'Rangliste, Freunde & Gym-Karte — dein Name und deine Wochen-Statistik werden für Freunde sichtbar':'Leaderboard, friends & gym map — your name and weekly stats become visible to friends',
  'Mein Profil':'My profile','Sichtbar für Freunde in der Rangliste':'Visible to friends in the leaderboard',
  'Freunde & Rangliste':'Friends & leaderboard','Code teilen, Freunde vergleichen':'Share your code, compare with friends',
  'Privatsphäre':'Privacy','Was deine Freunde sehen dürfen':'What your friends are allowed to see',
  'Hell':'Light','Rosa':'Pink','Dunkel':'Dark','Blau':'Blue','Grün':'Green',
  'Glaseffekt':'Glass effect','Transparenter Milchglas-Look':'Translucent frosted-glass look',
  'Gewicht in':'Weight in','Wird überall in der App verwendet':'Used everywhere in the app',
  'Feedback senden':'Send feedback','Wünsche, Bugs oder Ideen — direkt an den Entwickler':'Requests, bugs or ideas — straight to the developer',
  'Daten':'Data','Daten exportieren':'Export data','Sicherheitskopie als Datei speichern':'Save a backup file',
  'Daten importieren':'Import data','Backup wiederherstellen':'Restore a backup','Rechtliches':'Legal',
  'Datenschutzerklärung':'Privacy policy','Wie deine Daten verwendet werden':'How your data is used',
  'Konto':'Account','Sichere deine Daten in der Cloud':'Back up your data in the cloud','Mit Google anmelden':'Sign in with Google',
  'Auf Updates prüfen':'Check for updates','Neueste Version installieren':'Install the latest version',
  'App-Statistiken':'App statistics','Dein Name':'Your name','Alles gespeichert auf deinem Gerät':'Everything stored on your device',
  'App installieren':'Install app','Zum Homescreen hinzufügen':'Add to home screen',
  'Als App installieren — kein App Store nötig':'Install as an app — no App Store needed','Installieren':'Install',
  'Neue Version im App Store verfügbar':'New version available in the App Store','Später schließen':'Close for later',
  'Suche leeren':'Clear search','Begleiter wählen':'Choose companion','Der treue Klassiker':'The loyal classic','Bär':'Bear',
  'Wünsche, Bug-Meldungen oder Ideen? Schreib mir eine Nachricht — ich lese jede!':'Requests, bug reports or ideas? Send me a message — I read every one!',
  'Deine Nachricht':'Your message','Was möchtest du verbessern?':'What would you like to improve?',
  'Per E-Mail senden':'Send via email','Öffnet deine Mail-App. Geht an wolterlenny362@gmail.com':'Opens your mail app. Goes to wolterlenny362@gmail.com',
  'Bitte schreibe eine Nachricht.':'Please write a message.',
  'Cloud-Sync (noch nicht eingerichtet)':'Cloud sync (not set up yet)','Cloud-Sync aktiv – tippe für Details':'Cloud sync active – tap for details',
  'Gespeichert auf deinem Gerät + in der Cloud':'Stored on your device + in the cloud','Daten in der Cloud sichern':'Back up data in the cloud',
  'Konto verbunden':'☁️ Account connected','Noch nicht eingerichtet':'Not set up yet',
  'Damit du dich mit deinem Google-Konto anmelden kannst, muss zuerst':'Before you can sign in with your Google account,',
  'ein Firebase-Projekt eingerichtet werden.':'a Firebase project needs to be set up first.','Schau in die':'Check the',
  'im Projektordner für die Anleitung.':'in the project folder for instructions.','Cloud-Sync aktiv':'☁️ Cloud sync active',
  'Deine Daten werden automatisch in deinem Google-Konto gesichert.':'Your data is automatically backed up to your Google account.',
  'Wenn du die App löschst, kannst du dich einfach wieder anmelden und alles ist da.':'If you delete the app, just sign in again and everything is back.',
  'Abmelden':'Sign out','Konto löschen':'Delete account',
  'Löscht dein Konto und alle Cloud-Daten unwiderruflich.':'Deletes your account and all cloud data irreversibly.',
  'Wirklich abmelden?\n\nDeine Trainings und Übungen bleiben auf diesem Gerät. Dein Coach beginnt für das nächste Konto von vorn: Name, Ton, Erzählbogen und das Berichtsarchiv gehen von diesem Gerät — die Zahlen der laufenden Woche rechnet er aus deinen Einheiten neu. Meldest du dich später wieder mit diesem Konto an, kommen Name und Ton zurück.':'Really sign out?\n\nYour workouts and exercises stay on this device. Your coach starts over for the next account: name, tone, session arc and the report archive leave this device — the figures for the current week are recalculated from your sessions. Sign in with this account again later and name and tone come back.',
  'Konto und alle Cloud-Daten endgültig löschen?\n\nDeine Trainings, Übungen und Einstellungen in der Cloud werden unwiderruflich entfernt. Das kann NICHT rückgängig gemacht werden.':'Permanently delete your account and all cloud data?\n\nYour workouts, exercises and settings in the cloud will be removed irreversibly. This can NOT be undone.',
  'Letzte Warnung — dein Konto wird jetzt gelöscht. Fortfahren?':'Final warning — your account will be deleted now. Continue?',
  'Zur Sicherheit musst du dich noch einmal anmelden. Danach wird dein Konto automatisch gelöscht.':'For security you need to sign in once more. Your account will then be deleted automatically.',
  'Dein Konto und alle Daten wurden gelöscht.':'✅ Your account and all data have been deleted.',
  'Dein Konto und alle Daten wurden gelöscht. Ein einzelner Eintrag mit deinen Angaben beim KI-Coach (z. B. Einschränkungen) konnte dabei nicht entfernt werden und ist für niemanden mehr erreichbar. Melde dich über „Feedback senden" in den Einstellungen, falls du möchtest, dass wir ihn entfernen.':'Your account and all data have been deleted. One entry with your AI coach details (e.g. restrictions) could not be removed and is no longer reachable by anyone. If you would like us to remove it, contact us via “Send feedback” in Settings.',
  'Melde dich mit deinem Google-Konto an, damit deine Trainings automatisch':'Sign in with your Google account so your workouts are automatically',
  'in der Cloud gespeichert werden. So gehen sie nie verloren — auch wenn':'saved to the cloud. That way they’re never lost — even if',
  'du die App löschst oder das Handy wechselst.':'you delete the app or switch phones.',
  'Falls der Google-Button nicht erscheint:':"If the Google button doesn't appear:",'Alternative Methode':'Alternative method',
  'Daten aus der Browser-Version übertragen?':'Transfer data from the browser version?','Öffne':'Open',
  'im Browser, melde dich dort zuerst mit demselben Google-Konto an — dann werden deine Daten automatisch hier synchronisiert.':'in your browser and sign in there first with the same Google account — your data will then sync here automatically.',
  'Deine aktuellen Daten (':'💡 Your current data (',') bleiben erhalten und werden automatisch übernommen.':') will be kept and merged automatically.',
  'aus der Cloud geladen':'loaded from the cloud','Firebase nicht konfiguriert.':'⚙️ Firebase not configured.',
  'Firebase ist noch nicht konfiguriert.':'⚙️ Firebase is not configured yet.',
  'Google-Login-Plugin nicht verfügbar.\nBitte die App neu starten.':'⚠️ Google sign-in plugin unavailable.\nPlease restart the app.',
  'Kein Identity Token von Apple erhalten':'No identity token received from Apple','Nicht angemeldet.':'Not signed in.',
  'Mit Google anmelden (Fallback)':'Sign in with Google (fallback)',
  'Suche nach Updates…':'⏳ Checking for updates…','Prüfung fehlgeschlagen':'❌ Check failed',
  'Update wird installiert…':'🎉 Installing update…','App startet gleich neu…':'App will restart shortly…',
  '✓ Bereits aktuell':'✓ Already up to date','Kein Netz – bitte verbinden':'❌ No connection – please go online',
  'Updates · aktuell':'Updates · up to date',
  'Freund hinzufügen':'Add friend','Freunde hinzufügen':'Add friends','Aktivität':'Activity','Rangliste':'Leaderboard','Karte':'Map',
  'Community entdecken':'Discover the community','Dein persönlicher Fitness-Tracker':'Your personal fitness tracker',
  'Cloud nicht eingerichtet':'Cloud not set up',
  'Für die Community wird Firebase benötigt — Anleitung in der CLAUDE.md.':'The community requires Firebase — see CLAUDE.md for instructions.',
  'Verbinde…':'Connecting…','Cloud-Verbindung wird aufgebaut':'Establishing cloud connection',
  'Füge Freunde hinzu, um deren Live-Status, Feed und Rangliste zu sehen — dafür meldest du dich einmal kurz an.':'Add friends to see their live status, feed and leaderboard — just sign in once to do so.',
  'Jetzt anmelden':'Sign in now','Community ist aus':'Community is off',
  'Aktiviere die Community für Freunde, Live-Status, Feed und Rangliste. Was andere sehen dürfen, bestimmst du in der Privatsphäre.':'Enable the community for friends, live status, feed and leaderboard. You decide what others can see in the privacy settings.',
  'Trainings':'Workouts','Lade Rangliste…':'Loading leaderboard…','Noch niemand zum Vergleichen.':'No one to compare with yet.',
  'Füge oben rechts Freunde hinzu.':'Add friends via the top right.','Lade Freunde…':'Loading friends…',
  'Freundschaftsanfrage':'Friend request','Noch keine Freunde':'No friends yet',
  'Füge Freunde hinzu und seht gegenseitig Live-Status, Trainings und Ranglisten.':'Add friends and see each other’s live status, workouts and leaderboards.',
  'Name oder Code suchen':'Search name or code','Dein Code':'Your code','QR-Code':'QR code','Suche…':'Searching…',
  'Befreundet':'Friends','Das bist du selbst.':"That's you.",'Ihr seid schon Freunde.':"You're already friends.",
  'Dieser Nutzer ist blockiert.':'This user is blocked.','Anfrage fehlgeschlagen:':'Request failed:',
  'Anfragen':'Add friend','Angefragt':'Requested',
  'Freund aus deiner Liste entfernen?':'Remove this friend from your list?',
  'Nutzer blockieren? Er kann dir keine Anfragen mehr senden und verschwindet aus deiner Liste.':'Block this user? They can no longer send you requests and will disappear from your list.',
  'Niemanden gefunden. Tipp: 6-stelliger Code funktioniert immer.':'No one found. Tip: the 6-digit code always works.',
  'QR lädt…':'QR loading…','QR offline nicht verfügbar':'QR unavailable offline',
  'Mit der iPhone-Kamera scannen — öffnet MyGymTrack mit deinem Code.':'Scan with the iPhone camera — opens MyGymTrack with your code.',
  'Workouts gesamt':'Total workouts','Häufigste Zeit':'Most frequent time','Lade Feed…':'Loading feed…',
  'Noch keine Aktivitäten.':'No activities yet.',
  'Beende ein Training — es erscheint automatisch im Feed deiner Freunde.':'Finish a workout — it automatically appears in your friends’ feed.',
  'Lade…':'Loading…','Blockieren':'Block','Erst Community aktivieren':'Enable the community first','Dein Code:':'Your code:',
  'Füg mich in MyGymTrack hinzu — mein Freundes-Code:':'Add me on MyGymTrack — my friend code:',
  'Streak zählt Trainingswochen in Folge.':'Streak counts consecutive training weeks.',
  'Rangliste zählt die aktuelle Woche (Mo–So).':'Leaderboard counts the current week (Mon–Sun).',
  'Trainiert gerade':'Working out now','Wochen-Vergleich mit Freunden':'Weekly comparison with friends',
  'Tippen für Rangliste & Freunde':'Tap for leaderboard & friends','Rekord':'Record','Neue':'New','Bereits':'Already',
  /* Auf Englisch stehengebliebene Texte (Community-Zeile, Live-Coach, Profil-Bio,
     Split-Hilfe, Kalender-Legende). */
  'Rangliste, Freunde & Gym-Karte — dein Name und deine Wochen-Statistik werden für Freunde sichtbar':'Leaderboard, friends & gym map — your name and weekly stats become visible to friends',
  'Tipps während des Satzes':'Tips during your set',
  'Kurz & knackig — was treibt dich an?':'Short and sweet — what drives you?',
  'Ein Split bündelt Übungen zu einem Trainingstag – z. B. „Oberkörper 1" oder „Push". Tippe auf':'A split bundles exercises into one training day – e.g. “Upper body 1” or “Push”. Tap',
  ', wähle Übungen und Wochentage.':', then pick exercises and weekdays.',
  'weniger':'less','mehr':'more',
  'Du bestimmst, was Freunde sehen. Name, Wochen-Trainingszahl und Streak sind Teil der Rangliste, solange die Community aktiv ist.':'You decide what friends see. Your name, weekly workout count and streak are part of the leaderboard while the community is active.',
  'Aktuelles Gym anzeigen':'Show current gym','Gym-Name und Position auf der Karte':'Gym name and position on the map',
  'Live-Trainingsstatus anzeigen':'Show live workout status','„Trainiert gerade" inkl. Dauer':'“Working out now” incl. duration',
  'Letztes Training anzeigen':'Show last workout','Trainingsstatistiken anzeigen':'Show workout statistics',
  'Persönliche Rekorde anzeigen':'Show personal records','Deine Top-3-1RM-Werte':'Your top 3 1RM values',
  'Aktivitätsfeed anzeigen':'Show activity feed','Beendete Trainings im Feed der Freunde':'Finished workouts in your friends’ feed',
  'Karte lädt…':'Map loading…','Leaflet nicht erreichbar':'Leaflet unreachable',
  'Karte konnte nicht geladen werden — bist du offline?':'Map could not be loaded — are you offline?',
  'Standort nicht verfügbar.':'Location unavailable.','Standort nicht verfügbar — Ortungsdienste erlauben?':'Location unavailable — allow location services?',
  'Kein Gym festgelegt':'No gym set','Dein Gym — für Freunde auf der Karte sichtbar':'Your gym — visible to friends on the map',
  'Zeig deinen Freunden, wo du trainierst':'Show your friends where you train',
  'Erst Standort wählen — Karte antippen oder Gym suchen.':'Choose a location first — tap the map or search for a gym.',
  'Mein Gym':'My gym','Mein Standort':'My location','Gym suchen (Name, Stadt)':'Search gym (name, city)',
  'Suche fehlgeschlagen':'Search failed','Tippe auf die Karte oder such oben dein Gym':'Tap the map or search for your gym above',
  'Wo deine Freunde trainieren':'Where your friends train','Tippe auf einen Pin für Details':'Tap a pin for details',
  'So sehen dich deine Freunde in Rangliste, Feed und Karte.':'This is how friends see you in the leaderboard, feed and map.',
  'Foto wählen':'Choose photo','Profil':'Profile',
  '✅ Daten wiederhergestellt! App wird neu geladen.':'✅ Data restored! The app will reload.',
  '❌ Ungültige Backup-Datei!':'❌ Invalid backup file!','❌ Datei konnte nicht gelesen werden!':'❌ File could not be read!',
  'Trainiere diese Woche, damit die Serie nicht reißt':"Train this week so the streak doesn't break",
  'Trainiere diese Woche, damit die Serie nicht reißt!':"Train this week so the streak doesn't break!",
  '✓ Trainiert':'✓ Trained','Noch nicht trainiert':'Not trained yet',
  'Unglaublich! 3 Monate in Folge — du bist eine Maschine':"Incredible! 3 months in a row — you're a machine",
  'Starke Serie! Bleib dran':'Strong streak! Keep it up',
  'Super Konstanz! Du bist auf dem richtigen Weg':"Great consistency! You're on the right track",
  'Gut gemacht! Halte die Serie am Leben':'Well done! Keep the streak alive',
  'Guter Start! Trainiere nächste Woche wieder':'Good start! Train again next week',
  'Trainiere diese Woche — starte deine Serie!':'Train this week — start your streak!',
  'Gewicht aus Apple Health importiert':'Weight imported from Apple Health',
  'Workouts werden in Apple Health gespeichert':'Workouts are saved to Apple Health',
  'Aus – es gilt die feste Standard-Pause':'Off – the fixed default rest applies',
  'Aktiv – an deinen Trainingstagen um':'Active – on your training days at','Aktiv – täglich um':'Active – daily at',
  'Dein Browser unterstützt leider keine Benachrichtigungen.':"Unfortunately your browser doesn't support notifications.",
'Lade Daten…':'Loading data…','Jetzt online':'Online now','Nutzer aktiv':'users active','Aktive Nutzer':'Active users',
'Insgesamt':'Total','Verweildauer (Sessions)':'Session duration','Sessions / 7 Tage':'Sessions / 7 days',
'Sessions / 30 Tage':'Sessions / 30 days','Wiederkehr (Retention)':'Retention','D1 · nach 1 Tag':'D1 · after 1 day',
  'D7 · nach 7 Tagen':'D7 · after 7 days','D30 · nach 30 Tagen':'D30 · after 30 days','Neu · 7 Tage':'New · 7 days',
  '↻ Neu laden':'↻ Reload','Aktualisiert sich automatisch alle 30 Sekunden.':'Refreshes automatically every 30 seconds.',
'WAU · 7 Tage':'WAU · 7 days','MAU · 30 Tage':'MAU · 30 days','Zuletzt aktualisiert:':'Last updated:',
'24.06.2026 · Plan-Widget startet wie der normale Trainingsstart':'24 Jun 2026 · Plan widget now starts like a normal workout',
  'Plan aus dem Widget öffnet jetzt zuerst die Übungs-Auswahl — du kannst Übungen prüfen, hinzufügen oder abwählen':'Starting a plan from the widget now opens the exercise selection first — review, add or deselect exercises',
  '▶️ Erst der finale „Training starten"-Button führt ins aktive Training (vorher sprang das Widget direkt rein)':'▶️ Only the final “Start workout” button enters the active workout (previously the widget jumped straight in)',
  '✅ Identischer Ablauf wie beim normalen Trainingsstart, inkl. Plan-Hinweis und Vorauswahl':'✅ Identical flow to a normal workout start, incl. plan hint and preselection',
  '24.06.2026 · Erholung zählt jetzt auch Bodyweight-Training':'24 Jun 2026 · Recovery now counts bodyweight training too',
  '🔋 Fix: Nach dem Training sank die Muskel-Erholung nicht, wenn Sätze ohne Gewicht geloggt wurden (Klimmzüge, Dips, Liegestütze, Wdh-only, Widget-Schnellstart)':'🔋 Fix: muscle recovery didn’t drop after workouts when sets were logged without weight (pull-ups, dips, push-ups, reps-only, widget quick start)',
  '💪 Bodyweight-Sätze ermüden den Muskel jetzt real — die Erholungs-Batterie fällt korrekt und füllt sich über die Zeit wieder auf':'💪 Bodyweight sets now fatigue the muscle for real — the recovery battery drops correctly and refills over time',
  '⚖️ Synthetische Last nutzt dein zuletzt geloggtes Körpergewicht; Volumen-, PR- und 1RM-Statistik bleiben unverändert (echtes Gewicht)':'⚖️ Synthetic load uses your last logged body weight; volume, PR and 1RM stats remain unchanged (real weight)',
  '29.05.2026 · Einstellungen aufgeräumt + Statistik-Suche':'29 May 2026 · Settings cleanup + stats search',
  '🧹 Einstellungen aufgeräumt: „GymTrack unterstützen", „Begleiter", „App" und „Admin" entfernt':'🧹 Settings cleaned up: removed “Support GymTrack”, “Companion”, “App” and “Admin”',
  '🐕 Begleiter-Feature komplett deaktiviert — keine Pet-Lane mehr in der Tab-Leiste':'🐕 Companion feature fully disabled — no more pet lane in the tab bar',
  '🔍 Lupen-Icon im Suchfeld der Übungen-Seite entfernt — schlichter Look':'🔍 Removed the magnifier icon from the exercises search field — cleaner look',
  '🔎 Neues Suchfeld im Statistik-Tab: Übungen direkt durchsuchen':'🔎 New search field in the Stats tab: search exercises directly',
  '28.05.2026 · 3D-Modell: Arme & Waden anatomisch korrigiert':'28 May 2026 · 3D model: arms & calves anatomically corrected',
  '🚫 Unterarm als anklickbarer Muskel komplett entfernt — Unterarm bleibt jetzt im neutralen Hautton':'🚫 Forearm removed as a clickable muscle — it now stays in the neutral skin tone',
  '💪 Bizeps schmiegt sich exakt an die Vorderseite des Oberarms, nicht mehr mit dem Unterarm verbunden':'💪 Biceps now hugs the front of the upper arm exactly, no longer connected to the forearm',
  '🦾 Trizeps korrekt an der Rückseite des Oberarms, sichtbare Ellenbogen-Gap zum Unterarm':'🦾 Triceps correctly on the back of the upper arm, with a visible elbow gap to the forearm',
  '🦵 Waden hinten an der Kniekehle (vorher leicht zu weit vorne Richtung Schienbein)':'🦵 Calves at the back of the knee (previously slightly too far forward towards the shin)',
  '🎯 Im Armbereich nur noch: Bizeps, Trizeps, vordere/seitliche/hintere Schulter':'🎯 Arm area now only: biceps, triceps, front/side/rear delts',
  '🧪 Diesmal: GLB direkt in Blender geladen + Vertex-Daten pro Z-Schicht ausgewertet — Kapseln liegen nachweisbar im Modell (max 2 cm Abweichung)':'🧪 This time: GLB loaded directly in Blender + vertex data evaluated per Z layer — capsules verifiably sit inside the model (max 2 cm deviation)',
  '28.05.2026 · 3D-Modell: Bizeps & vordere Schulter korrigiert':'28 May 2026 · 3D model: biceps & front delts corrected',
  '💪 Bizeps-Markierung sitzt jetzt exakt auf der Oberarm-Vorderseite (vorher lag die Capsule vor dem Arm in der Luft)':'💪 Biceps marker now sits exactly on the front of the upper arm (previously the capsule floated in front of the arm)',
  '🤷 Vordere Schulter (anteriorer Deltoid) korrekt am oberen Schulterrand statt im Kopf-/Halsbereich':'🤷 Front delt (anterior deltoid) correctly at the top of the shoulder instead of the head/neck area',
  '🎯 Capsule-Koordinaten durch direkte Vertex-Analyse des GLB-Modells kalibriert (kein Raten mehr)':'🎯 Capsule coordinates calibrated via direct vertex analysis of the GLB model (no more guessing)',
  '🔧 Auch Trizeps + seitliche/hintere Schulter an die echte Arm-Geometrie (T-Pose) angepasst':'🔧 Triceps + side/rear delts also adjusted to the real arm geometry (T-pose)',
  '28.05.2026 · 3D-Muskel-Ermüdung im Statistik-Tab':'28 May 2026 · 3D muscle fatigue in the Stats tab',
  '🧬 Echte anatomische 3D-Figur (Sketchfab-Modell "MaleMuscle" von HEPL3D, CC-BY 4.0) statt prozeduraler Ellipsoide':'🧬 Real anatomical 3D figure (Sketchfab model “MaleMuscle” by HEPL3D, CC-BY 4.0) instead of procedural ellipsoids',
  '👆 Mini-Vorschau im Statistik-Tab: Daumen-Wischen dreht die Figur leicht (~±40°)':'👆 Mini preview in the Stats tab: thumb swipe rotates the figure slightly (~±40°)',
  '🔄 Vollbild-Ansicht: 360°-Rotation in beide Richtungen, Auf/Ab-Wischen kippt die Ansicht':'🔄 Fullscreen view: 360° rotation in both directions, swipe up/down tilts the view',
  '🎯 Tap auf einen Muskel öffnet Detail-Overlay mit %-Ring, letztem Training, empfohlener Pause & 7-Tage-Historie':'🎯 Tapping a muscle opens a detail overlay with % ring, last workout, recommended rest & 7-day history',
  '🎨 Farbcode: Rot = sehr stark ermüdet · Orange = mittel · Grün = leicht · Hautton = erholt':'🎨 Color code: red = heavily fatigued · orange = moderate · green = light · skin tone = recovered',
  '📊 Tap auf Volumen-Chart → Vollbild für genauere Ansicht':'📊 Tap the volume chart → fullscreen for a closer look',
  '27.05.2026 · Großes Feature-Update':'27 May 2026 · Big feature update',
  '🎡 Apple-Style Drehrad-Picker für Gewicht & Wiederholungen statt Tastatur':'🎡 Apple-style wheel picker for weight & reps instead of the keyboard',
  '⚖️ kg / lbs umschaltbar in den Einstellungen — automatische Umrechnung':'⚖️ kg / lbs switchable in Settings — automatic conversion',
  '✏️ Übung im Training tippen → umbenennen oder durch andere ersetzen':'✏️ Tap an exercise during a workout → rename or replace it',
  '➕ Eigene Splits erstellen: Plus-Button bei Muskeln/PPL/Ober-Unter mit eigenen Gruppen & Muskel-Auswahl':'➕ Create your own splits: plus button next to Muscles/PPL/Upper-Lower with custom groups & muscle selection',
  '📈 Progression intelligenter: bei eingebrochenen Wdh wird ein realistisches Wdh-Ziel vorgeschlagen statt nur Gewicht halten':'📈 Smarter progression: when reps collapse, a realistic rep goal is suggested instead of just holding the weight',
  'ℹ️ i-Button pro Übung im Training öffnet eine ausführliche Progressions-Erklärung':'ℹ️ i-button per exercise during a workout opens a detailed progression explanation',
  '↕️ Drag & Drop scrollt jetzt automatisch nach oben/unten, damit Wochentage immer erreichbar sind':'↕️ Drag & drop now auto-scrolls up/down so weekdays are always reachable',
  '✉️ Feedback senden direkt aus den Einstellungen per Mail an den Entwickler':'✉️ Send feedback straight from Settings via email to the developer',
  '🚫 Icons komplett entfernt: keine Emoji-Auswahl beim Erstellen, keine Emojis vor Übungsnamen mehr':'🚫 Icons removed entirely: no emoji picker when creating, no more emojis in front of exercise names',
  'Satz-Typ-Button: Tap öffnet jetzt Auswahl-Popup mit Erklärungen zu Normal, Aufwärmsatz, Top-Satz, Drop-Satz & Bis-zum-Versagen':'Set-type button: tap now opens a picker popup explaining normal, warm-up, top, drop & to-failure sets',
  'Neuer Satz-Typ „T" (Top-Satz) für den schwersten Arbeitssatz des Tages':'New set type “T” (top set) for the heaviest working set of the day',
'Übungen-Liste: weißes Icon-Feld verschwindet, wenn kein Emoji gewählt wurde — Text rückt nach links':'Exercise list: the white icon box disappears when no emoji is chosen — text moves left',
  'Heute-Seite: Begrüßung & Vorschlagskarten ohne Emojis':'Today page: greeting & suggestion cards without emojis',
'Cardio-Timer: Ring pulsiert dynamisch mit umlaufendem Lichtbogen während Training':'Cardio timer: ring pulses dynamically with a moving light arc during workouts',
  '✏️ Übungen-Tab: Tap auf Übung öffnet jetzt Bearbeiten statt Statistik':'✏️ Exercises tab: tapping an exercise now opens Edit instead of Stats',
  '➕ „Übung hinzufügen"-Button jetzt oben über der Liste':'➕ “Add exercise” button now at the top above the list',
  '🔄 Updates werden jetzt zuverlässig erkannt: regelmäßiger Check alle 3 Min + beim App-Wiederöffnen':'🔄 Updates are now detected reliably: regular check every 3 min + on app reopen',
  '✓ Bestätigungs-Toast nach jedem Update mit Versionsnummer':'✓ Confirmation toast after every update with the version number',
  'Vorschläge diese Woche: Box scrollt intern – Startseite bleibt kompakt':'This week’s suggestions: box scrolls internally – home page stays compact',
  '👆 Übungen: Nach links wischen zeigt Löschen-Button – schnell & ohne Detail-Ansicht':'👆 Exercises: swipe left to reveal the delete button – quick & without the detail view',
  '25.05.2026 · Mehrere Updates':'25 May 2026 · Multiple updates',
  '🗂️ Trainingsplan-Vorlagen liefern jetzt konkrete Übungen pro Tag':'🗂️ Training plan templates now include concrete exercises per day',
  '🖐️ Drag & Drop: Übungen in „Meine Übungen" und im aktiven Training umsortieren':'🖐️ Drag & drop: reorder exercises in “My Exercises” and in the active workout',
  '🎚️ Splits als Chips ins Wochenplan-Sheet zum Reinziehen':'🎚️ Splits as chips in the weekly plan sheet for dragging in',
  '🔄 Training läuft im Hintergrund: Mini-Banner oben mit Timer':'🔄 Workout runs in the background: mini banner at the top with a timer',
  '⬅️ Minus-Button (Satz löschen) jetzt links statt rechts':'⬅️ Minus button (delete set) now on the left instead of the right',
  '🎯 Geführte Tour: Spotlight führt dich durch jedes Feature':'🎯 Guided tour: a spotlight walks you through every feature',
  '✨ 19 Schritte durch alle Tabs mit pulsierendem Glow':'✨ 19 steps through all tabs with a pulsing glow',
  '🎓 Jederzeit erneut über Einstellungen → App → „Tour neu starten"':'🎓 Restart any time via Settings → App → “Restart tour”',
  '🔥 Streak-Counter im Heute-Tab':'🔥 Streak counter in the Today tab',
  '📚 Übungs-Bibliothek: 60+ Standard-Übungen':'📚 Exercise library: 60+ standard exercises',
  '📊 Aktivitäts-Heatmap (12 Monate, GitHub-Style)':'📊 Activity heatmap (12 months, GitHub style)',
  '👀 Live-Vergleich beim Training: „letztes Mal: X kg × Y"':'👀 Live comparison during workouts: “last time: X kg × Y”',
  '🔍 Suchleiste im Übungen-Tab':'🔍 Search bar in the Exercises tab',
  '🏷️ Satz-Typen: Aufwärmen, Drop-Satz, Bis-zum-Versagen':'🏷️ Set types: warm-up, drop set, to failure',
  '📳 Haptisches Feedback beim Satz-Abhaken und Tab-Wechsel':'📳 Haptic feedback when checking off sets and switching tabs',
  '🟢 Grünes Theme zusätzlich zu Hell, Rosa, Dunkel, Blau':'🟢 Green theme in addition to Light, Pink, Dark, Blue',
  '🔔 Trainings-Erinnerungen täglich, Uhrzeit frei wählbar':'🔔 Daily workout reminders, time freely selectable',
'Satz-Checkboxen: abhaken, Zeile wird ausgegraut':'Set checkboxes: check off, the row is greyed out',
'Flüssige Tab-Animation als Wasserblase':'Fluid tab animation as a water bubble',
'Wochenplan: Übungen Tagen zuordnen (Mo–So)':'Weekly plan: assign exercises to days (Mon–Sun)',
  '🗓️ Kalender-Symbol oben rechts in „Meine Übungen"':'🗓️ Calendar icon at the top right of “My Exercises”',
  '🎯 Pro Tag: Trainingsgruppe oder einzelne Übungen':'🎯 Per day: a training group or individual exercises',
  '👀 Wochenvorschau im Übungen-Tab':'👀 Week preview in the Exercises tab',
  'Wochenplan-Vorauswahl beim Training-Start':'Weekly plan preselection when starting a workout',
  '💪 1RM-Berechnung via Epley-Formel':'💪 1RM calculation via the Epley formula',
  '📈 1RM-Verlauf-Chart in der Übungs-Detailansicht':'📈 1RM history chart in the exercise detail view',
  '☁️ Google Login & Cloud-Sync':'☁️ Google sign-in & cloud sync',
  '📊 Muskelgruppen-Statistik mit Verlaufsdiagramm':'📊 Muscle group stats with a history chart',
  '🏃 Cardio-Timer mit Hintergrund-Benachrichtigung':'🏃 Cardio timer with background notification',
  '14.07.2026 · MyGymTrack spricht jetzt Englisch':'14 Jul 2026 · MyGymTrack now speaks English',
  '🌍 Komplette englische Übersetzung — die App wählt die Sprache automatisch nach deiner Gerätesprache':'🌍 Complete English translation — the app picks the language automatically based on your device language',
  '⚙️ Manuelle Wahl in den Einstellungen: Auto · Deutsch · English':'⚙️ Manual choice in Settings: Auto · Deutsch · English',
  '📱 Homescreen-Widget und Live-Activity folgen der Systemsprache':'📱 Home screen widget and Live Activity follow the system language',
  // ── Heute-Widgets: Titel · Label · Beschreibung ──
  'Wochenziele':'Weekly goals','1RM-Bestwerte':'1RM bests','Trainingswoche · 7 Tage':'Training week · 7 days',
  'Wochen-Tracker-Ringe':'Weekly tracker rings','Wochenübersicht Mo–So':'Week overview Mon–Sun','Gewicht & Verlauf':'Weight & history','Deine letzten Einheiten':'Your recent sessions',
  'Schnellstart-Button':'Quick-start button','Wochen in Folge':'Weeks in a row','Muskel-Erholung':'Muscle recovery',
  'Trainings-Heatmap':'Workout heatmap','Volumen-Verteilung':'Volume distribution','Schnellzugriff':'Quick access',
  'Wochen-Streak':'Week streak','Gesamt-Volumen':'Total volume','Trainings-Streak':'Workout streak',
  // ── Kraftsteigerung / Meilensteine ──
  'Meilensteine':'Milestones','Bestwert':'Best','alle gleich':'all the same','hoch und wieder runter':'up and back down',
  '. Schaffst du in':'. If, in',
  'Arbeitssätzen das obere Ende (12), steigt das Gewicht — und du startest nächstes Mal wieder unten im Bereich (6). Bis dahin baust du Satz für Satz Wiederholungen auf.':'working sets you hit the top end (12), the weight goes up — and next time you start again at the bottom of the range (6). Until then you build up reps set by set.',
  'allen':'all','＋ Plan':'＋ Plan',
  '⭐ Zuletzt':'⭐ Recent','🫀 Körper':'🫀 Body','🏆 Erfolg':'🏆 Success','🎨 Symbole':'🎨 Symbols','🐾 Tiere':'🐾 Animals',
  // ── Diagnose / Admin ──
  'Firebase nicht konfiguriert':'Firebase not configured','Firebase configured':'Firebase configured',
  'Admin-Modus auf diesem Gerät deaktivieren?':'Disable admin mode on this device?',
  'Bitte zuerst anmelden — Admin-Modus benötigt deine UID.':'Please sign in first — admin mode needs your UID.',
  'Diagnose läuft…':'Running diagnostics…','Diagnose-Element nicht da — alte Version aktiv':'Diagnostics element missing — old version active',
  'Nicht eingeloggt (currentUser ist null)':'Not signed in (currentUser is null)',
  'UID stimmt mit Admin-UID überein':'UID matches admin UID','UID stimmt NICHT mit Admin-UID überein':'UID does NOT match admin UID',
  /* Premium / KI-Coach — Paywall */
  'MyGymTrack Premium':'MyGymTrack Premium','Dein KI-Coach für MyGymTrack':'Your AI coach for MyGymTrack',
  'Chat, Live-Tipps im Training und automatische Trainingsanalyse — für weniger als einen Proteinriegel im Monat.':'Chat, live tips during training, and automatic workout analysis — for less than a protein bar a month.',
  'KI-Chat':'AI Chat','Frag deinen Coach zu Übungen, Plänen & Fortschritt':'Ask your coach about exercises, plans & progress',
  'Live-Coach im Training':'Live coach during training','Tipps & Anpassungen direkt während des Satzes':'Tips & adjustments right during your set',
  'Trainingsanalyse':'Workout analysis','KI bewertet Volumen, Balance & Technik-Trends':'AI evaluates volume, balance & technique trends',
  'Fortschritts-Insights':'Progress insights','Automatische Auswertung deiner Statistik':'Automatic evaluation of your stats',
  'Jährlich':'Yearly','Monatlich':'Monthly',
  'pro Jahr':'per year','pro Monat':'per month',
  'Nutzungsbedingungen':'Terms of Use','Datenschutz':'Privacy',
  'Premium freischalten':'Unlock Premium','Premium schließt du in der MyGymTrack iOS-App ab.':'You unlock Premium in the MyGymTrack iOS app.',
  'Kauf läuft…':'Purchase in progress…','Premium aktiv ✓':'Premium active ✓',
  'Kauf wartet auf Bestätigung (z. B. Familienfreigabe).':'Purchase awaiting approval (e.g. Family Sharing).',
  'Käufe wiederherstellen geht nur in der iOS-App.':'Restoring purchases only works in the iOS app.',
  'Premium aktiv — willkommen zurück!':'Premium active — welcome back!','Kein aktives Abo gefunden.':'No active subscription found.',
  'Abo verwalten geht nur in der iOS-App.':'Managing your subscription only works in the iOS app.',
  'Du hast dein monatliches KI-Limit erreicht.':'You have reached your monthly AI limit.','KI gerade nicht erreichbar.':'AI is currently unavailable.',
  'Bitte zuerst anmelden.':'Please sign in first.','Käufe wiederherstellen':'Restore purchases',
  /* Premium / KI-Coach — Einstellungen */
  'Premium aktiv':'Premium active','Kein Premium':'No Premium',
  'KI-Chat, Live-Coach & Trainingsanalyse freischalten':'Unlock AI chat, live coach & workout analysis',
  'Abo verwalten':'Manage subscription','In den App-Store-Einstellungen öffnen':'Open in App Store settings',
  'Abo auf diesem Gerät erneut aktivieren':'Reactivate subscription on this device','KI-Anfragen':'AI requests',
  'Mit Premium freischalten':'Unlock with Premium','Unbegrenzt':'Unlimited','Stand wird geladen…':'Loading balance…',
  'übrig diesen Monat':'left this month','Limit erreicht — Reset am Monatsanfang':'Limit reached — resets at the start of the month',
  'Tagesempfehlung auf der Startseite':'Daily recommendation on the home screen','Trainingsvorschlag laut Erholung deiner Muskelgruppen':'Training suggestion based on your muscle group recovery',
  /* KI-Coach — Bubble, Radialmenü, Chat, Analyse (Phase C) */
  'KI-Coach':'AI coach','Trainingsplan erstellen':'Create workout plan','Workout optimieren':'Optimize workout',
  'Fortschritt analysieren':'Analyze progress','KI-Einstellungen':'AI settings',
  'Frag deinen Coach…':'Ask your coach…','Senden':'Send',
  'Frag mich zu Übungen, Technik oder lass dir einen kompletten Trainingsplan erstellen.':'Ask me about exercises, technique, or have me build you a complete workout plan.',
  'Erstelle mir einen Trainingsplan':'Create a workout plan for me','Alternative zu einer Übung finden':'Find an alternative exercise',
  'Wie kann ich mein Volumen steigern?':'How can I increase my volume?','Wo bin ich unausgeglichen?':'Where am I unbalanced?',
  'Wie viel Volumen diese Woche?':'How much volume this week?',
  /* Kontextabhaengige Frage-Chips (Task 5) — drei Chip-Reihen je Trainingszustand */
  'Was ist mein nächster Satz?':'What’s my next set?','Wie soll ich mich aufwärmen?':'How should I warm up?',
  'Wie viele Sätze noch?':'How many sets left?',
  'Alternative zu dieser Übung':'Alternative to this exercise','Wie lief die Einheit?':'How did the session go?',
  'Wie lang ist meine Streak?':'How long is my streak?','Was steht als Nächstes an?':'What’s next?',
  'Wie viele Trainings diese Woche?':'How many workouts this week?',
  'Plan importieren':'Import plan','Hier ist dein Plan:':'Here is your plan:',
  'Dein aktueller Wochenplan wird ersetzt. Weiter?':'Your current weekly plan will be replaced. Continue?',
  'Plan importiert — du findest ihn im Heute-Tab.':'Plan imported — you’ll find it in the Today tab.',
  'Wird analysiert…':'Analyzing…','Analyse gerade nicht möglich.':'Analysis is not possible right now.',
  'Beobachtungen':'Observations','Empfehlungen':'Recommendations','Keine Auswertung erhalten.':'No evaluation received.',
  'Analyse':'Analysis',
  /* KI-Coach — Live-Coach im Training (Phase D) */
  'KI-Coach aktiv':'AI coach active','Annehmen':'Accept','Ignorieren':'Ignore','Übernommen':'Applied',
  'Coach aktiv':'Coach live','Coach denkt nach…':'Coach is thinking…',
  'Ist gegen Richtwert':'Actual vs. target',
  // Rückmeldung nach „Übernehmen" in der KI-Analyse (Toast wird aus Fragmenten gebaut)
  'Ziel angepasst':'Target updated','neues Ziel':'new target','ergänzt in':'added to',
  'zu deinen Übungen hinzugefügt':'added to your exercises',
  'im laufenden Training aktualisiert':'updated in your live workout',
  /* Post-Workout-Check-in (Phase E) */
  'Wie hat sich dein Training angefühlt?':'How did your workout feel?',
  'Sehr leicht':'Very easy','Gut':'Good','Anstrengend':'Tough','Sehr schwer':'Very hard',
  'Energielevel':'Energy level','Niedrig':'Low','Mittel':'Medium','Hoch':'High',
  /* KI-Einblicke im Statistik-Tab (Phase F) */
  'Einblicke':'Insights','Volumentrend':'Volume trend',
  'Dein Trainingsvolumen bleibt seit Wochen stabil.':'Your training volume has stayed steady for weeks.',
  'Dein Trainingsvolumen steigt in den letzten Wochen.':'Your training volume has been rising lately.',
  'Dein Trainingsvolumen sinkt in den letzten Wochen.':'Your training volume has been dropping lately.',
  'Vernachlässigte Muskelgruppe':'Lagging muscle group','Bester Wiederholungsbereich':'Best rep range',
  'Trainingsfrequenz':'Training frequency','Bestleistungen':'Personal records',
  '1 neue Bestleistung in den letzten 4 Wochen.':'1 new PR in the last 4 weeks.',
  'Belastungsempfinden':'Perceived effort',
  'Du empfindest deine Trainings zuletzt als anstrengender.':'You’ve been rating your workouts as tougher lately.',
  'Du empfindest deine Trainings zuletzt als leichter.':'You’ve been rating your workouts as easier lately.',
  'KI-Monatsanalyse':'AI monthly summary',
  'Tippen für eine KI-Zusammenfassung deines Monats.':'Tap for an AI summary of your month.',
  /* Check-in bremst Progression (Phase G) */
  'Empfehlung für heute':'Recommendation for today','Ausblenden':'Dismiss','Später':'Later',
  // Changelog 25.07.2026 (Check-in-Autoregulation + neue Tagesempfehlung)
  '25.07.2026 · Dein Check-in steuert jetzt das nächste Training':'25 Jul 2026 · Your check-in now steers your next workout',
  '🧠 Der KI-Coach wendet dein Post-Workout-Feedback wirklich an: Gewichtsvorschläge, Satzpausen und Progression passen sich automatisch an Gefühl & Energielevel an':'🧠 The AI coach really acts on your post-workout feedback: weight suggestions, rest times and progression adapt to feel & energy automatically',
  '📉 Mehrfach schwer bei wenig Energie → automatischer Deload (~8 % weniger Gewicht, längere Pausen)':'📉 Repeatedly hard on low energy → automatic deload (~8% less weight, longer rest)',
  '🚀 Locker bei voller Energie → größere Steigerung wird sofort freigegeben':'🚀 Easy on full energy → the bigger jump is unlocked right away',
  '💬 Beim Trainingsstart sagt der Coach an, was er aus deinem Check-in gemacht hat':'💬 At workout start the coach tells you what it made of your check-in',
  '✨ Tagesempfehlung auf der Startseite komplett neu: Erholungsring, KI-Aura und tägliches Briefing — auch an Plan- und Erholungstagen':'✨ Brand-new daily recommendation on the home screen: recovery ring, AI aura and a daily briefing — on planned and recovery days too',
  /* KI-Suite 2026-07: Paywall / Plan-Wizard / Geräte-Scanner / Profil-Ausbau / Chat */
  'Dein persönlicher KI-Coach: Chat, Live-Tipps im Training, Analysen & Geräte-Scanner.':'Your personal AI coach: chat, live tips during training, analyses & machine scanner.',
  'Weniger als ein Proteinriegel im Monat':'Less than a protein bar a month',
  'KI-Chat & Trainingsplan':'AI chat & training plan','Dein Coach kennt dein Training — Pläne, Technik, Fortschritt':'Your coach knows your training — plans, technique, progress',
  'Feedback nach jedem Satz, passende Satz-Empfehlungen in Echtzeit':'Feedback after every set, smart set recommendations in real time',
  'Geräte-Scanner':'Machine scanner','Gerät fotografieren — Übungen & Ausführung sofort erklärt':'Snap a machine — exercises & form explained instantly',
  'Nicht eindeutig erkannt — halte dich an die Schritte':'Not clearly identified — follow the steps below',
  'KI bewertet Volumen, Balance & Technik-Trends mit Score':'AI rates volume, balance & technique trends with a score',
  'Jetzt freischalten':'Unlock now','Jederzeit kündbar':'Cancel anytime','Über deinen App Store':'Via your App Store','Sofort aktiv':'Active instantly',
  // Paywall-Showcase (_PW_FEATS) — die Texte dort sind laenger als die Kurzform
  // weiter oben; tr() matcht exakt, deshalb brauchen sie eigene Eintraege.
  'Dein Coach kennt dein Training — Pläne, Technik und Fortschritt, jederzeit im Chat.':'Your coach knows your training — plans, technique and progress, anytime in chat.',
  'Feedback nach jedem Satz und passende Empfehlungen in Echtzeit.':'Feedback after every set and matching recommendations in real time.',
  'Gerät fotografieren — Übungen und Ausführung sofort erklärt.':'Snap a machine — exercises and form explained instantly.',
  'KI bewertet Volumen, Balance und Technik-Trends mit klarem Score.':'AI rates volume, balance and technique trends with a clear score.',
  'Automatische Auswertung deiner Statistik — du siehst sofort, was wirkt.':'Automatic evaluation of your stats — you see instantly what works.',
  // Paywall-CTA (_pwBotHTML) + Live-Coach-Zeile in den Premium-Einstellungen
  'Jahresplan freischalten':'Unlock yearly plan','Monatsplan freischalten':'Unlock monthly plan',
  'Tipps während des Satzes':'Tips during your set',
  'nur 1,67 €/Monat':'just €1.67/month','NEU':'NEW',
  'Dein perfekter Plan':'Your perfect plan','Wie oft pro Woche?':'How often per week?',
  'Was ist dein Ziel?':'What is your goal?','Wie viel Zeit pro Einheit?':'How much time per session?',
  'Verletzungen oder Einschränkungen?':'Injuries or limitations?',
  'Bei Schmerzen bitte ärztlich abklären.':'Please see a doctor for pain.',
  'Noch Wünsche?':'Anything else?','Optional — z. B. „nur Kurzhanteln". Im Chat weiter anpassbar.':'Optional — e.g. "dumbbells only". Refine later in chat.',
  'Plan erstellen lassen':'Create my plan',
  'Muskelaufbau':'Muscle growth','Kraft':'Strength','Abnehmen':'Lose weight','Fit bleiben':'Stay fit',
  'Keine':'None','Knie':'Knee','Schulter':'Shoulder','Unterer Rücken':'Lower back','Ellenbogen':'Elbow','Handgelenk':'Wrist','Hüfte':'Hip',
  'Erstelle mir meinen perfekten Trainingsplan.':'Create my perfect training plan.',
  'Trainingstage pro Woche:':'Training days per week:','Ziel:':'Goal:','Zeit pro Einheit:':'Time per session:','Minuten':'minutes',
  'Verletzungen/Einschränkungen:':'Injuries/limitations:','Wünsche:':'Wishes:',
  'Bitte erstelle direkt den kompletten Wochenplan.':'Please create the complete weekly plan right away.',
  'Plan übernehmen':'Apply plan','Trainingstage':'training days','Dein bisheriger Wochenplan wird ersetzt.':'Your current weekly plan will be replaced.',
  'Importieren — andere Übungen behalten':'Import — keep other exercises',
  'Importieren + nicht verplante Übungen löschen':'Import + delete unused exercises',
'Beim Löschen bleibt deine Trainings-Historie erhalten — nur die Übungen verschwinden aus deiner Liste.':'Deleting keeps your workout history — only the exercises disappear from your list.',
'Plan importiert & Übungsliste aufgeräumt.':'Plan imported & exercise list cleaned up.',
  'Gerät scannen':'Scan machine','Gerät fotografieren':'Photograph a machine',
  'Die KI erkennt das Gerät und zeigt dir passende Übungen mit Ausführung.':'The AI identifies the machine and shows matching exercises with form guides.',
  'Aus Fotos wählen':'Choose from photos','Gerät wird erkannt…':'Identifying machine…',
  'Kein Trainingsgerät erkannt.':'No training machine detected.',
  'Versuch es mit einem Foto, auf dem das Gerät komplett zu sehen ist.':'Try a photo showing the whole machine.',
'Nochmal fotografieren':'Take another photo','Erkannt von deinem KI-Coach':'Identified by your AI coach',
'Übungen an diesem Gerät':'Exercises on this machine','So führst du sie aus':'How to perform it',
'Häufigster Fehler:':'Most common mistake:','Neues Foto':'New photo','In meine Übungen':'Add to my exercises',
  'Lade Ausführungs-Animation…':'Loading form animation…','Ausführung':'Form',
  'Übung ist schon in deiner Liste.':'Exercise is already in your list.','Übungslimit erreicht.':'Exercise limit reached.',
  'Trainingserfahrung':'Training experience','Deine Stärken':'Your strengths','Über dich':'About you','Zeichen übrig':'characters left',
  'Bankdrücken':'Bench press','Kniebeugen':'Squats','Kreuzheben':'Deadlift','Schulterdrücken':'Overhead press','Klimmzüge':'Pull-ups','Ausdauer':'Endurance','Beweglichkeit':'Mobility','Disziplin':'Discipline',
  'Einsteiger':'Beginner','Fortgeschritten':'Intermediate','Erfahren':'Experienced','Profi':'Pro',
'Jahr':'year','Jahre':'years','unter 1 Jahr':'under 1 year','Monat':'month','Monate':'months',
'Über':'About','Stärken':'Strengths','Meist trainiert':'Most trained','Nachricht':'Message','Nachricht…':'Message…',
'Kurz & knackig — was treibt dich an?':'Short & sweet — what drives you?',
  'So sehen dich deine Freunde in Rangliste, Feed, Karte und auf deinem Profil.':'This is how friends see you in the leaderboard, feed, map and on your profile.',
  /* Profil-Ausbau 2026-07-25: Kopfzeile, Maßband, Lieblingsübungen, Anfragen-Feedback */
  'Dein Name':'Your name','Geburtsdatum':'Date of birth','Alter':'Age','Foto entfernen':'Remove photo',
  'Noch keine Erfahrung':'No experience yet','Lieblingsübungen':'Favourite exercises',
  'Übung suchen':'Search exercise','Keine Übung gefunden':'No exercise found',
'Noch keine gewählt — such unten nach deinen Übungen.':'None picked yet — search your exercises below.',
'So sehen dich deine Freunde in Rangliste, Feed, Karte und auf deinem Profil. Vom Geburtsdatum teilst du nur das Alter — das Datum selbst bleibt auf deinem Gerät.':'This is how friends see you in the leaderboard, feed, map and on your profile. Only your age is shared — the date itself stays on your device.',
'ist jetzt dein Freund':'is now your friend','Ihr seid jetzt Freunde':"You're friends now",
  'Anfrage an':'Request to','gesendet':'sent','Anfrage zurückgezogen':'Request withdrawn',
  'Anfragen wurden angenommen':'requests were accepted','möchte dir folgen':'wants to follow you','Code':'Code',
  'Noch keine Nachrichten — sag Hallo!':'No messages yet — say hi!','Chat gerade nicht verfügbar.':'Chat unavailable right now.',
  'Nachricht konnte nicht gesendet werden.':'Message could not be sent.',
  'Top-Satz-Chance':'Top-set opportunity','Top-Satz-Chance erkannt.':'Top-set opportunity detected.','Extra-Satz':'Extra set','Normal weiter':'Continue as planned',
  'Oberes Wdh-Ende erreicht — nächstes Mal ist mehr Gewicht drin.':'Top of rep range reached — more weight next time.',
'Bereichs-Maximum geschafft. Progression steht an.':'Range max done. Progression is due.',
'Dauer':'Duration','Gesamtvolumen':'Total volume','Top:':'Top:','Tage geplant':'Days planned','Dein Ziel':'Your goal',
  'Volumen 4 Wo.':'Volume 4 wks','Muskelgruppen-Balance (4 Wochen)':'Muscle group balance (4 weeks)',
  'PRs (4 Wo.)':'PRs (4 wks)','Ø pro Woche':'Avg per week','Volumen-Trend (8 Wochen)':'Volume trend (8 weeks)','jetzt':'now',
  'Stärkste Übungen (e1RM)':'Strongest lifts (e1RM)','Dein Coach bewertet die Zahlen…':'Your coach is scoring the numbers…',
  'Direkt übernehmen':'Apply directly','Übernommen — dein Training ist angepasst.':'Applied — your training is updated.',
  'Übung nicht gefunden — Name geändert?':'Exercise not found — renamed?',
'Kamera öffnen':'Open camera','Gerät mittig einfangen':'Center the machine','Schließen':'Close',
'im Training':'training now',
'Was möchtest du optimieren?':'What do you want to optimize?','Was möchtest du analysieren?':'What do you want to analyze?',
  'Letztes Workout':'Last workout','Gesamter Fortschritt':'Overall progress','Einzelne Übung':'Single exercise',
  'Welche Übung?':'Which exercise?','Split':'Split','Sessions':'Sessions','Aktive Zeit':'Active time',
  'Optional…':'Optional…','Diktieren':'Dictate',
  /* Changelog: Fokus-Modus im Training (31.07.2026) */
  'Training: Fokus auf deine aktuelle Übung':'Workout: focus on your current exercise',
  'Beim Scrollen rastet die Übung, an der du gerade dran bist, sanft ein — alles andere tritt in den Hintergrund':'While scrolling, the exercise you are on gently snaps into place — everything else fades back',
  'Letzter Satz abgehakt? Die nächste offene Übung gleitet von selbst ins Bild':'Last set checked off? The next open exercise glides into view on its own',
  'Supersätze bleiben dabei als Paar im Fokus':'Supersets stay in focus as a pair',
  'Der Kopf mit Trainingszeit, Abbrechen und Fertig bleibt jederzeit erreichbar':'The header with training time, cancel and done stays reachable at all times',
  /* Changelog: Live-Coach Ausbau (23.07.2026) */
  '23.07.2026 · KI-Coach: sichtbarer, reagiert auf Anstrengung, schlägt Trainingstag vor':'23 Jul 2026 · AI coach: more visible, reacts to effort, suggests a training day',
'Live-Coach im Training feuert jetzt häufiger (mehr Trigger, kürzerer Cooldown) — bleibt aber sparsam dosiert':'Live coach during workouts now fires more often (more triggers, shorter cooldown) — still kept sparing',
'Check-in „Sehr schwer"bremst die Gewichtssteigerung beim nächsten Training automatisch':'A"Very hard"check-in now automatically holds back the weight increase for your next workout',
'Neue Tagesempfehlung auf dem Heute-Tab: schlägt bei freiem Tag die am besten erholte Muskelgruppe vor':'New recommendation on the Today tab: on a free day, suggests your most recovered muscle group',
 /* Changelog: Coach-Gedaechtnis (28.07.2026) */
  '28.07.2026 · Der KI-Coach merkt sich, wer du bist':'28 Jul 2026 · Your AI coach now remembers who you are',
  'Neues Gedächtnis: Nennst du im Chat eine Einschränkung, ein Ziel oder eine Vorliebe, merkt der Coach sie sich und schlägt nichts mehr vor, was dagegen läuft':'New memory: mention a limitation, a goal or a preference in the chat and the coach keeps it in mind — it will no longer suggest anything that works against it',
  'Gemeldete Beschwerden verfallen nach sechs Wochen automatisch — der Coach fragt nach, statt dich dauerhaft zu bremsen':'Reported complaints expire automatically after six weeks — the coach asks again instead of holding you back forever',
  'Vorschläge, die du fünfmal hintereinander wegwischst, kommen nicht mehr':'Suggestions you dismiss five times in a row stop coming back',
  'Häufige Fragen wie „Wie viele Sätze noch?" oder „Was ist mein Rekord bei Bankdrücken?" beantwortet die App sofort selbst, ohne Wartezeit':'Common questions such as "How many sets left?" or "What is my record on bench press?" are answered by the app itself, instantly',
  'Dein Gedächtnis liegt an deinem Konto: ein zweites Konto auf demselben Gerät sieht davon nichts, beim Löschen des Kontos ist es weg':'Your memory is tied to your account: a second account on the same device sees none of it, and deleting your account deletes it',
 /* Changelog: Coach meldet sich (29.07.2026) */
  '29.07.2026 · Dein Coach meldet sich, auch wenn die App zu ist':'29 Jul 2026 · Your coach reaches you even when the app is closed',
  'Die Trainings-Erinnerung sagt jetzt, was ansteht: „Heute Push — Bank 3 × 8 @ 62,5" statt „Zeit fürs Gym"':'The workout reminder now tells you what is up: "Push today — bench 3 × 8 @ 62.5" instead of "Time for the gym"',
  'Nach einem neuen Bestwert gratuliert er dir noch am selben Tag':'After a new personal best it congratulates you the same day',
  'Bleibst du fünf Tage weg, meldet er sich einmal. Öffnest du die App, verschiebt sich das von selbst':'Stay away for five days and it reaches out once. Open the app and that resets by itself',
  'Einmal im Jahr zeigt er dir, wo du vor zwölf Monaten standest':'Once a year it shows you where you stood twelve months ago',
  'Du bestimmst, wie oft: gar nicht, höchstens einmal am Tag oder bis zu zweimal':'You decide how often: never, at most once a day, or up to twice',
 /* Changelog: Coach begleitet Training (29.07.2026) */
  '29.07.2026 · Der Coach begleitet dein Training':'29 Jul 2026 · Your coach guides your workout',
  'Er begrüßt dich mit dem, was du beim letzten Mal geschafft hast, ordnet zur Halbzeit ein und zieht am Ende Bilanz':'It greets you with what you achieved last time, checks in at the halfway point, and sums up at the end',
  'Beim Öffnen einer Übung sagt er dir dein Aufwärmschema an — in Kilo, nicht in Prozent':'When you open an exercise, it tells you your warm-up scheme — in kilos, not percent',
  'Nach jedem Satz kannst du mit einem Tipp sagen: leicht, passend oder schwer. Das nächste Gewicht richtet sich danach':'After each set, one tap tells it: light, right or heavy. The next weight follows your answer',
  'Er merkt, wenn deine Wiederholungen fallen und die Pausen länger werden — und sagt es, bevor du dich verausgabst':'It notices when your reps drop and your rests get longer — and says so before you push too far',
  'Alles davon läuft ohne Internet. Auch im Keller-Gym':'All of this works without internet. Even in a basement gym',
  'Wie oft er sich meldet, bestimmst du: höchstens vier Mal pro Training, oder acht, oder gar nicht':'You decide how often it speaks up: at most four times per workout, or eight, or never',
 /* Changelog: Coach bekommt einen Namen (29.07.2026) */
  '29.07.2026 · Dein Coach bekommt einen Namen':'29 Jul 2026 · Your coach gets a name',
  'Gib deinem Coach einen Namen und einen Ton — ruhig, sachlich, fordernd oder locker. Er redet ab sofort so mit dir':'Give your coach a name and a tone — calm, factual, tough or casual. It talks to you that way from now on',
  'Neu: das Coach-Menü. Ein Tipp auf die Coach-Karte auf der Startseite öffnet Chat, Journal, Wochenbericht und Einstellungen':'New: the coach menu. Tapping the coach card on the home screen opens chat, journal, weekly report and settings',
  'Im Journal siehst du zum ersten Mal, was der Coach über dich weiß — und kannst jeden einzelnen Eintrag löschen':'In the journal you can now see for the first time what the coach knows about you — and delete each entry individually',
  'Beim Abschluss des Abos entscheidest du selbst, wie sehr sich der Coach einmischt: zurückhaltend, ausgewogen oder eng dabei':'When you complete your subscription, you decide yourself how much the coach gets involved: reserved, balanced or close by',
 /* Changelog: Coach schneller & guenstiger (29.07.2026) */
  '29.07.2026 · Der Coach antwortet schneller und kostet weniger':'29 Jul 2026 · Your coach answers faster and costs less',
  'Elf weitere Fragen beantwortet die App sofort selbst — Streak, Wochenfortschritt, letzter Rekord, nächster Plantag und mehr, ohne Wartezeit und auch ohne Empfang im Keller-Gym':'Eleven more questions are now answered by the app itself — streak, weekly progress, last record, next plan day and more, instantly and even without signal in a basement gym',
  'Neu: Frag „Warum 62,5?" und der Coach erklärt dir die Rechnung hinter seinem Gewichtsvorschlag':'New: ask "Why 62.5?" and the coach explains the math behind its weight suggestion',
  'Die Vorschläge über dem Eingabefeld richten sich jetzt danach, ob du gerade trainierst, eben fertig geworden bist oder pausierst':'The suggestions above the input field now depend on whether you are currently training, just finished, or resting',
  'Fragen rund um Krankheit, Beschwerden oder Schwangerschaft beantwortet die App nicht mehr aus eigenen Zahlen, sondern reicht sie an den Coach weiter':'Questions about illness, complaints or pregnancy are no longer answered from the app\'s own numbers — they now go straight to the coach',
 /* Changelog: KI-Coach-Rahmen-Fix (24.07.2026) */
  '24.07.2026 · Fix: KI-Coach-Rahmen im Training':'24 Jul 2026 · Fix: AI coach border during training',
  '🧠 Der pulsierende blaue KI-Coach-Rahmen läuft jetzt sauber am ganzen Rand der aktiven Übung entlang':'🧠 The pulsing blue AI coach border now runs cleanly along the full edge of the active exercise',
  '✨ Vorher schnitt der Glow durch die Übungskarte statt außen umzulaufen':'✨ Previously the glow cut through the exercise card instead of tracing the outer edge',
  /* Changelog: Coach-Wochenbericht (29.07.2026) */
  '29.07.2026 · Jeden Sonntag: deine Woche':'29 Jul 2026 · Every Sunday: your week',
  'Sonntagabend fasst dein Coach die Woche zusammen — Volumen, Sätze, Einheiten, Bestwerte und der Vergleich zur Vorwoche':'Sunday evening your coach sums up the week — volume, sets, sessions, personal bests and the comparison to last week',
  'Auf dem Sperrbildschirm steht die echte Zusammenfassung, nicht nur ein Hinweis':'The lock screen shows the actual summary, not just a notification',
  'Bei stabilem Fortschritt siehst du, wann du dein Ziel erreichst — mit ehrlicher Einschränkung, nie als Versprechen':'With steady progress you see when you will reach your goal — with an honest caveat, never as a promise',
  'Die letzten acht Wochen bleiben im Coach-Menü nachlesbar':'The last eight weeks stay readable in the coach menu',
  'Die Uhrzeit kannst du selbst festlegen':'You can set the time yourself',
  /* Changelog: Coach-Hub-Umbau (31.07.2026) */
  '31.07.2026 · Dein Profilbild auf der Startseite':'31 Jul 2026 · Your profile picture on the home screen',
  'Die Begrüßung oben links ist Geschichte — dort sitzen jetzt dein Profilbild und dein Name, klar und aufgeräumt':'The greeting in the top left is gone — your profile picture and name now live there, clean and tidy',
  'Ein Tipp aufs Bild öffnet dein Profil: Foto und Name direkt bearbeiten':'Tap the picture to open your profile: edit photo and name right there',
  'Ein neues Foto gilt sofort nach der Auswahl — ganz ohne Speichern-Knopf':'A new photo applies the moment you pick it — no save button needed',
  'Ohne Foto zeigt der Kreis deine Initialen in deiner Themefarbe':'Without a photo the circle shows your initials in your theme color',
  '31.07.2026 · Dein Coach-Menü, neu gebaut':'31 Jul 2026 · Your coach menu, rebuilt',
  'Ein Tipp auf die Coach-Karte öffnet ein Blatt mit fünf Kacheln — Gespräch, Woche, Persönlichkeit, Umfang und Journal. Ein Tipp auf eine Kachel zoomt in sie hinein, der Pfeil oben links führt zurück':'Tapping the coach card opens a sheet with five tiles — chat, week, personality, scope and journal. Tapping a tile zooms into it, the arrow at the top left leads back',
  'Die Wochenkachel zeigt deinen Verlauf: acht Wochen Volumen, wohin deine Sätze gingen, und dein geschätztes Maximum über die Zeit':'The week tile shows your history: eight weeks of volume, where your sets went, and your estimated max over time',
  'Setz dir ein Kraftziel für eine Übung, und der Coach sagt dir, wann du es bei gleichbleibendem Tempo erreichst':'Set a strength goal for an exercise, and the coach tells you when you will reach it at your current pace',
  'Den Ton wählst du jetzt mit einem Regler — der Beispielsatz ändert sich, während du ziehst':'You now pick the tone with a slider — the example sentence changes as you drag it',
  'Die Karte auf der Startseite zeigt die Erholung der Muskelgruppe, die als Nächstes dran ist, dazu deine Woche im Vergleich zur vorigen':'The card on the home screen shows the recovery of the muscle group up next, plus your week compared to the previous one',
  /* Coach-Hub (Task 9). Kurze, mehrdeutige Schalterwörter (Aus/Still/Eng/Normal,
     Name, Ton) stehen bewusst NICHT hier, sondern laufen am Aufrufort über
     _cm(de,en): als globaler Schlüssel würden sie jeden fremden Textknoten
     mitübersetzen, der zufällig genauso heißt. */
  /* Die fünf Kacheln des Hubs. Lange, eindeutige Titel — sie stehen hier und
     nicht am Aufrufort, weil kein anderer Textknoten der App genauso heißt
     (geprüft) und der Titel dann in EINER Zeile beide Sprachen trägt. */
  'Gespräch':'Conversation','Persönlichkeit':'Personality',
  'Jede Kachel zeigt ihre Zahl groß und ihren Namen klein — Wochenvolumen, Ton, Einträge: du siehst den Stand, ohne zu tippen':'Every tile shows its number large and its name small — weekly volume, tone, entries: you see where you stand without tapping',
  'Umfang und Meldungen':'Scope and notifications','Umfang':'Scope','dein Coach':'your coach',
  /* Das Kraftziel der Wochenkachel. Eigene, eindeutige Wörter — kein anderer
     Textknoten der App heisst so (geprüft). */
  'Kraftziel':'Strength target','Ziel setzen':'Set a target',
  'Ziel ändern':'Change target','Ziel entfernen':'Remove target',
  'Letzter Wortwechsel':'Last exchange','Einschränkungen':'Limits','Vorlieben':'Preferences',
  'Was funktioniert':'What works','Noch nichts notiert.':'Nothing noted yet.',
  'Eintrag entfernen':'Remove entry','Bestätigung fällig':'Confirmation due',
  'Wochenbericht':'Weekly report',
  'Dein erster Wochenbericht kommt am Sonntag.':'Your first weekly report arrives on Sunday.',
  'Tippen für Chat, Journal und Einstellungen.':'Tap for chat, journal and settings.',
  'Wie soll dein Coach klingen?':'How should your coach sound?',
  'Wie viel Coach willst du?':'How much coach do you want?',
  'Ruhig':'Calm','Sachlich':'Factual','Hart':'Tough','Locker':'Casual',
  'Zurückhaltend':'Reserved','Ausgewogen':'Balanced','Eng dabei':'Close by','Angepasst':'Custom',
  'Kein Live-Coach, keine Rückmeldung nach dem Satz, stille Nachrichten.':'No live coach, no feedback after sets, quiet notifications.',
  'Live-Coach bei Schlüsselmomenten, Rückmeldung nach dem Satz, normale Nachrichten.':'Live coach at key moments, feedback after sets, normal notifications.',
  'Live-Coach bei jedem Satz, Rückmeldung nach dem Satz, enge Nachrichten.':'Live coach on every set, feedback after sets, close notifications.',
  'Deine eigene Mischung aus der Feinjustierung.':'Your own mix from the fine tuning below.',
  'Feinjustierung':'Fine tuning','Schlüsselmomente':'Key moments','Jeder Satz':'Every set',
  'Nachrichten':'Notifications','Rückmeldung nach dem Satz':'Feedback after the set',
  'Kurzer Kommentar, sobald ein Satz steht.':'A short comment as soon as a set is done.',
  'Wie oft der Coach dich außerhalb der App anspricht.':'How often the coach reaches you outside the app.',
  'Wie präsent der Coach während einer Einheit ist.':'How present the coach is during a session.',
  /* Coach-Einrichtung (Task 10). Alles Übrige der Einrichtung läuft über die
     Hub-Schlüssel darüber — dieselbe Darstellung, dieselben Wörter. Kurze
     Schalterwörter (Name, Weiter) laufen wie im Hub über _cm(de,en). */
  'Wie soll dein Coach heißen?':'What should your coach be called?',
  'Name und Ton kannst du jederzeit ändern.':'You can change name and tone at any time.',
  'Er spricht nur, wenn du ihn über den Sprech-Button fragst — nie von selbst.':
    'He only speaks when you ask him via the talk button — never on his own.',
  'Das Journal braucht ein Konto.':'The journal needs an account.',
  /* Coach-Einrichtung, Schritt 3 (Trainings-Erinnerung). Die Frage selbst und
     die beiden Erklärsätze tragen den Coach-Namen bzw. die Uhrzeit und laufen
     deshalb am Aufrufort über _cm(de,en). */
  'Die Erinnerung nennt Übung, Sätze, Wiederholungen und Gewicht deines nächsten Trainings.':
    'The reminder names the exercise, sets, reps and weight of your next workout.',
  'Nicht erinnern':'No reminder','Ja, erinnere mich':'Yes, remind me',
};

/* Regex-Regeln für zusammengesetzte Texte (nur deutsch-spezifische Muster,
 damit englische Ergebnisse Fixpunkte bleiben) */
const I18N_RX = [
 /* „Nächstes Mal: 21 kg ausprobieren." — die Zahl steht in der Mitte, deshalb
    blieb nach den übrigen Regeln ein halb deutscher Satz stehen („next time
    21 kg ausprobieren"). Muss VOR den Teilregeln laufen. */
 [/: (.{1,24}?) ausprobieren\./g, ': try $1.'],
 [/ ausprobieren\./g, '.'],
 /* Fragmente, in denen eine Zahl steckt — als feste Phrase nicht greifbar. */
 [/% vom Arbeitsgewicht — gut dosiert\./g, '% of working weight — well judged.'],
 [/% über letzter Einheit\./g, '% above your last session.'],
 [/Alle Arbeitssätze am oberen Wiederholungsende,/g, 'All working sets at the top of the rep range,'],
 [/Aufwärmsatz bei/g, 'Warm-up set at'],
 [/Neue Reps-Bestleistung bei/g, 'New rep record at'],
 [/Reps-Bestleistung bei/g, 'Rep record at'],
 [/Monats-Ranking — zählt Trainings im/g, 'Monthly ranking — counts workouts in'],
 [/ist dieselbe Bewegung wie/g, 'is the same movement as'],
 [/— bitte gelenkschonende Alternativen wählen/g, '— please pick joint-friendly alternatives'],
 [/✓ Plan übernommen:/g, '✓ Plan applied:'],
 [/(\d+) Einträge,/g, '$1 entries,'],
 [/× pro Woche/g, '× per week'],
 [/· läuft ab am/g, '· expires on'],
 [/· heute/g, '· today'],
 [/fertig — Volumen/g, 'done — volume'],
 [/Weiter mit/g, 'Continue with'],
 /* Dynamisch zusammengebaute Saetze — Name bzw. Zahl steht in der Mitte. */
 [/Übung „(.*?)" wirklich löschen\?/g, 'Really delete exercise “$1”?'],
 [/(\d+) Übungen · (\d+) Trainings gespeichert/g, '$1 exercises · $2 workouts saved'],
 /* „Ziel: 3×8-12 Wdh" — Zielangabe steht in Uebungs-Statistik, Listenzeilen
    und Coach-Hinweisen immer MIT angehaengten Werten, der feste Eintrag
    'Ziel:' greift dort nie. */
 /* Ohne \b: der Wert davor kann direkt ankleben (z.B. "…8Ziel: 3×8"). */
 [/Ziel: /g, 'Goal: '],
 [/(\d+) Einheiten\b/g, '$1 sessions'],
 [/(\d+) Einheit\b/g, '$1 session'],
 [/ ist bereit/g, ' is ready'],
 [/Wochen-Streak/g, 'Week streak'],
 [/Ziel ändern: /g, 'Change goal: '],
 /* Uebungs-Bibliothek: "Chest·Ziel 3×8" — hier steht Ziel OHNE Doppelpunkt. */
 [/Ziel (\d)/g, 'Goal $1'],
 [/✓ vorhanden/g, '✓ in your library'],
 /* Bestwert-Zeile einer Uebung: "aus 10×242 kg · 5. Jun 25" */
 [/\baus (\d+)×/g, 'from $1×'],
 /* Tagesempfehlung und Erholungs-Hinweise — Muskelname und Prozent stehen
    mitten im Satz, deshalb greift keine feste Phrase. */
 [/ist zu (\d+) % erholt — der beste Fokus für heute\./g, 'is $1% recovered — the best focus for today.'],
 [/liegt bei (\d+) % — heute lieber schonen\./g, 'is at $1% — better to take it easy today.'],
 [/Nichts ist wieder voll da — /g, 'Nothing is fully back yet — '],
 [/\. Ein ruhiger Tag zahlt sich morgen aus\./g, '. A quiet day pays off tomorrow.'],
 [/ steht heute an\./g, ' is up today.'],
 [/Letztes Training anstrengend bei niedriger Energie\. Heute /g, 'Last session was tough on low energy. Today '],
 [/Mehrere schwere Einheiten bei wenig Energie\. Heute /g, 'Several hard sessions on low energy. Today '],
 [/ und etwas mehr Pause\./g, ' and a little more rest.'],
 [/ — bewusst leichter\./g, ' — deliberately lighter.'],
 [/: leicht zurückgenommen/g, ': eased off slightly'],
 [/Keine Übungen für /g, 'No exercises for '],
 [/ aus der Cloud geladen/g, ' loaded from the cloud'],
 [/(\d+) Übungen\b/g, '$1 exercises'],
 [/(\d+) Übung\b/g, '$1 exercise'],
 [/ bei (\d)/g, ' at $1'],
 [/ statt /g, ' instead of '],
 [/ abgenommen\b/g, ' lost'],
 [/ zugenommen\b/g, ' gained'],
 // Inline-Icon-Buttons (Icon klebt im selben Textknoten wie der Text)
 [/Training starten/g,'Start workout'],
 // Widget-/Kraft-Fragmente & Kürzel
  [/ – tippen für Typ-Auswahl/g, ' – tap to pick type'],
  [/ — Kraftaufbau/g, ' — strength gain'],
  [/→ jetzt /g, '→ now '],
  [/(\d+) Üb\./g, '$1 ex.'],
  [/(\d+) Wo\./g, '$1 wk'],
 [/Wdh bei/g,'reps at'],
 [/als neuen Top-Satz versuchen\./g,'as your new top set.'],
 [/nächstes Mal!/g,'next time!'],
 [/ Trainings diese Woche/g,'workouts this week'],
  [/ Training diese Woche/g, ' workout this week'],
  [/\bTrainings\b/g, 'workouts'],
  [/vor (\d+) Min\.?/g, '$1 min ago'], [/vor (\d+) Std\.?/g, '$1 h ago'],
  [/vor (\d+) Tagen/g, '$1 days ago'], [/vor (\d+) Tag\b/g, '$1 day ago'],
  [/vor (\d+) Wochen/g, '$1 weeks ago'], [/vor (\d+) Woche\b/g, '$1 week ago'],
 [/Du hast (\d+) Updates? verpasst — alles, was seitdem dazukam:/g,"You missed $1 update(s) — here's everything new since then:"],
 [/ Update installiert – /g,'Update installed –'],
 [/: Gewicht erhöhen!/g,': increase the weight!'],
 [/Top-Satz geschafft\. Nächstes Mal:/g,'Top set done. Next time:'],
 [/ als neuen Top-Satz versuchen\./g,'as your new top set.'],
 [/Alle Ziel-Wdh erreicht\. Nächstes Mal:/g,'All target reps hit. Next time:'],
 [/Neue Reps-Bestleistung bei /g,'New rep record at'],
  [/Reps-Bestleistung bei /g, 'Rep record at '],
  [/Zuletzt nur ~/g, 'Last time only ~'],
  [/\. Versuche /g, '. Try '],
  [/ nächstes Mal!/g, ' next time!'],
  [/ Wdh bei /g, ' reps at '],
 [/: Super!/g,': great!'],
 [/: Wdh aufbauen/g,': build up reps'],
 [/: Fokus /g,': focus'],
 [/\. Halte das Gewicht\./g,'. Keep the weight.'],
 [/letztes Mal: /g,'last time:'],
 [/Du arbeitest in einem Bereich, z\. ?B\./g,'You work within a range, e.g.'],
 [/\. Schaffst du in (\d+) Arbeitssätzen das obere Ende \((\d+)\), steigt das Gewicht — und du startest nächstes Mal wieder unten im Bereich \((\d+)\)\. Bis dahin baust du Satz für Satz Wiederholungen auf\./g,
'. If you hit the top end ($2) in $1 working sets, the weight goes up — and next time you start again at the bottom of the range ($3). Until then you build up reps set by set.'],
 [/Gewichts-Steigerung bei vollem Wdh-Bereich \(/g,'Weight increase at full rep range ('],
  [/Weiter mit /g, 'Continue with '],
  [/Gekoppelt mit „/g, 'Paired with “'],
  [/Superset mit „/g, 'Superset with “'],
  [/Leichter als die /g, 'Lighter than the '],
  [/-Stange — Kurzhantel oder Maschine\?/g, ' bar — dumbbell or machine?'],
  [/ pro Seite nicht steckbar \(kleinste Scheibe /g, ' per side not loadable (smallest plate '],
  [/Gewicht \(/g, 'Weight ('],
  [/Für „/g, 'For “'],
  [/" gibt es keine passende Übung in dieser Gruppe\./g, '” there is no matching exercise in this group.'],
  [/Nichts gefunden für „/g, 'Nothing found for “'],
  [/Füge Übungen für /g, 'Add exercises for '],
  [/ hinzu oder wähle eine andere Gruppe\./g, ' or choose another group.'],
  [/Aktuellen Wochenplan überschreiben mit „/g, 'Overwrite your current weekly plan with “'],
  [/✓ Plan übernommen: /g, '✓ Plan applied: '],
 [/ löschen\?$/g,'— delete?'],
 [/Alle (\d+) anzeigen/g,'Show all $1'],
 [/Du hast die Übungen in diesem Training geändert\.\n\nSoll /g,'You changed the exercises in this workout.\n\nShould'],
 [/ dauerhaft mit diesen Übungen aktualisiert werden\?\n\n\(Deine Trainingsdaten werden so oder so gespeichert\.\)/g,'be permanently updated with these exercises?\n\n(Your workout data is saved either way.)'],
  [/×\/Woche\)/g, '×/week)'],
  [/Ziel ändern \(aktuell /g, 'Change goal (currently '],
  [/−1 rückgängig \(/g, '−1 undo ('],
  [/Anfrage an /g, 'Request sent to '],
  // „Trainiert gerade" ist eine exakte I18N_EN-Phrase und wird schon im
  // ·-Segmentschritt ersetzt — eine Regel auf den ganzen deutschen Satz greift
  // hier nie. Deshalb nur der Rest-Teil, gegen die bereits halb englische Form.
  [/· seit (\d+) Std\. (\d+) Min\./g, '· for $1 h $2 min'],
  [/· seit (\d+) Min\./g, '· for $1 min'],
  [/· Du vs\. /g, '· You vs. '],   // „Diese Woche" ersetzt schon der ·-Segmentschritt
  [/ einen neuen Rekord aufgestellt:/g, ' set a new record:'],
 [/-Wochen-Streak/g,'-week streak'],
  [/Monats-Ranking — zählt Trainings im /g, 'Monthly ranking — counts workouts in '],
  [/❌ Login fehlgeschlagen:/g, '❌ Sign-in failed:'],
  [/❌ Cloud-Sync fehlgeschlagen:/g, '❌ Cloud sync failed:'],
  [/❌ Löschen fehlgeschlagen:/g, '❌ Delete failed:'],
  // Coach-Intent — lokale Kurzantworten (Baustein 3/7, siehe js/coach-intent.js).
  // Muessen VOR den generischen Satz/Sätze-Regeln unten stehen, sonst ist
  // "Sätze"/"Satz" schon ersetzt, bevor diese kompletten Saetze greifen.
  [/Nächster Satz: ([\d.,]+) kg\./g, 'Next set: $1 kg.'],
  [/: ([\d.,]+) kg mal (\d+) Wiederholungen, am ([\d.]+)\./g, ': $1 kg for $2 reps, on $3.'],
  [/Noch 1 Satz\./g, '1 set left.'],
  [/Noch (\d+) Sätze\./g, '$1 sets left.'],
  [/Noch (\d+) Sekunden Pause\./g, '$1 seconds of rest left.'],
  [/ ist zu (\d+) Prozent erholt\./g, ' is $1 percent recovered.'],
  [/ zuletzt am ([\d.]+)\./g, ' last done on $1.'],
  [/(\d+) Übungen/g, '$1 exercises'], [/(\d+) Übung\b/g, '$1 exercise'],
 [/(\d+) Sätze/g,'$1 sets'], [/(\d+) Satz\b/g,'$1 set'],
 [/(\d+) Wdh\.?/g,'$1 reps'],
 [/(\d+) Einheiten/g,'$1 sessions'], [/(\d+) Einheit\b/g,'$1 session'],
 // Kopfzeile des Trainings-Tabs: "3 Splits · 4 Trainingstage". Muss VOR den
 // Trainings-/Tage-Regeln stehen, sonst greift keine (Wort ist zusammengesetzt).
 [/(\d+) Trainingstage\b/g,'$1 training days'], [/(\d+) Trainingstag\b/g,'$1 training day'],
 [/(\d+) Trainings\b/g,'$1 workouts'], [/(\d+) Training\b/g,'$1 workout'],
 [/(\d+) Wochen/g,'$1 weeks'], [/(\d+) Woche\b/g,'$1 week'],
 [/(\d+) Minuten/g,'$1 minutes'], [/(\d+) Min\./g,'$1 min'],
  [/(\d+(?:[.,]\d+)?) Std\./g, '$1 h'],
  [/(\d+) Tagen\b/g, '$1 days'], [/(\d+) Tage\b/g, '$1 days'], [/(\d+) Tag\b/g, '$1 day'],
  [/(\d) Uhr\b/g, '$1'],
  [/\bSätze\b/g, 'sets'], [/\bWdh\b/g, 'reps'], [/\bÜbungen\b/g, 'exercises'], [/\bÜbung\b/g, 'exercise'],
  [/\bdiese Woche\b/g, 'this week'], [/\bEinheiten\b/g, 'sessions'],
 [/Woche (\d+)/g,'Week $1'],
 // Premium / KI-Coach — dynamische/zusammengesetzte Texte
 [/Noch (\d+) von (\d+) KI-Anfragen diesen Monat/g,'You have $1 of $2 AI requests left this month'],
  [/Jahresabo · läuft ab am /g, 'Yearly plan · renews on '],
  [/Monatsabo · läuft ab am /g, 'Monthly plan · renews on '],
  [/ pro Jahr · verlängert sich automatisch · jederzeit kündbar in den App-Store-Einstellungen/g, ' per year · renews automatically · cancel anytime in the App Store settings'],
  [/ pro Monat · verlängert sich automatisch · jederzeit kündbar in den App-Store-Einstellungen/g, ' per month · renews automatically · cancel anytime in the App Store settings'],
  // Paywall: Preise/Ersparnis kommen live aus StoreKit → nur Regex, keine festen Phrasen
  [/ pro Jahr, verlängert sich automatisch\. Jederzeit im App Store kündbar\./g,
   ' per year, renews automatically. Cancel anytime in the App Store.'],
  [/ pro Monat, verlängert sich automatisch\. Jederzeit im App Store kündbar\./g,
   ' per month, renews automatically. Cancel anytime in the App Store.'],
  [/Spare (\d+) %/g, 'Save $1%'],
  [/\/Monat\b/g, '/month'],
  [/Kauf fehlgeschlagen: /g, 'Purchase failed: '],
 [/Wiederherstellung fehlgeschlagen: /g,'Restore failed: '],
 // KI-Einblicke (Phase F) — dynamische Sätze mit Zahlen/Muskelgruppen
 [/ bekommt aktuell nur (\d+)% deines Trainingsvolumens\./g,'currently gets only $1% of your training volume.'],
 [/Im Bereich (.+) Wdh\. wächst dein 1RM am stärksten\./g,'Your estimated 1RM grows fastest in the $1 rep range.'],
 [/Du trainierst zuletzt Ø ([\d.,]+)×\/Woche — dein Ziel sind (\d+)×\./g,'You’re averaging $1×/week lately — your goal is $2×.'],
 [/Du erreichst dein Frequenz-Ziel von (\d+)× pro Woche\./g,'You’re hitting your frequency goal of $1× per week.'],
 [/(\d+) neue Bestleistungen in den letzten 4 Wochen\./g,'$1 new PRs in the last 4 weeks.'],
  // Check-in bremst Progression (Phase G) + Tagesempfehlung
  [/: Erholung vor Steigerung/g, ': recovery before progression'],
  [/Du hast dein letztes Training als "Sehr schwer" bewertet\. Heute /g, 'You rated your last workout "Very hard". Today, '],
  [/ halten statt weiter steigern\./g, ' — hold instead of increasing further.'],
  [/ ist zu (\d+)% erholt — guter Fokus für heute\./g, ' is $1% recovered — good focus for today.'],
 [/ ist noch bei (\d+)% — heute lieber schonen\./g,'is still at $1% — better to rest that today.'],
];

/* tr(): exakte Phrase → Segmente (· -getrennt) → Regex-Regeln */
function tr(s) {
  if (GT_LANG !== 'en' || s == null) return s;
  const str = String(s).replace(/ /g, ' ');
  const key = str.trim();
  if (!key || !/[A-Za-zÄÖÜäöüß]/.test(key)) return s;
  const hit = I18N_EN[key];
 if (hit !== undefined) return str.replace(key, hit);
 // Führendes Icon/Symbol (z. B."Training starten") abtrennen und Rest exakt matchen
 const pm = key.match(/^([^\p{L}]+?)([\p{L}].*)$/u);
  if (pm) { const rest = pm[2].trim(), rh = I18N_EN[rest];
    if (rh !== undefined) return str.replace(rest, rh); }
  let out = str;
  if (out.indexOf(' · ') !== -1) {
    out = out.split(' · ').map(p => {
      const t = p.trim(), h = I18N_EN[t];
 return h !== undefined ? p.replace(t, h): p;
 // Mit ' · ' zusammensetzen, nicht mit '·': sonst fehlen die Leerzeichen in
 // jeder zusammengesetzten Zeile UND die RX-Regeln mit ' · ' greifen nie.
 }).join(' · ');
 }
  for (let i = 0; i < I18N_RX.length; i++) out = out.replace(I18N_RX[i][0], I18N_RX[i][1]);
  return out;
}

/* DOM-Übersetzung: Boot-Pass + MutationObserver (nur bei EN aktiv) */
const I18N_ATTRS = ['placeholder','title','aria-label','alt'];
function _trElAttrs(el) {
 if (!el.getAttribute) return;
 for (let i = 0; i < I18N_ATTRS.length; i++) {
    const v = el.getAttribute(I18N_ATTRS[i]);
    if (v) { const t = tr(v); if (t !== v) el.setAttribute(I18N_ATTRS[i], t); }
  }
}
function _trTree(root) {
  if (root.nodeType === 3) {
    const t = tr(root.nodeValue);
    if (t !== root.nodeValue) root.nodeValue = t;
    return;
  }
  if (root.nodeType !== 1 || root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
  _trElAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) {
      const p = n.parentNode && n.parentNode.tagName;
      if (p === 'SCRIPT' || p === 'STYLE' || p === 'TEXTAREA') continue;
      const t = tr(n.nodeValue);
      if (t !== n.nodeValue) n.nodeValue = t;
    } else {
      _trElAttrs(n);
    }
  }
}
(function () {
  const mark = () => document.querySelectorAll('[data-lang-btn]').forEach(b =>
    b.classList.toggle('on', b.dataset.langBtn === GT_LANG_PREF));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mark); else mark();
  if (GT_LANG !== 'en') return;
  _trTree(document.body);
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') {
        const t = tr(m.target.nodeValue);
        if (t !== m.target.nodeValue) m.target.nodeValue = t;
      } else if (m.type === 'childList') {
        m.addedNodes.forEach(n => _trTree(n));
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  // Native Dialoge laufen nicht durchs DOM → wrappen
  const _al = window.alert.bind(window), _cf = window.confirm.bind(window), _pr = window.prompt.bind(window);
  window.alert = m => _al(tr(m));
  window.confirm = m => _cf(tr(m));
  window.prompt = (m, d) => _pr(tr(m), d);
})();
/* ══ /I18N ══ */


/* ── CHANGELOG (neue Einträge oben hinzufügen bei jedem Update) ── */
const CHANGELOG = {
  // WICHTIG: Keys dürfen NICHT dem Muster gymtrack-v\d+ entsprechen,
  // sonst werden sie vom Deploy-Script überschrieben. Reihenfolge: NEUESTE zuerst.
  'cl-2026-08-02-coach-einrichtung': {
    label: '02.08.2026 · Coach-Einrichtung: drei Schritte statt vier',
    items: [
      'Die Frage nach der Stimme ist raus — den Sprech-Knopf gibt es nicht mehr',
      'Der letzte Schritt fragt jetzt nach den Meldungen deines Coaches (Wochenbericht, erholte Muskeln) statt nach der einfachen Trainings-Erinnerung, die es auch ohne Premium gibt',
      'Die einfache Erinnerung bleibt unberührt in den Einstellungen',
    ]
  },
  'cl-2026-08-02-coach-widget': {
    label: '02.08.2026 · Coach-Karte in der Größe verstellbar',
    items: [
      'Die Coach-Karte liegt jetzt im Raster des Heute-Tabs wie jedes andere Widget — Größe ziehen, verschieben, entfernen',
      'Klein zeigt sie nur Ring und Namen, mittel dazu die Schlagzeile und deine Woche, groß zusätzlich den Satz vom Coach',
      'Wer sein Raster schon selbst eingerichtet hat, bekommt die Karte einmalig oben eingefügt',
    ]
  },
  'cl-2026-08-02-erfolge-netz': {
    label: '02.08.2026 · Erfolge: dein Kraftprofil auf einen Blick',
    items: [
      'Neu im Erfolge-Tab: ein Netzdiagramm über alle Muskelgruppen — blaue Fläche ist dein Stand jetzt, grüne Linie dein Start',
      'An jeder Ecke stehen beide Werte; tippst du eine Ecke an, öffnet sich die Gruppe im Detail',
      'Woche, Monat, Jahr und Gesamt schalten das Netz mit um',
      'Die Meilensteine sind entfernt — sie feierten Zahlen, die mit deinem Training nichts zu tun hatten',
    ]
  },
  'cl-2026-08-02-volumen-kurve': {
    label: '02.08.2026 · Alle Diagramme als Leuchtkurve',
    items: [
      'Volumen, Gewicht, 1RM, Muskelgruppen und die Coach-Woche zeigen jetzt dieselbe weiche Linie, die zur Mitte hin aufleuchtet',
      'Die Achsen bleiben — du siehst weiter, worüber du liest',
      'Über der Volumen-Kachel steht deine letzte Einheit als Zahl, daneben der Vergleich zur vorherigen',
      'Nur der aktuelle Punkt ist markiert; für einzelne Werte tippst du die Linie an',
    ]
  },
  'cl-2026-08-02-liquid-glass': {
    label: '02.08.2026 · Glas, neu geschliffen',
    items: [
      'Der Hintergrund trägt jetzt große, weich auslaufende Lichtkörper — daran bricht das Glas erst sichtbar',
      'Die Flächen selbst sind fast leer; was sie zeigt, ist die Lichtkante oben und links',
      'Weniger Schlagschatten, größere Rundungen, mehr Unschärfe — die Scheibe liegt auf dem Bild statt darüber zu schweben',
      'Gilt für alle Themes, hell wie dunkel',
    ]
  },
  'cl-2026-08-01-coach-zeichen': {
    label: '01.08.2026 · Das Zeichen der App beim Coach',
    items: [
      'Neben dem Coach-Namen steht jetzt das App-Symbol — schwarzes Feld, weiße Hantel — statt eines pulsierenden blauen Punktes',
      'Die Hantel wiegt sich langsam, und einmal je Runde läuft ein Lichtstreifen über das Feld',
    ]
  },
  'cl-2026-08-01-coach-wellenfeld': {
    label: '01.08.2026 · Die Coach-Karte lebt',
    items: [
      'Hinter der Coach-Karte rollt ein Feld aus Punkten — echte Wellen, die nach vorn laufen und dabei größer und heller werden',
      'Auf den Kämmen leuchten die Punkte weiß, in den Tälern tragen sie die App-Farbe',
      'Ab und zu geht ein kurzer Farbimpuls durch das Feld',
      'Dasselbe Feld liegt jetzt auch hinter dem Coach-Menü — leiser, damit die Kacheln vorn bleiben',
      'Das Feld rechnet nur, wenn du es siehst — nicht im Hintergrund, nicht bei „Bewegung reduzieren"',
    ]
  },
  'cl-2026-08-01-tableiste': {
    label: '01.08.2026 · Neue Tab-Leiste',
    items: [
      'Die Leiste unten zeigt nur noch Symbole — mehr Luft, ruhigeres Bild',
      'Der aktive Tab sitzt in einer eingelassenen Mulde statt unter einer hellen Pille',
      'Die Leiste ist monochrom: Farbe trägt in der App die Aktion, nicht die Navigation',
    ]
  },
  'cl-2026-08-01-coach-menue-klarer': {
    label: '01.08.2026 · Coach-Menü: sagt jetzt, wohin es geht',
    items: [
      'Jede Kachel im Coach-Menü trägt ihren Namen im Klartext und eine Zeile darunter, was dahinter passiert — „Frag alles zu deinem Training", „Wann er sich meldet"',
      '„Gespräch" liegt oben quer und farbig: die Fläche, die du am häufigsten brauchst, sieht man jetzt auch',
      'Die Kacheln bauen sich beim Öffnen nacheinander auf, und beim Antippen antwortet das Symbol',
      'Der Punkt neben dem Coach-Namen pulsiert weicher — zwei Ringe statt eines Rucks',
      'Der Coach-Name auf der Startseite wird gekürzt statt abgeschnitten',
      'Die Coach-Karte trägt keinen zweiten Start-Knopf mehr: Training startest du über den Schnellstart, die Karte führt zum Coach',
    ]
  },
  'cl-2026-07-31-coach-regelkreis': {
    label: '31.07.2026 · Live-Coach: regelt statt nur zu reagieren',
    items: [
      'Korrigiert sich selbst: senkt er zu viel und der nächste Satz läuft plötzlich leicht, geht er nur den halben Weg zurück statt zwischen zwei Gewichten zu pendeln',
      'Neu „Rückgängig" in der Coach-Leiste — zehn Sekunden lang lässt sich jede automatische Änderung mit einem Tipp zurücknehmen',
      'Vergleicht gegen den Median deiner letzten drei Einheiten statt gegen genau die letzte: ein schlechter Tag verfälscht die Rückmeldung nicht mehr',
      'Denkt in Wochenvolumen: hat eine Muskelgruppe die Woche schon 20 harte Sätze, streicht er eher einen — liegt sie unter 10, gibt er eher einen dazu',
      'Was er im Training gemessen hat, gilt beim nächsten Mal als Startwert: überwiegend schwere Sätze starten 3 % tiefer, überwiegend leichte 3 % höher',
      'Grenzen der Gewichtsanpassung richten sich jetzt nach deinem Wiederholungsbereich — im Kraftbereich mehr Spielraum, im Ausdauerbereich weniger',
      'Geplante Entlastungswoche: nach sechs harten Wochen am Stück läuft eine Einheit automatisch mit rund 10 % weniger Gewicht, angesagt beim Start',
    ]
  },
  'cl-2026-07-31-coach-autoregulation': {
    label: '31.07.2026 · Live-Coach: rechnet mit, statt zu fragen',
    items: [
      'Keine Rückfrage „leicht, passend oder schwer?" mehr nach jedem Satz — der Coach liest es an deinen Wiederholungen ab und passt das Gewicht der offenen Sätze selbst an',
      'Die Gewichtsanpassung rechnet jetzt relativ (Epley) statt in einer Scheibe: bricht die Wiederholungszahl beim Kreuzheben ein, gehen 15 kg runter statt 2,5 — an der Maschine rastet es auf der Stapelstufe ein',
      'Progressionssprünge nach Muskelgruppe: 5 % an Beinen und Rücken, 3,5 % an der Brust, 2,5 % an Schultern, Armen und Rumpf',
      'Erkennt Ermüdung im Verlauf der Übung und nimmt einen Satz raus; bist du frisch und alles läuft am oberen Wiederholungsende, hängt er einen an',
      'Satzpausen richten sich zusätzlich nach der Ermüdung der Muskelgruppe und danach, wie der letzte Satz gelaufen ist',
      'Passt deinen Wiederholungsbereich an, wenn du zwei Einheiten lang durchgehend darüber oder darunter liegst',
      'Vergleicht endlich richtig mit deiner letzten Einheit: Aufwärmsätze und noch nicht abgehakte Sätze zählen nicht mehr als Leistung mit',
      'Übungsnamen bleiben so, wie du sie angelegt hast — „Bench Press" wird nicht mehr zu „Bankdrücken". Die App setzt den Namen notfalls selbst zurück, falls die KI ihn doch übersetzt',
      'Die Coach-Leiste wächst und schrumpft jetzt weich statt zu springen',
    ]
  },
  'cl-2026-07-31-fokus-modus': {
    label: '31.07.2026 · Training: Fokus auf deine aktuelle Übung',
    items: [
      'Beim Scrollen rastet die Übung, an der du gerade dran bist, sanft ein — alles andere tritt in den Hintergrund',
      'Letzter Satz abgehakt? Die nächste offene Übung gleitet von selbst ins Bild',
      'Supersätze bleiben dabei als Paar im Fokus',
      'Der Kopf mit Trainingszeit, Abbrechen und Fertig bleibt jederzeit erreichbar',
    ]
  },
  'cl-2026-07-31-heute-avatar': {
    label: '31.07.2026 · Dein Profilbild auf der Startseite',
    items: [
      'Die Begrüßung oben links ist Geschichte — dort sitzen jetzt dein Profilbild und dein Name, klar und aufgeräumt',
      'Ein Tipp aufs Bild öffnet dein Profil: Foto und Name direkt bearbeiten',
      'Ein neues Foto gilt sofort nach der Auswahl — ganz ohne Speichern-Knopf',
      'Ohne Foto zeigt der Kreis deine Initialen in deiner Themefarbe',
    ]
  },
  'cl-2026-07-29-coach-stimme': {
    label: '31.07.2026 · Dein Coach hat jetzt eine Stimme',
    items: [
      'Drück im Training auf den Sprech-Knopf und frag laut: „Wie führe ich die Übung aus?" — die Antwort kommt gesprochen und geschrieben',
      'Such dir bei der Einrichtung die Stimme aus, die dir gefällt, und hör sie dir vorher an',
      'Laufende Musik wird nur leiser, nicht unterbrochen',
      'Der Coach redet nie von selbst los — nur wenn du ihn fragst',
    ]
  },
  'cl-2026-07-31-coach-hub': {
    label: '31.07.2026 · Dein Coach-Menü, neu gebaut',
    items: [
      'Ein Tipp auf die Coach-Karte öffnet ein Blatt mit fünf Kacheln — Gespräch, Woche, Persönlichkeit, Umfang und Journal. Ein Tipp auf eine Kachel zoomt in sie hinein, der Pfeil oben links führt zurück',
      'Jede Kachel zeigt ihre Zahl groß und ihren Namen klein — Wochenvolumen, Ton, Einträge: du siehst den Stand, ohne zu tippen',
      'Die Wochenkachel zeigt deinen Verlauf: acht Wochen Volumen, wohin deine Sätze gingen, und dein geschätztes Maximum über die Zeit',
      'Setz dir ein Kraftziel für eine Übung, und der Coach sagt dir, wann du es bei gleichbleibendem Tempo erreichst',
      'Den Ton wählst du jetzt mit einem Regler — der Beispielsatz ändert sich, während du ziehst',
      'Die Karte auf der Startseite zeigt die Erholung der Muskelgruppe, die als Nächstes dran ist, dazu deine Woche im Vergleich zur vorigen',
    ]
  },
  'cl-2026-07-29-coach-wochenbericht': {
    label: '29.07.2026 · Jeden Sonntag: deine Woche',
    items: [
      'Sonntagabend fasst dein Coach die Woche zusammen — Volumen, Sätze, Einheiten, Bestwerte und der Vergleich zur Vorwoche',
      'Auf dem Sperrbildschirm steht die echte Zusammenfassung, nicht nur ein Hinweis',
      'Bei stabilem Fortschritt siehst du, wann du dein Ziel erreichst — mit ehrlicher Einschränkung, nie als Versprechen',
      'Die letzten acht Wochen bleiben im Coach-Menü nachlesbar',
      'Die Uhrzeit kannst du selbst festlegen',
    ]
  },
  'cl-2026-07-29-coach-meldet-sich': {
    label: '29.07.2026 · Dein Coach meldet sich, auch wenn die App zu ist',
    items: [
      'Die Trainings-Erinnerung sagt jetzt, was ansteht: „Heute Push — Bank 3 × 8 @ 62,5" statt „Zeit fürs Gym"',
      'Nach einem neuen Bestwert gratuliert er dir noch am selben Tag',
      'Bleibst du fünf Tage weg, meldet er sich einmal. Öffnest du die App, verschiebt sich das von selbst',
      'Einmal im Jahr zeigt er dir, wo du vor zwölf Monaten standest',
      'Du bestimmst, wie oft: gar nicht, höchstens einmal am Tag oder bis zu zweimal',
    ]
  },
  'cl-2026-07-29-coach-training': {
    label: '29.07.2026 · Der Coach begleitet dein Training',
    items: [
      'Er begrüßt dich mit dem, was du beim letzten Mal geschafft hast, ordnet zur Halbzeit ein und zieht am Ende Bilanz',
      'Beim Öffnen einer Übung sagt er dir dein Aufwärmschema an — in Kilo, nicht in Prozent',
      'Nach jedem Satz kannst du mit einem Tipp sagen: leicht, passend oder schwer. Das nächste Gewicht richtet sich danach',
      'Er merkt, wenn deine Wiederholungen fallen und die Pausen länger werden — und sagt es, bevor du dich verausgabst',
      'Alles davon läuft ohne Internet. Auch im Keller-Gym',
      'Wie oft er sich meldet, bestimmst du: höchstens vier Mal pro Training, oder acht, oder gar nicht',
    ]
  },
  'cl-2026-07-29-coach-persoenlich': {
    label: '29.07.2026 · Dein Coach bekommt einen Namen',
    items: [
      'Gib deinem Coach einen Namen und einen Ton — ruhig, sachlich, fordernd oder locker. Er redet ab sofort so mit dir',
      'Neu: das Coach-Menü. Ein Tipp auf die Coach-Karte auf der Startseite öffnet Chat, Journal, Wochenbericht und Einstellungen',
      'Im Journal siehst du zum ersten Mal, was der Coach über dich weiß — und kannst jeden einzelnen Eintrag löschen',
      'Beim Abschluss des Abos entscheidest du selbst, wie sehr sich der Coach einmischt: zurückhaltend, ausgewogen oder eng dabei',
    ]
  },
  'cl-2026-07-29-coach-schneller': {
    label: '29.07.2026 · Der Coach antwortet schneller und kostet weniger',
    items: [
      'Elf weitere Fragen beantwortet die App sofort selbst — Streak, Wochenfortschritt, letzter Rekord, nächster Plantag und mehr, ohne Wartezeit und auch ohne Empfang im Keller-Gym',
      'Neu: Frag „Warum 62,5?" und der Coach erklärt dir die Rechnung hinter seinem Gewichtsvorschlag',
      'Die Vorschläge über dem Eingabefeld richten sich jetzt danach, ob du gerade trainierst, eben fertig geworden bist oder pausierst',
      'Fragen rund um Krankheit, Beschwerden oder Schwangerschaft beantwortet die App nicht mehr aus eigenen Zahlen, sondern reicht sie an den Coach weiter',
    ]
  },
  'cl-2026-07-29-feinschliff': {
    label: '29.07.2026 · Feinschliff: Bedienung und englische Texte',
    items: [
      'Bottom-Sheets lassen sich jetzt überall nach unten wegziehen — an der Kopfzeile und am Inhalt, nicht mehr nur am schmalen Griff',
      'Im Freundesprofil standen „Entfernen" und „Blockieren" beim Runterscrollen unter dem Rand — jetzt sind sie vollständig erreichbar',
      'Die Beschriftungen in der Tab-Leiste kleben nicht mehr aneinander und werden nicht mehr abgeschnitten',
      'Englische App: Split-Erklärung, Erholungsliste, Gewichtsvorschläge und Community-Hinweise waren teilweise noch deutsch — durchgängig übersetzt',
      'Die Wochenübersicht gab es doppelt (Start- und Statistik-Seite); sie steht jetzt nur noch in der Statistik',
    ]
  },
  'cl-2026-07-28-coach-gedaechtnis': {
    label: '28.07.2026 · Der KI-Coach merkt sich, wer du bist',
    items: [
      'Neues Gedächtnis: Nennst du im Chat eine Einschränkung, ein Ziel oder eine Vorliebe, merkt der Coach sie sich und schlägt nichts mehr vor, was dagegen läuft',
      'Gemeldete Beschwerden verfallen nach sechs Wochen automatisch — der Coach fragt nach, statt dich dauerhaft zu bremsen',
      'Vorschläge, die du fünfmal hintereinander wegwischst, kommen nicht mehr',
      'Häufige Fragen wie „Wie viele Sätze noch?" oder „Was ist mein Rekord bei Bankdrücken?" beantwortet die App sofort selbst, ohne Wartezeit',
      'Dein Gedächtnis liegt an deinem Konto: ein zweites Konto auf demselben Gerät sieht davon nichts, beim Löschen des Kontos ist es weg',
    ]
  },
  'cl-2026-07-25-checkin-autoregulation': {
    label: '25.07.2026 · Dein Check-in steuert jetzt das nächste Training',
    items: [
      '🧠 Der KI-Coach wendet dein Post-Workout-Feedback wirklich an: Gewichtsvorschläge, Satzpausen und Progression passen sich automatisch an Gefühl & Energielevel an',
      '📉 Mehrfach schwer bei wenig Energie → automatischer Deload (~8 % weniger Gewicht, längere Pausen)',
      '🚀 Locker bei voller Energie → größere Steigerung wird sofort freigegeben',
      '💬 Beim Trainingsstart sagt der Coach an, was er aus deinem Check-in gemacht hat',
      '✨ Tagesempfehlung auf der Startseite komplett neu: Erholungsring, KI-Aura und tägliches Briefing — auch an Plan- und Erholungstagen',
    ]
  },
  'cl-2026-07-24-coach-aura-border-fix': {
    label: '24.07.2026 · Fix: KI-Coach-Rahmen im Training',
    items: [
      '🧠 Der pulsierende blaue KI-Coach-Rahmen läuft jetzt sauber am ganzen Rand der aktiven Übung entlang',
      '✨ Vorher schnitt der Glow durch die Übungskarte statt außen umzulaufen',
    ]
  },
  'cl-2026-07-24-push-token-signout-fix': {
    label: '24.07.2026 · Fix: Falsche Flammen-Benachrichtigungen nach Konto-Wechsel',
    items: [
      '🔔 Beim Abmelden wird der Geräte-Push-Token jetzt aus dem Profil entfernt',
      '🚫 Verhindert, dass ein neu angemeldeter Account auf demselben Gerät Push-Benachrichtigungen für Reaktionen auf Posts des alten Kontos bekommt',
      '🔴 Roter Zähler am App-Icon verschwindet jetzt beim Öffnen der App zuverlässig',
    ]
  },
  'cl-2026-07-23-live-coach-plus': {
    label: '23.07.2026 · KI-Coach: sichtbarer, reagiert auf Anstrengung, schlägt Trainingstag vor',
    items: [
      '🧠 Live-Coach im Training feuert jetzt häufiger (mehr Trigger, kürzerer Cooldown) — bleibt aber sparsam dosiert',
      '📉 Check-in „Sehr schwer" bremst die Gewichtssteigerung beim nächsten Training automatisch',
      '🎯 Neue Tagesempfehlung auf dem Heute-Tab: schlägt bei freiem Tag die am besten erholte Muskelgruppe vor',
    ]
  },
  'cl-2026-07-14-english': {
    label: '14.07.2026 · MyGymTrack spricht jetzt Englisch',
    items: [
      '🌍 Komplette englische Übersetzung — die App wählt die Sprache automatisch nach deiner Gerätesprache',
      '⚙️ Manuelle Wahl in den Einstellungen: Auto · Deutsch · English',
      '📱 Homescreen-Widget und Live-Activity folgen der Systemsprache',
    ]
  },
  'cl-2026-06-24-widget-start-flow': {
    label: '24.06.2026 · Plan-Widget startet wie der normale Trainingsstart',
    items: [
      'Plan aus dem Widget öffnet jetzt zuerst die Übungs-Auswahl — du kannst Übungen prüfen, hinzufügen oder abwählen',
      '▶️ Erst der finale „Training starten"-Button führt ins aktive Training (vorher sprang das Widget direkt rein)',
      '✅ Identischer Ablauf wie beim normalen Trainingsstart, inkl. Plan-Hinweis und Vorauswahl',
    ]
  },
  'cl-2026-06-24-recovery-bodyweight': {
    label: '24.06.2026 · Erholung zählt jetzt auch Bodyweight-Training',
    items: [
      '🔋 Fix: Nach dem Training sank die Muskel-Erholung nicht, wenn Sätze ohne Gewicht geloggt wurden (Klimmzüge, Dips, Liegestütze, Wdh-only, Widget-Schnellstart)',
      '💪 Bodyweight-Sätze ermüden den Muskel jetzt real — die Erholungs-Batterie fällt korrekt und füllt sich über die Zeit wieder auf',
      '⚖️ Synthetische Last nutzt dein zuletzt geloggtes Körpergewicht; Volumen-, PR- und 1RM-Statistik bleiben unverändert (echtes Gewicht)',
    ]
  },
  'cl-2026-05-29-settings-cleanup': {
    label: '29.05.2026 · Einstellungen aufgeräumt + Statistik-Suche',
    items: [
      '🧹 Einstellungen aufgeräumt: „GymTrack unterstützen", „Begleiter", „App" und „Admin" entfernt',
      '🐕 Begleiter-Feature komplett deaktiviert — keine Pet-Lane mehr in der Tab-Leiste',
      '🔍 Lupen-Icon im Suchfeld der Übungen-Seite entfernt — schlichter Look',
      '🔎 Neues Suchfeld im Statistik-Tab: Übungen direkt durchsuchen',
    ]
  },
  'cl-2026-05-28-3d-arme-waden': {
    label: '28.05.2026 · 3D-Modell: Arme & Waden anatomisch korrigiert',
    items: [
      '🚫 Unterarm als anklickbarer Muskel komplett entfernt — Unterarm bleibt jetzt im neutralen Hautton',
      '💪 Bizeps schmiegt sich exakt an die Vorderseite des Oberarms, nicht mehr mit dem Unterarm verbunden',
      '🦾 Trizeps korrekt an der Rückseite des Oberarms, sichtbare Ellenbogen-Gap zum Unterarm',
      '🦵 Waden hinten an der Kniekehle (vorher leicht zu weit vorne Richtung Schienbein)',
      '🎯 Im Armbereich nur noch: Bizeps, Trizeps, vordere/seitliche/hintere Schulter',
      '🧪 Diesmal: GLB direkt in Blender geladen + Vertex-Daten pro Z-Schicht ausgewertet — Kapseln liegen nachweisbar im Modell (max 2 cm Abweichung)',
    ]
  },
  'cl-2026-05-28-3d-bizeps-fix': {
    label: '28.05.2026 · 3D-Modell: Bizeps & vordere Schulter korrigiert',
    items: [
      '💪 Bizeps-Markierung sitzt jetzt exakt auf der Oberarm-Vorderseite (vorher lag die Capsule vor dem Arm in der Luft)',
      '🤷 Vordere Schulter (anteriorer Deltoid) korrekt am oberen Schulterrand statt im Kopf-/Halsbereich',
      '🎯 Capsule-Koordinaten durch direkte Vertex-Analyse des GLB-Modells kalibriert (kein Raten mehr)',
      '🔧 Auch Trizeps + seitliche/hintere Schulter an die echte Arm-Geometrie (T-Pose) angepasst',
    ]
  },
  'cl-2026-05-28-muscle-fatigue': {
    label: '28.05.2026 · 3D-Muskel-Ermüdung im Statistik-Tab',
    items: [
      '🧬 Echte anatomische 3D-Figur (Sketchfab-Modell "MaleMuscle" von HEPL3D, CC-BY 4.0) statt prozeduraler Ellipsoide',
      '👆 Mini-Vorschau im Statistik-Tab: Daumen-Wischen dreht die Figur leicht (~±40°)',
      '🔄 Vollbild-Ansicht: 360°-Rotation in beide Richtungen, Auf/Ab-Wischen kippt die Ansicht',
      '🎯 Tap auf einen Muskel öffnet Detail-Overlay mit %-Ring, letztem Training, empfohlener Pause & 7-Tage-Historie',
      '🎨 Farbcode: Rot = sehr stark ermüdet · Orange = mittel · Grün = leicht · Hautton = erholt',
      '🧠 Berechnung: Gewicht × Wiederholungen × Satz-Typ-Multiplikator (Warmup 0.2 · Top 1.3 · Drop 1.2 · Fail 1.35), Half-Life-Decay 36 h',
      '📊 Tap auf Volumen-Chart → Vollbild für genauere Ansicht',
    ]
  },
  'cl-2026-05-27-big-update': {
    label: '27.05.2026 · Großes Feature-Update',
    items: [
      '🎡 Apple-Style Drehrad-Picker für Gewicht & Wiederholungen statt Tastatur',
      '⚖️ kg / lbs umschaltbar in den Einstellungen — automatische Umrechnung',
      '✏️ Übung im Training tippen → umbenennen oder durch andere ersetzen',
      '➕ Eigene Splits erstellen: Plus-Button bei Muskeln/PPL/Ober-Unter mit eigenen Gruppen & Muskel-Auswahl',
      '📈 Progression intelligenter: bei eingebrochenen Wdh wird ein realistisches Wdh-Ziel vorgeschlagen statt nur Gewicht halten',
      'ℹ️ i-Button pro Übung im Training öffnet eine ausführliche Progressions-Erklärung',
      '↕️ Drag & Drop scrollt jetzt automatisch nach oben/unten, damit Wochentage immer erreichbar sind',
      '✉️ Feedback senden direkt aus den Einstellungen per Mail an den Entwickler',
      '🚫 Icons komplett entfernt: keine Emoji-Auswahl beim Erstellen, keine Emojis vor Übungsnamen mehr',
    ]
  },
  'cl-2026-05-27-settype-cleanup': {
    label: '27.05.2026 · Satz-Typen & UI-Cleanup',
    items: [
      'Satz-Typ-Button: Tap öffnet jetzt Auswahl-Popup mit Erklärungen zu Normal, Aufwärmsatz, Top-Satz, Drop-Satz & Bis-zum-Versagen',
      'Neuer Satz-Typ „T" (Top-Satz) für den schwersten Arbeitssatz des Tages',
      'Übungen-Liste: weißes Icon-Feld verschwindet, wenn kein Emoji gewählt wurde — Text rückt nach links',
      'Heute-Seite: Begrüßung & Vorschlagskarten ohne Emojis',
    ]
  },
  'cl-2026-05-27-cardio-update': {
    label: '27.05.2026 · Cardio & Update-Fixes',
    items: [
      '🏃 Cardio-Timer: Ring pulsiert dynamisch mit umlaufendem Lichtbogen während Training',
      '✏️ Übungen-Tab: Tap auf Übung öffnet jetzt Bearbeiten statt Statistik',
      '➕ „Übung hinzufügen"-Button jetzt oben über der Liste',
      '🔄 Updates werden jetzt zuverlässig erkannt: regelmäßiger Check alle 3 Min + beim App-Wiederöffnen',
      '✓ Bestätigungs-Toast nach jedem Update mit Versionsnummer',
    ]
  },
  'cl-2026-05-26-swipe-suggestions': {
    label: '26.05.2026 · UI-Verbesserungen',
    items: [
      'Vorschläge diese Woche: Box scrollt intern – Startseite bleibt kompakt',
      '👆 Übungen: Nach links wischen zeigt Löschen-Button – schnell & ohne Detail-Ansicht',
    ]
  },
  'cl-2026-05-25-analytics': {
    label: '25.05.2026 · Mehrere Updates',
    items: [
      '📊 Admin-Statistiken: Live-Online, DAU/WAU/MAU, Verweildauer, Retention',
      '🗂️ Trainingsplan-Vorlagen liefern jetzt konkrete Übungen pro Tag',
      '🖐️ Drag & Drop: Übungen in „Meine Übungen" und im aktiven Training umsortieren',
      '🎚️ Splits als Chips ins Wochenplan-Sheet zum Reinziehen',
      '🔄 Training läuft im Hintergrund: Mini-Banner oben mit Timer',
      '⬅️ Minus-Button (Satz löschen) jetzt links statt rechts',
    ]
  },
  'cl-2025-tour-spotlight': {
    label: 'Tour & Onboarding',
    items: [
      '🎯 Geführte Tour: Spotlight führt dich durch jedes Feature',
      '✨ 19 Schritte durch alle Tabs mit pulsierendem Glow',
      '🎓 Jederzeit erneut über Einstellungen → App → „Tour neu starten"',
    ]
  },
  'cl-2025-streak-library': {
    label: 'Streak, Bibliothek, Heatmap',
    items: [
      '🔥 Streak-Counter im Heute-Tab',
      '📚 Übungs-Bibliothek: 60+ Standard-Übungen',
      '📊 Aktivitäts-Heatmap (12 Monate, GitHub-Style)',
      '👀 Live-Vergleich beim Training: „letztes Mal: X kg × Y"',
      '🔍 Suchleiste im Übungen-Tab',
      '🏷️ Satz-Typen: Aufwärmen, Drop-Satz, Bis-zum-Versagen',
      '📳 Haptisches Feedback beim Satz-Abhaken und Tab-Wechsel',
    ]
  },
  'cl-2025-themes-notif': {
    label: 'Themes & Benachrichtigungen',
    items: [
      '🟢 Grünes Theme zusätzlich zu Hell, Rosa, Dunkel, Blau',
      '🔔 Trainings-Erinnerungen täglich, Uhrzeit frei wählbar',
      '✅ Satz-Checkboxen: abhaken, Zeile wird ausgegraut',
      '💧 Flüssige Tab-Animation als Wasserblase',
    ]
  },
  'cl-2025-weekplan': {
    label: 'Wochenplan & Drag-Drop',
    items: [
      'Wochenplan: Übungen Tagen zuordnen (Mo–So)',
      '🗓️ Kalender-Symbol oben rechts in „Meine Übungen"',
      '🎯 Pro Tag: Trainingsgruppe oder einzelne Übungen',
      '👀 Wochenvorschau im Übungen-Tab',
      'Wochenplan-Vorauswahl beim Training-Start',
    ]
  },
  'cl-2025-1rm-stats': {
    label: '1RM & Statistik',
    items: [
      '💪 1RM-Berechnung via Epley-Formel',
      '📈 1RM-Verlauf-Chart in der Übungs-Detailansicht',
      '🔄 Statistik-Modus-Switcher: Muskeln · PPL · Ober-Unter',
    ]
  },
  'cl-2025-foundation': {
    label: 'Basis-Features',
    items: [
      '🐕 Begleiter-System',
      '☁️ Google Login & Cloud-Sync',
      '📊 Muskelgruppen-Statistik mit Verlaufsdiagramm',
      '🏃 Cardio-Timer mit Hintergrund-Benachrichtigung',
    ]
  }
};

/* ── MUSKELGRUPPEN ── */
const MUSCLE_GROUPS = [
  { id:'brust',     label:'Brust'      },
  { id:'ruecken',   label:'Rücken'     },
  { id:'beine',     label:'Beine'      },
  { id:'arme',      label:'Arme'       },
  { id:'schultern', label:'Schultern'  },
  { id:'core',      label:'Core'       },
];
if (GT_LANG === 'en') {
  const _MG_EN = { brust:'Chest', ruecken:'Back', beine:'Legs', arme:'Arms', schultern:'Shoulders', core:'Core' };
  MUSCLE_GROUPS.forEach(g => g.label = _MG_EN[g.id] || g.label);
}
const MUSCLE_FILTER = [{id:'alle', label: GT_LANG === 'en' ? 'All' : 'Alle'}, ...MUSCLE_GROUPS];
