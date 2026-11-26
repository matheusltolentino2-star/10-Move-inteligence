/* Detalhe urbano sobre a instância Leaflet do mapa territorial. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';
  const U = {};
  const states = new WeakMap();
  const urlDistritos = 'assets/geo/distritos-sp-geosampa.json';
  const fonteDistritos = 'Distritos: <a href="https://metadados.geosampa.prefeitura.sp.gov.br/geonetwork/srv/api/records/51f75eab-6d90-451e-9f80-c21c1ac72630">GeoSampa</a> · CC BY-SA';
  const zoomLimites = 11.5;
  const zoomRotulos = 12.5;
  let colecao, carregando, caixaNucleoSP;
  const nucleoSP = new Set(['pinheiros', 'itaim_bibi', 'jardim_paulista', 'moema', 'vila_mariana']);
  const lugaresSP = [
    {nome: 'Estação Faria Lima', nota: 'Referência na Av. Faria Lima', centro: [-23.5673179, -46.6941039]},
    {nome: 'Vila Olímpia', nota: 'Referência de bairro', centro: [-23.5940375, -46.6842299]},
    {nome: 'Parque Ibirapuera', nota: 'Parque', centro: [-23.5877126, -46.6585214]}
  ];

  function capital(ctx) {
    if (ctx?.nivel !== 'municipio' || ctx.uf !== 'SP') return false;
    const feicao = ctx.feicoes?.features[0];
    return String(feicao?.properties.codigo || '') === '3550308' || MI.slug(ctx.municipio) === 'sao_paulo';
  }

  function carregarDistritos() {
    if (!carregando) {
      carregando = fetch(urlDistritos)
        .then(res => {
          if (!res.ok) throw new Error('Malha de distritos indisponível.');
          return res.json();
        })
        .then(data => {
          if (data.type !== 'FeatureCollection' || data.features?.length !== 96) {
            throw new Error('Malha de distritos incompleta.');
          }
          colecao = data;
          return data;
        })
        .catch(() => { carregando = null; return null; });
    }
    return carregando;
  }

  U.distritos = () => colecao || null;

  U.iniciar = function (mapa) {
    const L = window.L;
    mapa.createPane('vizinhos').style.zIndex = 390;
    mapa.createPane('distritos').style.zIndex = 420;
    const paneRotulos = mapa.createPane('rotulosUrbanos');
    paneRotulos.style.zIndex = 625;
    paneRotulos.style.pointerEvents = 'none';
    const vizinhos = L.geoJSON(null, {
      pane: 'vizinhos', interactive: false,
      style: {color: '#536577', weight: 1, opacity: 0.52, fill: false}
    }).addTo(mapa);
    const rotulos = L.layerGroup().addTo(mapa);
    states.set(mapa, {vizinhos, rotulos, chaveVizinhos: '', distritos: null});
  };

  function desenharVizinhos(mapa, s) {
    const L = window.L, ctx = s.ctx;
    const municipio = ctx?.nivel === 'municipio' ? ctx.feicoes?.features[0] : null;
    const caixa = municipio?.properties?.caixa;
    const banda = caixa ? L.latLngBounds(caixa).pad(0.35) : null;
    const malha = banda ? MI.GEO_MUN?.[ctx.uf] : null;
    const areaVisivel = mapa.getBounds().pad(0.08);
    const feicoes = malha ? malha.features.filter(f => f !== municipio &&
      f.properties.caixa && banda.intersects(f.properties.caixa) && areaVisivel.intersects(f.properties.caixa)) : [];
    const chave = ctx?.uf + '|' + feicoes.map(f => f.properties.codigo || f.properties.nome).join('|');
    if (chave === s.chaveVizinhos) return;
    s.chaveVizinhos = chave;
    s.vizinhos.clearLayers();
    if (feicoes.length) s.vizinhos.addData({type:'FeatureCollection', features:feicoes});
  }

  function nomeDistrito(f) {
    return MI.titleCase(f.properties.nome);
  }

  function estiloDistrito(f, ctx) {
    const ativo = ctx?.distritoSelecionado && MI.slug(ctx.distritoSelecionado) === MI.slug(f.properties.nome);
    return {color: ativo ? '#006482' : '#3b6470', weight: ativo ? 2.4 : 0.95,
      opacity: ativo ? 0.95 : 0.64, fillColor: '#2f8a9b', fillOpacity: ativo ? 0.13 : 0.025};
  }

  function camadaDistritos(s) {
    const L = window.L;
    return L.geoJSON(colecao, {
      pane: 'distritos', attribution: fonteDistritos, smoothFactor: 1,
      style: f => estiloDistrito(f, s.ctx),
      onEachFeature: (f, camada) => {
        const nome = nomeDistrito(f);
        const dica = document.createElement('div');
        const destaque = document.createElement('strong');
        destaque.textContent = nome;
        const origem = document.createElement('span');
        origem.textContent = 'Distrito administrativo · GeoSampa';
        dica.append(destaque, origem);
        camada.bindTooltip(dica, {direction:'top', sticky:true, opacity:1, className:'geo-dica'});
        camada.on('click', ev => {
          L.DomEvent.stopPropagation(ev);
          camada.closeTooltip();
          s.abrirDistrito(f, camada.getBounds());
        });
      }
    });
  }

  function desenharRotulos(mapa, s) {
    s.rotulos.clearLayers();
    if (!s.distritos || !mapa.hasLayer(s.distritos) || mapa.getZoom() < zoomRotulos) return;
    const L = window.L, tamanho = mapa.getSize(), usados = [];
    const interessados = s.distritos.getLayers().filter(l => mapa.getBounds().contains(l.feature.properties.centro));
    interessados.sort((a,b) => Number(nucleoSP.has(MI.slug(b.feature.properties.nome))) -
      Number(nucleoSP.has(MI.slug(a.feature.properties.nome))));
    for (const l of interessados) {
      const centro = l.feature.properties.centro;
      const ponto = mapa.latLngToContainerPoint(centro), nome = nomeDistrito(l.feature);
      const meiaLargura = Math.max(23, nome.length * 3.2);
      if (ponto.x < meiaLargura || ponto.x > tamanho.x - meiaLargura ||
          ponto.y < 17 || ponto.y > tamanho.y - 17) continue;
      if (usados.some(o => Math.abs(ponto.x - o.x) < meiaLargura + o.meiaLargura + 6 && Math.abs(ponto.y - o.y) < 23)) continue;
      const rotulo = document.createElement('span');
      rotulo.textContent = nome;
      L.tooltip({permanent:true, direction:'center', pane:'rotulosUrbanos', className:'geo-rotulo geo-rotulo--urbano', opacity:1})
        .setLatLng(centro).setContent(rotulo).addTo(s.rotulos);
      usados.push({x:ponto.x, y:ponto.y, meiaLargura});
      if (usados.length === 14) break;
    }
  }

  U.movimento = function (mapa) {
    const s = states.get(mapa);
    if (!s || !s.ctx) return;
    desenharVizinhos(mapa, s);
    const visivel = capital(s.ctx) && colecao && mapa.getZoom() >= zoomLimites;
    if (visivel) {
      if (!s.distritos) s.distritos = camadaDistritos(s);
      if (!mapa.hasLayer(s.distritos)) s.distritos.addTo(mapa);
    } else if (s.distritos && mapa.hasLayer(s.distritos)) {
      s.distritos.remove();
    }
    desenharRotulos(mapa, s);
  };

  U.aplicar = function (mapa, ctx, abrirDistrito, aoCarregar) {
    const s = states.get(mapa);
    s.ctx = ctx;
    s.abrirDistrito = abrirDistrito;
    if (capital(ctx) && !colecao && !s.aguardando) {
      s.aguardando = true;
      carregarDistritos().then(data => {
        s.aguardando = false;
        if (!data || !capital(s.ctx)) return;
        U.movimento(mapa);
        aoCarregar();
      });
    }
    if (s.distritos) s.distritos.setStyle(f => estiloDistrito(f, ctx));
    U.movimento(mapa);
  };

  U.buscar = function (ctx, termo) {
    if (!capital(ctx)) return [];
    const distritos = (colecao?.features || []).filter(f => MI.slug(f.properties.nome).includes(termo))
      .map(f => ({f, nome:nomeDistrito(f), nota:'Distrito administrativo · GeoSampa'}));
    return distritos.concat(lugaresSP.filter(x => MI.slug(x.nome).includes(termo)));
  };

  U.nucleo = function (mapa, ctx) {
    if (ctx?.nivel !== 'municipio') return null;
    const L = window.L;
    const pontos = (ctx.unidades || []).map(u => MI.storeCoverage?.coordenadas(u)).filter(Boolean);
    if (pontos.length) {
      if (pontos.length === 1) return L.latLng(pontos[0]).toBounds(2200);
      let maisProximas = [];
      for (const ponto of pontos) {
        const grupo = pontos.filter(outro => mapa.distance(ponto, outro) <= 5000);
        if (grupo.length > maisProximas.length) maisProximas = grupo;
      }
      if (maisProximas.length < 2) return L.latLng(maisProximas[0]).toBounds(2200);
      const caixa = L.latLngBounds(maisProximas).pad(0.12);
      return caixa.extend(caixa.getCenter().toBounds(2200));
    }
    if (!capital(ctx) || !colecao) return null;
    if (!caixaNucleoSP) {
      const feicoes = colecao.features.filter(f => nucleoSP.has(MI.slug(f.properties.nome)));
      caixaNucleoSP = L.geoJSON({type:'FeatureCollection', features:feicoes}).getBounds();
    }
    return caixaNucleoSP.isValid() ? caixaNucleoSP : null;
  };

  MI.geoUrban = U;
})(window.MI);
