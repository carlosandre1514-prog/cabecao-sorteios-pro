package com.cabecao.sorteios;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Cabeção Sorteios Pro no Android: abre o site do app (GitHub Pages) numa tela cheia.
 *
 * - O app atualiza junto com o site; depois do primeiro acesso funciona sem internet (service worker).
 * - Links de fora (WhatsApp, página de pagamento, e-mail) abrem no app certo do celular.
 * - "Compartilhar" do site vira o compartilhar do Android (texto e imagens), pela ponte CabecaoNativo.
 * - Escolher foto do escudo usa a galeria/câmera do Android.
 */
public class MainActivity extends Activity {
    static final String URL_APP = "https://carlosandre1514-prog.github.io/cabecao-sorteios-pro/";
    static final String HOST = "carlosandre1514-prog.github.io";
    static final String CAMINHO = "/cabecao-sorteios-pro";
    static final int PEDIDO_ARQUIVO = 7;

    private WebView web;
    private ValueCallback<Uri[]> escolhaArquivo;

    // Ponte do site para o Android: navigator.share, window.open e cópia
    private static final String PONTE_JS =
        "(function(){if(window.__cabecaoPonte||!window.CabecaoNativo)return;window.__cabecaoPonte=1;" +
        "var N=window.CabecaoNativo;" +
        "var ler=function(f){return new Promise(function(ok,er){var r=new FileReader();r.onload=function(){ok(String(r.result).split(',')[1]||'')};r.onerror=er;r.readAsDataURL(f)})};" +
        "navigator.canShare=function(d){return !!d};" +
        "navigator.share=function(d){d=d||{};var t=[d.text,d.url].filter(Boolean).join('\\n');" +
        "if(d.files&&d.files.length){var f=d.files[0];return ler(f).then(function(b){N.compartilharArquivo(b,f.type||'application/octet-stream',f.name||'arquivo',t)})}" +
        "N.compartilharTexto(t,d.title||'');return Promise.resolve()};" +
        "window.open=function(u){if(u){try{N.abrirFora(String(new URL(u,location.href)))}catch(e){}}return null};" +
        "})();";

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0F1214);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // apito no fim da partida
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setUserAgentString(s.getUserAgentString() + " CabecaoApp/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Ponte(), "CabecaoNativo");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
                Uri u = pedido.getUrl();
                if (doApp(u)) return false;
                abrirFora(u.toString());
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                v.evaluateJavascript(PONTE_JS, null);
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest pedido, WebResourceError erro) {
                // sem internet e sem a cópia guardada: tela de "sem conexão"
                if (pedido.isForMainFrame()) v.loadUrl("file:///android_asset/sem-internet.html");
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> volta, FileChooserParams params) {
                if (escolhaArquivo != null) escolhaArquivo.onReceiveValue(null);
                escolhaArquivo = volta;
                try {
                    startActivityForResult(params.createIntent(), PEDIDO_ARQUIVO);
                } catch (ActivityNotFoundException e) {
                    escolhaArquivo = null;
                    return false;
                }
                return true;
            }
        });

        if (salvo != null) web.restoreState(salvo);
        else web.loadUrl(URL_APP);
    }

    /** O que fica dentro do app: as páginas do Cabeção e a tela local de "sem internet". */
    static boolean doApp(Uri u) {
        if (u == null) return true;
        String esquema = u.getScheme();
        if ("file".equals(esquema) || "about".equals(esquema) || "blob".equals(esquema) || "data".equals(esquema)) return true;
        String caminho = u.getPath() == null ? "" : u.getPath();
        return "https".equals(esquema) && HOST.equalsIgnoreCase(u.getHost()) && caminho.startsWith(CAMINHO);
    }

    void abrirFora(String url) {
        try {
            Intent i = url.startsWith("intent:") ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (Exception e) {
            // nenhum app abre esse link: ignora (o site continua onde estava)
        }
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        if (pedido == PEDIDO_ARQUIVO) {
            if (escolhaArquivo != null) escolhaArquivo.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado, dados));
            escolhaArquivo = null;
            return;
        }
        super.onActivityResult(pedido, resultado, dados);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        if (web != null) { web.evaluateJavascript("window.Painel&&Painel.saiu&&Painel.saiu()", null); web.onPause(); }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) { web.onResume(); web.evaluateJavascript("window.Painel&&Painel.voltou&&Painel.voltou()", null); }
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        if (web != null) web.saveState(estado);
    }

    /** Chamado pelo site (JavaScript). Tudo roda na tela principal do Android. */
    class Ponte {
        @JavascriptInterface
        public void compartilharTexto(final String texto, final String titulo) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, texto == null ? "" : texto);
                startActivity(Intent.createChooser(i, titulo == null || titulo.isEmpty() ? "Compartilhar" : titulo));
            });
        }

        @JavascriptInterface
        public void compartilharArquivo(final String base64, final String tipo, final String nome, final String texto) {
            runOnUiThread(() -> {
                try {
                    File pasta = new File(getCacheDir(), "compartilhar");
                    if (!pasta.exists()) pasta.mkdirs();
                    String seguro = (nome == null || nome.isEmpty() ? "arquivo" : nome).replaceAll("[^A-Za-z0-9._-]", "_");
                    File arq = new File(pasta, seguro);
                    try (FileOutputStream out = new FileOutputStream(arq)) { out.write(Base64.decode(base64, Base64.DEFAULT)); }
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".arquivos", arq);
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType(tipo == null || tipo.isEmpty() ? "application/octet-stream" : tipo);
                    i.putExtra(Intent.EXTRA_STREAM, uri);
                    if (texto != null && !texto.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, texto);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, "Compartilhar"));
                } catch (Exception e) {
                    compartilharTexto(texto, "Compartilhar");
                }
            });
        }

        @JavascriptInterface
        public void abrirFora(final String url) {
            runOnUiThread(() -> MainActivity.this.abrirFora(url));
        }
    }
}
