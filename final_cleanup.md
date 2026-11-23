# final_cleanup

Courser was built by people and AI agents taking turns, so it picked up dead endpoints, leftover tables and columns, and values filled in with defaults "just in case". This file was the shared cleanup checklist. Items marked **(DONE)** are applied in the working tree (code, Liquibase `018-final-cleanup.sql`, frontend, docs). Items marked **(decided - no delete)** were reviewed and kept on purpose (audit columns such as `created_at`).

The rule stayed: the frontend experience for the user stays the same, the backend shrinks to what the frontend actually calls, and the frontend stops sending duplicate requests. Applied Liquibase changesets are never edited; new schema work goes into new changelogs.

## database

- redundant table: `quiz_results`. This is the old result model. Nothing writes to it or reads from it; it is only reachable through `QuizResultService`, which nothing injects. Seed `002` also inserts a row into it. (DONE)
- redundant table: `quiz_completed_attempts`. Also legacy, replaced by `user_quiz_summary.completed_count`. (DONE)
- unused column: `users.total_score`. Only the unused endpoints `POST /users/{id}/score` and `GET /users/leaderboard` touch it. (DONE)
- unused column: `users.quizzes_completed`. Same as `total_score`. (DONE)
- unused column: `users.role` and the `users_role_check` constraint. The value is always `STUDENT`, it is never checked, and it isn't put into the JWT. The `UserRole` enum goes with it. (DONE)
- write-only column: `users.last_login`. It is updated on every login, which costs an extra `findById` and `save`, and is only read by the `UserProfileResponse` of unused endpoints. (DONE)
- write-only column: `users.created_at` **(decide)**. The only reader is `UserProfileResponse`. Keep it only if we want it as an audit column. -- **(decided - no delete)** (DONE)
- write-only column: `questions.image_filename`. Since the ZIP export now names images by question position (`image1.png`, …), nothing reads it. Only `MapperDTO.applyImage()` and the dead `copyQuiz` set it. (DONE)
- unused column: `questions.question_order`. It isn't mapped in the entity, and questions are ordered by `id`. (DONE)
- unused column: `answers.answer_order`. Same as `question_order`. (DONE)
- redundant column: `quiz_share_codes.active`. It is always `true` (set in `@PrePersist`), and no code path can set it to `false`, so the `active = true` filters do nothing. (DONE)
- legacy column: `quiz_share_codes.quiz_id` and its foreign key. It exists only for a fallback that handles share codes created before ranking versions existed. Plan: delete the rows where `ranking_version_id IS NULL`, then make `ranking_version_id` `NOT NULL`. (DONE)
- write-only column: `quiz_share_codes.created_by_user_id` **(decide)**. Once the fallback above is gone, nothing reads it. -- **(decided - no delete)** (DONE)
- write-only column: `quiz_share_codes.created_at` **(decide)**. Never read; the cleanup job uses `expires_at`. -- **(decided - no delete)** (DONE)
- write-only column: `refresh_sessions.last_used_at` **(re-check)**. Since the refresh-race fix, `rotate()` stamps it when a key is used, but nothing reads it yet. -- **(decided - no delete)** (DONE)
- write-only column: `refresh_sessions.created_at` **(decide)**. Never read. -- **(decided - no delete)** (DONE)
- redundant column: `quiz_ranking_attempts.outside_top_five`. It is always the same as `position IS NULL`. The DTO can compute it, and the frontend still gets the field. (DONE)
- redundant column: `quiz_ranking_attempts.status` **(decide)**. The string values `STARTED` / `FINISHED` repeat `completed_at IS NULL` / `IS NOT NULL`, and there is no CHECK constraint on them.  -- **(decided - delete)** (DONE)
- unused columns: `user_quiz_summary.best_score` and `best_max_score`. A large `CASE` upsert keeps them up to date, but only `/users/{id}/quiz-results/best` and `/users/me/quiz-results/best` read them, and the frontend never calls either endpoint. (DONE)
- weak constraint: `quizzes.owner_user_id` is nullable even though every quiz has an owner. Make it `NOT NULL`, and `quizzes.title` too **(decide)**.  -- **(decided - do it)** (DONE)
- legacy file: `postgre/dump.sql` is a dump from before Liquibase with the old schema (for example `image_data`). Importing it would break the app, yet `postgre/commands.txt` still documents it. (DONE)
- quirk, leave as is: `010-delete-quiz-results-with-quiz.sql` has no `--liquibase formatted sql` header, and changeset ids don't follow the file order. These are already applied, so they stay untouched; the new changelog drops `quiz_results` anyway. (DONE)

