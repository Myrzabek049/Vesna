#!/usr/bin/env bash
# Сборка Vesna.apk без Gradle: aapt2 → javac → d8 → zipalign → apksigner
# Требуется Android SDK (platforms;android-35, build-tools;35.0.0) и JDK 17+.
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
VERSION=$(grep -o 'versionName="[^"]*"' AndroidManifest.xml | cut -d'"' -f2)
OUT=build
rm -rf "$OUT" && mkdir -p "$OUT"/{res,gen,classes,dex,assets/www}

echo "→ Копирование веб-приложения в assets"
cp -r ../index.html ../css ../js ../icons ../manifest.webmanifest "$OUT/assets/www/"

echo "→ Ресурсы (aapt2)"
"$BT/aapt2" compile --dir res -o "$OUT/res/res.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$JAR" --manifest AndroidManifest.xml \
  --java "$OUT/gen" -A "$OUT/assets" "$OUT/res/res.zip" --auto-add-overlay

echo "→ Компиляция Java"
javac -source 11 -target 11 -encoding UTF-8 -nowarn -Xlint:-options -classpath "$JAR" -d "$OUT/classes" \
  $(find src "$OUT/gen" -name '*.java')

echo "→ DEX (d8)"
"$BT/d8" --release --min-api 26 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
(cd "$OUT/dex" && zip -q -u ../unsigned.apk classes.dex)

echo "→ Выравнивание и подпись"
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
KS=vesna-release.keystore
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass vesna-pass -keypass vesna-pass -alias vesna \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Vesna, O=Vesna, C=RU" >/dev/null 2>&1
fi
mkdir -p ../dist
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:vesna-pass --key-pass pass:vesna-pass --ks-key-alias vesna \
  --out "../dist/Vesna-$VERSION.apk" "$OUT/aligned.apk"
rm -f "../dist/Vesna-$VERSION.apk.idsig"
"$BT/apksigner" verify "../dist/Vesna-$VERSION.apk"
echo "✓ Готово: dist/Vesna-$VERSION.apk ($(du -h "../dist/Vesna-$VERSION.apk" | cut -f1))"
