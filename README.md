# Dashboard Reconstruções

Painel local que acompanha o site reconstrucoes.digital, prepara os posts do Instagram (arte, 3 opções de legenda, hashtags) e organiza a semana.
Roda só no seu PC. Precisa apenas do Node.js 18 ou mais novo para usar. A tela é feita em React (Vite) e já vem compilada na pasta `dist`.

## Como abrir
Rode `node server.js` na pasta do projeto. O navegador abre em http://localhost:3000. Deixe a janela preta aberta enquanto usar.

## Primeira vez
1. Configurações: cole a chave do Gemini (Google AI Studio). Ela some depois de salva.
2. Ajuste @, localização, chamada do fim da legenda, hashtags fixas e seus horários preferidos.
3. Logo: coloque `logo-branco.png` e `logo-escuro.png` (fundo transparente) em `web/public/assets/` e recompile (veja abaixo). Os que já estão lá funcionam.
4. Planilha (opcional): siga os passos da seção "Planilha da cliente". O código está em `planilha/apps-script.gs`.

## Como funciona
- **Notícias do site**: lista em linhas, com filtros por período e busca. "Ler completa" abre a matéria numa área própria, sem janela por cima.
- **Fila**: cada matéria nova vira rascunho, com arte e 3 legendas (Factual, Alerta comunitário, Tópicos). Escolha, edite, confira data e hora e clique em Aprovar.
- **Formato**: quem decide é a quantidade de imagens. 1 foto = post único. Mais fotos (ou slides de texto) = carrossel. Um MP4 = reel. A IA não escolhe formato.
- **Calendário**: mês, semana e kanban. Amarelo = rascunho, azul = programado, verde = postado. Arraste entre dias, horários e colunas.
- **Histórico**: tudo com filtros por status, mês e busca (o ícone de lupa abre), link do post e da matéria, e situação da planilha.
- **Feed**: perfil com stories, Publicações, Reels e Stories separados, ou "Em linha".
- **Prévia (clique em qualquer post)**: abas Post ou Carrossel, Story e Reel. O story tem barra de progresso, perfil, barra de resposta e a figurinha de link que você arrasta. "Mostrar áreas seguras" liga as faixas a evitar.
- **Postar**: na prévia, "Gerar e salvar imagens", baixe, poste no Instagram/Meta Business Suite, cole o link do post e clique em **Marcar como postado**. Os arquivos são apagados do PC e a linha vai para a planilha.
- **Editar arte**: templates do Figma para post, carrossel e story, título, categoria, foto principal, mais fotos, slides de texto e enquadramento (arraste e use a rodinha do mouse).

## Mexer na tela (só se for editar o código)
A pasta `web/` tem o código React. Depois de mudar algo:
```
cd web
npm install      (só na primeira vez)
npm run build    (gera a pasta dist, que o servidor já usa)
```
Para ver as mudanças ao vivo enquanto edita: `npm run dev` e abrir http://localhost:5173 (com o `node server.js` rodando).
Se a pasta `dist` não existir, o servidor usa a versão antiga que está em `public/`.

## Observações
- O corte do "mais" no simulador é aproximado (2 linhas).
- Postagem direta pela API da Meta ainda não está ligada.
- Dados ficam em `data/db.json`. A chave fica em `config.json`. Não compartilhe esse arquivo.

## Subir na Vercel (sem rodar o .bat)

O mesmo código roda local (`node server.js`) e na Vercel. Na Vercel o banco e as fotos/vídeos ficam num Blob **privado** e o acesso é por senha.

1. Crie um repositório no GitHub com esta pasta (o `.gitignore` já deixa de fora `config.json`, `data/` e `node_modules/`) e suba.
2. Na Vercel: **Add New > Project**, escolha o repositório e **Deploy**. O build é `npm run build` e a saída é `dist/` (já está no `vercel.json`).
3. No projeto, aba **Storage > Create > Blob**, acesso **Private**, conecte ao projeto (isso cria `BLOB_READ_WRITE_TOKEN` e `BLOB_STORE_ID`).
4. Em **Settings > Environment Variables** crie:
   - `APP_PASSWORD`: a senha para entrar no dashboard (obrigatória, sem ela tudo fica bloqueado).
   - `CRON_SECRET`: qualquer texto longo (a Vercel manda ele no cron diário).
   - `GEMINI_API_KEY` (opcional): se não colocar, cole a chave em Configurações depois de entrar.
5. **Redeploy** e abra o endereço da Vercel.

Como fica a checagem do site: o dashboard aberto checa a cada `pollMinutes`. O cron da Vercel Hobby só roda 1 vez por dia, então o relógio de verdade é o **GitHub Actions** (`.github/workflows/tick.yml`), que chama `/api/cron` a cada hora, de graça. No repositório do GitHub: **Settings > Secrets and variables > Actions > New repository secret** e crie `SITE_URL` (ex.: `https://seu-projeto.vercel.app`, sem barra no fim) e `CRON_SECRET` (o mesmo valor da Vercel). O GitHub pode atrasar alguns minutos; ele pausa o agendamento se o repositório ficar 60 dias sem atividade.

## Postar no Instagram sozinho

Usa a API oficial da Meta (login do Instagram). Precisa de conta **profissional** (comercial ou criador).
1. Em developers.facebook.com crie um app (tipo Business), adicione o produto **Instagram** e, em *API setup with Instagram login*, adicione sua conta e gere o token com as permissões `instagram_business_basic` e `instagram_business_content_publish`.
2. No dashboard, **Configurações > Postagem automática**: cole o ID da conta e o token. O servidor renova o token sozinho (vale 60 dias, renova com 30).
3. Ao clicar em **Programar**, a arte final é renderizada no navegador (JPEG, ou MP4 no reel) e guardada; no horário o `tick` publica. **Postar agora** publica na hora. Depois de postar, os arquivos são apagados e a planilha é atualizada.

Limites: só post, carrossel (até 10) e reel; story ainda não sai automático. O reel precisa ser gravado em MP4 (Chrome/Edge atualizados). Se a publicação falhar 3 vezes, o item mostra o erro e para; clique em **Salvar horário** para tentar de novo. Confira os limites e a necessidade de revisão do app na documentação da Meta.

Limites: a função da Vercel aceita corpo de até 4,5 MB, por isso fotos e vídeos vão direto do navegador pro Blob. Vídeo vindo do Blob privado passa pela função, então avançar o vídeo no preview pode não funcionar como no local.
