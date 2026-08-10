# Kozo 0.7.1 — Developer Conventions e Golden Path architetturale

> **Data piano:** 10 agosto 2026
>
> **Baseline locale:** `main` @ `f35e67f` (`chore: release 0.7.0`)
>
> **Target:** `@kozojs/*@0.7.1`
>
> **Tipo release:** patch additiva, senza breaking change
>
> **Stato:** piano di implementazione — nessuna modifica runtime inclusa in questo documento

---

## 1. Obiettivo

Kozo 0.7.1 deve offrire agli sviluppatori un percorso architetturale ufficiale,
semplice e ripetibile, senza trasformare Kozo in una copia più verbosa di
NestJS.

Il risultato atteso è un **Kozo Golden Path** che combini:

1. feature modules verticali;
2. contratti HTTP Zod come unica fonte di verità;
3. router statici tramite `createRouter()` e `app.mount()`;
4. business logic indipendente dal trasporto HTTP;
5. generatori CLI che creano una feature completa;
6. controlli automatici dell'architettura;
7. test di contratto in-process e smoke test native;
8. documentazione e template coerenti tra loro.

La convenzione deve ridurre il numero di decisioni che un nuovo sviluppatore
deve prendere, mantenendo però l'approccio funzionale e leggero di Kozo.

---

## 2. Diagnosi della baseline 0.7.0

### 2.1 Punti di forza da preservare

- `createRouter()` + `mount()` mantengono il route tree nel tipo TypeScript.
- Un contratto può alimentare validazione runtime, serializer, OpenAPI, client
  TypeScript e contract test.
- `AppServices` offre dependency injection semplice senza container o decorator.
- `app.guard()` mantiene la stessa semantica sui transport Hono e native.
- `@kozojs/testing` offre client raw, contract-aware e native.
- TypeScript strict è già la baseline del monorepo e dei template principali.

### 2.2 Problemi di developer experience

| Problema | Evidenza 0.7.0 | Impatto |
|---|---|---|
| Più stili concorrenti | template minimal monolitico, file routing, contract showcase statico | due sviluppatori possono creare architetture incompatibili |
| Generator troppo atomico | `kozo generate route` e `kozo generate service` sono separati | non genera una vertical slice completa |
| Minimal presentato come app | un solo `src/index.ts` | incoraggia route e logica nello stesso file |
| File routing come percorso dominante della CLI | una route per metodo sotto `src/routes` | il route union statico non è automaticamente preservato |
| Nessun architecture check | il CLI non verifica dipendenze o contratti | gli errori emergono in review o dopo il porting |
| Lint CLI non reale | `packages/cli` usa un comando lint no-op | nessun guardrail su template e generatori |
| Response contract opzionali senza policy | route valide ma client con output `unknown` | OpenAPI e SDK possono risultare incompleti |
| Status automatici non sempre nel contratto | validazione, guard e limiti possono produrre status non dichiarati | il client può ricevere `KozoUnexpectedResponseError` |
| Convenzioni sparse | README, esempi e template mostrano forme diverse | onboarding più lento e scelte arbitrarie |

### 2.3 Decisione architetturale

Per applicazioni API production, il default ufficiale diventa:

> **Contract-first feature modules + static router composition.**

Il filesystem routing rimane supportato e documentato come modalità opzionale
per applicazioni che privilegiano discovery e convenzione URL/file, ma non deve
essere il default quando servono client tipizzati, OpenAPI completo e contract
test statici.

Il template `minimal` rimane disponibile come playground/tutorial. Non deve
essere presentato come struttura consigliata per un'applicazione destinata a
crescere.

---

## 3. Kozo Application Standard 0.7.1

### 3.1 Struttura obbligatoria del Golden Path

```text
src/
  app/
    create-app.ts
    config.ts
    errors.ts

  modules/
    users/
      users.contract.ts
      users.service.ts
      users.routes.ts
      users.test.ts
      index.ts

    trips/
      trips.contract.ts
      trips.service.ts
      trips.routes.ts
      trips.test.ts
      index.ts

  infrastructure/
    database/
    auth/
    logging/

  index.ts
```

`repository.ts`, `domain/` e `services/` interni sono opzionali e devono essere
introdotti solo quando la complessità del modulo lo richiede.

### 3.2 Responsabilità dei file

