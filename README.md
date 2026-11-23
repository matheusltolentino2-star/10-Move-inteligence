# 10 Move Intelligence

Plataforma de inteligência de dados para a parceria **10 Move × Smoov**.

Um representante autorizado da Smoov importa a planilha de clientes, analisa a base
em dashboards profissionais e libera para a 10 Move **apenas indicadores agregados
e aprovados**. A base bruta nunca sai do navegador.

---

## Como executar

Precisa apenas de Node instalado (só para servir os arquivos).

```powershell
node 10-move-intelligence/serve.js 4173
```

Depois abra `http://localhost:4173`.

Não há build, bundler, instalação de dependências nem backend. As três bibliotecas
externas (Chart.js, SheetJS e jsPDF) vêm de CDN, com versão fixada.

---

## Arquitetura

Aplicação estática de página única, em JavaScript clássico (sem módulos, sem
framework). Tudo roda no navegador do usuário.

```
index.html                 casca, ordem de carga dos scripts
assets/css/app.css         design system (tokens, tema claro/escuro, layout)
assets/js/
  core.js                  formatação pt-BR, PRNG determinístico, DOM, CSV, storage
  data-cities.js           referência geográfica do Brasil e cartograma
  data-synthetic.js        gerador da base demonstrativa (80 mil registros)
  data-schema.js           detecção de tipo de coluna e de papel analítico
  data-store.js            estado central, campos derivados, filtros combináveis
  data-stats.js            agregações, estatística descritiva, RFM, afinidade
  data-privacy.js          k-anonimato, supressão, aprovação de indicadores
  data-import.js           leitura de Excel/CSV, escolha de aba e detecção de cabeçalho
  data-catalog.js          catálogo de produtos, importação de PDF e persistência em IndexedDB
  data-transactions.js     itens de pedido, correspondência com catálogo e clientes
  data-txstats.js          estatística de consumo (cesta, afinidade, recorrência)
  auth-supabase.js         login real e papéis — inativo sem config.js
  ui-charts.js             Chart.js com tema herdado dos tokens CSS
  ui-components.js         cartões, KPIs, tabelas, mapa de calor, estados
  ui-geo.js                cartograma do Brasil
  view-*.js                uma visão por seção da navegação
  app.js                   roteamento, barra de filtros, inicialização
serve.js                   servidor estático de desenvolvimento (não faz parte do app)
```

### Fluxo de dados

1. **Entrada** — base demonstrativa sintética ou planilha importada.
2. **Detecção de esquema** (`data-schema.js`) — para cada coluna, amostra os valores
   e infere tipo (`number`, `date`, `category`, `time`, `id`, …) e papel analítico
   (idade, gênero, cidade, UF, data, ticket, frequência, …). O papel é atribuído por
   pontuação, combinando nome da coluna e conteúdo, com no máximo um papel por coluna.
3. **Normalização** (`data-store.js`) — uma passagem sobre as linhas cria campos
   derivados (`_idade`, `_faixa`, `_genero`, `_uf`, `_cidade`, `_data`, `_hora`,
   `_dow`, `_valor`, `_freq`, `_recencia`, …). Todas as visões consomem esses campos,
   e não as colunas originais — é isso que permite funcionar com qualquer planilha.
4. **Disponibilidade** — cada campo derivado recebe um sinalizador. Painel sem dado
   correspondente aparece como **indisponível**, nunca estimado.
5. **Filtros** — recorte global combinável, aplicado antes de qualquer agregação.
6. **Privacidade** — supressão de grupos pequenos e filtro por indicador aprovado.
7. **Saída** — dashboards, PDF e exportação de agregados.

---

## Importação de planilhas

- Formatos: `.xlsx`, `.xlsm`, `.xls`, `.csv`, `.tsv`, `.txt`.
- Não exige estrutura fixa de colunas.
- **Escolhe a aba certa.** Arquivos reais trazem abas de documentação
  (“Leia-me”, “Dicionário”, “Índice”). Pegar a primeira aba com conteúdo
  importa o manual no lugar dos dados, então cada aba é pontuada por volume,
  largura e nome, com uma dica conforme o que se procura — base de clientes
  ou base de transações. A escolha fica visível e pode ser trocada.
- **Acha a linha de cabeçalho de verdade.** Cada linha candidata é avaliada
  como cabeçalho das linhas abaixo: proporção de rótulos de texto, rótulos
  distintos, largura compatível com o corpo da tabela e mudança de tipo entre
  o rótulo e os dados. Título, período, autor e linhas em branco acima são
  listados como contexto ignorado, e linhas de “Total” no rodapé são
  descartadas para não somarem duas vezes.
- A confiança da detecção é exibida; quando baixa, a interface avisa e deixa
  mover a linha do cabeçalho ou declarar que a planilha não tem cabeçalho.
- **CSV tem parser próprio**, e não o do SheetJS, por dois motivos reais de planilha
  brasileira: o SheetJS lê `0,07` como `7` (trata a vírgula como separador de milhar),
  e arquivos exportados do Excel costumam vir em Windows-1252. O parser detecta o
  delimitador (`;`, `,`, tab, `|`), detecta a codificação e mantém tudo como texto;
  a conversão numérica fica com `MI.parseNumber`, que entende o formato pt-BR.