## backend: gateway

- dead config: `globalcors` and the `DedupeResponseHeader` filter. The browser only calls `/api` on its own origin through nginx, and there is no dev proxy that would need cross-origin calls. The same applies to `.cors(...)` in the user-service `SecurityConfig`. (DONE)
- dead public path: `/api/users/leaderboard` is whitelisted for an endpoint the frontend never uses. Remove it together with the endpoint. (DONE)
- duplication: `JwtService` and `JwtClaims` are copied into both the gateway and user-service. See the JWT item under user-service. (DONE)
- migration leftover: `spring-boot-jackson2` is a bridge added during the Boot 4 move. Switch `JwtService` to Jackson 3 (`tools.jackson`) and drop the bridge in all three services **(decide)**. -- **(decided - do it)** (DONE)

## backend: user-service

- dead service: `QuizResultService`, which nothing injects. With it go the entities `QuizResult` and `CompletedQuizAttempt`, the repositories `QuizResultRepository` and `CompletedQuizAttemptRepository`, and the DTOs `SaveQuizResultRequest` and `CompleteQuizAttemptRequest`. (DONE)
- dead endpoints (the frontend never calls them): (DONE)
  - `GET /users`
  - `GET /users/me`
  - `GET /users/{id}`
  - `GET /users/username/{username}`
  - `PUT /users/{id}`, which accepts the raw `User` entity as the body, so any field can be overwritten
  - `POST /users/{id}/score`
  - `GET /users/leaderboard`
  - `GET /users/{id}/quiz-results/best`
  - `GET /users/me/quiz-results/best`
- dead code after removing those endpoints: (DONE)
  - `UserService.getAllUsers`, `getUserById`, `getUserByUsername`, `updateUser`, `updateUserScore`, `getLeaderboard`
  - `ensureCanAccessUser`
  - `UserRepository.findTopByTotalScore` and `findByUsername`
  - `UserProfileResponse` and `BestQuizScoreResponse`
  - `UserStatisticsService.bestScores` and the best-score part of the upsert
- unused field: `LoginResponse.message`. The frontend never reads it. (DONE)
- duplicated code: the same `LoginResponse` builder is written out four times (login, register, refresh, settings). (DONE)
- double JWT validation **(decide)**: the gateway already validates the token and sets `X-User-Id`, and quiz-service simply trusts that header. user-service validates the token a second time with its own filter and a Spring Security chain. Proposal: read `X-User-Id` like quiz-service does, drop `JwtAuthenticationFilter`, the validation half of `JwtService` and `JwtClaims`, and keep only `spring-security-crypto` for BCrypt. **(decided - disable)** (DONE)
- H2 leftovers: the `/h2-console/**` `permitAll`, `frameOptions(sameOrigin)` and the `h2` dependency in the pom. (DONE)
- duplicated setting: `REFRESH_SESSION_DURATION = 48h` is hard-coded in `UserController`, while `RefreshSessionService` reads `app.refresh-session.inactivity-hours`. If someone changes the property, the cookie lifetime and the session lifetime drift apart. (DONE)
- default noise: `@Value` defaults the JWT expiration to `86400`, but the properties set `1800`. The JWT secret default also appears in both the code and `docker-compose.yml`. (DONE)
- error handling: every controller method catches `RuntimeException` itself and returns `{"error": msg}`. One `@RestControllerAdvice` should replace all of those catch blocks. (DONE)

## backend: quiz-service