| File | Deve contenere | Non deve contenere |
|---|---|---|
| `*.contract.ts` | schemi body/query/params/headers/response, tipi inferiti, metadata condivisi | Prisma, accesso rete, business logic |
| `*.routes.ts` | metodo, path, contract, status, chiamata al service | query DB, hashing, token signing, algoritmi di dominio |
| `*.service.ts` | use case, regole applicative, orchestrazione | `KozoContext`, `Response`, path o status HTTP |
| `*.repository.ts` | accesso DB e mapping persistence/domain | decisioni HTTP, guard, serializzazione response |
| `*.test.ts` | contract test, casi negativi e comportamento principale | bootstrap production |
| `index.ts` | export pubblici del modulo | dettagli interni non destinati ad altri moduli |

### 3.3 Regole di dipendenza

```text
routes -> contract + service
service -> domain/repository/ports
repository -> database client
app -> public index dei moduli
```

Regole normative:

1. `*.routes.ts` non importa Prisma, Drizzle o driver database.
2. `*.service.ts` non importa tipi HTTP di Hono o Kozo context.
3. `*.contract.ts` importa solo Zod, tipi e contract condivisi.
4. Un modulo importa un altro modulo solo dal suo `index.ts` pubblico.
5. Nessun deep import tra `src/modules/<feature-a>` e `<feature-b>`.
6. Le dipendenze infrastrutturali arrivano tramite `AppServices` o porte
   esplicite.
7. `src/app/create-app.ts` configura services, guard, middleware, error hook,
   docs e mount; non contiene business logic.
8. Le route destinate a OpenAPI, SDK o contract test usano `createRouter()` e
   vengono composte con `app.mount()`.
9. È vietato ignorare il valore restituito da una catena route quando il route
   tree tipizzato è un requisito.
10. `app.group()` e discovery dinamica non devono essere presentati come
    equivalenti alla composizione statica per i client tipizzati.

### 3.4 Convenzioni di naming

- Directory feature: plurale del dominio (`users`, `trips`, `devices`).
- Contract: `<feature>.contract.ts`, non `dto.ts` e non generico `schemas.ts`.
- Router: `<feature>.routes.ts`.
- Service piccolo: `<feature>.service.ts`.
- Use case separato: verbo + entità (`create-trip.ts`, `list-trips.ts`).
- Repository: `<feature>.repository.ts`.
- Errori di dominio: `<feature>.errors.ts` solo se non condivisi.
- Test contract: `<feature>.contract.test.ts`.
- Test service: `<feature>.service.test.ts`.
- Entry pubblica: `index.ts`.

Evitare abbreviazioni locali come `E`, `b`, `q`, `x` nei file applicativi.
Sono accettabili solo indici di loop o scope matematici molto piccoli.

### 3.5 Complessità progressiva

Kozo non deve imporre repository e classi a ogni feature.

#### Livello 1 — feature semplice

```text
feature.contract.ts
feature.service.ts
feature.routes.ts
feature.test.ts
```

#### Livello 2 — feature con più use case

```text
feature.contract.ts
feature.routes.ts
services/
  create-feature.ts
  update-feature.ts
  list-features.ts
```

#### Livello 3 — dominio complesso

```text
domain/
repositories/
services/
feature.contract.ts
feature.routes.ts
```

Soglie iniziali, applicate come warning:

- route file oltre 150 righe;
- service oltre 250 righe;
- service con più di 5 use case esportati;
- handler route oltre 15 righe;
- più di una query database direttamente nello stesso handler.

Le soglie servono a segnalare un possibile problema, non a imporre
atomizzazione meccanica.

---

## 4. Policy dei contratti

### 4.1 Regole obbligatorie

Ogni endpoint pubblico deve dichiarare, quando presenti:

- `body`;
- `query`;
- `params`;
- `headers` rilevanti per il consumer;
- response schema per ogni status pubblico documentato;
- metadata OpenAPI (`summary`, `tags`) per applicazioni che montano docs.

Non sono ammessi nei contratti pubblici:

- `z.any()`;
- `as any`;
- response schema generico usato solo per far passare TypeScript;
- `z.unknown()` come sostituto permanente di un output noto;
- pass-through di record DB contenenti campi non pubblici.

`z.unknown()` resta ammesso per payload realmente opachi e deve avere un
commento che spieghi il motivo.

### 4.2 Import Zod

Nei contratti Kozo ufficiali usare una sola convenzione:

```ts
import { z } from '@kozojs/core';
```

