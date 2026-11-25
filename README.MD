# Courser

## O projekcie
Courser to darmowa platforma e-learningowa łącząca kursy, interaktywne quizy i elementy rywalizacji (rankingi), aby zwiększać motywację do nauki.

### Problem
Brak bezpłatnego, kompleksowego rozwiązania edukacyjnego z nauką, weryfikacją wiedzy i systemem motywacyjnym w jednym miejscu.

### Dla kogo
- uczniowie i studenci
- szkoły i użytkownicy indywidualni
- przyszli twórcy treści edukacyjnych

## Zakres funkcjonalny
- rejestracja i logowanie użytkowników (gość może tworzyć quizy lokalnie i wgrać je przy pierwszym logowaniu)
- tworzenie i edycja quizów (obrazy, własna punktacja, opcje wyświetlania)
- import / eksport quizów (ZIP lub JSON)
- udostępnianie quizu krótkim kodem powiązanym z zamrożoną wersją rankingu
- rozwiązywanie quizów (tryb rankingowy lub nauka; wynik rankingowy przeliczany po stronie serwera)
- punkty i rankingi postępów
- statystyki na stronie głównej (dzienne quizy, pytania, skuteczność)
- kolor akcentu strony w ustawieniach
- panel administracyjny/moderatorski do zarządzania treściami i użytkownikami (planowany)
- przeglądanie i realizacja kursów (planowane)

## Technologie
- Frontend: Angular (nginx w produkcji)
- Backend: Spring Boot (mikrousługi: gateway, user-service, quiz-service)
- Baza danych: PostgreSQL + Liquibase
- Media: pliki adresowane haszem, serwowane przez nginx
- Konteneryzacja: Docker Compose
- Testy: JUnit (quiz-service, user-service); ręczny scratch pad HTTP w `backend/quiz-service/.../tests.http`
- Narzędzia: VS Code / IntelliJ IDEA, GitHub Issues, draw.io

## Uruchomienie lokalne
1. Skopiuj `.env.example` do `.env` i uzupełnij wartości (zwłaszcza `APP_JWT_SECRET`, min. 32 bajty).
2. Z katalogu głównego repozytorium:

```bash
docker compose up --build
```

3. Aplikacja: `http://localhost:4200` (albo `FRONTEND_PORT` z `.env`).
   Gateway API: `http://localhost:8080/api`. Postgres: `127.0.0.1:5433`.

Opcjonalne dane przykładowe tylko na **świeżej** bazie (konto `example@email.com` / `12345678!`, trzy quizy, miesiąc statystyk i wpisy w rankingu):

```bash
# w .env: LIQUIBASE_CONTEXTS=seed
docker compose down
docker volume rm courser-postgres-data
docker compose up --build -d
```

Szczegóły resetu bazy i Liquibase: `postgre/commands.txt`.

## Struktura repozytorium
| Ścieżka | Rola |
|---|---|
| `frontend/` | aplikacja Angular |
| `backend/gateway/` | weryfikacja JWT, routowanie do usług |
| `backend/user-service/` | konta, ciasteczko odświeżania, statystyki |
| `backend/quiz-service/` | quizy, ranking, media, eksport ZIP |
| `postgre/liquibase/` | migracje schematu |
| `docs/how-it-works.md` | opis głównych mechanizmów |
| `docs/final-imaging/` | diagramy architektury / bazy / klas |

## Dokumentacja
- [How it works](docs/how-it-works.md) — rejestracja, wersje rankingu, rozwiązywanie, ZIP, tryb gościa, zadaniaania porządkujące
- [Final imaging](docs/final-imaging/README.md) — wygenerowane diagramy

## Organizacja pracy
- tryb pracy: rozproszony
- komunikacja: Discord (kanały techniczne i organizacyjne)
- spotkania: 2 razy w miesiącu

## Zespół
- Mateusz Michałowski (Full Stack) - s198263@student.pg.edu.pl
- Szymon Kula (Full Stack) - s198068@student.pg.edu.pl

## Plan realizacji
1. Analiza i projekt bazy danych
2. Implementacja backendu i prowizorycznego frontendu
3. Implementacja końcowego frontendu
4. Integracja i testy
5. Wdrożenie w Dockerze

## Ograniczenia
- budżet: 0 zł (wyłącznie darmowe technologie)
- realizacja w określonym terminie projektu
