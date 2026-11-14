// =====================================================================
// imagem-times.js — gera uma IMAGEM dos times sorteados para mandar no grupo
// do WhatsApp. O rodapé leva a marca do app: cada imagem enviada é um anúncio.
//
//   ImagemTimes.gerar(times, { titulo, subtitulo }) -> Promise<Blob PNG>
//   ImagemTimes.compartilhar(times, opcoes) -> 'compartilhado' | 'baixado' | 'cancelado'
//   ImagemTimes.gerarResumo / compartilharResumo(Logica.resumoCampeonato(h), opcoes)
//     -> resumo do racha que acabou: campeão, números, tabela, artilharia e confrontos
// =====================================================================
(function () {
    const COR = {
        fundo: '#0b0e0c', card: '#151a17', linha: 'rgba(255,255,255,0.08)',
        txt: '#e9eeea', mudo: '#98a39a', verde: '#2da762', neon: '#93d54b', ouro: '#ddb43c'
    };
    // uma cor de faixa por time (repete se tiver mais de 8)
    const FAIXAS = ['#2da762', '#ddb43c', '#4f8fe0', '#de5a68', '#a66be0', '#e08a3c', '#3cc4c4', '#e0e0e0'];
    const FONTE = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    const fmt = n => (Number(n) || 0).toFixed(1).replace('.', ',');

    function cortar(ctx, texto, largura) {
        texto = String(texto || '');
        if (ctx.measureText(texto).width <= largura) return texto;
        while (texto.length > 1 && ctx.measureText(texto + '…').width > largura) texto = texto.slice(0, -1);
        return texto + '…';
    }
    function retangulo(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    // escudo do racha (🎨 Personalizar) ou a logo do app
    function carregarLogo(src) {
        return new Promise(res => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = () => res(null);
            img.src = src || 'img/icon-192.png';
        });
    }

    async function gerar(times, opcoes) {
        opcoes = opcoes || {};
        const destaque = (opcoes.cor && opcoes.cor.a) || COR.neon;
        const forte = (opcoes.cor && opcoes.cor.b) || COR.verde;
        times = (times || []).filter(t => t && Array.isArray(t.jogadores));
        const W = 1080, M = 48, GAP = 28;
        const colunas = times.length > 1 ? 2 : 1;
        const larguraCard = (W - M * 2 - GAP * (colunas - 1)) / colunas;
        const ALT_LINHA = 50, TOPO_CARD = 96, BASE_CARD = 28;
        const altCard = t => TOPO_CARD + Math.max(1, t.jogadores.length) * ALT_LINHA + BASE_CARD;

        // altura de cada "linha" da grade = maior card da linha
        const linhas = [];
        for (let i = 0; i < times.length; i += colunas) linhas.push(times.slice(i, i + colunas));
        const altLinhas = linhas.map(l => Math.max(...l.map(altCard)));
        const CAB = 230, RODAPE = 150;
        const H = CAB + altLinhas.reduce((a, b) => a + b, 0) + GAP * Math.max(0, linhas.length - 1) + RODAPE;

        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        // fundo com leve degradê verde no topo
        ctx.fillStyle = COR.fundo; ctx.fillRect(0, 0, W, H);
        const g = ctx.createLinearGradient(0, 0, 0, 420);
        g.addColorStop(0, forte + '55'); g.addColorStop(1, forte + '00');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, 420);

        // cabeçalho
        const logo = await carregarLogo(opcoes.escudo);
        if (logo) ctx.drawImage(logo, M, 52, 110, 110);
        const xt = logo ? M + 136 : M;
        ctx.fillStyle = destaque; ctx.font = `800 30px ${FONTE}`;
        ctx.fillText('TIMES SORTEADOS', xt, 88);
        ctx.fillStyle = COR.txt; ctx.font = `800 54px ${FONTE}`;
        ctx.fillText(cortar(ctx, opcoes.titulo || 'Racha de hoje', W - xt - M), xt, 146);
        ctx.fillStyle = COR.mudo; ctx.font = `500 28px ${FONTE}`;
        ctx.fillText(cortar(ctx, opcoes.subtitulo || new Date().toLocaleDateString('pt-BR'), W - xt - M), xt, 188);

        // cards
        let y = CAB;
        linhas.forEach((linha, li) => {
            linha.forEach((t, ci) => {
                const idx = li * colunas + ci;
                const x = M + ci * (larguraCard + GAP);
                const h = altLinhas[li];
                retangulo(ctx, x, y, larguraCard, h, 22);
                ctx.fillStyle = COR.card; ctx.fill();
                ctx.strokeStyle = COR.linha; ctx.lineWidth = 2; ctx.stroke();
                // faixa de cor do time
                ctx.save(); retangulo(ctx, x, y, larguraCard, h, 22); ctx.clip();
                ctx.fillStyle = idx === 0 && opcoes.cor ? forte : FAIXAS[idx % FAIXAS.length]; ctx.fillRect(x, y, larguraCard, 10);
                ctx.restore();

                const media = t.jogadores.length ? (t.somaEstrelas != null ? t.somaEstrelas : t.jogadores.reduce((a, j) => a + (Number(j.estrelas) || 3), 0)) / t.jogadores.length : 0;
                ctx.fillStyle = COR.txt; ctx.font = `800 36px ${FONTE}`;
                ctx.fillText(cortar(ctx, t.nome || ('Time ' + (idx + 1)), larguraCard - 190), x + 26, y + 64);
                ctx.fillStyle = COR.ouro; ctx.font = `700 26px ${FONTE}`;
                const tm = '★ ' + fmt(media);
                ctx.fillText(tm, x + larguraCard - 26 - ctx.measureText(tm).width, y + 62);

                let numero = 0;   // goleiro aparece como "GOL"; os de linha contam 1, 2, 3...
                t.jogadores.forEach((j, k) => {
                    if (!j.isGoleiro) numero++;
                    const yl = y + TOPO_CARD + k * ALT_LINHA + 30;
                    if (k > 0) { ctx.fillStyle = COR.linha; ctx.fillRect(x + 26, yl - 36, larguraCard - 52, 2); }
                    ctx.fillStyle = j.isGoleiro ? destaque : COR.mudo; ctx.font = `700 24px ${FONTE}`;
                    ctx.fillText(j.isGoleiro ? 'GOL' : String(numero), x + 26, yl);
                    ctx.fillStyle = COR.txt; ctx.font = `600 30px ${FONTE}`;
                    ctx.fillText(cortar(ctx, j.nome, larguraCard - 110), x + 84, yl);
                });
                if (!t.jogadores.length) {
                    ctx.fillStyle = COR.mudo; ctx.font = `500 26px ${FONTE}`;
                    ctx.fillText('Sem jogadores', x + 26, y + TOPO_CARD + 30);
                }
            });
            y += altLinhas[li] + GAP;
        });

        // rodapé com a marca (o "anúncio" grátis)
        const yr = H - RODAPE + 40;
        ctx.fillStyle = COR.linha; ctx.fillRect(M, yr - 10, W - M * 2, 2);
        ctx.fillStyle = COR.txt; ctx.font = `800 32px ${FONTE}`;
        const marca = '⚽ Sorteado com Cabeção Sorteios Pro';
        ctx.fillText(marca, (W - ctx.measureText(marca).width) / 2, yr + 46);
        ctx.fillStyle = COR.mudo; ctx.font = `500 24px ${FONTE}`;
        const conv = opcoes.convite || 'Times equilibrados por estrelas · placar e artilharia ao vivo';
        ctx.fillText(conv, (W - ctx.measureText(conv).width) / 2, yr + 86);

        return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Falha ao gerar a imagem')), 'image/png'));
    }

    // ---------- RESUMO DO RACHA (depois do fim): campeão, tabela, artilharia, confrontos ----------
    // r = Logica.resumoCampeonato(itemDoHistorico)
    async function gerarResumo(r, opcoes) {
        opcoes = opcoes || {};
        const destaque = (opcoes.cor && opcoes.cor.a) || COR.neon;
        const W = 1080, M = 48, IN = 30;            // margem da página e de dentro dos cards
        const CW = W - M * 2;
        const MAX_JOGOS = 40;
        const jogos = r.jogos.slice(0, MAX_JOGOS);
        const arts = r.artilharia.slice(0, 10);
        const campeaoTime = r.times.find(t => t.nome === r.campeao);

        // alturas das seções
        const H_CAB = 230;
        const H_CAMP = r.campeao ? 210 + (campeaoTime && campeaoTime.jogadores.length ? 44 : 0) : 0;
        const H_NUM = 150;
        const secao = n => n ? 92 + n * 52 + 20 : 0;
        const H_TAB = secao(r.classificacao.length) + (r.classificacao.length ? 44 : 0);
        const H_ART = secao(arts.length);
        const H_JOG = secao(jogos.length) + (r.jogos.length > MAX_JOGOS ? 50 : 0);
        const RODAPE = 150, GAP = 28;
        const blocos = [H_CAMP, H_NUM, H_TAB, H_ART, H_JOG].filter(Boolean);
        const H = H_CAB + blocos.reduce((a, b) => a + b, 0) + GAP * blocos.length + RODAPE;

        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = COR.fundo; ctx.fillRect(0, 0, W, H);
        const g = ctx.createLinearGradient(0, 0, 0, 480);
        g.addColorStop(0, 'rgba(221,180,60,0.22)'); g.addColorStop(1, 'rgba(221,180,60,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, 480);

        // cabeçalho
        const logo = await carregarLogo(opcoes.escudo);
        if (logo) ctx.drawImage(logo, M, 52, 110, 110);
        const xt = logo ? M + 136 : M;
        ctx.fillStyle = COR.ouro; ctx.font = `800 30px ${FONTE}`;
        ctx.fillText('RESULTADO DO RACHA', xt, 88);
        ctx.fillStyle = COR.txt; ctx.font = `800 54px ${FONTE}`;
        ctx.fillText(cortar(ctx, opcoes.titulo || 'Racha de hoje', W - xt - M), xt, 146);
        ctx.fillStyle = COR.mudo; ctx.font = `500 28px ${FONTE}`;
        ctx.fillText(cortar(ctx, [r.data, r.modo].filter(Boolean).join(' · '), W - xt - M), xt, 188);

        let y = H_CAB;
        const card = (h, borda) => {
            retangulo(ctx, M, y, CW, h, 22);
            ctx.fillStyle = COR.card; ctx.fill();
            ctx.strokeStyle = borda || COR.linha; ctx.lineWidth = 2; ctx.stroke();
        };
        const tituloSecao = (t) => {
            ctx.fillStyle = COR.txt; ctx.font = `800 34px ${FONTE}`;
            ctx.fillText(t, M + IN, y + 62);
        };
        const direita = (txt, x, yy) => ctx.fillText(txt, x - ctx.measureText(txt).width, yy);

        // campeão
        if (H_CAMP) {
            card(H_CAMP, 'rgba(221,180,60,0.55)');
            ctx.save(); retangulo(ctx, M, y, CW, H_CAMP, 22); ctx.clip();
            const gc = ctx.createLinearGradient(M, y, M + CW, y + H_CAMP);
            gc.addColorStop(0, 'rgba(221,180,60,0.25)'); gc.addColorStop(1, 'rgba(221,180,60,0.04)');
            ctx.fillStyle = gc; ctx.fillRect(M, y, CW, H_CAMP);
            ctx.restore();
            ctx.font = `400 96px ${FONTE}`;
            ctx.fillText('🏆', M + IN, y + 140);
            ctx.fillStyle = COR.ouro; ctx.font = `800 28px ${FONTE}`;
            ctx.fillText('CAMPEÃO', M + IN + 130, y + 78);
            ctx.fillStyle = COR.txt; ctx.font = `800 64px ${FONTE}`;
            ctx.fillText(cortar(ctx, r.campeao, CW - IN * 2 - 130), M + IN + 130, y + 148);
            const c0 = r.classificacao[0];
            ctx.fillStyle = COR.mudo; ctx.font = `600 26px ${FONTE}`;
            if (c0) ctx.fillText(`${c0.p} pts · ${c0.v} vitórias · saldo ${c0.sg}`, M + IN + 130, y + 188);
            if (campeaoTime && campeaoTime.jogadores.length) {
                ctx.fillStyle = COR.txt; ctx.font = `500 26px ${FONTE}`;
                ctx.fillText(cortar(ctx, campeaoTime.jogadores.join(', '), CW - IN * 2), M + IN, y + 236);
            }
            y += H_CAMP + GAP;
        }

        // números
        const nums = [[r.totalJogos, 'jogos'], [r.totalGols, 'gols'], [String(r.mediaGols).replace('.', ','), 'gols por jogo']];
        const tw = (CW - GAP * 2) / 3;
        nums.forEach(([n, rot], i) => {
            const x = M + i * (tw + GAP);
            retangulo(ctx, x, y, tw, H_NUM, 20); ctx.fillStyle = COR.card; ctx.fill();
            ctx.strokeStyle = COR.linha; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = destaque; ctx.font = `800 58px ${FONTE}`;
            const t = String(n); ctx.fillText(t, x + (tw - ctx.measureText(t).width) / 2, y + 80);
            ctx.fillStyle = COR.mudo; ctx.font = `600 24px ${FONTE}`;
            ctx.fillText(rot, x + (tw - ctx.measureText(rot).width) / 2, y + 120);
        });
        y += H_NUM + GAP;

        // classificação
        if (H_TAB) {
            card(H_TAB); tituloSecao('📊 Classificação');
            const cols = [['P', 0], ['J', 1], ['V', 2], ['E', 3], ['D', 4], ['SG', 5]];
            const xCol = i => M + CW - IN - (5 - i) * 74;
            ctx.fillStyle = COR.mudo; ctx.font = `700 22px ${FONTE}`;
            cols.forEach(([t, i]) => direita(t, xCol(i), y + 118));
            r.classificacao.forEach((c, k) => {
                const yl = y + 118 + 44 + k * 52;
                if (k === 0) { ctx.fillStyle = 'rgba(221,180,60,0.10)'; ctx.fillRect(M + 12, yl - 36, CW - 24, 50); }
                ctx.fillStyle = k === 0 ? COR.ouro : COR.mudo; ctx.font = `800 26px ${FONTE}`;
                ctx.fillText(String(k + 1), M + IN, yl);
                ctx.fillStyle = COR.txt; ctx.font = `700 28px ${FONTE}`;
                ctx.fillText(cortar(ctx, c.nome, xCol(0) - 70 - (M + IN + 44)), M + IN + 44, yl);
                [c.p, c.j, c.v, c.e, c.d, c.sg].forEach((v, i) => {
                    ctx.fillStyle = i === 0 ? COR.txt : COR.mudo; ctx.font = `${i === 0 ? 800 : 600} 26px ${FONTE}`;
                    direita(String(v), xCol(i), yl);
                });
            });
            y += H_TAB + GAP;
        }

        // artilharia
        if (H_ART) {
            card(H_ART); tituloSecao('⚽ Artilharia');
            const med = ['🥇', '🥈', '🥉'];
            arts.forEach((a, k) => {
                const yl = y + 92 + 40 + k * 52;
                if (k > 0) { ctx.fillStyle = COR.linha; ctx.fillRect(M + IN, yl - 38, CW - IN * 2, 2); }
                ctx.fillStyle = COR.mudo; ctx.font = `700 26px ${FONTE}`;
                ctx.fillText(med[k] || String(k + 1), M + IN, yl);
                ctx.fillStyle = COR.txt; ctx.font = `${k < 3 ? 700 : 500} 28px ${FONTE}`;
                ctx.fillText(cortar(ctx, a.nome, CW - IN * 2 - 220), M + IN + 56, yl);
                ctx.fillStyle = k === 0 ? COR.ouro : COR.txt; ctx.font = `800 28px ${FONTE}`;
                direita(a.gols + (a.gols === 1 ? ' gol' : ' gols'), M + CW - IN, yl);
            });
            y += H_ART + GAP;
        }

        // confrontos
        if (H_JOG) {
            card(H_JOG); tituloSecao('⚔️ Confrontos');
            const xm = M + CW / 2 + 60;   // centro do placar
            jogos.forEach((j, k) => {
                const yl = y + 92 + 40 + k * 52;
                if (k > 0) { ctx.fillStyle = COR.linha; ctx.fillRect(M + IN, yl - 38, CW - IN * 2, 2); }
                ctx.fillStyle = COR.mudo; ctx.font = `600 22px ${FONTE}`;
                ctx.fillText(j.rotulo.replace('Rodada ', 'R').replace('Jogo ', 'J'), M + IN, yl);
                const venceuA = j.ga > j.gb, venceuB = j.gb > j.ga;
                ctx.font = `${venceuA ? 800 : 500} 26px ${FONTE}`; ctx.fillStyle = venceuA ? COR.txt : COR.mudo;
                direita(cortar(ctx, j.a, xm - 70 - (M + IN + 70)), xm - 62, yl);
                ctx.fillStyle = COR.txt; ctx.font = `800 28px ${FONTE}`;
                const pl = j.ga + ' x ' + j.gb; ctx.fillText(pl, xm - ctx.measureText(pl).width / 2, yl);
                ctx.font = `${venceuB ? 800 : 500} 26px ${FONTE}`; ctx.fillStyle = venceuB ? COR.txt : COR.mudo;
                const larguraB = M + CW - IN - (xm + 62) - (j.extra ? 150 : 0);
                ctx.fillText(cortar(ctx, j.b, larguraB), xm + 62, yl);
                if (j.extra) { ctx.fillStyle = COR.ouro; ctx.font = `600 20px ${FONTE}`; direita(cortar(ctx, j.extra, 145), M + CW - IN, yl); }
            });
            if (r.jogos.length > MAX_JOGOS) {
                ctx.fillStyle = COR.mudo; ctx.font = `600 24px ${FONTE}`;
                ctx.fillText(`+ ${r.jogos.length - MAX_JOGOS} jogos (veja no app)`, M + IN, y + H_JOG - 30);
            }
            y += H_JOG + GAP;
        }

        // rodapé
        const yr = H - RODAPE + 40;
        ctx.fillStyle = COR.linha; ctx.fillRect(M, yr - 10, CW, 2);
        ctx.fillStyle = COR.txt; ctx.font = `800 32px ${FONTE}`;
        const marca = '⚽ Feito com Cabeção Sorteios Pro';
        ctx.fillText(marca, (W - ctx.measureText(marca).width) / 2, yr + 46);
        ctx.fillStyle = COR.mudo; ctx.font = `500 24px ${FONTE}`;
        const conv = 'Sorteio equilibrado · placar, tabela e artilharia ao vivo';
        ctx.fillText(conv, (W - ctx.measureText(conv).width) / 2, yr + 86);

        return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Falha ao gerar a imagem')), 'image/png'));
    }

    async function compartilhar(times, opcoes) {
        return enviarImagem(await gerar(times, opcoes), 'times', (opcoes && opcoes.texto) || '⚽ Times de hoje!');
    }
    async function compartilharResumo(r, opcoes) {
        return enviarImagem(await gerarResumo(r, opcoes), 'resultado', (opcoes && opcoes.texto) || '🏁 Resultado do racha!');
    }

    async function enviarImagem(blob, prefixo, texto) {
        const nome = prefixo + '-' + new Date().toISOString().slice(0, 10) + '.png';
        let arquivo = null;
        try { arquivo = new File([blob], nome, { type: 'image/png' }); } catch (e) { /* navegador antigo */ }
        if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
            try {
                await navigator.share({ files: [arquivo], text: texto });
                return 'compartilhado';
            } catch (e) {
                if (e && e.name === 'AbortError') return 'cancelado';
            }
        }
        // sem suporte a compartilhar arquivo: baixa a imagem
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nome;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return 'baixado';
    }

    window.ImagemTimes = { gerar, compartilhar, gerarResumo, compartilharResumo };
})();
