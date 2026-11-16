#!/usr/bin/env python3
"""
Generuje finalne diagramy dokumentacji Courser (PNG).

Wymaga Graphviz CLI (`dot`) w PATH:
  macOS:  brew install graphviz
  Ubuntu: sudo apt install graphviz
oraz Pillow (ikony): pip install pillow

Użycie:
  python3 generate.py
  python3 generate.py --out ./out
"""

from __future__ import annotations

import argparse
import functools
import shutil
import subprocess
import sys
from pathlib import Path

# Wspólna paleta — te same kolory / style we wszystkich diagramach.
C = {
    "bg": "#F7F8FA",
    "ink": "#111827",
    "muted": "#6B7280",
    "line": "#9CA3AF",
    "card": "#FFFFFF",
    "border": "#D1D5DB",
    "cluster": "#E5E7EB",
    "navy": "#1F2937",
    "teal": "#0F766E",
    "teal_bg": "#ECFDF5",
    "blue": "#1D4ED8",
    "blue_bg": "#EFF6FF",
    "amber": "#B45309",
    "amber_bg": "#FFFBEB",
    "brown": "#9A3412",
    "brown_bg": "#FFF7ED",
    "violet": "#5B21B6",
    "violet_bg": "#F5F3FF",
    "slate": "#475569",
    "slate_bg": "#F1F5F9",
    "red": "#B91C1C",
    "red_bg": "#FEF2F2",
}

# Wspólne atrybuty grafu (spójna „objętość” i odstępy).
GRAPH_BASE = {
    "bgcolor": C["bg"],
    "fontname": "Helvetica",
    "fontsize": "20",
    "labelloc": "t",
    "pad": "0.6",
    "ranksep": "1.15",
    "nodesep": "0.75",
}


def require_dot() -> str:
    path = shutil.which("dot")
    if not path:
        print("ERROR: nie znaleziono Graphviz `dot` w PATH.", file=sys.stderr)
        print("Instalacja: brew install graphviz  |  sudo apt install graphviz", file=sys.stderr)
        sys.exit(1)
    return path


def render(dot_bin: str, source: str, output: Path, *, engine: str = "dot") -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    cmd = [dot_bin, f"-K{engine}", "-Tpng", "-Gdpi=180", f"-o{output}"]
    result = subprocess.run(
        cmd,
        input=source.encode("utf-8"),
        capture_output=True,
    )
    if result.returncode != 0:
        print(result.stderr.decode("utf-8", errors="replace"), file=sys.stderr)
        raise RuntimeError(f"Nie udało się wyrenderować {output.name}")
    print(f"  ✓ {output}")


def graph_attrs(**extra: str) -> str:
    attrs = {**GRAPH_BASE, **extra}
    return ",\n    ".join(f'{k}="{v}"' for k, v in attrs.items())


def html_lines(text: str) -> str:
    """HTML labels ignore \\n — use <BR/> instead."""
    return text.replace("\\n", "\n").replace("\n", "<BR/>")


def box(
    name: str,
    title: str,
    subtitle: str,
    *,
    fill: str,
    border: str,
    width: float = 2.6,
    title_color: str | None = None,
) -> str:
    """Jednolity kafelek komponentu."""
    title_color = title_color or C["ink"]
    return f'''{name} [
      shape=plaintext
      label=<
        <TABLE BORDER="0" CELLBORDER="2" CELLSPACING="0" CELLPADDING="14"
               COLOR="{border}" BGCOLOR="{fill}" WIDTH="{int(width * 72)}">
          <TR><TD ALIGN="CENTER"><FONT COLOR="{title_color}" POINT-SIZE="13"><B>{html_lines(title)}</B></FONT></TD></TR>
          <TR><TD ALIGN="CENTER" BGCOLOR="{C["card"]}">
            <FONT COLOR="{C["muted"]}" POINT-SIZE="11">{html_lines(subtitle)}</FONT>
          </TD></TR>
        </TABLE>
      >
    ];'''


def flow_step(name: str, title: str, detail: str, *, fill: str, border: str) -> str:
    return f'''{name} [
      shape=plaintext
      label=<
        <TABLE BORDER="0" CELLBORDER="2" CELLSPACING="0" CELLPADDING="12"
               COLOR="{border}" BGCOLOR="{fill}">
          <TR><TD ALIGN="LEFT"><FONT COLOR="{C["ink"]}" POINT-SIZE="12"><B>{html_lines(title)}</B></FONT></TD></TR>
          <TR><TD ALIGN="LEFT" BGCOLOR="{C["card"]}">
            <FONT COLOR="{C["muted"]}" POINT-SIZE="10">{html_lines(detail)}</FONT>
          </TD></TR>
        </TABLE>
      >
    ];'''


def rule_card(name: str, text: str) -> str:
    return f'''{name} [
      shape=plaintext
      label=<
        <TABLE BORDER="0" CELLBORDER="2" CELLSPACING="0" CELLPADDING="11"
               COLOR="{C["border"]}" BGCOLOR="{C["card"]}">
          <TR><TD ALIGN="LEFT"><FONT COLOR="{C["ink"]}" POINT-SIZE="11">{html_lines(text)}</FONT></TD></TR>
        </TABLE>
      >
    ];'''


def actor_node(name: str, label: str) -> str:
    """Klasyczny aktor UML (piktogram + podpis)."""
    return f'''{name} [
      shape=plaintext
      label=<
        <TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="2">
          <TR><TD ALIGN="CENTER"><FONT POINT-SIZE="28" COLOR="{C["navy"]}">●</FONT></TD></TR>
          <TR><TD ALIGN="CENTER"><FONT POINT-SIZE="14" COLOR="{C["navy"]}">╱│╲</FONT></TD></TR>
          <TR><TD ALIGN="CENTER"><FONT POINT-SIZE="14" COLOR="{C["navy"]}">│</FONT></TD></TR>
          <TR><TD ALIGN="CENTER"><FONT POINT-SIZE="14" COLOR="{C["navy"]}">╱ ╲</FONT></TD></TR>
          <TR><TD ALIGN="CENTER"><FONT POINT-SIZE="11" COLOR="{C["ink"]}"><B>{html_lines(label)}</B></FONT></TD></TR>
        </TABLE>
      >
    ];'''


def use_case(name: str, label: str, *, color: str | None = None) -> str:
    stroke = color or C["teal"]
    return (
        f'{name} [label=<{html_lines(label)}>, shape=ellipse, style="filled", '
        f'fillcolor="{C["card"]}", color="{stroke}", fontcolor="{C["ink"]}", '
        f'fontname="Helvetica", fontsize=11, margin="0.15,0.1"];'
    )


def _port(raw: str) -> str:
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in raw.strip().lower())
    return cleaned.strip("_") or "col"


def table(
    name: str,
    title: str,
    rows: list[tuple[str, str]],
    *,
    header: str | None = None,
) -> str:
    header = header or C["navy"]
    body_rows: list[str] = []
    for col, typ in rows:
        port = _port(col.split()[0] if col else "col")
        body_rows.append(
            f'<TR><TD ALIGN="LEFT" PORT="{port}" BGCOLOR="{C["card"]}">'
            f'<FONT COLOR="{C["ink"]}">{col}</FONT></TD>'
            f'<TD ALIGN="LEFT" BGCOLOR="{C["card"]}">'
            f'<FONT COLOR="{C["muted"]}">{typ}</FONT></TD></TR>'
        )
    body = "\n".join(body_rows)
    return f'''{name} [label=<
<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="6" COLOR="{C["border"]}" BGCOLOR="{C["card"]}">
  <TR><TD COLSPAN="2" BGCOLOR="{header}" PORT="title"><FONT COLOR="white"><B>{title}</B></FONT></TD></TR>
  {body}
</TABLE>>];'''



# ---------------------------------------------------------------------------
# Ikony (rysowane Pillow → PNG; osadzane w etykietach HTML przez <IMG>)
# ---------------------------------------------------------------------------

ICON_DIR = Path(__file__).resolve().parent / "icons"

# Rodzaj klasyfikatora UML -> (litera w kółku, kolor) — jak w IDE / PlantUML.
UML_KINDS = {
    "entity": ("C", "#16A34A"),
    "enumeration": ("E", "#D97706"),
    "record": ("R", "#7C3AED"),
    "service": ("S", "#334155"),
}


