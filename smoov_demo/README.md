# SMOOV Synthetic Intelligence Engine

Motor offline e reproduzível para demonstração da 10 Move Intelligence. A configuração SMOOV DEMO fixa 10.000 clientes identificados, 50.000 pedidos, 12 lojas e o período de 01/11/2025 a 31/10/2026. Representa uma amostra comercial sintética. O [arquivo de premissas](config/simulation_assumptions.json) registra a origem e o uso de cada parâmetro.

## Executar

Na pasta smoov_demo, com Python 3.12 e Node 24 disponíveis:

~~~powershell
python -m pip install -r requirements.txt
python -m unittest discover -s tests
python -m generator --profile micro
python -m generator --profile smoke
python -m generator --profile demo
~~~

O destino padrão é a pasta irmã smoov_demo_outputs, fora da raiz servida pelo app. Use --out para escolher outra pasta nova, também fora da raiz servida. A execução publica a pasta de saída somente após a geração, validação e reabertura dos arquivos. Uma pasta existente é preservada. Use --config para apontar a outra marca com catálogo no mesmo diretório. Use --as-of AAAA-MM-DD para calcular os 12 meses completos anteriores e gravar as datas efetivas. O relatório registra versões, SHA-256 da configuração mais catálogo, SHA-256 do código e semente. Compare registros e métricas para avaliar reprodutibilidade.

| Perfil | Clientes | Pedidos | Exportação |
|---|---:|---:|---|
| micro | 100 | 500 | XLSX + Parquet |
| smoke | 1.000 | 5.000 | XLSX + Parquet |
| demo | 10.000 | 50.000 | XLSX + Parquet |
| real-scale | 76.978 | 382.644 | CSV.GZ + Parquet, particionados |
| stress | 100.000 | 500.000 | CSV.GZ + Parquet, particionados |
| enterprise | 1.000.000 | 5.000.000 | CSV.GZ + Parquet, particionados |

Os perfis maiores processam até 10.000 clientes por partição. As cotas inteiras são ajustadas proporcionalmente por partição, com possíveis diferenças de arredondamento nas margens globais. IDs de clientes, pedidos e experimentos incluem o prefixo da partição. Dimensões comuns reaparecem por partição. Projetos a partir de real-scale devem deduplicar dimensões e recalcular as métricas globais. A importação de uma partição substitui a carga ativa. As três escalas maiores permanecem disponíveis para ensaios futuros.

## Arquivos e granularidade

| Entrega | Conteúdo |
|---|---|
| datasets/smoov_demo_database.xlsx | GOLD relacional com dimensões, pedidos, linhas comerciais, adicionais filhos, pagamentos e descontos |
| datasets/smoov_import.xlsx | Clientes, catálogo e itens no contrato do importador. Dados derivados observáveis até o corte |
| datasets/smoov_extended_data.xlsx | Fidelidade, campanhas, experimento, operação, clima, RF mensal, coortes, margens, afinidade e oportunidades |
| datasets/smoov_raw_quality_tests.xlsx | Carga adversa isolada de clientes, itens e layout incompleto |
| datasets/smoov_identity_resolution_tests.xlsx | Fixtures de variação de cadastro, mudança de contato e homônimos |
| datasets/smoov_transaction_exceptions.xlsx | Cancelamentos, recusas, devoluções, estornos e pedidos anônimos isolados |
| ground_truth | Parquet de traços latentes e labels futuros. Manifestos de cenários, erros e identidade |
| reports | Resultado financeiro, validação, dicionário de campos, roteiro e teste de importação |

Pedidos devem ser contados pela chave transaction_id. Cada item tem preço de tabela, quantidade, adicionais, desconto rateado e valor líquido. O valor do adicional integra o total da linha de seu produto. Para totalizar receita, use a transação ou a soma do líquido de seus itens. Para analisar adicionais, use quantidade e preço próprios da tabela de adicionais sem somá-los novamente à receita. O dicionário aponta as granularidades, chaves e fórmulas.

## Integração e acesso

O [mapeamento técnico](PLATFORM_MAPPING.md) aponta os módulos e campos da revisão analisada. A integração é manual e local. Os dados gerados ficam fora da raiz HTTP. O motor independe de credenciais, contas e banco. As flags de identidade sintética e envio desabilitado estão na base, e nenhum componente do motor contém integração de disparo.

1. Abra uma sessão isolada de demonstração da aplicação. Com autenticação habilitada, o perfil necessário para cargas é smoov_admin.
2. Em Configurações e Acessos › Fontes de dados › Base de clientes, escolha smoov_import.xlsx e revise a aba clientes. Aplique a carga.
3. Em Cardápio & Produtos › Importar planilha, escolha o mesmo arquivo e aplique. O módulo usa a primeira aba, catalogo. O catálogo persistido pertence ao perfil local do navegador.
4. Em Configurações e Acessos › Fontes de dados › Base de transações, escolha o mesmo arquivo e aplique transacoes. Confirme os vínculos por cliente e SKU em Consumo.
5. Ao concluir, descarte o perfil isolado do navegador. O próprio app oferece restaurar a base demonstrativa e remover transações. O catálogo pode ser restaurado nas configurações do cardápio.

Para testar o pipeline sem iniciar o app, use a biblioteca SheetJS 0.18.5 fixada em index.html e mantenha o arquivo da biblioteca em caminho local. A execução usa uma VM de JavaScript descartável, sem sessão real, armazenamento do navegador ou rede:

