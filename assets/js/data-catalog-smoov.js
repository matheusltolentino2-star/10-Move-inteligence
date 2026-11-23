/* 10 Move Intelligence — cardápio oficial da Smoov
   -------------------------------------------------------------------------
   ORIGEM: transcrito do cardápio oficial enviado pelo cliente em 23/11/2026
   (imagem do cardápio impresso "smoov · healthy smoothies").

   O que foi transcrito LITERALMENTE da peça:
     · nomes dos produtos, categorias e subcategorias
     · preços por tamanho
     · lista de ingredientes
     · gramas de proteína, onde a peça informa
     · regras de adicionais

   O que NÃO está aqui, porque a peça não informa:
     · calorias (nenhum item declara)
     · SKU ou código interno (a peça não traz; a correspondência com
       transações é feita por nome, como o motor já prevê)
     · ingredientes dos snacks de terceiros (Bold, All Protein)

   O que é DERIVADO, não oficial:
     · o campo "alergenicos" foi deduzido da lista de ingredientes da própria
       peça (ex.: "Pasta de amendoim" → amendoim). NÃO é a declaração oficial
       de alergênicos da Smoov e não substitui o rótulo do fabricante.

   O que foi DELIBERADAMENTE deixado em branco:
     · os selos por produto (Sem Lactose, Sem Glúten, Sem Açúcar, Baixas
       Calorias, Fonte de Energia, Vegano, Fonte de Proteína). A legenda
       aparece no rodapé da peça, mas na resolução recebida não dá para
       atribuir cada ícone ao produto certo com segurança. Atribuir errado um
       selo de "sem glúten" ou "sem lactose" é risco alimentar, então ficou
       vazio em vez de adivinhado. Preencher exige a peça em alta resolução
       ou a planilha da Smoov.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const FONTE = 'Cardápio oficial Smoov · transcrito em 23/11/2026';

  /* [nome, categoria, subcategoria, tamanho, preço, proteína(g), ingredientes, alergênicos derivados, tags] */
  const ITENS = [
    /* ---------- FRUIT SMOOVS — 360 ml R$ 16,99 · 480 ml R$ 21,99 ---------- */
    ['Smoov Classic', 'Fruit Smoovs', 'Frutas', '360 ml', 16.99, null,
      'Suco de maçã integral, iogurte zero lactose, banana, morango', 'leite', ''],
    ['Smoov Classic', 'Fruit Smoovs', 'Frutas', '480 ml', 21.99, null,
      'Suco de maçã integral, iogurte zero lactose, banana, morango', 'leite', ''],

    ['Smoov.co', 'Fruit Smoovs', 'Frutas', '360 ml', 16.99, null,
      'Água de coco, iogurte zero lactose, manga, maracujá, leite de coco em pó', 'leite, coco', ''],
    ['Smoov.co', 'Fruit Smoovs', 'Frutas', '480 ml', 21.99, null,
      'Água de coco, iogurte zero lactose, manga, maracujá, leite de coco em pó', 'leite, coco', ''],

    ['Smoov Detox', 'Fruit Smoovs', 'Funcionais', '360 ml', 16.99, null,
      'Suco de maçã, água, abacaxi, maçã, espinafre, couve, limão, gengibre em pó, hortelã, chá Desinchá', '', ''],
    ['Smoov Detox', 'Fruit Smoovs', 'Funcionais', '480 ml', 21.99, null,
      'Suco de maçã, água, abacaxi, maçã, espinafre, couve, limão, gengibre em pó, hortelã, chá Desinchá', '', ''],

    ['Smoov Tropical Fresh', 'Fruit Smoovs', 'Frutas', '360 ml', 16.99, null,
      'Suco de maçã, água, manga, abacaxi, kiwi, hortelã', '', ''],
    ['Smoov Tropical Fresh', 'Fruit Smoovs', 'Frutas', '480 ml', 21.99, null,
      'Suco de maçã, água, manga, abacaxi, kiwi, hortelã', '', ''],

    /* ---------- PROTEIN SMOOVS — 360 ml R$ 21,99 · 480 ml R$ 32,99 ---------- */
    ['Smoov Antiox Berries', 'Protein Smoovs', 'Frutas vermelhas', '360 ml', 21.99, 13,
      'Iogurte zero lactose, água de coco, mirtilo, morango, amora, colágeno neutro', 'leite, coco', ''],
    ['Smoov Antiox Berries', 'Protein Smoovs', 'Frutas vermelhas', '480 ml', 32.99, 14,
      'Iogurte zero lactose, água de coco, mirtilo, morango, amora, colágeno neutro', 'leite, coco', ''],

    ['Smoov Pink', 'Protein Smoovs', 'Frutas vermelhas', '360 ml', 21.99, 11,
      'Suco de maçã, iogurte zero lactose, framboesa, morango, suco de limão, colágeno neutro', 'leite', ''],
    ['Smoov Pink', 'Protein Smoovs', 'Frutas vermelhas', '480 ml', 32.99, 12,
      'Suco de maçã, iogurte zero lactose, framboesa, morango, suco de limão, colágeno neutro', 'leite', ''],

    ['Smoov Matcha', 'Protein Smoovs', 'Funcionais', '360 ml', 21.99, 19,
      'Leite de castanha de caju com coco, banana, leite de coco em pó, pasta de amendoim, mel, matcha, whey de baunilha',
      'castanha de caju, coco, amendoim, leite', ''],
    ['Smoov Matcha', 'Protein Smoovs', 'Funcionais', '480 ml', 32.99, 31,
      'Leite de castanha de caju com coco, banana, leite de coco em pó, pasta de amendoim, mel, matcha, whey de baunilha',
      'castanha de caju, coco, amendoim, leite', ''],

    ['Smoov High Intensity Energy', 'Protein Smoovs', 'Energia', '360 ml', 21.99, 17,
      'Leite de castanha de caju com coco, banana, tâmara, pasta de amendoim, cacau 100% em pó, canela em pó, café em grãos, whey de chocolate',
      'castanha de caju, coco, amendoim, leite', 'contém cafeína'],
    ['Smoov High Intensity Energy', 'Protein Smoovs', 'Energia', '480 ml', 32.99, 29,
      'Leite de castanha de caju com coco, banana, tâmara, pasta de amendoim, cacau 100% em pó, canela em pó, café em grãos, whey de chocolate',
      'castanha de caju, coco, amendoim, leite', 'contém cafeína'],

    ['Smoov Supercoffee', 'Protein Smoovs', 'Energia', '360 ml', 21.99, 16,
      'Leite de castanha de caju com coco, banana, tâmara, Supercoffee Vanilla, whey de baunilha',
      'castanha de caju, coco, leite', 'contém cafeína'],
    ['Smoov Supercoffee', 'Protein Smoovs', 'Energia', '480 ml', 32.99, 25,
      'Leite de castanha de caju com coco, banana, tâmara, Supercoffee Vanilla, whey de baunilha',
      'castanha de caju, coco, leite', 'contém cafeína'],

    /* ---------- HEALTHY SHAKES (A Confeitaria) — 480 ml R$ 34,99 ---------- */
    ['Healthy Banoffee', 'Healthy Shakes', 'A Confeitaria', '480 ml', 34.99, 33,
      'Leite de castanha de caju com coco, banana, doce de leite zero açúcar, canela em pó, whey de baunilha',
      'castanha de caju, coco, leite', 'zero açúcar adicionado'],
    ['Healthy Beijinho', 'Healthy Shakes', 'A Confeitaria', '480 ml', 34.99, 31,
      'Leite de castanha de caju com coco, banana, beijinho zero açúcar, polpa de coco, whey de baunilha, coco ralado em pó',
      'castanha de caju, coco, leite', 'zero açúcar adicionado'],
    ['Healthy Brigadeiro', 'Healthy Shakes', 'A Confeitaria', '480 ml', 34.99, 29,
      'Leite de castanha de caju com coco, banana, mamão, brigadeiro zero açúcar, granulado zero açúcar 50% cacau, whey de chocolate',
      'castanha de caju, coco, leite', 'zero açúcar adicionado'],

    /* ---------- SNACKS ---------- */
    ['Cookie Proteico All Protein', 'Snacks', 'Doces', 'unidade', 12.00, null, '', '', ''],
    ['Bold Bar 60g', 'Snacks', 'Barras', '60 g', 14.99, null, '', '', ''],
    ['Bold Thin', 'Snacks', 'Barras', 'unidade', 11.99, null, '', '', ''],
    ['Bold Tube', 'Snacks', 'Barras', 'unidade', 7.99, null, '', '', ''],

    /* ---------- BEBIDAS ---------- */
    ['Água', 'Bebidas', 'Sem álcool', 'unidade', 6.00, null, 'Água', '', ''],
    ['Pow Matcha', 'Bebidas', 'Sem álcool', 'unidade', 11.90, null, '', '', ''],

    /* ---------- ADICIONAIS · PROTEÍNA (DUX Nutrition Lab) ---------- */
    ['Whey Protein de Baunilha', 'Adicionais', 'Proteína', 'dose', 8.50, null, 'Whey protein sabor baunilha', 'leite', ''],
    ['Whey Protein de Chocolate', 'Adicionais', 'Proteína', 'dose', 8.50, null, 'Whey protein sabor chocolate', 'leite', ''],
    ['Whey Protein de Coco', 'Adicionais', 'Proteína', 'dose', 8.50, null, 'Whey protein sabor coco', 'leite, coco', ''],
    ['Proteína Vegana de Baunilha', 'Adicionais', 'Proteína', 'dose', 10.00, null, 'Proteína vegetal sabor baunilha', '', 'vegano'],

    /* ---------- ADICIONAIS · SUPLEMENTOS ---------- */
    ['Colágeno', 'Adicionais', 'Suplementos', 'dose', 5.00, null, 'Colágeno', '', ''],
    ['Glutamina', 'Adicionais', 'Suplementos', 'dose', 5.00, null, 'Glutamina', '', ''],
    ['Creatina', 'Adicionais', 'Suplementos', 'dose', 6.00, null, 'Creatina', '', ''],

    /* ---------- ADICIONAIS · SUPERFOODS — R$ 2,00 por dose ---------- */
    ['Cacau 100% em Pó', 'Adicionais', 'Superfoods', 'dose', 2.00, null, 'Cacau 100% em pó', '', ''],
    ['Canela em Pó', 'Adicionais', 'Superfoods', 'dose', 2.00, null, 'Canela em pó', '', ''],
    ['Gengibre em Pó', 'Adicionais', 'Superfoods', 'dose', 2.00, null, 'Gengibre em pó', '', ''],
    ['Spirulina Verde', 'Adicionais', 'Superfoods', 'dose', 2.00, null, 'Spirulina', '', ''],
    ['Nibs de Cacau', 'Adicionais', 'Superfoods', 'dose', 2.00, null, 'Nibs de cacau', '', ''],
    ['Semente de Chia', 'Adicionais', 'Superfoods', 'dose', 2.00, null, 'Semente de chia', '', ''],
    ['Coco Ralado Zero Açúcar', 'Adicionais', 'Superfoods', 'dose', 2.00, null, 'Coco ralado zero açúcar', 'coco', 'zero açúcar adicionado'],
    ['Granulado 50% Cacau Zero Açúcar', 'Adicionais', 'Superfoods', 'dose', 2.00, null, 'Granulado 50% cacau zero açúcar', '', 'zero açúcar adicionado']
  ];

  /* Regras de montagem que a peça declara — usadas como observação no catálogo */
  MI.SMOOV_REGRAS = [
    'Não é possível alterar as frutas e a base do Smoov.',
    'Proteína: 360 ml aceita até 1 dose adicional; 480 ml aceita até 2 doses.',
    'Protein Smoovs aceitam até 1 dose adicional de proteína.',
    'Suplementos: até 2 doses adicionais.',
    'Superfoods: até 2 doses adicionais, R$ 2,00 por dose.'
  ];

  MI.SMOOV_FONTE = FONTE;

  MI.catalogoSmoov = function () {
    return ITENS.map(function (p, i) {
      return {
        id: 'smoov-' + String(i + 1).padStart(3, '0'),
        sku: '',                       // a peça não traz código de produto
        nome: p[0],
        categoria: p[1],
        subcategoria: p[2],
        tamanho: p[3],
        preco: p[4],
        proteina: p[5],
        kcal: null,                    // nenhum item declara calorias
        ingredientes: p[6],
        alergenicos: p[7],
        tags: p[8],
        descricao: '',
        imagem: null,
        disponivel: true,
        regiao: '',
        origem: 'oficial',
        fonte: FONTE
      };
    });
  };

})(window.MI);