Questo riduce esempi discordanti e mantiene la versione compatibile con Kozo.
L'import diretto da `zod` resta supportato per codice applicativo non legato ai
contract, ma non viene usato nei template ufficiali.

### 4.3 Response contract

Il Golden Path deve mostrare sempre response map esplicite:

```ts
response: {
  201: UserSchema,
  400: ProblemSchema,
  409: ProblemSchema,
}
```

Un bare response schema rimane supportato per endpoint semplici con solo 200.

### 4.4 Error contract standard

Lo standard raccomandato è RFC 7807 (`application/problem+json`).

Creare contract condivisi per:

- validation problem;
- unauthorized problem;
- forbidden problem;
- not found problem;
- conflict problem;
- rate limit problem;
- internal problem.

Gli adapter legacy restano a livello applicativo e non diventano il formato
predefinito Kozo.

### 4.5 Status automatici del framework

Problema da risolvere: validazione, guard, body limit e handler error possono
generare `400/401/403/413/429/500` anche quando la route dichiara solo gli
status applicativi.

#### Direzione raccomandata

Progettare un'opzione additiva per router con response predefinite:

```ts
const protectedRouter = createRouter<AppServices>({
  defaultResponses: protectedApiProblems,
});
```

Requisiti:

1. merge type-safe tra default response e response della route;
2. route response con precedenza sui default;
3. OpenAPI include gli status risultanti;
4. generated client e contract test vedono la stessa union;
5. runtime validation e native transport producono uno schema compatibile;
6. nessuna modifica alla semantica di `createRouter()` senza argomenti.

#### Gate semver

Se l'allineamento non può essere introdotto senza allargare in modo breaking le
union esistenti, 0.7.1 deve limitarsi a:

- design approvato;
- API opt-in;
- documentazione del limite corrente;
- test che impediscano claim di status completeness non veri.

Il comportamento di default non deve cambiare silenziosamente in una patch.

---

## 5. Services, infrastructure e configurazione

### 5.1 AppServices

`AppServices` è il composition boundary ufficiale:

```ts
interface AppServices extends Record<string, unknown> {
  db: Database;
  clock: Clock;
  idGenerator: IdGenerator;
}
```

Linee guida:

- dipendenze esterne esplicite;
- niente service locator globale;
- niente import diretto del singleton DB nei service di dominio;
- clock e generatori ID iniettati quando rendono i test deterministici;
- scoped services solo quando esiste realmente uno scope request-specific.

### 5.2 Repository opzionali

Il repository non è obbligatorio per CRUD semplici. Deve essere introdotto
quando almeno una delle condizioni è vera:

- più use case condividono query complesse;
- il dominio non deve dipendere dai tipi Prisma/Drizzle;
- servono adapter storage differenti;
- i test del service richiedono una porta stabile;
- il mapping persistence/public response contiene regole non banali.

### 5.3 Configurazione

- `process.env` ammesso solo nel modulo config/bootstrap.
- Validazione environment all'avvio.
- Segreti mai presenti in template, esempi o default production.
- Config immutabile passata attraverso services/config.
- `NODE_ENV` non usato come sostituto di una capability esplicita.

### 5.4 Guard e sicurezza

- Auth, role, permission e rate limit passano da `app.guard()`.
- Una route non verifica manualmente il bearer token.
- I pattern guard vengono registrati prima delle route protette.
- Ogni guard ha almeno un test Hono/in-process e uno smoke native.
- Le response deny rispettano il Problem contract standard.
- I template non devono usare middleware Hono per controlli che richiedono
  parity native.

---

## 6. Testing Standard

### 6.1 Matrice minima per feature

| Livello | Strumento | Copertura minima |
|---|---|---|
| Contract type | `createContractTestClient` + typecheck | input, params, query, status union |
| Raw negative | `createTestClient` | payload malformato, header mancante, route sconosciuta |
| Service | Vitest diretto | regole di dominio e failure path |
| Native smoke | `createNativeTestClient` | auth guard, CORS o comportamento transport-sensitive |
| Route inventory | `getRoutes()` | path/metodo unici e mount presenti |

### 6.2 Regole

- Non limitarsi a testare il numero delle route.
- Ogni feature include almeno un happy path e un negative path.
- I test service non avviano HTTP.
- I contract test non usano cast per aggirare gli input tipizzati.
- I casi intenzionalmente invalidi usano il raw client.
- Il client native viene sempre chiuso in `finally`/`afterEach`/`afterAll`.
- La CI esegue il type test dedicato di `@kozojs/testing`.
- Le automatic response devono avere test sia in-process sia native.