~~~powershell
node tests/import_local.cjs "../../smoov_demo_outputs/demo" "<caminho-local>/xlsx.full.min.js"
python tests/verify_export.py "../../smoov_demo_outputs/demo"
~~~

O teste valida contagens, registros rejeitados, mapeamento, recarga por substituição, receita, ticket e vínculos. Executa o RAW em outra VM. A interface checa produto/SKU e o importador emite diagnósticos, mas aceita certos totais incoerentes e não deduplica pedidos. Para testes de qualidade, siga os resultados esperados no manifesto e restrinja o RAW à VM ou a uma sessão isolada. Fixtures de identidade e exceções têm leitura verificada. A plataforma atual carece de um motor nativo para resolver identidades ou processar reversões.

## Método

- **Jornadas.** Faixas de frequência são alocadas com cotas e ajuste unitário até o total exato. Cada cliente tem preferências de loja, produto, tamanho, dia, horário, canal e preço, com ruído e possíveis transições. O calendário oferece dias elegíveis por loja, e a seleção pondera clima, estação, calendário e maturação. Datas são do fuso America/Sao_Paulo. O gerador agenda no máximo uma compra por cliente por dia.
- **Cestas.** O tamanho, produto principal, segundo drink, snack e adicionais são sorteados com regras comerciais. A calibração regula a incidência de segunda bebida em amostra fixa. A saída mantém os preços de catálogo. Descontos rateados às linhas em centavos preservam o total do pedido.
- **Financeiro.** Bruto = subtotal de produtos + adicionais. Líquido = bruto − descontos. CMV = custos diretos de produtos, embalagens e doses. Margem bruta = (líquido − CMV) / líquido. Contribuição = líquido − CMV − taxa do pagamento − comissão − subsídio. Margem de contribuição = contribuição / líquido. Pagamentos capturados igualam o líquido. Frete cobrado, impostos e despesas fixas ficam fora. O total de contribuição dos pedidos exclui custo de envio de campanha, apropriado na métrica do experimento.
- **RF e ciclo de vida.** Os escores reproduzem os tercis de recência e frequência da implementação nativa para o mesmo recorte. Monetário é acumulado de líquido. VIP histórico exige o percentil configurado de valor e mínimo de compras. Risco complementar usa recência de pelo menos 37 dias e 1,65 vezes o intervalo mediano, antes da inatividade. Inatividade começa em 95 dias. Reativação é retorno após um hiato de pelo menos 60 dias.
- **Lojas e coortes.** Crescimento compara os três primeiros e três últimos meses completos da própria loja. A planilha mensal marca comparabilidade mês a mês. Alguns clientes se cadastraram antes da janela. Coortes e primeira compra usam a primeira compra observada. Recompra em 7, 15, 30, 60 e 90 dias exige janela completa por cliente. O retorno pode ocorrer em outra loja. A frequência por unidade usa os compradores da unidade como denominador.
- **Campanhas.** O público usa histórico anterior ao envio. A alocação aos três braços precede a realização do efeito. A propensão do tratamento pode antecipar uma compra planejada, preservando cotas anuais. Conversão na janela inclui compras orgânicas. Crédito para a campanha exige cupom simulado. Uplift é a diferença entre taxas de tratamento e controle. Receita incremental é diferença de receita média por pessoa vezes o tamanho do tratamento. Contribuição incremental deduz custos de envio. O simulador verifica efeito de curto prazo, com possibilidade de deslocamento de demanda no tempo.
- **Previsão.** Use atributos dos snapshots no corte e labels separados com horizonte de 30 dias. Treino, validação e teste são temporais. Censuras encerram janelas incompletas. Avalie previsões estimadas por outro modelo. O Parquet de traços latentes é exclusivo para auditoria.
- **Oportunidades.** A primeira oportunidade elegível na ordem publicada aloca o cliente à carteira. Cenários conservador, base e otimista usam taxas hipotéticas. Contribuição potencial = receita incremental × margem hipotética − custo por adesão × adesões esperadas.
- **Exceções.** Se um cenário analítico incluir devoluções, associe a reversão ao pedido original pelo histórico e deduza o valor estornado uma vez. Preserve a contagem de pedidos capturados conforme a pergunta de negócio. O livro de exceções é independente do universo principal.

## Código

model.py valida configuração e cria dimensões. journey.py aloca clientes, agenda visitas e aplica experimentos. commerce.py gera cestas, pagamento, descontos e fidelidade. analytics.py calcula métricas observáveis e labels. scenarios.py permite avaliar regras e métricas de ranking. validation.py verifica invariantes de negócio. delivery.py prepara e valida o Excel. Para outra marca, troque categorias, catálogo, regras, lojas e perfis. O fluxo de simulação é parametrizado, com afinidades de produtos e algumas regras comerciais SMOOV ainda específicas. Ajuste essas regras para segmentos com outro tipo de estoque, cesta ou recorrência.

Para avaliar detecções da plataforma, gere um CSV com scenario_id, entity_id e score sem consultar o gabarito. O avaliador lê o manifesto de casos observados e retorna acertos, falsos positivos, falsos negativos, precision, recall e F1. O parâmetro opcional --k limita a avaliação aos primeiros resultados por cenário.

~~~powershell
python -m tests.evaluate_predictions "../../smoov_demo_outputs/demo/ground_truth/scenario_manifest.json" "previsoes.csv" --k 100
~~~
