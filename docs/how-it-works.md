# How Courser works

This document explains, in plain language, what happens behind the screen when someone uses Courser. Each section is a short story told step by step, and every step names the file where it happens, so you can open the code next to the text. Paths are shortened. `frontend/…` means `frontend/src/app/…`, `quiz-service/…` means `backend/quiz-service/src/main/java/net/edu/courser/quizservice/…`, and `user-service/…` means `backend/user-service/src/main/java/net/edu/courser/user/…`.

Each section has the same shape:
- **In one sentence**: what the mechanism is for.
- **Step by step**: the journey from click to database and back.
- **Worth knowing**: rules and surprises that aren't obvious from the screen.

---

## 0. The road every request travels

**In one sentence:** the browser only talks to one address, and a chain of "doormen" sends each request to the right place.

1. The browser loads the Angular app from the **frontend container**. Its `frontend/nginx.conf` serves the built files and forwards two kinds of paths:
   - `/api/...` goes to the gateway;
   - `/media/...` goes to the media container, which holds the quiz images.
2. Every API call from the app goes through `frontend/core/services/auth.interceptor.ts`, which attaches the login token (the "wristband") as an `Authorization: Bearer …` header.
3. The **gateway** checks that wristband in `backend/gateway/.../security/JwtAuthenticationFilter.java`, using `JwtService.java`.
   - A few paths are open to everyone: login, register, refresh, logout and the share-code preview.
   - For everything else the token must be valid. The gateway first erases any `X-User-Id` / `X-User-Email` / `X-Username` headers the browser might have sent, then writes the real values read from the token.
4. The gateway removes `/api` and passes the request on: `/users/**` goes to **user-service** and `/quizzes/**` to **quiz-service** (see `backend/gateway/src/main/resources/application.yml`).
5. quiz-service simply believes `X-User-Id` (`@RequestHeader("X-User-Id")` in `QuizController.java`). user-service checks the token a second time with its own `security/JwtAuthenticationFilter.java`.
6. Both services share one PostgreSQL database, whose tables are created by the Liquibase files in `postgre/liquibase/changelog/changes/`.

---

## 1. Creating an account

**In one sentence:** the form checks your details, the server stores you with a scrambled password, and you come back already logged in.

1. `frontend/features/register/register-page.component.ts` checks the form before anything is sent:
   - the email has to look like `name@domain.pl`;
   - the username may only use letters without Polish characters and digits, with no spaces;
   - the password needs 8+ characters, a digit and a special character, and both password fields must match.
2. `AuthService.register()` in `frontend/core/services/auth.service.ts` sends `POST /api/users/register`. The gateway lets it through without a token.
3. `UserController.register()` (`user-service/controller/UserController.java`) builds a `User` and hands it to `UserService.createUser()` (`user-service/service/UserService.java`), which:
   - repeats every form rule (`validateEmail()`, `validateUsername()`, `validatePassword()`), so a request sent around the form gets the same answer. The password may also be at most 72 bytes, because BCrypt ignores anything beyond that;
   - trims the email and stores it in **lower case**;
   - checks whether the email (ignoring case) or the username (also ignoring case) is already taken, with a separate message for each case. The database enforces username uniqueness with `UNIQUE (lower(username))`. Older case-only duplicates were renamed to alphanumeric `u{id}` so settings validation still accepts them;
   - sets the default page colour `coral` and the role `STUDENT`;
   - scrambles the password with BCrypt (`PasswordEncoder` from `config/SecurityConfig.java`);
   - saves the row in `users`.
4. The controller then hands out two "keys":
   - a **short-lived token** (the JWT) from `security/JwtService.java`, valid for 30 minutes and holding the user id, email and username;
   - a **long-lived refresh key** from `RefreshSessionService.create()`. It's 32 random bytes; the database (`refresh_sessions`) only keeps its SHA-256 fingerprint, and the browser gets the raw value as an HttpOnly cookie `courser_refresh` that JavaScript can't read. It's valid for 48 hours.
5. Back in the browser, `AuthService.setCurrentUser()` remembers the user in a signal and in `localStorage["user"]`.
6. `QuizApiService.migrateGuestQuizzes()` then uploads any quizzes made as a guest (see section 11), and the app navigates to `/`.
---

## 2. Logging in

**In one sentence:** same as registration, except the server compares your password with the stored scrambled one.

