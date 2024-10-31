from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
from datetime import datetime
import os
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from langchain.prompts import PromptTemplate
from PyPDF2 import PdfReader
import json
import fitz 
import pymupdf
import pytesseract
from PIL import Image
import io
import numpy as np
import pandas as pd
from langchain_community.chat_message_histories import ChatMessageHistory  # Updated import

import matplotlib.pyplot as plt
import base64
import re
import io
import ast
from contextlib import redirect_stdout

# Load environment variables
load_dotenv()

# Get OpenAI API key and verify it exists
openai_api_key = os.getenv('OPENAI_API_KEY')
if not openai_api_key:
    raise ValueError("No OpenAI API key found. Please set the OPENAI_API_KEY environment variable.")

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'your-secret-key')

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# In app.py, update the CUSTOM_PROMPT
CUSTOM_PROMPT = """You are a knowledgeable assistant specializing in the Sri Lankan tourism industry. Your insights are used by hotel companies, tourism sector investors, and policymakers. 

Structure your response in a clear, visually appealing format using markdown.

For numerical data, present it in charts. For lists, use proper bullet points. For trends, highlight key statistics with appropriate charts 

For prompts not related to the tourism industry, return “Sorry I am only specialized in the tourism sector, therefore I will not be able to assist you on this”

Summary: single sentence answer for the exact question asked.
Details: Key points in regular text with bullet points
Statistics: ONLY numerical data in the most appropriate chart type.
Commentary: Provide additional information and analysis that would help the user make an informed decision based on the data provided 


For charts, 

generate a python code using matplotlib

example output :

Summary: 
Sri Lanka's tourist arrivals saw a sharp decline from 2018 to 2020 due to the COVID-19 pandemic, followed by a significant recovery starting in 2021.

Details:
 * Between 2018 and 2019, there was a small increase in tourist arrivals with the majority being from Europe, followed by Asia Pacific, and the Americas.
 * Nonetheless, the global pandemic in 2020 led to a drastic fall in tourist arrivals in all regions. 
 * The recovery started in 2021, with a significant boost in 2022 and 2023 as travel restrictions were lifted globally. 

Statistics:

<generated python code>

Commentary: text


Context: {context}
Question: {question}
Previous conversation: {chat_history}

Important: Only use tables for numerical statistics. All other content should be in regular text format.
"""

class User(UserMixin):
    def __init__(self, id, username):
        self.id = id
        self.username = username

def extract_text_from_image(image_data):
    """Extract text from image using OCR"""
    try:
        image = Image.open(io.BytesIO(image_data))
        text = pytesseract.image_to_string(image)
        return text
    except Exception as e:
        print(f"OCR Error: {str(e)}")
        return ""

def init_db():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE NOT NULL,
                  password TEXT NOT NULL)''')
                  
    c.execute('''CREATE TABLE IF NOT EXISTS chat_history
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT NOT NULL,
                  title TEXT,
                  preview TEXT,
                  conversation TEXT,
                  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    
    conn.commit()
    conn.close()
    print("Database initialized successfully!")

def init_rag():
    print("\n=== Starting Enhanced RAG System Initialization ===")
    pdf_dir = os.path.join('static', 'pdfs')
    processed_files_path = os.path.join('static', 'processed_files.json')
    
    # Create directories if they don't exist
    if not os.path.exists(pdf_dir):
        os.makedirs(pdf_dir)
        print(f"Created PDF directory at: {pdf_dir}")
    
    # Load list of previously processed files
    processed_files = set()
    if os.path.exists(processed_files_path):
        with open(processed_files_path, 'r') as f:
            processed_files = set(json.load(f))
    
    try:
        pdf_files = [f for f in os.listdir(pdf_dir) if f.endswith('.pdf')]
        new_files = [f for f in pdf_files if f not in processed_files]
        
        if not pdf_files:
            print("No PDF files found in the directory!")
            return None
            
        print(f"\nFound {len(pdf_files)} PDF files, {len(new_files)} new files to process")
        
        # Initialize embeddings
        embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)
        
        # Try to load existing vectorstore
        if os.path.exists("chromadb") and os.listdir("chromadb"):
            print("\n=== Loading existing vector store ===")
            vectorstore = Chroma(
                persist_directory="chromadb",
                embedding_function=embeddings
            )
        else:
            print("\n=== Creating new vector store ===")
            vectorstore = None
        
        # Process only new files
        if new_files:
            new_documents = []
            for pdf_file in new_files:
                print(f"\nProcessing new file: {pdf_file}")
                pdf_path = os.path.join(pdf_dir, pdf_file)
                
                try:
                    # Use PyMuPDF for PDF processing
                    doc = pymupdf.open(pdf_path)
                    text = ""
                    
                    for page_num in range(len(doc)):
                        page = doc[page_num]
                        text += page.get_text()
                        
                        # Extract images and perform OCR
                        images = page.get_images(full=True)
                        for img_index, img in enumerate(images):
                            xref = img[0]
                            base_image = doc.extract_image(xref)
                            image_data = base_image["image"]
                            image_text = extract_text_from_image(image_data)
                            if image_text.strip():
                                text += f"\nImage content: {image_text}\n"
                    
                    new_documents.append(text)
                    processed_files.add(pdf_file)
                    print(f"Successfully processed {pdf_file}")
                    
                except Exception as e:
                    print(f"Error processing PDF {pdf_file}: {str(e)}")
                    continue
            
            if new_documents:
                # Text splitting for new documents
                text_splitter = RecursiveCharacterTextSplitter(
                    chunk_size=2000,
                    chunk_overlap=100,
                    length_function=len,
                    separators=["\n\n", "\n", " ", ""]
                )
                texts = text_splitter.create_documents(new_documents)
                
                # Add new documents to vectorstore
                if vectorstore is None:
                    print("\n=== Creating vector store with new documents ===")
                    vectorstore = Chroma.from_documents(
                        documents=texts,
                        embedding=embeddings,
                        persist_directory="chromadb"
                    )
                else:
                    print("\n=== Adding new documents to existing vector store ===")
                    vectorstore.add_documents(texts)
                
                # Save updated list of processed files
                with open(processed_files_path, 'w') as f:
                    json.dump(list(processed_files), f)
                
                # Persist the updated vectorstore
                vectorstore.persist()
        
        if vectorstore is None:
            print("\nNo documents were successfully processed")
            return None
        
        print("\n=== Initializing Enhanced QA Chain ===")
        llm = ChatOpenAI(
            temperature=1,
            model="gpt-4",
            max_tokens=2000
        )
        
        memory = ConversationBufferMemory(
            memory_key="chat_history",
            output_key="answer",
            return_messages=True
        )
        
        custom_prompt = PromptTemplate(
            template=CUSTOM_PROMPT,
            input_variables=["context", "question", "chat_history"]
        )

        qa_chain = ConversationalRetrievalChain.from_llm(
            llm=llm,
            retriever=vectorstore.as_retriever(
                search_type="mmr",
                search_kwargs={"k": 5}
            ),
            memory=memory,
            combine_docs_chain_kwargs={"prompt": custom_prompt},
            return_source_documents=True,
            return_generated_question=True,
            verbose=False
        )
        
        print("\n=== Enhanced RAG System Initialization Complete ===")
        return qa_chain
        
    except Exception as e:
        print(f"\nError initializing RAG system: {str(e)}")
        return None
