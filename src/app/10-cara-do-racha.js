    // ---------- CARA DO RACHA (🎨 Personalizar): nome, escudo e cor ----------
    // Fica em usuarios/<uid>/[rachas/<id>/]visual = { nome, cor, escudo (imagem pequena) }.
    // Aparece no app, no link da lista, no placar ao vivo e nas imagens do WhatsApp.
    let visualRacha = {};
    function aplicarVisual() {
        const c = Logica.corRacha(visualRacha.cor);
        const raiz = document.documentElement && document.documentElement.style;
        if (raiz && raiz.setProperty) {
            raiz.setProperty('--neon', c.a); raiz.setProperty('--verde', c.b);
            raiz.setProperty('--neon-rgb', Logica.hexParaRgb(c.a)); raiz.setProperty('--verde-rgb', Logica.hexParaRgb(c.b));
        }
        const logo = document.querySelector('.app-header .app-logo');
        if (logo && 'src' in logo) logo.src = visualRacha.escudo || 'img/icon-192.png';
        const sub = document.getElementById('sub-racha');
        if (sub) sub.textContent = visualRacha.nome || nomeRachaAtivo();
    }
    const podeVisualPro = () => !window.Monetizacao || window.Monetizacao.isPro();
    // Logo do racha: aceita PNG transparente ou foto com fundo.
    // abrirImagem -> { img, transparente }; desenharLogo -> dataURL quadrado de `lado` px:
    //   'encaixar'  = imagem inteira dentro do quadrado (bom para escudo PNG sem fundo)
    //   'preencher' = cobre o quadrado e corta as sobras (bom para foto com fundo)
    function abrirImagem(arquivo) {
        return new Promise((ok, falha) => {
            if (!arquivo || !/^image\//.test(arquivo.type || 'image/')) { falha(new Error('não é imagem')); return; }
            const leitor = new FileReader();
            leitor.onerror = falha;
            leitor.onload = () => {
                const img = new Image();
                img.onerror = falha;
                img.onload = () => {
                    // tem transparência? (olha uma versão pequena da imagem)
                    let transparente = false;
                    try {
                        const t = document.createElement('canvas'); t.width = t.height = 48;
                        const cx = t.getContext('2d'); cx.drawImage(img, 0, 0, 48, 48);
                        const px = cx.getImageData(0, 0, 48, 48).data;
                        for (let i = 3; i < px.length; i += 4) if (px[i] < 245) { transparente = true; break; }
                    } catch (e) { /* ignora */ }
                    ok({ img, transparente });
                };
                img.src = leitor.result;
            };
            leitor.readAsDataURL(arquivo);
        });
    }
    function desenharLogo(origem, modo, lado) {
        const { img, transparente } = origem;
        const c = document.createElement('canvas'); c.width = c.height = lado;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        const k = (modo === 'preencher' ? Math.max : Math.min)(lado / img.width, lado / img.height);
        const w = img.width * k, h = img.height * k;
        ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
        // sobra transparente (encaixar) ou imagem transparente -> PNG; foto cobrindo tudo -> JPEG (bem mais leve)
        const temTransparencia = transparente || (modo !== 'preencher' && Math.abs(img.width - img.height) > 2);
        return temTransparencia ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86);
    }

    function abrirPersonalizar() {
        if (!dadosCarregados) return;
        fecharDrawer();
        const temp = Object.assign({ nome: '', cor: 'verde', escudo: '' }, visualRacha);
        let origem = null;          // imagem escolhida agora (para trocar entre preencher/encaixar)
        let modoLogo = 'encaixar';
        const sugestao = rachaAtivo !== 'principal' ? nomeRachaAtivo() : ((perfil && perfil.apelido) ? 'Racha do ' + perfil.apelido : '');
        const m = abrirModalHtml(`<h2>🎨 Cara do racha</h2>
            <div class="vis-preview" id="vis-preview"></div>
            <label class="subtext" for="vis-nome" style="display:block;margin-top:12px;">Nome do racha</label>
            <input type="text" id="vis-nome" maxlength="32" placeholder="Ex.: Pelada de Sexta" value="${escapeHtml(temp.nome || sugestao)}">
            <p class="subtext" style="margin:14px 0 6px;">Logo / escudo do racha ${podeVisualPro() ? '' : '<span class="tag-pro">PRO</span>'}</p>
            <div class="vis-escudo-acoes">
                <button type="button" class="btn btn-secondary" id="vis-escudo-btn">${window.UI ? UI.icone('image', 'i-sm') : ''}Escolher foto ou PNG</button>
                <button type="button" class="btn btn-secondary" id="vis-escudo-tirar">Tirar</button>
            </div>
            <input type="file" id="vis-escudo-arq" accept="image/*" class="hidden">
            <div class="vis-modo hidden" id="vis-modo" role="group" aria-label="Como a imagem fica">
                <button type="button" data-modo="preencher">Preencher<small>foto com fundo</small></button>
                <button type="button" data-modo="encaixar">Encaixar inteira<small>escudo sem fundo</small></button>
            </div>
            <p class="subtext" style="margin:6px 0 0;">Pode ser escudo em PNG (com ou sem fundo) ou uma foto do grupo.</p>
            <p class="subtext" style="margin:14px 0 6px;">Cor ${podeVisualPro() ? '' : '<span class="tag-pro">PRO</span>'}</p>
            <div class="vis-cores">${Object.entries(Logica.CORES_RACHA).map(([k, c]) => `<button type="button" class="vis-cor" data-cor="${k}" title="${c.nome}" aria-label="${c.nome}" style="background:linear-gradient(135deg, ${c.a}, ${c.b})"></button>`).join('')}</div>
            <p class="subtext" style="margin:12px 0 0;">Aparece no app, no link da lista de presença, no placar ao vivo e nas imagens que você manda no grupo.</p>
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="vis-salvar">Salvar</button><button type="button" class="btn btn-secondary" id="vis-cancelar">Cancelar</button></div>`);
        const $m = sel => m.querySelector(sel);
        const desenhar = () => {
            const c = Logica.corRacha(temp.cor);
            const nome = ($m('#vis-nome').value || '').trim() || 'Seu racha';
            const prev = $m('#vis-preview');
            if (prev) {
                prev.style.background = `linear-gradient(135deg, ${c.b}55, transparent 70%), rgba(0,0,0,.3)`;
                prev.style.borderColor = c.a + '88';
                prev.innerHTML = `<img src="${temp.escudo || 'img/icon-192.png'}" alt=""><div><b style="color:${c.a}">${escapeHtml(nome)}</b><small>Times sorteados · placar ao vivo</small></div>`;
            }
            m.querySelectorAll('.vis-cor').forEach(b => b.classList.toggle('on', b.dataset.cor === temp.cor));
            const vm = $m('#vis-modo');
            if (vm) {
                vm.classList.toggle('hidden', !origem || !temp.escudo);
                vm.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('on', b.dataset.modo === modoLogo));
            }
            const tirar = $m('#vis-escudo-tirar'); if (tirar) tirar.disabled = !temp.escudo;
        };
        const exigirPro = () => {
            if (podeVisualPro()) return true;
            m.remove();
            if (window.Monetizacao) window.Monetizacao.abrirModal('Escudo e cor do racha são do plano Pro. O nome é grátis!');
            return false;
        };
        $m('#vis-nome').addEventListener('input', desenhar);
        m.querySelectorAll('.vis-cor').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.cor !== temp.cor && !exigirPro()) return;
            temp.cor = b.dataset.cor; desenhar();
        }));
        $m('#vis-escudo-btn').onclick = () => { if (exigirPro()) $m('#vis-escudo-arq').click(); };
        $m('#vis-escudo-tirar').onclick = () => { temp.escudo = ''; origem = null; desenhar(); };
        $m('#vis-escudo-arq').addEventListener('change', async (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            try {
                origem = await abrirImagem(f);
                // PNG sem fundo: encaixa inteira; foto com fundo: preenche o quadrado
                modoLogo = origem.transparente ? 'encaixar' : 'preencher';
                temp.escudo = desenharLogo(origem, modoLogo, 256);
                desenhar();
            } catch (er) { toast('Não consegui abrir essa imagem. Tente uma foto PNG ou JPG.', 'erro'); }
            e.target.value = '';
        });
        m.querySelectorAll('#vis-modo [data-modo]').forEach(b => b.addEventListener('click', () => {
            if (!origem) return;
            modoLogo = b.dataset.modo;
            temp.escudo = desenharLogo(origem, modoLogo, 256);
            desenhar();
        }));
        $m('#vis-cancelar').onclick = () => m.remove();
        $m('#vis-salvar').onclick = () => {
            const v = { nome: ($m('#vis-nome').value || '').trim().slice(0, 32), cor: temp.cor || 'verde', escudo: temp.escudo || '' };
            visualRacha = v;
            gravar('visual', v);
            aplicarVisual();
            // lista de presença e placar ao vivo abertos já mudam de cara
            if (presencaCodigo) {
                const f = window.firebaseFns;
                f.set(refPresenca('visual'), v).catch(() => {});
                f.set(refPresenca('titulo'), tituloRacha()).catch(() => {});
            }
            publicarAoVivo(false);
            m.remove();
            if (window.Metricas) Metricas.evento('visual_salvo');
            toast('🎨 Pronto! O racha está com a cara nova.');
        };
        desenhar();
    }

    function tituloRacha() {
        if (visualRacha.nome) return visualRacha.nome;
        if (rachaAtivo !== 'principal') return nomeRachaAtivo();
        return (perfil && perfil.apelido) ? 'Racha do ' + perfil.apelido : 'Racha de hoje';
    }