def _hex(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


@functools.cache
def make_icons() -> dict[str, str]:
    """Rysuje płaskie ikony (biały glif na kolorowym zaokrąglonym kwadracie)."""
    from PIL import Image, ImageDraw, ImageFont

    ICON_DIR.mkdir(parents=True, exist_ok=True)
    S, W = 256, (255, 255, 255, 255)

    def base(accent: str):
        img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((8, 8, S - 8, S - 8), radius=60, fill=_hex(accent) + (255,))
        return img, d, _hex(accent) + (255,)

    def database(d, a):
        d.rectangle((70, 76, 186, 180), fill=W)
        d.ellipse((70, 154, 186, 206), fill=W)
        d.ellipse((70, 50, 186, 102), fill=W)
        d.arc((70, 50, 186, 102), 0, 180, fill=a, width=8)
        d.arc((70, 92, 186, 144), 0, 180, fill=a, width=8)
        d.arc((70, 128, 186, 180), 0, 180, fill=a, width=8)

    def volume(d, a):
        d.rounded_rectangle((50, 78, 206, 178), radius=22, fill=W)
        d.line((50, 128, 206, 128), fill=a, width=8)
        d.ellipse((164, 142, 182, 160), fill=a)
        d.ellipse((164, 96, 182, 114), fill=a)
        d.line((74, 105, 140, 105), fill=a, width=8)
        d.line((74, 151, 140, 151), fill=a, width=8)

    def migration(d, a):
        d.rounded_rectangle((70, 40, 186, 216), radius=14, fill=W)
        for y in (76, 102, 128):
            d.line((94, y, 162, y), fill=a, width=9)
        d.line((128, 150, 128, 192), fill=a, width=10)
        d.polygon([(108, 176), (148, 176), (128, 200)], fill=a)

    def server(d, a):
        for top in (46, 104, 162):
            d.rounded_rectangle((52, top, 204, top + 48), radius=12, fill=W)
            d.ellipse((70, top + 16, 86, top + 32), fill=a)
            d.line((112, top + 24, 182, top + 24), fill=a, width=8)

    def image(d, a):
        d.rounded_rectangle((46, 62, 210, 194), radius=14, fill=W)
        d.polygon([(64, 178), (110, 116), (142, 156), (166, 130), (194, 178)], fill=a)
        d.ellipse((156, 82, 182, 108), fill=a)

    def shield(d, a):
        d.polygon([(128, 38), (204, 64), (200, 136), (128, 218), (56, 136), (52, 64)], fill=W)
        d.ellipse((110, 92, 146, 128), fill=a)
        d.rectangle((120, 118, 136, 164), fill=a)

    def window(d, a):
        d.rounded_rectangle((42, 56, 214, 200), radius=16, fill=W)
        d.line((42, 94, 214, 94), fill=a, width=8)
        for x in (66, 88, 110):
            d.ellipse((x - 7, 69, x + 7, 83), fill=a)
        d.line([(112, 120), (84, 146), (112, 172)], fill=a, width=10, joint="curve")
        d.line([(144, 120), (172, 146), (144, 172)], fill=a, width=10, joint="curve")

    def globe(d, a):
        d.ellipse((48, 48, 208, 208), outline=W, width=14)
        d.ellipse((98, 48, 158, 208), outline=W, width=10)
        d.line((48, 128, 208, 128), fill=W, width=10)
        d.arc((60, 70, 196, 110), 180, 360, fill=W, width=8)
        d.arc((60, 146, 196, 186), 0, 180, fill=W, width=8)

    spec = {
        "database": (database, C["navy"]),
        "volume_pg": (volume, C["navy"]),
        "volume_media": (volume, C["violet"]),
        "migration": (migration, C["slate"]),
        "server_user": (server, C["blue"]),
        "server_quiz": (server, C["teal"]),
        "image": (image, C["violet"]),
        "shield": (shield, C["amber"]),
        "window": (window, C["red"]),
        "globe": (globe, C["ink"]),
    }
    paths: dict[str, str] = {}
    for name, (draw, accent) in spec.items():
        img, d, a = base(accent)
        draw(d, a)
        out = ICON_DIR / f"{name}.png"
        img.resize((128, 128), Image.LANCZOS).save(out, dpi=(72, 72))
        paths[name] = str(out)

    for name, accent in (("table_teal", C["teal"]), ("table_brown", C["brown"]),
                         ("table_amber", C["amber"]), ("table_blue", C["blue"]),
                         ("table_navy", C["navy"])):
        img, d, a = base(accent)
        d.rounded_rectangle((44, 58, 212, 198), radius=14, fill=W)
        d.rectangle((44, 92, 212, 100), fill=a)
        for y in (130, 162):
            d.line((44, y, 212, y), fill=a, width=6)
        d.line((112, 100, 112, 198), fill=a, width=6)
        out = ICON_DIR / f"{name}.png"
        img.resize((128, 128), Image.LANCZOS).save(out, dpi=(72, 72))
        paths[name] = str(out)

    font = None
    for candidate, index in (("/System/Library/Fonts/Helvetica.ttc", 1),
                             ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 0)):
        try:
            font = ImageFont.truetype(candidate, 150, index=index)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default(size=150)
    for letter, accent in UML_KINDS.values():
        img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.ellipse((12, 12, S - 12, S - 12), fill=_hex(accent) + (255,))
        d.text((S / 2, S / 2 + 4), letter, fill=W, font=font, anchor="mm")
        out = ICON_DIR / f"kind_{letter}.png"
        img.resize((128, 128), Image.LANCZOS).save(out, dpi=(72, 72))
        paths[f"kind_{letter}"] = str(out)
    return paths


