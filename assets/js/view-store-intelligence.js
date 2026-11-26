/* Indicadores da rede no painel contextual existente do mapa. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const P = {}, el = MI.el, U = MI.ui, fmt = MI.fmt;
  const data = () => MI.storeIntelligence;
  const layers = () => MI.storeLayers;
  const coverage = () => MI.storeCoverage;
  const integer = value => value == null ? '—' : fmt.int(value);
  const money = value => value == null ? '—' : fmt.money(value);
  const decimal = value => value == null ? '—' : fmt.dec(value, 1);
  const area = value => value == null ? '—' : decimal(value / 1e6) + ' km²';
  const count = value => value == null ? '—' : data().visivel(value) ? fmt.int(value) : 'Suprimido';
  const heading = text => el('div', { class: 'geo__painel-sec', text });
  const copy = text => el('p', { class: 'geo__painel-txt', text });
  const stats = (host, entries) => host.appendChild(U.statline(entries.filter(Boolean).map(([k, v]) => ({ k, v }))));
  const action = (label, onClick) => el('div', { class: 'geo-panel-actions' }, U.btn(label, { sm: true, variant: 'ghost', onClick }));

  function list(host, entries, title, format, select) {
    if (!entries?.length) return;
    if (title) host.appendChild(heading(title));
    host.appendChild(el('div', { class: 'geo__lista' }, entries.map(item => el(select ? 'button' : 'div', {
      type: select ? 'button' : null, class: 'geo__item geo-panel-list-item' + (select ? '' : ' is-inerte'),
      title: item.label, onclick: select ? () => select(item) : null
    }, [
      el('span', { class: 'geo__item-nome', text: item.label }),
      el('span', { class: 'geo__item-v', text: format(item) })
    ]))));
  }

  const hour = n => String(n).padStart(2, '0') + 'h';

  function sales(host, record, population) {
    if (!record) {
      host.appendChild(copy('Histórico de compras vinculado indisponível'));
      return;
    }
    if (record.compradores > 0 && !data().visivel(record.compradores)) {
      host.appendChild(copy('Resultados de compras suprimidos para preservar a privacidade do grupo'));
      return;
    }
    if (!record.lines) {
      host.appendChild(copy('Nenhuma venda vinculada na base ativa'));
      return;
    }
    const buyers = record.compradores || null;
    stats(host, [
      ['Compradores identificados', integer(buyers)], ['Pedidos', integer(record.pedidos || null)],
      ['Itens vendidos', integer(record.units)], ['Receita líquida', money(record.receita)], ['Ticket por pedido', money(record.ticket)],
      population && record.frequencia != null ? ['Frequência média', decimal(record.frequencia) + ' pedidos por comprador'] : null
    ]);
    if (population) list(host, record.lojas, 'Unidades frequentadas · atração comercial', x => integer(x.quantity) + ' pedidos');
    list(host, record.produtos, 'Produtos mais consumidos', x => integer(x.quantity) + ' itens');
    list(host, record.horarios.map(x => ({ ...x, label: hour(x.label) })), 'Horários de pico', x => integer(x.quantity) + ' pedidos');
  }

  function back(host, handler) {
    host.appendChild(action('Voltar ao território', handler));
  }

  P.unidade = function (host, ctx, unit) {
    const storeRadius = coverage().raio(unit, null), coordinates = coverage().coordenadas(unit);
    const origin = MI.unidades.procedencia(unit);
    const provenance = origin === 'simulada' ? 'Unidade simulada' :
      origin === 'real' ? 'Unidade real' : 'Unidade de procedência indefinida';
    const eligible = coordinates && coverage().elegivel(unit);
    const resident = eligible ? data().residentes(ctx, unit, layers().raio()) : null;
    const isolated = layers().isolamento() === unit;
    const nome = origin === 'simulada' ? unit.nome.replace(/\s*\(simulad[ao]\)\s*$/i, '') : unit.nome;
    host.appendChild(heading(provenance + ' · ' + nome));
    stats(host, [
      ['Propriedade', MI.unidades.rotuloFormato(unit.formato)],
      ['Posição', MI.unidades.rotuloPrecisao(unit.precisao)],
      unit.formato_comercial ? ['Formato', unit.formato_comercial] : null,
      unit.operational_status || unit.status_operacional ? ['Status', unit.operational_status || unit.status_operacional] : null,
      unit.municipio ? ['Município', [unit.municipio, unit.uf].filter(Boolean).join(' · ')] : null,
      unit.bairro ? ['Bairro', unit.bairro] : null,
      unit.opening_hour != null && unit.closing_hour != null ?
        ['Horário cadastrado', hour(unit.opening_hour) + '–' + hour(unit.closing_hour)] : null,
      unit.production_capacity_items_hour != null && unit.production_capacity_items_hour !== '' ?
        ['Capacidade de produção', integer(unit.production_capacity_items_hour) + ' itens/h'] : null,
      unit.service_capacity_orders_hour != null && unit.service_capacity_orders_hour !== '' ?
        ['Capacidade de atendimento', integer(unit.service_capacity_orders_hour) + ' pedidos/h'] : null,
      eligible ? [+unit.raio_m > 0 ? 'Raio cadastrado' : 'Raio padrão', fmt.int(storeRadius) + ' m'] : null,
      eligible ? ['Área do raio', area(coverage().areaUnidade(unit, layers().raio()))] : null,
      eligible && layers().raio() ? ['Raio em simulação', fmt.int(layers().raio()) + ' m'] : null,
      eligible ? [resident?.identificados === false ? 'Registros residentes no raio' : 'Clientes residentes no raio',
        resident && (resident.comparaveis == null || data().visivel(resident.comparaveis - resident.total))
          ? count(resident.total) : resident ? 'Suprimido' : 'Indisponível'] : null
    ]);
    if (unit.endereco || unit.cep) host.appendChild(copy([unit.endereco, unit.cep && 'CEP ' + unit.cep].filter(Boolean).join(' · ')));
    if (!coordinates) host.appendChild(copy('Coordenadas da loja pendentes. A posição exata pode ser informada no cadastro de unidades.'));
    if (unit.delivery_available === false) host.appendChild(copy('Delivery indisponível no cadastro da unidade.'));
    if (eligible) {
      host.appendChild(action(isolated ? 'Exibir todos os raios' : 'Isolar cobertura', () => {
        layers().alternarIsolamento(unit);
        MI.geoMap.atualizarLojas();
      }));
      if (isolated) host.appendChild(raioInput('Simular raio uniforme (km)', layers().raio() || storeRadius, value => {
        layers().raioEm(value);
        MI.geoMap.atualizarLojas();
      }));
      host.appendChild(copy('Residentes no raio são estimados pela localização no recorte. Compradores são identificados pelas vendas da unidade.'));
    }
    host.appendChild(heading('Compras na unidade · recorte ativo'));
    sales(host, data().vendas({ unit }));
    back(host, ctx.aoLimparDetalhe);
  };

  P.zona = function (host, ctx, zone) {
    host.appendChild(heading(zone.label));
    const showBreakdown = data().visivel(zone.dentro) && data().visivel(zone.fora);
    stats(host, [
      ['Clientes com posição territorial', count(zone.clientes)],
      ['Dentro dos raios', showBreakdown ? count(zone.dentro) : 'Suprimido'],
      ['Fora dos raios', showBreakdown ? count(zone.fora) : 'Suprimido']
    ]);
    host.appendChild(copy('A zona usa referências territoriais agregadas. Investigar expansão exige uma avaliação comercial e operacional própria.'));
    if (showBreakdown && zone.fora >= MI.privacy.k) {
      host.appendChild(heading('Compras da demanda descoberta'));
      const customers = data().regiao(ctx, ctx.analiseCobertura, zone.key);
      const record = customers.size >= MI.privacy.k ? data().vendas({ customers, cacheKey: zone.key, demand: ctx.demandaCobertura }) : null;
      if (record?.lines) sales(host, record, true);
      else if (zone.receitaFora != null || zone.pedidosFora != null) {
        stats(host, [
          zone.receitaFora != null ? ['Receita registrada', money(zone.receitaFora)] : null,
          zone.pedidosFora != null ? ['Pedidos registrados', integer(zone.pedidosFora)] : null,
          zone.ticketFora != null ? ['Ticket por pedido', money(zone.ticketFora)] : null,
          zone.pedidosFora != null ? ['Frequência média', decimal(zone.pedidosFora / zone.fora) + ' pedidos por cliente'] : null
        ]);
      } else sales(host, record, true);
    } else if (zone.fora) {
      host.appendChild(copy('Compras da demanda descoberta suprimidas para preservar a privacidade do grupo'));
    }
    back(host, ctx.aoLimparDetalhe);
  };

  function raioInput(label, value, onChange) {
    const input = el('input', { type: 'number', min: coverage().RAIO_MIN / 1000, max: coverage().RAIO_MAX / 1000,
      step: '0.1', value: (value || 3000) / 1000, 'aria-label': label });
    return el('form', { class: 'geo-radius', onsubmit: event => {
      event.preventDefault();
      if (input.value && input.reportValidity()) onChange(Math.round(Number(input.value) * 1000));
    } }, [el('label', {}, [label, input]), el('button', { type: 'submit', class: 'geo__camada-btn' }, 'Aplicar')]);
  }

  P.territorio = function (host, ctx) {
    const an = ctx.analiseCobertura;
    const source = MI.unidades.paraMapa();
    const pendentesSemMunicipio = source.filter(unit => !unit.uf || !unit.municipio);
    const noPainel = Array.from(new Set([...ctx.unidades, ...pendentesSemMunicipio]));
    const diagnostic = MI.unidades.diagnostico(noPainel);
    if (!diagnostic.total && !diagnostic.erro) return;
    const pending = noPainel.filter(u => !coverage().coordenadas(u));
    host.appendChild(heading('Cadastro de unidades'));
    stats(host, [
      ['Unidades reconhecidas', integer(diagnostic.total)], ['Com coordenadas', integer(diagnostic.exatas)],
      diagnostic.pendentes ? ['Aguardam coordenadas', integer(diagnostic.pendentes)] : null,
      diagnostic.porMunicipio ? ['Só por município', integer(diagnostic.porMunicipio)] : null,
      diagnostic.semPosicao ? ['Sem posição', integer(diagnostic.semPosicao)] : null,
      diagnostic.persistidas ? ['Persistidas no cadastro', integer(diagnostic.persistidas)] : null,
      diagnostic.daSessao ? ['Lidas nesta sessão', integer(diagnostic.daSessao)] : null,
      diagnostic.simuladas ? ['Simuladas', integer(diagnostic.simuladas)] : null,
      diagnostic.reais ? ['Reais', integer(diagnostic.reais)] : null,
      diagnostic.indefinidas ? ['Procedência indefinida', integer(diagnostic.indefinidas)] : null
    ]);
    if (diagnostic.erro) host.appendChild(copy('O cadastro persistido está indisponível para consulta.'));
    if (pending.length) {
      if (ctx.nivel !== 'brasil' && pendentesSemMunicipio.length) {
        host.appendChild(copy('Unidades sem município informado aparecem como pendências do cadastro ativo.'));
      }
      if (ctx.nivel === 'municipio') list(host, pending.map(unit => ({ label: unit.nome, unit })), null,
        () => 'Sem coordenada', x => ctx.aoSelecionarUnidade(x.unit));
    }
    if (!layers().analiseVisivel()) return;
    host.appendChild(heading('Cobertura operacional estimada'));
    if (!an.disponivel || an.erro || an.erroTerritorio) {
      host.appendChild(copy(an.erro || an.erroTerritorio ? 'O cálculo da malha está indisponível para este recorte.' :
        'A fonte ativa precisa de coordenadas de lojas elegíveis para calcular os raios.'));
      return;
    }
    const hasArea = an.areaTerritorio != null && an.areaCobertaTerritorio != null;
    const overlap = hasArea ? an.areaSobrepostaTerritorio : an.areaSobreposta;
    stats(host, [
      ['Unidades com raio elegível no recorte', integer(ctx.unidades.filter(u => coverage().coordenadas(u) && coverage().elegivel(u)).length)],
      [hasArea ? 'Cobertura dentro do território' : 'Área coberta pela rede', area(hasArea ? an.areaCobertaTerritorio : an.areaTotal)],
      ['Área em sobreposição', area(overlap)],
      hasArea ? ['Área descoberta', area(an.areaDescoberta)] : null,
      hasArea ? ['Percentual do território', fmt.pct(an.percentualTerritorial / 100, 1)] : null
    ]);
    host.appendChild(copy(hasArea ?
      'Denominador territorial: ' + area(an.areaTerritorio) + ' da malha de ' + ctx.tituloPainel + '. Os raios de lojas vizinhas entram no cálculo.' :
      'Área geográfica da união dos raios das unidades elegíveis no cadastro ativo.'));
    host.appendChild(copy('Alcance logístico estimado em linha reta. Os indicadores de clientes usam a base cadastrada no recorte.'));
    if (an.semCoordenadaElegiveis) host.appendChild(copy('A estimativa considera os raios conhecidos. Há unidades elegíveis com coordenadas pendentes.'));
    if (ctx.nivel === 'municipio') {
      host.appendChild(raioInput('Simular raio uniforme (km)', layers().raio(), value => {
        layers().raioEm(value);
        MI.geoMap.atualizarLojas();
      }));
      if (layers().raio()) host.appendChild(action('Restaurar raios cadastrados', () => {
        layers().raioEm(null);
        MI.geoMap.atualizarLojas();
      }));
    }
    const pairs = an.pares.filter(pair => ctx.unidades.includes(pair.a) || ctx.unidades.includes(pair.b)).slice(0, 4);
    list(host, pairs.map(pair => ({ label: pair.a.nome + ' × ' + pair.b.nome, area: pair.area })),
      'Área em comum por par · raio completo', pair => area(pair.area));
    const demand = ctx.demandaCobertura;
    const known = demand ? demand.dentro + demand.fora : 0;
    if (known) {
      const showBreakdown = [demand.dentro, demand.fora, demand.ausentes].every(data().visivel);
      const showMultiple = showBreakdown && data().visivel(demand.multipla) &&
        data().visivel(demand.dentro - demand.multipla);
      host.appendChild(heading('Cobertura da base cadastrada'));
      stats(host, [
        ['Dentro dos raios', showBreakdown ? count(demand.dentro) : 'Suprimido'],
        ['Fora dos raios', showBreakdown ? count(demand.fora) : 'Suprimido'],
        ['Com duas ou mais lojas no raio', showMultiple ? count(demand.multipla) : 'Suprimido'],
        ['Sem coordenada', showBreakdown ? count(demand.ausentes) : 'Suprimido'],
        showBreakdown ?
          ['Clientes no raio', fmt.pct(demand.dentro / known, 1)] : null,
        showBreakdown && hasArea && an.areaTerritorio > 0 && data().visivel(known) ?
          ['Densidade na base', decimal(known / (an.areaTerritorio / 1e6)) + ' por km²'] : null
      ]);
      if (showBreakdown) host.appendChild(copy('Estimativa sobre ' + count(known) +
        (demand.identificados ? ' clientes identificados' : ' registros') + ' com posição territorial no recorte.'));
      const zones = demand.zonas.filter(z => z.fora >= MI.privacy.k && data().visivel(z.dentro)).slice(0, 12);
      list(host, zones, 'Investigar demanda descoberta', z => count(z.fora) + ' clientes', z => ctx.aoSelecionarZona(z.key));
    } else {
      host.appendChild(copy('Cobertura de clientes indisponível para o recorte atual.'));
    }
  };

  MI.storePanel = P;
})(window.MI);
