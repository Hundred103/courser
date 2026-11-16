# Final imaging

Generated architecture diagrams for Courser (PNG).

## Prerequisites

Graphviz CLI (`dot`) on `PATH`:

```bash
brew install graphviz          # macOS
sudo apt install graphviz      # Ubuntu/Debian
```

## Generate

```bash
cd docs/final-imaging
python3 generate.py
# optional: keep Graphviz sources
python3 generate.py --keep-dot
```

Output directory: `out/`

| File | Contents |
|------|----------|
| `01_system_architecture.png` | Containers / services — DB on top, data flowing down |
| `02_database_schema.png` | Current `courserdb` ER diagram |
| `03_quiz_ranking_lifecycle.png` | Quiz + ranking flows and correlation rules |
| `04_user_usecases.png` | Guest / student / owner / ranking participant use cases |