---

## 7. Modifiche CLI 0.7.1

### 7.1 Nuovo generatore feature

Comandi target:

```bash
kozo generate feature users
kozo generate feature users --crud
kozo generate feature trips --repository
kozo generate feature admin --auth
```

Alias ammessi:

```bash
kozo g feature users
kozo g f users
```

Output base:

```text
src/modules/users/
  users.contract.ts
  users.service.ts
  users.routes.ts
  users.test.ts
  index.ts
```

Comportamento:

1. validare il nome feature;
2. non sovrascrivere file senza conferma esplicita;
3. generare contract request e response concreti di esempio;
4. generare router statico `createRouter<AppServices>()`;
5. generare service senza `KozoContext`;
6. generare contract/raw test iniziali;
7. aggiornare opzionalmente `src/modules/index.ts`;
8. proporre il mount senza modifiche ambigue automatiche;
9. supportare `--dry-run` con lista file e diff previsto;
10. produrre output deterministico testabile via snapshot.

### 7.2 Compatibilità generatori esistenti

- `generate route`, `middleware`, `dir-middleware`, `service` restano validi.
- La help CLI presenta `feature` come comando raccomandato per production API.
- I generatori filesystem vengono descritti come modalità file-routing.
- Nessun comando esistente cambia output in modo breaking in 0.7.1, salvo fix
  chiaramente classificati come bug e coperti da migration note.

### 7.3 Nuovo architecture check

Comando target:

```bash
kozo check
kozo check --architecture
kozo check --contracts
kozo check --json
```

Implementazione raccomandata: TypeScript Compiler API, con `typescript` come
dipendenza runtime esplicita di `@kozojs/cli` oppure risoluzione controllata del
TypeScript del progetto con fallback documentato.

#### Errori bloccanti

- Prisma/Drizzle/driver importato da `*.routes.ts`;
- `KozoContext`, Hono `Context` o `Response` importato da `*.service.ts`;
- `z.any()` in un contract pubblico;
- deep import tra feature modules;
- `process.env` fuori dai path config consentiti;
- route statica non esportata/montata nel manifest atteso, quando verificabile;
- template Golden Path privo di typecheck o test.

#### Warning

- route/service oltre le soglie;
- handler oltre 15 righe;
- endpoint pubblico senza response schema;
- `z.unknown()` senza commento;
- modulo senza test;
- naming non conforme.

#### Output

Ogni finding contiene:

- codice stabile (`KOZO_ARCH001`);
- severità;
- file e linea;
- descrizione;
- correzione suggerita;
- documentazione collegata.

`--json` deve consentire integrazione IDE/CI.

### 7.4 Lint reale del package CLI

Sostituire il lint no-op con una configurazione reale per TypeScript.

Gate:

- lint del sorgente CLI;
- lint dei template generati;
- test dei generatori;
- test Windows path e POSIX path;
- nessun template contenente mojibake o placeholder non sostituito.

---

## 8. Template e documentazione

### 8.1 Nuovo template production

Nome raccomandato:

```bash
create-kozo my-api --template api-contract
```

Contenuto:

- struttura feature-first;
- una feature `users` completa ma piccola;
- contract request/response/error;
- service con dipendenze iniettate;
- router statico montato;
- `AppServices` tipizzato;
- config env validata;
- error handler RFC 7807;
- test contract, raw e native smoke;
- OpenAPI montato in development;
- script `dev`, `build`, `typecheck`, `lint`, `test`, `check`, `verify`;
- workflow CI.

### 8.2 Posizionamento template

| Template | Posizionamento 0.7.1 |
|---|---|
| `api-contract` | default raccomandato per production API |
| `minimal` | playground, tutorial, proof of concept |
| `file-routing` | applicazioni che scelgono discovery filesystem |
| `fullstack-ssr` | applicazioni SSR/full-stack |

Non rimuovere o rinominare template esistenti in una patch.

### 8.3 Documenti da creare/aggiornare

Nuovi:

- `docs/architecture.md` — Golden Path completo;
- `docs/feature-modules.md` — guida pratica;
- `docs/contracts-and-errors.md` — response/status policy;
- `docs/architecture-check.md` — regole `kozo check`;
- `docs/migrating-to-feature-modules.md` — adozione incrementale.