1. `frontend/features/login/login-page.component.ts` trims the email and calls `AuthService.login()`, which sends `POST /api/users/login`.
2. `UserService.login()` finds the user by email, **ignoring case**, and checks the password with `passwordEncoder.matches()`. If accounts from before lower-casing differ only in case, the password decides which one it is. A wrong email and a wrong password get the **same** message, so nobody can probe which emails exist.
3. `UserController.login()` returns the same response as registration (a new JWT and a new refresh cookie).
4. The login page stores the user, uploads any guest quizzes (`QuizApiService.migrateGuestQuizzes()`), and navigates to `/`.

---

## 3. Staying logged in (refresh and logout)

**In one sentence:** the 30-minute wristband is swapped for a new one quietly in the background, for as long as you use the app at least every 48 hours.

1. **On every page load**, the `AuthService` constructor calls `refreshAccessToken()`, which sends `POST /api/users/refresh` with the cookie. It deliberately skips the interceptor (`new HttpClient(HttpBackend)`) so that the two can't end up waiting for each other.
2. `RefreshSessionService.rotate()` (`user-service/service/RefreshSessionService.java`):
   - finds the session by the cookie's fingerprint;
   - checks that it hasn't expired;
   - **creates a brand-new key in the same session family** (`family_id`) and lets the old key run out **30 seconds** later (`app.refresh-session.rotation-grace-seconds`). Several tabs opened at once all send the same old key; thanks to that short grace period each of them still gets a session, instead of all but one being logged out;
   - tidies up any other expired sessions.

   A rejected refresh doesn't clear the cookie, because a late request from one tab would otherwise erase the key another tab has just received.
3. **When any call returns 401** (the wristband expired), `auth.interceptor.ts` asks for a refresh once. If several calls fail at the same moment, they share one refresh request (`refreshInFlight$`), and each original call is then retried with the new token.
   - Only when the server **rejects the session** (401/403 from `/refresh`) is the user logged out and sent to `/login`.
   - A network error or a server error (5xx) just fails the original call. The user stays logged in and the saved quiz runs survive.
4. **Logout** (from `frontend/layout/navbar/navbar.component.ts`) sends `POST /api/users/logout`. `RefreshSessionService.revoke()` deletes **every key in that session family** (current cookie plus any grace siblings from rotation) and the cookie is cleared. `AuthService.clearAuthState()` also wipes the saved quiz-in-progress snapshots in `sessionStorage` (see section 8).

---

## 4. Creating or editing a quiz

**In one sentence:** the editor keeps a draft in the browser, then sends the whole quiz in one go, and the server rebuilds it question by question.

1. The editor is `frontend/features/quiz-create/quiz-create-page.component.ts`. It serves two routes: `/quizzes/new` and `/quizzes/:id/edit`. The title, scoring, limits and questions are each kept in signals while you type. Guests can fill in the form but are asked to log in when they press save.
2. **Adding an image:** `readImageFile()` in `frontend/core/utils/image.util.ts`:
   - checks that the file is JPEG, PNG, GIF, WebP or BMP, using its first bytes rather than trusting the file name;
   - checks that it is 16 MB or less;
   - turns it into a long text string, a "data URL" (`data:image/png;base64,…`), which goes into the draft.
3. **Saving:** `buildCreateDto()` packs the draft into a `QuizCreateDTO`, and `QuizApiService` (`frontend/core/services/quiz-api.service.ts`) sends:
   - `POST /api/quizzes` for a new quiz;
   - `PUT /api/quizzes/{id}` for an edited one;
   - `POST /api/quizzes/{id}/fork` for "save as a copy" (no body; the server copies the quiz itself with `copyQuiz()`, keeping image keys).

   **Size limits.** One request may be at most 30 MB (`client_max_body_size` in `frontend/nginx.conf`), and only newly added images travel as data. `sendIfQuizFits()` (`frontend/core/utils/quiz-request.util.ts`) measures the request first and shows a clear message instead of a generic error. The title can have at most 255 characters, the column size, and that limit is checked in the editor, the import and `MapperDTO.validTitle()`. A "(kopia)" title is shortened to fit (`copyTitle()`). `QuizServiceApplication` raises Jackson's text limit so a 16 MB image (about 22 million characters as a data URL) can be read.
