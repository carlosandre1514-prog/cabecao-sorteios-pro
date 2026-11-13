    // ---------- HISTÓRICO: tela do campeonato ----------
    function abrirDetalheHistorico(id) {
        const h = historico.find(x => String(x.id) === String(id));
        if (!h) return;
        irParaTelaExtra('tab-hist-detalhe', 'Campeonato de ' + String(h.data || '').slice(0, 5));
        const cl = Logica.ordenarClassificacao(Object.values(h.classificacao || {}));
        const art = Object.entries(h.artilharia || {}).map(([n, g]) => [String(n).replace(/\u2024/g, '.'), Number(g) || 0]).sort((a, b) => b[1] - a[1]);
        const jogos = comoLista(h.partidas);
        const ic = (n, c) => (window.UI ? UI.icone(n, c) : '');
        const linhaJogo = (p) => {
            const rot = p.rodada !== undefined ? 'R' + p.rodada : 'J' + p.idPartida;
            const venceA = p.rodada !== undefined ? (p.golsA > p.golsB || (p.golsA === p.golsB && (p.penaltisA || 0) > (p.penaltisB || 0))) : p.vencedor === p.timeA.nome;
            const venceB = p.rodada !== undefined ? (p.golsB > p.golsA || (p.golsA === p.golsB && (p.penaltisB || 0) > (p.penaltisA || 0))) : p.vencedor === p.timeB.nome;
            const pen = p.rodada !== undefined && p.golsA === p.golsB ? `<span class="jogo-pen">pên. ${p.penaltisA || 0}–${p.penaltisB || 0}</span>` : '';
            return `<div class="jogo-linha"><span class="jogo-rod">${rot}</span>
                <span class="jogo-a ${venceA ? 'venceu' : ''}">${escapeHtml(p.timeA.nome)}</span>
                <span class="jogo-meio"><span class="jogo-placar">${p.golsA}<i>×</i>${p.golsB}</span>${pen}</span>
                <span class="jogo-b ${venceB ? 'venceu' : ''}">${escapeHtml(p.timeB.nome)}</span><span></span></div>`;
        };
        const el = document.getElementById('conteudo-hist-detalhe');
        if (!el) return;
        const campeao = cl[0] ? cl[0].nome : '—';
        const totalGols = jogos.reduce((a, p) => a + (Number(p.golsA) || 0) + (Number(p.golsB) || 0), 0);
        el.innerHTML = `
            <div class="card campeao-card">
                <span class="campeao-ic">${ic('trophy')}</span>
                <div class="campeao-txt"><span class="rotulo">Campeão</span><b>${escapeHtml(campeao)}</b>
                    <span class="tela-sub">${escapeHtml(h.data || '')} · ${h.modo === 'todos-contra-todos' ? 'Tabela' : 'Racha livre'} · ${jogos.length} jogos · ${totalGols} gols</span></div>
            </div>
            <div class="dois-botoes" style="margin-top:0;">
                <button type="button" class="btn btn-primary" id="btn-resumo-imagem">${ic('image', 'i-sm')}Enviar resumo</button>
                <button type="button" class="btn btn-secondary" id="btn-resumo-texto">${ic('copy', 'i-sm')}Copiar texto</button>
            </div>
            <p class="lista-rotulo">Classificação</p>
            <div class="card painel-jogo"><div class="table-responsive"><table class="tabela-classificacao">
                <thead><tr><th>Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>SG</th></tr></thead>
                <tbody>${cl.map(c => `<tr><td>${escapeHtml(c.nome)}</td><td class="pts">${c.p}</td><td>${c.j}</td><td>${c.v}</td><td>${c.e}</td><td>${c.d}</td><td>${c.gp}</td><td>${c.sg}</td></tr>`).join('')}</tbody>
            </table></div></div>
            <p class="lista-rotulo">Jogos</p>
            <div class="card painel-jogo">${jogos.length ? jogos.map(linhaJogo).join('') : '<p class="dica-painel">Sem jogos registrados.</p>'}</div>
            <p class="lista-rotulo">Artilharia</p>
            <div class="card painel-jogo">${art.length ? art.map(([n, g], i) => `<div class="art-linha"><span class="art-pos">${i + 1}</span>${avatarHtml(n)}<span class="art-nome">${escapeHtml(n)}</span><strong class="art-gols">${g}</strong></div>`).join('') : '<p class="dica-painel">Nenhum gol marcado.</p>'}</div>`;
        el.onclick = (e) => {
            if (e.target.closest('#voltar-hist')) irParaAba('tab-historico');
            else if (e.target.closest('#btn-resumo-imagem')) enviarResumoImagem(h, e.target.closest('#btn-resumo-imagem'));
            else if (e.target.closest('#btn-resumo-texto')) copiarResumoTexto(h);
        };
    }

    // ---------- CORRIGIR PLACAR (modo tabela) ----------
    function recalcularClassificacao() {
        classificacao = Logica.novaClassificacao(timesSorteados);
        partidas.filter(x => x.finalizada).forEach(x => Logica.aplicarResultado(classificacao, x.timeA.id, x.timeB.id, x.golsA, x.golsB, x.penaltisA, x.penaltisB));
    }
    function abrirCorrigirPlacar(idPartida) {
        const p = partidas.find(x => x.idPartida === idPartida);
        if (!p) return;
        let a = p.golsA || 0, b = p.golsB || 0, pa = p.penaltisA || 0, pb = p.penaltisB || 0;
        const m = abrirModalHtml('');
        const box = m.querySelector('.modal-content');
        const stp = (k, v) => `<div class="corrige-stp"><button type="button" class="step-btn" data-sp="${k}:-1">−</button><strong>${v}</strong><button type="button" class="step-btn step-mais" data-sp="${k}:1">+</button></div>`;
        const desenhar = () => {
            box.innerHTML = `<h2>Corrigir placar</h2>
                <div class="corrige-linha"><div class="corrige-time"><span>${escapeHtml(p.timeA.nome)}</span>${stp('a', a)}</div><div class="corrige-time"><span>${escapeHtml(p.timeB.nome)}</span>${stp('b', b)}</div></div>
                ${a === b ? `<p class="subtext" style="text-align:center;">Empate · pênaltis</p><div class="corrige-linha"><div class="corrige-time">${stp('pa', pa)}</div><div class="corrige-time">${stp('pb', pb)}</div></div>` : ''}
                <div class="modal-actions"><button type="button" class="btn btn-primary" id="ok-corrige">Salvar placar</button><button type="button" class="btn btn-secondary" id="cancela-corrige">Cancelar</button></div>`;
        };
        desenhar();
        m.addEventListener('click', (e) => {
            const t = e.target.closest('[data-sp],#ok-corrige,#cancela-corrige');
            if (!t) return;
            if (t.dataset.sp) {
                const [k, d] = t.dataset.sp.split(':'); const n = Number(d);
                if (k === 'a') a = Math.max(0, a + n);
                if (k === 'b') b = Math.max(0, b + n);
                if (k === 'pa') pa = Math.max(0, pa + n);
                if (k === 'pb') pb = Math.max(0, pb + n);
                desenhar(); return;
            }
            if (t.id === 'cancela-corrige') { m.remove(); return; }
            if (a === b && pa === pb) { toast('Defina o vencedor nos pênaltis!', 'erro'); return; }
            p.golsA = a; p.golsB = b;
            p.penaltisA = a === b ? pa : 0; p.penaltisB = a === b ? pb : 0;
            recalcularClassificacao();
            salvarCampeonatoAtivo();
            m.remove();
            renderizarCampeonato();
            toast('Placar salvo · tabela recalculada');
        });
    }

    // Liga os botões do menu lateral
    (function ligarMenu() {
        const lr = document.getElementById('lista-rachas');
        if (lr) lr.addEventListener('click', (e) => { const b = e.target.closest('[data-racha]'); if (b) trocarRacha(b.dataset.racha); });
        const nr = document.getElementById('btn-novo-racha'); if (nr) nr.addEventListener('click', abrirNovoRacha);
        const pz = document.getElementById('btn-personalizar'); if (pz) pz.addEventListener('click', abrirPersonalizar);
        const lg = document.querySelector('.app-header .app-logo'); if (lg && lg.addEventListener) lg.addEventListener('click', abrirPersonalizar);
        const su = document.getElementById('btn-suporte'); if (su) su.addEventListener('click', abrirSuporte);
        const cx = document.getElementById('btn-caixa-suporte'); if (cx) cx.addEventListener('click', abrirCaixa);
        const mt = document.getElementById('btn-metricas'); if (mt) mt.addEventListener('click', abrirMetricas);
        const lc = document.getElementById('lista-caixa');
        if (lc) lc.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-resolver]');
            if (!b) return;
            try { await window.firebaseFns.set(window.firebaseFns.ref(window.firebaseDb, 'suporte/' + b.dataset.resolver + '/ok'), true); toast('Marcado como resolvido'); }
            catch (er) { toast('Não foi possível atualizar', 'erro'); }
            carregarCaixa();
        });
    })();

    // ---------- RANKING (soma da artilharia de todos os campeonatos finalizados) ----------
    function renderizarRanking() {
        const box = document.getElementById('lista-ranking');
        if (!box) return;
        const sub = document.getElementById('ranking-sub');
        if (sub) sub.textContent = 'Gols somados de todos os campeonatos · ' + ((visualRacha && visualRacha.nome) || nomeRachaAtivo());
        const soma = {};
        historico.forEach(h => Object.entries(h.artilharia || {}).forEach(([n, g]) => {
            const nome = String(n).replace(/\u2024/g, '.');
            soma[nome] = (soma[nome] || 0) + (Number(g) || 0);
        }));
        const lista = Object.entries(soma).filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        if (!lista.length) {
            box.innerHTML = `<div class="vazio">${window.UI ? UI.icone('podium') : ''}<h3>Ranking vazio</h3><p>Os gols entram aqui quando você encerra um campeonato.</p></div>`;
            return;
        }
        const max = lista[0][1] || 1;
        box.innerHTML = '<div class="card painel-jogo">' + lista.map(([n, g], i) =>
            `<div class="art-linha ranking-linha"><span class="art-pos">${i + 1}</span>${avatarHtml(n)}
                <span class="art-nome">${escapeHtml(n)}<span class="barra-rank"><span style="width:${Math.round(g / max * 100)}%"></span></span></span>
                <strong class="art-gols">${g}</strong></div>`).join('') + '</div>';
    }