@login_manager.user_loader
def load_user(user_id):
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('SELECT id, username FROM users WHERE id = ?', (user_id,))
    user_data = c.fetchone()
    conn.close()
    if user_data:
        return User(user_data[0], user_data[1])
    return None

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        try:
            hashed_password = generate_password_hash(password)
            c.execute('INSERT INTO users (username, password) VALUES (?, ?)',
                     (username, hashed_password))
            conn.commit()
            flash('Registration successful!', 'success')
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            flash('Username already exists!', 'error')
        finally:
            conn.close()
            
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        c.execute('SELECT * FROM users WHERE username = ?', (username,))
        user_data = c.fetchone()
        conn.close()
        
        if user_data and check_password_hash(user_data[2], password):
            user = User(user_data[0], user_data[1])
            login_user(user)
            return redirect(url_for('index'))
        else:
            flash('Invalid username or password!', 'error')
            
    return render_template('login.html')

@app.route('/chat', methods=['POST'])
@login_required
def chat():
    data = request.json
    question = data.get('question')
    chat_history = data.get('chat_history', [])
    conversation_id = data.get('conversation_id')
    
    try:
        if qa_chain:
            # Format chat history for the chain
            formatted_history = [(msg["question"], msg["answer"]) for msg in chat_history]
            
            # Get response from the chain
            result = qa_chain.invoke({  # Use invoke instead of __call__
                "question": question,
                "chat_history": formatted_history
            })
            
            # Extract answer from result
            response = result.get('answer', '')
            
            # Save to chat history
            conn = sqlite3.connect('database.db')
            c = conn.cursor()
            
            if not conversation_id:
                # Create new conversation
                c.execute('''INSERT INTO chat_history 
                            (username, title, preview, conversation, timestamp) 
                            VALUES (?, ?, ?, ?, ?)''',
                         (current_user.username,
                          question[:50] + "...",
                          response[:100] + "...",
                          json.dumps([{"question": question, "answer": response}]),
                          datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
                conversation_id = c.lastrowid
            else:
                # Update existing conversation
                c.execute('SELECT conversation FROM chat_history WHERE id = ?', (conversation_id,))
                result = c.fetchone()
                if result:
                    conversation = json.loads(result[0])
                    conversation.append({"question": question, "answer": response})
                    c.execute('UPDATE chat_history SET conversation = ? WHERE id = ?',
                             (json.dumps(conversation), conversation_id))
            
            conn.commit()
            conn.close()
            
            return jsonify({
                "response": response,
                "conversation_id": conversation_id
            })
        else:
            return jsonify({
                "response": "I apologize, but the RAG system is not properly initialized. Please contact support.",
                "conversation_id": conversation_id
            }), 500
            
    except Exception as e:
        print(f"Error in chat processing: {str(e)}")
        return jsonify({
            "response": "An error occurred while processing your request. Please try again later.",
            "conversation_id": conversation_id
        }), 500
    
    
@app.route('/chat_history')
@login_required
def get_chat_history():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('''SELECT id, title, preview, timestamp 
                 FROM chat_history 
                 WHERE username = ? 
                 ORDER BY timestamp DESC''', (current_user.username,))
    history = c.fetchall()
    conn.close()
    
    return jsonify([{
        'id': h[0],
        'title': h[1],
        'preview': h[2],
        'timestamp': h[3]
    } for h in history])

@app.route('/conversation/<int:conversation_id>')
@login_required
def get_conversation(conversation_id):
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('SELECT conversation FROM chat_history WHERE id = ? AND username = ?',
             (conversation_id, current_user.username))
    result = c.fetchone()
    conn.close()
    
    if result:
        return jsonify({'messages': json.loads(result[0])})
    return jsonify({'messages': []}), 404
@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out successfully!', 'success')
    return redirect(url_for('login'))
if __name__ == "__main__":
    init_db()
    qa_chain = init_rag()
    app.run(host='0.0.0.0', port=5001)
