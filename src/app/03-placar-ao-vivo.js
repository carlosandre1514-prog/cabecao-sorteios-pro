    // --- PLACAR AO VIVO (link público, só leitura) ---
    // Cada resultado lançado é copiado para ao_vivo/<codigo> no Firebase; a página
    // ao-vivo.html lê esse caminho em tempo real. O código tem 8 letras/números sorteados,
    // então só quem recebe o link consegue abrir.
    const ALFABETO_CODIGO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    function gerarCodigoAoVivo() {
        const b = new Uint8Array(8);
        crypto.getRandomValues(b);
        return Array.from(b, x => ALFABETO_CODIGO[x % ALFABETO_CODIGO.length]).join('');
    }
    // ---------- ENDEREÇO PÚBLICO dos links (lista de presença e placar ao vivo) ----------
    // Dentro do APK o app roda dos arquivos do aparelho: um link "daqui" não abre no celular dos outros.
    // Então os links usam o site público: configuracoes/divulgacao/url_publica (Firebase) ou o GitHub Pages.
    const URL_PUBLICA_PADRAO = 'https://carlosandre1514-prog.github.io/cabecao-sorteios-pro/';
    let urlPublicaConfig = '';
    (function lerUrlPublica() {
        const ler = () => {
            try {
                const f = window.firebaseFns;
                f.get(f.ref(window.firebaseDb, 'configuracoes/divulgacao/url_publica'))
                    .then(s => { const v = String(s && s.exists && s.exists() ? s.val() : ''); if (/^https:\/\//i.test(v)) urlPublicaConfig = v; })
                    .catch(() => {});
            } catch (e) { /* sem Firebase: fica o padrão */ }
        };
        if (window.firebaseReady) ler(); else window.addEventListener('firebase-ready', ler, { once: true });
    })();
    function basePublica() {
        if (urlPublicaConfig) return urlPublicaConfig.replace(/\/?$/, '/');
        const local = !/^https?:$/.test(location.protocol || '') || /^(localhost|127\.|10\.|192\.168\.)/.test(location.hostname || '');
        return local ? URL_PUBLICA_PADRAO : new URL('.', String(location.href).split('#')[0].split('?')[0]).href;
    }
    function linkPublico(pagina, codigo) { return basePublica() + pagina + '?c=' + codigo; }
    function linkAoVivo() { return linkPublico('ao-vivo.html', aoVivoCodigo); }
    function atualizarCardAoVivo() {
        const off = document.getElementById('ao-vivo-off');
        const on = document.getElementById('ao-vivo-on');
        if (!off || !on) return;
        off.classList.toggle('hidden', !!aoVivoCodigo);
        on.classList.toggle('hidden', !aoVivoCodigo);
        const campo = document.getElementById('ao-vivo-link');
        if (campo) campo.value = aoVivoCodigo ? linkAoVivo() : '';
        const st = document.getElementById('ao-vivo-status');
        if (st) st.textContent = aoVivoCodigo ? 'Ligado · quem tem o link acompanha em tempo real' : 'Quem está esperando acompanha pelo celular';
        const ac = document.getElementById('abrir-ao-vivo');
        if (ac) ac.classList.toggle('ativo', !!aoVivoCodigo);
    }
    // Monta o retrato na hora (o estado pode ser zerado logo depois) e grava com um pequeno atraso
    // para juntar várias mudanças seguidas em uma só escrita.
    function publicarAoVivo(encerrado) {
        if (!aoVivoCodigo || !currentUserUid || !window.firebaseDb || !dadosCarregados) return;
        if (!timesSorteados.length) return;
        ultimoEncerrado = !!encerrado;
        aoVivoPendente = Logica.montarAoVivo({
            modo: modoJogoAtual, times: timesSorteados, classificacao, partidas, partidaAtualIndex,
            partidasRacha: partidasRachaHistorico, artilharia, timeA: timeEmCampoA, timeB: timeEmCampoB, fila: filaTimes,
            placarRacha, cron: montarCron(), visual: visualRacha
        }, currentUserUid, Date.now(), encerrado);
        const codigo = aoVivoCodigo;
        clearTimeout(aoVivoTimer);
        aoVivoTimer = setTimeout(() => {
            if (codigo !== aoVivoCodigo || !aoVivoPendente) return;
            const f = window.firebaseFns;
            const limpo = JSON.parse(JSON.stringify(aoVivoPendente));
            aoVivoPendente = null;
            f.set(f.ref(window.firebaseDb, 'ao_vivo/' + codigo), limpo)
                .then(() => { aoVivoAvisouErro = false; })
                .catch(e => {
                    console.error('Placar ao vivo:', e);
                    if (aoVivoAvisouErro) return;
                    aoVivoAvisouErro = true;
                    const cod = String((e && (e.code || e.message)) || 'erro');
                    const dica = /permission/i.test(cod) ? ' O Firebase negou a gravação: publique as regras novas (com "ao_vivo") em Realtime Database → Regras.' : ' Confira a internet.';
                    mostrarAlerta('Não consegui publicar o placar ao vivo.' + dica + ' (Código: ' + cod + ')', '❌ PLACAR AO VIVO');
                });
        }, 400);
    }
    async function copiarTexto(texto) {
        try { await navigator.clipboard.writeText(texto); return true; } catch (e) { return false; }
    }
    function configurarAoVivo() {
        const $ = id => document.getElementById(id);
        $('btn-ao-vivo-iniciar')?.addEventListener('click', () => {
            if (!dadosCarregados) {
                mostrarAlerta('Seus dados ainda não carregaram. Feche e abra o app e tente de novo.', 'Placar ao vivo');
                return;
            }
            if (!timesSorteados.length) {
                mostrarAlerta('Comece um jogo primeiro: sorteie os times e toque em Começar jogo.', 'Placar ao vivo');
                return;
            }
            aoVivoCodigo = gerarCodigoAoVivo();
            gravar('aoVivo', { codigo: aoVivoCodigo });
            publicarAoVivo(false);
            atualizarCardAoVivo();
            toast('Placar ao vivo ligado. Envie o link para o grupo.');
            if (window.Metricas) Metricas.evento('ao_vivo_ligado');
        });
        $('btn-ao-vivo-enviar')?.addEventListener('click', async () => {
            const url = linkAoVivo();
            if (navigator.share) {
                try { await navigator.share({ title: 'Placar ao vivo', text: 'Acompanhe o jogo ao vivo:', url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
            }
            toast(await copiarTexto(url) ? 'Link copiado!' : 'Copie o link no campo acima.');
        });
        $('btn-ao-vivo-copiar')?.addEventListener('click', async () => {
            toast(await copiarTexto(linkAoVivo()) ? 'Link copiado!' : 'Copie o link no campo acima.');
        });
        $('btn-ao-vivo-parar')?.addEventListener('click', async () => {
            const ok = await mostrarConfirmacao('O link para de funcionar para todo mundo.', 'Desligar o placar ao vivo?', { ok: 'Desligar', perigo: true });
            if (!ok || !aoVivoCodigo) return;
            const codigo = aoVivoCodigo;
            clearTimeout(aoVivoTimer);
            aoVivoPendente = null;
            aoVivoCodigo = null;
            const f = window.firebaseFns;
            f.set(f.ref(window.firebaseDb, 'ao_vivo/' + codigo), null).catch(e => console.error('Placar ao vivo:', e));
            gravar('aoVivo', null);
            atualizarCardAoVivo();
            toast('Placar ao vivo desligado');
        });
    }
    configurarAoVivo();

