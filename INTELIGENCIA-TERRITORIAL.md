# Inteligência territorial — auditoria e decisões

Registro vivo da evolução do módulo geográfico. Atualizado em 25/11/2026.

## P0 — O que os dados realmente têm

Auditoria feita sobre o modelo de importação (`data-schema.js`,
`data-store.js`, `data-transactions.js`), não sobre suposição.

### Base de clientes — papéis reconhecidos

`id`, `idade`, `nascimento`, `genero`, `uf`, `cidade`, `bairro`,
`dataEvento`, `dataCadastro`, `hora`, `diaSemana`, `valor`, `receita`,
`frequencia`, `plano`, `canal`, `status`, `recencia`, `satisfacao`,
`duracao`, `dispositivo`.

Cada um vira um campo derivado (`_uf`, `_cidade`, `_bairro`, `_idade`…)
que alimenta filtros e indicadores em todos os módulos.

### Base de transações — campos normalizados

`_pedido`, `_cliente`, `_sku`, `_nome`, `_tamanho`, `_catBruta`, `_data`,
`_mes`, `_dow`, `_hora`, `_qtd`, `_valorUnit`, `_valor`, `_canal`,
`_unidade`.

### O que NÃO existe hoje

| Ausente | Consequência |
|---|---|
| CEP e logradouro | Sem geocodificação. A posição mais fina possível é o município. |
| Latitude/longitude | Nenhuma distância pode ser calculada. |
| Cadastro de lojas | Não há entidade loja: `_unidade` é texto livre na transação. |
| Coordenada da loja | Sem raio de 3 km, sem cobertura, sem sobreposição. |
| Formato da unidade | Franquia × própria não é distinguível. |
| Código IBGE do município | A ligação é por nome normalizado. |

Granularidade real da base hoje: **UF → município**. Bairro existe como
texto quando a planilha traz, mas sem malha territorial correspondente.

## P1 — Implementado

Drill-down **Brasil → UF → Município**, com a malha oficial do IBGE.

### Decisões

**A profundidade territorial é o próprio filtro da plataforma.** Clicar em
São Paulo no mapa é idêntico a filtrar por São Paulo. Não existe um estado
territorial paralelo ao lado dos filtros: por isso todos os módulos
acompanham a seleção sem uma segunda camada analítica.

**Malha por UF, carregada sob demanda.** Um arquivo por estado em
`assets/geo/mun-XX.js`, injetado como script quando o usuário entra naquele
estado. São 1,9 MB somados, mas o maior carregamento individual é Minas
(853 municípios, 258 KB) e só para quem abre Minas. Gerado em build, não
consultado em runtime: o IBGE não vira dependência de cada interação.

**Projeção Albers cônica equivalente** (paralelos -2° e -30°, meridiano
central -54°), a mesma do mapa nacional. Equivalente preserva área, que é a
propriedade que importa quando a cor representa volume.

**Correspondência por nome exato normalizado.** O nome da cidade na planilha
é comparado com o do município via `MI.slug`, sem similaridade aproximada.
O que não casa aparece listado, com volume, no cartão "O que entrou no
mapa" — junto com o que foi suprimido por k-anonimato e o que está sem
cidade preenchida. A soma tem que fechar com o recorte.

**Poda de rótulos pela caixa real do texto.** Estimar largura por número de
letras erra em nomes longos, e região metropolitana é onde os centróides se
amontoam. A poda usa `getBBox()` depois que o SVG entra na página.

### Arquivos

- `assets/geo/mun-XX.js` — 27 malhas municipais geradas do IBGE
- `assets/js/ui-geo.js` — `carregarUf`, `indiceMunicipios`, `mapaUf`
- `assets/js/view-geography.js` — trilha, drill-down, balanço de cobertura
- `assets/css/app.css` — `.trilha`, `.mapa-br__mun`

## Bloqueado por ausência de dado

Não implementado **de propósito**, porque exigiria inventar dado:

- **P2 — Lojas e cobertura.** Depende de cadastro de unidades com
  coordenada. Sem isso não há raio de 3 km, área descoberta nem
  canibalização. `_unidade` dá o nome da loja na transação e é a semente
  natural do cadastro.
- **P3 — Origem-destino.** Hoje dá para cruzar origem declarada (cidade,
  bairro) com unidade de compra (`_unidade`). O que não dá é distância, que
  exige coordenada dos dois lados.
- **P4 — Enriquecimento externo.** População, renda e POIs são por setor
  censitário ou município; o join é possível no nível municipal assim que
  houver necessidade, usando o código IBGE que a malha já carrega.
- **P5/P6** dependem dos anteriores.

## Próxima prioridade

Cadastro de unidades (nome, endereço, coordenada, formato), alimentado pelos
valores distintos de `_unidade` que já chegam nas transações. É o menor
incremento que destrava P2 e P3 ao mesmo tempo.

Enquanto não houver coordenada, qualquer raio de cobertura seria desenho,
não medida.