4. On the server, `QuizController` calls `MapperDTO.toQuizEntity()` (`quiz-service/dto/MapperDTO.java`):
   - `normalizeScoring()` fills in defaults and refuses odd numbers (more than 2 decimals, or outside 0–99.99);
   - `applyLimits()` stores "random question order" and "show correct answers";
   - then a **loop over the questions, carrying each question's position (`index`)**, calls `toQuestionEntity()`, which copies the answers and calls `applyImage(question, image, index)` (see section 5).
5. `QuizService.save()` (`quiz-service/service/QuizService.java`) stores the quiz and immediately gives it its own **ranking version** (see section 7).
6. **Editing** loads the quiz with `GET /api/quizzes/{id}`. Existing images come back as short addresses like `/media/3fa…c1.png`, not as data. `QuizService.update()` **throws away all old questions and rebuilds them** from the incoming DTO (`orphanRemoval` on `Quiz.questions`), so question ids change after every edit. If the content changed, the quiz gets a new ranking version.
7. **Renaming** from the sidebar is a lighter call: `PATCH /api/quizzes/{id}` goes to `QuizService.updateTitle()` and only touches the title.

---

## 5. How images are stored (the "image key")

**In one sentence:** every image is saved once under a name made from its own contents, and questions just point at that name.

1. For each question, `MapperDTO.applyImage()` looks at what came in:
   - **nothing**: the question has no image;
   - **an address of an image we already have** (`MediaStorageService.isMediaReference()`): the question just reuses its key, with no copying;
   - **an address we don't know** (`/media/…`, `http…`): the request is refused;
   - **data** (a data URL or raw base64): it's decoded into bytes and passed to `MediaStorageService.store(bytes, typeHint, "image" + (index + 1))`.
2. `MediaStorageService.store()` (`quiz-service/service/MediaStorageService.java`):
   - recognises the image type from its first bytes;
   - computes a SHA-256 fingerprint of the bytes;
   - names the file `<fingerprint>.<extension>`, which is the **image key**, e.g. `3fa…c1.png`;
   - writes it to the shared volume (`/var/courser-media`) **only if that file doesn't exist yet**.

   The same picture used in ten quizzes is stored once.
3. The question row keeps `image_key`, the file name on disk.
4. When a quiz is sent to the browser, `MediaStorageService.publicUrl(key)` turns the key into `/media/<key>`. The browser loads that through `frontend/nginx.conf`, which proxies to `media/nginx.conf`. Because a file's name *is* its contents, the media server tells browsers to cache it for a year.

**Worth knowing:** files are kept for 30 days after the last quiz or ranking snapshot stops using them, and then deleted (section 13).

---

## 6. Moving a quiz in and out with ZIP / JSON files

**In one sentence:** a ZIP is a `quiz.json` plus an `images/` folder, and importing it turns the files back into the same data the editor would send.

### Exporting
1. A logged-in user clicks export in `frontend/layout/sidebar/sidebar.component.ts`, which sends `GET /api/quizzes/{id}/export`.
2. `QuizService.exportQuizArchive()` makes sure the quiz has an up-to-date ranking version. `QuizExportService.exportAsZip()` (`quiz-service/service/QuizExportService.java`) then:
   - writes `quiz.json` with the title, scoring, limits and questions;
   - names each question's image by its position (`image3.png` for question 3), so the names stay unique even when two questions share one stored image;
   - adds a `_ranking` block holding only the `versionId` (the ranking "passport"); the server recomputes the content hash on import;
   - loops over the questions and copies each image from disk into `images/<file name>`.
3. A guest exports with `buildQuizZip()` in `frontend/core/utils/quiz-zip.util.ts`, which builds the same ZIP in the browser. It writes `_ranking.versionId` only if the guest got the quiz from a share code. ZIP images are checked with the same type and 16 MB rules as the editor (`image.util.ts`).

Every parameter survives the round trip:
- **Quiz:** `title`.
- **Scoring:** `mode`, `allowNegativeScore`, `pointsPerCorrect`, `incorrectPenalty`, `penaltyMode`.
- **Limits:** `randomQuestionOrder`, `showCorrectAnswers`.
- **Each question:** `content` and `image`.
- **Each answer:** `content`, `correct` and an optional `points`.

`QuizExportServiceTest` checks the server side of this list.

### Importing
1. `frontend/features/quiz-import/quiz-import-page.component.ts` accepts a `.zip` or `.json` file, either dropped on the page or picked from disk.
   - The "download template" button builds an example ZIP, whose `_instrukcja` field explains every setting.
