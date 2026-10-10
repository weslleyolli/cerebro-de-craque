# Cérebro de Craque

Treino de leitura de jogo no futsal para crianças. A jogada roda na quadra vista
de cima, congela no momento da decisão ("pausa tática") e a criança escolhe:
passar, chutar, driblar, proteger a bola ou se posicionar. Depois vê o que a
escolha causou, com uma explicação que ensina o conceito. Pais e treinadores
acompanham, numa área própria, onde a criança lê bem o jogo e onde tem dificuldade.

| Camada | Tecnologia |
| --- | --- |
| Front | React 19 + TypeScript + Vite, Tailwind CSS 4, TanStack Query, React Router. PWA instalável no celular. |
| Back | Python 3.12+, FastAPI, SQLAlchemy 2, Alembic, JWT (PyJWT) e senhas com Argon2 (pwdlib). |
| Banco | PostgreSQL 16. A geometria das jogadas fica em JSONB. |

## Rodar tudo com Docker

```bash
cp .env.example .env      # preencha POSTGRES_PASSWORD e JWT_SECRET
docker compose up --build
```

Abra http://localhost:8080. O nginx serve o app e repassa `/api` para a API,
que aplica as migrações e carrega as jogadas ao subir. A API e o banco não
ficam expostos na rede: o banco só aceita conexões desta máquina
(`127.0.0.1:${DB_PORT:-5432}`), e a API só é acessível pelo nginx.

Variáveis do `.env`: `POSTGRES_PASSWORD` e `JWT_SECRET` (obrigatórias),
`ENVIRONMENT` (padrão `production`), `WEB_PORT` (padrão 8080) e `DB_PORT`
(padrão 5432).

## Desenvolvimento

Banco (ou use um Postgres local):

```bash
cp .env.example .env      # se ainda não fez
docker compose up -d db
```

