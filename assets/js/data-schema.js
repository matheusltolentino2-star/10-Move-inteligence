/* 10 Move Intelligence — detecção de esquema
   Descobre, sem estrutura fixa, o tipo de cada coluna e o papel analítico
   que ela pode cumprir (idade, gênero, cidade, UF, data, valor, etc.). */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  /* ---------------- Papéis analíticos ---------------- */
  /* match: regex no nome da coluna | types: tipos aceitos | detect: teste pelos valores */
  MI.ROLES = [
    {
      key: 'id', label: 'Identificador do cliente', group: 'Identificação',
      types: ['id', 'text', 'number', 'integer', 'category'],
      match: /^(id|cod|codigo|cpf|cnpj|hash)$|^(id|cod|codigo)_|_(id|cod)$|id_?(cliente|customer|user|usuario)|cliente_?id|customer|matricula|documento/,
      /* um arquivo pode ter pedido_id e cliente_id: o papel é do cliente */
      detect: function (col) { return /(cliente|customer|user|usuario|consumidor)/.test(MI.slug(col.key)); }
    },
    {
      key: 'genero', label: 'Gênero', group: 'Demografia', types: ['category', 'text'],
      match: /gener[oa]|sexo|gender/,
      detect: function (col) {
        if (col.type !== 'category' || col.distinct > 6) return false;
        const TOKENS = ['m', 'f', 'masc', 'fem', 'masculino', 'feminino', 'male', 'female',
          'homem', 'mulher', 'outro', 'other', 'nb', 'nao_binario', 'n_i', 'ni'];
        const bate = col.topValues.filter(function (v) { return TOKENS.indexOf(MI.slug(v)) >= 0; }).length;
        return bate >= 2 && bate >= col.topValues.length - 1;
      }
    },
    { key: 'idade', label: 'Idade (anos)', group: 'Demografia', types: ['number', 'integer'], match: /^idade$|^age$|idade_?(anos|cliente)|faixa_?idade/ },
    { key: 'nascimento', label: 'Data de nascimento', group: 'Demografia', types: ['date', 'datetime'], match: /nasc|birth|dt_?nasc|aniver/ },
    { key: 'uf', label: 'Estado / UF', group: 'Localização', types: ['category', 'text'], match: /^uf$|^estado$|^state$|sigla_?uf|uf_?(cliente|cadastro)/ },
    { key: 'cidade', label: 'Cidade', group: 'Localização', types: ['category', 'text'], match: /cidade|municip|city|localidade/ },
    { key: 'bairro', label: 'Bairro / região', group: 'Localização', types: ['category', 'text'], match: /bairro|distrito|regiao|zona|neighborhood|district/ },
    {
      key: 'dataEvento', label: 'Data da última atividade', group: 'Tempo', types: ['date', 'datetime'],
      match: /(ultim|last|recent).*(data|transac|compra|uso|pedido|viagem|corrida|acesso)|data.*(ultim|transac|compra|pedido|uso|viagem|corrida|evento|venda)|dt_?(venda|compra|pedido)/,
      /* “primeira compra” é entrada do cliente, não última atividade */
      hardDetect: true,
      detect: function (col) { return !/(primeir|first|inicial|entrada)/.test(MI.slug(col.key)); }
    },
    { key: 'dataCadastro', label: 'Data de cadastro', group: 'Tempo', types: ['date', 'datetime'], match: /cadastro|signup|sign_?up|registro|adesao|criacao|created|inscricao|entrada|primeir[ao]_?(compra|pedido|transac)|first_?(purchase|order)|data_?inicio|mes_?inicio/ },
    { key: 'hora', label: 'Horário preferido', group: 'Tempo', types: ['time', 'integer', 'number', 'category'], match: /^hora$|horario|hora_?(uso|preferid|pico|transac)|^hour$|time/ },
    { key: 'diaSemana', label: 'Dia da semana', group: 'Tempo', types: ['category', 'text', 'integer'], match: /dia_?(da_?)?semana|weekday|dow|dia_?preferido/ },
    { key: 'valor', label: 'Ticket médio / valor', group: 'Negócio', types: ['number', 'integer'], match: /ticket|valor|preco|price|gasto|amount|receita_?medi|vlr/ },
    { key: 'receita', label: 'Receita acumulada', group: 'Negócio', types: ['number', 'integer'], match: /receita|faturamento|revenue|ltv|total_?gasto|monetar/ },
    { key: 'frequencia', label: 'Frequência / nº de transações', group: 'Negócio', types: ['number', 'integer'], match: /frequen|freq|qtd|quantidade|n_?(transac|pedido|corrida|viagem|compra)|transac|pedidos|corridas|viagens|compras|uso_?mes|visitas/ },
    { key: 'plano', label: 'Plano / produto', group: 'Negócio', types: ['category', 'text'], match: /^plano$|^plan$|_plano|plano_|assinatura|^produto$|produto_|pacote|^tier$|categoria_?cliente|modalidade|familia|família/ },
    { key: 'canal', label: 'Canal de aquisição', group: 'Negócio', types: ['category', 'text'], match: /canal|channel|origem|aquisi|source|utm|midia|campanha/ },
    { key: 'status', label: 'Status do cliente', group: 'Negócio', types: ['category', 'text', 'boolean'], match: /status|situacao|ativo|churn|estagio|estado_?cliente/ },
    { key: 'recencia', label: 'Dias desde a última atividade', group: 'Tempo', types: ['number', 'integer'], match: /dias?_?(desde|sem|inativ|ultim)|recenc|recency|days?_?since/ },
    { key: 'satisfacao', label: 'Satisfação / NPS', group: 'Negócio', types: ['number', 'integer'], match: /nps|satisfac|avaliacao|rating|nota|score_?cliente|csat/ },
    { key: 'duracao', label: 'Duração média', group: 'Comportamento', types: ['number', 'integer'], match: /duracao|duration|tempo_?(medio|uso|sessao)|minutos|permanencia/ },
    { key: 'dispositivo', label: 'Dispositivo / plataforma', group: 'Comportamento', types: ['category', 'text'], match: /dispositivo|device|plataforma|platform|sistema|os$|app/ }
  ];
  MI.ROLE_BY_KEY = {};
  MI.ROLES.forEach(function (r) { MI.ROLE_BY_KEY[r.key] = r; });

  const TYPE_LABEL = {
    id: 'Identificador', number: 'Numérico', integer: 'Numérico inteiro', date: 'Data',
    datetime: 'Data e hora', time: 'Horário', category: 'Categoria', boolean: 'Sim/Não', text: 'Texto'
  };
  MI.typeLabel = function (t) { return TYPE_LABEL[t] || t; };

  const BOOL_TRUE = ['sim', 's', 'true', 'verdadeiro', '1', 'yes', 'y', 'ativo'];
  const BOOL_FALSE = ['nao', 'n', 'false', 'falso', '0', 'no', 'inativo'];

  /* ---------------- Inferência de tipo por coluna ---------------- */
  function inferColumn(key, rows, sampleSize) {
    const n = rows.length;
    const step = Math.max(1, Math.floor(n / (sampleSize || 4000)));
    const distinctSet = new Set();
    const counts = new Map();
    let filled = 0, missing = 0;
    let numOk = 0, intOk = 0, dateOk = 0, timeOk = 0, boolOk = 0, sampled = 0;
    let numMin = Infinity, numMax = -Infinity, numSum = 0;
    let dateMin = null, dateMax = null;
    let maxLen = 0, sumLen = 0;

    for (let i = 0; i < n; i += step) {
      const raw = rows[i][key];
      sampled++;
      if (raw == null || raw === '' || (typeof raw === 'string' && raw.trim() === '')) { missing++; continue; }
      filled++;
      const s = typeof raw === 'string' ? raw.trim() : raw;
      if (distinctSet.size < 3000) distinctSet.add(s);
      if (counts.size < 600) counts.set(s, (counts.get(s) || 0) + 1);
      const sl = String(s); if (sl.length > maxLen) maxLen = sl.length; sumLen += sl.length;

      const num = MI.parseNumber(s);
      if (num != null && !/^0\d/.test(sl)) {
        numOk++;
        if (Number.isInteger(num)) intOk++;
        if (num < numMin) numMin = num;
        if (num > numMax) numMax = num;
        numSum += num;
      }
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(sl)) timeOk++;
      const d = MI.parseDate(s);
      if (d && (typeof s !== 'number' || (s > 20000 && s < 60000))) {
        if (/[-/.]|^\d{5}$/.test(sl) || s instanceof Date) {
          dateOk++;
          if (!dateMin || d < dateMin) dateMin = d;
          if (!dateMax || d > dateMax) dateMax = d;
        }
      }
      const low = sl.toLowerCase();
      if (BOOL_TRUE.indexOf(low) >= 0 || BOOL_FALSE.indexOf(low) >= 0) boolOk++;
    }

    const ratio = function (x) { return filled ? x / filled : 0; };
    const distinct = distinctSet.size;
    const avgLen = filled ? sumLen / filled : 0;
    let type = 'text';
    const hasTimeComp = ratio(timeOk) > 0.8;

    if (filled === 0) type = 'text';
    else if (hasTimeComp) type = 'time';
    else if (ratio(dateOk) > 0.85 && ratio(numOk) < 0.9) type = 'date';
    else if (ratio(boolOk) > 0.95 && distinct <= 3) type = 'boolean';
    else if (ratio(numOk) > 0.9) {
      type = ratio(intOk) > 0.98 ? 'integer' : 'number';
      /* inteiro de altíssima cardinalidade com cara de código */
      if (type === 'integer' && distinct > sampled * 0.9 && /^(id|cod|cpf|matric)/i.test(key)) type = 'id';
      /* só vira categoria quando é claramente um sinalizador, não uma medida:
         contagens como "itens por pedido" (1..10) devem continuar numéricas */
      else if (type === 'integer' && distinct <= 4 && numMin >= 0 && numMax <= 9) type = 'category';
    }
    /* texto corrido não é categoria, mesmo com poucos valores distintos */
    else if (avgLen > 45) type = 'text';
    else if (distinct > filled * 0.92 && filled > 50) type = maxLen > 24 ? 'text' : 'id';
    else if (distinct <= Math.max(30, filled * 0.05)) type = 'category';
    else type = 'text';

    const top = MI.mapToSorted(counts, 8).map(function (e) { return e.label; });

    return {
      key: key,
      label: prettyLabel(key),
      type: type,
      typeLabel: TYPE_LABEL[type],
      distinct: distinct,
      distinctApprox: distinctSet.size >= 3000,
      filled: filled,
      missing: missing,
      sampled: sampled,
      missingRate: sampled ? missing / sampled : 0,
      topValues: top,
      avgLen: avgLen,
      numeric: numOk > 0 ? { min: numMin, max: numMax, mean: numOk ? numSum / numOk : null } : null,
      dateRange: dateOk > 0 ? { min: dateMin, max: dateMax } : null,
      role: null
    };
  }

  function prettyLabel(key) {
    const s = String(key).replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return key;
    const UP = { uf: 'UF', nps: 'NPS', cpf: 'CPF', id: 'ID', ltv: 'LTV', os: 'SO' };
    return s.split(' ').map(function (w, i) {
      const low = w.toLowerCase();
      if (UP[low]) return UP[low];
      if (i > 0 && ['de', 'da', 'do', 'das', 'dos', 'em', 'e'].indexOf(low) >= 0) return low;
      return low.charAt(0).toUpperCase() + low.slice(1);
    }).join(' ');
  }
  MI.prettyLabel = prettyLabel;

  /* ---------------- Atribuição de papéis ---------------- */
  function scoreRole(role, col) {
    if (role.types.indexOf(col.type) < 0) return 0;
    const slug = MI.slug(col.key);
    let score = 0;
    if (role.match && role.match.test(slug)) score += 100 - Math.min(40, slug.length);
    if (role.detect) {
      let ok = false;
      try { ok = !!role.detect(col); } catch (e) { }
      /* hardDetect: o teste de conteúdo pode VETAR o papel, não só reforçá-lo */
      if (ok) score += 55;
      else if (role.hardDetect) return 0;
    }

    /* reforços por conteúdo */
    if (role.key === 'uf' && col.topValues.length) {
      const hit = col.topValues.filter(function (v) { return MI.normalizeUf(v); }).length;
      if (hit >= Math.max(1, col.topValues.length - 1)) score += 70;
    }
    if (role.key === 'idade' && col.numeric) {
      if (col.numeric.min >= 0 && col.numeric.max <= 110 && col.numeric.mean > 15 && col.numeric.mean < 70) score += 35;
      else score -= 45;
    }
    if (role.key === 'hora' && col.type === 'time') score += 45;
    if (role.key === 'hora' && (col.type === 'integer' || col.type === 'number') && col.numeric) {
      if (col.numeric.min >= 0 && col.numeric.max <= 23) score += 30; else score -= 50;
    }
    if (role.key === 'satisfacao' && col.numeric && col.numeric.max <= 10 && col.numeric.min >= 0) score += 20;
    if (role.key === 'diaSemana' && col.topValues.length) {
      const dn = col.topValues.filter(function (v) {
        return MI.DIAS_SEMANA.concat(MI.DIAS_SEMANA_ABREV).some(function (d) { return MI.slug(d) === MI.slug(v); });
      }).length;
      if (dn >= 2) score += 70;
    }
    if (role.key === 'genero' && col.topValues.length) {
      /* exige o valor inteiro, não o prefixo: “Mapa de calor” não é “Masculino” */
      const TOK = ['m', 'f', 'o', 'masc', 'fem', 'masculino', 'feminino', 'male', 'female',
        'homem', 'mulher', 'homens', 'mulheres', 'outro', 'outros', 'other', 'nb',
        'nao_binario', 'n_i', 'ni', 'nao_informado'];
      const gn = col.topValues.filter(function (v) { return TOK.indexOf(MI.slug(v)) >= 0; }).length;
      if (gn >= 2 && gn >= col.topValues.length - 1) score += 45; else if (gn === 0) score -= 30;
    }
    if (role.key === 'id' && col.type === 'id') score += 30;
    if (role.key === 'cidade' && col.type === 'category' && col.distinct > 8) score += 12;
    return score;
  }

  /* Resolve o melhor par (coluna, papel) sem repetir papel nem coluna. */
  MI.assignRoles = function (columns) {
    const pairs = [];
    columns.forEach(function (col) {
      MI.ROLES.forEach(function (role) {
        const s = scoreRole(role, col);
        if (s > 40) pairs.push({ col: col.key, role: role.key, score: s });
      });
    });
    pairs.sort(function (a, b) { return b.score - a.score; });
    const roles = {}, usedCol = {}, usedRole = {};
    pairs.forEach(function (p) {
      if (usedCol[p.col] || usedRole[p.role]) return;
      usedCol[p.col] = true; usedRole[p.role] = true;
      roles[p.role] = p.col;
    });
    columns.forEach(function (c) {
      const r = Object.keys(roles).filter(function (k) { return roles[k] === c.key; })[0];
      c.role = r || null;
    });
    return roles;
  };

  MI.inferSchema = function (headers, rows) {
    const columns = headers.map(function (h) { return inferColumn(h, rows); });
    const roles = MI.assignRoles(columns);
    return { columns: columns, roles: roles };
  };

  /* Dimensões categóricas úteis para filtro/cruzamento (exclui IDs e texto livre) */
  MI.dimensionColumns = function (ds) {
    return ds.columns.filter(function (c) {
      if (c.type === 'id' || c.type === 'text') return false;
      if (c.role === 'id') return false;
      if (c.type === 'category' || c.type === 'boolean') return c.distinct <= 60 && c.distinct >= 2;
      /* inteiros de baixa cardinalidade também servem como dimensão de filtro */
      if (c.type === 'integer') return c.distinct >= 2 && c.distinct <= 12;
      return false;
    });
  };

  /* Métricas numéricas utilizáveis */
  MI.measureColumns = function (ds) {
    return ds.columns.filter(function (c) {
      return (c.type === 'number' || c.type === 'integer') && c.role !== 'id' && c.distinct > 3;
    });
  };

})(window.MI);