Da aggiornare:

- root `README.md`;
- `docs/getting-started.md`;
- `docs/common-pitfalls.md`;
- README di core, CLI e testing;
- help CLI;
- template README;
- changelog 0.7.1.

### 8.4 Esempio canonico

Promuovere `examples/contract-showcase` a consumer del Golden Path:

- spostare contract e service per feature;
- aggiungere `index.ts` pubblici;
- mantenere `createRouter()` + `mount()`;
- aggiungere raw negative test;
- aggiungere native smoke;
- usare lo stesso esempio nella documentazione e nei test CLI.

L'esempio non deve diventare grande: deve essere copiabile e comprensibile in
meno di dieci minuti.

---

## 9. File e package target

### 9.1 `@kozojs/cli`

File probabili:

- `packages/cli/src/commands/generate.ts`;
- nuovo `packages/cli/src/commands/check.ts`;
- nuovi generatori sotto `packages/cli/src/utils/scaffold/generators/`;
- template `api-contract` sotto `packages/cli/templates/`;
- test generator/check;
- `packages/cli/package.json` per lint e dipendenze necessarie.

### 9.2 `@kozojs/core`

Scope additivo:

- design/implementazione opt-in di default response maps per router;
- export dei Problem contract solo se non introduce dipendenza o API ambigua;
- test type-level del merge response;
- test runtime/OpenAPI/native degli status automatici;
- documentazione della static typing boundary.

Nessuna modifica al comportamento di `createRouter()` senza opzioni.

### 9.3 `@kozojs/testing`

- type test per default response union;
- test `KozoUnexpectedResponseError` con status automatici;
- helper/documentazione per la matrice contract/raw/native;
- nessuna rottura dei client esistenti.

### 9.4 Root, docs, examples e templates

- nuovo template production;
- esempio canonico feature-first;
- workflow CI con `pnpm typecheck`, test e lint reali;
- smoke test che crea un progetto dal tarball, installa, verifica e testa;
- documentazione allineata allo stesso vocabolario.

### 9.5 Package non direttamente coinvolti

`auth`, `db`, `queue` e `redis` non richiedono nuove API per questo piano, salvo
fix necessari affinché template ed esempio rispettino il Golden Path.

Non ampliare 0.7.1 con refactor non correlati.

---

## 10. Piano di implementazione

Legenda: `[ ]` non iniziato, `[~]` in corso, `[x]` completato.

### Track A — ADR e standard

- [ ] A1. Aggiungere ADR che sceglie feature-first + static contracts come
  Golden Path production.
- [ ] A2. Definire struttura, naming e dependency rules.
- [ ] A3. Definire policy contract/error/status.
- [ ] A4. Definire complessità progressiva e soglie warning.
- [ ] A5. Definire Definition of Done per feature.

**Done quando:** non esistono decisioni aperte su struttura, naming, routing
default o formato errori.

### Track B — Esempio canonico

- [ ] B1. Rifattorizzare `contract-showcase` in feature modules.
- [ ] B2. Aggiungere contract response ed errori standard.
- [ ] B3. Aggiungere contract/raw/native tests.
- [ ] B4. Verificare OpenAPI e client generato.
- [ ] B5. Usare l'esempio come fixture dei generatori.

**Done quando:** l'esempio dimostra l'intero Golden Path e passa build,
typecheck e test native.

### Track C — Template `api-contract`

- [ ] C1. Creare template sorgente unico.
- [ ] C2. Aggiungere feature dimostrativa.
- [ ] C3. Aggiungere config, services, errors e bootstrap.
- [ ] C4. Aggiungere test e CI.
- [ ] C5. Aggiungere README con percorso “aggiungi una feature”.
- [ ] C6. Verificare npm/pnpm e Windows/POSIX.

**Done quando:** un progetto appena generato passa `install`, `verify`, build e
native smoke senza modifiche manuali.

### Track D — `generate feature`

- [ ] D1. Definire parser opzioni e naming.
- [ ] D2. Generare i cinque file base.
- [ ] D3. Implementare `--crud`.
- [ ] D4. Implementare `--repository`.
- [ ] D5. Implementare `--auth`.
- [ ] D6. Implementare `--dry-run`.
- [ ] D7. Proteggere da overwrite.
- [ ] D8. Aggiungere test snapshot e filesystem.
- [ ] D9. Aggiornare CLI help e README.

