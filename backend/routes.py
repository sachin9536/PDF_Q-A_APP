from fastapi import APIRouter, File, UploadFile, HTTPException
from pydantic import BaseModel
from PyPDF2 import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.chains import load_chain
from langchain.prompts import PromptTemplate
from dotenv import load_dotenv
import os
from .database import insert_document, get_db_connection  # Importing database connection function
from langchain.chains.question_answering import load_qa_chain
load_dotenv()
router = APIRouter()

# Load environment variables
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise HTTPException(status_code=500, detail="Google API key not found.")

# Data structures for storing vector stores and conversation history
vector_stores = {}
text_chunks = {}
conversations = {}  # Store conversations for each pdf_id

class QuestionRequest(BaseModel):
    question: str
    pdf_id: str

def get_text_chunks(text):
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=10000, chunk_overlap=1000)
    chunks = text_splitter.split_text(text)
    return chunks

@router.post("/upload_pdf/")
async def upload_pdf(file: UploadFile = File(...)):
    text = ""
    pdf_reader = PdfReader(file.file)
    for page in pdf_reader.pages:
        text += page.extract_text()
    
    # Insert document metadata into the database
    pdf_id = insert_document(file.filename)
    
    chunks = get_text_chunks(text)
    text_chunks[pdf_id] = chunks

    embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001")
    vector_store = FAISS.from_texts(chunks, embedding=embeddings)
    vector_stores[pdf_id] = vector_store

    # Initialize an empty conversation history for this PDF
    conversations[pdf_id] = []

    return {
        "message": "File uploaded and text processed into chunks and embeddings",
        "pdf_id": pdf_id
    }

def get_conversational_chain():
    prompt_template = """
    Answer the question as detailed as possible from the provided context. If the answer is not available in the context, respond with "answer is not available in the context."
    Context:\n {context}?\n
    Question:\n{question}\n
    Answer:
    """
    model = ChatGoogleGenerativeAI(model="gemini-pro", temperature=0.3)
    prompt = PromptTemplate(template=prompt_template, input_variables=["context", "question"])

    chain = load_qa_chain(model, chain_type="stuff", prompt=prompt)
    return chain

from .database import insert_document, get_db_connection  # Add get_db_connection for database access

@router.post("/ask_question/")
async def ask_question(request: QuestionRequest):
    question = request.question
    pdf_id = request.pdf_id

    if pdf_id not in vector_stores:
        raise HTTPException(status_code=404, detail="PDF not found or not processed.")

    vector_store = vector_stores[pdf_id]
    docs = vector_store.similarity_search(question)

    if not docs:
        return {"answer": "No relevant context found for this question."}

    chain = get_conversational_chain()
    response = chain.invoke({"input_documents": docs, "question": question})

    # Insert conversation into the database
    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(
        "INSERT INTO conversations (pdf_id, question, answer) VALUES (?, ?, ?)",
        (pdf_id, question, response["output_text"])
    )
    connection.commit()
    cursor.close()
    connection.close()

    return {"answer": response["output_text"]}

@router.get("/get_uploaded_pdfs/")
async def get_uploaded_pdfs():
    # Establish a new database connection for this request
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("SELECT id, filename, upload_date FROM documents")
        rows = cursor.fetchall()
        return {
            "pdfs": [
                {"pdf_id": row["id"], "filename": row["filename"], "upload_date": row["upload_date"]}
                for row in rows
            ]
        }
    finally:
        cursor.close()
        connection.close()

# @router.get("/get_conversation/")
# async def get_conversation(pdf_id: str):
#     if pdf_id not in conversations:
#         raise HTTPException(status_code=404, detail="No conversation history found for this PDF.")
    
#     return {"conversation": conversations[pdf_id]}

@router.get("/get_conversation/")
async def get_conversation(pdf_id: str):
    connection = get_db_connection()
    cursor = connection.cursor()
    
    try:
        cursor.execute("SELECT question, answer, timestamp FROM conversations WHERE pdf_id = ? ORDER BY timestamp", (pdf_id,))
        rows = cursor.fetchall()
        conversation = [{"question": row["question"], "answer": row["answer"], "timestamp": row["timestamp"]} for row in rows]
        return {"conversation": conversation}
    finally:
        cursor.close()
        connection.close()