- dead endpoint: `GET /quizzes/{id}/raw`. The frontend's `getRawQuiz` is never called. (DONE)
- dead methods: `QuizService.findWholeQuestionsByQuizId`, `findQuizByShareCode` (an old duplicate of `findRankingVersionByShareCode`), `getCreateDtoByShareCode`, `Quiz.removeQuestion` and `Question.removeAnswer`. (DONE)
- dead method: `QuizService.copyQuiz` **(decide)**. It could be reused for a server-side fork; see the fork item below. **(decided - no delete, see below to keep image key)** (DONE)
- legacy branch: the fallback inside `findRankingVersionByShareCode` for share codes without a ranking version. (DONE)
- unused field: `QuizRawDTO.rankingProtected`. The quiz list never reads it; the editor gets the flag from `QuizPlayDTO`. (DONE)
- redundant endpoint: `GET /quizzes/{id}/ranking-position` runs the same query as `GET /quizzes/{id}/ranking` and returns a subset of it. Proposal: put the position (and the quiz limits) into the `GET /quizzes` list response and delete the endpoint. This also fixes the N+1 requests described under frontend. (DONE)
- odd fork contract **(decide)**: `POST /quizzes/{id}/fork` receives the whole quiz from the client, checks ownership, and then just creates a new quiz titled "(kopia)". Today the sidebar downloads the full quiz and posts it straight back. Two options: (DONE)
  - make fork body-less and let the server copy the quiz with `copyQuiz`, keeping `imageKey` so no images are re-sent; -- **(decided - do this)**
  - have the editor's "save as copy" call `createQuiz` instead.
- double lookups: `exportQuiz` in the controller loads the quiz, and then `exportQuizArchive` loads it again. `finishRankingAttempt` reads the entries list three or four times. (DONE)
- unmapped exceptions: `IllegalStateException` (thrown for `RANKING_COPY_REQUIRED` and invalid attempts) comes back as a 500. Meanwhile the handler for `MethodArgumentNotValidException` can never fire, because nothing uses `@Valid`. Error bodies are plain strings here but `{"error"}` in user-service. (DONE)
- scoring normalisation is done three times: in `MapperDTO.normalizeScoring`, `QuizExportService.scoringNode` and `toScoringDto`. The export also builds its JSON by hand instead of reusing the DTOs. (DONE)
- style leftovers: (DONE)
  - a hand-written 11-argument constructor in `QuizService`, while the other services use Lombok
  - the commented-out `//private Set<Question>` in `Quiz`
  - "w przyszlosci..." comments in the controller
  - inline fully qualified class names
- Initializr leftovers: `HELP.md`, `mvnw` and `mvnw.cmd`. The wrapper is broken anyway because there is no `.mvn/wrapper` directory. (DONE)
- default datasource: the URL, username and password are hard-coded in `application.properties`. user-service reads them from environment variables with defaults, which is the pattern to copy. (DONE)

## backend: build and config

- unused dependency: `spring-boot-starter-validation` and the validation test starter, in both services. There isn't a single constraint annotation in the code. (DONE)
- unused dependency: `h2` in user-service. (DONE)
- redundant dependency: `spring-boot-starter-json` in quiz-service, which webmvc already brings in. (DONE)
- version mismatch: quiz-service is `0.0.1-SNAPSHOT`, while the other services are `1.0.0-SNAPSHOT`. (DONE)
- copied defaults: (DONE)
  - quiz-service sets `spring.servlet.multipart.*` and the Tomcat `max-http-form-post-size`, but it has no multipart or form endpoints; images arrive as base64 inside JSON.
  - Both services set `spring.jpa.show-sql=true` and `format_sql=true`, which prints every SQL statement to the logs.
  - Both name an explicit Hibernate dialect and `driver-class-name`, even though both are detected automatically.
- docker-compose: (DONE)
  - `SPRING_PROFILES_ACTIVE: docker` points to a profile that doesn't exist.
  - `SPRING_JPA_HIBERNATE_DDL_AUTO`, `SERVER_PORT` and `APP_MEDIA_*` repeat values the services already default to.
  - quiz-service has `depends_on: media` but never talks to the media container.
  - The DB credentials are repeated in five places.
- frontend Dockerfile: `package-lock.json` is in `.gitignore` and isn't copied, so `npm install` gives non-reproducible builds. Proposal: commit the lockfile and use `npm ci` **(decide)**. **(decided - do so)** (DONE)

## frontend: API calls

- double load on startup: `AuthService` first restores the user from localStorage, and then the startup refresh calls `setCurrentUser` with a new object. That counts as a user change, so: (DONE)
  - the sidebar fetches `GET /quizzes` and every ranking position again;
  - home fetches `/statistics/daily` again.

  The first batch usually goes out with an expired token, gets a 401 and is retried. The same reload happens on every token refresh (every 30 minutes). Fix: react only when `user.id` changes, or wait for the initial refresh before loading.
