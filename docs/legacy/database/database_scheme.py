import os
import graphviz

# Wymuszenie ścieżki do Graphviz
os.environ["PATH"] += os.pathsep + r"C:\Program Files\Graphviz\bin"

# Tworzymy nowy diagram skierowany (Digraph)
dot = graphviz.Digraph('DatabaseSchema', filename='schemat_bazy_danych', format='png')

# Ustawienia graficzne dla tabel
dot.attr('node', shape='plaintext', fontname='Helvetica')
dot.attr('edge', arrowhead='crow', fontname='Helvetica', fontsize='10')

# --- DEFINICJA ENCJI (TABEL) I ATRYBUTÓW ---

# 1. Tabela USERS
dot.node('users', '''<
<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" BGCOLOR="#f1f5f9">
  <TR><TD COLSPAN="2" BGCOLOR="#003865"><FONT COLOR="white"><B>USERS</B></FONT></TD></TR>
  <TR><TD PORT="id" ALIGN="LEFT"><B>id</B></TD><TD ALIGN="LEFT">UUID (PK)</TD></TR>
  <TR><TD ALIGN="LEFT">username</TD><TD ALIGN="LEFT">VARCHAR(50)</TD></TR>
  <TR><TD ALIGN="LEFT">email</TD><TD ALIGN="LEFT">VARCHAR(100)</TD></TR>
  <TR><TD ALIGN="LEFT">password_hash</TD><TD ALIGN="LEFT">VARCHAR(255)</TD></TR>
  <TR><TD ALIGN="LEFT">created_at</TD><TD ALIGN="LEFT">TIMESTAMP</TD></TR>
</TABLE>>''')

# 2. Tabela QUIZZES
dot.node('quizzes', '''<
<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" BGCOLOR="#f1f5f9">
  <TR><TD COLSPAN="2" BGCOLOR="#C10A27"><FONT COLOR="white"><B>QUIZZES</B></FONT></TD></TR>
  <TR><TD PORT="id" ALIGN="LEFT"><B>id</B></TD><TD ALIGN="LEFT">UUID (PK)</TD></TR>
  <TR><TD PORT="creator_id" ALIGN="LEFT">creator_id</TD><TD ALIGN="LEFT">UUID (FK)</TD></TR>
  <TR><TD ALIGN="LEFT">title</TD><TD ALIGN="LEFT">VARCHAR(100)</TD></TR>
  <TR><TD ALIGN="LEFT">description</TD><TD ALIGN="LEFT">TEXT</TD></TR>
  <TR><TD ALIGN="LEFT">created_at</TD><TD ALIGN="LEFT">TIMESTAMP</TD></TR>
</TABLE>>''')

# 3. Tabela QUESTIONS
dot.node('questions', '''<
<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" BGCOLOR="#f1f5f9">
  <TR><TD COLSPAN="2" BGCOLOR="#C10A27"><FONT COLOR="white"><B>QUESTIONS</B></FONT></TD></TR>
  <TR><TD PORT="id" ALIGN="LEFT"><B>id</B></TD><TD ALIGN="LEFT">UUID (PK)</TD></TR>
  <TR><TD PORT="quiz_id" ALIGN="LEFT">quiz_id</TD><TD ALIGN="LEFT">UUID (FK)</TD></TR>
  <TR><TD ALIGN="LEFT">content</TD><TD ALIGN="LEFT">TEXT</TD></TR>
  <TR><TD ALIGN="LEFT">is_negated</TD><TD ALIGN="LEFT">BOOLEAN</TD></TR>
</TABLE>>''')

# 4. Tabela ANSWERS
dot.node('answers', '''<
<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" BGCOLOR="#f1f5f9">
  <TR><TD COLSPAN="2" BGCOLOR="#C10A27"><FONT COLOR="white"><B>ANSWERS</B></FONT></TD></TR>
  <TR><TD PORT="id" ALIGN="LEFT"><B>id</B></TD><TD ALIGN="LEFT">UUID (PK)</TD></TR>
  <TR><TD PORT="question_id" ALIGN="LEFT">question_id</TD><TD ALIGN="LEFT">UUID (FK)</TD></TR>
  <TR><TD ALIGN="LEFT">content</TD><TD ALIGN="LEFT">TEXT</TD></TR>
  <TR><TD ALIGN="LEFT">is_correct</TD><TD ALIGN="LEFT">BOOLEAN</TD></TR>
</TABLE>>''')

# 5. Tabela QUIZ_ATTEMPTS
dot.node('quiz_attempts', '''<
<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" BGCOLOR="#f1f5f9">
  <TR><TD COLSPAN="2" BGCOLOR="#334155"><FONT COLOR="white"><B>QUIZ_ATTEMPTS</B></FONT></TD></TR>
  <TR><TD PORT="id" ALIGN="LEFT"><B>id</B></TD><TD ALIGN="LEFT">UUID (PK)</TD></TR>
  <TR><TD PORT="user_id" ALIGN="LEFT">user_id</TD><TD ALIGN="LEFT">UUID (FK)</TD></TR>
  <TR><TD PORT="quiz_id" ALIGN="LEFT">quiz_id</TD><TD ALIGN="LEFT">UUID (FK)</TD></TR>
  <TR><TD ALIGN="LEFT">score</TD><TD ALIGN="LEFT">INTEGER</TD></TR>
  <TR><TD ALIGN="LEFT">attempted_at</TD><TD ALIGN="LEFT">TIMESTAMP</TD></TR>
</TABLE>>''')

# --- DEFINICJA RELACJI (KLUCZE OBCE) ---

dot.edge('users:id', 'quizzes:creator_id', label='tworzy')
dot.edge('quizzes:id', 'questions:quiz_id', label='zawiera')
dot.edge('questions:id', 'answers:question_id', label='posiada')
dot.edge('users:id', 'quiz_attempts:user_id', label='rozwiązuje')
dot.edge('quizzes:id', 'quiz_attempts:quiz_id', label='dotyczy')

# Generowanie i renderowanie - cleanup=True usuwa plik pośredni (np. "schemat_bazy_danych")
dot.render(cleanup=True, view=False)

print("Schemat bazy danych został wygenerowany pomyślnie jako 'schemat_bazy_danych.png' (bez pliku pośredniego).")