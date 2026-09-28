FUNCIONALIDADES
[x] Respostas
[x] Timer da questao
[x] Timer total
[x] Resumo final
[x] Marcacao das questoes na barra lateral
[x] No celular, scrollar para baixo no site faz desconfigura um pouco a tela
[x] Seletor de qual prova e qual dia fazer
[x] Alternar Ingles e Espanhol
[x] Textos faltando. Link para a leitura do texto OU texto completo presente
[x] Randomizador da ordem das alternativas
[x] Resumo com assuntos de menor dominio e maior tempo medio de resolucao

LOGIN
[x] Conectar um banco de dados + bug report tool
[x] Login para os alunos
    [x] Armazenar o que o aluno ja fez
    [x] Armazenar o historico desse aluno (melhor/pior, etc)
[x] Persistencia por aluno, provas feitas, performance, tempo, login e senha

MODOS DE USO
[x] Opcao de pausar o simulado
[x] Modo simulado (sem saber as respostas, correcao no fila)
[x] Selecao de AREA
[x] Selecao de MULTIPLOS ASSUNTOS
[x] Selecao de PROVA COMPLETA (com timer)
[x] Selecao por DISCIPLINA (Quimica, Fisica, Biologia, Historia, etc.)
[x] Filtro de questoes MULTIDISCIPLINARES

ENRIQUECIMENTO DE DADOS
[x] Nivel da dificuldade da questao
[] Comentario de resolucao da questao

NICE TO HAVE
[] Tutorial de uso da plataforma
[] Legal disclaimer
[] Resumo usando IA das questoes que foram erradas

FERRAMENTAS DE LONGO PRAZO
[] Ferramenta para criar questoes
[x] Ferramenta para reportar bugs


REVISAO:
 [x] ENEM 2025
    [x] linguagens
    [x] humanas
    [x] ciencias
    [x] matematica
 [x] ENEM 2024
    [x] linguagens
    [x] humanas
    [x] ciencias
    [x] matematica
 [x] ENEM 2023
    [x] linguagens
    [x] humanas
    [x] ciencias
    [x] matematica
 [x] ENEM 2022
    [x] linguagens
    [x] humanas
    [x] ciencias
    [x] matematica
 [x] ENEM 2021
    [x] linguagens
    [x] humanas
    [x] ciencias
    [x] matematica
 [x] ENEM 2020
    [x] linguagens
    [x] humanas
    [x] ciencias
    [x] matematica
 [x] ENEM 2019
    [x] linguagens
    [x] humanas
    [x] ciencias
    [x] matematica
 [x] ENEM 2018
    [x] linguagens
    [x] humanas
    [x] ciencia
    [x] matematica

ETAPA 2:
UFSC
CORRECAO DE GABARITOS v3.1.2 (21/09/2026)
Cruzamento prova local x duas fontes externas x gabarito oficial INEP.
21 divergencias ANSWER_MISMATCH_VS_OFFICIAL -> 0.

[x] Espanhol 1-5 com gabarito do ingles (11 questoes)
    [x] 2018 q3 d->c, q4 e->d, q5 c->b
    [x] 2019 q1 b->a, q2 d->b, q3 a->c, q4 b->a, q5 e->d
    [x] 2019 q5 entrada de ingles estava com language=es e disciplinas=espanhol
    [x] 2020 q2 a->c, q4 d->e, q5 c->e
[x] Gabaritos avulsos divergentes do oficial (4)
    [x] 2021 humanas q56 c->d
    [x] 2021 humanas q85 c->a
    [x] 2021 math q179 b->a
    [x] 2024 math q166 c->e
[x] Alternativas e answer copiados da questao vizinha (3)
    [x] 2024 nature q125 (era copia da q126) answer a->c
    [x] 2025 humanas q56 (era copia da q57) answer a->c
    [x] 2025 nature q95  (era copia da q96) answer b->c
[x] Alternativas com palavra trocada, confirmadas em fonte publica (4)
    [x] 2021 humanas q56 alt C "adequacao"->"superacao" do pensamento patriarcal
    [x] 2021 humanas q56 alt D "estruturas"->"estratificacoes" sociais
    [x] 2021 humanas q85 alt A "redes"->"relacoes" de trabalho
    [x] 2021 humanas q85 alt C "apropriacao"->"suavizacao" da aplicacao de normas
[x] scripts/extract-gabarito.js lia "Anulada" como letra A
    [x] 2020 q135 e q157 sao anuladas oficiais; base local ja estava certa
    [x] removeu tambem chave espuria 2019:1
[x] contextId (string) -> contextIds (array) em 350 questoes
    [x] 621 questoes sem contexto ganharam contextIds: []
    [x] todas as 1480 questoes agora tem o campo, sempre array
[x] src/data/gabaritoOficial.test.js: 5 travas (gabarito, language x disciplinas,
    array de contexto, referencia existente, questao duplicada)
[x] npm run test:all = vitest + audit

NAO FEITO (fica registrado)
[ ] 2020 linguagens q38: local "nobre" esta certo, "noble" e OCR da fonte externa. Sem acao.
[ ] 4 contextos orfaos sao copias redundantes; questao ja tem texto e figura proprios.
    enem_2020_nature_q99_ctx1, enem_2021_math_q156_ctx1,
    enem_2021_math_q176_ctx1, enem_2021_nature_q125_ctx1
[ ] nature_enem_2019 q113: alternativas b=d e c=e dentro da propria questao.
[ ] Erros de transcricao nas fontes externas (fora do app):
    [ ] fonte A 2020/Azul/105 campo=a mas resolucao diz "alternativa D"
    [ ] fonte B 2022/Azul/145 campo=d mas resolucao cita o oficial E
    [ ] fonte B 2021/Azul/24 e fonte A linguagens 2020 q34: discordancia real, nao erro
    [ ] 10 divergencias fonte externa x oficial sem letra citada na resolucao
