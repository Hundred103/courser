#!/usr/bin/env python3
"""
Generate Courser final documentation diagrams (PNG).

Requires Graphviz CLI (`dot`) on PATH:
  macOS:  brew install graphviz
  Ubuntu: sudo apt install graphviz

Usage:
  python3 generate.py
  python3 generate.py --out ./out
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# Modern slate / teal palette (not purple-on-white).
C = {
    "bg": "#F8FAFC",
    "ink": "#0F172A",
    "muted": "#64748B",
    "line": "#94A3B8",
    "card": "#FFFFFF",
    "border": "#E2E8F0",
    "header": "#0F172A",
    "header2": "#1E293B",
    "accent": "#0D9488",
    "accent2": "#0369A1",
    "warn": "#B45309",
    "rank": "#7C2D12",
    "media": "#4338CA",
    "guest": "#475569",
}


def require_dot() -> str:
    path = shutil.which("dot")
    if not path:
        print("ERROR: Graphviz `dot` not found on PATH.", file=sys.stderr)
        print("Install: brew install graphviz  |  sudo apt install graphviz", file=sys.stderr)
        sys.exit(1)
    return path


def render(dot_bin: str, source: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [dot_bin, "-Tpng", "-Gdpi=160", f"-o{output}"],
        input=source.encode("utf-8"),
        capture_output=True,
    )
    if result.returncode != 0:
        print(result.stderr.decode("utf-8", errors="replace"), file=sys.stderr)
        raise RuntimeError(f"Failed to render {output.name}")
    print(f"  ✓ {output}")


def _port(raw: str) -> str:
    """Graphviz HTML ports must be simple identifiers."""
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in raw.strip().lower())
    return cleaned.strip("_") or "col"


def table(
    name: str,
    title: str,
    rows: list[tuple[str, str]],
    *,
    header: str | None = None,
) -> str:
    header = header or C["header"]
    body_rows: list[str] = []
    for col, typ in rows:
        port = _port(col.split()[0] if col else "col")
        type_text = typ if typ else "—"
        body_rows.append(
            f'<TR><TD ALIGN="LEFT" PORT="{port}" BGCOLOR="{C["card"]}">'
            f'<FONT COLOR="{C["ink"]}">{col}</FONT></TD>'
            f'<TD ALIGN="LEFT" BGCOLOR="{C["card"]}">'
            f'<FONT COLOR="{C["muted"]}">{type_text}</FONT></TD></TR>'
        )
    body = "\n".join(body_rows)
    return f'''{name} [label=<
<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="6" COLOR="{C["border"]}" BGCOLOR="{C["card"]}">
  <TR><TD COLSPAN="2" BGCOLOR="{header}" PORT="title"><FONT COLOR="white"><B>{title}</B></FONT></TD></TR>
  {body}
</TABLE>>];'''


# ---------------------------------------------------------------------------
# 1. System architecture — database on top, data flowing down
# ---------------------------------------------------------------------------

def system_architecture() -> str:
    return f'''
digraph SystemArchitecture {{
  graph [
    bgcolor="{C["bg"]}",
    fontname="Helvetica",
    fontsize=18,
    label="Courser — system architecture\\n(database at top · data flows down)",
    labelloc=t,
    pad="0.4",
    ranksep="0.85",
    nodesep="0.55",
    splines=ortho
  ];
  node [fontname="Helvetica", fontsize=11, shape=box, style="rounded,filled", color="{C["border"]}", fontcolor="{C["ink"]}"];
  edge [fontname="Helvetica", fontsize=9, color="{C["line"]}"];

  subgraph cluster_data {{
    label="Data plane";
    fontcolor="{C["muted"]}";
    color="{C["border"]}";
    style="rounded";
    bgcolor="#FFFFFF";

    postgres [
      label="PostgreSQL 16\\ncourserdb",
      fillcolor="{C["header"]}",
      fontcolor="white",
      width=2.4
    ];
    liquibase [
      label="Liquibase\\nmigrations + seed",
      fillcolor="{C["header2"]}",
      fontcolor="white"
    ];
    media_vol [
      label="Volume\\ncourser-media-data\\ncontent-addressed images",
      fillcolor="#EEF2FF",
      color="{C["media"]}"
    ];
  }}

  subgraph cluster_services {{
    label="Application services";
    fontcolor="{C["muted"]}";
    color="{C["border"]}";
    style="rounded";
    bgcolor="#FFFFFF";

    quiz [
      label="quiz-service :8081\\nquizzes · ranking · share · export\\nwrites image_key files",
      fillcolor="#CCFBF1",
      color="{C["accent"]}"
    ];
    user [
      label="user-service :8082\\nauth · JWT · statistics",
      fillcolor="#E0F2FE",
      color="{C["accent2"]}"
    ];
    media [
      label="media (nginx)\\nstatic /media/<hash>.ext",
      fillcolor="#EEF2FF",
      color="{C["media"]}"
    ];
  }}

  subgraph cluster_edge {{
    label="Edge";
    fontcolor="{C["muted"]}";
    color="{C["border"]}";
    style="rounded";
    bgcolor="#FFFFFF";

    gateway [
      label="API Gateway :8080\\nJWT · CORS · route split",
      fillcolor="#FEF3C7",
      color="{C["warn"]}"
    ];
    frontend [
      label="frontend nginx :4200\\nAngular SPA\\n/api → gateway · /media → media",
      fillcolor="#F1F5F9",
      color="{C["ink"]}"
    ];
  }}

  browser [
    label="Browser\\nJWT localStorage · guestQuizzes\\nsession play state",
    fillcolor="white",
    color="{C["ink"]}",
    width=2.6
  ];

  {{ rank=same; postgres; liquibase; media_vol }}
  {{ rank=same; quiz; user; media }}

  liquibase -> postgres [label="schema", color="{C["accent"]}", fontcolor="{C["accent"]}"];
  postgres -> quiz [label="JDBC", style=dashed, color="{C["accent"]}", fontcolor="{C["accent"]}"];
  postgres -> user [label="JDBC", style=dashed, color="{C["accent2"]}", fontcolor="{C["accent2"]}"];
  quiz -> media_vol [label="write hash.ext", color="{C["media"]}", fontcolor="{C["media"]}"];
  media_vol -> media [label="serve files", color="{C["media"]}", fontcolor="{C["media"]}"];

  quiz -> gateway [label="REST", dir=back, color="{C["warn"]}", fontcolor="{C["warn"]}"];
  user -> gateway [label="REST", dir=back, color="{C["warn"]}", fontcolor="{C["warn"]}"];
  gateway -> frontend [label="/api", dir=back, color="{C["ink"]}", fontcolor="{C["ink"]}"];
  media -> frontend [label="/media", dir=back, color="{C["media"]}", fontcolor="{C["media"]}"];
  frontend -> browser [label="HTTPS", dir=back, color="{C["ink"]}", fontcolor="{C["ink"]}", style=bold];
}}
'''


# ---------------------------------------------------------------------------
# 2. Database schema — current tables
# ---------------------------------------------------------------------------

def database_schema() -> str:
    users = table("users", "users", [
        ("id", "BIGINT PK IDENTITY"),
        ("username", "VARCHAR UNIQUE"),
        ("email", "VARCHAR UNIQUE"),
        ("password", "VARCHAR"),
        ("role", "STUDENT | TEACHER | ADMIN"),
        ("accent_color", "VARCHAR"),
        ("quizzes_completed", "INT"),
        ("total_score", "INT"),
        ("created_at", "TIMESTAMP"),
        ("last_login", "TIMESTAMP"),
    ], header=C["accent2"])

    quizzes = table("quizzes", "quizzes", [
        ("id", "BIGINT PK IDENTITY"),
        ("title", "VARCHAR"),
        ("owner_user_id", "FK users"),
        ("ranking_version_id", "FK ranking_versions"),
        ("scoring_mode", "DEFAULT | CUSTOM"),
        ("allow_negative_score", "BOOL"),
        ("points_per_correct", "DOUBLE"),
        ("incorrect_penalty", "DOUBLE"),
        ("penalty_mode", "FRACTION | POINTS | PERCENT"),
        ("random_question_order", "BOOL"),
        ("show_correct_answers", "BOOL"),
    ], header=C["accent"])

    questions = table("questions", "questions", [
        ("id", "BIGINT PK IDENTITY"),
        ("quiz_id", "FK quizzes"),
        ("content", "TEXT"),
        ("question_order", "INT"),
        ("image_key", "VARCHAR media ref"),
        ("image_filename", "VARCHAR"),
    ], header=C["accent"])

    answers = table("answers", "answers", [
        ("id", "BIGINT PK IDENTITY"),
        ("question_id", "FK questions"),
        ("content", "TEXT"),
        ("correct", "BOOL"),
        ("points", "DOUBLE nullable"),
        ("answer_order", "INT"),
    ], header=C["accent"])

    share = table("share", "quiz_share_codes", [
        ("id", "BIGINT PK IDENTITY"),
        ("code", "VARCHAR(10) UNIQUE"),
        ("active", "BOOL"),
        ("quiz_id", "FK nullable"),
        ("ranking_version_id", "FK"),
        ("created_by_user_id", "FK users"),
        ("created_at", "TIMESTAMP"),
        ("expires_at", "TIMESTAMP"),
    ], header=C["warn"])

    versions = table("versions", "quiz_ranking_versions", [
        ("id", "UUID PK"),
        ("snapshot_json", "TEXT"),
        ("content_hash", "VARCHAR(64)"),
        ("has_logged_import", "BOOL"),
        ("created_at", "TIMESTAMP"),
    ], header=C["rank"])

    attempts = table("attempts", "quiz_ranking_attempts", [
        ("id", "UUID PK"),
        ("ranking_version_id", "FK"),
        ("user_id", "FK users"),
        ("client_session_id", "UUID"),
        ("status", "STARTED ..."),
        ("score_scaled", "INT nullable"),
        ("max_score_scaled", "INT nullable"),
        ("duration_ms", "BIGINT nullable"),
        ("position", "INT nullable"),
        ("outside_top_five", "BOOL nullable"),
    ], header=C["rank"])

    entries = table("entries", "quiz_ranking_entries", [
        ("id", "BIGINT PK IDENTITY"),
        ("ranking_version_id", "FK"),
        ("user_id", "FK users"),
        ("score_scaled", "INT"),
        ("max_score_scaled", "INT"),
        ("duration_ms", "BIGINT"),
        ("completed_at", "TIMESTAMP"),
    ], header=C["rank"])

    refresh = table("refresh", "refresh_sessions", [
        ("id", "UUID PK"),
        ("user_id", "FK users"),
        ("token_hash", "VARCHAR UNIQUE"),
        ("created_at", "TIMESTAMP"),
        ("last_used_at", "TIMESTAMP"),
        ("expires_at", "TIMESTAMP"),
    ], header=C["header2"])

    results = table("results", "quiz_results", [
        ("id", "BIGINT PK IDENTITY"),
        ("user_id", "FK users"),
        ("quiz_id", "FK quizzes"),
        ("score", "INT"),
        ("max_score", "INT"),
        ("completed_at", "TIMESTAMP"),
    ], header=C["header2"])

    completed = table("completed", "quiz_completed_attempts", [
        ("id", "BIGINT PK"),
        ("user_id", "FK users"),
        ("quiz_id", "FK quizzes"),
        ("completed_at", "TIMESTAMP"),
    ], header=C["header2"])

    daily = table("daily", "user_daily_statistics", [
        ("user_id", "PK part FK users"),
        ("activity_date", "PK part DATE"),
        ("completed_quizzes", "BIGINT"),
        ("checked_questions", "BIGINT"),
        ("effectiveness_sum", "BIGINT"),
        ("effectiveness_count", "BIGINT"),
    ], header=C["header2"])

    summary = table("summary", "user_quiz_summary", [
        ("user_id", "PK part FK users"),
        ("quiz_id", "PK part FK quizzes"),
        ("completed_count", "BIGINT"),
        ("best_score", "INT"),
        ("best_max_score", "INT"),
    ], header=C["header2"])

    retry = table("retry", "user_statistics_retry_keys", [
        ("user_id", "PK part FK users"),
        ("request_id", "PK part UUID"),
        ("created_at", "TIMESTAMPTZ"),
    ], header=C["header2"])

    return f'''
digraph DatabaseSchema {{
  graph [
    bgcolor="{C["bg"]}",
    fontname="Helvetica",
    fontsize=18,
    label="Courser — database schema (courserdb)",
    labelloc=t,
    pad="0.35",
    ranksep="0.7",
    nodesep="0.35",
    splines=true
  ];
  node [fontname="Helvetica", fontsize=10, shape=plaintext];
  edge [fontname="Helvetica", fontsize=8, color="{C["line"]}", arrowsize=0.7];

  {users}
  {quizzes}
  {questions}
  {answers}
  {versions}
  {share}
  {attempts}
  {entries}
  {refresh}
  {results}
  {completed}
  {daily}
  {summary}
  {retry}

  users:id -> quizzes:owner_user_id [label="owns"];
  users:id -> share:created_by_user_id [label="creates code"];
  users:id -> attempts:user_id;
  users:id -> entries:user_id;
  users:id -> refresh:user_id;
  users:id -> results:user_id;
  users:id -> completed:user_id;
  users:id -> daily:user_id;
  users:id -> summary:user_id;
  users:id -> retry:user_id;

  quizzes:id -> questions:quiz_id [label="1:N", color="{C["accent"]}", fontcolor="{C["accent"]}"];
  questions:id -> answers:question_id [label="1:N", color="{C["accent"]}", fontcolor="{C["accent"]}"];
  quizzes:id -> share:quiz_id [style=dashed];
  quizzes:id -> results:quiz_id;
  quizzes:id -> completed:quiz_id;
  quizzes:id -> summary:quiz_id;

  versions:id -> quizzes:ranking_version_id [label="N:1 shared", color="{C["rank"]}", fontcolor="{C["rank"]}"];
  versions:id -> share:ranking_version_id [color="{C["rank"]}"];
  versions:id -> attempts:ranking_version_id [color="{C["rank"]}"];
  versions:id -> entries:ranking_version_id [color="{C["rank"]}"];
}}
'''


# ---------------------------------------------------------------------------
# 3. Quiz + ranking lifecycle (correlated)
# ---------------------------------------------------------------------------

def lifecycle() -> str:
    return f'''
digraph QuizRankingLifecycle {{
  graph [
    bgcolor="{C["bg"]}",
    fontname="Helvetica",
    fontsize=17,
    label="Courser — quiz & ranking lifecycle\\n(how quiz copies correlate with shared leaderboards)",
    labelloc=t,
    pad="0.45",
    ranksep="0.55",
    nodesep="0.4",
    splines=spline
  ];
  node [fontname="Helvetica", fontsize=10, shape=box, style="rounded,filled", color="{C["border"]}", fontcolor="{C["ink"]}"];
  edge [fontname="Helvetica", fontsize=8, color="{C["line"]}"];

  subgraph cluster_quiz {{
    label="Quiz lifecycle";
    fontcolor="{C["accent"]}";
    color="{C["accent"]}";
    style="rounded";
    bgcolor="#F0FDFA";

    q_create [label="Create / import ZIP\\nPOST /quizzes · import-archive", fillcolor="#CCFBF1"];
    q_edit [label="Edit content\\nPUT /quizzes/{{id}}", fillcolor="#CCFBF1"];
    q_play [label="Play (study or graded)\\nGET /quizzes/{{id}}", fillcolor="#CCFBF1"];
    q_export [label="Export ZIP\\nGET …/export", fillcolor="#CCFBF1"];
    q_share [label="Create share code\\nPOST …/share-codes", fillcolor="#FEF3C7"];
    q_fork [label="Fork copy\\nPOST …/fork", fillcolor="#FEF3C7"];
    q_guest [label="Guest local quiz\\nlocalStorage guestQuizzes", fillcolor="#F1F5F9", color="{C["guest"]}"];
  }}

  subgraph cluster_rank {{
    label="Ranking lifecycle";
    fontcolor="{C["rank"]}";
    color="{C["rank"]}";
    style="rounded";
    bgcolor="#FFF7ED";

    r_version [label="Ranking version\\nsnapshot_json + content_hash\\n(questions + scoring only)", fillcolor="#FFEDD5", color="{C["rank"]}"];
    r_share [label="Share / import-code\\nattach same ranking_version_id\\nset has_logged_import", fillcolor="#FFEDD5", color="{C["rank"]}"];
    r_start [label="Start attempt\\nPOST …/ranking-attempts\\n(clientSessionId)", fillcolor="#FFEDD5", color="{C["rank"]}"];
    r_finish [label="Finish attempt\\nscore vs snapshot_json", fillcolor="#FFEDD5", color="{C["rank"]}"];
    r_board [label="Leaderboard top-5\\nquiz_ranking_entries\\nbest score per user", fillcolor="#FFEDD5", color="{C["rank"]}"];
  }}

  subgraph cluster_rules {{
    label="Correlation rules";
    fontcolor="{C["ink"]}";
    color="{C["border"]}";
    style="rounded";
    bgcolor="#FFFFFF";

    rule1 [label="New quiz → new private ranking version", shape=note, fillcolor="white"];
    rule2 [label="Content hash changes (no logged import)\\n→ new version, empty board", shape=note, fillcolor="white"];
    rule3 [label="has_logged_import = true\\n→ ranking-affecting edit requires FORK\\n(RANKING_COPY_REQUIRED)", shape=note, fillcolor="#FEF3C7"];
    rule4 [label="Import by code / matching ZIP hash\\n→ shared version + shared board", shape=note, fillcolor="#FFEDD5"];
    rule5 [label="Title / limits alone\\ndo not change content_hash", shape=note, fillcolor="white"];
  }}

  q_create -> r_version [label="ensureRankingVersion", color="{C["rank"]}", fontcolor="{C["rank"]}", style=bold];
  q_create -> q_edit;
  q_edit -> q_play;
  q_create -> q_export;
  q_create -> q_share;
  q_share -> r_share [label="bind version", color="{C["rank"]}", fontcolor="{C["rank"]}"];
  r_share -> r_version [dir=none, style=dashed, color="{C["rank"]}"];

  q_edit -> rule2 [style=dashed];
  q_edit -> rule3 [style=dashed];
  rule3 -> q_fork [label="must fork", color="{C["warn"]}", fontcolor="{C["warn"]}"];
  q_fork -> r_version [label="new private version", color="{C["rank"]}", fontcolor="{C["rank"]}"];

  r_share -> r_start;
  r_start -> r_finish;
  r_finish -> r_board;

  q_play -> r_start [label="logged-in + rankingEnabled", color="{C["rank"]}", fontcolor="{C["rank"]}", style=dashed];
  q_guest -> q_create [label="login migrate", style=dashed, color="{C["guest"]}", fontcolor="{C["guest"]}"];

  r_version -> rule1 [style=invis];
  rule4 -> r_share [style=invis];
}}
'''


# ---------------------------------------------------------------------------
# 4. User use-case diagram
# ---------------------------------------------------------------------------

def usecases() -> str:
    def uc(name: str, label: str) -> str:
        return (
            f'{name} [label="{label}", shape=ellipse, style="filled", '
            f'fillcolor="white", color="{C["accent"]}", fontcolor="{C["ink"]}"];'
        )

    return f'''
digraph UserUsecases {{
  graph [
    bgcolor="{C["bg"]}",
    fontname="Helvetica",
    fontsize=17,
    label="Courser — user use cases",
    labelloc=t,
    pad="0.5",
    ranksep="0.9",
    nodesep="0.28",
    splines=true,
    concentrate=false
  ];
  node [fontname="Helvetica", fontsize=10];
  edge [fontname="Helvetica", fontsize=8, color="{C["line"]}", arrowhead=none, penwidth=1.1];

  guest [label="Guest", shape=box, style="rounded,filled", fillcolor="#F1F5F9", color="{C["guest"]}", width=1.6];
  student [label="Logged-in user\\n(STUDENT)", shape=box, style="rounded,filled", fillcolor="#CCFBF1", color="{C["accent"]}", width=1.8];
  owner [label="Quiz owner", shape=box, style="rounded,filled", fillcolor="#E0F2FE", color="{C["accent2"]}", width=1.6];
  competitor [label="Ranking\\nparticipant", shape=box, style="rounded,filled", fillcolor="#FFEDD5", color="{C["rank"]}", width=1.6];

  {{ rank=same; guest; student; owner; competitor }}

  subgraph cluster_system {{
    label="Courser";
    fontcolor="{C["muted"]}";
    color="{C["border"]}";
    style="rounded";
    bgcolor="#FFFFFF";

    {uc("uc_auth", "Register / login / refresh")}
    {uc("uc_browse", "Browse / play\\nlocal quiz")}
    {uc("uc_import_code", "Import via share code")}
    {uc("uc_import_zip", "Import ZIP archive")}
    {uc("uc_migrate", "Migrate guest quizzes\\nafter login")}
    {uc("uc_create", "Create & edit quiz\\n(+ images max 16 MB)")}
    {uc("uc_export", "Export quiz ZIP")}
    {uc("uc_share", "Create share code")}
    {uc("uc_fork", "Fork protected quiz\\nbefore ranking edit")}
    {uc("uc_play", "Play graded / study mode")}
    {uc("uc_rank", "Compete on ranking\\n(start / resume / finish)")}
    {uc("uc_board", "View leaderboard\\n& own position")}
    {uc("uc_stats", "View personal statistics")}
    {uc("uc_theme", "Set accent / theme")}
  }}

  // Guest capabilities only
  guest -> uc_auth;
  guest -> uc_browse;
  guest -> uc_import_code;
  guest -> uc_import_zip;

  // Authenticated student
  student -> uc_auth;
  student -> uc_create;
  student -> uc_play;
  student -> uc_import_code;
  student -> uc_import_zip;
  student -> uc_migrate;
  student -> uc_stats;
  student -> uc_theme;

  // Owner of a quiz row
  owner -> uc_create;
  owner -> uc_export;
  owner -> uc_share;
  owner -> uc_fork;
  owner -> uc_play;

  // Shared ranking competitor
  competitor -> uc_play;
  competitor -> uc_rank;
  competitor -> uc_board;

  uc_share -> uc_import_code [style=dashed, arrowhead=vee, label=" enables ", fontsize=7, fontcolor="{C["muted"]}"];
  uc_import_code -> uc_rank [style=dashed, arrowhead=vee, label=" shared board ", fontsize=7, fontcolor="{C["rank"]}", color="{C["rank"]}"];
  uc_fork -> uc_create [style=dashed, arrowhead=vee, label=" new private board ", fontsize=7, fontcolor="{C["warn"]}", color="{C["warn"]}"];
}}
'''


GENERATORS = {
    "01_system_architecture": system_architecture,
    "02_database_schema": database_schema,
    "03_quiz_ranking_lifecycle": lifecycle,
    "04_user_usecases": usecases,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Courser final-imaging PNGs")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent / "out",
        help="Output directory for PNG files",
    )
    parser.add_argument(
        "--keep-dot",
        action="store_true",
        help="Also write intermediate .dot sources next to PNGs",
    )
    args = parser.parse_args()

    dot_bin = require_dot()
    print(f"Rendering {len(GENERATORS)} diagrams → {args.out}")

    for name, factory in GENERATORS.items():
        source = factory()
        if args.keep_dot:
            dot_path = args.out / f"{name}.dot"
            dot_path.parent.mkdir(parents=True, exist_ok=True)
            dot_path.write_text(source, encoding="utf-8")
        render(dot_bin, source, args.out / f"{name}.png")

    print("Done.")


if __name__ == "__main__":
    main()
