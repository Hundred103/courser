from diagrams import Diagram, Cluster, Edge
from diagrams.onprem.database import Postgresql
from diagrams.onprem.network import Nginx
from diagrams.programming.framework import Spring, Angular
from diagrams.onprem.container import Docker

# Atrybuty graficzne dla całego diagramu (czystszy wygląd)
graph_attr = {
    "fontsize": "20",
    "bgcolor": "white",
    "splines": "ortho", # Proste linie zamiast krzywych dla porządku
    "nodesep": "1.0",
    "ranksep": "1.0"
}

with Diagram("System Mikroserwisowy - Architektura Kontenerowa", 
             show=False, 
             direction="TB", # Top to Bottom
             outformat="png",
             graph_attr=graph_attr):

    # 1. Baza danych na samej górze (w osobnym kontenerze)
    with Cluster("Container: db-postgreSQL"):
        database = Postgresql("Shared Database")

    # 2. Warstwa mikroserwisów
    with Cluster("Warstwa Mikroserwisów (Dockerized)"):
        with Cluster("Container: user-service"):
            user_svc = Spring("User Service")
        
        with Cluster("Container: quiz-service"):
            quiz_svc = Spring("Quiz Service")

    # 3. Gateway (w osobnym kontenerze)
    with Cluster("Container: api-gateway"):
        gateway = Spring("Spring Cloud Gateway")

    # 4. Proxy (w osobnym kontenerze)
    with Cluster("Container: reverse-proxy"):
        proxy = Nginx("Nginx / Server Proxy")

    # 5. Klient (poza infrastrukturą serwerową)
    client = Angular("Angular Frontend")

    # --- POŁĄCZENIA I PRZEPŁYW DANYCH (Góra -> Dół) ---

    # Połączenia z bazą danych (u góry)
    # Używamy kolorów dla rozróżnienia typów ruchu
    sql_edge = Edge(color="#C10A27", style="dashed", label="JDBC/SQL")
    database >> sql_edge >> user_svc
    database >> sql_edge >> quiz_svc

    # Komunikacja serwisów do Gateway'a
    internal_edge = Edge(color="#003865", label="REST/JSON")
    user_svc >> internal_edge >> gateway
    quiz_svc >> internal_edge >> gateway

    # Gateway do Proxy
    gateway >> Edge(color="#003865", label="Forwarded Traffic") >> proxy

    # Proxy do użytkownika końcowego
    proxy >> Edge(color="#007ACC", style="bold", label="HTTPS / Public API") >> client