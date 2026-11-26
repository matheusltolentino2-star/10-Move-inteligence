/* Camadas de lojas e cobertura montadas sobre a instância Leaflet existente. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const S = {}, el = MI.el;
  const pref = { unidades: true, cobertura: false, sobreposicao: false, descoberta: false };
  let network, snapshot, menuOpen = false, radius = null, isolated = null, state;
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const same = (a, b) => MI.slug(a || '') === MI.slug(b || '');
  const coverage = () => MI.storeCoverage;
  const municipal = ctx => ctx.nivel === 'municipio';
  S.territorioVerificado = unit => !!coverage().coordenadas(unit) ||
    (unit.precisao === 'municipio' && !!unit.uf && !!unit.municipio);
  const storeColor = unit => css(unit.formato === 'propria' ? '--c5' : unit.formato === 'franquia' ? '--c6' : '--muted');
  const layers = ['unidades', 'cobertura', 'sobreposicao', 'descoberta'];

  S.iniciar = function (m) {
    state = m;
    for (const key of layers) m[key] = window.L.layerGroup().addTo(m.mapa);
  };

  function stores(ctx, source) {
    return source.filter(u => ctx.nivel === 'brasil' || (u.uf === ctx.uf &&
      (!municipal(ctx) || same(u.municipio, ctx.municipio))));
  }

  function territory(ctx) {
    if (municipal(ctx)) return ctx.feicoes.features[0] || null;
    if (ctx.nivel === 'uf') return MI.GEO_BR?.features.find(f => f.properties.uf === ctx.uf) || null;
    return null;
  }

  S.preparar = function (ctx) {
    const source = MI.unidades.paraMapa();
    const old = snapshot;
    if (old && (old.source !== source || old.dataset !== MI.store.dataset)) {
      radius = null;
    }
    if (isolated !== ctx.unidadeSelecionada) isolated = null;
    snapshot = { source, dataset: MI.store.dataset };
    if (!network || network.source !== source || network.radius !== radius) {
      network = { source, radius, global: coverage().analisar(source, { raioM: radius }), regions: new WeakMap() };
    }
    const boundary = territory(ctx);
    if (boundary && !network.regions.has(boundary)) {
      network.regions.set(boundary, coverage().recortar(network.global, boundary));
    }
    ctx.unidades = stores(ctx, source);
    ctx.nUnidades = ctx.unidades.length;
    ctx.territorioCobertura = boundary;
    ctx.analiseCobertura = boundary ? network.regions.get(boundary) : network.global;
    ctx.demandaCobertura = S.analiseVisivel() ? MI.storeIntelligence.demanda(ctx, network.global) : null;
    return ctx;
  };

  function tooltip(title, detail) {
    return el('div', {}, [el('strong', { text: title }), detail && el('span', { text: detail })]);
  }

  function marker(point, options) {
    const L = window.L;
    const size = options.size || 28;
    const content = el('span', { class: 'geo-pin__body', text: options.value,
      style: options.color ? '--pin-color:' + options.color : null });
    const icon = L.divIcon({
      className: 'geo-pin ' + options.style, html: content,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2]
    });
    const pin = L.marker(point, { icon, pane: options.pane || 'unidades', title: options.title,
      zIndexOffset: options.zIndexOffset || 0,
      alt: options.title, keyboard: !!options.click, interactive: !!options.click, bubblingMouseEvents: false });
    if (options.click) {
      pin.on('add', () => pin.getElement()?.setAttribute('aria-label', options.title));
      pin.on('click', options.click);
    }
    return pin;
  }

  function boundsCenter(f) {
    const [[s, w], [n, e]] = f.properties.caixa;
    return [(s + n) / 2, (w + e) / 2];
  }

  function wideMarkers(ctx) {
    const groups = new Map();
    for (const u of ctx.unidades) {
      if (!S.territorioVerificado(u)) continue;
      const key = ctx.nivel === 'brasil' ? u.uf : u.municipio;
      if (!key) continue;
      const normalized = MI.slug(key);
      const g = groups.get(normalized) || { count: 0, points: [] };
      g.count++;
      const point = coverage().coordenadas(u);
      if (point) g.points.push(point);
      groups.set(normalized, g);
    }
    for (const area of ctx.feicoes.features) {
      const key = ctx.chave(area), group = groups.get(MI.slug(key));
      if (!group) continue;
      // Um ponto da loja ancora grupos pequenos. O nome e a contagem identificam o território.
      const point = ctx.nivel === 'uf' && group.points.length ? group.points[0] : boundsCenter(area);
      const name = area.properties.nome;
      const title = name + ' · ' + group.count + (group.count === 1 ? ' unidade' : ' unidades');
      marker(point, { style: 'is-group', value: group.count, title,
        click: () => ctx.aoSelecionar(key, area) })
        .bindTooltip(tooltip(title), { direction: 'top', className: 'geo-dica' })
        .addTo(state.unidades);
    }
  }

  function localMarkers(ctx, list) {
    const map = state.mapa, zoom = map.getZoom(), bounds = map.getBounds().pad(0.18);
    const groups = [];
    const ordered = [...list].sort((a, b) => Number(b === ctx.unidadeSelecionada) - Number(a === ctx.unidadeSelecionada));
    for (const unit of ordered) {
      const point = coverage().coordenadas(unit);
      if (!point || !bounds.contains(point)) continue;
      const pixel = map.project(point, zoom);
      const nearby = groups.find(g => g.pixel.distanceTo(pixel) < 31);
      if (nearby) nearby.units.push(unit);
      else groups.push({ point, pixel, units: [unit] });
    }
    const labels = [];
    for (const group of groups) {
      const unit = group.units[0], selected = ctx.unidadeSelecionada === unit;
      if (group.units.length > 1) {
        const title = group.units.length + ' unidades próximas';
        const pin = marker(group.point, { style: 'is-group' + (selected ? ' is-selected' : ''),
          value: group.units.length, title, click: () => {
            if (zoom < 17) { map.setView(group.point, Math.min(18, zoom + 2)); return; }
            const choices = el('div', { class: 'geo__lista' }, group.units.map(u =>
              el('button', { type: 'button', class: 'geo__item', onclick: () => {
                map.closePopup();
                ctx.aoSelecionarUnidade(u);
              } }, u.nome)));
            window.L.popup().setLatLng(group.point).setContent(choices).openOn(map);
          } }).addTo(state.unidades);
        pin.bindTooltip(tooltip(title, selected ? unit.nome : null), { direction: 'top', className: 'geo-dica' });
        continue;
      }
      const pin = marker(group.point, { style: 'is-store' + (selected ? ' is-selected' : ''),
        color: storeColor(unit), value: unit.formato === 'franquia' ? 'F' : unit.formato === 'propria' ? 'P' : 'S',
        title: unit.nome, zIndexOffset: selected ? 1000 : 0, click: () => ctx.aoSelecionarUnidade(unit) });
      const px = group.pixel;
      const labelWidth = Math.min(170, 18 + unit.nome.length * 6);
      const local = map.latLngToContainerPoint(group.point), tamanho = map.getSize();
      const fits = zoom >= 13 && local.y > 44 && local.y < tamanho.y &&
        local.x > labelWidth / 2 + 8 && local.x < tamanho.x - labelWidth / 2 - 8 &&
        !groups.some(g => g !== group && Math.abs(g.pixel.y - (px.y - 26)) < 20 &&
        Math.abs(g.pixel.x - px.x) < labelWidth / 2 + 15) &&
        !labels.some(label => Math.abs(label.y - px.y) < 27 && Math.abs(label.x - px.x) < (label.width + labelWidth) / 2);
      if (fits) labels.push({ x: px.x, y: px.y, width: labelWidth });
      pin.bindTooltip(tooltip(unit.nome, fits ? null : MI.unidades.rotuloFormato(unit.formato) +
        (MI.unidades.procedencia(unit) === 'simulada' ? ' · Simulada' : '')),
        { direction: 'top', offset: [0, -12], permanent: fits, className: fits ? 'geo-store-label' : 'geo-dica' });
      pin.addTo(state.unidades);
    }
  }

  S.coberturaAtiva = () => pref.cobertura;
  S.analiseVisivel = () => pref.cobertura || pref.sobreposicao || pref.descoberta;

  function drawShapes(ctx) {
    const L = window.L, map = state.mapa, analysis = ctx.analiseCobertura;
    const bounds = map.getBounds();
    if (S.coberturaAtiva()) {
      for (const circle of analysis.circulos) {
        if (isolated && circle.unidade !== isolated) continue;
        const [lat, lng] = circle.ponto;
        const latPadding = circle.raioM / 110000;
        const lngPadding = latPadding / Math.cos(lat * Math.PI / 180);
        if (!bounds.intersects([[lat - latPadding, lng - lngPadding], [lat + latPadding, lng + lngPadding]])) continue;
        const selected = circle.unidade === ctx.unidadeSelecionada;
        L.circle(circle.ponto, { pane: 'cobertura', radius: circle.raioM, interactive: false,
          color: storeColor(circle.unidade), weight: selected ? 2 : 1,
          opacity: selected ? 0.9 : 0.55, fillOpacity: 0.09 }).addTo(state.cobertura);
      }
    }
    if (isolated) return;
    const shape = (geometry, key, style) => {
      if (geometry) L.geoJSON(geometry, { pane: 'cobertura', interactive: false, style }).addTo(state[key]);
    };
    if (pref.descoberta) shape(analysis.descoberta, 'descoberta', { color: css('--muted'),
      fillColor: css('--muted'), fillOpacity: 0.12, weight: 0.8, dashArray: '3 5' });
    if (pref.sobreposicao) shape(analysis.sobreposicaoNoTerritorio || (!ctx.territorioCobertura && analysis.sobreposicao),
      'sobreposicao', { color: css('--crit'), weight: 1.4, opacity: 0.85, fillOpacity: 0.28 });
    if (!municipal(ctx) || !pref.descoberta) return;
    const zones = ctx.demandaCobertura?.zonas.filter(z => z.ref && z.clientes >= MI.privacy.k) || [];
    for (const zone of zones) {
      if (zone.fora < MI.privacy.k || !MI.storeIntelligence.visivel(zone.dentro)) continue;
      const title = 'Demanda descoberta · ' + zone.label;
      marker(zone.ref, { style: 'is-zone', size: 22, value: '·', title, pane: 'unidades',
        click: () => ctx.aoSelecionarZona(zone.key) })
        .bindTooltip(tooltip(title, 'Referência territorial agregada'), { direction: 'top', className: 'geo-dica' })
        .addTo(state.descoberta);
    }
  }

  S.desenhar = function (ctx) {
    for (const key of layers) state[key].clearLayers();
    const zoom = state.mapa.getZoom();
    const local = zoom >= (municipal(ctx) ? 9 : 11);
    if (pref.unidades) {
      if (local) localMarkers(ctx, ctx.unidadeSelecionada && !ctx.unidades.includes(ctx.unidadeSelecionada)
        ? ctx.unidades.concat(ctx.unidadeSelecionada) : ctx.unidades);
      else if (!municipal(ctx)) wideMarkers(ctx);
      else if (ctx.unidades.some(u => coverage().coordenadas(u)) && ctx.feicoes.features[0]) {
        const f = ctx.feicoes.features[0];
        const total = ctx.unidades.filter(u => coverage().coordenadas(u)).length;
        marker(boundsCenter(f), { style: 'is-group', value: total, title: ctx.municipio,
          click: () => state.mapa.fitBounds(f.properties.caixa, { maxZoom: 13 }) }).addTo(state.unidades);
      }
    }
    if (S.analiseVisivel()) drawShapes(ctx);
  };

  function toggle(label, enabled, title, pressed, run, key) {
    return el('button', { class: 'geo__camada-btn' + (pressed ? ' is-on' : ''), type: 'button',
      disabled: !enabled, 'aria-pressed': String(pressed), title, onclick: run,
      'data-geo-layer': key }, label);
  }

  S.controles = function (host, ctx, refresh) {
    const an = ctx.analiseCobertura;
    const area = municipal(ctx) && ctx.territorioCobertura && an.comCoordenada > 0;
    const option = (label, key, enabled, available, unavailable, focus = key) => toggle(label, enabled,
      enabled ? available : unavailable, enabled && pref[key], () => {
        pref[key] = !pref[key];
        if (key === 'cobertura' && !pref[key]) isolated = null;
        refresh();
        host.querySelector('[data-geo-layer="' + focus + '"]')?.focus({ preventScroll: true });
      }, focus);
    const exact = ctx.territorioCobertura ? (an.areaCobertaTerritorio || 0) > 0 : an.comCoordenada > 0;
    const hasStores = ctx.unidades.some(u => municipal(ctx) ? coverage().coordenadas(u) :
      S.territorioVerificado(u) && (ctx.nivel === 'brasil' ? u.uf : u.municipio));
    host.append(
      option('Unidades', 'unidades', hasStores, 'Unidades Smoov da fonte ativa', 'Sem unidades posicionáveis neste recorte'),
      option('Cobertura', 'cobertura', exact, 'Raios operacionais no mapa', 'Sem raio elegível com coordenada neste recorte'));
    const more = el('details', { class: 'geo-layers-menu', open: menuOpen });
    more.addEventListener('toggle', () => { if (more.isConnected) menuOpen = more.open; });
    more.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        more.open = menuOpen = false;
        more.querySelector('summary').focus();
      }
    });
    const body = el('div', { class: 'geo-layers-menu__body' }, [
      option('Cobertura radial', 'cobertura', exact, 'Raios em linha reta', 'Sem raio elegível com coordenada neste recorte', 'radial'),
      option('Sobreposição', 'sobreposicao', !!(an.sobreposicaoNoTerritorio || (!ctx.territorioCobertura && an.sobreposicao)),
        'Área dentro do raio de duas ou mais lojas', 'Nenhum cruzamento de cobertura neste recorte'),
      option('Áreas descobertas', 'descoberta', !!area && !!an.descoberta, 'Trechos do município fora dos raios', 'Selecione um município com cobertura calculável'),
      toggle('Distância viária', false, 'Requer um serviço de roteamento configurado', false),
      toggle('Tempo estimado', false, 'Requer um serviço de roteamento configurado', false),
      el('p', { class: 'geo-layers-menu__note',
        text: 'Distância e tempo dependem de roteamento. Cenários previstos de 5, 10, 15 e 20 min.' })
    ]);
    more.append(el('summary', { class: 'geo__camada-btn', title: 'Configurações de cobertura',
      'aria-label': 'Configurações de cobertura' }), body);
    host.appendChild(more);
  };

  S.raio = () => radius;
  S.raioEm = function (value) { radius = value; };
  S.isolamento = () => isolated;
  S.alternarIsolamento = function (unidade) {
    if (!coverage().coordenadas(unidade) || !coverage().elegivel(unidade)) return;
    isolated = unidade === isolated ? null : unidade;
    if (isolated) pref.cobertura = true;
  };

  S.chaves = function (ctx) {
    const keys = [];
    if (pref.unidades && ctx.unidades.some(u => coverage().coordenadas(u))) {
      keys.push(['is-propria', 'loja própria'], ['is-franquia', 'franquia']);
    }
    if (pref.unidades && !municipal(ctx) && ctx.unidades.some(u =>
      u.precisao === 'municipio' && S.territorioVerificado(u))) {
      keys.push(['is-aprox', 'posição aproximada']);
    }
    if (S.coberturaAtiva() && ctx.analiseCobertura.comCoordenada) keys.push(['is-cobertura',
      isolated ? 'raio da unidade selecionada' : 'raio operacional']);
    if (pref.sobreposicao && !isolated) keys.push(['is-sobreposta', 'sobreposição']);
    if (municipal(ctx) && pref.descoberta && !isolated) keys.push(['is-descoberta', 'sem cobertura estimada']);
    return keys;
  };

  MI.storeLayers = S;
})(window.MI);
