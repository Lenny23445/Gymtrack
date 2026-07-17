#!/usr/bin/env bash
#
# GymTrack -> App Store: KOMPLETT bauen, signieren und hochladen (lokal auf dem Mac).
# Doppelklick im Finder genuegt. KEIN Xcode-Fenster, KEIN iPhone noetig.
#
# Voraussetzung (einmalig): in Xcode mit der Entwickler-Apple-ID angemeldet sein
# (Xcode > Settings > Accounts) und das "Apple Distribution"-Zertifikat im
# Schluesselbund (Xcode > Settings > Accounts > Manage Certificates > + > Apple Distribution).
#
# Ablauf:
#   1. Web-Assets bauen        (build.js -> www/)
#   2. iOS synchronisieren     (npx cap sync ios)
#   3. Widget + Entitlements   (setup_ios_extensions.rb)
#   4. Signing-Identity sichern (Apple Development, fuer automatische Signierung)
#   5. Version + Build-Nummer hochsetzen
#   6. Unsigniertes Archiv bauen (device-frei; signiert wird in Step 7 beim Export)
#   7. Fuer App Store signieren + zu App Store Connect HOCHLADEN
#
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/node/bin:$PATH"

PROJ="ios/App/App.xcodeproj"
PBX="$PROJ/project.pbxproj"
TEAM="4XU2X547J2"
OUT=".appstore-build"
mkdir -p "$OUT"

echo "============================================="
echo " GymTrack -> App Store  (Build + Upload)"
echo "============================================="

echo; echo "==> 1/7  Web-Assets bauen"
[ -d node_modules ] || npm install
npm run build

echo; echo "==> 2/7  iOS synchronisieren"
npx cap sync ios

echo; echo "==> 3/7  Widget-Extension + Entitlements"
gem list -i xcodeproj >/dev/null 2>&1 || gem install --user-install xcodeproj
ruby setup_ios_extensions.rb

echo; echo "==> 4/7  Signing-Identity sichern"
/usr/bin/sed -i '' 's/CODE_SIGN_IDENTITY = "iPhone Developer";/CODE_SIGN_IDENTITY = "Apple Development";/g' "$PBX"

echo; echo "==> 5/7  Version + Build-Nummer hochsetzen"
CUR=$(grep -m1 -oE 'MARKETING_VERSION = [0-9]+\.[0-9]+\.[0-9]+;' "$PBX" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
IFS='.' read -r MAJ MIN PATCH <<< "$CUR"
NEWVER="$MAJ.$MIN.$((PATCH+1))"
/usr/bin/sed -i '' "s/MARKETING_VERSION = [0-9.]*;/MARKETING_VERSION = ${NEWVER};/g" "$PBX"
BUILD="$(date +%y%m%d%H%M)"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" "ios/App/App/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" "ios/App/GymTrackWidget/Info.plist"
echo "    Version:      $CUR -> $NEWVER"
echo "    Build-Nummer: $BUILD"

echo; echo "==> 6/8  Unsigniertes Archiv bauen (dauert 1-2 Min)"
# Archiv UNSIGNIERT bauen (device-frei — signiertes Archiv würde ein Development-Profil
# erzwingen, das ein registriertes Gerät braucht → ARCHIVE FAILED). ABER: unsigniert läuft
# die CodeSign-Phase NICHT → App.entitlements landet NICHT im Binary. Deshalb Step 6b.
rm -rf "$OUT/App.xcarchive"
xcodebuild -project "$PROJ" -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$OUT/App.xcarchive" archive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO

echo; echo "==> 6b/8  Entitlements ins Binary einbacken (ad-hoc Re-Sign)"
# KRITISCH: Ohne diesen Schritt fehlt com.apple.developer.applesignin (und HealthKit/App-Groups)
# im ausgelieferten Binary → Apple-Login schlägt zur Laufzeit mit ASAuthorizationError 1000 fehl.
# Ursache: unsigniertes Archiv trägt keine Entitlements; der automatische Distribution-Export
# signiert dann nur mit Default-Entitlements. Fix: hier ad-hoc (-s -) mit den echten
# Entitlements re-signieren (inside-out: Frameworks → Widget-Extension → App), damit der
# Export sie übernimmt. Verifiziert am Binary; bricht ab wenn applesignin fehlt.
RS_APP="$OUT/App.xcarchive/Products/Applications/App.app"
RS_APPEX="$RS_APP/PlugIns/GymTrackWidget.appex"
for f in "$RS_APP"/Frameworks/*; do [ -e "$f" ] && codesign -f -s - "$f"; done
if [ -d "$RS_APPEX/Frameworks" ]; then
  for f in "$RS_APPEX"/Frameworks/*; do [ -e "$f" ] && codesign -f -s - "$f"; done
fi
[ -d "$RS_APPEX" ] && codesign -f -s - --entitlements "ios/App/GymTrackWidget/GymTrackWidget.entitlements" "$RS_APPEX"
codesign -f -s - --entitlements "ios/App/App/App.entitlements" "$RS_APP"
if codesign -d --entitlements :- "$RS_APP" 2>/dev/null | grep -q applesignin; then
  echo "    ✅ applesignin ist im Archiv-Binary eingebettet"
else
  echo "    ❌ applesignin FEHLT im Archiv-Binary — Abbruch (Upload würde 1000-defekt sein)"; exit 1
fi

echo; echo "==> 7/8  Signieren + zu App Store Connect hochladen"
cat > "$OUT/uploadOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${TEAM}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>destination</key><string>upload</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST

set +e
xcodebuild -exportArchive -archivePath "$OUT/App.xcarchive" \
  -exportOptionsPlist "$OUT/uploadOptions.plist" \
  -exportPath "$OUT/upload" \
  -allowProvisioningUpdates
RC=$?
set -e

echo
if [ $RC -eq 0 ]; then
  echo "============================================="
  echo " FERTIG  ✅   Version $NEWVER (Build $BUILD) hochgeladen."
  echo " Jetzt in App Store Connect (appstoreconnect.apple.com):"
  echo "   - kurz warten bis der Build 'verarbeitet' ist (~5-15 Min)"
  echo "   - Build auswaehlen  ->  'Zur Pruefung einreichen'"
  echo "============================================="
else
  echo "============================================="
  echo " UPLOAD FEHLGESCHLAGEN (Code $RC). Haeufigste Ursachen:"
  echo "   - 'train version closed': Version war schon belegt -> einfach"
  echo "     dieses Skript nochmal starten (erhoeht die Version automatisch)."
  echo "   - 'Apple ID': in Xcode > Settings > Accounts neu anmelden."
  echo " Details oben im Log."
  echo "============================================="
fi
