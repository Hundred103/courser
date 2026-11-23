# Final imaging

Wygenerowane diagramy architektury Courser (PNG).

## Wymagania

Graphviz CLI (`dot`) w `PATH`:

```bash
brew install graphviz          # macOS
sudo apt install graphviz      # Ubuntu/Debian
```

Pillow (ikony w diagramie architektury, generowane do `icons/`):

```bash
pip install pillow
```

## Generowanie

```bash
cd docs/final-imaging
python3 generate.py
# opcjonalnie: zachowaj źródła Graphviz
python3 generate.py --keep-dot
```

`generate.py` ma też opcję `--suffix`, gdy chcesz zapisać kopię pod inną nazwą zamiast nadpisać pliki w `out/` (np. `python3 generate.py --suffix _backup`).

Katalog wyjściowy: `out/`

| Plik | Zawartość |
|------|-----------|
| `01_system_architecture.png` | Kontenery / serwisy — baza u góry, dane w dół |
| `02_database_schema.png` | Schemat ER `courserdb` (kurza stopka, PK/FK/UQ, NOT NULL, ON DELETE) |
| `02_database_schema_16x9.png` | Ten sam schemat w układzie poziomym 16:9 (slajd prezentacji) |
| `03_quiz_ranking_lifecycle.png` | Operacje QuizService: kiedy powstaje kopia quizu / nowa wersja rankingu |
| `04_user_usecases.png` | Przypadki użycia UML (aktorzy, «include» / «extend») |
| `05_class_diagram.png` | Diagram klas UML: encje JPA, enumy, model statystyk JDBC (kompozycje, krotności) |
| `06_frontend_architecture.png` | Architektura frontendu Angular: start, layouty, trasy, serwisy, interceptor, pamięć przeglądarki |

Teksty opisowe są po polsku. Identyfikatory z kodu (tabele, endpointy, flagi, nazwy klas) pozostają po angielsku.

**Model własności:** odbiorca kodu dostaje **kopię** quizu i staje się jej `owner_user_id`. Ranking jest wspólny (`ranking_version`) tylko dopóki kopia nie zostanie edytowana rankingowo. Nie ma osobnej roli „gracz ≠ właściciel” — rozwiązywanie idzie zawsze przez własny wiersz `quizzes`.
