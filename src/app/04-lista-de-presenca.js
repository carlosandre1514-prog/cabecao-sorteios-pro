    // --- LISTA DE PRESENÇA POR LINK (presenca.html?c=CODIGO, sem login) ---
    // presenca/<codigo> = { dono, titulo, quando, limite, aberta, criadoEm, jogadores: [{id,nome,g}],
    //                       respostas: { id: {status:'vou'|'nao', em, nome?, convidado?, goleiro?} },
    //                       migrados: { idConvidado: idNovoJogador } }
    // O app escuta as respostas e marca a presença dos jogadores sozinho.
    let presencaCodigo = null;
    let presencaDados = null;
    let presencaParar = null;     // desliga o "escutar" do Firebase
    let presencaAssinatura = '';  // evita republicar a lista de nomes sem mudança
    const refPresenca = (sub) => window.firebaseFns.ref(window.firebaseDb, 'presenca/' + presencaCodigo + (sub ? '/' + sub : ''));
    function linkPresenca() { return linkPublico('presenca.html', presencaCodigo); }
    const jogadoresPublicos = () => jogadores.map(j => ({ id: String(j.id), nome: String(j.nome), g: !!j.isGoleiro }));
    function publicarJogadoresPresenca() {
        if (!presencaCodigo || !currentUserUid || !dadosCarregados) return;
        const lista = jogadoresPublicos();
        const sig = JSON.stringify(lista);
        if (sig === presencaAssinatura) return;
        presencaAssinatura = sig;
        window.firebaseFns.set(refPresenca('jogadores'), lista).catch(e => console.error('Lista de presença:', e));
    }
    function pararEscutaPresenca() {
        if (typeof presencaParar === 'function') { try { presencaParar(); } catch (e) { /* ignora */ } }
        presencaParar = null;
    }
    function escutarPresenca() {
        pararEscutaPresenca();
        const f = window.firebaseFns;
        if (!presencaCodigo || !f || typeof f.onValue !== 'function') { renderizarCardPresenca(); return; }
        const codigo = presencaCodigo;
        presencaParar = f.onValue(refPresenca(), (snap) => {
            if (codigo !== presencaCodigo) return;
            if (!snap.exists()) {   // encerrado em outro aparelho
                presencaCodigo = null; presencaDados = null; pararEscutaPresenca();
                gravar('presenca', null);
                renderizarCardPresenca();
                return;
            }
            presencaDados = snap.val() || {};
            sincronizarSorteioComLista();
            aplicarRespostasPresenca();
            renderizarCardPresenca();
        }, (e) => console.error('Lista de presença:', e));
        publicarJogadoresPresenca();
    }
    // quem confirmou fica presente; quem está na espera ou não vai fica ausente; sem resposta não mexe
    const opcoesPresenca = d => ({ vagasGoleiro: d.vagasGoleiro, pagos: d.pagos, prazo: d.prazo, promovidos: d.promovidos });
    const resumoPresencaAtual = () => {
        const d = presencaDados || {};
        return Logica.resumirPresenca(d.jogadores, d.respostas, d.limite, opcoesPresenca(d));
    };
    let pixPadrao = null;   // usuarios/<uid>/[rachas/<id>/]pix: última chave Pix usada nas listas
    const fmtPrazo = ms => new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    // o sorteio usa os mesmos times x jogadores de linha da lista (só quando a configuração da lista muda)
    let cfgListaAplicada = '';
    function sincronizarSorteioComLista() {
        const d = presencaDados || {};
        if (!d.times || !d.porTime) return;
        const cfg = d.times + 'x' + d.porTime;
        if (cfg === cfgListaAplicada) return;
        cfgListaAplicada = cfg;
        const qt = document.getElementById('qtd-times'), qp = document.getElementById('qtd-por-time');
        if (qt) qt.value = String(d.times);
        if (qp) qp.value = String(d.porTime);
        atualizarBarraSorteio();
    }
    function aplicarRespostasPresenca() {
        if (!presencaDados) return;
        const r = resumoPresencaAtual();
        const vai = new Set(r.confirmados.map(c => c.id));
        const naoVai = new Set(r.espera.concat(r.naoVao).map(c => c.id));
        let mudou = false;
        jogadores.forEach(j => {
            const id = String(j.id);
            const quer = vai.has(id) ? true : naoVai.has(id) ? false : null;
            if (quer !== null && !!j.presente !== quer) { j.presente = quer; mudou = true; }
        });
        if (mudou) { salvarJogadores(); renderizarPresenca(); }
    }
    function renderizarCardPresenca() {
        const off = document.getElementById('presenca-off');
        const on = document.getElementById('presenca-on');
        if (!off || !on) return;
        off.classList.toggle('hidden', !!presencaCodigo);
        on.classList.toggle('hidden', !presencaCodigo);
        const status = document.getElementById('lista-link-status');
        const acesso = document.getElementById('abrir-lista-link');
        if (acesso) acesso.classList.toggle('ativo', !!presencaCodigo);
        if (!presencaCodigo) { if (status) status.textContent = 'Mande no grupo: quem confirmar já fica marcado'; return; }
        const campo = document.getElementById('presenca-link');
        if (campo) campo.value = linkPresenca();
        const d = presencaDados || {};
        const r = resumoPresencaAtual();
        const resumo = document.getElementById('presenca-resumo');
        const cfg = d.times ? `${d.times} times de ${d.porTime} + goleiro` : (d.limite ? `${d.limite} vagas na linha` : 'Sem limite de vagas');
        if (status) status.textContent = (d.aberta === false ? 'Fechada' : 'Aberta') + ` · ${r.linhaConfirmados}${r.limite ? '/' + r.limite : ''} na linha`
            + (r.espera.length ? ` · ${r.espera.length} suplente${r.espera.length > 1 ? 's' : ''}` : '') + (r.aConfirmar.length ? ` · ${r.aConfirmar.length} a confirmar` : '');
        if (resumo) resumo.innerHTML = `
            ${d.aberta === false ? '<p class="aviso-faixa perigo">Lista fechada. Ninguém consegue mudar a resposta.</p>' : ''}
            <div class="lp-cfg"><span>${d.quando ? escapeHtml(d.quando) + ' · ' : ''}${cfg}</span><button type="button" class="btn-texto" id="btn-presenca-config">Ajustar</button></div>
            <div class="presenca-numeros">
                <div><strong>${r.linhaConfirmados}${r.limite ? '/' + r.limite : ''}</strong><small>na linha</small></div>
                <div><strong>${r.goleirosConfirmados}${r.vagasGoleiro ? '/' + r.vagasGoleiro : ''}</strong><small>goleiros</small></div>
                <div><strong>${r.espera.length}</strong><small>suplentes</small></div>
                <div><strong>${r.pagos}</strong><small>pagos</small></div>
                <div><strong>${r.pendentes}</strong><small>a pagar</small></div>
            </div>
            ${d.pix && d.pix.chave || d.prazo ? `<div class="lp-pag">
                ${d.pix && d.pix.chave ? `<span>Pix ${escapeHtml(d.pix.chave)}${d.pix.valor ? ' · ' + Logica.reais(d.pix.valor) : ''}</span>` : ''}
                ${d.prazo ? `<span class="${r.prazoVencido ? 'vencido' : ''}">Pagamento até ${escapeHtml(fmtPrazo(d.prazo))}${r.prazoVencido ? ' · vencido' : ''}</span>` : ''}
            </div>` : ''}
            ${r.aConfirmar.length ? `<p class="aviso-faixa ouro"><strong>${r.aConfirmar.length}</strong> ${r.aConfirmar.length === 1 ? 'avisou que pagou' : 'avisaram que pagaram'}: ${r.aConfirmar.map(c => escapeHtml(c.nome)).join(', ')}. Confira o Pix e toque em Confirmar.</p>` : ''}
            ${r.prazoVencido && r.atrasados.length ? `<div class="aviso-faixa perigo"><span><strong>${r.atrasados.length} ${r.atrasados.length === 1 ? 'jogador' : 'jogadores'}</strong> sem pagamento confirmado</span></div>` : ''}`;
        const conv = document.getElementById('presenca-convidados');
        if (conv) {
            const linhaPessoa = (c, i, suplente) => `<div class="pessoa-lista ${c.atrasado ? 'atrasado' : ''}">
                <span class="pos">${i + 1}</span>
                <span class="nome">${c.goleiro && window.UI ? UI.icone('glove', 'i-sm') + ' ' : ''}${escapeHtml(c.nome)}${c.convidado ? ' <small class="tag-conv">convidado</small>' : ''}${c.promovido && !suplente ? ' <small class="tag-conv">colocado por você</small>' : ''}</span>
                ${suplente ? `<button type="button" class="btn-pag subir" data-subir="${escapeHtml(c.id)}">Subir</button>` : `<button type="button" class="btn-pag ${c.pago ? 'pago' : c.aConfirmar ? 'aconfirmar' : ''}" data-pago="${escapeHtml(c.id)}">${c.pago ? 'Pago' : c.aConfirmar ? 'Confirmar' : c.atrasado ? 'Não pagou' : 'A pagar'}</button>`}
                <button type="button" class="btn-tirar" data-tirar="${escapeHtml(c.id)}" aria-label="Tirar da lista">${window.UI ? UI.icone('x', 'i-sm') : '✕'}</button>
            </div>`;
            const pedidos = r.convidados.filter(c => r.confirmados.some(x => x.id === c.id) || r.espera.some(x => x.id === c.id));
            conv.innerHTML = `
                <details class="presenca-gestao" open><summary>Confirmados <span>${r.confirmados.length}</span></summary>
                    ${r.confirmados.length ? r.confirmados.map((c, i) => linhaPessoa(c, i, false)).join('') : '<p class="subtext">Ninguém confirmou ainda.</p>'}
                </details>
                ${r.espera.length ? `<details class="presenca-gestao" open><summary>Suplentes <span>${r.espera.length}</span></summary><p class="dica">Quando alguém sai, você escolhe quem entra. Ou toque em Subir para colocar na lista.</p>
                    ${r.espera.map((c, i) => linhaPessoa(c, i, true)).join('')}</details>` : ''}
                ${pedidos.length ? `<div class="presenca-pedidos"><p class="rotulo">Convidados (fora do elenco)</p>
                    ${pedidos.map(c => `<div class="item-jogador"><span>${c.goleiro && window.UI ? UI.icone('glove', 'i-sm') + ' ' : ''}${escapeHtml(c.nome)}</span><button type="button" class="btn btn-secondary btn-mini" data-add-conv="${escapeHtml(c.id)}">Pôr no elenco</button></div>`).join('')}</div>` : ''}`;
        }
        const bf = document.getElementById('btn-presenca-fechar');
        if (bf) bf.textContent = d.aberta === false ? 'Reabrir lista' : 'Fechar lista';
    }
    // mensagem no formato das listas do WhatsApp: vagas numeradas, goleiros, suplentes, pagamento e o link
    function textoListaPresenca() {
        const d = Object.assign({}, presencaDados || {}, { titulo: (presencaDados && presencaDados.titulo) || tituloRacha(), visual: visualRacha });
        return Logica.textoListaWhatsApp(d, resumoPresencaAtual(), linkPresenca(), fmtPrazo);
    }
    async function compartilharPresenca() {
        if (!presencaCodigo) return;
        const texto = textoListaPresenca();
        if (window.Metricas) Metricas.evento('presenca_enviada');
        if (navigator.share) {
            try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
        }
        toast(await copiarTexto(texto) ? '📋 Lista copiada! Cole no grupo.' : 'Copie o link no campo acima.');
    }
    // datetime-local <-> ms (hora do aparelho)
    const paraCampoData = ms => { if (!ms) return ''; const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    // Criar (editar = false) ou ajustar (editar = true) a lista
    function abrirConfigPresenca(editar) {
        if (!dadosCarregados || !currentUserUid) {
            mostrarAlerta('Seus dados ainda não carregaram. Espere um instante e tente de novo.', '📲 LISTA DE PRESENÇA');
            return;
        }
        if (!editar && !jogadores.length) {
            mostrarAlerta('Cadastre os jogadores do racha primeiro (aba Jogadores). Quem não estiver no elenco pode entrar pelo link como convidado.', '📲 LISTA DE PRESENÇA');
            return;
        }
        const d = editar ? (presencaDados || {}) : {};
        const times0 = d.times || parseInt(document.getElementById('qtd-times')?.value, 10) || 4;
        const pix0 = (d.pix && d.pix.chave) ? d.pix : (pixPadrao || {});   // última chave usada neste racha
        const linha0 = d.porTime || parseInt(document.getElementById('qtd-por-time')?.value, 10) || 4;
        const m = abrirModalHtml(`<h2>${editar ? '⚙️ Ajustar lista' : '📲 Nova lista de presença'}</h2>
            <div class="form-group-row"><label for="pr-times">Quantidade de times</label><input type="number" id="pr-times" min="2" max="8" value="${times0}"></div>
            <div class="form-group-row"><label for="pr-linha">Jogadores de linha por time</label><input type="number" id="pr-linha" min="1" max="12" value="${linha0}"></div>
            <p class="subtext" id="pr-conta" style="margin:2px 0 10px;"></p>
            <label class="subtext" for="pr-quando">Quando é o racha? (opcional)</label>
            <input type="text" id="pr-quando" maxlength="60" placeholder="Ex.: Sábado, 16h — Quadra do Zé" value="${escapeHtml(d.quando || '')}">
            <label class="subtext" for="pr-pag" style="margin-top:10px;display:block;">Como pagar (opcional)</label>
            <input type="text" id="pr-pag" maxlength="80" placeholder="Ex.: R$ 15 no Pix 11 99999-9999" value="${escapeHtml(d.pagamento || '')}">
            <div class="pix-config">
                <p class="pix-titulo">Pix copia e cola ${podeVisualPro() ? '' : '<span class="tag-pro">PRO</span>'}</p>
                <p class="subtext" style="margin:0 0 8px;">Cada jogador com vaga recebe o QR Code e o "copiar Pix" já com o valor. O dinheiro cai direto na sua conta, sem taxa.</p>
                <div class="pix-linha">
                    <select id="pr-pix-tipo" aria-label="Tipo da chave">
                        ${[['telefone', 'Celular'], ['cpf', 'CPF'], ['email', 'E-mail'], ['cnpj', 'CNPJ'], ['aleatoria', 'Aleatória']].map(([v, t]) => `<option value="${v}" ${pix0.tipo === v ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                    <input type="text" id="pr-pix-chave" maxlength="80" placeholder="Sua chave Pix" value="${escapeHtml(pix0.chaveDigitada || '')}" autocomplete="off">
                </div>
                <p class="dica-pix" id="pr-pix-dica"></p>
                <div class="pix-linha">
                    <input type="text" id="pr-pix-nome" maxlength="25" placeholder="Nome de quem recebe" value="${escapeHtml(pix0.nome || '')}">
                    <input type="text" id="pr-pix-cidade" maxlength="15" placeholder="Cidade" value="${escapeHtml(pix0.cidade || '')}">
                </div>
                <div class="form-group-row" style="margin:8px 0 0;"><label for="pr-pix-valor">Valor por pessoa (R$)</label><input type="number" id="pr-pix-valor" min="0" step="0.5" inputmode="decimal" placeholder="15" value="${pix0.valor || ''}"></div>
            </div>
            <label class="subtext" for="pr-prazo" style="margin-top:10px;display:block;">Prazo para pagar (opcional)</label>
            <input type="datetime-local" id="pr-prazo" value="${paraCampoData(d.prazo)}">
            <p class="subtext" style="margin:4px 0 0;">Quem não for marcado como pago até o prazo fica pendente, e você pode tirar da lista para subir os suplentes.</p>
            ${editar ? '' : '<label style="display:flex;gap:8px;align-items:center;margin-top:12px;"><input type="checkbox" id="pr-zerar" checked> <span class="subtext" style="margin:0;">Desmarcar todo mundo agora (só fica marcado quem confirmar)</span></label>'}
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="pr-criar">${editar ? 'Salvar' : 'Criar e enviar'}</button><button type="button" class="btn btn-secondary" id="pr-cancelar">Cancelar</button></div>`);
        const ler = () => {
            const times = Math.max(2, Math.min(8, parseInt(m.querySelector('#pr-times').value, 10) || 2));
            const porTime = Math.max(1, Math.min(12, parseInt(m.querySelector('#pr-linha').value, 10) || 1));
            return { times, porTime, limite: times * porTime, vagasGoleiro: times };
        };
        const conta = () => {
            const c = ler(), el = m.querySelector('#pr-conta');
            if (el) el.textContent = `= ${c.limite} vagas na linha + ${c.vagasGoleiro} goleiros (1 por time). Passou disso, vira suplente.`;
        };
        ['#pr-times', '#pr-linha'].forEach(sel => { const el = m.querySelector(sel); if (el && el.addEventListener) el.addEventListener('input', conta); });
        conta();
        const lerPix = () => {
            const digitada = (m.querySelector('#pr-pix-chave').value || '').trim();
            if (!digitada) return null;
            const tipo = m.querySelector('#pr-pix-tipo').value;
            return {
                tipo, chaveDigitada: digitada, chave: Logica.normalizarChavePix(tipo, digitada),
                nome: (m.querySelector('#pr-pix-nome').value || '').trim().slice(0, 25),
                cidade: (m.querySelector('#pr-pix-cidade').value || '').trim().slice(0, 15),
                valor: Math.max(0, Math.round((parseFloat(String(m.querySelector('#pr-pix-valor').value).replace(',', '.')) || 0) * 100) / 100)
            };
        };
        const dicaPix = () => {
            const el = m.querySelector('#pr-pix-dica'); if (!el) return;
            const px = lerPix();
            el.className = 'dica-pix' + (px ? (px.chave ? ' ok' : ' erro') : '');
            el.textContent = !px ? '' : px.chave ? 'Chave válida: ' + px.chave : 'Essa chave não parece um ' + ({ telefone: 'celular com DDD', cpf: 'CPF (11 números)', cnpj: 'CNPJ (14 números)', email: 'e-mail', aleatoria: 'chave aleatória' }[px.tipo]);
        };
        ['#pr-pix-chave', '#pr-pix-tipo'].forEach(sel => { const el = m.querySelector(sel); if (el && el.addEventListener) { el.addEventListener('input', dicaPix); el.addEventListener('change', dicaPix); } });
        dicaPix();
        m.querySelector('#pr-cancelar').onclick = () => m.remove();
        m.querySelector('#pr-criar').onclick = async () => {
            const c = ler();
            const px = lerPix();
            if (px && !px.chave) { dicaPix(); toast('Confira a chave Pix (ou deixe em branco).', 'erro'); return; }
            if (px && !px.nome) { toast('Coloque o nome de quem recebe o Pix.', 'erro'); return; }
            if (px && !podeVisualPro()) {
                m.remove();
                if (window.Monetizacao) window.Monetizacao.abrirModal('O Pix copia e cola na lista é do plano Pro. Seus jogadores pagam com um toque e você não precisa ficar mandando a chave!');
                return;
            }
            const prazoTxt = m.querySelector('#pr-prazo').value;
            const prazo = prazoTxt ? new Date(prazoTxt).getTime() || 0 : 0;
            let pagamento = m.querySelector('#pr-pag').value.trim().slice(0, 80);
            if (px && !pagamento && px.valor) pagamento = 'R$ ' + px.valor.toFixed(2).replace('.', ',') + ' no Pix (copia e cola no link)';
            const cfg = Object.assign(c, {
                quando: m.querySelector('#pr-quando').value.trim().slice(0, 60),
                pagamento,
                prazo,
                pix: px || null
            });
            // lembra a chave para as próximas listas deste racha
            if (px) { pixPadrao = px; gravar('pix', px); }
            // o sorteio usa a mesma configuração
            const qt = document.getElementById('qtd-times'), qp = document.getElementById('qtd-por-time');
            if (qt) qt.value = String(c.times);
            if (qp) qp.value = String(c.porTime);
            const f = window.firebaseFns;
            const btn = m.querySelector('#pr-criar');
            btn.disabled = true;
            if (editar) {
                try { await Promise.all(Object.entries(cfg).map(([k, v]) => f.set(refPresenca(k), v))); }
                catch (e) { btn.disabled = false; toast('Não foi possível salvar (' + ((e && e.code) || 'erro') + ')', 'erro'); return; }
                m.remove();
                toast('Lista ajustada. Os suplentes sobem ou descem sozinhos.');
                return;
            }
            const zerar = m.querySelector('#pr-zerar').checked;
            const codigo = gerarCodigoAoVivo();
            const dados = Object.assign({ dono: currentUserUid, titulo: tituloRacha(), aberta: true, criadoEm: Date.now(), jogadores: jogadoresPublicos(), visual: visualRacha }, cfg);
            try {
                await f.set(f.ref(window.firebaseDb, 'presenca/' + codigo), dados);
            } catch (e) {
                btn.disabled = false;
                const cod = String((e && (e.code || e.message)) || 'erro');
                const dica = /permission/i.test(cod) ? ' O Firebase negou: publique as regras com "presenca" (docs/COMO-CONFIGURAR-MONETIZACAO.md).' : ' Confira a internet.';
                mostrarAlerta('Não consegui criar a lista.' + dica + ' (Código: ' + cod + ')', '❌ LISTA DE PRESENÇA');
                return;
            }
            m.remove();
            presencaCodigo = codigo;
            presencaDados = dados;
            presencaAssinatura = JSON.stringify(dados.jogadores);
            gravar('presenca', { codigo });
            if (zerar) { jogadores.forEach(j => { j.presente = false; }); salvarJogadores(); renderizarPresenca(); }
            escutarPresenca();
            renderizarCardPresenca();
            if (window.Metricas) Metricas.evento('presenca_criada');
            toast('📲 Lista criada! Agora mande o link no grupo.');
            compartilharPresenca();
        };
    }
    // Organizador tira alguém da lista (desistiu ou não pagou): o primeiro suplente sobe sozinho
    // tira da lista; `quemSobe` (opcional) é o suplente escolhido pelo organizador para a vaga
    async function tirarDaLista(ids, quemSobe) {
        const d = presencaDados || {};
        const f = window.firebaseFns;
        if (quemSobe) await f.set(refPresenca('promovidos/' + quemSobe), Date.now()).catch(e => console.error('Lista de presença:', e));
        await Promise.all(ids.map(id => {
            const atual = (d.respostas || {})[id] || {};
            const conv = atual.convidado ? { nome: atual.nome, convidado: true, goleiro: !!atual.goleiro } : {};
            return Promise.all([
                f.set(refPresenca('respostas/' + id), Object.assign({ status: 'nao', em: Date.now(), removido: true }, conv)),
                f.set(refPresenca('pagos/' + id), null),
                f.set(refPresenca('promovidos/' + id), null)
            ]);
        })).catch(e => { console.error('Lista de presença:', e); toast('Não foi possível tirar da lista', 'erro'); });
        if (window.Metricas) Metricas.evento('presenca_removido');
    }
    // ✕ de um confirmado: o organizador escolhe qual suplente entra no lugar (mesma posição: linha ou goleiro)
    async function escolherTirada(id) {
        const r = resumoPresencaAtual();
        const sai = r.confirmados.find(c => c.id === id) || r.espera.find(c => c.id === id);
        if (!sai) return;
        const ehSuplente = r.espera.some(c => c.id === id);
        const opcoes = ehSuplente ? [] : r.espera.filter(c => c.goleiro === sai.goleiro);
        if (!opcoes.length) {
            const ok = await mostrarConfirmacao(ehSuplente ? 'Sai da fila de suplentes.' : 'A vaga fica livre para quem confirmar.', `Tirar ${sai.nome} da lista?`, { ok: 'Tirar', perigo: true });
            if (ok) { await tirarDaLista([id]); toast(`${sai.nome} saiu da lista`); }
            return;
        }
        const m = abrirModalHtml(`<h2>Tirar ${escapeHtml(sai.nome)}</h2>
            <p class="dica-painel">Quem entra no lugar?</p>
            <div class="lista escolha-suplente">${opcoes.map((c, i) => `<label class="lista-item">
                <input type="radio" name="quem-sobe" value="${escapeHtml(c.id)}" ${i === 0 ? 'checked' : ''}>
                ${avatarHtml(c.nome)}<span class="li-txt"><span class="li-titulo">${escapeHtml(c.nome)}</span><span class="li-sub">${i + 1}º da fila${c.convidado ? ' · convidado' : ''}</span></span>
                <span class="radio-marca" aria-hidden="true"></span></label>`).join('')}</div>
            <div class="modal-actions">
                <button type="button" class="btn btn-perigo" id="tirar-ok">Tirar e colocar ${escapeHtml(opcoes[0].nome)}</button>
                <button type="button" class="btn btn-secondary" id="tirar-cancelar">Cancelar</button>
            </div>`);
        const ok = m.querySelector('#tirar-ok');
        m.querySelector('.escolha-suplente').addEventListener('change', () => {
            const sel = m.querySelector('input[name="quem-sobe"]:checked');
            const c = opcoes.find(x => x.id === (sel && sel.value));
            if (c) ok.textContent = 'Tirar e colocar ' + c.nome;
        });
        m.querySelector('#tirar-cancelar').onclick = () => m.remove();
        ok.onclick = async () => {
            const sel = m.querySelector('input[name="quem-sobe"]:checked');
            const quem = opcoes.find(x => x.id === (sel && sel.value)) || opcoes[0];
            ok.disabled = true;
            // o primeiro da fila sobe sozinho; só marca como "colocado" se o organizador escolheu outro
            await tirarDaLista([id], quem.id === opcoes[0].id ? null : quem.id);
            m.remove();
            toast(`${sai.nome} saiu · ${quem.nome} entrou`);
        };
    }
    // "Subir" de um suplente: entra na lista; se estiver cheia, quem confirmou por último vira suplente
    async function subirSuplente(id) {
        const d = presencaDados || {};
        const antes = resumoPresencaAtual();
        const quem = antes.espera.find(c => c.id === id);
        if (!quem) return;
        const agora = Date.now();
        const depois = Logica.resumirPresenca(d.jogadores, d.respostas, d.limite, Object.assign(opcoesPresenca(d), { promovidos: Object.assign({}, d.promovidos, { [id]: agora }) }));
        const caem = antes.confirmados.filter(c => !depois.confirmados.some(x => x.id === c.id));
        const ok = await mostrarConfirmacao(caem.length ? `${caem.map(c => c.nome).join(', ')} ${caem.length > 1 ? 'viram suplentes' : 'vira suplente'} para abrir a vaga.` : 'Ele entra na vaga livre.',
            `Colocar ${quem.nome} na lista?`, { ok: 'Colocar' });
        if (!ok) return;
        try { await window.firebaseFns.set(refPresenca('promovidos/' + id), agora); toast(`${quem.nome} entrou na lista`); }
        catch (e) { toast('Não foi possível mudar a lista', 'erro'); }
        if (window.Metricas) Metricas.evento('presenca_subiu');
    }
    async function adicionarConvidadoPresenca(idConv) {
        const d = presencaDados || {};
        const resp = (d.respostas || {})[idConv];
        if (!resp || !presencaCodigo) return;
        if (window.Monetizacao && !window.Monetizacao.checarLimiteJogadores(jogadores.length, 1)) return;
        const novoId = Logica.idUnico();
        jogadores.push({ id: novoId, nome: String(resp.nome || 'Convidado').slice(0, 40), isGoleiro: !!resp.goleiro, estrelas: 3.0, presente: resp.status === 'vou' });
        salvarJogadores();           // também publica o nome novo na lista
        renderizarElenco();
        const f = window.firebaseFns;
        try {
            // a resposta (e o pagamento) passa a ser do jogador do elenco; mantém o horário: não perde a vaga
            await f.set(refPresenca('respostas/' + novoId), { status: resp.status, em: resp.em || Date.now() });
            if (d.pagos && d.pagos[idConv]) { await f.set(refPresenca('pagos/' + novoId), true); await f.set(refPresenca('pagos/' + idConv), null); }
            await f.set(refPresenca('migrados/' + idConv), String(novoId));
            await f.set(refPresenca('respostas/' + idConv), null);
        } catch (e) { console.error('Lista de presença:', e); }
        if (window.Metricas) Metricas.evento('presenca_convidado_add');
        toast(`${resp.nome} entrou no elenco com 3 estrelas. Ajuste na aba Jogadores.`);
    }
    function configurarPresenca() {
        const $ = id => document.getElementById(id);
        $('btn-presenca-criar')?.addEventListener('click', () => abrirConfigPresenca(false));
        $('btn-presenca-enviar')?.addEventListener('click', compartilharPresenca);
        $('btn-presenca-copiar')?.addEventListener('click', async () => {
            if (window.Metricas) Metricas.evento('presenca_lista_copiada');
            toast(await copiarTexto(textoListaPresenca()) ? '📋 Lista atualizada copiada! Cole no grupo.' : 'Copie o link no campo acima.');
        });
        $('btn-presenca-fechar')?.addEventListener('click', async () => {
            if (!presencaCodigo) return;
            const abrir = presencaDados && presencaDados.aberta === false;
            try { await window.firebaseFns.set(refPresenca('aberta'), abrir); toast(abrir ? '🔓 Lista reaberta' : '🔒 Lista fechada'); }
            catch (e) { toast('Não foi possível mudar a lista', 'erro'); }
        });
        $('btn-presenca-encerrar')?.addEventListener('click', async () => {
            const ok = await mostrarConfirmacao('O link para de funcionar e as respostas são apagadas. A presença marcada aqui no app continua.', 'Encerrar a lista?', { ok: 'Encerrar', perigo: true });
            if (!ok || !presencaCodigo) return;
            const ref = refPresenca();
            pararEscutaPresenca();
            presencaCodigo = null; presencaDados = null; presencaAssinatura = '';
            window.firebaseFns.set(ref, null).catch(e => console.error('Lista de presença:', e));
            gravar('presenca', null);
            renderizarCardPresenca();
            toast('Lista encerrada.');
        });
        // botões dentro do card (são redesenhados a cada resposta)
        $('card-presenca')?.addEventListener('click', async (e) => {
            const alvo = sel => e.target.closest && e.target.closest(sel);
            if (!presencaCodigo) return;
            const r = resumoPresencaAtual();
            const nomeDe = id => ((r.confirmados.concat(r.espera).find(c => c.id === id)) || {}).nome || 'essa pessoa';
            let b;
            if ((b = alvo('[data-add-conv]'))) { adicionarConvidadoPresenca(b.dataset.addConv); return; }
            if (alvo('#btn-presenca-config')) { abrirConfigPresenca(true); return; }
            if ((b = alvo('[data-pago]'))) {
                const id = b.dataset.pago;
                const pago = !((presencaDados.pagos || {})[id]);
                if (!pago && !(await mostrarConfirmacao(`Desmarcar o pagamento de ${nomeDe(id)}?`, '💰 PAGAMENTO'))) return;
                b.disabled = true;
                try { await window.firebaseFns.set(refPresenca('pagos/' + id), pago ? true : null); if (window.Metricas && pago) Metricas.evento('presenca_pago'); }
                catch (er) { toast('Não foi possível marcar', 'erro'); }
                b.disabled = false;
                return;
            }
            if ((b = alvo('[data-tirar]'))) { escolherTirada(b.dataset.tirar); return; }
            if ((b = alvo('[data-subir]'))) { subirSuplente(b.dataset.subir); return; }
        });
    }
    configurarPresenca();

    function salvarJogadores() { gravar('jogadores', jogadores); publicarJogadoresPresenca(); }
    function salvarHistoricoFirebase() { gravar('historico', historico); }

    // Firebase devolve listas como array OU objeto, e apaga listas vazias -> sempre normalizamos
    const comoLista = (v) => Object.values(v || {}).filter(Boolean);

    // O banco do Firebase demora um instante para conectar logo depois do login e a
    // primeira leitura pode falhar com "Client is offline". Tentamos de novo em silêncio.
    async function lerComTentativas(userRef, uid) {
        let ultimoErro;
        for (let i = 0; i < 4; i++) {
            try {
                return await window.firebaseFns.get(userRef);
            } catch (erro) {
                ultimoErro = erro;
                if (uid !== currentUserUid) throw erro;
                if (/permission/i.test((erro && (erro.code || erro.message)) || '')) throw erro; // repetir não adianta
                await new Promise(r => setTimeout(r, 700 * (i + 1)));
            }
        }
        throw ultimoErro;
    }

    function carregarDadosDoFirebase() {
        if (!currentUserUid || !window.firebaseDb) return;
        const uid = currentUserUid;
        const userRef = window.firebaseFns.ref(window.firebaseDb, `usuarios/${uid}`);
        const cache = lerLocal(chaveCache(uid));
        let resolvido = false;
        const usarCache = () => {
            if (resolvido || uid !== currentUserUid) return;
            resolvido = true;
            modoOffline = true;
            espelho = cache;
            aplicarDados(JSON.parse(JSON.stringify(cache)));
            toast('📴 Sem internet: usando os dados salvos neste aparelho. O que mudar sobe quando a conexão voltar.');
            if (window.Metricas) Metricas.evento('abriu_offline');
        };
        // sem internet e com cópia no aparelho: abre na hora
        if (cache && typeof navigator !== 'undefined' && navigator.onLine === false) { usarCache(); return; }
        mostrarCarregando(true, 'Carregando seus dados...');
        // internet ruim (comum na quadra): não deixa o usuário esperando mais que 6 s
        if (cache) setTimeout(usarCache, 6000);

        lerComTentativas(userRef, uid).then((snapshot) => {
            if (uid !== currentUserUid || resolvido) return; // trocou de conta ou já abriu com a cópia
            resolvido = true;
            modoOffline = false;
            const dados = reaplicarPendentes(uid, snapshot.exists() ? (snapshot.val() || {}) : {});
            espelho = JSON.parse(JSON.stringify(dados));
            salvarLocal(chaveCache(uid), espelho);
            aplicarDados(dados);
        }).catch(async (error) => {
            if (uid !== currentUserUid || resolvido) return;
            const detalhe = String((error && (error.code || error.message)) || 'erro desconhecido');
            if (cache && !/permission/i.test(detalhe)) { usarCache(); return; }
            resolvido = true;
            console.error("Erro ao carregar dados do Firebase:", error);
            mostrarCarregando(false);
            // dadosCarregados continua false: nada será salvo por cima dos seus dados
            let dica = 'Confira a internet.';
            if (/permission/i.test(detalhe)) dica = 'O Firebase negou a leitura: as regras do Realtime Database não liberam "usuarios".';
            else if (/offline|unavailable|network/i.test(detalhe)) dica = 'Não conectou ao banco: confira a internet e o endereço (databaseURL) do Realtime Database.';
            const tentar = await mostrarConfirmacao(`Não consegui carregar seus dados. ${dica} (Código: ${detalhe}) Tentar de novo?`, '❌ ERRO AO CARREGAR');
            if (tentar && uid === currentUserUid) carregarDadosDoFirebase();
        });
    }

    // Coloca na tela os dados de usuarios/<uid> (vindos da nuvem ou da cópia do aparelho)
    function aplicarDados(dados) {
            dados = dados || {};

            perfil = (dados.perfil && typeof dados.perfil === 'object') ? dados.perfil : {};
            renderizarPerfil();

            // perfis de racha: principal + os criados pelo usuário
            const extras = comoLista(dados.rachasLista).filter(r => r && r.id && r.nome).map(r => ({ id: String(r.id), nome: String(r.nome) }));
            rachas = [{ id: 'principal', nome: 'Racha principal' }].concat(extras);
            if (!rachaEscolhida) {
                const salvo = dados.rachaAtivo ? String(dados.rachaAtivo) : 'principal';
                rachaAtivo = rachas.some(r => r.id === salvo) ? salvo : 'principal';
                rachaEscolhida = true;
            }
            if (!rachas.some(r => r.id === rachaAtivo)) rachaAtivo = 'principal';
            const todosExtras = (dados.rachas && typeof dados.rachas === 'object') ? dados.rachas : {};
            resumoRachas = { principal: { j: comoLista(dados.jogadores).length, h: comoLista(dados.historico).length } };
            extras.forEach(r => { const d = todosExtras[r.id] || {}; resumoRachas[r.id] = { j: comoLista(d.jogadores).length, h: comoLista(d.historico).length }; });
            const base = rachaAtivo === 'principal' ? dados : (todosExtras[rachaAtivo] || {});

            jogadores = comoLista(base.jogadores);
            historico = comoLista(base.historico).map(h => Object.assign({}, h, {
                classificacao: Logica.limparMapa(h.classificacao),
                artilharia: Logica.limparMapa(h.artilharia),
                times: comoLista(h.times).map(Logica.normalizarTime)
            }));

            const c = base.campeonatoAtivo;
            if (c) {
                const normPartida = p => Object.assign({}, p, {
                    timeA: Logica.normalizarTime(p.timeA),
                    timeB: Logica.normalizarTime(p.timeB)
                });
                modoJogoAtual = c.modoJogoAtual || 'todos-contra-todos';
                timesSorteados = comoLista(c.timesSorteados).map(Logica.normalizarTime);
                partidas = comoLista(c.partidas).map(normPartida);
                partidaAtualIndex = c.partidaAtualIndex || 0;
                classificacao = Logica.limparMapa(c.classificacao);
                artilharia = Logica.limparMapa(c.artilharia);
                timeEmCampoA = c.timeEmCampoA ? Logica.normalizarTime(c.timeEmCampoA) : null;
                timeEmCampoB = c.timeEmCampoB ? Logica.normalizarTime(c.timeEmCampoB) : null;
                filaTimes = comoLista(c.filaTimes).map(Logica.normalizarTime);
                partidasRachaHistorico = comoLista(c.partidasRachaHistorico).map(normPartida);
                placarRacha = { a: Number(c.placarRacha && c.placarRacha.a) || 0, b: Number(c.placarRacha && c.placarRacha.b) || 0 };
            }

            aoVivoCodigo = (base.aoVivo && base.aoVivo.codigo) || null;
            presencaCodigo = (base.presenca && base.presenca.codigo) || null;
            visualRacha = (base.visual && typeof base.visual === 'object') ? base.visual : {};
            pixPadrao = (base.pix && typeof base.pix === 'object') ? base.pix : null;
            caixa = (base.caixa && typeof base.caixa === 'object') ? base.caixa : {};
            caixaMes = Logica.mesISO();
            presencaAssinatura = '';
            dadosCarregados = true;
            aplicarVisual();
            escutarPresenca();
            renderizarRachas();
            verificarAdmin();
            atualizarCardAoVivo();
            publicarAoVivo(false);
            mostrarCarregando(false);
            renderizarElenco();
            renderizarHistorico();
            if (timesSorteados.length > 0) renderizarCampeonato();
    }