- N+1 requests: the sidebar calls `GET /quizzes/{id}/ranking-position` once per quiz. This re-runs on every list change, user change and `scoresVersion` tick. Because the state stream also depends on the user, its `combineLatest(user, quizState)` emits twice per change. (DONE)
- the start dialog downloads the full quiz (all questions, answers and images) just to read `limits.randomQuestionOrder`, and the play page then downloads the same quiz again. (DONE)
- copying a quiz: the sidebar downloads the whole quiz and posts it back to `/fork` (see quiz-service). (DONE)
- the sidebar only lives on `/`, so every return to home recreates it and refetches the list and all positions **(decide: acceptable, or cache in a service)**. -- **(decided - cache, the list wont change if the used does not interract with the nav bar)** (DONE)

## frontend: dead code

- `QuizApiService.getRawQuiz` (DONE)
- `QuizScoreService.getBestScores` and `formatScoreValue` (DONE)
- `AuthService.isAuthenticated` (DONE)
- the whole `quiz-score.model.ts` (`SaveQuizResultRequest`, `BestQuizScore`) (DONE)
- the `LoginRequest` and `RegisterRequest` interfaces in `auth.service.ts`, which nothing uses (DONE)
- `AuthResponse.message` and `QuizRawDTO.rankingProtected` (match the backend removals) (DONE)
- misleading name: `image-compression.util.ts` doesn't compress anything; rename it to `image.util.ts`. (DONE)
- misleading name: the CSS class `quiz-best-score` actually shows the ranking position. (DONE)

## bugs found while documenting (see docs/how-it-works.md, section 7)

- **FIXED:** the ranking hash compared image strings instead of image keys. Stored images arrived as `/media/<key>`, but new images and every ZIP image arrived as `data:…` strings. As a result:
  - ZIPs with images never rejoined their shared ranking;
  - the first save after adding an image reset the leaderboard, or failed with `RANKING_COPY_REQUIRED`.

  The fix:
  - `QuizService` now hashes and snapshots only entities that went through `MapperDTO.applyImage()`, using `rankingContentHash(Quiz, questions)`. `update()` and `importArchive()` build the entity first and compare afterwards.
  - Covered by `QuizServiceRankingHashTest`; both tests fail on the old code.
  - The temporary startup rewrite of old `data:` snapshots was removed before first ship (fresh databases never needed it).
- **ADDED:** unused images are now deleted. `MediaCleanupService` runs nightly at 03:45.
  - An image counts as used if any question or any ranking snapshot refers to its key.
  - The file's modification time records when it was last seen in use; it is refreshed nightly and on re-upload.
  - Files unused for `app.media-cleanup.unused-retention-days` (30 by default) are deleted.
  - Covered by `MediaStorageServiceTest`.
- **FIXED (ZIP check):** the server export crashed when two questions shared one image. Both got the image key as their file name, and `ZipOutputStream` refused the duplicate entry (`duplicate entry: images/<key>.png`), so the user got a 500. `QuizExportService` now names files by question position. Covered by `QuizExportServiceTest`, which also checks every exported field; it fails on the old code.
- **FIXED (ZIP check):** the importer accepted any number for scoring and answer points. The editor and `MapperDTO` only allow 0–99.99 (−99.99–0 for wrong answers) with two decimals, so:
  - a logged-in user got a generic "Nie udało się zaimportować quizu" error;
  - a guest's quiz was stored locally and only failed later, when it was uploaded at login.

  `parseQuizScoring()` and `parseAnswerPoints()` in `quiz-scoring.util.ts` now apply the same limits, with field-level messages.
- **FIXED (ZIP check):** the template instructions showed answers as `{ "text": … }`, but the parser requires `content`. Anyone who followed the example got an error.
- **FIXED (ZIP check):** a `.json` import with an image file name was accepted. The server then failed to decode it, and a guest saw a broken image. The import page now rejects such files with a message that points to the ZIP format.
- **FIXED (ZIP check):** the guest ZIP export dropped `rankingVersionId`, so a quiz a guest got from a share code lost its shared ranking after an export and re-import. `buildQuizZip()` now writes `_ranking.versionId` when the quiz has one.
- **FIXED:** a guest import of a ZIP with large images could exceed the `localStorage` quota. `saveQuizzes()` threw synchronously inside `QuizApiService.importQuiz()`, and the import page stayed stuck loading. Now the guest write runs inside `defer()`, and a full quota becomes a readable `QuizUserError` that the import page and the sidebar copy show.
- redundant field: `_ranking.contentHash` in the exported `quiz.json`. The importer never reads it; the server recomputes the hash from the content. (DONE)
- leftover to remove later: once every environment has started at least once with the hash fix, `repairInlineImageSnapshots()`, `QuizRankingVersionRepository.findWithInlineImages()` and the startup listener can be deleted. (DONE)