@functools.cache
def legend_glyph(kind: str) -> str:
    """Próbka linii do legendy (notacja ER / UML), rysowana Pillow."""
    from PIL import Image, ImageDraw

    ICON_DIR.mkdir(parents=True, exist_ok=True)
    k = 4
    w, h, mid = 120 * k, 24 * k, 12 * k
    color, line_style, left, right = {
        "er_one_many": (C["ink"], "solid", "one", "many"),
        "er_opt_many": (C["ink"], "solid", "opt", "many"),
        "cascade": (C["ink"], "solid", None, None),
        "set_null": (C["ink"], "dashed", None, None),
        "no_action": (C["ink"], "dotted", None, None),
        "composition": (C["slate"], "solid", "diamond", None),
        "association": (C["slate"], "solid", None, "vee"),
        "dependency": (C["slate"], "dashed", None, "vee"),
        "id_ref": (C["line"], "dashed", None, "vee"),
    }[kind]
    rgb = _hex(color) + (255,)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    lw = 2 * k
    x0, x1 = 6 * k, w - 6 * k
    if line_style == "solid":
        d.line((x0, mid, x1, mid), fill=rgb, width=lw)
    else:
        dash, gap = (10 * k, 6 * k) if line_style == "dashed" else (2 * k, 5 * k)
        x = x0
        while x < x1:
            d.line((x, mid, min(x + dash, x1), mid), fill=rgb, width=lw)
            x += dash + gap
    r = 4 * k
    if left == "one":
        for x in (x0 + 4 * k, x0 + 9 * k):
            d.line((x, mid - 7 * k, x, mid + 7 * k), fill=rgb, width=lw)
    if left == "opt":
        d.line((x0 + 4 * k, mid - 7 * k, x0 + 4 * k, mid + 7 * k), fill=rgb, width=lw)
        d.ellipse((x0 + 9 * k, mid - r, x0 + 9 * k + 2 * r, mid + r), fill=(255, 255, 255, 255), outline=rgb, width=lw)
    if left == "diamond":
        d.polygon([(x0, mid), (x0 + 9 * k, mid - 6 * k), (x0 + 18 * k, mid), (x0 + 9 * k, mid + 6 * k)], fill=rgb)
    if right == "many":
        tip = x1
        for dy in (-8 * k, 0, 8 * k):
            d.line((tip - 12 * k, mid, tip, mid + dy), fill=rgb, width=lw)
        d.ellipse((tip - 22 * k, mid - r, tip - 22 * k + 2 * r, mid + r), fill=(255, 255, 255, 255), outline=rgb, width=lw)
    if right == "vee":
        d.line((x1 - 10 * k, mid - 6 * k, x1, mid), fill=rgb, width=lw)
        d.line((x1 - 10 * k, mid + 6 * k, x1, mid), fill=rgb, width=lw)
    out = ICON_DIR / f"legend_{kind}.png"
    img.resize((w // k * 2, h // k * 2), Image.LANCZOS).save(out, dpi=(72, 72))
    return str(out)


def legend_card(name: str, rows: list[tuple[str, str]], *, extra_rows: str = "") -> str:
    body = "".join(
        f'<TR><TD WIDTH="60" HEIGHT="12" FIXEDSIZE="TRUE"><IMG SRC="{legend_glyph(kind)}" SCALE="TRUE"/></TD>'
        f'<TD ALIGN="LEFT"><FONT POINT-SIZE="10" COLOR="{C["ink"]}">{text}</FONT></TD></TR>'
        for kind, text in rows
    )
    return f'''{name} [shape=plaintext, label=<
<TABLE BORDER="1" STYLE="rounded" COLOR="{C["border"]}" CELLBORDER="0" CELLSPACING="4" CELLPADDING="2" BGCOLOR="{C["card"]}">
  <TR><TD COLSPAN="2" ALIGN="LEFT"><FONT POINT-SIZE="11" COLOR="{C["muted"]}"><B>LEGENDA</B></FONT></TD></TR>
  {body}
  {extra_rows}
</TABLE>>];'''


def arch_card(
    name: str,
    icon: str,
    title: str,
    subtitle: str,
    lines: list[str],
    *,
    accent: str,
    tint: str,
    badge: str = "",
    width: int = 250,
) -> str:
    """Nowoczesny kafelek: ikona w rogu, tytuł, obraz Dockera, plakietka portu, lista cech."""
    badge_html = (
        f'<TD ALIGN="RIGHT" VALIGN="TOP">'
        f'<TABLE BORDER="0" CELLBORDER="0" CELLPADDING="3" CELLSPACING="0" BGCOLOR="{accent}" STYLE="rounded">'
        f'<TR><TD><FONT COLOR="white" POINT-SIZE="9"><B> {badge} </B></FONT></TD></TR></TABLE></TD>'
        if badge else '<TD></TD>'
    )
    body = "".join(
        f'<TR><TD ALIGN="LEFT" CELLPADDING="1"><FONT POINT-SIZE="10" COLOR="{C["ink"]}">'
        f'<FONT COLOR="{accent}">●</FONT>  {line}</FONT></TD></TR>'
        for line in lines
    )
    return f'''{name} [
      shape=plaintext
      label=<
        <TABLE BORDER="1" STYLE="rounded" COLOR="{accent}" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0" BGCOLOR="{C["card"]}" WIDTH="{width}">
          <TR><TD BGCOLOR="{tint}" CELLPADDING="9" ALIGN="LEFT">
            <TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0">
              <TR>
                <TD WIDTH="30" HEIGHT="30" FIXEDSIZE="TRUE"><IMG SRC="{icon}" SCALE="TRUE"/></TD>
                <TD WIDTH="9"></TD>
                <TD ALIGN="LEFT" BALIGN="LEFT">
                  <FONT POINT-SIZE="13" COLOR="{C["ink"]}"><B>{title}</B></FONT><BR/>
                  <FONT POINT-SIZE="9" COLOR="{C["muted"]}">{subtitle}</FONT>
                </TD>
                <TD WIDTH="12"></TD>
                {badge_html}
              </TR>
            </TABLE>
          </TD></TR>
          <TR><TD HEIGHT="3" BGCOLOR="{accent}"></TD></TR>
          <TR><TD CELLPADDING="9" ALIGN="LEFT">
            <TABLE BORDER="0" CELLBORDER="0" CELLSPACING="1" CELLPADDING="0">{body}</TABLE>
          </TD></TR>
        </TABLE>
      >
    ];'''


def pill(text: str, color: str) -> str:
    """Etykieta krawędzi w kształcie „pigułki”."""
    return (
        f'<<TABLE BORDER="1" COLOR="{color}" STYLE="rounded" CELLBORDER="0" CELLPADDING="3" '
        f'CELLSPACING="0" BGCOLOR="{C["card"]}"><TR><TD>'
        f'<FONT POINT-SIZE="9" COLOR="{color}"><B>{html_lines(text)}</B></FONT></TD></TR></TABLE>>'
    )


# ---------------------------------------------------------------------------
# 1. Architektura systemu
# ---------------------------------------------------------------------------

def system_architecture() -> str:
    # Zgodne z docker-compose.yml, frontend/nginx.conf, gateway application.yml, media/nginx.conf.
    # Odczyt danych płynie w dół: baza/wolumeny → serwisy → gateway / nginx → przeglądarka.
    ic = make_icons()

    def layer(name: str, title: str, body: str) -> str:
        return f'''
  subgraph cluster_{name} {{
    label=<<FONT POINT-SIZE="11" COLOR="{C["muted"]}"><B>{title}</B></FONT>>;
    labeljust="l";
    color="{C["border"]}";
    style="rounded,dashed";
    penwidth=1.2;
    bgcolor="#FBFCFD";
    margin=22;
{body}
  }}'''

    data = layer("data", "WARSTWA DANYCH", f'''
    {arch_card("liquibase", ic["migration"], "Liquibase", "liquibase/liquibase:4.33.0",
               ["changelog SQL + kontekst seed", "uruchamiany raz przed serwisami"],
               accent=C["slate"], tint=C["slate_bg"], badge="jednorazowo")}
    {arch_card("pgdata", ic["volume_pg"], "Wolumen bazy", "courser-postgres-data",
               ["/var/lib/postgresql/data"],
               accent=C["navy"], tint=C["slate_bg"], width=210)}
    {arch_card("postgres", ic["database"], "PostgreSQL 16", "postgres:16 · courserdb",
               ["quizy · ranking · użytkownicy", "sesje odświeżania · statystyki"],
               accent=C["navy"], tint=C["slate_bg"], badge="5433→5432")}
    {arch_card("mediavol", ic["volume_media"], "Wolumen mediów", "courser-media-data",
               ["pliki &lt;sha256&gt;.&lt;ext&gt;", "JPEG · PNG · GIF · WebP · BMP"],
               accent=C["violet"], tint=C["violet_bg"], width=230)}
    {{ rank=same; pgdata; postgres; mediavol }}
    pgdata -> postgres -> mediavol [style=invis];''')

    app = layer("app", "WARSTWA APLIKACJI", f'''
    {arch_card("user", ic["server_user"], "user-service", "Spring Boot · Spring Security",
               ["rejestracja · logowanie · JWT", "refresh cookie · statystyki"],
               accent=C["blue"], tint=C["blue_bg"], badge=":8082")}
    {arch_card("quiz", ic["server_quiz"], "quiz-service", "Spring Boot · JPA",
               ["quizy · udostępnianie · ranking", "zapis obrazów (SHA-256)"],
               accent=C["teal"], tint=C["teal_bg"], badge=":8081")}
    {arch_card("media", ic["image"], "media", "nginx:1.27-alpine",
               ["statyczne /&lt;hash&gt;.&lt;ext&gt;", "Cache-Control: immutable"],
               accent=C["violet"], tint=C["violet_bg"], badge=":80")}
    {{ rank=same; user; quiz; media }}
    user -> quiz -> media [style=invis];''')

    edge = layer("edge", "WARSTWA WEJŚCIA", f'''
    {arch_card("gateway", ic["shield"], "API Gateway", "Spring Cloud Gateway",
               ["weryfikacja JWT → X-User-Id", "CORS · StripPrefix /api"],
               accent=C["amber"], tint=C["amber_bg"], badge="8080")}
    {arch_card("frontend", ic["window"], "frontend", "nginx + Angular SPA",
               ["/api/** → gateway:8080", "/media/** → media:80", "client_max_body_size 30m"],
               accent=C["red"], tint=C["red_bg"], badge="4200→80")}''')

    client = layer("client", "KLIENT", f'''
    {arch_card("browser", ic["globe"], "Przeglądarka", "Angular SPA",
               ["access JWT + refresh cookie (HttpOnly)", "quizy gościa w localStorage"],
               accent=C["ink"], tint=C["slate_bg"])}''')

    e = lambda text, color: f'label={pill(text, color)}, color="{color}"'

    return f'''
digraph SystemArchitecture {{
  graph [
    {graph_attrs(
ranksep="0.75",
        nodesep="0.6",
        splines="spline",
        pad="0.5",
        newrank="true",
    )},
    label=<<FONT POINT-SIZE="20" COLOR="{C["ink"]}"><B>Courser — architektura systemu</B></FONT><BR/><FONT POINT-SIZE="11" COLOR="{C["muted"]}">docker compose · dane spływają z góry na dół</FONT>>
  ];
  node [fontname="Helvetica"];
  edge [fontname="Helvetica", fontsize=9, color="{C["line"]}", penwidth=2, arrowsize=0.8];
{data}
{app}
{edge}
{client}

  // Kolejność warstw (z góry na dół)
  {{ rank=min; liquibase }}
  {{ rank=max; browser }}

  liquibase -> postgres [{e("migracje · seed", C["slate"])}];
  pgdata -> postgres [dir=none, style=dotted, constraint=false, color="{C["navy"]}"];

  postgres -> user [{e("JDBC", C["blue"])}];
  postgres -> quiz [{e("JDBC", C["teal"])}];
  mediavol -> media [{e("odczyt plików", C["violet"])}];
  quiz -> mediavol [style=dashed, constraint=false, {e("zapis uploadu", C["violet"])}];

  user -> gateway [{e("/users/**", C["amber"])}];
  quiz -> gateway [{e("/quizzes/**", C["amber"])}];

  gateway -> frontend [{e("/api/**", C["red"])}];
  media -> frontend [{e("/media/**", C["red"])}];
  frontend -> browser [penwidth=2.6, {e("HTTP :4200 · SPA · API · obrazy", C["ink"])}];
}}
'''


# ---------------------------------------------------------------------------
# 2. Schemat bazy (stan po wszystkich migracjach Liquibase; notacja „kurzej stopki”)
# ---------------------------------------------------------------------------

_KEY_STYLE = {
    "PK": ("#92400E", "#FEF3C7"),
    "FK": ("#1E40AF", "#DBEAFE"),
    "UQ": ("#115E59", "#CCFBF1"),
}


def _key_badges(keys: str) -> str:
    if not keys:
        return ""
    cells = "".join(
        f'<TD BGCOLOR="{_KEY_STYLE[k][1]}" STYLE="rounded" CELLPADDING="2">'
        f'<FONT POINT-SIZE="7" COLOR="{_KEY_STYLE[k][0]}"><B>{k}</B></FONT></TD>'
        for k in keys.split()
    )
    return f'<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="2" CELLPADDING="0"><TR>{cells}</TR></TABLE>'


def er_table(
    name: str,
    title: str,
    cols: list[tuple[str, str, str, bool]],
    *,
    accent: str,
    tint: str,
    icon: str,
    notes: list[str] | None = None,
) -> str:
    """Tabela ER: (klucze, kolumna, typ, NOT NULL). Porty: <kolumna>_w (wejście FK), <kolumna>_e (wyjście PK)."""
    rows = []
    for i, (keys, col, typ, not_null) in enumerate(cols):
        bg = C["card"] if i % 2 == 0 else "#F9FAFB"
        weight = ("<B>", "</B>") if "PK" in keys else ("", "")
        nn = f'<FONT POINT-SIZE="7" COLOR="{C["line"]}">NN</FONT>' if not_null else ""
        rows.append(
            f'<TR>'
            f'<TD PORT="{col}_w" BGCOLOR="{bg}" ALIGN="LEFT" WIDTH="44">{_key_badges(keys)}</TD>'
            f'<TD BGCOLOR="{bg}" ALIGN="LEFT"><FONT POINT-SIZE="10" COLOR="{C["ink"]}">{weight[0]}{col}{weight[1]}</FONT></TD>'
            f'<TD BGCOLOR="{bg}" ALIGN="LEFT"><FONT POINT-SIZE="9" COLOR="{C["muted"]}">{typ}</FONT></TD>'
            f'<TD PORT="{col}_e" BGCOLOR="{bg}" ALIGN="RIGHT">{nn}</TD>'
            f'</TR>'
        )
    footer = ""
    if notes:
        lines = "".join(
            f'<TR><TD ALIGN="LEFT"><FONT POINT-SIZE="8" COLOR="{C["muted"]}"><I>{n}</I></FONT></TD></TR>'
            for n in notes
        )
        footer = (
            f'<TR><TD COLSPAN="4" HEIGHT="1" BGCOLOR="{C["border"]}" CELLPADDING="0"></TD></TR>'
            f'<TR><TD COLSPAN="4" ALIGN="LEFT" CELLPADDING="5">'
            f'<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="1">{lines}</TABLE></TD></TR>'
        )
    return f'''{name} [label=<
<TABLE BORDER="1" STYLE="rounded" COLOR="{accent}" CELLBORDER="0" CELLSPACING="0" CELLPADDING="4" BGCOLOR="{C["card"]}">
  <TR><TD COLSPAN="4" BGCOLOR="{tint}" CELLPADDING="7" ALIGN="LEFT">
    <TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0"><TR>
      <TD WIDTH="20" HEIGHT="20" FIXEDSIZE="TRUE"><IMG SRC="{icon}" SCALE="TRUE"/></TD>
      <TD WIDTH="7"></TD>
      <TD ALIGN="LEFT"><FONT POINT-SIZE="12" COLOR="{C["ink"]}"><B>{title}</B></FONT></TD>
    </TR></TABLE>
  </TD></TR>
  <TR><TD COLSPAN="4" HEIGHT="2" BGCOLOR="{accent}" CELLPADDING="0"></TD></TR>
  {"".join(rows)}
  {footer}
</TABLE>>];'''


_ON_DELETE_STYLE = {"CASCADE": "solid", "SET NULL": "dashed", "NO ACTION": "dotted"}
# concentrate=true scala tylko krawędzie o tym samym porcie — osobny port na styl
# zapobiega wspólnym odcinkom linii ciągłej i kropkowanej.
_ON_DELETE_PORT = {"CASCADE": "e", "SET NULL": "ne", "NO ACTION": "se"}


def fk_edge(parent: str, child: str, col: str, *, color: str, on_delete: str, nullable: bool = False) -> str:
    return (
        f'{parent}:id_e:{_ON_DELETE_PORT[on_delete]} -> {child}:{col}_w:w [dir=both, '
        f'arrowtail={"teeodot" if nullable else "teetee"}, arrowhead=crowodot, '
        f'style={_ON_DELETE_STYLE[on_delete]}, color="{color}"];'
    )


def domain_cluster(name: str, title: str, color: str, tint: str, body: str) -> str:
    return f'''subgraph cluster_{name} {{
    label=<<FONT POINT-SIZE="11" COLOR="{color}"><B>{title}</B></FONT>>;
    labeljust=l; style="rounded,dashed"; color="{color}"; bgcolor="{tint}"; penwidth=1.2; margin=14;
    {body}
  }}'''


def database_schema() -> str:
    ic = make_icons()
    T = lambda key, color, tint: dict(accent=C[color], tint=C[tint], icon=ic[f"table_{key}"])  # noqa: E731

    users = er_table("users", "users", [
        ("PK", "id", "BIGINT IDENTITY", True),
        ("UQ", "username", "VARCHAR(255)", True),
        ("UQ", "email", "VARCHAR(255)", True),
        ("", "password", "VARCHAR(255) · BCrypt", True),
        ("", "role", "STUDENT | TEACHER | ADMIN", True),
        ("", "accent_color", "VARCHAR(16) = 'coral'", True),
        ("", "quizzes_completed", "INTEGER", False),
        ("", "total_score", "INTEGER", False),
        ("", "created_at", "TIMESTAMP", False),
        ("", "last_login", "TIMESTAMP", False),
    ], **T("blue", "blue", "blue_bg"))

    refresh = er_table("refresh", "refresh_sessions", [
        ("PK", "id", "UUID", True),
        ("FK", "user_id", "BIGINT", True),
        ("UQ", "token_hash", "VARCHAR(64) · SHA-256", True),
        ("", "created_at", "TIMESTAMP", True),
        ("", "last_used_at", "TIMESTAMP", True),
        ("", "expires_at", "TIMESTAMP", True),
    ], notes=["IDX (expires_at)"], **T("blue", "blue", "blue_bg"))

    results = er_table("results", "quiz_results", [
        ("PK", "id", "BIGINT IDENTITY", True),
        ("FK", "user_id", "BIGINT", True),
        ("FK", "quiz_id", "BIGINT", True),
        ("", "score", "INTEGER", True),
        ("", "max_score", "INTEGER", True),
        ("", "completed_at", "TIMESTAMP", True),
    ], **T("navy", "navy", "slate_bg"))

    completed = er_table("completed", "quiz_completed_attempts", [
        ("PK", "id", "BIGINT IDENTITY", True),
        ("FK", "quiz_id", "BIGINT", True),
        ("FK", "user_id", "BIGINT", True),
        ("", "completed_at", "TIMESTAMP", True),
    ], notes=["IDX (user_id, quiz_id)"], **T("navy", "navy", "slate_bg"))

    daily = er_table("daily", "user_daily_statistics", [
        ("PK FK", "user_id", "BIGINT", True),
        ("PK", "activity_date", "DATE", True),
        ("", "completed_quizzes", "BIGINT = 0", True),
        ("", "checked_questions", "BIGINT = 0", True),
        ("", "effectiveness_sum", "BIGINT = 0", True),
        ("", "effectiveness_count", "BIGINT = 0", True),
    ], **T("navy", "navy", "slate_bg"))

    summary = er_table("summary", "user_quiz_summary", [
        ("PK FK", "user_id", "BIGINT", True),
        ("PK FK", "quiz_id", "BIGINT", True),
        ("", "completed_count", "BIGINT = 0", True),
        ("", "best_score", "INTEGER", False),
        ("", "best_max_score", "INTEGER", False),
    ], **T("navy", "navy", "slate_bg"))

    retry = er_table("retry", "user_statistics_retry_keys", [
        ("PK FK", "user_id", "BIGINT", True),
        ("PK", "request_id", "UUID", True),
        ("", "created_at", "TIMESTAMPTZ", True),
    ], notes=["IDX (created_at) · usuwane po 7 dniach"], **T("navy", "navy", "slate_bg"))

    quizzes = er_table("quizzes", "quizzes", [
        ("PK", "id", "BIGINT IDENTITY", True),
        ("", "title", "VARCHAR(255)", False),
        ("FK", "owner_user_id", "BIGINT", False),
        ("FK", "ranking_version_id", "UUID", False),
        ("", "scoring_mode", "DEFAULT | CUSTOM", True),
        ("", "allow_negative_score", "BOOLEAN = false", True),
        ("", "points_per_correct", "DOUBLE ≥ 0", True),
        ("", "incorrect_penalty", "DOUBLE ≥ 0", True),
        ("", "penalty_mode", "FRACTION | POINTS | PERCENT", True),
        ("", "random_question_order", "BOOLEAN = false", True),
        ("", "show_correct_answers", "BOOLEAN = true", True),
    ], **T("teal", "teal", "teal_bg"))

    questions = er_table("questions", "questions", [
        ("PK", "id", "BIGINT IDENTITY", True),
        ("FK", "quiz_id", "BIGINT", True),
        ("", "content", "TEXT", False),
        ("", "image_key", "VARCHAR(160)", False),
        ("", "image_filename", "VARCHAR(255)", False),
        ("", "question_order", "INTEGER", False),
    ], notes=["question_order: kolumna historyczna, JPA sortuje po id"], **T("teal", "teal", "teal_bg"))

    answers = er_table("answers", "answers", [
        ("PK", "id", "BIGINT IDENTITY", True),
        ("FK", "question_id", "BIGINT", True),
        ("", "content", "TEXT", False),
        ("", "correct", "BOOLEAN", True),
        ("", "points", "DOUBLE", False),
        ("", "answer_order", "INTEGER", False),
    ], notes=["answer_order: kolumna historyczna, JPA sortuje po id"], **T("teal", "teal", "teal_bg"))

    share = er_table("share", "quiz_share_codes", [
        ("PK", "id", "BIGINT IDENTITY", True),
        ("UQ", "code", "VARCHAR(10)", True),
        ("", "active", "BOOLEAN", True),
        ("FK", "quiz_id", "BIGINT", False),
        ("FK", "ranking_version_id", "UUID", False),
        ("FK", "created_by_user_id", "BIGINT", True),
        ("", "created_at", "TIMESTAMP", True),
        ("", "expires_at", "TIMESTAMP", False),
    ], **T("amber", "amber", "amber_bg"))

    versions = er_table("versions", "quiz_ranking_versions", [
        ("PK", "id", "UUID", True),
        ("", "snapshot_json", "TEXT", True),
        ("", "content_hash", "VARCHAR(64) · SHA-256", True),
        ("", "has_logged_import", "BOOLEAN = false", True),
        ("", "created_at", "TIMESTAMP = now()", True),
    ], **T("brown", "brown", "brown_bg"))

    attempts = er_table("attempts", "quiz_ranking_attempts", [
        ("PK", "id", "UUID", True),
        ("FK", "ranking_version_id", "UUID", True),
        ("FK", "user_id", "BIGINT", True),
        ("", "client_session_id", "UUID", True),
        ("", "started_at", "TIMESTAMP", True),
        ("", "completed_at", "TIMESTAMP", False),
        ("", "status", "VARCHAR(16): STARTED | FINISHED", True),
        ("", "score_scaled", "INTEGER", False),
        ("", "max_score_scaled", "INTEGER", False),
        ("", "duration_ms", "BIGINT", False),
        ("", "position", "INTEGER", False),
        ("", "outside_top_five", "BOOLEAN", False),
    ], notes=["UQ (ranking_version_id, user_id, client_session_id)"], **T("brown", "brown", "brown_bg"))

    entries = er_table("entries", "quiz_ranking_entries", [
        ("PK", "id", "BIGINT IDENTITY", True),
        ("FK", "ranking_version_id", "UUID", True),
        ("FK", "user_id", "BIGINT", True),
        ("", "score_scaled", "INTEGER", True),
        ("", "max_score_scaled", "INTEGER", True),
        ("", "duration_ms", "BIGINT", True),
        ("", "completed_at", "TIMESTAMP", True),
    ], notes=["UQ (ranking_version_id, user_id) · top 5 na wersję"], **T("brown", "brown", "brown_bg"))

    key_rows = "".join(
        f'<TR><TD ALIGN="CENTER">{badge}</TD><TD ALIGN="LEFT"><FONT POINT-SIZE="10" COLOR="{C["ink"]}">{text}</FONT></TD></TR>'
        for badge, text in (
            (_key_badges("PK"), "klucz główny"),
            (_key_badges("FK"), "klucz obcy"),
            (_key_badges("UQ"), "wartość unikalna"),
            (f'<FONT POINT-SIZE="8" COLOR="{C["line"]}">NN</FONT>', "NOT NULL"),
        )
    )
    legend = legend_card("legend", [
        ("er_one_many", "1 — 0..*  (FK NOT NULL)"),
        ("er_opt_many", "0..1 — 0..*  (FK nullable)"),
        ("cascade", "ON DELETE CASCADE"),
        ("set_null", "ON DELETE SET NULL"),
        ("no_action", "NO ACTION (usuwa JPA / serwis)"),
    ], extra_rows=key_rows)

    return f'''
digraph DatabaseSchema {{
  graph [
    {graph_attrs(
        rankdir="LR",
        concentrate="true",
        ranksep="1.1",
        nodesep="0.35",
        splines="spline",
        pad="0.5",
        newrank="true",
    )},
    label=<<FONT POINT-SIZE="20" COLOR="{C["ink"]}"><B>Courser — schemat bazy danych</B></FONT><BR/><FONT POINT-SIZE="11" COLOR="{C["muted"]}">PostgreSQL 16 · courserdb · stan po migracjach Liquibase 001–017</FONT>>
  ];
  node [fontname="Helvetica", shape=plaintext];
  edge [fontname="Helvetica", penwidth=1.4, arrowsize=0.9, color="{C["line"]}"];

  {domain_cluster("acct", "KONTO I SESJE", C["blue"], C["blue_bg"], users + refresh)}
  {domain_cluster("stats", "WYNIKI I STATYSTYKI", C["navy"], C["slate_bg"], results + completed + daily + summary + retry)}
  {domain_cluster("content", "TREŚĆ QUIZU", C["teal"], C["teal_bg"], quizzes + questions + answers)}
  {domain_cluster("rank", "RANKING I UDOSTĘPNIANIE", C["brown"], C["brown_bg"], versions + share + attempts + entries)}
  {legend}

  {fk_edge("users", "refresh", "user_id", color=C["blue"], on_delete="CASCADE")}
  {fk_edge("users", "quizzes", "owner_user_id", color=C["blue"], on_delete="NO ACTION", nullable=True)}
  {fk_edge("users", "share", "created_by_user_id", color=C["blue"], on_delete="NO ACTION")}
  {fk_edge("users", "attempts", "user_id", color=C["blue"], on_delete="CASCADE")}
  {fk_edge("users", "entries", "user_id", color=C["blue"], on_delete="CASCADE")}
  {fk_edge("users", "results", "user_id", color=C["blue"], on_delete="NO ACTION")}
  {fk_edge("users", "completed", "user_id", color=C["blue"], on_delete="CASCADE")}
  {fk_edge("users", "daily", "user_id", color=C["blue"], on_delete="CASCADE")}
  {fk_edge("users", "summary", "user_id", color=C["blue"], on_delete="CASCADE")}
  {fk_edge("users", "retry", "user_id", color=C["blue"], on_delete="CASCADE")}

  {fk_edge("quizzes", "questions", "quiz_id", color=C["teal"], on_delete="NO ACTION")}
  {fk_edge("questions", "answers", "question_id", color=C["teal"], on_delete="NO ACTION")}
  {fk_edge("quizzes", "share", "quiz_id", color=C["teal"], on_delete="SET NULL", nullable=True)}
  {fk_edge("quizzes", "results", "quiz_id", color=C["teal"], on_delete="CASCADE")}
  {fk_edge("quizzes", "completed", "quiz_id", color=C["teal"], on_delete="CASCADE")}
  {fk_edge("quizzes", "summary", "quiz_id", color=C["teal"], on_delete="CASCADE")}

  {fk_edge("versions", "quizzes", "ranking_version_id", color=C["brown"], on_delete="SET NULL", nullable=True)}
  {fk_edge("versions", "share", "ranking_version_id", color=C["brown"], on_delete="SET NULL", nullable=True)}
  {fk_edge("versions", "attempts", "ranking_version_id", color=C["brown"], on_delete="CASCADE")}
  {fk_edge("versions", "entries", "ranking_version_id", color=C["brown"], on_delete="CASCADE")}
}}
'''


# ---------------------------------------------------------------------------
# 3. Cykl życia quizu i rankingu — układ pionowy
# ---------------------------------------------------------------------------

_OUTCOME_TAGS = {
    "quiz": ("NOWY WIERSZ quizzes (duplikat)", "red", "red_bg"),
    "version": ("NOWA WERSJA RANKINGU (pusta tablica)", "brown", "brown_bg"),
    "same": ("TA SAMA WERSJA RANKINGU", "teal", "teal_bg"),
    "none": ("BEZ KOPII QUIZU · BEZ NOWEJ WERSJI", "slate", "slate_bg"),
}


def outcome(name: str, kinds: list[str], text: str) -> str:
    """Wynik operacji z kolorowymi znacznikami (duplikat / nowa wersja / ta sama)."""
    tags = "".join(
        f'<TR><TD ALIGN="LEFT" BGCOLOR="{C[_OUTCOME_TAGS[k][1]]}">'
        f'<FONT COLOR="white" POINT-SIZE="9"><B>{_OUTCOME_TAGS[k][0]}</B></FONT></TD></TR>'
        for k in kinds
    )
    fill = C[_OUTCOME_TAGS[kinds[0]][2]]
    return f'''{name} [
      shape=plaintext
      label=<
        <TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="7"
               COLOR="{C["border"]}" BGCOLOR="{fill}">
          {tags}
          <TR><TD ALIGN="LEFT"><FONT COLOR="{C["ink"]}" POINT-SIZE="10">{html_lines(text)}</FONT></TD></TR>
        </TABLE>
      >
    ];'''


def trigger(name: str, title: str, detail: str) -> str:
    return flow_step(name, title, detail, fill=C["card"], border=C["navy"])


def decision(name: str, text: str) -> str:
    return (
        f'{name} [label=<{html_lines(text)}>, shape=diamond, style="filled", '
        f'fillcolor="{C["amber_bg"]}", color="{C["amber"]}", fontcolor="{C["ink"]}", '
        f'fontname="Helvetica", fontsize=10, margin="0.04,0.02", penwidth=1.4];'
    )


def lane(name: str, title: str, color: str, body: str) -> str:
    return f'''
  subgraph cluster_{name} {{
    label="{title}";
    fontname="Helvetica";
    fontsize=12;
    fontcolor="{C[color]}";
    color="{C[color]}";
    style="rounded";
    bgcolor="{C["card"]}";
    margin=8;
{body}
  }}'''


def lifecycle() -> str:
    # Kolumna = operacja z QuizService; wyniki oznaczone: duplikat quizu / nowa wersja / ta sama.
    yes = f'label=" tak ", fontcolor="{C["teal"]}", color="{C["teal"]}"'
    no = f'label=" nie ", fontcolor="{C["red"]}", color="{C["red"]}"'

    create = lane("create", "1. Utworzenie", "navy", f'''
    {trigger("c_t", "POST /quizzes", "Twórca (JWT) · save()")}
    {outcome("c_q", ["quiz", "version"], "Quiz A · owner_user_id = twórca\\nensureRankingVersion → V1\\nhas_logged_import = false")}
    c_t -> c_q;''')

    edit = lane("edit", "2. Edycja treści — PUT /quizzes/{id}", "navy", f'''
    {trigger("e_t", "PUT /quizzes/{id}", "właściciel wiersza\\n(PATCH = tylko tytuł)")}
    {decision("e_d1", "content_hash\\nzmieniony?\\n(pytania +\\npunktacja)")}
    {outcome("e_same", ["same"], "Tytuł, limity (kolejność,\\npokazywanie odpowiedzi)\\nnie wchodzą do hasha")}
    {decision("e_d2", "has_logged_import\\nwersji = true?")}
    {outcome("e_new", ["version"], "Quiz dostaje V2 · tablica od zera\\nStara V1 zostaje dla kodów\\ni kopii, które na nią wskazują")}
    {outcome("e_block", ["none"], "409 RANKING_COPY_REQUIRED\\nFlaga jest na WERSJI → blokuje\\nteż twórcę oryginału")}
    e_t -> e_d1;
    e_d1 -> e_same [{no}];
    e_d1 -> e_d2 [{yes}];
    e_d2 -> e_new [{no}];
    e_d2 -> e_block [{yes}];''')

    share = lane("share", "3. Udostępnienie kodem", "amber", f'''
    {trigger("s_t", "POST /{id}/share-codes", "właściciel · ważność opcjonalna")}
    {outcome("s_o", ["none", "same"], "Nowy wiersz quiz_share_codes\\nensureRankingVersion: hash bez zmian\\n→ bieżąca wersja quizu")}
    {rule_card("s_n", "Kod jest PRZYPIĘTY do wersji z chwili\\nudostępnienia. Późniejsza edycja (bez importu)\\ndaje quizowi V2, a kod dalej wydaje V1.")}
    s_t -> s_o -> s_n;''')

    imp = lane("import", "4. Import kodem (zalogowany)", "amber", f'''
    {trigger("i_t", "POST /import-code", "odbiorca (JWT)")}
    {outcome("i_q", ["quiz", "same"], "Kopia B · owner_user_id = odbiorca\\ntreść z snapshot_json wersji kodu\\nranking_version = wersja kodu\\nhas_logged_import := true")}
    {rule_card("i_n", "A i B mają różne wiersze quizzes,\\nale WSPÓLNĄ tablicę top 5.")}
    i_t -> i_q -> i_n;''')

    rank = lane("rank", "5. Podejście rankingowe", "brown", f'''
    {trigger("r_t", "POST /{id}/ranking-attempts", "właściciel kopii · tryb oceniany\\nquiz.id &gt; 0 · clientSessionId")}
    {outcome("r_a", ["none"], "quiz_ranking_attempts STARTED\\n(ta sama sesja → to samo podejście)")}
    {trigger("r_f", "POST …/finish", "ocena względem snapshot_json\\nwersji, nie bieżącej treści")}
    {decision("r_d", "lepszy niż\\nwłasny wpis?")}
    {outcome("r_up", ["same"], "Nowy / zaktualizowany wpis\\n(1 wpis na użytkownika w wersji)\\n→ przycięcie do top 5")}
    {outcome("r_keep", ["same"], "Wpis bez zmian\\n(podejście FINISHED zapisane)")}
    r_t -> r_a -> r_f -> r_d;
    r_d -> r_up [{yes}];
    r_d -> r_keep [{no}];''')

    guest = lane("guest", "6. Gość + migracja po zalogowaniu", "slate", f'''
    {trigger("g_t", "POST /share-code-preview", "bez JWT · gość")}
    {outcome("g_l", ["none"], "Kopia tylko w localStorage\\n+ rankingVersionId · bez rankingu")}
    {trigger("g_m", "Logowanie / rejestracja", "POST /import-archive\\nmigratingGuestQuiz = true")}
    {decision("g_d1", "wersja istnieje\\ni hash zgodny?")}
    {decision("g_d2", "właściciel ma już\\nquiz z tą wersją?")}
    {outcome("g_dup", ["none"], "Zwraca istniejący quiz\\n(bez duplikatu)")}
    {outcome("g_join", ["quiz", "same"], "Nowy wiersz (tytuł oryginału)\\nwspólna wersja\\nhas_logged_import := true")}
    {decision("g_d3", "identyczny quiz\\nu właściciela?")}
    {outcome("g_priv", ["quiz", "version"], "Nowy wiersz + prywatna wersja")}
    g_t -> g_l -> g_m -> g_d1;
    g_d1 -> g_d2 [{yes}];
    g_d2 -> g_dup [{yes}];
    g_d2 -> g_join [{no}];
    g_d1 -> g_d3 [{no}];
    g_d3 -> g_dup [{yes}];
    g_d3 -> g_priv [{no}];''')

    zipimp = lane("zip", "7. Import ZIP (zalogowany)", "slate", f'''
    {trigger("z_t", "POST /import-archive", "quiz.json + _ranking.versionId\\n+ contentHash (z eksportu)")}
    {decision("z_d", "wersja istnieje\\ni hash zgodny?")}
    {outcome("z_join", ["quiz", "same"], "Nowy wiersz · tytuł i limity\\nze snapshotu wersji\\nhas_logged_import := true")}
    {outcome("z_priv", ["quiz", "version"], "Nowy wiersz „(kopia)”\\n+ prywatna wersja")}
    z_t -> z_d;
    z_d -> z_join [{yes}];
    z_d -> z_priv [{no}];''')

    fork = lane("fork", "8. Fork / „Kopiuj”", "red", f'''
    {trigger("f_t", "POST /{id}/fork", "menu „Kopiuj” albo potwierdzenie\\npo RANKING_COPY_REQUIRED")}
    {outcome("f_o", ["quiz", "version"], "Nowy wiersz „tytuł (kopia)”\\nzawsze nowy UUID wersji\\n(nawet przy tym samym hashu)\\nOryginał i jego wersja bez zmian")}
    f_t -> f_o;''')

    cleanup = lane("cleanup", "9. Usunięcie i sprzątanie", "muted", f'''
    {trigger("d_t", "DELETE /quizzes/{id}", "właściciel wiersza")}
    {outcome("d_o", ["none"], "Usuwa tylko wiersz quizu\\nwersja zostaje (inne kopie / kody)")}
    {trigger("d_c", "Cron 03:30", "RankingDataCleanupService")}
    {outcome("d_v", ["none"], "Kody wygasłe &gt; 30 dni → usunięte\\nWersja usunięta, gdy &gt; 90 dni,\\nbrak quizu z nią i brak ważnego kodu")}
    d_t -> d_o -> d_c -> d_v;''')

    legend = f'''
  subgraph cluster_legend {{
    label="Legenda";
    fontname="Helvetica";
    fontsize=11;
    fontcolor="{C["muted"]}";
    color="{C["cluster"]}";
    style="rounded";
    bgcolor="{C["card"]}";
    margin=6;
    {outcome("lg_q", ["quiz"], "powstaje kolejny wiersz quizu")}
    {outcome("lg_v", ["version"], "nowe quiz_ranking_versions")}
    {outcome("lg_s", ["same"], "wspólna / niezmieniona tablica")}
    {outcome("lg_n", ["none"], "inne zmiany stanu")}
    lg_q -> lg_v -> lg_s -> lg_n [style=invis];
  }}'''

    return f'''
digraph QuizRankingLifecycle {{
  graph [
    {graph_attrs(
        label="Courser — cykl życia quizu i wersji rankingu (QuizService)",
        ranksep="0.3",
        nodesep="0.2",
        pad="0.3",
        splines="true",
        fontsize="18",
        newrank="true",
        compound="true",
    )}
  ];
  node [fontname="Helvetica"];
  edge [fontname="Helvetica", fontsize=9, color="{C["line"]}", penwidth=1.2, arrowsize=0.8];
{create}
{edit}
{share}
{imp}
{rank}
{guest}
{zipimp}
{fork}
{cleanup}
{legend}

  // Rząd 1: kolumny 1–5 · rząd 2: kolumny 6–9 + legenda (kolejność wymuszona pionowymi kotwicami)
  {{ rank=same; c_t; e_t; s_t; i_t; r_t }}
  {{ rank=same; g_t; z_t; f_t; d_t; lg_q }}
  c_t -> e_t -> s_t -> i_t -> r_t [style=invis, weight=20];
  g_t -> z_t -> f_t -> d_t -> lg_q [style=invis, weight=20];
  e_new -> g_t [style=invis, weight=0];
  s_n -> z_t [style=invis, weight=0];
  i_n -> f_t [style=invis, weight=0];
  r_up -> d_t [style=invis, weight=0];
  r_keep -> lg_q [style=invis, weight=0];

  // Przejścia między operacjami
  e_block -> f_t [style="dashed,bold", penwidth=2.2, constraint=false, color="{C["red"]}",
                  fontcolor="{C["red"]}", fontsize=10, arrowsize=1.1,
                  taillabel=<<B>użytkownik potwierdza kopię</B>>, labeldistance=6, labelangle=-25];
  s_n -> i_t [style=dotted, penwidth=1.8, constraint=false, color="{C["amber"]}",
              fontcolor="{C["amber"]}", label=" kod "];
  s_n -> g_t [style=dotted, penwidth=1.8, constraint=false, color="{C["amber"]}",
              fontcolor="{C["amber"]}", fontsize=10,
              taillabel=<<B>kod (gość)</B>>, labeldistance=5, labelangle=30];
}}
'''


# ---------------------------------------------------------------------------
# 4. Przypadki użycia UML — asocjacje zgodne z kodem (gateway + API + FE)
# ---------------------------------------------------------------------------

def usecases() -> str:
    # Klasyczny UML: prostokąt systemu, białe elipsy, aktorzy po lewej i prawej.
    # Pozycje przypięte (neato, pos!) — proste odcinki bez przecinania elips.
    # Uprawnienia jak w kodzie: gateway JWT, QuizController (owner_user_id),
    # QuizApiService / sidebar (gość działa wyłącznie na localStorage).
    def uc(name: str, label: str, x: float, y: float) -> str:
        return (
            f'{name} [pos="{x},{y}!", label=<{html_lines(label)}>, shape=ellipse, style="filled", '
            f'fillcolor="{C["card"]}", color="{C["ink"]}", fontcolor="{C["ink"]}", '
            f'fontname="Helvetica", fontsize=11, margin="0.1,0.05", penwidth=1.3];'
        )

    def actor(name: str, label: str, x: float, y: float) -> str:
        return actor_node(name, label).replace(f"{name} [", f'{name} [pos="{x},{y}!"', 1)

    dep = f'style=dashed, arrowhead=vee, color="{C["muted"]}", fontcolor="{C["muted"]}", fontsize=9'
    gen = f'arrowhead=onormal, arrowsize=1.4, color="{C["ink"]}", penwidth=1.3'

    return f"""
digraph UserUsecases {{
  graph [
    layout="neato"
    overlap="true"
    splines="line"
    outputorder="nodesfirst"
    bgcolor="{C["bg"]}"
    fontname="Helvetica"
    fontsize="18"
    labelloc="t"
    label="Courser — diagram przypadków użycia (UML)"
    pad="0.4"
  ];
  node [fontname="Helvetica"];
  edge [fontname="Helvetica", fontsize=9, color="{C["ink"]}", arrowhead=none, penwidth=1.1];

  system [pos="0,0.95!", shape=box, fixedsize=true, width=12.2, height=13.0,
          label="System Courser", labelloc=t, fontsize=15, fontcolor="{C["ink"]}",
          style="filled", fillcolor="{C["card"]}", color="{C["ink"]}", penwidth=2];
  title_gap [pos="0,8.1!", shape=point, style=invis, width=0.01];

  {actor("creator", "Twórca", -7.4, 6.6)}
  {actor("owner", "Właściciel quizu\\n(zalogowany)", -7.4, 0)}
  {actor("recipient", "Odbiorca\\nudostępnienia", -7.4, -6.4)}
  {actor("guest", "Niezalogowany", 7.4, 0)}

  // Twórca
  {uc("uc_create", "Tworzy quiz", -1.0, 6.4)}
  {uc("uc_media", "Zapisuje obraz\\n(≤ 16 MB, SHA-256)", 2.2, 5.3)}

  // Tylko właściciel — wachlarz wokół aktora (poza pasem do kolumny wspólnej)
  {uc("uc_fork", "Tworzy prywatną kopię\\n(fork)", -4.7, 6.0)}
  {uc("uc_edit", "Edytuje quiz\\n/ zmienia tytuł", -2.9, 4.4)}
  {uc("uc_stats", "Przegląda statystyki", -2.3, 3.3)}
  {uc("uc_ranking", "Bierze udział\\nw rankingu (top 5)", -1.6, 2.2)}
  {uc("uc_export", "Eksportuje ZIP", -1.6, -2.2)}
  {uc("uc_share", "Tworzy kod\\nudostępniania", -2.4, -3.4)}
  {uc("uc_settings", "Zmienia ustawienia konta\\n(nazwa, kolor akcentu)", -3.4, -4.6)}

  // Wspólne: właściciel (konto) i gość (localStorage)
  {uc("uc_play", "Rozwiązuje quiz\\n(nauka / oceniany)", 1.5, 1.9)}
  {uc("uc_copy", "Kopiuje quiz", 1.5, 0.7)}
  {uc("uc_delete", "Usuwa quiz", 1.5, -0.5)}
  {uc("uc_import_zip", "Importuje ZIP", 1.5, -1.7)}
  {uc("uc_import_code", "Importuje quiz\\nkodem", 1.5, -4.5)}
  {uc("uc_shared_rv", "Dołącza do wspólnej\\nwersji rankingu", -0.4, -3.2)}

  // Tylko gość
  {uc("uc_auth", "Rejestruje się\\n/ loguje", 4.6, 2.5)}
  {uc("uc_migrate", "Migruje lokalne quizy\\nna konto", 4.6, 4.0)}

  // Generalizacja aktorów
  creator -> owner [{gen}];
  recipient -> owner [{gen}];

  // Asocjacje
  creator -> uc_create;
  recipient -> uc_import_code;

  owner -> uc_edit;
  owner -> uc_stats;
  owner -> uc_ranking;
  owner -> uc_export;
  owner -> uc_share;
  owner -> uc_settings;
  owner -> uc_play;
  owner -> uc_copy;
  owner -> uc_delete;
  owner -> uc_import_zip;

  guest -> uc_auth;
  guest -> uc_play;
  guest -> uc_copy;
  guest -> uc_delete;
  guest -> uc_import_zip;
  guest -> uc_import_code;

  // «include» / «extend»
  uc_media -> uc_create [{dep}, label="«extend»\\n[nowy obraz]"];
  uc_media -> uc_edit [{dep}, label="«extend»\\n[nowy obraz]"];
  uc_auth -> uc_migrate [{dep}, label="«include»"];
  uc_fork -> uc_edit [{dep}, label="«extend»\\n[RANKING_COPY_REQUIRED]"];
  uc_ranking -> uc_play [{dep}, label="«extend»\\n[tryb oceniany]"];
  uc_shared_rv -> uc_import_code [{dep}, label="«extend»\\n[zalogowany]"];
  uc_shared_rv -> uc_import_zip [{dep}, label="«extend»\\n[zalogowany, zgodny hash]"];
}}
"""


def uml_classifier(
    name: str,
    title: str,
    attrs: list[str],
    ops: list[str] | None = None,
    *,
    kind: str = "entity",
    stereotype: str | None = None,
    accent: str,
    tint: str,
    note: str = "",
) -> str:
    """Klasyfikator UML: nagłówek (ikona rodzaju, «stereotyp», nazwa) | atrybuty | operacje."""
    icon = make_icons()[f"kind_{UML_KINDS[kind][0]}"]
    stereotype = stereotype or kind

    def compartment(lines: list[str]) -> str:
        rows = "".join(
            f'<TR><TD ALIGN="LEFT"><FONT POINT-SIZE="10" COLOR="{C["ink"]}">{line}</FONT></TD></TR>'
            for line in lines
        ) or '<TR><TD></TD></TR>'
        return (
            f'<TR><TD ALIGN="LEFT" CELLPADDING="7">'
            f'<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="1">{rows}</TABLE></TD></TR>'
        )

    rule = f'<TR><TD HEIGHT="1" BGCOLOR="{C["border"]}" CELLPADDING="0"></TD></TR>'
    note_html = (
        f'<BR/><FONT POINT-SIZE="8" COLOR="{C["muted"]}"><I>{note}</I></FONT>' if note else ""
    )
    body = compartment(attrs)
    if ops is not None:
        body += rule + compartment(ops)
    return f'''{name} [label=<
<TABLE BORDER="1" STYLE="rounded" COLOR="{accent}" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0" BGCOLOR="{C["card"]}">
  <TR><TD BGCOLOR="{tint}" CELLPADDING="7">
    <TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0"><TR>
      <TD WIDTH="20" HEIGHT="20" FIXEDSIZE="TRUE" VALIGN="TOP"><IMG SRC="{icon}" SCALE="TRUE"/></TD>
      <TD WIDTH="6"></TD>
      <TD>
        <FONT POINT-SIZE="8" COLOR="{C["muted"]}">«{stereotype}»</FONT><BR/>
        <FONT POINT-SIZE="13" COLOR="{C["ink"]}"><B>{title}</B></FONT>{note_html}
      </TD>
      <TD WIDTH="26"></TD>
    </TR></TABLE>
  </TD></TR>
  <TR><TD HEIGHT="2" BGCOLOR="{accent}" CELLPADDING="0"></TD></TR>
  {body}
</TABLE>>];'''


def uml_note(name: str, text: str) -> str:
    return (
        f'{name} [shape=note, style=filled, fillcolor="#FEFCE8", color="#CA8A04", '
        f'fontname="Helvetica", fontsize=9, fontcolor="{C["ink"]}", margin="0.15,0.08", '
        f'label=<{html_lines(text)}>];'
    )


def assoc(tail: str, head: str, *, role: str = "", tail_mult: str = "", head_mult: str = "",
          composition: bool = False, color: str | None = None, constraint: bool = True) -> str:
    color = color or C["slate"]
    shape = 'dir=both, arrowtail=diamond, arrowhead=none' if composition else 'arrowhead=vee'
    parts = [shape, f'color="{color}"', f'fontcolor="{color}"', "penwidth=1.5"]
    if not constraint:
        parts.append("constraint=false")
    if role:
        parts.append(f'label=<<FONT POINT-SIZE="9"><I>{role}</I></FONT>>')
    if tail_mult:
        parts.append(f'taillabel=<<FONT POINT-SIZE="9"><B>{tail_mult}</B></FONT>>')
    if head_mult:
        parts.append(f'headlabel=<<FONT POINT-SIZE="9"><B>{head_mult}</B></FONT>>')
    return f'{tail} -> {head} [{", ".join(parts)}, labeldistance=1.8, labelangle=35];'


def class_diagram() -> str:
    teal = dict(accent=C["teal"], tint=C["teal_bg"])
    brown = dict(accent=C["brown"], tint=C["brown_bg"])
    amber = dict(accent=C["amber"], tint=C["amber_bg"])
    blue = dict(accent=C["blue"], tint=C["blue_bg"])
    navy = dict(accent=C["navy"], tint=C["slate_bg"])
    enum = dict(kind="enumeration", accent="#D97706", tint="#FFFBEB")

    quiz_pkg = domain_cluster("quiz", "«serwis» quiz-service · entity — treść quizu", C["teal"], C["teal_bg"], "".join([
        uml_classifier("Quiz", "Quiz", [
            "- id: Long {id}",
            "- title: String",
            "- ownerUserId: Long",
            "- scoringMode: ScoringMode = DEFAULT",
            "- allowNegativeScore: boolean = false",
            "- pointsPerCorrect: double = 1",
            "- incorrectPenalty: double = 1",
            "- penaltyMode: PenaltyMode = FRACTION",
            "- randomQuestionOrder: boolean = false",
            "- showCorrectAnswers: boolean = true",
        ], [
            "+ addQuestion(q: Question): void",
            "+ removeQuestion(q: Question): void",
        ], **teal),
        uml_classifier("Question", "Question", [
            "- id: Long {id}",
            "- content: String",
            "- imageKey: String [0..1]",
            "- imageFilename: String [0..1]",
        ], [
            "+ addAnswer(a: Answer): void",
            "+ removeAnswer(a: Answer): void",
        ], **teal),
        uml_classifier("Answer", "Answer", [
            "- id: Long {id}",
            "- content: String",
            "- correct: boolean",
            "- points: Double [0..1]",
        ], [], **teal),
        uml_classifier("ScoringMode", "ScoringMode", ["DEFAULT", "CUSTOM"], **enum),
        uml_classifier("PenaltyMode", "PenaltyMode", ["FRACTION", "POINTS", "PERCENT"], **enum),
    ]))

    rank_pkg = domain_cluster("rank", "«serwis» quiz-service · entity — ranking i udostępnianie", C["brown"], C["brown_bg"], "".join([
        uml_classifier("QuizShareCode", "QuizShareCode", [
            "- id: Long {id}",
            "- code: String {unique}",
            "- createdByUserId: Long",
            "- active: boolean",
            "- createdAt: LocalDateTime",
            "- expiresAt: LocalDateTime [0..1]",
        ], ["# onCreate(): void  «PrePersist»"], **amber),
        uml_classifier("QuizRankingVersion", "QuizRankingVersion", [
            "- id: UUID {id}",
            "- snapshotJson: String",
            "- contentHash: String",
            "- hasLoggedImport: boolean",
            "- createdAt: LocalDateTime",
        ], [], **brown),
        uml_classifier("QuizRankingAttempt", "QuizRankingAttempt", [
            "- id: UUID {id}",
            "- userId: Long",
            "- clientSessionId: UUID",
            "- startedAt: LocalDateTime",
            "- completedAt: LocalDateTime [0..1]",
            "- status: String  {STARTED | FINISHED}",
            "- scoreScaled: Integer [0..1]",
            "- maxScoreScaled: Integer [0..1]",
            "- durationMs: Long [0..1]",
            "- position: Integer [0..1]",
            "- outsideTopFive: Boolean [0..1]",
        ], ["~ created(): void  «PrePersist»"], **brown),
        uml_classifier("QuizRankingEntry", "QuizRankingEntry", [
            "- id: Long {id}",
            "- userId: Long",
            "- scoreScaled: int",
            "- maxScoreScaled: int",
            "- durationMs: long",
            "- completedAt: LocalDateTime",
        ], [], **brown),
        uml_classifier("RankingUser", "RankingUser", [
            "- id: Long {id, readOnly}",
            "- username: String {readOnly}",
        ], [], note="mapuje tabelę users", accent=C["slate"], tint=C["slate_bg"]),
    ]))

    user_pkg = domain_cluster("user", "«serwis» user-service — konto, wyniki i statystyki", C["blue"], C["blue_bg"], "".join([
        uml_classifier("User", "User", [
            "- id: Long {id}",
            "- username: String {unique}",
            "- email: String {unique}",
            "- password: String",
            "- role: UserRole",
            "- accentColor: String = \"coral\"",
            "- totalScore: Integer [0..1]",
            "- quizzesCompleted: Integer [0..1]",
            "- createdAt: LocalDateTime",
            "- lastLogin: LocalDateTime [0..1]",
        ], ["# onCreate(): void  «PrePersist»"], **blue),
        uml_classifier("RefreshSession", "RefreshSession", [
            "- id: UUID {id}",
            "- tokenHash: String {unique}",
            "- createdAt: LocalDateTime",
            "- lastUsedAt: LocalDateTime",
            "- expiresAt: LocalDateTime",
        ], [], **blue),
        uml_classifier("UserRole", "UserRole", ["STUDENT", "TEACHER", "ADMIN"], **enum),
        uml_classifier("QuizResult", "QuizResult", [
            "- id: Long {id}",
            "- userId: Long",
            "- quizId: Long",
            "- score: Integer",
            "- maxScore: Integer",
            "- completedAt: LocalDateTime",
        ], ["# onCreate(): void  «PrePersist»"], **navy),
        uml_classifier("CompletedQuizAttempt", "CompletedQuizAttempt", [
            "- id: Long {id}",
            "- quizId: Long",
            "- userId: Long",
            "- completedAt: LocalDateTime",
        ], ["# onCreate(): void  «PrePersist»"], **navy),
        uml_classifier("UserStatisticsService", "UserStatisticsService", [
            "- jdbc: JdbcTemplate",
        ], [
            "+ complete(userId: Long, request: CompleteStatisticsRequest): void",
            "+ daily(userId: Long): List&lt;DailyStatistics&gt;",
            "+ count(userId: Long, quizId: Long): long",
            "+ bestScores(userId: Long): List&lt;BestQuizScoreResponse&gt;",
        ], kind="service", accent=C["navy"], tint=C["slate_bg"]),
        uml_classifier("DailyStatistics", "DailyStatistics", [
            "+ date: LocalDate",
            "+ completedQuizzes: long",
            "+ checkedQuestions: long",
            "+ effectivenessSum: long",
            "+ effectivenessCount: long",
        ], kind="record", note="UserStatisticsService.DailyStatistics",
           accent="#7C3AED", tint=C["violet_bg"]),
        uml_note("jdbc_note",
                 "Bez encji JPA — SQL przez JdbcTemplate:\n"
                 "• user_daily_statistics\n• user_quiz_summary\n• user_statistics_retry_keys"),
    ]))

    id_ref = f'style=dashed, arrowhead=vee, color="{C["line"]}", penwidth=1.1, arrowsize=0.7'
    dep = f'style=dashed, arrowhead=vee, color="{C["slate"]}", penwidth=1.1, arrowsize=0.7'

    legend = legend_card("legend", [
        ("composition", "kompozycja (cascade ALL + orphanRemoval)"),
        ("association", "asocjacja skierowana (@ManyToOne)"),
        ("dependency", "zależność «use» / «create»"),
        ("id_ref", "referencja po ID między serwisami"),
    ])
    return f'''
digraph ClassDiagram {{
  graph [
    {graph_attrs(
        ranksep="0.7",
        concentrate="true",
        nodesep="0.45",
        splines="spline",
        pad="0.5",
    )},
    label=<<FONT POINT-SIZE="20" COLOR="{C["ink"]}"><B>Courser — diagram klas</B></FONT><BR/><FONT POINT-SIZE="11" COLOR="{C["muted"]}">model domeny: encje JPA, enumy i model statystyk JDBC</FONT>>
  ];
  node [fontname="Helvetica", shape=plaintext];
  edge [fontname="Helvetica", fontsize=9, arrowsize=0.9];

  {quiz_pkg}
  {rank_pkg}
  {user_pkg}
  {legend}

  {assoc("Quiz", "Question", role="questions", tail_mult="1", head_mult="0..*", composition=True, color=C["teal"])}
  {assoc("Question", "Answer", role="answers", tail_mult="1", head_mult="0..*", composition=True, color=C["teal"])}
  {assoc("Quiz", "QuizRankingVersion", role="rankingVersion", tail_mult="0..*", head_mult="0..1", color=C["brown"])}
  {assoc("QuizShareCode", "Quiz", role="quiz", tail_mult="0..*", head_mult="0..1", color=C["amber"], constraint=False)}
  {assoc("QuizShareCode", "QuizRankingVersion", role="rankingVersion", tail_mult="0..*", head_mult="0..1", color=C["amber"])}
  {assoc("QuizRankingAttempt", "QuizRankingVersion", role="rankingVersion", tail_mult="0..*", head_mult="1", color=C["brown"])}
  {assoc("QuizRankingEntry", "QuizRankingVersion", role="rankingVersion", tail_mult="0..*", head_mult="1", color=C["brown"])}
  {assoc("RefreshSession", "User", role="user", tail_mult="0..*", head_mult="1", color=C["blue"])}

  Quiz -> ScoringMode [{dep}];
  Quiz -> PenaltyMode [{dep}];
  User -> UserRole [{dep}];
  UserStatisticsService -> DailyStatistics [{dep}, label=<<FONT POINT-SIZE="9">«create»</FONT>>];
  UserStatisticsService -> jdbc_note [style=dashed, arrowhead=none, color="#CA8A04"];
  RankingUser -> User [{dep}, label=<<FONT POINT-SIZE="9">«ta sama tabela»</FONT>>, constraint=false];

  Quiz -> User [{id_ref}, constraint=false];
  QuizShareCode -> User [{id_ref}, constraint=false];
  QuizRankingAttempt -> User [{id_ref}, constraint=false];
  QuizRankingEntry -> User [{id_ref}, constraint=false];
  QuizResult -> User [{id_ref}];
  QuizResult -> Quiz [{id_ref}, constraint=false];
  CompletedQuizAttempt -> User [{id_ref}];
  CompletedQuizAttempt -> Quiz [{id_ref}, constraint=false];

  Answer -> RefreshSession [style=invis];
  QuizRankingVersion -> QuizResult [style=invis];
  QuizShareCode -> RankingUser [style=invis];
  DailyStatistics -> legend [style=invis];
}}
'''


# name -> (factory, graphviz engine)
GENERATORS = {
    "01_system_architecture": (system_architecture, "dot"),
    "02_database_schema": (database_schema, "dot"),
    "03_quiz_ranking_lifecycle": (lifecycle, "dot"),
    "04_user_usecases": (usecases, "neato"),
    "05_class_diagram": (class_diagram, "dot"),
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Generuje PNG diagramów Courser (final-imaging)")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent / "out",
        help="Katalog wyjściowy PNG",
    )
    parser.add_argument(
        "--keep-dot",
        action="store_true",
        help="Zapisz też źródła .dot obok PNG",
    )
    args = parser.parse_args()

    dot_bin = require_dot()
    print(f"Renderowanie {len(GENERATORS)} diagramów → {args.out}")

    for name, (factory, engine) in GENERATORS.items():
        source = factory()
        if args.keep_dot:
            dot_path = args.out / f"{name}.dot"
            dot_path.parent.mkdir(parents=True, exist_ok=True)
            dot_path.write_text(source, encoding="utf-8")
        render(dot_bin, source, args.out / f"{name}.png", engine=engine)

    print("Gotowe.")


if __name__ == "__main__":
    main()
