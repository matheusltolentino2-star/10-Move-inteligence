/* 10 Move Intelligence — o que esta planilha é, e o que fazer com ela
   -------------------------------------------------------------------------
   Antes, quem importava precisava saber de antemão se o arquivo era base de
   clientes ou de pedidos, escolher a aba certa e, se já houvesse uma base
   carregada, aceitar que a nova substituísse a anterior. Quem recebe uma
   pasta com "cadastro.xlsx", "vendas_out.csv" e "cardapio.xlsx" não deveria
   ter que explicar isso para a aplicação.

   Aqui estão duas decisões separadas, de propósito:

     1. QUE TIPO de planilha é esta — clientes, pedidos ou cardápio.
     2. O QUE FAZER com ela diante do que já está carregado — juntar colunas
        pela chave, empilhar linhas ou substituir.

   As duas devolvem os motivos junto com a resposta. Um palpite de máquina
   sobre o significado de uma planilha precisa poder ser conferido e
   derrubado por quem conhece os dados; por isso nada aqui decide sozinho:
   a tela mostra o que foi reconhecido, com o porquê, e a palavra final é
   de quem importou.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const K = {};

  /* Pistas de cabeçalho. Peso alto só para o que distingue de verdade:
     "valor" aparece tanto em base de cliente quanto em pedido e vale pouco;
     "id do pedido" ou "ingredientes" não aparecem nas outras e valem muito. */
  const PISTAS = {
    transacoes: [
      [/(^|_)(pedido|order|cupom|comanda|venda)(_|$)|num_?pedido|nota_?fiscal/, 3.5, 'identificador de pedido'],
      [/(^|_)(produto|item|sku|sabor)(_|$)|nome_?produto|desc_?(item|produto)/, 3, 'produto na linha'],
      [/valor_?unit|preco_?unit|unit_?price/, 2.5, 'valor unitário'],
      [/(^|_)(qtd|quantidade|qty|quant)(_|$)/, 1.5, 'quantidade na linha'],
      [/valor_?total|total_?(item|linha)/, 1.5, 'total da linha'],
      [/(^|_)(loja|unidade|filial|pdv|caixa)(_|$)/, 1, 'ponto de venda']
    ],
    clientes: [
      [/(^|_)(idade|age)(_|$)|faixa_?etaria/, 2.5, 'idade'],
      [/gener[oa]|sexo|gender/, 2.5, 'gênero'],
      [/nasc|birth|aniver/, 2, 'data de nascimento'],
      [/n_?pedidos|qtd_?pedidos|total_?pedidos|num_?compras|frequencia/, 2.5, 'contagem de pedidos por linha'],
      [/total_?gasto|gasto_?total|ltv|receita_?acum|monetar/, 2.5, 'valor acumulado por cliente'],
      [/ticket_?medi/, 2, 'ticket médio por cliente'],
      [/primeir[ao]_?(compra|pedido)|cadastro|signup|adesao|inscricao/, 2, 'data de entrada'],
      [/ultim[ao]_?(compra|pedido|atividade|acesso)/, 1.5, 'última atividade'],
      [/(^|_)(uf|estado|cidade|municipio|bairro|cep)(_|$)/, 1.5, 'localização do cliente'],
      [/(^|_)(nome|email|telefone|celular|whatsapp)(_|$)/, 1, 'dado cadastral']
    ],
    cardapio: [
      [/ingrediente|composicao/, 3.5, 'ingredientes'],
      [/alergen|alergic/, 3, 'alergênicos'],
      [/(^|_)(kcal|calorias|proteina|carboidrato|gordura)(_|$)/, 2.5, 'informação nutricional'],
      [/(^|_)(tamanho|size|volume)(_|$)|(^|_)ml(_|$)/, 2, 'tamanho do produto'],
      [/preco_?(venda|tabela|base|sugerido)|(^|_)preco(_|$)/, 1.5, 'preço de tabela'],
      [/(^|_)(subcategoria|familia|linha_?produto)(_|$)/, 1.5, 'categoria do produto'],
      [/disponi|ativo_?produto|em_?linha/, 1, 'disponibilidade']
    ]
  };

  function porPistas(headers) {
    const placar = { clientes: 0, transacoes: 0, cardapio: 0 };
    const motivos = { clientes: [], transacoes: [], cardapio: [] };
    const slugs = headers.map(function (h) { return MI.slug(h); });
    Object.keys(PISTAS).forEach(function (tipo) {
      PISTAS[tipo].forEach(function (p) {
        const bate = slugs.filter(function (s) { return p[0].test(s); });
        if (!bate.length) return;
        placar[tipo] += p[1];
        motivos[tipo].push(p[2]);
      });
    });
    return { placar: placar, motivos: motivos };
  }

  /* O cabeçalho sozinho engana: "id_cliente" aparece nos dois tipos. O que
     separa de verdade é a forma da tabela — uma linha por cliente tem
     identificador único, uma linha por item de pedido repete o mesmo
     cliente muitas vezes. */
  function porFormato(colunas, nLinhas, placar, motivos) {
    const idCol = colunas.filter(function (c) {
      return /(^|_)(id|cod|codigo)(_|$)|cliente|customer|cpf/.test(MI.slug(c.key));
    }).sort(function (a, b) { return b.distinct - a.distinct; })[0];

    if (idCol && idCol.filled > 20) {
      const unicidade = idCol.distinct / idCol.filled;
      if (unicidade > 0.9) {
        placar.clientes += 4;
        motivos.clientes.push('“' + idCol.label + '” quase não repete: uma linha por cliente');
      } else if (unicidade < 0.6) {
        placar.transacoes += 4;
        motivos.transacoes.push('“' + idCol.label + '” repete muito: várias linhas por cliente');
      }
    }

    /* Cardápio é curto e não fala de gente: dezenas ou centenas de produtos,
       sem cliente e sem data. */
    const temPessoa = colunas.some(function (c) {
      return /cliente|customer|cpf|idade|genero|sexo|email|telefone/.test(MI.slug(c.key));
    });
    const temData = colunas.some(function (c) { return c.type === 'date' || c.type === 'datetime'; });
    if (!temPessoa && !temData && nLinhas > 0 && nLinhas <= 2000) {
      placar.cardapio += 3;
      motivos.cardapio.push('sem cliente, sem data e com poucas linhas');
    }
    if (temPessoa) { placar.cardapio -= 4; }
    if (temData) {
      placar.transacoes += 1;
      motivos.transacoes.push('tem coluna de data');
    }
    return { idCol: idCol || null };
  }

  const NOME_TIPO = {
    clientes: 'Base de clientes',
    transacoes: 'Base de pedidos',
    cardapio: 'Cardápio de produtos'
  };
  K.nomeTipo = function (t) { return NOME_TIPO[t] || t; };

  /* ex: o que extractSheet devolveu. schema: opcional, se já foi inferido. */
  K.classificar = function (ex, schema) {
    const headers = ex.headers || [];
    if (!headers.length) return { tipo: null, confianca: 0, motivos: [], placar: {} };

    const s = schema || MI.inferSchema(headers, ex.rows || []);
    const p = porPistas(headers);
    porFormato(s.columns, (ex.rows || []).length, p.placar, p.motivos);

    const ordem = Object.keys(p.placar).sort(function (a, b) { return p.placar[b] - p.placar[a]; });
    const vencedor = ordem[0], segundo = ordem[1];
    const alto = p.placar[vencedor], proximo = Math.max(0, p.placar[segundo]);

    /* Confiança é a distância para o segundo colocado, não o valor absoluto:
       um placar alto com empate técnico não é reconhecimento, é dúvida. */
    const confianca = alto <= 0 ? 0 : Math.max(0, Math.min(1, (alto - proximo) / Math.max(alto, 6)));

    return {
      tipo: alto >= 4 ? vencedor : null,
      nome: alto >= 4 ? NOME_TIPO[vencedor] : null,
      confianca: confianca,
      segundo: alto >= 4 ? segundo : null,
      nomeSegundo: NOME_TIPO[segundo],
      motivos: p.motivos[vencedor].slice(0, 6),
      placar: p.placar,
      schema: s
    };
  };

  /* ---------------- O que fazer com ela ---------------- */

  function amostraDeChaves(rows, key, limite) {
    const s = new Set();
    for (let i = 0; i < rows.length && s.size < limite; i++) {
      const v = rows[i][key];
      if (v != null && v !== '') s.add(String(v).trim());
    }
    return s;
  }

  /* Compara a planilha nova com a base já carregada e diz o que faz sentido:
     acrescentar colunas aos mesmos clientes, acrescentar clientes novos, as
     duas coisas, ou simplesmente trocar de base. */
  K.planoDeJuncao = function (ex, schema, ds) {
    if (!ds || !ds.rows || !ds.rows.length) {
      return { recomendacao: 'substituir', motivo: 'Não há base carregada ainda.' };
    }
    const s = schema || MI.inferSchema(ex.headers, ex.rows);
    const chaveNova = s.roles.id;
    const chaveAtual = ds.roles.id;

    const iguais = ex.headers.filter(function (h) { return ds.headers.indexOf(h) >= 0; });
    const novas = ex.headers.filter(function (h) { return ds.headers.indexOf(h) < 0; });
    const mesmoFormato = novas.length === 0 && iguais.length === ds.headers.length;

    if (!chaveNova || !chaveAtual) {
      return {
        recomendacao: mesmoFormato ? 'empilhar' : 'substituir',
        chaveNova: chaveNova, chaveAtual: chaveAtual,
        colunasNovas: novas, colunasIguais: iguais,
        motivo: mesmoFormato
          ? 'As colunas são as mesmas da base atual, então dá para empilhar as linhas.'
          : 'Sem identificador de cliente nas duas bases não há como casar linha com linha.'
      };
    }

    const atuais = amostraDeChaves(ds.rows, chaveAtual, 20000);
    const novasChaves = amostraDeChaves(ex.rows, chaveNova, 20000);
    let encontradas = 0;
    novasChaves.forEach(function (v) { if (atuais.has(v)) encontradas++; });
    const sobreposicao = novasChaves.size ? encontradas / novasChaves.size : 0;
    const ineditas = novasChaves.size - encontradas;

    let recomendacao, motivo;
    if (sobreposicao >= 0.5 && novas.length) {
      recomendacao = ineditas > novasChaves.size * 0.15 ? 'ambos' : 'juntarColunas';
      motivo = MI.fmt.pct(sobreposicao, 0) + ' dos clientes desta planilha já estão na base, e ela traz ' +
        novas.length + ' colunas que a base não tem.';
    } else if (sobreposicao < 0.5 && (mesmoFormato || iguais.length >= ds.headers.length * 0.6)) {
      recomendacao = 'empilhar';
      motivo = 'As colunas batem com a base atual e ' + MI.fmt.int(ineditas) +
        ' clientes ainda não estão nela.';
    } else if (sobreposicao >= 0.5) {
      recomendacao = 'juntarColunas';
      motivo = MI.fmt.pct(sobreposicao, 0) + ' dos clientes já estão na base, mas a planilha não traz coluna nova.';
    } else {
      recomendacao = 'substituir';
      motivo = 'Quase nenhum cliente coincide e as colunas são outras: parece outra base, não um complemento.';
    }

    return {
      recomendacao: recomendacao,
      motivo: motivo,
      chaveNova: chaveNova,
      chaveAtual: chaveAtual,
      sobreposicao: sobreposicao,
      clientesIneditos: ineditas,
      clientesCoincidentes: encontradas,
      colunasNovas: novas,
      colunasIguais: iguais,
      mesmoFormato: mesmoFormato
    };
  };

  MI.classify = K;

})(window.MI);