- Relatório de qualidade antes de qualquer gráfico: vazios, colunas constantes,
  identificadores duplicados, linhas idênticas, datas improváveis, valores negativos
  em medidas, grafias inconsistentes e dimensões não encontradas.
- Mapeamento revisável: cada coluna mostra tipo detectado, amostra de valores e um
  seletor para corrigir o papel.

---

## Cardápio & Produtos

Catálogo com importação de planilha, **extração de PDF** (pdf.js: linhas que
terminam com preço viram produtos, linhas em caixa alta viram categorias, e o
que não casa é listado como ignorado), cadastro manual com upload de imagem, e
leitura de URL — que falha por CORS na maioria dos sites e, por isso, vem
acompanhada do campo de colar texto, que sempre funciona.

Visualização em cartões ou tabela, com filtros por categoria, subcategoria,
características, alergênicos a excluir, faixa de preço e disponibilidade.
Persistido em IndexedDB. O catálogo demonstrativo é fictício e marcado como tal.

## Inteligência de Consumo

Liga clientes, pedidos, itens e produtos. A correspondência é honesta: SKU
exato, depois nome + tamanho, depois nome, e só então similaridade por tokens
acima de 0,72 — abaixo disso o item fica como “não encontrado” em vez de ser
associado a palpite.

Entrega produtos e categorias mais vendidos, ticket por categoria, demanda por
horário e dia, mix por faixa etária e por estado, sazonalidade, produtos
comprados juntos (suporte, confiança e lift) e recorrência.

Um painel de diagnóstico mostra, para cada análise, qual campo ela exige e se
está disponível. Sem identificador de cliente comum às duas bases, o
cruzamento demográfico não acontece — a plataforma explica o que falta em vez
de inventar a ligação. As leituras ficam separadas em consumo observado,
característica demográfica, hipótese e recomendação não validada.

## Privacidade

### Implementado e funcionando

- **Processamento local.** `FileReader` + SheetJS no navegador. Nenhum registro é
  transmitido para servidor, para a 10 Move ou para qualquer serviço de IA. Dá para
  confirmar abrindo a aba Rede durante a importação.
- **Supressão de grupos pequenos.** Categorias e células com menos de *k* registros
  (padrão 30, ajustável) são agrupadas em “Suprimido”.
- **Medição de k-anonimato.** Cálculo real de classes de equivalência sobre
  combinações de quase-identificadores (cidade + faixa de idade + gênero, etc.),
  com contagem de registros isolados.
- **Liberação por indicador.** A perspectiva 10 Move só exibe o que a Smoov aprovou,
  um a um. Por padrão, nada é compartilhado.
- **Bloqueio de microdados.** Nenhuma perspectiva exporta registros individuais.
  Relatórios e exportações contêm apenas agregados.

### Exige backend — não finja que está pronto

A troca de perspectiva é uma **preferência de interface**, não um controle de acesso.
As regras de visibilidade rodam no cliente e podem ser contornadas por quem inspecionar
o código. Para uso em produção com dados reais compartilhados entre duas empresas,
faltam: autenticação real, autorização validada no servidor, isolamento por organização,
auditoria à prova de adulteração e, fora do software, base legal e avaliação de impacto
sob a LGPD.

A seção “Privacidade e compartilhamento” da própria aplicação declara isso ao usuário.

---

## Base demonstrativa

80 mil registros fictícios gerados no navegador a partir de uma semente fixa
(resultado reproduzível). **Não representam dados reais da Smoov.** Toda a interface
marca esses números como demonstrativos.

A base tem correlações propositais — idade influencia plano e dispositivo, frequência
influencia recência e status, perfis latentes de uso definem dia e horário — para que
a segmentação tenha o que descobrir. Também tem imperfeições propositais (1,8% sem
gênero, 1,2% sem cidade, 14 identificadores duplicados) para o módulo de qualidade ter
algo verdadeiro a reportar.

Ao importar uma planilha, a base demonstrativa é substituída e todos os painéis passam
a usar o arquivo real.

---

## Fato, hipótese e ação

A seção de inteligência comercial separa rigorosamente três coisas, com rótulo visível
em cada item:

- **Fato observado** — número calculado sobre o recorte atual.
- **Hipótese** — leitura plausível que esta base, sozinha, não comprova.
- **Ação sugerida** — decisão proposta a partir dos fatos.

A plataforma também declara o que **não** é calculável com os dados disponíveis:
participação de mercado, penetração por praça e retorno sobre investimento exigem
população, custo de aquisição e dados de concorrência, que não existem na planilha.

---

## Limitações conhecidas

- Até cerca de 250 mil linhas. Acima disso o navegador fica lento e a aplicação avisa.
- O mapa é um **cartograma esquemático** — uma grade que aproxima a forma do Brasil.
  Não é cartografia e não usa coordenadas.
- Segmentos salvos, aprovações e trilha de decisões ficam no `localStorage` deste
  navegador. Não sincronizam entre máquinas e podem ser apagados pelo usuário.
- Dentro de um visualizador incorporado (como um Artifact), o download do PDF pode ser
  bloqueado pelo ambiente. A aplicação detecta isso, avisa e oferece copiar os
  indicadores. Rodando localmente, o download funciona normalmente.
