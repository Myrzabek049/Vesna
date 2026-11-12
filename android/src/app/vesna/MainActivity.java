package app.vesna;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.PermissionRequest;
import java.util.Locale;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Vesna для Android: веб-редактор из assets/www в WebView.
 * Файлы отдаются с https://appassets.androidplatform.net/ (защищённый origin —
 * работают IndexedDB, MediaRecorder и Web Audio). Готовое видео сохраняется в Movies/Vesna.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final int REQ_FILES = 1001;
    private static final int REQ_STORAGE = 1002;
    private static final int REQ_MIC = 1003;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private PermissionRequest pendingPermission;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0D1110);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " VesnaAndroid/2.0");

        web.addJavascriptInterface(new Bridge(), "VesnaAndroid");
        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new Chrome());

        // голос Киви — системный синтезатор речи
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(new Locale("ru", "RU"));
                ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {}
                    @Override public void onDone(String id) { runOnUiThread(() -> web.evaluateJavascript("window.VesnaSpeakDone && VesnaSpeakDone()", null)); }
                    @Override public void onError(String id) { onDone(id); }
                });
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);

        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        // Назад — сначала закрываем открытый диалог / снимаем выделение в редакторе
        web.evaluateJavascript("(window.VesnaBack && window.VesnaBack()) ? 1 : 0", value -> {
            if (!"1".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        // при сворачивании сохраняем проект
        web.evaluateJavascript("window.VesnaSave && window.VesnaSave()", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQ_MIC && pendingPermission != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else pendingPermission.deny();
            pendingPermission = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /* ---------- Отдача файлов приложения из assets/www ---------- */
    private class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            try {
                InputStream in = getAssets().open("www" + path, AssetManager.ACCESS_STREAMING);
                String ext = MimeTypeMap.getFileExtensionFromUrl(path);
                String mime = mimeFor(ext);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-cache");
                headers.put("Access-Control-Allow-Origin", "*");
                return new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") ? "utf-8" : null,
                        200, "OK", headers, in);
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), null);
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            // внешние ссылки открываем в браузере
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
            return true;
        }
    }

    private static String mimeFor(String ext) {
        if (ext == null) return "application/octet-stream";
        switch (ext.toLowerCase()) {
            case "html": return "text/html";
            case "js": return "text/javascript";
            case "css": return "text/css";
            case "svg": return "image/svg+xml";
            case "json":
            case "webmanifest": return "application/json";
            case "png": return "image/png";
            case "woff2": return "font/woff2";
            case "mp3": return "audio/mpeg";
            default:
                String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
                return m != null ? m : "application/octet-stream";
        }
    }

    /* ---------- Выбор файлов (импорт медиа) ---------- */
    private class Chrome extends WebChromeClient {
        // доступ к микрофону для озвучки
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> {
                boolean wantsMic = false;
                for (String r : request.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
                if (!wantsMic) { request.deny(); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    pendingPermission = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                }
            });
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("*/*");
            pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "image/*", "audio/*"});
            pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try {
                startActivityForResult(Intent.createChooser(pick, "Выберите файлы"), REQ_FILES);
            } catch (Exception e) {
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_FILES) { super.onActivityResult(requestCode, resultCode, data); return; }
        if (fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                result = new Uri[n];
                for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    /* ---------- Мост JS ↔ Android: сохранение экспортированного видео ---------- */
    private class Bridge {
        private OutputStream out;
        private Uri pendingUri;
        private File pendingFile;
        private String displayPath;

        @JavascriptInterface
        public boolean begin(String name, String mime) {
            closeQuietly();
            try {
                String safe = name.replaceAll("[\\\\/:*?\"<>|]+", "_");
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/Vesna");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    ContentResolver cr = getContentResolver();
                    boolean video = mime != null && mime.startsWith("video/");
                    if (!video) v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Vesna");
                    pendingUri = cr.insert(video
                            ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                            : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
                    if (pendingUri == null) return false;
                    out = cr.openOutputStream(pendingUri);
                    displayPath = (video ? "Movies/Vesna/" : "Download/Vesna/") + safe;
                } else {
                    boolean video = mime != null && mime.startsWith("video/");
                    File dir = new File(Environment.getExternalStoragePublicDirectory(video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_DOWNLOADS), "Vesna");
                    if (!dir.exists() && !dir.mkdirs()) {
                        dir = getExternalFilesDir(Environment.DIRECTORY_MOVIES);
                    }
                    pendingFile = new File(dir, safe);
                    out = new FileOutputStream(pendingFile);
                    displayPath = pendingFile.getAbsolutePath();
                }
                return out != null;
            } catch (Exception e) {
                closeQuietly();
                return false;
            }
        }

        @JavascriptInterface
        public boolean append(String base64) {
            if (out == null) return false;
            try {
                out.write(Base64.decode(base64, Base64.DEFAULT));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String finish() {
            if (out == null) return "";
            try {
                out.flush();
                out.close();
                out = null;
                if (pendingUri != null) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContentResolver().update(pendingUri, v, null, null);
                } else if (pendingFile != null) {
                    MediaScannerConnection.scanFile(MainActivity.this, new String[]{pendingFile.getAbsolutePath()}, null, null);
                }
                return displayPath;
            } catch (Exception e) {
                return "";
            } finally {
                pendingUri = null;
                pendingFile = null;
            }
        }

        @JavascriptInterface
        public void keepAwake(final boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void speak(final String text, final float pitch, final float rate, final String voiceName) {
            if (tts == null || !ttsReady) { runOnUiThread(() -> web.evaluateJavascript("window.VesnaSpeakDone && VesnaSpeakDone()", null)); return; }
            try {
                android.speech.tts.Voice chosen = null;
                if (voiceName != null && !voiceName.isEmpty() && tts.getVoices() != null) {
                    for (android.speech.tts.Voice v : tts.getVoices()) if (v.getName().equals(voiceName)) { chosen = v; break; }
                }
                if (chosen != null) tts.setVoice(chosen);
                else tts.setLanguage(new Locale("ru", "RU"));
            } catch (Exception ignored) {}
            tts.setPitch(Math.max(0.3f, Math.min(2.5f, pitch)));
            tts.setSpeechRate(Math.max(0.3f, Math.min(3f, rate)));
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "kiwi");
        }

        /* Русские голоса, установленные на устройстве: [{id, name}] */
        @JavascriptInterface
        public String voicesJson() {
            org.json.JSONArray arr = new org.json.JSONArray();
            if (tts == null || !ttsReady) return arr.toString();
            try {
                java.util.List<android.speech.tts.Voice> list = new java.util.ArrayList<>();
                for (android.speech.tts.Voice v : tts.getVoices()) {
                    if (v.getLocale() != null && "ru".equals(v.getLocale().getLanguage())
                            && (v.getFeatures() == null || !v.getFeatures().contains("notInstalled"))) list.add(v);
                }
                java.util.Collections.sort(list, (a, b) -> {
                    if (a.isNetworkConnectionRequired() != b.isNetworkConnectionRequired()) return a.isNetworkConnectionRequired() ? 1 : -1;
                    return a.getName().compareTo(b.getName());
                });
                int n = 1;
                for (android.speech.tts.Voice v : list) {
                    org.json.JSONObject o = new org.json.JSONObject();
                    o.put("id", v.getName());
                    o.put("name", "Голос " + (n++) + (v.isNetworkConnectionRequired() ? " · интернет" : " · без интернета")
                            + (v.getQuality() >= android.speech.tts.Voice.QUALITY_HIGH ? " · HD" : ""));
                    arr.put(o);
                }
            } catch (Exception ignored) {}
            return arr.toString();
        }

        @JavascriptInterface
        public void stopSpeak() {
            if (tts != null) tts.stop();
        }

        @JavascriptInterface
        public boolean canSpeak() { return ttsReady; }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
        }

        private void closeQuietly() {
            try { if (out != null) out.close(); } catch (IOException ignored) {}
            out = null;
            if (pendingUri != null) {
                try { getContentResolver().delete(pendingUri, null, null); } catch (Exception ignored) {}
                pendingUri = null;
            }
            pendingFile = null;
        }
    }
}
