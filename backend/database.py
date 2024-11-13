import sqlite3
from datetime import datetime
import uuid

# Here we are Define a function to get a new database connection
def get_db_connection():
    connection = sqlite3.connect("documents.db")
    connection.row_factory = sqlite3.Row  # Makes rows dictionary-like
    return connection

# Initialize the database tables if they don't exist
with get_db_connection() as conn:
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pdf_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pdf_id) REFERENCES documents(id) ON DELETE CASCADE
        )
    ''')
    conn.commit()

def insert_document(filename):
    """Insert a new document record with a unique ID into the database."""
    doc_id = str(uuid.uuid4())  #To generate a unique id for every pdf getting uploaded
    upload_date = datetime.now()

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO documents (id, filename, upload_date) VALUES (?, ?, ?)",
            (doc_id, filename, upload_date)
        )
        conn.commit()
    return doc_id  # Returning the generated ID

def fetch_documents():
    """Fetch all documents from the database as a list of dictionaries."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM documents")
        return [dict(row) for row in cursor.fetchall()]  # Convert rows to dicts for usability

def insert_conversation(pdf_id, question, answer):
    """Insert a conversation entry related to a specific PDF."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO conversations (pdf_id, question, answer, timestamp) VALUES (?, ?, ?, ?)",
            (pdf_id, question, answer, datetime.now())
        )
        conn.commit()

def fetch_conversations(pdf_id):
    """Fetch conversation history for a specific PDF from the database."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT question, answer, timestamp FROM conversations WHERE pdf_id = ? ORDER BY timestamp",
            (pdf_id,)
        )
        return [dict(row) for row in cursor.fetchall()]  
