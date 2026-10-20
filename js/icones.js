// =====================================================================
// icones.js — troca os emojis por ícones SVG (mesmo visual da prévia).
// Funciona sozinho: observa a tela e converte qualquer emoji conhecido
// em <svg class="ic ...">. Para mudar um ícone, edite ICN / EM abaixo.
// =====================================================================
(function () {
var ICN={
users:'<circle cx="9" cy="8" r="3.2" fill="currentColor" fill-opacity=".25"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.2" cy="9" r="2.4"/><path d="M16.2 14.2c2.8-.3 5 1.7 5 4.8"/>',
dice:'<rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="currentColor" fill-opacity=".2"/><g fill="currentColor" stroke="none"><circle cx="8.5" cy="8.5" r="1.4"/><circle cx="15.5" cy="8.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="8.5" cy="15.5" r="1.4"/><circle cx="15.5" cy="15.5" r="1.4"/></g>',
trophy:'<path d="M7 3.5h10V9a5 5 0 0 1-10 0z" fill="currentColor" fill-opacity=".25"/><path d="M7 5.5H3.8V8a3.2 3.2 0 0 0 3.4 3.2M17 5.5h3.2V8a3.2 3.2 0 0 1-3.4 3.2M12 14v4M8.5 20.5h7M9.5 18h5"/>',
hist:'<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.2 3.8v4.3h4.3"/><path d="M12 7.5V12l3.2 2"/>',
podium:'<path d="M2.5 21h19"/><rect x="9" y="9" width="6" height="12" rx="1" fill="currentColor" fill-opacity=".28"/><rect x="2.8" y="14" width="5.4" height="7" rx="1"/><rect x="15.8" y="16" width="5.4" height="5" rx="1"/><path d="M12 2.4l1.1 2.2 2.4.4-1.7 1.7.4 2.4L12 8l-2.2 1.1.4-2.4-1.7-1.7 2.4-.4z" fill="currentColor" stroke="none"/>',
m1:'<path d="M8 2.8l2.4 4.4M16 2.8l-2.4 4.4"/><circle cx="12" cy="14.5" r="6" fill="currentColor" fill-opacity=".3"/><text x="12" y="17.3" text-anchor="middle" font-size="8" font-weight="800" fill="currentColor" stroke="none">1</text>',
m2:'<path d="M8 2.8l2.4 4.4M16 2.8l-2.4 4.4"/><circle cx="12" cy="14.5" r="6" fill="currentColor" fill-opacity=".3"/><text x="12" y="17.3" text-anchor="middle" font-size="8" font-weight="800" fill="currentColor" stroke="none">2</text>',
m3:'<path d="M8 2.8l2.4 4.4M16 2.8l-2.4 4.4"/><circle cx="12" cy="14.5" r="6" fill="currentColor" fill-opacity=".3"/><text x="12" y="17.3" text-anchor="middle" font-size="8" font-weight="800" fill="currentColor" stroke="none">3</text>',
ball:'<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".12"/><path d="M12 7.5l3.8 2.8-1.5 4.4H9.7l-1.5-4.4z" fill="currentColor" fill-opacity=".6"/><path d="M12 7.5V3.2M15.8 10.3l4.2-1.4M14.3 14.7l2.5 3.6M9.7 14.7l-2.5 3.6M8.2 10.3L4 8.9"/>',
star:'<path d="M12 2.7l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.4l-5.8 3.1 1.1-6.4L2.6 9.5l6.5-.9z" fill="currentColor" stroke="none"/>',
glove:'<path d="M6.5 21v-4.6L4.2 12.8a1.5 1.5 0 0 1 2.5-1.7L8 12.8V5.4a1.5 1.5 0 0 1 3 0V10V4a1.5 1.5 0 0 1 3 0v6V5a1.5 1.5 0 0 1 3 0v7.5l.9-1.9a1.5 1.5 0 0 1 2.7 1.2L18 17.5V21z" fill="currentColor" fill-opacity=".22"/><path d="M6.5 18.5H18"/>',
edit:'<path d="M4 20l.9-4.1L16 4.8a2.2 2.2 0 0 1 3.2 3.1L8.1 19.1z" fill="currentColor" fill-opacity=".22"/><path d="M14.3 6.5l3.2 3.2M4 20l4.1-.9"/>',
trash:'<path d="M4 7h16M9.5 7V4.5h5V7"/><path d="M6 7l.9 12.5a1.5 1.5 0 0 0 1.5 1.4h7.2a1.5 1.5 0 0 0 1.5-1.4L18 7" fill="currentColor" fill-opacity=".2"/><path d="M10 11v6M14 11v6"/>',
clip:'<rect x="5" y="4.5" width="14" height="17" rx="2.5" fill="currentColor" fill-opacity=".2"/><rect x="8.5" y="2.5" width="7" height="4" rx="1.5"/><path d="M9 11h6M9 14.5h6M9 18h3.5"/>',
rocket:'<path d="M12 2.5c3.5 2.2 5 6 4.2 11H7.8C7 8.5 8.5 4.7 12 2.5z" fill="currentColor" fill-opacity=".25"/><circle cx="12" cy="9.5" r="1.8"/><path d="M7.8 13.5l-3 3.6 3.8-.6M16.2 13.5l3 3.6-3.8-.6M10 17.5c0 1.8.8 3 2 4 1.2-1 2-2.2 2-4"/>',
timer:'<circle cx="12" cy="13.5" r="7.5" fill="currentColor" fill-opacity=".15"/><path d="M12 9.5v4.4l3 1.8M9.5 2.5h5M12 2.5V6M18.2 6.3l1.5-1.5"/>',
play:'<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" fill-opacity=".3"/>',
pause:'<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" fill-opacity=".3"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" fill-opacity=".3"/>',
reset:'<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>',
swords:'<path d="M4 4l9 9M4 4h4.5M4 4v4.5M20 4l-9 9M20 4h-4.5M20 4v4.5M9.5 15.5L6 19M14.5 15.5L18 19M5 17l2 2M19 17l-2 2"/>',
target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
hour:'<path d="M6.5 3h11M6.5 21h11M7.5 3c0 4.5 4.5 5.5 4.5 9s-4.5 4.5-4.5 9M16.5 3c0 4.5-4.5 5.5-4.5 9s4.5 4.5 4.5 9"/>',
check:'<path d="M4.5 12.5l5 5L19.5 7" stroke-width="2.4"/>',
ban:'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
repeat:'<path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3"/>',
dot:'<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
shirt:'<path d="M8.5 3.5L3 6.5l2.2 4 2.3-1V20.5h9V9.5l2.3 1 2.2-4-5.5-3c-.6 1.7-1.9 2.5-3.5 2.5s-2.9-.8-3.5-2.5z" fill="currentColor" fill-opacity=".2"/>',
flag:'<path d="M5 21V3.5M5 4.5h11l-2 4 2 4H5" fill="currentColor" fill-opacity=".25"/>',
plus:'<path d="M12 5v14M5 12h14" stroke-width="2.4"/>',
lock:'<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" fill-opacity=".2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/>',
doc:'<path d="M6 2.5h8l5 5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4.5 20.5V4A1.5 1.5 0 0 1 6 2.5z" fill="currentColor" fill-opacity=".15"/><path d="M14 2.5v5h5M8 12h8M8 15.5h8M8 19h5"/>',
chat:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5 4v-4A2.5 2.5 0 0 1 4 13.5z" fill="currentColor" fill-opacity=".2"/><path d="M8 8.5h8M8 11.5h5"/>',
inbox:'<path d="M3.5 13l2.5-8h12l2.5 8v5.5a1.5 1.5 0 0 1-1.5 1.5h-14a1.5 1.5 0 0 1-1.5-1.5z" fill="currentColor" fill-opacity=".15"/><path d="M3.5 13H8l1 2.5h6l1-2.5h4.5"/>',
logout:'<path d="M9 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9"/>',
cam:'<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="currentColor" fill-opacity=".15"/><circle cx="12" cy="13.5" r="3.5"/>',
eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity=".3"/>',
warn:'<path d="M12 3.5L2.5 20h19z" fill="currentColor" fill-opacity=".2"/><path d="M12 10v4.5M12 17.2v.2"/>',
bolt:'<path d="M13 2.5L4.5 13.5H11L10 21.5l8.5-11H12z" fill="currentColor" fill-opacity=".3"/>',
wifi:'<circle cx="12" cy="18" r="1.4" fill="currentColor"/><path d="M8.5 14.5a5 5 0 0 1 7 0M5.5 11.5a9 9 0 0 1 13 0M2.5 8.5a13 13 0 0 1 19 0"/>'};
var EM={'👥':'users','🔀':'dice','🏆':'trophy','🕘':'hist','🏅':'podium','🥇':'m1','🥈':'m2','🥉':'m3','⚽':'ball','⭐':'star','🧤':'glove','✏️':'edit','🗑️':'trash','📋':'clip','🚀':'rocket','⏱️':'timer','▶️':'play','⏸️':'pause','🔄':'reset','⚔️':'swords','🎯':'target','⏳':'hour','✅':'check','✔':'check','⛔':'ban','🔁':'repeat','🟢':'dot','📜':'doc','👕':'shirt','🏁':'flag','➕':'plus','🔒':'lock','📄':'doc','💬':'chat','📥':'inbox','🚪':'logout','📷':'cam','👁️':'eye','⚠️':'warn','⚡':'bolt','📡':'wifi'};
var EMRE=new RegExp('('+Object.keys(EM).map(function(k){return k.replace(/\uFE0F/g,"")}).join("|")+')\uFE0F?','g');

    var PULAR = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SELECT: 1, TITLE: 1, SVG: 1, TEXT: 1 };

    function svgDe(nome) {
        return '<svg class="ic ' + nome + '" viewBox="0 0 24 24" aria-hidden="true">' + ICN[nome] + '</svg>';
    }

    function converterTexto(no) {
        var t = no.nodeValue;
        if (!t) return;
        var re = new RegExp(EMRE.source, 'g');
        if (!re.test(t)) return;
        re.lastIndex = 0;
        var tpl = document.createElement('template');
        var html = '', ult = 0, m, achou = false;
        var esc = function (x) { return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
        while ((m = re.exec(t))) {
            var nome = EM[m[1]] || EM[m[1] + '\uFE0F'];
            if (!nome) continue;
            achou = true;
            html += esc(t.slice(ult, m.index)) + svgDe(nome);
            ult = m.index + m[0].length;
        }
        if (!achou) return;
        html += esc(t.slice(ult));
        tpl.innerHTML = html;
        if (no.parentNode) no.parentNode.replaceChild(tpl.content, no);
    }

    function varrer(raiz) {
        if (!raiz) return;
        if (raiz.nodeType === 3) {
            var p = raiz.parentNode;
            if (p && !PULAR[String(p.tagName).toUpperCase()] && !(p.closest && p.closest('[data-sem-icone]'))) converterTexto(raiz);
            return;
        }
        if (raiz.nodeType !== 1 || PULAR[String(raiz.tagName).toUpperCase()]) return;
        var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentNode;
                if (!p || PULAR[String(p.tagName).toUpperCase()]) return NodeFilter.FILTER_REJECT;
                if (p.closest && p.closest('svg,[data-sem-icone]')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var lista = [], n;
        while ((n = w.nextNode())) lista.push(n);
        lista.forEach(converterTexto);
    }

    function iniciar() {
        if (typeof document === 'undefined' || !document.body || typeof MutationObserver === 'undefined' || typeof document.createTreeWalker !== 'function') return;
        varrer(document.body);
        var fila = [], agendado = false;
        var rodar = function () {
            agendado = false;
            var itens = fila; fila = [];
            itens.forEach(function (x) { if (x.isConnected !== false) varrer(x); });
        };
        new MutationObserver(function (muts) {
            muts.forEach(function (mu) {
                if (mu.type === 'characterData') fila.push(mu.target);
                else mu.addedNodes.forEach(function (n) { fila.push(n); });
            });
            if (!agendado) { agendado = true; (window.requestAnimationFrame || setTimeout)(rodar); }
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
        else iniciar();
    }
})();
