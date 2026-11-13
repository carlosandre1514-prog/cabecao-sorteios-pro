// =====================================================================
// imagem-times.js — gera uma IMAGEM dos times sorteados para mandar no grupo
// do WhatsApp. O rodapé leva a marca do app: cada imagem enviada é um anúncio.
//
//   ImagemTimes.gerar(times, { titulo, subtitulo }) -> Promise<Blob PNG>
//   ImagemTimes.compartilhar(times, opcoes) -> 'compartilhado' | 'baixado' | 'cancelado'
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
    function carregarLogo() {
        return new Promise(res => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = () => res(null);
            img.src = 'img/icon-192.png';
        });
    }

    async function gerar(times, opcoes) {
        opcoes = opcoes || {};
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
        g.addColorStop(0, 'rgba(45,167,98,0.28)'); g.addColorStop(1, 'rgba(45,167,98,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, 420);

        // cabeçalho
        const logo = await carregarLogo();
        if (logo) ctx.drawImage(logo, M, 52, 110, 110);
        const xt = logo ? M + 136 : M;
        ctx.fillStyle = COR.neon; ctx.font = `800 30px ${FONTE}`;
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
                ctx.fillStyle = FAIXAS[idx % FAIXAS.length]; ctx.fillRect(x, y, larguraCard, 10);
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
                    ctx.fillStyle = j.isGoleiro ? COR.neon : COR.mudo; ctx.font = `700 24px ${FONTE}`;
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

    async function compartilhar(times, opcoes) {
        const blob = await gerar(times, opcoes);
        const nome = 'times-' + new Date().toISOString().slice(0, 10) + '.png';
        let arquivo = null;
        try { arquivo = new File([blob], nome, { type: 'image/png' }); } catch (e) { /* navegador antigo */ }
        if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
            try {
                await navigator.share({ files: [arquivo], text: (opcoes && opcoes.texto) || '⚽ Times de hoje!' });
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

    window.ImagemTimes = { gerar, compartilhar };
})();
