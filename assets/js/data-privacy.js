/* 10 Move Intelligence — privacidade e governança de compartilhamento
   -------------------------------------------------------------------------
   O que esta camada FAZ de verdade nesta versão:
     · supressão de categorias e células com menos de k registros;
     · medição de k-anonimato real sobre combinações de quase-identificadores;
     · separação entre a visão privada (Smoov) e a visão de indicadores
       aprovados (10 Move), com bloqueio de acesso à base bruta;
     · trilha local das aprovações.
   O que NÃO faz (e a interface diz isso explicitamente):
     · autenticação, autorização validada em servidor, isolamento por
       organização e auditoria à prova de adulteração. Isso exige backend.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const P = {};

  P.K_DEFAULT = 30;
  P.k = MI.storage.get('k', P.K_DEFAULT);
  P.setK = function (k) {
    P.k = Math.max(2, Math.min(500, Math.round(k) || P.K_DEFAULT));
    MI.storage.set('k', P.k);
    MI.store.emit('privacy', P.k);
  };

  /* Catálogo de indicadores que podem ser compartilhados com a 10 Move.
     Cada um é um agregado — nunca um registro individual. */
  P.INDICATORS = [
    { id: 'base.volume', label: 'Volume da base e clientes únicos', view: 'overview', desc: 'Total de registros, clientes únicos e completude.' },
    { id: 'demo.genero', label: 'Distribuição por gênero', view: 'profile', desc: 'Participação percentual por gênero.' },
    { id: 'demo.idade', label: 'Distribuição por idade', view: 'profile', desc: 'Faixas de idade, mediana e quartis.' },
    { id: 'demo.cruzamento', label: 'Cruzamento gênero × faixa de idade', view: 'profile', desc: 'Tabela cruzada com supressão de células pequenas.', sensitive: true },
    { id: 'geo.uf', label: 'Distribuição por estado', view: 'geography', desc: 'Participação e ranking por UF.' },
    { id: 'geo.cidade', label: 'Ranking de cidades', view: 'geography', desc: 'Principais cidades por volume.', sensitive: true },
    { id: 'geo.concentracao', label: 'Índices de concentração geográfica', view: 'geography', desc: 'Top 5, top 10 e HHI.' },
    { id: 'comp.horarios', label: 'Mapa de calor dia × horário', view: 'behavior', desc: 'Volume relativo por dia da semana e hora.' },
    { id: 'comp.frequencia', label: 'Frequência e recência', view: 'behavior', desc: 'Estatísticas descritivas de uso.' },
    { id: 'comp.sazonalidade', label: 'Sazonalidade mensal', view: 'behavior', desc: 'Série mensal de atividade e cadastros.' },
    { id: 'neg.ticket', label: 'Ticket médio e receita', view: 'opportunities', desc: 'Média, mediana e percentis de valor.', sensitive: true },
    { id: 'neg.canal', label: 'Canais de aquisição', view: 'opportunities', desc: 'Participação por canal.' },
    { id: 'neg.plano', label: 'Mix de planos / produtos', view: 'opportunities', desc: 'Participação por plano.' },
    { id: 'neg.segmentos', label: 'Segmentos de valor (RFM)', view: 'opportunities', desc: 'Tamanho e perfil de cada segmento.' },
    { id: 'neg.oportunidades', label: 'Oportunidades comerciais', view: 'opportunities', desc: 'Índices de afinidade e leituras derivadas.' },
    { id: 'opp.campanhas', label: 'Oportunidades de marketing', view: 'opportunities', desc: 'Hipóteses de campanha fundamentadas em dados.' },

    { id: 'cat.catalogo', label: 'Catálogo de produtos', view: 'catalog', desc: 'Produtos, categorias, preços e disponibilidade.' },

    { id: 'cons.produtos', label: 'Produtos e categorias mais vendidos', view: 'consumption', desc: 'Ranking de produtos e participação por categoria.' },
    { id: 'cons.ticket', label: 'Ticket médio por categoria', view: 'consumption', desc: 'Receita e valor médio por categoria.', sensitive: true },
    { id: 'cons.horarios', label: 'Demanda por horário e dia', view: 'consumption', desc: 'Volume vendido por faixa do dia e dia da semana.' },
    { id: 'cons.perfil', label: 'Consumo por perfil demográfico', view: 'consumption', desc: 'Mix de categorias por faixa de idade, gênero e região.', sensitive: true },
    { id: 'cons.geo', label: 'Consumo por localidade', view: 'consumption', desc: 'Diferenças de mix entre estados e cidades.', sensitive: true },
    { id: 'cons.cesta', label: 'Produtos comprados juntos', view: 'consumption', desc: 'Co-ocorrência de produtos no mesmo pedido.' },
    { id: 'cons.recorrencia', label: 'Frequência e recorrência de compra', view: 'consumption', desc: 'Pedidos por cliente e taxa de recompra.' }
  ];
  P.INDICATOR_BY_ID = {};
  P.INDICATORS.forEach(function (i) { P.INDICATOR_BY_ID[i.id] = i; });

  /* Aprovação: por padrão, NADA é compartilhado. */
  P.approvals = MI.storage.get('approvals', {});
  P.isApproved = function (id) { return P.approvals[id] === true; };
  P.setApproved = function (id, value) {
    if (value) P.approvals[id] = true; else delete P.approvals[id];
    P.log(value ? 'aprovou' : 'revogou', id);
    MI.storage.set('approvals', P.approvals);
    MI.store.emit('approvals', P.approvals);
  };
  P.approvedCount = function () { return Object.keys(P.approvals).length; };
  P.setAllApproved = function (value) {
    if (value) P.INDICATORS.forEach(function (i) { P.approvals[i.id] = true; });
    else P.approvals = {};
    P.log(value ? 'aprovou todos os indicadores' : 'revogou todas as aprovações', '*');
    MI.storage.set('approvals', P.approvals);
    MI.store.emit('approvals', P.approvals);
  };

  /* Trilha local de decisões (demonstrativa — não é auditoria segura) */
  P.trail = MI.storage.get('trail', []);
  P.log = function (acao, alvo) {
    P.trail.unshift({ t: new Date().toISOString(), acao: acao, alvo: alvo });
    if (P.trail.length > 200) P.trail.length = 200;
    MI.storage.set('trail', P.trail);
  };
  P.clearTrail = function () { P.trail = []; MI.storage.set('trail', []); MI.store.emit('approvals', P.approvals); };

  /* Pode exibir este indicador no perfil atual?
     Smoov e administrador técnico veem todos os indicadores; a 10 Move vê
     apenas os aprovados. O técnico, porém, nunca vê registros individuais
     e tem a supressão sempre ativa. */
  P.canSee = function (indicatorId) {
    if (!MI.store.isTenMove()) return true;
    return P.isApproved(indicatorId);
  };
  /* A supressão vale sempre para 10 Move e técnico; para a Smoov é opcional. */
  P.previewMask = MI.storage.get('previewMask', false);
  P.setPreviewMask = function (v) {
    P.previewMask = !!v; MI.storage.set('previewMask', P.previewMask); MI.store.emit('privacy', P.k);
  };
  P.masking = function () { return MI.store.isTenMove() || MI.store.isTech() || P.previewMask; };

  /* Permissões por perfil, aplicadas de fato na interface */
  P.podeImportar = function () { return MI.store.perspective === 'smoov'; };
  P.podeVerLinhas = function () { return MI.store.perspective === 'smoov'; };
  P.podeEditarCatalogo = function () { return MI.store.perspective === 'smoov'; };
  P.podeAprovar = function () { return MI.store.perspective === 'smoov'; };

  /* ---------- Supressão em distribuições ---------- */
  /* Devolve a mesma lista, com categorias < k agrupadas em "Suprimido". */
  P.guardDist = function (dist) {
    if (!dist || !dist.length) return dist;
    const k = P.k;
    if (!P.masking()) {
      dist.forEach(function (e) { e.atRisk = e.value < k; });
      return dist;
    }
    const keep = [], small = [];
    dist.forEach(function (e) { (e.value < k && !e.isOther ? small : keep).push(e); });
    if (!small.length) return dist;
    const sup = MI.sum(small, function (e) { return e.value; });
    const out = keep.slice();
    out.push({ label: 'Suprimido (< ' + k + ')', value: sup, suppressed: true, groups: small.length });
    const total = dist.total || MI.sum(dist, function (e) { return e.value; });
    out.forEach(function (e) { e.pct = total ? e.value / total : 0; });
    out.total = total;
    out.missing = dist.missing;
    out.suppressedGroups = small.length;
    out.suppressedCount = sup;
    return out;
  };

  /* ---------- Supressão em tabelas cruzadas ---------- */
  P.guardCrosstab = function (ct) {
    if (!ct) return ct;
    const k = P.k;
    let masked = 0, atRisk = 0;
    const mask = ct.matrix.map(function (row) {
      return row.map(function (v) {
        if (v > 0 && v < k) { atRisk++; if (P.masking()) { masked++; return true; } }
        return false;
      });
    });
    ct.mask = mask;
    ct.maskedCells = masked;
    ct.atRiskCells = atRisk;
    ct.k = k;
    ct.isMasked = P.masking();
    return ct;
  };

  /* ---------- Medição de k-anonimato ----------
     Combinações de quase-identificadores presentes na base. */
  P.quasiIdentifiers = function () {
    const st = MI.store, out = [];
    const add = function (fields, label) {
      if (fields.every(function (f) { return st.has(f); })) out.push({ fields: fields, label: label });
    };
    add(['_uf', '_genero', '_faixa'], 'Estado + gênero + faixa de idade');
    add(['_cidade', '_faixa'], 'Cidade + faixa de idade');
    add(['_cidade', '_genero', '_faixa'], 'Cidade + gênero + faixa de idade');
    add(['_cidade', '_genero'], 'Cidade + gênero');
    add(['_bairro', '_faixa'], 'Bairro + faixa de idade');
    add(['_cidade', '_plano', '_faixa'], 'Cidade + plano + faixa de idade');
    add(['_uf', '_idade'], 'Estado + idade exata');
    return out;
  };

  P.kAnonymity = function (rows, fields) {
    const m = new Map();
    let considered = 0;
    for (let i = 0; i < rows.length; i++) {
      let key = '', ok = true;
      for (let f = 0; f < fields.length; f++) {
        const v = rows[i][fields[f]];
        if (v == null || v === '') { ok = false; break; }
        key += String(v) + '\u0001';
      }
      if (!ok) continue;
      considered++;
      m.set(key, (m.get(key) || 0) + 1);
    }
    if (!considered) return null;
    let minK = Infinity, singles = 0, belowK = 0, rowsBelowK = 0;
    m.forEach(function (c) {
      if (c < minK) minK = c;
      if (c === 1) singles++;
      if (c < P.k) { belowK++; rowsBelowK += c; }
    });
    return {
      fields: fields, classes: m.size, considered: considered,
      minK: minK === Infinity ? 0 : minK, singletons: singles,
      classesBelowK: belowK, rowsBelowK: rowsBelowK,
      shareBelowK: considered ? rowsBelowK / considered : 0
    };
  };

  P.riskReport = function (rows) {
    return P.quasiIdentifiers().map(function (q) {
      const r = P.kAnonymity(rows, q.fields);
      if (!r) return null;
      r.label = q.label;
      r.level = r.minK >= P.k ? 'ok' : r.shareBelowK > 0.15 ? 'alto' : r.singletons > 0 ? 'medio' : 'baixo';
      return r;
    }).filter(Boolean).sort(function (a, b) { return b.shareBelowK - a.shareBelowK; });
  };

  /* ---------- Exportação: o que a 10 Move pode levar ---------- */
  P.canExportMicrodata = function () { return !MI.store.isTenMove(); };

  P.redactLabel = 'Indicador não liberado para compartilhamento';

  MI.privacy = P;

})(window.MI);
