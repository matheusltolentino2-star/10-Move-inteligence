/* 10 Move Intelligence — importação de Excel e CSV
   -------------------------------------------------------------------------
   O arquivo é lido com FileReader e processado com SheetJS DENTRO do
   navegador. Nenhum byte é enviado para servidor, para a 10 Move ou para
   qualquer serviço de IA. Se a aba de rede do navegador for aberta durante
   a importação, nenhuma requisição aparece.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const I = {};
  const LIMITE_AVISO = 250000;

  I.aceita = '.xlsx,.xlsm,.xls,.csv,.txt,.tsv';

  /* ---------------- Texto: codificação e delimitador ----------------
     Planilhas brasileiras exportadas como CSV costumam vir em Windows-1252
     e com ponto e vírgula. Além disso, o SheetJS lê "0,07" como 7 (trata a
     vírgula como separador de milhar), então o CSV é parseado aqui, mantendo
     tudo como texto, e a conversão numérica fica com MI.parseNumber, que
     entende o formato pt-BR. */
  function decodificar(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      try { return new TextDecoder('windows-1252').decode(bytes); }
      catch (e2) { return new TextDecoder('utf-8').decode(bytes); }
    }
  }

  function detectarDelimitador(texto) {
    const amostra = texto.split(/\r?\n/).slice(0, 20).join('\n');
    const candidatos = [';', ',', '\t', '|'];
    let melhor = ';', melhorScore = -1;
    candidatos.forEach(function (d) {
      let fora = true, n = 0;
      for (let i = 0; i < amostra.length; i++) {
        const c = amostra[i];
        if (c === '"') fora = !fora;
        else if (fora && c === d) n++;
      }
      if (n > melhorScore) { melhorScore = n; melhor = d; }
    });
    return melhorScore > 0 ? melhor : ';';
  }

  function parseCsv(texto, delim) {
    const linhas = [];
    let campo = '', linha = [], dentroAspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (dentroAspas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; }
          else dentroAspas = false;
        } else campo += c;
        continue;
      }
      if (c === '"') { dentroAspas = true; continue; }
      if (c === delim) { linha.push(campo.trim()); campo = ''; continue; }
      if (c === '\n') { linha.push(campo.trim()); linhas.push(linha); linha = []; campo = ''; continue; }
      if (c === '\r') continue;
      campo += c;
    }
    if (campo !== '' || linha.length) { linha.push(campo.trim()); linhas.push(linha); }
    /* descarta linhas completamente vazias */
    return linhas.filter(function (l) { return l.some(function (v) { return v !== ''; }); });
  }

  /* ---------------- Leitura do arquivo ---------------- */
  I.readFile = function (file, onProgress) {
    return new Promise(function (resolve, reject) {
      const nome = file.name || 'arquivo';
      const ext = (nome.split('.').pop() || '').toLowerCase();
      if (['xlsx', 'xlsm', 'xls', 'csv', 'txt', 'tsv'].indexOf(ext) < 0) {
        return reject(new Error('Formato não suportado: .' + ext + '. Use .xlsx, .xls ou .csv.'));
      }
      if (file.size > 120 * 1024 * 1024) {
        return reject(new Error('Arquivo de ' + MI.fmt.bytes(file.size) + ' é grande demais para o navegador. Exporte um recorte menor ou divida a planilha.'));
      }

      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Não foi possível ler o arquivo. Ele pode estar aberto em outro programa ou corrompido.')); };
      reader.onprogress = function (e) {
        if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total * 0.4, 'Lendo o arquivo…');
      };
      reader.onload = function () {
        try {
          if (onProgress) onProgress(0.5, 'Interpretando a planilha…');

          /* CSV e texto: parser próprio (decimal com vírgula, acentos ANSI) */
          if (['csv', 'txt', 'tsv'].indexOf(ext) >= 0) {
            const texto = decodificar(reader.result);
            const delim = ext === 'tsv' ? '\t' : detectarDelimitador(texto);
            const matrix = parseCsv(texto, delim);
            if (!matrix.length) throw new Error('O arquivo não contém linhas legíveis.');
            const cols = matrix.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
            if (onProgress) onProgress(0.65, 'Pronto.');
            return resolve({
              kind: 'csv', matrix: matrix, delim: delim,
              sheets: [{ name: 'Dados', rows: matrix.length, cols: cols }],
              fileName: nome, fileSize: file.size, ext: ext
            });
          }

          if (!window.XLSX) throw new Error('A biblioteca de leitura de planilhas não carregou. Verifique a conexão e recarregue a página.');
          const wb = XLSX.read(new Uint8Array(reader.result), {
            type: 'array', cellDates: true, cellText: false, dense: true, raw: false
          });
          if (!wb.SheetNames || !wb.SheetNames.length) throw new Error('A planilha não contém abas legíveis.');

          const sheets = wb.SheetNames.map(function (name) {
            const ws = wb.Sheets[name];
            const ref = ws && ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
            return {
              name: name,
              rows: ref ? ref.e.r - ref.s.r + 1 : 0,
              cols: ref ? ref.e.c - ref.s.c + 1 : 0
            };
          });
          if (onProgress) onProgress(0.65, 'Pronto.');
          resolve({ kind: 'wb', wb: wb, sheets: sheets, fileName: nome, fileSize: file.size, ext: ext });
        } catch (e) {
          reject(new Error('Falha ao interpretar o arquivo: ' + (e.message || e)));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  /* ================= Escolha da aba =================
     Planilhas reais costumam trazer abas de documentação (“Leia-me”,
     “Dicionário”, “Índice”). Pegar a primeira aba com conteúdo importa o
     manual no lugar dos dados — por isso as abas são pontuadas. */
  const NOMES_DOC = /^(leia[\s_-]?me|readme|read[\s_-]?me|instru|dicion|glossar|glossár|legenda|sobre|capa|menu|indice|índice|sumario|sumário|notas?|info|ajuda|help|metadad|documenta|controle|param)/i;
  const NOMES_AGREGADO = /(resumo|consolidad|totais|pivot|dashboard|grafico|gráfico|coorte|cohort)/i;

  I.pontuarAbas = function (src, dica) {
    const re = dica ? new RegExp(dica.join('|'), 'i') : null;
    const abas = src.sheets.map(function (s) {
      const linhasDados = Math.max(0, s.rows - 1);
      let score = linhasDados > 0 ? Math.log10(linhasDados + 1) * Math.min(s.cols, 40) : 0;
      const motivos = [];
      if (NOMES_DOC.test(s.name)) { score *= 0.03; motivos.push('nome sugere documentação, não dados'); }
      if (NOMES_AGREGADO.test(s.name)) { score *= 0.45; motivos.push('nome sugere dado já agregado'); }
      if (s.cols <= 2) { score *= 0.25; motivos.push('apenas ' + s.cols + ' coluna(s)'); }
      if (linhasDados < 3) { score *= 0.2; motivos.push('poucas linhas'); }
      if (re && re.test(MI.slug(s.name))) { score *= 3.2; motivos.push('nome corresponde ao tipo de base procurado'); }
      return {
        name: s.name, rows: s.rows, cols: s.cols, linhasDados: linhasDados,
        score: score, motivos: motivos
      };
    });
    const ordenadas = abas.slice().sort(function (a, b) { return b.score - a.score; });
    const melhor = ordenadas[0];
    abas.forEach(function (a) { a.recomendada = melhor && a.name === melhor.name && a.score > 0; });
    return { abas: abas, recomendada: melhor && melhor.score > 0 ? melhor.name : src.sheets[0].name };
  };

  /* ================= Detecção da linha de cabeçalho =================
     Avalia cada linha candidata pela qualidade dela COMO cabeçalho das
     linhas abaixo: proporção de rótulos de texto, rótulos distintos,
     largura compatível com o corpo da tabela e mudança de tipo entre o
     rótulo e os dados. */
  function ehNumero(v) {
    if (typeof v === 'number') return true;
    const s = String(v).trim();
    if (!s) return false;
    return /^-?\s*(r\$)?\s*[\d.,]+\s*%?$/i.test(s) && /\d/.test(s);
  }
  function ehData(v) {
    if (v instanceof Date) return true;
    const s = String(v).trim();
    return /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s);
  }
  function naoVazio(v) { return v !== '' && v != null && String(v).trim() !== ''; }

  function analisarCabecalho(matrix) {
    const nLinhas = matrix.length;
    const preench = matrix.map(function (r) { return (r || []).filter(naoVazio).length; });

    /* largura típica do corpo de dados: moda das contagens não nulas */
    const freq = new Map();
    for (let i = 0; i < nLinhas; i++) {
      if (preench[i] < 2) continue;
      freq.set(preench[i], (freq.get(preench[i]) || 0) + 1);
    }
    let largura = 0, melhorFreq = -1;
    freq.forEach(function (f, w) {
      if (f > melhorFreq || (f === melhorFreq && w > largura)) { melhorFreq = f; largura = w; }
    });
    if (!largura) largura = Math.max.apply(null, preench.concat([1]));

    const limite = Math.min(60, nLinhas);
    let melhor = null;
    for (let i = 0; i < limite; i++) {
      const r = matrix[i] || [];
      const cheias = [];
      for (let c = 0; c < r.length; c++) if (naoVazio(r[c])) cheias.push({ c: c, v: String(r[c]).trim() });
      if (cheias.length < 2 || cheias.length < largura * 0.55) continue;

      /* linhas abaixo que têm conteúdo */
      const abaixo = [];
      for (let j = i + 1; j < Math.min(nLinhas, i + 26); j++) {
        if (preench[j] >= Math.max(2, largura * 0.4)) abaixo.push(matrix[j]);
      }
      if (!abaixo.length) continue;

      const textos = cheias.filter(function (x) { return !ehNumero(x.v) && !ehData(x.v); }).length;
      const textRatio = textos / cheias.length;
      const distintos = new Set(cheias.map(function (x) { return MI.slug(x.v); })).size;
      const uniqRatio = distintos / cheias.length;
      const widthScore = Math.min(cheias.length, largura) / Math.max(cheias.length, largura);
      const fillAbaixo = MI.sum(abaixo, function (r2) { return (r2 || []).filter(naoVazio).length; }) / (abaixo.length * largura);

      /* mudança de tipo: rótulo é texto e a coluna abaixo é majoritariamente número/data */
      let colunasComMudanca = 0, colunasAvaliadas = 0;
      cheias.forEach(function (x) {
        const valores = abaixo.map(function (r2) { return (r2 || [])[x.c]; }).filter(naoVazio);
        if (valores.length < 3) return;
        colunasAvaliadas++;
        const numericos = valores.filter(function (v) { return ehNumero(v) || ehData(v); }).length;
        const rotuloTexto = !ehNumero(x.v) && !ehData(x.v);
        if (rotuloTexto && numericos / valores.length >= 0.6) colunasComMudanca++;
      });
      const typeShift = colunasAvaliadas ? colunasComMudanca / colunasAvaliadas : 0;

      /* penalidades: frases longas (texto corrido de contexto) e rótulos repetidos */
      const frases = cheias.filter(function (x) { return x.v.length > 55 || /[.!?]\s/.test(x.v); }).length;
      const penaFrase = (frases / cheias.length) * 1.8;
      const penaDup = (1 - uniqRatio) * 0.9;
      const penaTopo = i > 30 ? 0.4 : 0;

      const score = 2.2 * textRatio + 1.5 * uniqRatio + 2.1 * widthScore +
        1.5 * Math.min(1, fillAbaixo) + 1.3 * typeShift - penaFrase - penaDup - penaTopo;

      if (!melhor || score > melhor.score) {
        melhor = {
          idx: i, score: score, textRatio: textRatio, uniqRatio: uniqRatio,
          widthScore: widthScore, typeShift: typeShift, largura: largura, cheias: cheias.length
        };
      }
    }

    if (!melhor) return { idx: 0, score: 0, textRatio: 0, largura: largura, confianca: 0, suspeita: true };
    /* 8,6 é o teto prático da soma dos pesos */
    melhor.confianca = Math.max(0, Math.min(1, melhor.score / 8.6));
    melhor.suspeita = melhor.textRatio < 0.55 || melhor.confianca < 0.45;
    return melhor;
  }

  /* ---------------- Extração de uma aba ---------------- */
  /* opts: { headerRow: 1-based para forçar, semCabecalho: true } */
  I.extractSheet = function (src, sheetName, opts) {
    opts = opts || {};
    let matrix;
    if (src.kind === 'csv') {
      matrix = src.matrix;
    } else {
      const ws = src.wb.Sheets[sheetName];
      if (!ws) throw new Error('Aba “' + sheetName + '” não encontrada.');
      matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true, raw: false });
    }
    if (!matrix || !matrix.length) throw new Error('A aba “' + sheetName + '” está vazia.');

    /* normaliza: remove linhas totalmente vazias do fim e apara espaços */
    matrix = matrix.map(function (r) {
      return (r || []).map(function (v) { return typeof v === 'string' ? v.trim() : (v == null ? '' : v); });
    });
    while (matrix.length && !matrix[matrix.length - 1].some(naoVazio)) matrix.pop();
    if (!matrix.length) throw new Error('A aba “' + sheetName + '” está vazia.');

    const analise = analisarCabecalho(matrix);
    let headerIdx = analise.idx;
    let semCabecalho = !!opts.semCabecalho;
    if (opts.headerRow != null) headerIdx = Math.max(0, Math.min(matrix.length - 1, opts.headerRow - 1));

    /* largura real: maior linha entre o cabeçalho e as 50 seguintes */
    let largura = 0;
    for (let i = headerIdx; i < Math.min(matrix.length, headerIdx + 50); i++) {
      largura = Math.max(largura, (matrix[i] || []).length);
    }

    let headers;
    if (semCabecalho) {
      headers = [];
      for (let c = 0; c < largura; c++) headers.push('coluna_' + (c + 1));
      headerIdx = headerIdx - 1; /* a linha do "cabeçalho" vira dado */
    } else {
      const bruto = [];
      for (let c = 0; c < largura; c++) {
        const v = (matrix[headerIdx] || [])[c];
        bruto.push(naoVazio(v) ? String(v).trim() : 'coluna_' + (c + 1));
      }
      const vistos = {};
      headers = bruto.map(function (h) {
        if (vistos[h] != null) { vistos[h]++; return h + '_' + vistos[h]; }
        vistos[h] = 1; return h;
      });
    }

    /* contexto: linhas acima do cabeçalho que tinham conteúdo */
    const contexto = [];
    for (let i = 0; i < Math.max(0, headerIdx); i++) {
      const txt = (matrix[i] || []).filter(naoVazio).map(String).join(' · ').trim();
      if (txt) contexto.push({ linha: i + 1, texto: txt.length > 160 ? txt.slice(0, 160) + '…' : txt });
    }

    /* corpo */
    const RE_RODAPE = /^(total|totais|subtotal|soma|m[eé]dia|geral|resultado)\b/i;
    const rows = [];
    const rodape = [];
    for (let i = headerIdx + 1; i < matrix.length; i++) {
      const r = matrix[i] || [];
      const cheias = r.filter(naoVazio).length;
      if (!cheias) continue;
      const primeira = String((r.filter(naoVazio)[0] || '')).trim();
      if (RE_RODAPE.test(primeira) && cheias <= Math.max(2, largura * 0.6)) {
        rodape.push({ linha: i + 1, texto: r.filter(naoVazio).map(String).join(' · ').slice(0, 160) });
        continue;
      }
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        const v = r[c];
        obj[headers[c]] = v === undefined || v === null ? '' : v;
      }
      rows.push(obj);
    }
    if (!rows.length) {
      throw new Error('A aba “' + sheetName + '” não tem linhas de dados abaixo do cabeçalho detectado (linha ' + (headerIdx + 1) + ').');
    }

    /* descarta colunas vazias tanto no cabeçalho quanto nos dados */
    const amostra = Math.min(rows.length, 500);
    const manter = headers.filter(function (h, idx) {
      if (!/^coluna_\d+$/.test(h)) return true;
      for (let i = 0; i < amostra; i++) if (naoVazio(rows[i][h])) return true;
      return false;
    });
    if (manter.length !== headers.length) {
      const removidas = headers.length - manter.length;
      headers = manter;
      for (let i = 0; i < rows.length; i++) {
        const novo = {};
        for (let c = 0; c < headers.length; c++) novo[headers[c]] = rows[i][headers[c]];
        rows[i] = novo;
      }
      contexto.colunasRemovidas = removidas;
    }

    return {
      headers: headers, rows: rows,
      headerRow: semCabecalho ? null : headerIdx + 1,
      semCabecalho: semCabecalho,
      contexto: contexto,
      rodape: rodape,
      confianca: analise.confianca || 0,
      suspeita: semCabecalho ? false : !!analise.suspeita,
      colunasRemovidas: contexto.colunasRemovidas || 0
    };
  };

  /* ---------------- Montagem do dataset ---------------- */
  I.buildDataset = function (extracted, meta) {
    const schema = MI.inferSchema(extracted.headers, extracted.rows);
    return {
      name: meta.name,
      source: 'import',
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      sheetName: meta.sheetName,
      headerRow: extracted.headerRow,
      rows: extracted.rows,
      headers: extracted.headers,
      columns: schema.columns,
      roles: schema.roles,
      createdAt: new Date(),
      warnings: extracted.rows.length > LIMITE_AVISO
        ? ['A planilha tem ' + MI.fmt.int(extracted.rows.length) + ' linhas. A navegação pode ficar lenta neste navegador.']
        : []
    };
  };

  /* ---------------- Relatório de qualidade ---------------- */
  I.quality = function (ds) {
    const issues = [];
    const rows = ds.rows, n = rows.length;

    ds.columns.forEach(function (c) {
      if (c.filled === 0) {
        issues.push({ level: 'crit', col: c.key, titulo: 'Coluna totalmente vazia', texto: '“' + c.label + '” não tem nenhum valor. Ela será ignorada nas análises.' });
        return;
      }
      if (c.missingRate >= 0.3) {
        issues.push({
          level: 'warn', col: c.key, titulo: MI.fmt.pct(c.missingRate, 1) + ' de valores ausentes',
          texto: '“' + c.label + '” está vazia em cerca de ' + MI.fmt.pct(c.missingRate, 1) +
            ' das linhas. Indicadores baseados nela cobrem menos registros e isso é informado no rodapé de cada gráfico.'
        });
      } else if (c.missingRate >= 0.05) {
        issues.push({
          level: 'info', col: c.key, titulo: MI.fmt.pct(c.missingRate, 1) + ' de valores ausentes',
          texto: '“' + c.label + '” tem vazios em proporção moderada. Os cálculos descartam as linhas sem valor.'
        });
      }
      if (c.distinct === 1 && c.filled > 10) {
        issues.push({
          level: 'info', col: c.key, titulo: 'Coluna com valor único',
          texto: '“' + c.label + '” tem o mesmo valor em todas as linhas preenchidas. Não serve como dimensão de análise.'
        });
      }
      /* idade/valores impossíveis */
      if (c.role === 'idade' && c.numeric) {
        if (c.numeric.min < 0 || c.numeric.max > 110) {
          issues.push({
            level: 'warn', col: c.key, titulo: 'Idades fora de faixa plausível',
            texto: '“' + c.label + '” vai de ' + MI.fmt.dec(c.numeric.min, 0) + ' a ' + MI.fmt.dec(c.numeric.max, 0) +
              '. Valores negativos ou acima de 120 são descartados automaticamente.'
          });
        }
      }
      if ((c.type === 'number' || c.type === 'integer') && c.numeric && c.numeric.min < 0 &&
        ['valor', 'receita', 'frequencia', 'duracao', 'recencia'].indexOf(c.role) >= 0) {
        issues.push({
          level: 'warn', col: c.key, titulo: 'Valores negativos em coluna de medida',
          texto: '“' + c.label + '” contém valores negativos (mínimo ' + MI.fmt.dec(c.numeric.min, 2) +
            '). Verifique se são estornos, devoluções ou erro de sinal.'
        });
      }
      /* datas improváveis */
      if ((c.type === 'date' || c.type === 'datetime') && c.dateRange) {
        const agora = new Date();
        if (c.dateRange.max && c.dateRange.max > new Date(agora.getFullYear() + 1, 0, 1)) {
          issues.push({
            level: 'warn', col: c.key, titulo: 'Datas no futuro',
            texto: '“' + c.label + '” tem data máxima em ' + MI.fmt.date(c.dateRange.max) + '. Pode ser erro de digitação ou formato invertido (mês/dia).'
          });
        }
        if (c.dateRange.min && c.dateRange.min < new Date(1920, 0, 1) && c.role !== 'nascimento') {
          issues.push({
            level: 'warn', col: c.key, titulo: 'Datas muito antigas',
            texto: '“' + c.label + '” tem data mínima em ' + MI.fmt.date(c.dateRange.min) + '. Verifique o formato de data da planilha.'
          });
        }
      }
      /* categorias com variação de grafia */
      if (c.type === 'category' && c.topValues.length > 1) {
        const norm = {};
        let colisoes = 0;
        c.topValues.forEach(function (v) {
          const k = MI.slug(v);
          if (norm[k] && norm[k] !== v) colisoes++;
          norm[k] = v;
        });
        if (colisoes) {
          issues.push({
            level: 'warn', col: c.key, titulo: 'Grafias inconsistentes',
            texto: '“' + c.label + '” tem valores que diferem apenas por acento, espaço ou caixa (ex.: ' +
              c.topValues.slice(0, 3).join(', ') + '). Isso divide a mesma categoria em várias.'
          });
        }
      }
    });

    /* identificadores duplicados */
    const idKey = ds.roles.id;
    let duplicados = 0, idsRepetidos = [];
    if (idKey) {
      const seen = new Map();
      for (let i = 0; i < n; i++) {
        const v = rows[i][idKey];
        if (v == null || v === '') continue;
        const c = (seen.get(v) || 0) + 1;
        seen.set(v, c);
        if (c === 2) { duplicados++; if (idsRepetidos.length < 5) idsRepetidos.push(v); }
      }
      if (duplicados) {
        issues.push({
          level: 'warn', col: idKey, titulo: MI.fmt.int(duplicados) + ' identificador(es) repetido(s)',
          texto: 'A coluna de identificador tem valores que aparecem mais de uma vez (ex.: ' + idsRepetidos.join(', ') +
            '). “Clientes únicos” é contado por valor distinto, então fica abaixo do total de registros. ' +
            'Se cada linha for uma transação e não um cliente, isso é esperado.'
        });
      }
    } else {
      issues.push({
        level: 'info', col: null, titulo: 'Sem coluna de identificador',
        texto: 'Nenhuma coluna foi reconhecida como identificador do cliente. ' +
          'Sem ela, a plataforma conta registros, não clientes únicos. Ajuste o mapeamento se existir essa coluna.'
      });
    }

    /* linhas totalmente duplicadas (amostra) */
    const amostra = Math.min(n, 40000);
    const vistos = new Set();
    let linhasDup = 0;
    for (let i = 0; i < amostra; i++) {
      const chave = ds.headers.map(function (h) { return rows[i][h]; }).join('\u0001');
      if (vistos.has(chave)) linhasDup++; else vistos.add(chave);
    }
    if (linhasDup) {
      issues.push({
        level: 'warn', col: null, titulo: MI.fmt.int(linhasDup) + ' linha(s) idêntica(s)',
        texto: 'Foram encontradas linhas com todos os valores iguais' +
          (amostra < n ? ' nas primeiras ' + MI.fmt.int(amostra) + ' linhas analisadas' : '') +
          '. Elas inflam contagens e distribuições.'
      });
    }

    /* papéis essenciais ausentes */
    const essenciais = [
      { key: 'idade', label: 'idade ou data de nascimento', alt: 'nascimento' },
      { key: 'genero', label: 'gênero' },
      { key: 'uf', label: 'estado' },
      { key: 'cidade', label: 'cidade' },
      { key: 'dataEvento', label: 'data da última atividade', alt: 'dataCadastro' }
    ];
    const faltando = essenciais.filter(function (e) { return !ds.roles[e.key] && !(e.alt && ds.roles[e.alt]); });
    if (faltando.length) {
      issues.push({
        level: 'info', col: null, titulo: 'Dimensões não encontradas',
        texto: 'Não foi reconhecida coluna de: ' + faltando.map(function (e) { return e.label; }).join(', ') +
          '. Os painéis dependentes delas aparecem como indisponíveis — ' +
          'se a coluna existe com outro nome, corrija no mapeamento abaixo.'
      });
    }

    const ordem = { crit: 0, warn: 1, info: 2 };
    issues.sort(function (a, b) { return ordem[a.level] - ordem[b.level]; });

    let filled = 0, cells = 0;
    ds.columns.forEach(function (c) { filled += c.filled; cells += c.sampled; });

    return {
      issues: issues,
      completude: cells ? filled / cells : 1,
      duplicados: duplicados,
      linhasDup: linhasDup,
      colunasVazias: ds.columns.filter(function (c) { return c.filled === 0; }).length,
      score: Math.max(0, Math.min(100, Math.round(
        100
        - issues.filter(function (i) { return i.level === 'crit'; }).length * 18
        - issues.filter(function (i) { return i.level === 'warn'; }).length * 7
        - issues.filter(function (i) { return i.level === 'info'; }).length * 2
      )))
    };
  };

  MI.importer = I;

})(window.MI);