2. For a ZIP, `parseQuizZip()` (`quiz-zip.util.ts`):
   - opens the archive and reads `quiz.json` (or `quiz-template.json`);
   - checks it with `normalizeQuiz()`, which gives readable Polish errors such as "Pytanie 3 musi mieć niepuste pole content". Points and scoring values get the same limits as in the editor and on the server: 0–99.99 (−99.99–0 for wrong answers), with at most two decimals;
   - picks up `_ranking.versionId` if it's there;
   - then **loops over the questions**: for each one with an `image` file name it finds that file in `images/`, recognises its type from the first bytes, and **replaces the file name with a data URL**.

   The quiz now looks exactly like something the editor would send. A plain `.json` file goes through `normalizeQuiz()` only and has no version id. It may not reference images, because there is no `images/` folder to read them from; the page rejects such a file and points to the ZIP format.
3. `QuizApiService.importArchiveQuiz()` sends `POST /api/quizzes/import-archive` with `{ quiz, rankingVersionId }`. For a guest, the quiz is stored in `localStorage` instead (see section 11).
4. `QuizService.importArchive()` decides whether this is "the same quiz" or "a private copy". Section 7 has the full rules. Images are then stored by the loop from section 5.

---

## 7. Ranking versions: when does the hash change?

**In one sentence:** a ranking version is a frozen snapshot of the quiz's questions and scoring, and everyone attached to the same version competes on the same leaderboard.

### What it is
- The table `quiz_ranking_versions` stores:
  - `snapshot_json`: the whole quiz as JSON;
  - `content_hash`: a SHA-256 fingerprint;
  - `has_logged_import`: whether **another user** has joined. Re-importing your own share code or ZIP doesn't count (`QuizService.markImportIfShared()`).
- Each quiz points at one version (`quizzes.ranking_version_id`). Many quizzes owned by different users can point at the **same** version, and that's what makes a shared leaderboard.
- The fingerprint is built in `QuizService.rankingContentHash()` from **the questions** (text, answers, which ones are correct, points, image reference) and **the normalised scoring**.
  - It does **not** include the title or the two display settings (random order, show correct answers). Changing those never touches the ranking.
- `QuizService.ensureRankingVersion()` reuses the quiz's current version if the fingerprint still matches, and otherwise creates a new one.
- **The version id, not the hash, is the identity.** Two versions can have the same hash; for example, a copy has the same content but its own leaderboard.

### Situations

| Situation | Where in code | Hash / version | Effect on the leaderboard |
|---|---|---|---|
| New quiz saved | `QuizService.save()` | new version | starts empty |
| Rename from the sidebar | `updateTitle()` | unchanged | kept |
| Edit: title, random order or "show correct answers" only | `update()` | unchanged | kept |
| Edit: questions, answers, points, scoring or image, **nobody has joined yet** | `update()` | **new version** | old leaderboard left behind; the quiz starts a fresh, empty one |
| Same kind of edit, **someone has joined** (`has_logged_import = true`) | editor: `requestRankingCopyForAction()`; server: `update()` throws `RANKING_COPY_REQUIRED` | original unchanged | editor warns first; confirming saves the edit as a **"(kopia)" fork** with its own new version, and the shared leaderboard stays intact |
| "Copy" in the sidebar / "save as copy" | `fork()` | new version, same hash | separate, empty leaderboard |
| Create a share code | `createShareCode()` | reused if the hash matches | kept |
| Someone else redeems the share code (logged in) | `importByShareCode()` | **same version**; `has_logged_import` becomes `true` | shared; the owner's content edits now require a copy |
| The owner redeems their own share code | `importByShareCode()` | **same version**; `has_logged_import` stays `false` | the owner gets a second copy and can still edit freely |
| Export to ZIP | `exportQuizArchive()` | reused if the hash matches; `versionId` written into `_ranking` | kept |
| Import a ZIP with `_ranking.versionId` and **unchanged** content | `importArchive()` | **same version**; the title and limits come from the snapshot, not the ZIP | shared |
| Import a ZIP whose content was edited, or whose version id is unknown | `importArchive()` | new version; title gets "(kopia)" | private, empty |
| Import a plain JSON file | `importArchive()` | new version | private, empty |
| A guest logs in and their local quizzes are uploaded | `importArchive(..., migratingGuestQuiz = true)` | joins the matching version; if the user already owns a quiz on that version (or an identical one), **the oldest such quiz is returned and no duplicate is made** | shared or kept |