**Done quando:** due run con gli stessi argomenti producono output deterministico
e il secondo non sovrascrive senza consenso.

### Track E — `kozo check`

- [ ] E1. Definire codici finding stabili.
- [ ] E2. Implementare scanner TypeScript.
- [ ] E3. Implementare regole dependency boundary.
- [ ] E4. Implementare regole contract.
- [ ] E5. Implementare threshold warning.
- [ ] E6. Implementare output human e JSON.
- [ ] E7. Aggiungere fixture valide/non valide.
- [ ] E8. Integrare nel template e nella CI.

**Done quando:** almeno i cinque anti-pattern critici vengono rilevati con file,
linea e suggerimento corretto.

### Track F — Status e error contracts

- [ ] F1. Scrivere design tecnico `defaultResponses`.
- [ ] F2. Verificare compatibilità semver e type inference.
- [ ] F3. Implementare solo se interamente opt-in e additivo.
- [ ] F4. Allineare OpenAPI, generated client e testing client.
- [ ] F5. Aggiungere test Hono/native per 400/401/403/413/429/500.
- [ ] F6. Documentare il comportamento anche se l'API viene rinviata.

**Done quando:** nessun claim di status completeness supera ciò che runtime,
OpenAPI e client dimostrano realmente.

### Track G — Lint e quality gates

- [ ] G1. Sostituire lint no-op del CLI.
- [ ] G2. Aggiungere lint template/generated fixtures.
- [ ] G3. Aggiungere `pnpm check`/`pnpm verify` root.
- [ ] G4. Inserire architecture check nel publish gate.
- [ ] G5. Aggiungere scan mojibake e placeholder template.

**Done quando:** CI e publish gate rifiutano template non compilabili o non
conformi.

### Track H — Documentazione e migrazione

- [ ] H1. Scrivere architecture guide.
- [ ] H2. Scrivere feature tutorial end-to-end.
- [ ] H3. Scrivere migration guide per app 0.7.0.
- [ ] H4. Aggiornare README e Getting Started.
- [ ] H5. Aggiornare common pitfalls con static typing boundary.
- [ ] H6. Documentare minimal/file-routing come percorsi alternativi.

**Done quando:** docs, CLI help, template ed esempio mostrano lo stesso stile.

### Track I — Consumer pilot e release gate

- [ ] I1. Usare `kozo-api-tracking` come consumer read-only/pilot del check.
- [ ] I2. Verificare finding utili e falsi positivi.
- [ ] I3. Generare tarball di tutti i package interessati.
- [ ] I4. Installare tarball in directory temporanee pulite.
- [ ] I5. Eseguire build, typecheck, test e native smoke.
- [ ] I6. Aggiungere changeset patch per package realmente modificati.
- [ ] I7. Aggiornare CHANGELOG con migration/non-breaking note.
- [ ] I8. Eseguire publish gate senza publish come validazione finale.
- [ ] I9. Pubblicare solo dopo approvazione esplicita separata.

**Done quando:** tutti i gate locali e tarball-first sono verdi e non rimangono
falsi positivi P0 nel consumer pilot.

---

## 11. Ordine vincolante

```text
A  Standard/ADR
   ↓
B  Esempio canonico
   ↓
C  Template production
   ↓
D  Feature generator
   ↓
E  Architecture check
   ↓
F  Status/error alignment opt-in
   ↓
G  Quality gates
   ↓
H  Docs e migration
   ↓
I  Consumer pilot e release gate
```

Non iniziare `kozo check` prima di aver fissato lo standard: lo strumento deve
applicare decisioni già approvate, non inventarle.

Non modificare tutti i template prima che l'esempio canonico sia validato.

---

## 12. Definition of Done di una feature Kozo

Una feature generata o sviluppata manualmente è completa quando:

- [ ] ha un contract Zod senza `any`;
- [ ] dichiara input e response pubbliche;
- [ ] usa router statico se deve alimentare SDK/OpenAPI/contract test;
- [ ] route e service rispettano le dependency boundaries;
- [ ] non accede direttamente a environment o singleton DB dal service;
- [ ] ha almeno un happy path e un negative path;
- [ ] ha raw test per input intenzionalmente invalido;
- [ ] ha native smoke se usa guard/CORS/behavior transport-sensitive;
- [ ] espone solo API pubbliche dal proprio `index.ts`;
- [ ] passa lint, typecheck, test e `kozo check`;
- [ ] aggiorna OpenAPI/docs quando il contratto pubblico cambia.

