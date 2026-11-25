/* 10 Move Intelligence — workspace de exploração territorial (Leaflet)
   -------------------------------------------------------------------------
   POR QUE DEIXOU DE SER SVG

   A versão anterior desenhava polígonos projetados em build dentro de um
   <svg> com transform. Aquilo dava conta de um coroplético, mas não do que
   o produto passou a exigir:

     · contexto urbano no nível da cidade — ruas, avenidas, parques. Não há
       como desenhar isso a partir de malha administrativa;
     · raio de cobertura em metros reais. Em SVG era conversão aproximada
       feita na mão, válida só perto dos paralelos padrão;
     · seleção confiável. O handler lia ev.target.closest('[data-id]'), e o
       setPointerCapture usado no arraste fazia o clique derivado chegar com
       o <svg> como alvo: closest devolvia null e o clique morria. Era esse
       o motivo de os estados "não obedecerem".

   Leaflet resolve os três de origem — tiles de basemap, L.circle em metros
   e hit-testing próprio por feição. São 147 KB do cdnjs, que a CSP já
   permitia para script.

   BASEMAP E LICENÇA

   Tiles CARTO Positron sobre dados do OpenStreetMap, sem chave e com
   atribuição obrigatória, exibida no mapa. O cinza claro é deliberado:
   deixa a cor do dado dominar em vez de competir com ela. Para uso
   comercial intenso o correto é contratar um provedor; a URL fica em
   MI.MAPA_TILES para trocar sem tocar no código.

   O basemap só liga no nível municipal. Nos níveis Brasil e estado ele não
   acrescenta nada e atrapalha a leitura do coroplético.

   O MAPA NÃO É RECRIADO A CADA RENDER. Recriar perderia o zoom, piscaria a
   tela e recarregaria tiles à toa — e foi justamente o que fazia as camadas
   ligadas voltarem ao padrão a cada clique.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const el = MI.el;
  const W = {};

  const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
  const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
  const CLUSTER_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js';
  const CLUSTER_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css';

  /* OpenStreetMap padrão: gratuito, sem chave, atribuição obrigatória — que
     o mapa exibe. A primeira escolha foi o CARTO Positron, cinza e mais
     elegante, mas hoje ele devolve uma tile de aviso de 2 KB sem chave de
     API em vez do mapa; trocar foi questão de verificar o que chega, não de
     preferência estética.

     A política de uso de tiles da OSMF admite volume modesto e pede
     identificação do cliente. Operação comercial intensa exige provedor
     contratado ou servidor próprio — e aí basta trocar esta URL. */
  MI.MAPA_TILES = MI.MAPA_TILES || {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribuicao: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    subdominios: undefined
  };

  const BRASIL = [[-33.9, -74.0], [5.3, -34.0]];

  const COD_UF = {
    '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
    '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
    '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
    '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF'
  };

  /* Preferências de leitura, fora do ciclo de render. */
  const PREF = { metrica: 'clientes', unidades: true, cobertura: false, sobreposicao: false, coropletico: true };

  const M = {
    pronto: false, mapa: null, raiz: null, ctx: null,
    camadaTiles: null, territorio: null, cobertura: null, unidades: null,
    porChave: null, geo: null
  };

  let cacheCss = {};
  function css(nome) {
    if (cacheCss[nome]) return cacheCss[nome];
    const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    cacheCss[nome] = v || '#888';
    return cacheCss[nome];
  }
  W.esquecerCores = function () { cacheCss = {}; };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------- Biblioteca ---------------- */
  let carregandoLib = null;
  W.carregarLib = function () {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (carregandoLib) return carregandoLib;
    carregandoLib = new Promise(function (resolve, reject) {
      const css2 = document.createElement('link');
      css2.rel = 'stylesheet'; css2.href = LEAFLET_CSS;
      document.head.appendChild(css2);
      const s = document.createElement('script');
      s.src = LEAFLET_JS;
      s.onload = function () {
        /* o agrupamento é um extra: se falhar, o mapa segue com marcadores
           soltos em vez de não abrir */
        const c1 = document.createElement('link');
        c1.rel = 'stylesheet'; c1.href = CLUSTER_CSS;
        document.head.appendChild(c1);
        const c2 = document.createElement('script');
        c2.src = CLUSTER_JS;
        c2.onload = function () { resolve(window.L); };
        c2.onerror = function () { console.warn('Agrupamento de marcadores indisponível.'); resolve(window.L); };
        document.head.appendChild(c2);
      };
      s.onerror = function () { reject(new Error('Não foi possível carregar a biblioteca de mapas.')); };
      document.head.appendChild(s);
    });
    return carregandoLib;
  };

  /* ---------------- Contexto territorial ----------------
     População, densidade e renda do IBGE. São atributos do TERRITÓRIO, não
     dos clientes da Smoov que moram nele — a dica e a legenda dizem isso,
     porque atribuir a renda média do município a um cliente seria inventar
     o dado. Carrega sob demanda: 283 KB que só quem liga a camada paga. */
  let carregandoCtx = null;
  W.carregarContexto = function () {
    if (MI.CONTEXTO_MUN) return Promise.resolve(MI.CONTEXTO_MUN);
    if (carregandoCtx) return carregandoCtx;
    carregandoCtx = new Promise(function (resolve, reject) {
      const v = (function () {
        try {
          const t = document.querySelector('script[src*="core.js?v="]');
          return t ? (t.getAttribute('src').split('?v=')[1] || '') : '';
        } catch (e) { return ''; }
      })();
      const s2 = document.createElement('script');
      s2.src = 'assets/geo/contexto-municipios.js' + (v ? '?v=' + v : '');
      s2.onload = function () { MI.CONTEXTO_MUN ? resolve(MI.CONTEXTO_MUN) : reject(new Error('Contexto vazio.')); };
      s2.onerror = function () { reject(new Error('Não foi possível carregar o contexto territorial.')); };
      document.head.appendChild(s2);
    }).catch(function (e) { carregandoCtx = null; throw e; });
    return carregandoCtx;
  };

  /* Agregado por UF, somado a partir dos municípios: população soma,
     densidade é razão de somas, e renda é média ponderada pela população —
     média simples entre municípios daria o mesmo peso a uma capital e a um
     vilarejo. */
  function contextoPorUf() {
    const C = MI.CONTEXTO_MUN;
    if (!C) return null;
    if (C._porUf) return C._porUf;
    const acc = {};
    Object.keys(C.dados).forEach(function (cod) {
      const d = C.dados[cod];
      const uf = COD_UF[cod.slice(0, 2)];
      if (!uf) return;
      const a = acc[uf] = acc[uf] || { pop: 0, area: 0, rendaPeso: 0, pesoRenda: 0 };
      if (d.pop != null) a.pop += d.pop;
      if (d.pop != null && d.dens) a.area += d.pop / d.dens;
      if (d.renda != null && d.pop != null) { a.rendaPeso += d.renda * d.pop; a.pesoRenda += d.pop; }
    });
    const out = {};
    Object.keys(acc).forEach(function (uf) {
      const a = acc[uf];
      out[uf] = {
        pop: a.pop,
        dens: a.area ? a.pop / a.area : null,
        renda: a.pesoRenda ? a.rendaPeso / a.pesoRenda : null
      };
    });
    C._porUf = out;
    return out;
  }

  /* Valor de contexto de uma feição, seja UF ou município. */
  function valorContexto(f, campo, nivel) {
    if (!MI.CONTEXTO_MUN) return null;
    if (nivel === 'brasil') {
      const t = contextoPorUf();
      const d = t && t[f.properties.uf];
      return d ? d[campo] : null;
    }
    const d = MI.CONTEXTO_MUN.dados[String(f.properties.cod)];
    return d ? d[campo] : null;
  }

  /* ---------------- Métricas e agregação ---------------- */
  function metricas() {
    const st = MI.store;
    const m = [{
      id: 'clientes', rotulo: 'Clientes', unidade: 'registros',
      valor: function (a) { return a.n; }, fmt: function (v) { return MI.fmt.int(v); }
    }];
    if (st.has('_receita')) m.push({
      id: 'receita', rotulo: 'Receita', unidade: 'R$ acumulados',
      valor: function (a) { return a.receita; }, fmt: function (v) { return MI.fmt.money(v); }
    });
    if (st.has('_valor')) m.push({
      id: 'ticket', rotulo: 'Ticket médio', unidade: 'R$ por cliente',
      valor: function (a) { return a.comValor ? a.valor / a.comValor : 0; }, fmt: function (v) { return MI.fmt.money(v); }
    });
    /* Contexto do território, separado das métricas de cliente pelo rótulo
       e pela origem — não se mistura dado da Smoov com dado do IBGE. */
    m.push({
      id: 'populacao', rotulo: 'População (IBGE)', unidade: 'pessoas residentes',
      territorial: 'pop', fmt: function (v) { return MI.fmt.int(v); }
    });
    m.push({
      id: 'densidade', rotulo: 'Densidade (IBGE)', unidade: 'habitantes por km²',
      territorial: 'dens', fmt: function (v) { return MI.fmt.dec(v, 1); }
    });
    m.push({
      id: 'renda', rotulo: 'Renda do trabalho (IBGE)', unidade: 'R$ médios por ocupado',
      territorial: 'renda', fmt: function (v) { return MI.fmt.money(v); }
    });
    return m;
  }

  /* Suprimido não é o mesmo que sem registro: um some por proteção, o outro
     por ausência, e o mapa precisa distinguir os dois. */
  function agregar(rows, campo) {
    const k = MI.privacy.k, mascarar = MI.privacy.masking();
    const m = new Map();
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][campo];
      if (v == null || v === '') continue;
      let o = m.get(v);
      if (!o) { o = { n: 0, receita: 0, valor: 0, comValor: 0 }; m.set(v, o); }
      o.n++;
      const rec = rows[i]._receita;
      if (typeof rec === 'number' && isFinite(rec)) o.receita += rec;
      const val = rows[i]._valor;
      if (typeof val === 'number' && isFinite(val)) { o.valor += val; o.comValor++; }
    }
    let suprimidos = 0, grupos = 0;
    m.forEach(function (o) {
      o.suprimido = mascarar && o.n < k;
      if (o.suprimido) { suprimidos += o.n; grupos++; }
    });
    return { por: m, k: k, suprimidos: suprimidos, gruposSuprimidos: grupos };
  }

  /* ---------------- Esqueleto ---------------- */
  function montar() {
    const raiz = el('div', { class: 'geo' });
    const mapaEl = el('div', { class: 'geo__mapa' });
    const palco = el('div', { class: 'geo__palco' }, mapaEl);
    const legenda = el('div', { class: 'geo__legenda' });
    palco.appendChild(legenda);

    const trilha = el('nav', { class: 'geo__trilha', 'aria-label': 'Nível territorial' });
    const busca = el('input', { class: 'geo__busca', type: 'search', placeholder: 'Buscar lugar…', 'aria-label': 'Buscar no mapa' });
    const sugestoes = el('div', { class: 'geo__sugestoes', hidden: true });
    const seletor = el('select', { class: 'geo__metrica', 'aria-label': 'Métrica representada' });
    const camadas = el('div', { class: 'geo__camadas' });
    const alternaPainel = el('button', {
      class: 'geo__camada-btn is-on', type: 'button', title: 'Mostrar ou esconder o painel',
      onclick: function () {
        const fechado = M.raiz.classList.toggle('is-sem-painel');
        alternaPainel.classList.toggle('is-on', !fechado);
        setTimeout(function () { if (M.mapa) { M.mapa.invalidateSize(); agendarRotulos(); } }, 220);
      }
    }, 'Painel');

    const barra = el('header', { class: 'geo__barra' }, [
      trilha,
      el('div', { class: 'geo__barra-dir' }, [camadas, el('div', { class: 'geo__campo' }, [busca, sugestoes]), seletor, alternaPainel])
    ]);

    const painel = el('aside', { class: 'geo__painel' });
    raiz.appendChild(barra);
    raiz.appendChild(el('div', { class: 'geo__corpo' }, [palco, painel]));

    Object.assign(M, { raiz: raiz, mapaEl: mapaEl, palco: palco, legenda: legenda, trilha: trilha, busca: busca, sugestoes: sugestoes, seletor: seletor, camadasEl: camadas, painel: painel });

    seletor.addEventListener('change', function () {
      PREF.metrica = seletor.value;
      const m = metricas().filter(function (x) { return x.id === PREF.metrica; })[0];
      if (m && m.territorial && !MI.CONTEXTO_MUN) {
        seletor.disabled = true;
        W.carregarContexto()
          .catch(function (e) { MI.toast(e.message || String(e), 'error'); PREF.metrica = 'clientes'; })
          .then(function () { seletor.disabled = false; if (M.ctx) W.aplicar(M.ctx); });
        return;
      }
      if (M.ctx) W.aplicar(M.ctx);
    });
    busca.addEventListener('input', function () { buscar(); });
    busca.addEventListener('blur', function () { setTimeout(function () { sugestoes.hidden = true; }, 160); });
    return raiz;
  }

  function criarMapa(L) {
    const mapa = L.map(M.mapaEl, {
      zoomControl: false, attributionControl: true, preferCanvas: true,
      zoomSnap: 0.25, minZoom: 3, maxZoom: 18, worldCopyJump: false
    });
    mapa.attributionControl.setPrefix('');
    L.control.zoom({ position: 'topright', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(mapa);
    L.control.scale({ position: 'bottomright', imperial: false }).addTo(mapa);

    /* Reset e tela cheia existiam na versão anterior e sumiram na
       reconstrução. Voltam como controles do próprio Leaflet, para ficarem
       na mesma coluna do zoom em vez de competir noutro canto. */
    const Extra = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        const d = L.DomUtil.create('div', 'leaflet-bar geo-extra');
        const faz = function (rotulo, titulo, fn) {
          const a = L.DomUtil.create('a', '', d);
          a.href = '#'; a.title = titulo; a.setAttribute('role', 'button');
          a.setAttribute('aria-label', titulo);
          a.innerHTML = rotulo;
          L.DomEvent.on(a, 'click', function (e) { L.DomEvent.stop(e); fn(); });
          return a;
        };
        faz('⟲', 'Voltar ao enquadramento do nível', function () {
          if (M.ctx && M.ctx.enquadrarEm) enquadrar(M.ctx.enquadrarEm);
        });
        faz('⛶', 'Tela cheia', function () {
          const alvo = M.raiz;
          if (document.fullscreenElement) document.exitFullscreen();
          else if (alvo && alvo.requestFullscreen) alvo.requestFullscreen();
          setTimeout(function () { if (M.mapa) M.mapa.invalidateSize(); agendarRotulos(); }, 260);
        });
        return d;
      }
    });
    mapa.addControl(new Extra());

    /* ordem explícita: território embaixo, cobertura no meio, loja por cima */
    mapa.createPane('territorio').style.zIndex = 400;
    mapa.createPane('cobertura').style.zIndex = 450;
    mapa.createPane('unidades').style.zIndex = 600;

    M.territorio = L.layerGroup([], { pane: 'territorio' }).addTo(mapa);
    M.cobertura = L.layerGroup([], { pane: 'cobertura' }).addTo(mapa);
    /* Agrupar só faz sentido longe: de perto, duas lojas a dois quarteirões
       uma da outra precisam aparecer separadas, que é justamente quando a
       sobreposição de cobertura interessa. */
    M.unidades = L.markerClusterGroup
      ? L.markerClusterGroup({
        clusterPane: 'unidades',
        disableClusteringAtZoom: 12,
        maxClusterRadius: 48,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: function (cluster) {
          const n = cluster.getChildCount();
          return L.divIcon({
            html: '<span>' + n + '</span>',
            className: 'geo-cluster' + (n > 9 ? ' is-grande' : ''),
            iconSize: [34, 34]
          });
        }
      }).addTo(mapa)
      : L.layerGroup([], { pane: 'unidades' }).addTo(mapa);
    mapa.on('zoomend moveend', function () { agendarRotulos(); });

    M.mapa = mapa;
    M.pronto = true;
    return mapa;
  }

  function basemap(ligar) {
    const L = window.L;
    if (ligar && !M.camadaTiles) {
      M.camadaTiles = L.tileLayer(MI.MAPA_TILES.url, {
        attribution: MI.MAPA_TILES.atribuicao, maxZoom: MI.MAPA_TILES.maxZoom,
        subdomains: MI.MAPA_TILES.subdominios || 'abc'
      }).addTo(M.mapa);
      M.camadaTiles.bringToBack();
    } else if (!ligar && M.camadaTiles) {
      M.mapa.removeLayer(M.camadaTiles);
      M.camadaTiles = null;
    }
  }

  /* ---------------- Território ---------------- */
  function estilo(f, ctx, destaque) {
    const sel = ctx.selecionado && ctx.chave(f) === ctx.selecionado;
    const terr = ctx.metrica.territorial;
    const a = f._ag;
    const semDado = terr ? (f._terr == null) : !a;
    const sup = !terr && a && a.suprimido;
    let fill;
    if (!PREF.coropletico || semDado) fill = css('--geo-vazio');
    else if (sup) fill = css('--geo-sup');
    else fill = MI.geo.scale(ctx.max ? 0.14 + (f._v / ctx.max) * 0.86 : 0.14);
    return {
      color: sel ? css('--accent-strong') : (destaque ? css('--text') : css('--surface')),
      weight: sel ? 3 : (destaque ? 2.2 : 0.7),
      opacity: 1,
      fillColor: fill,
      fillOpacity: ctx.nivel === 'municipio' ? 0.12 : (semDado ? 0.5 : 0.85)
    };
  }

  function dica(f, ctx) {
    const a = f._ag;
    const l = ['<strong>' + esc(f.properties.nome) + '</strong>'];
    if (ctx.metrica.territorial) {
      l.push('<span class="geo-dica__ibge">' + esc(ctx.metrica.rotulo.replace(' (IBGE)', '')) + ': ' +
        (f._terr == null ? 'sem dado' : ctx.metrica.fmt(f._terr)) + ' · IBGE 2022</span>');
    }
    if (!a) l.push('<span>Sem clientes no recorte</span>');
    else if (a.suprimido) l.push('<span>Suprimido: menos de ' + ctx.ag.k + ' registros</span>');
    else {
      l.push('<span>' + MI.fmt.int(a.n) + ' clientes · ' + MI.fmt.pctOf(a.n, ctx.total, 1) + ' do recorte</span>');
      if (MI.store.has('_receita')) l.push('<span>Receita ' + MI.fmt.money(a.receita) + '</span>');
      if (a.comValor) l.push('<span>Ticket ' + MI.fmt.money(a.valor / a.comValor) + '</span>');
    }
    const n = ctx.unidadesPorChave[ctx.chave(f)];
    if (n) l.push('<span class="geo-dica__u">' + n + (n === 1 ? ' unidade Smoov' : ' unidades Smoov') + '</span>');
    return l.join('');
  }

  function desenharTerritorio(ctx) {
    const L = window.L;
    M.territorio.clearLayers();
    M.porChave = {};
    if (!ctx.feicoes) return;

    const terr = ctx.metrica.territorial;
    let max = 0;
    ctx.feicoes.features.forEach(function (f) {
      const a = ctx.ag.por.get(ctx.chave(f));
      f._ag = a || null;
      f._terr = terr ? valorContexto(f, terr, ctx.nivel) : null;
      /* Numa métrica do IBGE não há supressão a aplicar: é dado público do
         território, não contagem de cliente. */
      f._v = terr ? (f._terr || 0) : (a && !a.suprimido ? ctx.metrica.valor(a) : 0);
      if (f._v > max) max = f._v;
    });
    ctx.max = max;

    const camada = L.geoJSON(ctx.feicoes, {
      pane: 'territorio',
      style: function (f) { return estilo(f, ctx, false); },
      onEachFeature: function (f, layer) {
        const chave = ctx.chave(f);
        M.porChave[chave] = layer;
        layer.bindTooltip(function () { return dica(f, ctx); },
          { sticky: true, direction: 'top', opacity: 1, className: 'geo-dica' });
        layer.on('mouseover', function () { layer.setStyle(estilo(f, ctx, true)); });
        layer.on('mouseout', function () { layer.setStyle(estilo(f, ctx, false)); });
        /* Seleciona sempre, inclusive sem registro: ausência de dado não
           pode impedir a navegação territorial. */
        layer.on('click', function (ev) {
          if (ev.originalEvent) L.DomEvent.stop(ev.originalEvent);
          if (ctx.aoSelecionar) ctx.aoSelecionar(chave, f);
        });
      }
    });
    M.territorio.addLayer(camada);
    M.geo = camada;
    agendarRotulos();
  }

  /* ---------------- Rótulos no mapa ----------------
     A reconstrução em Leaflet tinha deixado o mapa SEM NOME NENHUM: só
     polígonos coloridos e dica no hover. Identificar um estado virava
     adivinhação, e isso custou mais do que o basemap trouxe.

     Voltam como tooltips permanentes, que o Leaflet já posiciona e
     reposiciona sozinho no pan e no zoom — e que não interceptam clique,
     porque tooltip do Leaflet nasce com pointer-events desligado.

     A poda é por colisão real: mede-se a caixa desenhada e esconde-se quem
     chega depois, em ordem de relevância. Nenhum rótulo é escrito sobre um
     polígono pequeno demais para ele. */
  const MAX_ROTULOS = 16;

  function limparRotulos() {
    if (!M.porChave) return;
    Object.keys(M.porChave).forEach(function (k) {
      const l = M.porChave[k];
      if (l && l._rotuloAtivo) { l.unbindTooltip(); l._rotuloAtivo = false; }
    });
  }

  function textoRotulo(f, ctx, zoom) {
    if (ctx.nivel !== 'brasil') return f.properties.nome;
    /* sigla de longe, nome inteiro quando há espaço */
    return zoom < 5.5 ? f.properties.uf : f.properties.nome;
  }

  let pendenteRotulos = null;
  function agendarRotulos() {
    if (pendenteRotulos) clearTimeout(pendenteRotulos);
    pendenteRotulos = setTimeout(function () { pendenteRotulos = null; desenharRotulos(); }, 110);
  }

  function desenharRotulos() {
    const ctx = M.ctx;
    if (!ctx || !M.mapa || !M.porChave) return;
    limparRotulos();
    if (ctx.nivel === 'municipio') return;   /* um polígono só: o título já diz */

    const zoom = M.mapa.getZoom();
    const limites = M.mapa.getBounds();
    const candidatos = ctx.feicoes.features.filter(function (f) {
      const c = f.properties.caixa;
      /* fora de vista não entra na disputa por espaço */
      return limites.intersects([[c[0][0], c[0][1]], [c[1][0], c[1][1]]]);
    }).sort(function (a, b) {
      const sa = ctx.selecionado === ctx.chave(a) ? 1 : 0;
      const sb = ctx.selecionado === ctx.chave(b) ? 1 : 0;
      if (sa !== sb) return sb - sa;
      return (b._v || 0) - (a._v || 0);
    });

    const caixas = [];
    let postos = 0;
    for (let i = 0; i < candidatos.length && postos < MAX_ROTULOS; i++) {
      const f = candidatos[i];
      const layer = M.porChave[ctx.chave(f)];
      if (!layer) continue;

      /* o polígono precisa caber o texto na tela, senão o rótulo tapa a
         geometria que deveria nomear */
      const c = f.properties.caixa;
      const p1 = M.mapa.latLngToContainerPoint([c[0][0], c[0][1]]);
      const p2 = M.mapa.latLngToContainerPoint([c[1][0], c[1][1]]);
      const larg = Math.abs(p2.x - p1.x), alt = Math.abs(p2.y - p1.y);
      const texto = textoRotulo(f, ctx, zoom);

      /* Os primeiros da fila são os que o usuário procura, e num estado com
         645 municípios quase nenhum polígono comporta o próprio nome. Para
         esses, o rótulo sai mesmo apertado — a poda por colisão abaixo
         continua impedindo que um cubra o outro. */
      const prioritario = postos < 6;
      const minAlt = prioritario ? 6 : 16;
      const minLarg = texto.length * (prioritario ? 2.2 : 5.2);
      if (alt < minAlt || larg < minLarg) continue;

      layer.bindTooltip(texto, {
        permanent: true, direction: 'center', className: 'geo-rotulo', opacity: 1
      }).openTooltip();
      layer._rotuloAtivo = true;

      const elTip = layer.getTooltip() && layer.getTooltip().getElement();
      if (!elTip) continue;
      const r = elTip.getBoundingClientRect();
      const bate = caixas.some(function (o) {
        return !(r.right < o.left || r.left > o.right || r.bottom < o.top || r.top > o.bottom);
      });
      if (bate) { layer.unbindTooltip(); layer._rotuloAtivo = false; continue; }
      caixas.push(r);
      postos++;
    }
  }

  /* ---------------- Unidades e cobertura ---------------- */
  function corFormato(f) {
    return css(f === 'propria' ? '--c5' : f === 'franquia' ? '--c6' : '--muted');
  }

  function centro(f) {
    const c = f.properties.caixa;
    return [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
  }

  function posicao(u) {
    if (u.precisao === 'exata' && u.lat != null && u.lng != null) return [u.lat, u.lng];
    if (!u.municipio || !u.uf) return null;
    const f = MI.geo.temUf(u.uf) ? MI.geo.municipioPorNome(u.uf, u.municipio) : null;
    if (f) return centro(f);
    if (MI.GEO_BR) {
      const uf = MI.GEO_BR.features.filter(function (x) { return x.properties.uf === u.uf; })[0];
      if (uf) return centro(uf);
    }
    return null;
  }
  W.posicaoDaUnidade = posicao;

  function unidadesVisiveis(ctx) {
    if (!MI.unidades) return [];
    return MI.unidades.items.filter(function (u) {
      if (u.precisao === 'ausente') return false;
      if (ctx.nivel === 'uf' && u.uf !== ctx.uf) return false;
      if (ctx.nivel === 'municipio') {
        if (u.uf !== ctx.uf) return false;
        if (MI.slug(u.municipio || '') !== MI.slug(ctx.municipio || '')) return false;
      }
      return true;
    });
  }

  function desenharUnidades(ctx) {
    const L = window.L;
    M.unidades.clearLayers();
    M.cobertura.clearLayers();
    const lista = unidadesVisiveis(ctx);

    lista.forEach(function (u) {
      const pos = posicao(u);
      if (!pos) return;
      const exata = u.precisao === 'exata';

      /* Raio geográfico de verdade: L.circle recebe metros e o Leaflet
         projeta. Só para unidade com coordenada — 3 km em volta do centro
         de um município não medem nada. */
      if (PREF.cobertura && exata) {
        L.circle(pos, {
          pane: 'cobertura', radius: u.raio_m || 3000,
          color: corFormato(u.formato), weight: 1, opacity: 0.55,
          fillColor: corFormato(u.formato), fillOpacity: 0.1
        }).addTo(M.cobertura);
      }
      if (!PREF.unidades) return;

      const marca = L.circleMarker(pos, {
        pane: 'unidades', radius: 7,
        color: css('--surface'), weight: 2.5,
        fillColor: corFormato(u.formato), fillOpacity: exata ? 1 : 0.4,
        dashArray: exata ? null : '3 2'
      });
      marca.bindTooltip(
        '<strong>' + esc(u.nome) + '</strong>' +
        '<span>' + esc(MI.unidades.rotuloFormato(u.formato)) + '</span>' +
        '<span>' + esc(MI.unidades.rotuloPrecisao(u.precisao)) + '</span>' +
        (u.municipio ? '<span>' + esc(u.municipio + (u.uf ? ' · ' + u.uf : '')) + '</span>' : ''),
        { direction: 'top', opacity: 1, className: 'geo-dica' });
      marca.on('click', function (ev) {
        L.DomEvent.stop(ev.originalEvent);
        if (ctx.aoSelecionarUnidade) ctx.aoSelecionarUnidade(u);
      });
      marca.addTo(M.unidades);
    });

    /* Sobreposição desenhada por cima dos raios: é onde duas lojas disputam
       o mesmo pedaço de cidade, e é o que a leitura de canibalização
       procura. Sem coordenada em pelo menos duas unidades, não há o que
       desenhar — e a camada fica desabilitada dizendo por quê. */
    if (PREF.sobreposicao && MI.cobertura) {
      const an = MI.cobertura.analisar({
        filtro: function (u) {
          if (ctx.nivel === 'uf' && u.uf !== ctx.uf) return false;
          if (ctx.nivel === 'municipio') {
            if (u.uf !== ctx.uf) return false;
            if (MI.slug(u.municipio || '') !== MI.slug(ctx.municipio || '')) return false;
          }
          return true;
        }
      });
      ctx.analiseCobertura = an;
      an.pares.forEach(function (par) {
        if (!par.contorno) return;
        L.polygon(par.contorno, {
          pane: 'cobertura',
          color: css('--crit'), weight: 1.2, opacity: 0.75,
          fillColor: css('--crit'), fillOpacity: 0.22
        }).bindTooltip(
          '<strong>Sobreposição</strong>' +
          '<span>' + esc(par.a.nome) + ' × ' + esc(par.b.nome) + '</span>' +
          '<span>' + MI.fmt.dec(par.distancia / 1000, 1) + ' km entre elas</span>' +
          '<span>' + MI.fmt.dec(par.area / 1e6, 1) + ' km² em comum</span>',
          { direction: 'top', opacity: 1, className: 'geo-dica' }
        ).addTo(M.cobertura);
      });
    } else {
      ctx.analiseCobertura = null;
    }
    return lista.length;
  }

  /* ---------------- Barra, legenda, painel ---------------- */
  function alternador(rotulo, chave, habilitado, titulo) {
    const b = el('button', {
      class: 'geo__camada-btn' + (PREF[chave] ? ' is-on' : ''), type: 'button',
      title: titulo, disabled: !habilitado,
      onclick: function () {
        PREF[chave] = !PREF[chave];
        b.classList.toggle('is-on', PREF[chave]);
        if (M.ctx) W.aplicar(M.ctx);
      }
    }, rotulo);
    return b;
  }

  function montarBarra(ctx) {
    MI.clear(M.trilha);
    (ctx.crumbs || []).forEach(function (c, i) {
      if (i) M.trilha.appendChild(el('span', { class: 'geo__sep', text: '/' }));
      M.trilha.appendChild(el('button', {
        class: 'geo__crumb' + (c.aoClicar ? '' : ' is-on'), type: 'button', onclick: c.aoClicar || null
      }, c.rotulo));
    });

    MI.clear(M.seletor);
    ctx.metricas.forEach(function (m) {
      M.seletor.appendChild(el('option', { value: m.id, text: m.rotulo, selected: m.id === ctx.metrica.id ? '' : null }));
    });

    const bal = MI.unidades ? MI.unidades.balanco() : { total: 0, exatas: 0 };
    MI.clear(M.camadasEl);
    M.camadasEl.appendChild(alternador('Concentração', 'coropletico', true, 'Pinta o território pela métrica escolhida'));
    M.camadasEl.appendChild(alternador('Unidades', 'unidades', bal.total > 0,
      bal.total ? MI.fmt.int(bal.total) + ' unidades cadastradas' : 'Nenhuma unidade cadastrada ainda'));
    M.camadasEl.appendChild(alternador('Cobertura', 'cobertura', bal.exatas > 0,
      bal.exatas ? 'Raio operacional das unidades com coordenada' : 'Nenhuma unidade tem coordenada: o raio sairia em volta do centro do município'));
    M.camadasEl.appendChild(alternador('Sobreposição', 'sobreposicao', bal.exatas > 1,
      bal.exatas > 1 ? 'Onde dois raios se cruzam — leitura de canibalização'
        : 'Precisa de pelo menos duas unidades com coordenada'));
  }

  function montarLegenda(ctx) {
    MI.clear(M.legenda);
    if (PREF.coropletico) {
      const ramp = 'linear-gradient(90deg,' + [0, .25, .5, .75, 1].map(function (t) {
        return MI.geo.scale(0.14 + t * 0.86);
      }).join(',') + ')';
      M.legenda.appendChild(el('div', { class: 'geo__leg-escala' }, [
        el('span', { text: '0' }),
        el('i', { class: 'geo__ramp', style: 'background:' + ramp }),
        el('span', { text: ctx.metrica.fmt(ctx.max || 0) })
      ]));
      M.legenda.appendChild(el('div', { class: 'geo__leg-un', text: ctx.metrica.rotulo + ' · ' + ctx.metrica.unidade }));
      if (ctx.metrica.territorial && MI.CONTEXTO_MUN) {
        /* fonte, data e resolução ficam à vista: é dado de terceiro sobre o
           território, não medição da Smoov */
        M.legenda.appendChild(el('div', { class: 'geo__leg-fonte' },
          MI.CONTEXTO_MUN.fonte + ' · por ' + MI.CONTEXTO_MUN.resolucao +
          ' · descreve o território, não os clientes'));
      }
    }
    const chaves = [];
    if (PREF.coropletico) chaves.push(['is-vazio', 'sem registros']);
    if (ctx.ag.gruposSuprimidos) chaves.push(['is-sup', 'suprimido (< ' + ctx.ag.k + ')']);
    if (PREF.unidades && ctx.nUnidades) {
      chaves.push(['is-propria', 'loja própria']);
      chaves.push(['is-franquia', 'franquia']);
      chaves.push(['is-aprox', 'posição aproximada']);
    }
    if (chaves.length) {
      M.legenda.appendChild(el('div', { class: 'geo__leg-chaves' }, chaves.map(function (c) {
        return el('span', { class: 'geo__chave' }, [el('i', { class: 'geo__sw ' + c[0] }), c[1]]);
      })));
    }
  }

  function montarPainel(ctx) {
    MI.clear(M.painel);
    const topo = el('div', { class: 'geo__painel-topo' }, [
      el('h4', { text: ctx.tituloPainel }),
      el('button', {
        class: 'geo__fechar', type: 'button', title: 'Recolher painel',
        onclick: function () { M.raiz.classList.toggle('is-sem-painel'); setTimeout(function () { if (M.mapa) M.mapa.invalidateSize(); }, 220); }
      }, '›')
    ]);
    M.painel.appendChild(topo);
    if (ctx.painel) ctx.painel(M.painel, ctx);
  }

  /* ---------------- Busca ---------------- */
  function buscar() {
    const ctx = M.ctx;
    const q = MI.slug(M.busca.value.trim());
    MI.clear(M.sugestoes);
    if (!ctx || q.length < 2) { M.sugestoes.hidden = true; return; }
    const achados = [];
    (ctx.feicoes ? ctx.feicoes.features : []).forEach(function (f) {
      if (achados.length < 8 && MI.slug(f.properties.nome).indexOf(q) >= 0) achados.push({ f: f });
    });
    if (MI.unidades) {
      MI.unidades.items.forEach(function (u) {
        if (achados.length < 10 && MI.slug(u.nome).indexOf(q) >= 0) achados.push({ u: u });
      });
    }
    if (!achados.length) {
      M.sugestoes.appendChild(el('div', { class: 'geo__sug is-vazio', text: 'Nada encontrado' }));
    } else {
      achados.forEach(function (a) {
        const rotulo = a.f ? a.f.properties.nome : a.u.nome;
        const nota = a.f ? (a.f._ag && !a.f._ag.suprimido ? ctx.metrica.fmt(a.f._v) : 'sem registros') : 'unidade';
        M.sugestoes.appendChild(el('button', {
          class: 'geo__sug', type: 'button',
          onclick: function () {
            M.busca.value = ''; M.sugestoes.hidden = true;
            if (a.f) { enquadrar(a.f.properties.caixa); if (ctx.aoSelecionar) ctx.aoSelecionar(ctx.chave(a.f), a.f); }
            else { const p = posicao(a.u); if (p) M.mapa.setView(p, 14); if (ctx.aoSelecionarUnidade) ctx.aoSelecionarUnidade(a.u); }
          }
        }, [el('span', { text: rotulo }), el('small', { text: nota })]));
      });
    }
    M.sugestoes.hidden = false;
  }

  function enquadrar(caixa, opcoes) {
    if (!M.mapa || !caixa) return;
    M.mapa.fitBounds(caixa, Object.assign({ padding: [28, 28], animate: true, duration: 0.5 }, opcoes || {}));
  }
  W.enquadrar = enquadrar;

  /* ---------------- Ciclo ---------------- */

  /* Devolve o nó, montando-o na primeira vez. As chamadas seguintes só
     atualizam dados e estilos: o mapa continua o mesmo, com o zoom onde o
     usuário deixou. */
  W.obter = function () {
    if (!M.raiz) montar();
    return M.raiz;
  };

  W.iniciar = function (ctx) {
    return W.carregarLib().then(function () {
      if (!M.pronto) {
        criarMapa(window.L);
        M.mapa.setView([-15, -54], 4);
      }
      W.aplicar(ctx);
      setTimeout(function () { if (M.mapa) M.mapa.invalidateSize(); }, 60);
      return M;
    });
  };

  W.aplicar = function (ctx) {
    if (!M.pronto) return;
    M.ctx = ctx;
    ctx.metricas = metricas();
    ctx.metrica = ctx.metricas.filter(function (m) { return m.id === PREF.metrica; })[0] || ctx.metricas[0];
    PREF.metrica = ctx.metrica.id;
    ctx.ag = agregar(ctx.rows, ctx.campo);
    ctx.total = ctx.rows.length;

    /* quantas unidades por território, para a dica e para o painel */
    ctx.unidadesPorChave = {};
    if (MI.unidades) {
      MI.unidades.items.forEach(function (u) {
        if (u.precisao === 'ausente') return;
        const k = ctx.nivel === 'brasil' ? u.uf : (u.municipio || '');
        if (!k) return;
        ctx.unidadesPorChave[k] = (ctx.unidadesPorChave[k] || 0) + 1;
      });
    }

    basemap(ctx.nivel === 'municipio');
    desenharTerritorio(ctx);
    ctx.nUnidades = desenharUnidades(ctx);
    montarBarra(ctx);
    montarLegenda(ctx);
    montarPainel(ctx);

    /* Enquadra só quando o escopo territorial muda. Um filtro qualquer não
       pode jogar a câmera de volta: quem deu zoom numa região espera
       continuar nela. */
    const escopo = ctx.nivel + '|' + (ctx.uf || '') + '|' + (ctx.municipio || '');
    if (ctx.enquadrarEm && escopo !== M.escopo) enquadrar(ctx.enquadrarEm);
    M.escopo = escopo;
  };

  W.destacar = function (chave) {
    const l = M.porChave && M.porChave[chave];
    if (l && l.bringToFront) l.bringToFront();
  };

  W.invalidar = function () { if (M.mapa) M.mapa.invalidateSize(); };

  MI.geoMap = W;
  MI.geoMapEstado = M;

})(window.MI);