**Worth knowing: the fingerprint is always taken from what was stored, never from what arrived.** The same picture can reach the server in two forms:
- as a `/media/<key>` address, for an image that is already stored;
- as a long `data:…` string, for a freshly added image or one from a ZIP.

That's why `update()` and `importArchive()` first rebuild the quiz, which turns every image into its key through `MapperDTO.applyImage()`, and only then call `rankingContentHash(quiz, questions)`. Snapshots are written from the stored quiz too, so they hold `/media/<key>` addresses rather than image data. `QuizServiceRankingHashTest` checks both cases: a ZIP with images rejoins its version, and saving again after adding an image keeps the shared ranking.

---

## 8. Playing a quiz and the ranking attempt

**In one sentence:** the browser runs the quiz, while the server separately times the run and recalculates the score itself, so the leaderboard can't be faked from the browser.

### Starting
1. In the sidebar, `requestStartQuiz()` uses the quiz row already in the list (`QuizRawDTO` from `GET /api/quizzes`, which includes `limits` and the caller's `rankingPosition`) and fetches how many times you've finished it (`GET /api/users/me/quiz-attempts/count`). It then shows a dialog where you choose random order and study mode.
2. `startQuiz()` opens `/quizzes/{id}/play?randomQuestionOrder=…&studyMode=…&playSession=<new uuid>`. The `playSession` id is the run's name tag.
3. `frontend/features/quiz-play/quiz-play-page.component.ts` downloads the full quiz (`GET /api/quizzes/{id}`) and prepares the questions in `prepareQuestions()`:
   - every question's answers are **shuffled**, and the questions themselves are shuffled too if random order is on;
   - each question remembers its **original position** (`rankingQuestionIndex`) and each answer its original index (`rankingAnswerIndexes`), so the server can understand the answers despite the shuffle.

**Worth knowing (a deliberate choice):** `GET /api/quizzes/{id}` sends the correct answers and points along with the questions, and the page grades each question in the browser. Anyone could read them in the network tab. That's accepted because Courser is a learning platform: the player always owns their copy of the quiz and can open it in the editor or export it as a ZIP anyway. What the server does protect is the **leaderboard score**. It never trusts a score from the browser and recalculates it from the picked answers (step 8).

### During the run
4. If ranking is on (`quiz.rankingEnabled`), you're logged in and it isn't study mode, `startRanking()` sends `POST /api/quizzes/{id}/ranking-attempts` with the `playSession` id.
   - `QuizService.startRankingAttempt()` creates a row in `quiz_ranking_attempts` with a start time, or **finds the existing one** for the same `playSession`. Refreshing the page therefore continues the same run, and the clock doesn't restart. A `playSession` that has already finished is refused with a 400.
   - If the tab has no saved snapshot for the `playSession` in the address (a new tab, a copied link), the page gives the run a **new** `playSession`, because the old one may already be finished on the server.
   - If the quiz is finished before the server has answered (a one-question quiz on a slow connection), the page sends the finish request as soon as the attempt id arrives.
   - If starting or finishing fails, the result box says the result won't be added to the ranking.
   - The server replies with how much time has already passed, and the page shows a timer.
   - Runs are capped at 6 hours; the page finishes the run automatically when the time is up.
5. After every click, an `effect` saves a snapshot of the run in `sessionStorage` under `courser.quiz-play.v1.<userId>.<quizId>.<playSession>`. Reloading the page restores it exactly (`restorePlaySession()`).
6. **Study mode** (`scheduleCurrentQuestion()`) lets you send a question back into the queue — soon, in the middle, near the end or at the end — as a re-shuffled copy. Study runs never count for the ranking.

### Finishing
7. When the last question is checked, `finishRanking()` sends `POST /api/quizzes/{id}/ranking-attempts/{attemptId}/finish`. The body contains only *which answers were picked*, by original indexes, and **no score**.
8. `QuizService.finishRankingAttempt()`:
   - reads the **snapshot of the version the attempt was started on**, not the live quiz, so a run still counts if the owner edits the quiz meanwhile;
   - recalculates the score with `questionScore()` and `maxQuestionScore()`, which implement the same fraction / points / percent / custom rules as `frontend/core/utils/quiz-scoring.util.ts`:
     - in points and percent mode a question is worth `pointsPerCorrect` × the number of correct answers;
     - "no negative score" also applies in custom mode;
     - answers are picked by position, and a repeated index counts once;
   - measures the time itself from the stored start.
9. Leaderboard rules (`compareEntries()`): a better score *percentage* ranks higher; on a tie the faster run wins, then the earlier one.
   - Each user has **one** entry per version, and a worse run never overwrites a better one.
   - Only the **top 5** are kept (`quiz_ranking_entries`); the rest are deleted.
10. The answer is saved on the attempt, so asking again returns the same result. The play page shows it ("Nie znalazłeś się w Top 5", medals). The details page (`frontend/features/quiz-details/quiz-details-page.component.ts`) shows the leaderboard later with `GET /api/quizzes/{id}/ranking`. The sidebar shows a medal from the `rankingPosition` field already returned by the quiz list.

---

## 9. Statistics on the home page

**In one sentence:** every finished run adds to a per-day total on the server, and the home page downloads those totals and groups them into chart bars in the browser.

### Writing (when a run ends)
1. The third `effect` in `quiz-play-page.component.ts` fires once the result is ready and the user is logged in. It calls `QuizScoreService.completeQuiz()` (`frontend/core/services/quiz-score.service.ts`), which sends `POST /api/users/me/statistics/completions` with:
   - `requestId`: a random id, so a retry isn't counted twice;
   - `quizId`;
   - `checkedQuestions`;
   - `studyMode`;
   - `score` / `maxScore`, as hundredths;
   - `effectivenessHundredths`: the percentage × 100;
   - `timeZone`: e.g. `Europe/Warsaw`.
2. `UserStatisticsService.complete()` (`user-service/service/UserStatisticsService.java`) uses plain SQL through `JdbcTemplate`:
   - checks the numbers and confirms that the quiz belongs to this user;
   - stores `requestId` in `user_statistics_retry_keys`, which keeps a 7-day memory. **If it was already there, it stops**, so the same run is never counted twice;
   - works out "today" **in the user's time zone**, so a run at 00:30 in Warsaw counts for the right day;
   - adds to `user_daily_statistics` for (user, day): +1 quiz, +N questions, and +effectiveness to the sum with +1 to the count (study runs add 0 / 0);
   - adds 1 to `user_quiz_summary.completed_count` for (user, quiz). That number is what the start dialog shows as "how many times you've finished this".
3. When the call succeeds, `QuizScoreService` bumps its `scoresVersion` counter. That is the "something changed" signal the home page and sidebar listen for.

### Reading (the home page)
4. `frontend/features/home/home-page.component.ts` has an `effect` that reruns when the logged-in user changes or `scoresVersion` ticks. It calls `getDailyStatistics()`, which sends `GET /api/users/me/statistics/daily` and receives **one row per active day**, in date order.
5. All the chart logic happens in the browser:
   - `buildBuckets()` creates empty bars for the chosen period ("today", 7 days, 30 days, 12 months or all time). Long periods are grouped by month or year.
   - Each daily row is dropped into its bar.
   - The "effectiveness" metric is the **average**: `sum / count / 100`, as a percentage.
   - `createChartScale()` and `niceStep()` choose readable axis numbers.

   Switching the period or metric **does not** call the server again.

---

## 10. Changing the page colour

**In one sentence:** the colour is saved on your account, and the whole page re-tints because one attribute on `<html>` changes.

1. In `frontend/layout/navbar/navbar.component.ts`, the settings dialog lets you change your username and pick one of six colours from `ACCENT_OPTIONS` in `frontend/core/models/theme.model.ts`: coral, blue, green, violet, turquoise or pink.
2. `AuthService.updateSettings()` sends `PUT /api/users/me/settings` with `{ username, accentColor }`.
3. `UserService.updateSettings()` checks the username rules and that it isn't taken (ignoring case), and that the colour is one of the six allowed (`ACCENT_COLORS`). It then saves both on the `users` row.
4. The server replies with a fresh login response, **including a new token**, because the username lives inside the token. `setCurrentUser()` stores it.
5. `frontend/core/services/theme.service.ts` (started by `app.component.ts`) has an `effect` that watches the user. It sets `document.documentElement.dataset.accent`, i.e. `<html data-accent="blue">`.
6. `frontend/src/styles.css` has one block per colour (`:root[data-accent='blue'] { … }`) that redefines the colour variables, so every component re-colours at once.

**Worth knowing:** guests always get coral. On a page reload the colour comes straight from `localStorage`, so the page doesn't flash.

---

## 11. Guest mode (using the app without an account)

**In one sentence:** guests keep their quizzes in the browser with negative ids, and those quizzes are uploaded automatically the first time they log in.

1. `frontend/core/services/guest-quiz-storage.service.ts` keeps guest quizzes in `localStorage["guestQuizzes"]`. New ones get ids −2, −3, … so they can never clash with the server's positive ids.
   - Browsers give `localStorage` only a few MB, and images are stored inline. When a quiz doesn't fit, `saveQuizzes()` throws a readable `QuizUserError`, and the import page or sidebar shows it, suggesting a login.
2. `QuizApiService` checks first: if the id is negative or nobody is logged in, it answers from local storage instead of calling the server. This covers listing, opening, deleting and importing.
3. A guest can redeem a share code too. `POST /api/quizzes/share-code-preview` (public at the gateway) returns the snapshot and its `rankingVersionId`, which are kept locally.
4. Guests can't play ranked runs, create share codes, or save stats.
5. On login or registration, `QuizApiService.migrateGuestQuizzes()` uploads each local quiz one by one to `/import-archive` with `migratingGuestQuiz: true`. Each success is removed from local storage; failures stay for the next login. Section 7 explains how duplicates are avoided.

---

## 12. Sharing a quiz with a code

**In one sentence:** a share code is a short, random ticket that points at a frozen copy of the quiz, not at the live quiz.

### Creating a code
1. In the sidebar, "share" opens a dialog with an expiry choice: 1 hour, 24 hours, 7 days (the default), 30 days, or forever. `confirmShareQuiz()` sends `POST /api/quizzes/{id}/share-codes`.
2. `QuizService.createShareCode()`:
   - makes sure the quiz has an up-to-date ranking version;
   - generates a 10-character code (`generateUniqueShareCode()`) from an alphabet without look-alike characters (no `0/O`, `1/I`), and retries if the code is already taken;
   - stores it in `quiz_share_codes`, pointing at the **ranking version**.
3. The code is shown and can be copied to the clipboard (`copyShareCode()`).

### Redeeming a code
4. The receiver types it on the import page, `quiz-import-page.component.ts`. Spaces, dashes and lowercase letters are tolerated (`normalizeShareCode()` exists in both the frontend and the backend). The app sends `POST /api/quizzes/import-code`.
5. `QuizService.importByShareCode()`:
   - finds the code and checks that it hasn't expired;
   - reads the **snapshot** of the version;
   - builds a new quiz for the receiver from it (images are reused by key, so no copying);
   - **attaches it to the same ranking version**, and marks the version as `has_logged_import` when the receiver isn't the only owner of that version.

**Worth knowing:**
- Because the code points at a snapshot, the receiver gets the quiz **as it was when the code was made**, even if the owner edited it afterwards.
- Once someone has redeemed it, the owner's content edits go into a copy (section 7), so the two people always compete on the same questions.

---

## 13. Nightly housekeeping

**In one sentence:** once a night the server throws away expired share codes, leaderboards nobody can reach any more, and images nobody has used for a month.

1. `quiz-service/service/RankingDataCleanupService.java` runs at 03:30 every night (`@Scheduled`, configurable with `app.ranking-cleanup.cron`). It deletes:
   - share codes that expired more than 30 days ago (`QuizShareCodeRepository.deleteExpiredBefore()`);
   - ranking versions older than 90 days that no quiz and no live share code point at (`QuizRankingVersionRepository.deleteOrphanedBefore()`). Their attempts and leaderboard entries go with them.
2. `quiz-service/service/MediaCleanupService.java` runs afterwards, at 03:45 (configurable with `app.media-cleanup.cron`):
   1. It collects every image key still in use: those of all questions (`QuestionRepository.findAllImageKeys()`) plus every key found inside a ranking snapshot (`QuizRankingVersionRepository.findAllSnapshotJson()`). Snapshots count because redeeming a share code or uploading a guest's quizzes rebuilds questions from them by key.
   2. `MediaStorageService.deleteUnused()` goes through the media folder. It uses a file's modification time as "last seen in use":
      - for every used file, it resets that time to now;
      - an unused file whose time is older than 30 days (`app.media-cleanup.unused-retention-days`) is deleted.

      Uploading an image that already exists also resets its time (`store()`), so an image that comes back into use is never deleted by mistake.
3. Expired refresh sessions are removed during every refresh (section 3), and statistics retry keys older than 7 days during every completion (section 9).
