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
# aktualny zestaw z przyrostkiem _final (nie nadpisuje starszych PNG bez przyrostka)
python3 generate.py --suffix _final
# opcjonalnie: zachowaj źródła Graphviz
python3 generate.py --keep-dot
```

Katalog wyjściowy: `out/`

| Plik | Zawartość |
|------|-----------|
| `01_system_architecture.png` / `…_final.png` | Kontenery / serwisy — baza u góry, dane w dół |
| `02_database_schema.png` / `…_final.png` | Schemat ER `courserdb` (kurza stopka, PK/FK/UQ, NOT NULL, ON DELETE) |
| `02_database_schema_16x9.png` / `…_final.png` | Ten sam schemat w układzie poziomym 16:9 (slajd prezentacji) |
| `03_quiz_ranking_lifecycle.png` / `…_final.png` | Operacje QuizService: kiedy powstaje kopia quizu / nowa wersja rankingu |
| `04_user_usecases.png` / `…_final.png` | Przypadki użycia UML (aktorzy, «include» / «extend») |
| `05_class_diagram.png` / `…_final.png` | Diagram klas UML: encje JPA, enumy, model statystyk JDBC (kompozycje, krotności) |
| `06_frontend_architecture.png` / `…_final.png` | Architektura frontendu Angular: start, layouty, trasy, serwisy, interceptor, pamięć przeglądarki |

Teksty opisowe są po polsku. Identyfikatory z kodu (tabele, endpointy, flagi, nazwy klas) pozostają po angielsku.

**Model własności:** odbiorca kodu dostaje **kopię** quizu i staje się jej `owner_user_id`. Ranking jest wspólny (`ranking_version`) tylko dopóki kopia nie zostanie edytowana rankingowo. Nie ma osobnej roli „gracz ≠ właściciel” — rozwiązywanie idzie zawsze przez własny wiersz `quizzes`.