---

## 13. Gate release 0.7.1

### Compatibilità

- [ ] nessuna API 0.7.0 rimossa o rinominata;
- [ ] nessun template esistente rimosso;
- [ ] nessun cambiamento implicito alle route union esistenti;
- [ ] nuove API core esclusivamente opt-in;
- [ ] migration note per ogni differenza osservabile.

### Verifica monorepo

- [ ] `pnpm build`;
- [ ] `pnpm typecheck`;
- [ ] `pnpm lint` reale;
- [ ] `pnpm test`;
- [ ] type test `@kozojs/testing`;
- [ ] example `contract-showcase`;
- [ ] native tests eseguiti, non saltati silenziosamente;
- [ ] test CLI su Windows path e POSIX path.

### Tarball-first

- [ ] `pnpm pack` per i package modificati;
- [ ] nessun protocollo `workspace:`, `file:`, `link:` o `portal:` nei tarball;
- [ ] `publint` e `attw` verdi dove applicabili;
- [ ] clean install npm e pnpm;
- [ ] progetto `api-contract` generato dal tarball;
- [ ] build/test/native smoke del progetto generato.

### Pubblicazione

- [ ] publish solo tramite il job `publish` di `.github/workflows/ci.yml`;
- [ ] dispatch manuale con `publish=true` solo dopo approvazione;
- [ ] versioni allineate solo per package realmente parte della release policy;
- [ ] nessun push/tag/npm publish implicito durante l'implementazione locale.

---

## 14. Metriche di successo

Misurare prima e dopo su una feature CRUD di riferimento.

| Metrica | Target 0.7.1 |
|---|---|
| Comandi per creare una feature completa | 1 |
| File manuali richiesti dopo generator | 0 per skeleton funzionante |
| Tempo onboarding “prima route testata” | ≤ 15 minuti |
| Route handler generato | ≤ 15 righe |
| Violazioni P0 rilevate da `kozo check` fixture | 100% |
| Falsi positivi P0 sul consumer pilot | 0 |
| Template production che passano `verify` | 100% |
| Contratti statici visibili al typed client | 100% delle route Golden Path |
| Error status documentati ma non riproducibili | 0 |
| Esempi ufficiali con stile architetturale discordante | 0 |

Metriche di adozione successive, non gate release:

- issue di onboarding;
- tempo medio per aggiungere endpoint;
- uso di `generate feature`;
- violazioni architecture check per progetto;
- percentuale progetti con response contract completo.

---

## 15. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Kozo diventa verboso come NestJS | repository/classi opzionali, solo quattro file base |
| Nuovo default confonde utenti file-routing | posizionamento esplicito, nessuna rimozione, migration guide |
| `kozo check` produce falsi positivi | rollout warning-first, codici stabili, pilot su app reale |
| Default response allarga union esistenti | API opt-in e gate semver |
| Template duplicati divergono | sorgente generator unico + snapshot e generated fixture tests |
| CLI aggiunge dipendenza TypeScript pesante | misurare package size e valutare risoluzione TS del consumer |
| Troppe regole bloccano prototipi | `minimal` resta libero; enforcement nel template production |
| Docs dichiarano più del runtime | ogni claim collegato a contract/native test |
| Scope 0.7.1 cresce troppo | core response policy può restare design/opt-in; nessun refactor satellite |

---

## 16. Fuori scope 0.7.1

- Decorator o dependency injection container in stile NestJS.
- Rimozione filesystem routing.
- Rimozione template esistenti.
- Breaking rename di API core/CLI.
- Nuovo ORM obbligatorio.
- Refactor generale di auth/db/queue/redis.
- WebSocket architecture convention completa.
- `@kozojs/eslint-config` come nuovo package pubblico, salvo decisione separata;
  per 0.7.1 è preferito `kozo check` integrato nella CLI.
- Pubblicazione automatica della release.

---

## 17. Prossima azione suggerita

Creare il primo commit tematico **solo dopo approvazione esplicita**:

1. ADR + `docs/architecture.md`;
2. refactor locale di `contract-showcase` come prova del Golden Path;
3. build/typecheck/test/native smoke;
4. review della struttura prima di implementare generatori o check automatici.

Questo ordine consente di validare la convenzione su codice reale prima di
cristallizzarla nella CLI.