## bugs found in the bug hunt (all FIXED)

user-service:
- **FIXED:** tabs refreshing at the same moment logged each other out. Every refresh deleted the old key, so the second tab got a 401, and the cleared cookie could also wipe the first tab's new key. `RefreshSessionService.rotate()` now lets the old key expire 30 seconds later (`app.refresh-session.rotation-grace-seconds`) instead of deleting it, and `/refresh` no longer clears the cookie when it fails.
- **FIXED:** emails were case-sensitive and the login page didn't trim them. Registration now stores `trim().toLowerCase()`, and the lookups use `existsByEmailIgnoreCase` / `findAllByEmailIgnoreCase`. When old accounts differ only by case, the password picks the right one.
- **FIXED:** the server didn't check the password strength or the email format. `UserService.validatePassword()` and `validateEmail()` repeat the form rules: 8+ characters, a digit, a special character, and `name@domain.xx`. The password is also capped at 72 bytes, because BCrypt ignores anything longer.

quiz-service:
- **FIXED:** in points and percent mode a ranked question was worth only `pointsPerCorrect`, however many answers were correct, so a perfect run showed 200%. `maxQuestionScore()` now matches the frontend: `pointsPerCorrect × correct answers`, and `pointsPerCorrect` for fraction mode.
- **FIXED:** custom scoring ignored a disabled "Ujemny wynik obniża sumę quizu", so the ranking stored negative questions.
- **FIXED:** custom scoring found answers with `indexOf` on records, so identical answers were scored wrongly. Answers are now picked by position, and a repeated index counts once (before, `[0,0,0]` counted three times).
- **FIXED:** finishing a run crashed with an NPE or a 500 when the quiz had no version, or had been edited while the run was in progress. The run is now scored against the version it started on.
- **FIXED:** starting a `playSession` that had already finished violated the unique constraint and returned a 500. It is now a 400.
- **FIXED:** the guest upload failed completely when the user owned two quizzes on the same version (the same code redeemed twice). The lookup is now `findFirstByOwnerUserIdAndRankingVersion_IdOrderByIdAsc`.
- **FIXED:** redeeming your own share code or importing your own ZIP set `has_logged_import`, which locked your original behind "(kopia)" copies. `markImportIfShared()` sets it only when another user owns a quiz on that version.
- **FIXED:** titles over 255 characters hit the `VARCHAR(255)` column and returned a 500, and "(kopia)" could push a title over the limit. `MapperDTO.validTitle()` returns a 400 with a message, and `copyTitle()` shortens the title to fit.
- **FIXED:** images between ~14.3 MB and 16 MB passed the 16 MB check but broke Jackson's 20M-character string limit. `QuizServiceApplication` raises the limit to fit a 16 MB data URL, for both Jackson 3 and the Jackson 2 bridge.

frontend:
- **FIXED:** any failed refresh logged the user out, including a network drop or a 5xx while the backend restarted. That redirected to `/login` and wiped the saved quiz runs. Now only a 401/403 from `/refresh` ends the session; other errors just fail the original call.
- **FIXED:** when the quiz was finished before the `ranking-attempts` response arrived, the run was never sent for ranking and the timer kept running. `startRanking()` now finishes right away in that case, and both calls show an error in the result box instead of failing silently.
- **FIXED:** opening a finished run's link in a new tab reused its `playSession`, and the server refused it. When the tab has no snapshot for that id, the page now starts with a new one.
- **FIXED:** a quiz over the 30 MB nginx limit (`client_max_body_size`), such as a ZIP import or a save with several large images, failed with a generic error. `sendIfQuizFits()` in `core/utils/quiz-request.util.ts` checks the size first. `quizRequestErrorMessage()` shows that message, the server's 400 messages, and a 413.

