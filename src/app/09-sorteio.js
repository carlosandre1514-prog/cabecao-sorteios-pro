    // --- 4. ABA SORTEIO ---
    // --- SORTEIO: quem veio (busca, presentes/fora, nível) ---
    let buscaPresenca = '';
    let filtroPresenca = 'todos';   // todos | presentes | fora
    function renderizarPresenca() {
        const container = document.getElementById('lista-presenca');
        atualizarBarraSorteio();
        if (!container) return;
        const ic = (n, c) => (window.UI ? UI.icone(n, c) : '');
        const presentes = jogadores.filter(j => j.presente);
        const golsPres = presentes.filter(j => j.isGoleiro).length;
        const resumo = document.getElementById('presenca-resumo-tela');
        if (resumo) resumo.textContent = !jogadores.length ? 'Nenhum jogador no elenco'
            : `${presentes.length} de ${jogadores.length} presentes${golsPres ? ` · ${golsPres} goleiro${golsPres > 1 ? 's' : ''}` : ''}`;

        if (jogadores.length === 0) {
            container.innerHTML = `<div class="vazio">${ic('users')}<h3>Cadastre o elenco primeiro</h3>
                <p>O sorteio usa os jogadores do elenco e o nível de cada um.</p>
                <button type="button" class="btn btn-primary" data-ir-elenco>Ir para o elenco</button></div>`;
            container.onclick = (e) => { if (e.target.closest('[data-ir-elenco]')) irParaAba('tab-jogadores'); };
            return;
        }
        const termo = Logica.normalizarNome(buscaPresenca);
        const visiveis = listaFiltrada('presenca', jogadores)
            .filter(j => filtroPresenca === 'todos' || (filtroPresenca === 'presentes' ? j.presente : !j.presente))
            .filter(j => !termo || Logica.normalizarNome(j.nome).includes(termo))
            .slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
        const fN = filtrosEstrelas.presenca || {};
        const chipN = document.getElementById('chip-nivel-presenca');
        if (chipN) chipN.classList.toggle('ativo-filtro', String(fN.min || '').trim() !== '' || String(fN.max || '').trim() !== '');

        if (visiveis.length === 0) {
            container.innerHTML = `<div class="vazio">${ic('search')}<h3>Ninguém aqui</h3><p>Nenhum jogador com esses filtros.</p></div>`;
            return;
        }
        container.innerHTML = '<div class="lista">' + visiveis.map(j => {
            const nivel = Number(j.estrelas || 3.0).toFixed(1).replace('.', ',');
            return `<div class="item-presenca">
                <input type="checkbox" class="chk-presenca" id="p-${escapeHtml(String(j.id))}" data-id="${escapeHtml(String(j.id))}" ${j.presente ? 'checked' : ''}>
                <label for="p-${escapeHtml(String(j.id))}" class="lbl-presenca">${avatarHtml(j.nome)}
                    <span class="li-txt"><span class="li-titulo">${escapeHtml(j.nome)}</span><span class="li-sub">${j.isGoleiro ? ic('glove', 'i-sm') + 'Goleiro' : 'Linha'} · <span class="nivel-txt">${ic('star', 'i-cheio')}${nivel}</span></span></span>
                    <span class="switch" aria-hidden="true"></span></label>
            </div>`;
        }).join('') + '</div>';
        container.onchange = (e) => {
            const c = e.target.closest && e.target.closest('.chk-presenca');
            if (!c) return;
            const j = jogadores.find(x => String(x.id) === c.dataset.id);
            if (!j) return;
            j.presente = c.checked;
            salvarJogadores();
            const pres = jogadores.filter(x => x.presente), g = pres.filter(x => x.isGoleiro).length;
            if (resumo) resumo.textContent = `${pres.length} de ${jogadores.length} presentes${g ? ` · ${g} goleiro${g > 1 ? 's' : ''}` : ''}`;
            atualizarBarraSorteio();
        };
    }
    function atualizarBarraSorteio() {
        const t = parseInt(document.getElementById('qtd-times')?.value, 10) || 0;
        const l = parseInt(document.getElementById('qtd-por-time')?.value, 10) || 0;
        const r = document.getElementById('resumo-config-sorteio');
        if (r) r.textContent = `${t} times de ${l}`;
        const p = document.getElementById('bc-presentes');
        const n = jogadores.filter(j => j.presente).length;
        if (p) p.textContent = `${n} presente${n === 1 ? '' : 's'}`;
    }
    (function ligarTelaSorteio() {
        const $ = id => document.getElementById(id);
        const busca = $('busca-presenca');
        if (busca) busca.addEventListener('input', () => { buscaPresenca = busca.value; renderizarPresenca(); });
        $('chips-presenca')?.addEventListener('click', (e) => {
            const c = e.target.closest('.chip');
            if (!c) return;
            if (c.id === 'chip-nivel-presenca') { if (window.UI) UI.abrirSheet('sheet-filtro-presenca'); return; }
            filtroPresenca = c.dataset.pres || 'todos';
            $('chips-presenca').querySelectorAll('[data-pres]').forEach(x => x.classList.toggle('on', x === c));
            renderizarPresenca();
        });
        $('btn-presenca-opcoes')?.addEventListener('click', () => { if (window.UI) UI.abrirSheet('sheet-presenca-opcoes'); });
        const marcarTodos = (v) => {
            jogadores.forEach(j => { j.presente = v; });
            salvarJogadores(); renderizarPresenca();
            if (window.UI) UI.fecharSheet('sheet-presenca-opcoes');
            toast(v ? 'Todos marcados como presentes' : 'Presença zerada');
        };
        $('btn-marcar-todos')?.addEventListener('click', () => marcarTodos(true));
        $('btn-desmarcar-todos')?.addEventListener('click', () => marcarTodos(false));
        $('btn-config-sorteio')?.addEventListener('click', () => { if (window.UI) UI.abrirSheet('sheet-config-sorteio'); });
        $('abrir-lista-link')?.addEventListener('click', () => { renderizarCardPresenca(); if (window.UI) UI.abrirSheet('sheet-lista-link'); });
        // − e + dos seletores de quantidade (data-alvo = id do campo)
        document.querySelectorAll('.stepper[data-alvo]').forEach(st => {
            const campo = $(st.dataset.alvo);
            const min = Number(st.dataset.min) || 0, max = Number(st.dataset.max) || 99;
            const ajustar = v => { if (campo) { campo.value = String(Math.min(max, Math.max(min, v))); atualizarBarraSorteio(); } };
            st.addEventListener('click', (e) => { const b = e.target.closest('[data-passo]'); if (b) ajustar((parseInt(campo.value, 10) || 0) + Number(b.dataset.passo)); });
            if (campo) campo.addEventListener('change', () => ajustar(parseInt(campo.value, 10) || min));
        });
        $('btn-copiar-lista')?.addEventListener('click', copiarListaTimes);
        $('btn-imagem-times')?.addEventListener('click', compartilharImagemTimes);
        $('btn-sortear-de-novo')?.addEventListener('click', () => $('btn-sortear')?.click());
        atualizarBarraSorteio();
    })();

    const btnSortear = document.getElementById('btn-sortear');
    if (btnSortear) {
        btnSortear.addEventListener('click', async () => {
            const presentes = jogadores.filter(j => j.presente);
            const qtdTimes = parseInt(document.getElementById('qtd-times')?.value) || 2;
            const porTime = parseInt(document.getElementById('qtd-por-time')?.value) || 0;

            if (qtdTimes < 2 || qtdTimes > 8) {
                toast('Escolha entre 2 e 8 times.', 'erro');
                return;
            }
            if (presentes.length < qtdTimes) {
                toast(presentes.length ? `Só ${presentes.length} presente${presentes.length > 1 ? 's' : ''} para ${qtdTimes} times. Marque mais gente.` : 'Marque quem veio jogar primeiro.', 'erro');
                return;
            }

            contadorSorteios++;
            if (window.Metricas) Metricas.evento('sorteio', false, { times: qtdTimes, por_time: porTime, jogadores: presentes.length });
            const resultado = Logica.sortearTimes(presentes, qtdTimes, porTime);
            sorteioAtual = resultado.times;
            exibirTimesSorteados();
        });
    }

    // Resultado do sorteio (painel): um card por time, nível médio e goleiro em destaque
    const CORES_TIMES = ['#2da762', '#e3b341', '#4f8fe0', '#ef6b6b', '#a66be0', '#e08a3c', '#3cc4c4', '#c9cfd3'];
    function exibirTimesSorteados() {
        const container = document.getElementById('times-sorteados-container');
        if (!container) return;
        container.innerHTML = '';
        const ic = (n, c) => (window.UI ? UI.icone(n, c) : '');
        const fmt = v => (Number(v) || 0).toFixed(1).replace('.', ',');
        const medias = sorteioAtual.map(t => t.jogadores.length ? t.somaEstrelas / t.jogadores.length : 0);
        const dif = medias.length ? Math.max(...medias) - Math.min(...medias) : 0;
        const sub = document.getElementById('resultado-sub');
        if (sub) sub.textContent = `${sorteioAtual.length} times · diferença de nível ${fmt(dif)}${contadorSorteios > 1 ? ` · ${contadorSorteios}º sorteio` : ''}`;

        sorteioAtual.forEach((t, i) => {
            const card = document.createElement('div');
            card.className = 'time-card';
            const linhas = t.jogadores.map(j => `<li>
                    <span class="tc-pos">${j.isGoleiro ? ic('glove', 'i-sm') : ''}</span>
                    <span class="tc-nome">${escapeHtml(j.nome)}</span>
                    <span class="tc-nivel">${fmt(j.estrelas || 3)}</span>
                </li>`).join('');
            card.innerHTML = `
                <div class="tc-cab">
                    <span class="tc-cor" style="background:${CORES_TIMES[i % CORES_TIMES.length]}"></span>
                    <b>${escapeHtml(t.nome)}</b>
                    <span class="nivel">${ic('star', 'i-cheio')}${fmt(medias[i])}</span>
                </div>
                <ul>${linhas}</ul>
                ${t.temGoleiro ? '' : '<p class="tc-aviso">Sem goleiro fixo</p>'}`;
            container.appendChild(card);
        });
        const res = document.getElementById('resultado-sorteio');
        if (window.UI) UI.abrirSheet('resultado-sorteio'); else if (res) res.classList.remove('hidden');
    }

