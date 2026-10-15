// =====================================================================
// remoto.js — INTERRUPTOR REMOTO (desligar app / bloquear versões antigas)
// Controlado pelo Firebase, nó "configuracoes" (veja docs/COMO-CONFIGURAR-MONETIZACAO.md)
// Se o app bloquear/desbloquear errado, o erro está AQUI.
// =====================================================================

// >>> Mude este número a cada novo APK que você lançar <<<
const VERSAO_ATUAL_APP = "1.1.0";

const CHAVE_BLOQUEIO_CACHE = 'cabecao_bloqueio_remoto';

// Roda `cb` assim que o Firebase (carregado pelo <script type="module"> do index.html) estiver pronto.
function aoFirebasePronto(cb) {
    if (window.firebaseReady) cb();
    else window.addEventListener('firebase-ready', cb, { once: true });
}

// Retorna null se esta versão está liberada, ou {titulo, mensagem, link} se deve bloquear.
function avaliarConfigRemota(config) {
    if (config.global && config.global.app_ativo === false) {
        return {
            titulo: '⚠️ Aplicativo Desativado',
            mensagem: config.global.mensagem_desativacao || 'Este aplicativo está temporariamente indisponível. Volte mais tarde!',
            link: ''
        };
    }
    const versaoMinima = config.versoes && config.versoes.versao_minima_permitida;
    if (versaoMinima && Logica.compararVersoes(VERSAO_ATUAL_APP, versaoMinima) < 0) {
        return {
            titulo: '⚠️ Atualização Obrigatória',
            mensagem: (config.versoes && config.versoes.mensagem_versao_minima) ||
                `Esta versão (${VERSAO_ATUAL_APP}) do aplicativo está desatualizada. Baixe a nova versão (mínima: ${versaoMinima}) para continuar!`,
            link: (config.versoes && config.versoes.link_download) || ''
        };
    }
    return null;
}

function lerBloqueioCache() {
    try { return JSON.parse(localStorage.getItem(CHAVE_BLOQUEIO_CACHE) || 'null'); } catch (e) { return null; }
}

// A tela de bloqueio agora é uma CAMADA por cima do app.
// Antes ela apagava o <body> inteiro (document.body.innerHTML = ''), o que quebrava
// o script principal quando o bloqueio vinha do cache, e exigia location.reload() para voltar.
function bloquearTelaApp(titulo, mensagem, link) {
    removerBloqueio();
    const seguro = /^https?:\/\//i.test(String(link || ''));
    const wrap = document.createElement('div');
    wrap.id = 'tela-bloqueio-remoto';
    wrap.style.cssText = 'position:fixed; inset:0; z-index:2147483647; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0a0a0a; color:#fff; text-align:center; padding:20px; font-family:sans-serif; gap:14px;';
    const h = document.createElement('h2');
    h.style.cssText = 'color:#FF1744; margin:0;';
    h.textContent = titulo;
    const p = document.createElement('p');
    p.style.cssText = 'color:#D0D8D0; font-size:0.95rem; max-width:320px; line-height:1.5; margin:0;';
    p.textContent = mensagem;
    wrap.append(h, p);
    if (seguro) {
        const a = document.createElement('a');
        a.href = link;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = '⬇️ Baixar nova versão';
        a.style.cssText = 'background:linear-gradient(135deg,#7CFF00,#00C853); color:#000; font-weight:800; padding:12px 22px; border-radius:8px; text-decoration:none; text-transform:uppercase;';
        wrap.appendChild(a);
    }
    document.body.appendChild(wrap);
}

function removerBloqueio() {
    const el = document.getElementById('tela-bloqueio-remoto');
    if (el) el.remove();
}

function exibirBannerAtualizacao(novaVersao, linkDownload) {
    if (document.getElementById('banner-soft-update')) return;
    const banner = document.createElement('div');
    banner.id = 'banner-soft-update';
    banner.style.cssText = 'background:#1976D2; color:#fff; padding:10px 16px; display:flex; align-items:center; justify-content:space-between; font-size:0.9rem; box-shadow:0 2px 8px rgba(0,0,0,0.3); position:sticky; top:0; z-index:9999;';
    const seguro = /^https?:\/\//i.test(String(linkDownload || ''));
    banner.innerHTML = `
        <span>🚀 Uma nova versão (<strong>v${String(novaVersao).replace(/[<>&"']/g, '')}</strong>) está disponível!</span>
        <div style="display:flex; gap:8px; align-items:center;">
            ${seguro ? '<button id="btn-atualizar-soft" style="background:#fff; color:#1976D2; border:none; padding:4px 10px; border-radius:4px; font-weight:bold; cursor:pointer;">Atualizar agora</button>' : ''}
            <button id="btn-fechar-soft" style="background:transparent; color:#fff; border:none; font-size:1.1rem; cursor:pointer; padding:0 4px;">✕</button>
        </div>`;
    document.body.insertBefore(banner, document.body.firstChild);
    const bA = banner.querySelector('#btn-atualizar-soft');
    if (bA) bA.addEventListener('click', () => window.open(linkDownload, '_blank'));
    banner.querySelector('#btn-fechar-soft').addEventListener('click', () => banner.remove());
}

function verificarStatusAppRemoto() {
    const { ref, get } = window.firebaseFns;
    return get(ref(window.firebaseDb, 'configuracoes')).then(snapshot => {
        const config = snapshot.exists() ? (snapshot.val() || {}) : {};
        const bloqueio = avaliarConfigRemota(config);

        if (bloqueio) {
            // guarda no aparelho: se abrir sem internet, continua bloqueado
            try { localStorage.setItem(CHAVE_BLOQUEIO_CACHE, JSON.stringify(bloqueio)); } catch (e) {}
            bloquearTelaApp(bloqueio.titulo, bloqueio.mensagem, bloqueio.link);
            return;
        }

        // liberado: tira o bloqueio (sem recarregar a página)
        try { localStorage.removeItem(CHAVE_BLOQUEIO_CACHE); } catch (e) {}
        removerBloqueio();

        const mais = config.versoes && config.versoes.versao_mais_recente;
        if (mais && Logica.compararVersoes(VERSAO_ATUAL_APP, mais) < 0) {
            exibirBannerAtualizacao(mais, config.versoes.link_download);
        }
    }).catch(err => {
        // sem internet / erro: mantém o estado atual
        console.log('Erro ao checar status remoto:', err);
    });
}

function iniciarVigilanciaRemota() {
    document.addEventListener('DOMContentLoaded', () => {
        // 1) se da última vez estava bloqueado, bloqueia já (mesmo offline)
        const cache = lerBloqueioCache();
        if (cache) bloquearTelaApp(cache.titulo, cache.mensagem, cache.link);

        // 2) checa quando o Firebase ficar pronto e depois a cada 5 minutos
        aoFirebasePronto(() => {
            verificarStatusAppRemoto();
            setInterval(verificarStatusAppRemoto, 5 * 60 * 1000);
        });

        // 3) e toda vez que a pessoa volta para o app
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && window.firebaseReady) verificarStatusAppRemoto();
        });
    });
}

iniciarVigilanciaRemota();
