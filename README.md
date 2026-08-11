# Portal de Dashboards

Site estático (para GitHub Pages) que reúne os dashboards de cada cliente atrás de uma tela de login simples.

## Estrutura

```
index.html                  → tela inicial: escolha de cliente + senha
assets/portal-config.js     → lista de clientes, cores e hash de senha
assets/auth-guard.js        → script que protege cada página de dashboard
assets/sheets-sync.js       → motor genérico de leitura das planilhas (CSV)
assets/live-status-ui.js    → indicador "dados ao vivo/snapshot" + botão Atualizar
assets/live/*.js            → um script por cliente que liga o dashboard à planilha
admin/gerar-senha.html      → utilitário para gerar hash de nova senha
clientes/*.html             → um arquivo por cliente (os dashboards em si)
```

## Como funciona o login

⚠️ **Isso é apenas separação visual de acesso, não é segurança de verdade.**
GitHub Pages só serve arquivos estáticos, então qualquer pessoa com conhecimento
técnico pode ver o código-fonte, os hashes de senha e os dados de todos os
clientes. Não coloque aqui nenhum dado que não possa vazar.

Cada cliente tem uma senha. Ao digitar a senha correta em `index.html`, o hash
dela é comparado com o `passwordHash` salvo em `assets/portal-config.js` e, se
bater, o navegador grava uma "sessão" local por 12 horas e libera o acesso ao
arquivo daquele cliente em `clientes/`.

As senhas de cada cliente já foram personalizadas (não são mais as de exemplo).
Elas não ficam em texto puro em lugar nenhum do projeto — só o hash em
`assets/portal-config.js` — então não há como consultá-las aqui; se esquecer
uma, é só gerar outra pelo passo abaixo.

### Como trocar a senha de um cliente

1. Abra `admin/gerar-senha.html` no navegador (funciona offline, sem precisar subir nada).
2. Digite a nova senha e copie o hash gerado.
3. Em `assets/portal-config.js`, substitua o `passwordHash` do cliente correspondente.

### Como adicionar um novo cliente

1. Coloque o HTML do dashboard em `clientes/nome-do-cliente.html`.
2. No `<head>` desse arquivo, logo após a tag `<title>`, adicione:
   ```html
   <script src="../assets/portal-config.js"></script>
   <script src="../assets/auth-guard.js" data-client="nome-do-cliente"></script>
   ```
3. Em `assets/portal-config.js`, adicione um novo item ao array `PORTAL_CLIENTS` com
   `slug` (igual ao `data-client` usado acima), `name`, `file`, `color` e `passwordHash`
   (gerado em `admin/gerar-senha.html`).

## Publicando no GitHub Pages

1. Suba esta pasta para um repositório no GitHub.
2. Nas configurações do repositório → **Pages**, selecione a branch `main` e a pasta raiz (`/`).
3. O site fica disponível em `https://seu-usuario.github.io/nome-do-repositorio/`.

## Dados ao vivo via Google Sheets

Todos os 5 dashboards já buscam os dados direto das planilhas de origem no Google
Drive sempre que a página é aberta (e a cada clique em **Atualizar**). O indicador
no topo mostra **● dados ao vivo (horário)** quando a busca funciona, ou
**○ snapshot** quando a planilha está inacessível (sem internet, planilha movida,
permissão de compartilhamento removida etc.) — nesse caso o dashboard continua
funcionando normalmente com os últimos dados salvos no próprio HTML.

Como funciona: cada arquivo em `clientes/` carrega `assets/sheets-sync.js` (o
"motor" genérico que baixa e interpreta as planilhas como CSV) e um script próprio
em `assets/live/<cliente>.js` com os IDs das planilhas daquele cliente e o mapeamento
para a estrutura de dados que aquele dashboard específico espera — cada um foi
construído artesanalmente porque cada dashboard tem seu próprio formato interno.

**Requisito nas planilhas**: precisam continuar com o link compartilhado como
"qualquer pessoa com o link pode visualizar" (é assim que já estão hoje). Se essa
permissão for removida, o dashboard correspondente volta a mostrar só o snapshot.

**Pendências conhecidas:**
- Cumbuca: no Top 10 Produtos, a etiqueta 🆕 "produto novo" é marcada na planilha
  pintando a célula de amarelo — isso não existe numa exportação CSV simples (só
  valores, sem formatação), então não dá pra detectar automaticamente. Em vez disso,
  `assets/live/cumbuca.js` mantém uma lista manual (`NEW_PRODUCT_KEYWORDS`) com os
  nomes dos produtos novos confirmados por você; se lançar um produto novo, é só
  adicionar um trecho do nome dele nessa lista.
- Sunomono: se uma unidade especificamente falhar ao buscar (planilha renomeada,
  movida etc.), ela mantém os dados antigos enquanto as outras 19 atualizam
  normalmente — o indicador some do "ao vivo" só se **mais de 40%** das unidades
  falharem de uma vez.

### Adicionar sincronização ao vivo pra um novo cliente

1. Descubra o ID da planilha e o `gid` de cada aba relevante (abra a planilha,
   veja a URL — ID vem depois de `/d/`; gid aparece na URL ao trocar de aba).
2. Confirme que a planilha está com "qualquer pessoa com o link pode visualizar".
3. Crie `assets/live/<cliente>.js` seguindo um dos exemplos existentes como
   referência — o mais parecido com a estrutura de dados do novo dashboard.
4. No HTML do cliente, adicione antes de `</body>`:
   ```html
   <script src="../assets/sheets-sync.js"></script>
   <script src="../assets/live-status-ui.js"></script>
   <script src="../assets/live/nome-do-cliente.js"></script>
   ```
