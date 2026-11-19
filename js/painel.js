// =====================================================================
// painel.js — manda eventos para o painel de métricas (dashboard).
//
// Usado no app (index.html) e nas páginas públicas (presenca.html, ao-vivo.html).
// Os eventos vão para uma fila e saem em lotes (até 200) a cada 2 s, em segundo plano:
// se não tiver internet ou o painel recusar, o app segue normal e ninguém vê nada.
//
//   Automático: instalar (1ª vez no aparelho) · abrir · ping (60 s com a tela visível) · saiu · erro
//   No app: cadastro / login (com o método) · assinatura (Pro liberado) · sorteio · campeonato · lista...
//   (os contadores do metricas.js também vêm para cá: Metricas.evento('x') manda o evento "x")
//
// Usuário: o uid do Firebase. Antes do login, um id anônimo guardado no aparelho (trocado pelo uid assim
// que a pessoa entra). Nunca manda e-mail, senha, CPF, chave Pix ou dados de cartão.
// O Cabeção não tem servidor próprio, então a chave do painel fica aqui (é uma chave só de envio).
// =====================================================================
(function () {
    const URL_PAINEL = 'https://pxtxcbqqbjtmsmwbcise.supabase.co/rest/v1/rpc/painel_enviar';
    const APIKEY = 'sb_publishable_URNeHmQn-EuIyqXbkbMSag_gWTtX2rf';
    const CHAVE = '';   // pnl_... do projeto Cabeção Sorteios Pro no painel (vazio = desligado)
    const ICONE = 'https://carlosandre1514-prog.github.io/cabecao-sorteios-pro/img/icon-512.png';
    const PROIBIDO = /mail|senha|password|cpf|cartao|card|token|pix/i;

    const fila = [];
    let uid = '', nome = '', desligado = !CHAVE, enviando = false, fora = false, erros = 0;

    const guardado = (k, v) => {
        try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* modo anônimo */ }
        return null;
    };
    let aparelho = guardado('painel_aparelho');
    if (!aparelho) { aparelho = 'anon_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); guardado('painel_aparelho', aparelho); }

    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const plataforma = /Android/i.test(ua) ? 'Android'
        : (/iPhone|iPad|iPod/i.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) ? 'iOS' : 'PC';

    // dados pequenos e sem nada pessoal
    function limpar(d) {
        const out = {};
        if (!d || typeof d !== 'object') return out;
        for (const [k, v] of Object.entries(d).slice(0, 20)) {
            if (PROIBIDO.test(k) || v === undefined || v === null) continue;
            out[k.slice(0, 30)] = typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, k === 'mensagem' ? 1000 : 200);
        }
        return out;
    }

    // ev('tipo', {dados}) ou ev('tipo', {dados}, {usuario: 'uid de outra pessoa'})
    function ev(tipo, dados, extra) {
        if (desligado) return;
        tipo = String(tipo || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);
        if (!tipo) return;
        if (fila.length >= 500) fila.shift();
        const e = { tipo, dados: limpar(dados), plataforma };
        if (extra && extra.usuario) e.usuario = String(extra.usuario).slice(0, 128);
        fila.push(e);
    }

    // o usuário é decidido na hora de mandar: o "abrir" do começo já sai com o uid se o login salvo voltar a tempo
    function lote() {
        const u = uid || aparelho;
        return fila.splice(0, 200).map(e => (e.usuario ? e : (nome ? { ...e, usuario: u, nome } : { ...e, usuario: u })));
    }

    async function enviar() {
        if (desligado || enviando || !fila.length || typeof fetch !== 'function') return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;   // sem internet: espera
        enviando = true;
        const l = lote();
        try {
            const r = await fetch(URL_PAINEL, {
                method: 'POST', keepalive: true,
                headers: { apikey: APIKEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ chave: CHAVE, eventos: l })
            });
            if (r.status === 401) desligado = true;                                    // chave errada/desativada: para de tentar
            else if (r.status >= 500 || r.status === 429) fila.unshift(...l.slice(0, 500 - fila.length));
        } catch (e) {
            fila.unshift(...l.slice(0, 500 - fila.length));                           // rede caiu: tenta no próximo
        } finally { enviando = false; }
    }

    function saiu() { if (fora) return; fora = true; ev('saiu'); enviar(); }
    function voltou() { if (!fora) return; fora = false; ev('ping'); }

    function usuario(novoUid) { uid = novoUid ? String(novoUid) : ''; }
    function definirNome(n) { nome = String(n || '').slice(0, 60); }

    // ---- automático ----
    if (!desligado) {
        if (!guardado('painel_instalado')) { ev('instalar'); guardado('painel_instalado', '1'); }
        const pagina = (typeof location !== 'undefined' && (location.pathname.split('/').pop() || 'index.html').replace('.html', '')) || 'index';
        ev('abrir', { icone: ICONE, pagina });
        setTimeout(enviar, 3500);          // dá tempo de o login salvo voltar
        setInterval(enviar, 2000);
        setInterval(() => { if (!fora && !(typeof document !== 'undefined' && document.hidden)) ev('ping'); }, 60000);
        if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('visibilitychange', () => (document.hidden ? saiu() : voltou()));
        }
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('pagehide', saiu);
            window.addEventListener('online', enviar);
            const erro = (msg, onde) => { if (++erros <= 15) ev('erro', { mensagem: String(msg || 'erro').slice(0, 300), onde: String(onde || '').slice(0, 120) }); };
            window.addEventListener('error', e => erro(e.message, (String(e.filename || '').split('/').pop().split('?')[0]) + ':' + (e.lineno || 0)));
            window.addEventListener('unhandledrejection', e => erro(e.reason && (e.reason.message || e.reason), 'promessa'));
        }
    }

    window.Painel = { ev, enviar, usuario, nome: definirNome, saiu, voltou, plataforma, _fila: fila };
})();