## decided: answers stay in the play payload

`GET /quizzes/{id}` keeps sending the `correct` flags and points, and the play page keeps grading in the browser. We considered a separate "check answer" endpoint and dropped it. Courser is a learning platform, the player owns their copy (editor and ZIP export show the answers anyway), and the leaderboard is already safe because `finishRankingAttempt()` recalculates the score on the server. Don't list this as a bug in future reviews.

## open bugs (second pass, not fixed yet)

frontend:
- **guest upload is all-or-nothing.** `AuthService.migrateGuestQuizzesToUser()` sends every local quiz in one `forkJoin` and clears local storage only if all succeed. One quiz the server refuses (for example an image over 16 MB or a non-image file from a ZIP) makes every later login show "Zalogowano, ale nie udało się przenieść lokalnych quizów". The quizzes that did upload are sent again each time; the identical-quiz check prevents duplicates. Fix: upload one by one, remove each success from storage, and keep only the failures. (DONE)
- **ZIP images aren't checked.** `parseQuizZip()` turns any file under `images/` into a data URL, falling back to `application/octet-stream`, with no type check and no 16 MB limit. The editor's `readImageFile()` checks both. A logged-in user now gets the server's 400 message, but a guest stores a broken image locally, and that quiz then blocks the guest upload (see above). (DONE)
- **a question with no correct answer can't be scored in fraction mode.** The editor allows saving a question where nothing is marked correct. In fraction mode its maximum is still `pointsPerCorrect` (1), but the reward is always 0. So leaving it empty scores 0/1, while the result list shows it as fully correct (`isQuestionFullyCorrect()`). Points and custom mode give 0/0, so the modes disagree. The fix must match in `quiz-scoring.util.ts` and `QuizService.maxQuestionScore()`: either treat the maximum as 0, or have the editor require at least one correct answer **(decided - the maximum is 0 in every mode)**. (DONE)
- **a pasted share code with a stray space gets cut off.** The code input has `maxlength="11"`, and the formatted code (`ABCDE-FGHJK`) is exactly 11 characters. Pasting it with a leading or trailing space, which is common when copying from a chat, cuts off the last character before `normalizeShareCode()` can strip the space. Fix: drop the `maxlength` or raise it; normalisation already handles the rest. (DONE)
- **logout doesn't wait for the "leave?" confirmation (low).** `NavbarComponent.logout()` clears the session and only then navigates. On the play page or in the editor with unsaved changes, the guard asks "leave?" after the user is already logged out. Choosing "stay" leaves a logged-out page whose saves fail. Fix: navigate first, and log out only if the navigation succeeds. (DONE)

user-service:
- **usernames are case-sensitive (low).** `existsByUsername` allows `Jan` and `jan` as two accounts, and both appear on leaderboards as near-identical names. Same idea as the email fix: `existsByUsernameIgnoreCase` on register and settings. (DONE)

## repo and docs

- a committed build artifact: `docs/final-imaging/__pycache__/`. (DONE)
- superseded generators: `docs/architecture/*` and `docs/database/*`, now replaced by `docs/final-imaging` **(decide: delete or archive)**. -- **(decided - keep)** (DONE)
- stale `TODO.MD`: the settings and ranking items are already done. (DONE)
- outdated `README.MD`: it describes features that don't exist (courses, an admin/moderator panel, Vitest, Postman). (DONE)
- stale `tests.http`: it calls `localhost:8080/quizzes` without `/api` and without a token. quiz-service's only test is `contextLoads`. (DONE)
- after the cleanup: regenerate the `docs/final-imaging` diagrams (the DB schema and class diagram still show the legacy tables) and update `docs/notatki-odpowiedzialnosci.md`. (DONE — diagrams regenerated for schema 001–018; `notatki-odpowiedzialnosci.md` is no longer in the repo)
- frontend lockfile: commit `frontend/package-lock.json` and build with `npm ci` in the Dockerfile. (DONE — lockfile present, not gitignored, Dockerfile uses `npm ci`; stage it with the first-ship commit)
- `docs/how-it-works.md` brought in line with the cleaned APIs (body-less fork, list `rankingPosition`, `image.util.ts`, no startup snapshot repair, one-by-one guest upload). (DONE)
