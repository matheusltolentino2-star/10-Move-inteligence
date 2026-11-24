# Contrato com a 10 Move Intelligence

Análise do checkout local na revisão aa9005d. Foram examinados README, DEPLOY, schema SQL, carregamento dos scripts, autenticação, módulos de dados e visualizações. Nenhum AGENTS.md aplicável estava presente no checkout ou diretório pai. A demonstração usa o código do checkout, com as imagens apenas como referência agregada e de catálogo.

## Arquitetura e fronteiras

- A aplicação é uma SPA estática em JavaScript clássico, HTML e CSS. O servidor Node serve arquivos e cabeçalhos. SheetJS interpreta Excel no navegador, Chart.js monta gráficos, jsPDF gera relatórios e PDF.js interpreta cardápios. A aplicação não usa ORM nem um pipeline de microdados no servidor.
- As fontes são planilha de clientes, planilha de itens de pedidos e catálogo. O parser infere aba para clientes e transações, linha de cabeçalho e mapeamento. O catálogo carrega a primeira aba da planilha, por isso catalogo abre o arquivo de importação. O estado de clientes e transações é local e substituível. O catálogo pode persistir em IndexedDB. Segmentos salvos, preferências e decisões locais usam localStorage.
- Supabase Auth usa associação entre usuário e organização para decisão de papel. PostgreSQL concentra organizations, memberships, approved_indicators, published_aggregates e audit_log com RLS. O cliente autorizado pode publicar agregados com aprovação, mínimo de grupo e limite por recorte. Nenhuma tabela de microdados de cliente, loja individual, pedido, pagamento ou campanha existe nesse schema.
- O DEMO-SMOOV é uma organização lógica nos arquivos, com IDs globais de cliente e de loja. A unidade é dimensão de análise. O schema atual possui autorização por organização e papel, sem escopo por loja. RLS ao vivo e autenticação não foram testadas. A VM não carrega config.js ou auth-supabase.js.
- O app tem demonstração própria em data-synthetic.js e data-transactions.js. O motor deste projeto não integra seu boot. A saída fica em uma pasta irmã com nome distinto da raiz estática, e depende de seleção de arquivo para uso.

## Funcionalidades, campos, entidades e verificação

| Funcionalidade e situação | Campos da projeção ou fonte | Entidades correspondentes | Cenários e verificação |
|---|---|---|---|
| Visão geral e indicadores de clientes, existente | cliente_id, compras, receita, ticket, recencia_dias, data_cadastro, data_ultima_compra | Customers, Transactions, Customer Metrics | Contagens e receita conciliadas em VM; SC-03, SC-40 |
| Perfil e Geografia, existentes | idade, nascimento, genero, cidade, uf, bairro | Customers, Stores | Cotas etárias; geografia SP; grupos pequenos sujeitos à supressão |
| Comportamento horário, existente | hora, dia_semana, data_ultima_compra; data_pedido e hora nos itens | Customer Metrics, Transactions, Calendar | Horários dentro da janela, SC-38 e SC-39 |
| Segmentação, existente para RF; VIP/estado longitudinal complementar | recencia_dias, compras, receita, ticket, status | Customer Metrics, Customer RFM Snapshots | Tercis e seis classes comparados em VM; SC-01 a SC-08 |
| Catálogo, existente | sku, produto, categoria, subcategoria, tamanho, preco, ingredientes, proteina_g, tags, disponivel | Products, Product Variants, Addons | 42 variantes carregadas; preço e associação por SKU |
| Consumo e cesta, existentes | pedido_id, cliente_id, sku, produto, tamanho, categoria, quantidade, valor_total, data_pedido, hora | Transactions, Transaction Items, Customers, Product Variants | Pedidos distintos, ticket e vínculos; SC-12, SC-32 e SC-35 |
| Aquisição, ciclos e coortes, parcialmente suportados | data_cadastro, data_ultima_compra, recencia_dias, compras; detalhes em customer_cohorts e cohort_metrics | Customers, Transactions, Customer Cohorts | Recompra por janela e coortes acima/abaixo da média, SC-24 e SC-25 |
| Multiloja e canais, parciais | cliente_id, unidade, unidade_preferida, canal | Customers, Stores, Transactions | Vínculo global e cotas, SC-22 e SC-23. Unidade preferida e unidade do pedido têm granularidades distintas |
| Oportunidades Comerciais, existentes como regras e sugestões | Mix, recência, tamanho, produtos e afinidade; oportunidades financeiras complementares | Basket Affinity, Customer Metrics, Opportunities | SC-09 a SC-11, SC-20 e SC-21 |
| Relatórios e governança, existentes | Indicadores agregados autorizados, mínimo de grupo, organização e papel | Organizations, Memberships, Approved Indicators, Published Aggregates, Audit Log | Revisão estática do fluxo e RLS; publicação e papéis ficam fora do teste local |
| Rentabilidade, eventos operacionais, clima e fidelidade, complementares | CMV, descontos, taxas, efeitos, dose, canal, janela, pontos | Payments, Transaction Discounts, Loyalty Events, Store Day Context, Operation Events | Conciliação; SC-13/14, SC-29 a SC-31 e SC-36/37 |
| CRM, campanhas e experimentos, públicos parcialmente suportados; execução e incrementalidade complementares | audiences, arms, campaign dates, coupon, conversion e contribution | Campaigns, Experiment Assignments, Campaign Events, Campaign Results | Coerência de funil e atribuição; SC-26 a SC-28; nenhuma rota de envio |
| Predição, complementar para avaliação | cutoff_date, horizonte, censura, recompra e próximos produtos | RFM snapshots e Predictive Labels | Teste de vazamento e censura; modelos e previsões da plataforma ainda ausentes |
| Qualidade de importação, parcialmente suportada | ID, SKU, campos de data e valor, diagnósticos | RAW de clientes e itens | Teste observacional da aceitação e limites. O GOLD é reconciliado antes da exportação |
| Identidade probabilística e exceções financeiras, complementares | Identificadores de sandbox, pares canônicos, estados e reversões | Identity Records, Exception Orders, Exception Events | Fixtures legíveis em VM; resolução e reconciliação de reversões são testes futuros de um motor específico |

## Medidas equivalentes

A soma de valor_total no arquivo de importação iguala o líquido comercial, com desconto e adicionais dentro da linha principal. Valor unitário preserva o preço unitário de tabela. Para ticket ponderado, use porPedido no módulo de consumo ou líquido / número de pedidos. Uma visão que usa média de ticket por cliente terá outro denominador. A projeção de clientes oferece recência explícita da data de corte para evitar deslocamentos da data de referência inferida. O RFM nativo utiliza recência e frequência para pontuar, e usa monetário nos resumos.

O teste registra as diferenças entre a aceitação técnica da planilha e a qualidade dos dados comerciais. Seu escopo cobre parsing, normalização e funções de estatística em memória. Renderização das telas, IndexedDB, autorizações e políticas remotas permanecem fora desse resultado.
