    // ---------- CAIXA DO RACHA (Pro): mensalistas, diárias, gastos e saldo ----------
    // Fica em usuarios/<uid>/[rachas/<id>/]caixa (formato em Logica.resumoCaixa).
    let caixa = {};
    let caixaMes = Logica.mesISO();
    const CATEGORIAS_CAIXA = {
        mensalidade: ['calendar', 'Mensalidade'], diaria: ['users', 'Diária'], quadra: ['flag', 'Quadra / aluguel'],
        material: ['ball', 'Bola, colete, material'], outros: ['dots', 'Outros']
    };
    function salvarCaixa() { gravar('caixa', caixa); }
    // chave Pix para as cobranças: a última usada nas listas deste racha (ou a da lista aberta)
    const pixDoRacha = () => (pixPadrao && pixPadrao.chave) ? pixPadrao : (presencaDados && presencaDados.pix && presencaDados.pix.chave ? presencaDados.pix : null);
    function novoLancamento(l) {
        caixa.lancamentos = caixa.lancamentos || {};
        const id = 'l' + Logica.idUnico();
        caixa.lancamentos[id] = Object.assign({ data: Date.now(), mes: caixaMes }, l, { valor: Math.round((Number(l.valor) || 0) * 100) / 100 });
        salvarCaixa();
        if (window.Metricas) Metricas.evento('caixa_lancamento');
        return id;
    }
    async function compartilharTexto(texto, titulo) {
        if (navigator.share) {
            try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
        }
        toast(await copiarTexto(texto) ? (titulo || 'Mensagem copiada! Cole no WhatsApp.') : 'Não consegui copiar.');
    }
    function renderizarCaixa() {
        const box = document.getElementById('conteudo-financeiro');
        if (!box) return;
        const ic = (n, c) => (window.UI ? UI.icone(n, c) : '');
        box.onclick = cliqueCaixa;
        const pro = !window.Monetizacao || window.Monetizacao.isPro();
        if (!pro) {
            const st = window.Monetizacao ? window.Monetizacao.status() : {};
            box.innerHTML = `<div class="card caixa-bloqueado">
                <div class="caixa-cadeado">${ic('wallet')}</div>
                <h2 style="justify-content:center;">Caixa do racha</h2>
                <p class="subtext" style="text-align:center;">Chega de caderninho e de "quem não pagou?" no grupo.</p>
                <ul class="pro-beneficios">
                    <li>${ic('calendar', 'i-sm')}<span><strong>Mensalistas</strong>: quem pagou e quem está devendo no mês</span></li>
                    <li>${ic('share', 'i-sm')}<span><strong>Cobrança pronta</strong> no WhatsApp, para um ou para o grupo</span></li>
                    <li>${ic('users', 'i-sm')}<span><strong>Diárias</strong> puxadas da lista de presença com um toque</span></li>
                    <li>${ic('wallet', 'i-sm')}<span>Gastos com quadra e bola, e o <strong>saldo do caixa</strong></span></li>
                </ul>
                <button class="btn btn-primary" data-cx="pro">${st.testeUsado ? 'Liberar com o Pro' : 'Testar 7 dias grátis'}</button>
            </div>`;
            return;
        }
        if (window.Metricas) Metricas.evento('caixa_aberto', true);
        const r = Logica.resumoCaixa(caixa, jogadores, caixaMes);
        const cfg = r.config;
        const R = Logica.reais;
        const nomeM = Logica.nomeMes(caixaMes);
        const dataCurta = ms => new Date(ms || 0).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const linhaMensalista = m => `<div class="cx-pessoa ${m.pago ? 'pago' : ''}">
                ${avatarHtml(m.nome)}<span class="nm">${escapeHtml(m.nome)}</span>
                ${m.pago ? `<button type="button" class="btn-pag pago" data-cx-despagar="${escapeHtml(m.lancId)}">Pago</button>`
                    : `<button type="button" class="btn-pag" data-cx-pagar="${escapeHtml(m.id)}">Marcar pago</button>
                       <button type="button" class="btn-icone" data-cx-cobrar="${escapeHtml(m.id)}" aria-label="Cobrar ${escapeHtml(m.nome)}" title="Cobrar no WhatsApp">${ic('share', 'i-sm')}</button>`}
            </div>`;
        const linhaLanc = l => {
            const c = CATEGORIAS_CAIXA[l.categoria] || CATEGORIAS_CAIXA.outros;
            return `<div class="cx-lanc">
                <span class="cx-ic">${ic(c[0], 'i-sm')}</span>
                <span class="cx-desc"><b>${escapeHtml(l.desc || c[1])}</b><small>${dataCurta(l.data)} · ${c[1]}</small></span>
                <strong class="${l.tipo === 'entrada' ? 'pos' : 'neg'}">${l.tipo === 'entrada' ? '+' : '−'} ${R(l.valor)}</strong>
                <button type="button" class="btn-tirar" data-cx-apagar="${escapeHtml(l.id)}" aria-label="Apagar lançamento">${ic('x', 'i-sm')}</button>
            </div>`;
        };
        const pct = r.mensalistas.length ? Math.round(r.pagaram / r.mensalistas.length * 100) : 0;
        box.innerHTML = `
            <div class="card caixa-topo">
                <div class="mes-nav">
                    <button type="button" data-cx="mes-ant" aria-label="Mês anterior">${ic('back')}</button>
                    <b>${nomeM.charAt(0).toUpperCase() + nomeM.slice(1)}</b>
                    <button type="button" data-cx="mes-prox" aria-label="Próximo mês">${ic('chevron')}</button>
                </div>
                <div class="caixa-saldo"><small>Saldo do caixa</small><strong class="${r.saldo < 0 ? 'neg' : ''}">${R(r.saldo)}</strong></div>
                <div class="caixa-tiles">
                    <div><span>Entrou no mês</span><b class="pos">${R(r.entradasMes)}</b></div>
                    <div><span>Saiu no mês</span><b class="neg">${R(r.saidasMes)}</b></div>
                    <div><span>A receber</span><b>${R(r.aReceber)}</b></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-success" data-cx="entrada">${ic('plus', 'i-sm')}Entrada</button>
                    <button type="button" class="btn btn-secondary" data-cx="saida">${ic('minus', 'i-sm')}Saída</button>
                </div>
            </div>

            <div class="card">
                <h2>Mensalistas</h2>
                <p class="subtext" style="margin-bottom:8px;">${cfg.mensalidade ? `${R(cfg.mensalidade)} por mês · vence dia ${cfg.vencimento || 10}` : 'Defina o valor da mensalidade.'}
                    <button type="button" class="btn-texto" data-cx="config">Valores</button></p>
                ${r.mensalistas.length ? `
                    <div class="cx-progresso"><span><b>${r.pagaram}</b> de ${r.mensalistas.length} pagaram</span><span>${R(r.previsto - r.aReceber)} de ${R(r.previsto)}</span></div>
                    <div class="barra-cx"><div style="width:${pct}%"></div></div>
                    ${r.mensalistas.map(linhaMensalista).join('')}
                    ${r.devedores.length ? `<button type="button" class="btn btn-primary" data-cx="cobrar-grupo" style="margin-top:12px;">${ic('share', 'i-sm')}Cobrar quem deve no grupo (${r.devedores.length})</button>` : `<p class="cx-tudo-pago">${ic('check', 'i-sm')} Todo mundo pagou este mês</p>`}
                ` : '<p class="subtext">Escolha quem paga por mês. O app mostra quem pagou, quem deve e monta a cobrança.</p>'}
                <button type="button" class="btn btn-secondary" data-cx="mensalistas" style="margin-top:8px;">Escolher mensalistas</button>
            </div>

            <div class="card">
                <h2>Lançamentos</h2>
                ${presencaCodigo ? `<button type="button" class="btn btn-secondary" data-cx="puxar-lista" style="margin-bottom:10px;">Puxar diárias pagas da lista</button>` : ''}
                ${r.lancamentos.length ? r.lancamentos.map(linhaLanc).join('') : `<p class="subtext">Nenhum lançamento em ${nomeM}.</p>`}
            </div>`;
    }
    function abrirLancamento(tipo) {
        const r = Logica.resumoCaixa(caixa, jogadores, caixaMes);
        const cats = tipo === 'entrada' ? ['diaria', 'mensalidade', 'outros'] : ['quadra', 'material', 'outros'];
        const hoje = Logica.mesISO() === caixaMes ? new Date() : new Date(caixaMes + '-15T12:00:00');
        const p2 = n => String(n).padStart(2, '0');
        const dataPadrao = `${hoje.getFullYear()}-${p2(hoje.getMonth() + 1)}-${p2(hoje.getDate())}`;
        const m = abrirModalHtml(`<h2>${tipo === 'entrada' ? 'Nova entrada' : 'Nova saída'}</h2>
            <label class="subtext" for="cx-valor">Valor (R$)</label>
            <input type="text" id="cx-valor" min="0" inputmode="decimal" placeholder="0,00" value="${tipo === 'entrada' && r.config.diaria ? r.config.diaria : ''}">
            <label class="subtext" for="cx-cat" style="display:block;margin-top:10px;">Tipo</label>
            <select id="cx-cat">${cats.map(c => `<option value="${c}">${CATEGORIAS_CAIXA[c][1]}</option>`).join('')}</select>
            ${tipo === 'entrada' ? `<label class="subtext" for="cx-jog" style="display:block;margin-top:10px;">De quem? (opcional)</label>
                <select id="cx-jog"><option value="">—</option>${jogadores.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome))).map(j => `<option value="${escapeHtml(String(j.id))}">${escapeHtml(j.nome)}</option>`).join('')}</select>` : ''}
            <label class="subtext" for="cx-desc" style="display:block;margin-top:10px;">Descrição (opcional)</label>
            <input type="text" id="cx-desc" maxlength="50" placeholder="${tipo === 'entrada' ? 'Ex.: Diária do Zé' : 'Ex.: Aluguel da quadra'}">
            <label class="subtext" for="cx-data" style="display:block;margin-top:10px;">Data</label>
            <input type="date" id="cx-data" value="${dataPadrao}">
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="cx-ok">Lançar</button><button type="button" class="btn btn-secondary" id="cx-cancelar">Cancelar</button></div>`);
        const cat = m.querySelector('#cx-cat');
        if (cat && tipo === 'entrada') cat.addEventListener('change', () => {
            const v = m.querySelector('#cx-valor');
            if (cat.value === 'mensalidade' && r.config.mensalidade) v.value = r.config.mensalidade;
            if (cat.value === 'diaria' && r.config.diaria) v.value = r.config.diaria;
        });
        m.querySelector('#cx-cancelar').onclick = () => m.remove();
        m.querySelector('#cx-ok').onclick = () => {
            const valor = parseFloat(String(m.querySelector('#cx-valor').value).replace(',', '.'));
            if (!(valor > 0)) { toast('Digite o valor.', 'erro'); return; }
            const dataTxt = m.querySelector('#cx-data').value;
            const data = dataTxt ? new Date(dataTxt + 'T12:00:00').getTime() : Date.now();
            const jogEl = m.querySelector('#cx-jog');
            const jogadorId = jogEl && jogEl.value ? jogEl.value : null;
            const j = jogadorId ? jogadores.find(x => String(x.id) === jogadorId) : null;
            const categoria = m.querySelector('#cx-cat').value;
            const desc = m.querySelector('#cx-desc').value.trim().slice(0, 50) || (j ? CATEGORIAS_CAIXA[categoria][1] + ' · ' + j.nome : '');
            const l = { tipo, valor, categoria, desc, data, mes: Logica.mesISO(data) };
            if (jogadorId) l.jogadorId = jogadorId;
            novoLancamento(l);
            m.remove();
            renderizarCaixa();
            toast(tipo === 'entrada' ? 'Entrada lançada' : 'Saída lançada');
        };
    }
    function abrirValoresCaixa() {
        const cfg = Object.assign({ mensalidade: '', diaria: '', vencimento: 10 }, caixa.config || {});
        const m = abrirModalHtml(`<h2>⚙️ Valores do caixa</h2>
            <div class="form-group-row"><label for="cx-mens">Mensalidade (R$)</label><input type="text" id="cx-mens" min="0" inputmode="decimal" value="${cfg.mensalidade || ''}" placeholder="50"></div>
            <div class="form-group-row"><label for="cx-dia">Diária (R$)</label><input type="text" id="cx-dia" min="0" inputmode="decimal" value="${cfg.diaria || ''}" placeholder="15"></div>
            <div class="form-group-row"><label for="cx-venc">Vence todo dia</label><input type="number" id="cx-venc" min="1" max="31" value="${cfg.vencimento || 10}"></div>
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="cx-ok">Salvar</button><button type="button" class="btn btn-secondary" id="cx-cancelar">Cancelar</button></div>`);
        m.querySelector('#cx-cancelar').onclick = () => m.remove();
        m.querySelector('#cx-ok').onclick = () => {
            const n = sel => Math.max(0, Math.round((parseFloat(String(m.querySelector(sel).value).replace(',', '.')) || 0) * 100) / 100);
            caixa.config = { mensalidade: n('#cx-mens'), diaria: n('#cx-dia'), vencimento: Math.min(31, Math.max(1, parseInt(m.querySelector('#cx-venc').value, 10) || 10)) };
            salvarCaixa(); m.remove(); renderizarCaixa(); toast('Valores salvos');
        };
    }
    function abrirMensalistas() {
        if (!jogadores.length) { mostrarAlerta('Cadastre os jogadores primeiro (aba Jogadores).', '👥 MENSALISTAS'); return; }
        const marcados = Object.assign({}, caixa.mensalistas || {});
        const lista = jogadores.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
        const m = abrirModalHtml(`<h2>👥 Quem é mensalista?</h2>
            <p class="subtext">Mensalista paga por mês. Quem não está marcado paga diária.</p>
            <div class="cx-escolha">${lista.map(j => `<label class="item-presenca"><input type="checkbox" class="chk-presenca" data-mens="${escapeHtml(String(j.id))}" ${marcados[String(j.id)] ? 'checked' : ''}>
                <span class="lbl-presenca">${avatarHtml(j.nome)}<span class="nm">${escapeHtml(j.nome)}</span><span class="switch"></span></span></label>`).join('')}</div>
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="cx-ok">Salvar</button><button type="button" class="btn btn-secondary" id="cx-cancelar">Cancelar</button></div>`);
        m.querySelector('#cx-cancelar').onclick = () => m.remove();
        m.querySelector('#cx-ok').onclick = () => {
            const novo = {};
            m.querySelectorAll('[data-mens]').forEach(c => { if (c.checked) novo[c.dataset.mens] = true; });
            caixa.mensalistas = novo;
            salvarCaixa(); m.remove(); renderizarCaixa();
            toast(Object.keys(novo).length + ' mensalista(s)');
        };
    }
    // diárias de quem o organizador marcou como pago na lista (e não é mensalista); não lança duas vezes
    function puxarDiariasDaLista() {
        if (!presencaCodigo || !presencaDados) return;
        const r = resumoPresencaAtual();
        const mens = caixa.mensalistas || {};
        const jaLancados = new Set(Object.values(caixa.lancamentos || {}).map(l => l && l.origem).filter(Boolean));
        const valor = Number(presencaDados.pix && presencaDados.pix.valor) || Number(caixa.config && caixa.config.diaria) || 0;
        if (!valor) { toast('Defina o valor da diária em ⚙️ Valores (ou o valor do Pix na lista).', 'erro'); abrirValoresCaixa(); return; }
        let n = 0;
        r.confirmados.filter(c => c.pago && !mens[c.id]).forEach(c => {
            const origem = 'lista:' + presencaCodigo + ':' + c.id;
            if (jaLancados.has(origem)) return;
            const l = { tipo: 'entrada', valor, categoria: 'diaria', desc: 'Diária · ' + c.nome, origem, mes: Logica.mesISO(), data: Date.now() };
            if (!c.convidado) l.jogadorId = c.id;
            caixa.lancamentos = caixa.lancamentos || {};
            caixa.lancamentos['l' + Logica.idUnico() + n] = l;
            n++;
        });
        if (!n) { toast('Nenhuma diária nova: confirme os pagamentos na lista (💰 Pago) primeiro.'); return; }
        salvarCaixa();
        caixaMes = Logica.mesISO();
        renderizarCaixa();
        toast(`⬇️ ${n} diária(s) lançada(s): ${Logica.reais(n * valor)}`);
        if (window.Metricas) Metricas.evento('caixa_diarias_lista');
    }
    async function cliqueCaixa(e) {
        const alvo = sel => e.target.closest && e.target.closest(sel);
        let b;
        if ((b = alvo('[data-cx]'))) {
            const a = b.dataset.cx;
            if (a === 'pro') { if (window.Monetizacao) window.Monetizacao.abrirModal('O caixa do racha é do plano Pro. Teste grátis e veja quem está devendo em segundos!'); return; }
            if (a === 'mes-ant') { caixaMes = Logica.somarMes(caixaMes, -1); renderizarCaixa(); return; }
            if (a === 'mes-prox') { caixaMes = Logica.somarMes(caixaMes, 1); renderizarCaixa(); return; }
            if (a === 'entrada' || a === 'saida') { abrirLancamento(a); return; }
            if (a === 'config') { abrirValoresCaixa(); return; }
            if (a === 'mensalistas') { abrirMensalistas(); return; }
            if (a === 'puxar-lista') { puxarDiariasDaLista(); return; }
            if (a === 'cobrar-grupo') {
                const r = Logica.resumoCaixa(caixa, jogadores, caixaMes);
                if (window.Metricas) Metricas.evento('caixa_cobranca');
                compartilharTexto(Logica.textoCobrancaGrupo(r, caixaMes, tituloRacha(), pixDoRacha()), '📢 Cobrança copiada! Cole no grupo.');
                return;
            }
        }
        if ((b = alvo('[data-cx-pagar]'))) {
            const r = Logica.resumoCaixa(caixa, jogadores, caixaMes);
            if (!r.config.mensalidade) { toast('Defina primeiro o valor da mensalidade.', 'erro'); abrirValoresCaixa(); return; }
            const j = jogadores.find(x => String(x.id) === b.dataset.cxPagar);
            if (!j) return;
            const dataPag = Logica.mesISO() === caixaMes ? Date.now() : new Date(caixaMes + '-15T12:00:00').getTime();
            novoLancamento({ tipo: 'entrada', valor: r.config.mensalidade, categoria: 'mensalidade', jogadorId: String(j.id), desc: 'Mensalidade · ' + j.nome, data: dataPag, mes: caixaMes });
            renderizarCaixa();
            toast(`💰 ${j.nome} pagou a mensalidade`);
            return;
        }
        if ((b = alvo('[data-cx-despagar]'))) {
            if (!(await mostrarConfirmacao('Desmarcar esse pagamento? O lançamento sai do caixa.', '💰 MENSALIDADE'))) return;
            if (caixa.lancamentos) delete caixa.lancamentos[b.dataset.cxDespagar];
            salvarCaixa(); renderizarCaixa();
            return;
        }
        if ((b = alvo('[data-cx-cobrar]'))) {
            const r = Logica.resumoCaixa(caixa, jogadores, caixaMes);
            const d = r.devedores.find(x => x.id === b.dataset.cxCobrar);
            if (!d) return;
            if (window.Metricas) Metricas.evento('caixa_cobranca');
            compartilharTexto(Logica.textoCobrancaIndividual(d.nome, r, caixaMes, tituloRacha(), pixDoRacha()), `📲 Cobrança do ${d.nome.split(' ')[0]} copiada!`);
            return;
        }
        if ((b = alvo('[data-cx-apagar]'))) {
            if (!(await mostrarConfirmacao('Apagar este lançamento do caixa?', '🧾 LANÇAMENTO'))) return;
            if (caixa.lancamentos) delete caixa.lancamentos[b.dataset.cxApagar];
            salvarCaixa(); renderizarCaixa();
        }
    }