API, em `backend/` (precisa do [uv](https://docs.astral.sh/uv/)):

```bash
cp .env.example .env      # backend/.env: aponte DATABASE_URL para o seu banco
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload        # http://localhost:8000/docs
```

App, em `frontend/`:

```bash
npm install
npm run dev                                  # http://localhost:5173
```

O Vite repassa `/api` para `localhost:8000`. Para testar no celular na mesma
rede Wi-Fi, use `npm run dev -- --host` e abra o endereço "Network".

## Testes e verificações

```bash
# backend/ — usa um banco de teste de verdade, apagado a cada execução
docker compose exec db createdb -U craque craque_test
uv run pytest      # ou TEST_DATABASE_URL=postgresql+psycopg://usuario@host/banco uv run pytest
uv run ruff check . && uv run ruff format --check .

# frontend/
npm test          # motor da quadra e montagem das sessões
npm run lint
npm run build     # inclui a checagem de tipos
```

O banco de teste é recriado pelas migrações a cada execução, então elas também são testadas.
O GitHub Actions (`.github/workflows/ci.yml`) roda tudo isso a cada push e pull request.

## Estrutura

```
backend/
  app/
    main.py             # FastAPI, CORS e carga das jogadas no startup
    models.py           # users, players, scenarios, attempts
    schemas.py          # contratos da API e validação das jogadas
    stats.py            # pontos, medalhas, estatísticas e diagnóstico (funções puras)
    seed.py             # carrega data/scenarios.json no banco (idempotente)
    data/scenarios.json # o banco de jogadas
    routers/            # auth, scenarios, players (decisões e estatísticas)
  alembic/              # migrações
  tests/
frontend/
  src/
    api/                # cliente HTTP, tipos e hooks do TanStack Query
    auth/               # sessão do responsável e jogador ativo
    game/               # motor da quadra, animação, SVG da quadra e sessões
    pages/              # entrar, criar conta, início, treino, área dos pais
    components/         # layout e componentes de interface
    lib/                # textos de categorias, notas e formatação
```

## Como o app funciona

- **Conta do responsável.** Pai, mãe ou treinador cria a conta. Cada criança é
  um perfil (`player`) com pontos, medalhas e ajustes próprios.
- **Pausa tática.** O motor (`frontend/src/game/engine.ts`) interpola posições
  entre trechos da jogada. A bola acompanha quem conduz e viaja sozinha no passe
  e no chute.
- **Nota no servidor.** O app envia só a opção escolhida e o tempo de decisão. A
  API busca a nota na jogada (`best`, `ok`, `bad`, ou `late` quando o tempo acaba)
  e devolve as medalhas novas.
- **Notas:** ótima leitura vale 3 pontos, "dá para melhorar" vale 1, escolha
  arriscada ou tempo esgotado vale 0.
- **Medalhas ficam gravadas.** Uma medalha conquistada nunca é retirada, nem
  quando entra uma jogada nova na categoria. "Apagar histórico" apaga as
  decisões e as medalhas.
- **Área dos pais.** Protegida por uma conta de multiplicação, para a criança
  não entrar por engano. Mostra acertos por categoria e por conceito, tempo médio
  de decisão, os últimos lances e um diagnóstico com sugestão de treino.

## API

Documentação interativa em http://localhost:8000/docs com a API rodando em desenvolvimento (`uv run uvicorn ...`).

| Método | Rota | O que faz |
| --- | --- | --- |
| POST | `/api/auth/register` | Cria a conta do responsável e devolve o token |
| POST | `/api/auth/login` | Entra e devolve o token |
| GET | `/api/auth/me` | Dados da conta |
| GET | `/api/scenarios` | Jogadas ativas, na ordem do app (pública) |
| GET | `/api/scenarios/{id}` | Uma jogada |
| GET / POST | `/api/players` | Lista e cria jogadores da conta |
| PATCH / DELETE | `/api/players/{id}` | Renomeia, muda ajustes ou apaga |
| POST | `/api/players/{id}/attempts` | Registra uma decisão; a nota é calculada aqui |
| GET | `/api/players/{id}/stats` | Estatísticas, medalhas, diagnóstico e últimos lances |
| DELETE | `/api/players/{id}/attempts` | Apaga o histórico do jogador |

## Adicionar uma jogada

As jogadas ficam em `backend/app/data/scenarios.json`. A API valida e carrega o
arquivo ao subir; para carregar sem reiniciar, rode `uv run python -m app.seed`.

- **Quadra:** 20 × 40 m. `x` vai de 0 a 20 e `y` de 0 (gol adversário) a 40 (nosso gol).
  O time da criança sempre ataca para cima.
- **Jogadores:** `v` é a criança. `a1`, `a2` e `f` são companheiros e `o1` a `o4`
  são adversários. Os goleiros `gk` e `o0` entram sozinhos, se não forem listados.
- **Etiquetas:** `tags` dá as letras dos companheiros (AE, AD, P, F).
- **Direção:** `face` diz quem joga de costas (`"down"`), como o pivô.
- **Câmera:** `view.top` e `view.bottom` definem o pedaço da quadra que aparece.
- **Trechos da animação:** `intro` roda antes da pausa. Cada opção tem os seus
  `frames`. Cada trecho tem `ms` (duração), `moves` (para onde cada um vai) e
  `ball` (com quem fica a bola, ou um ponto da quadra).
- **Opções:** de 2 a 4. Exatamente uma é `best`. Use `target` para um passe a um
  companheiro, ou `hint` para a seta apontar um lugar da quadra.

Nunca apague uma jogada que já foi jogada: as decisões apontam para ela. Para
tirá-la do app, marque `active = false` no banco.

## Publicar na internet (Netlify + Render + Neon, tudo gratuito)

O Netlify só hospeda sites; ele não roda Python nem Postgres. Por isso são três
serviços, cada um ligado a este repositório do GitHub:

| Parte | Onde | Arquivo de configuração |
| --- | --- | --- |
| App (React, PWA) | Netlify | `netlify.toml` |
| API (FastAPI) | Render | `render.yaml` e `backend/Dockerfile` |
| Banco (PostgreSQL) | Neon | nenhum, só a connection string |

Antes de começar, escolha o nome do site no Netlify, por exemplo
`cerebro-de-craque`. O endereço será `https://cerebro-de-craque.netlify.app`, e
a API precisa saber esse endereço.

### 1. Banco no Neon

1. Crie a conta em https://neon.com e um projeto novo, na região
   **AWS US East 1 (N. Virginia)**, a mesma da API.
2. Clique em **Connect**, **desligue** "Connection pooling" e copie a connection
   string (`postgresql://...neon.tech/neondb?sslmode=require...`).

### 2. API no Render

1. Em https://render.com, **New > Blueprint**, conecte o GitHub e escolha este
   repositório. O Render lê o `render.yaml` e mostra o serviço
   `cerebro-de-craque-api`.
2. Ele pede duas variáveis:
   - `DATABASE_URL`: a connection string do Neon, do jeito que veio.
   - `CORS_ORIGINS`: o endereço do site, ex.: `https://cerebro-de-craque.netlify.app`.
     Vários endereços vão separados por vírgula.
   O `JWT_SECRET` é gerado sozinho.
3. Espere o deploy e abra `https://<seu-serviço>.onrender.com/api/health`.
   Tem que aparecer `{"status":"ok"}`. A API cria as tabelas e carrega as
   jogadas ao subir.

### 3. App no Netlify

1. Em https://app.netlify.com, **Add new project > Import an existing project**,
   escolha GitHub e este repositório. O Netlify lê o `netlify.toml`.
2. Antes do primeiro deploy, adicione a variável de ambiente `VITE_API_URL` com o
   endereço da API no Render, sem barra no fim
   (ex.: `https://cerebro-de-craque-api.onrender.com`). Sem ela, o build para
   com uma mensagem explicando o que falta.
3. Faça o deploy e troque o nome do projeto para o que você escolheu. Se o nome
   for outro, atualize `CORS_ORIGINS` no Render.
4. No celular, abra o endereço e use "Adicionar à tela de início".

### Bom saber

- **Plano gratuito do Render:** a API dorme depois de 15 minutos sem uso, e o
  primeiro acesso depois disso demora até um minuto. O app avisa que o servidor
  está acordando.
- **Neon gratuito:** o banco fica guardado e não expira; ele só "dorme" sem uso e
  acorda na primeira consulta.
- **Novas versões:** cada push na `main` publica sozinho. O Render só refaz a API
  quando algo muda em `backend/`.
- **Segurança:** a API se recusa a subir com um `JWT_SECRET` fraco fora de
  desenvolvimento. Login e cadastro aceitam até 10 tentativas por minuto por IP,
  e a API limita quantos hashes de senha roda ao mesmo tempo.
- **Docker:** no `docker-compose.yml` o nginx deixa app e API no mesmo endereço,
  e aí `CORS_ORIGINS` e `VITE_API_URL` não são necessários.
