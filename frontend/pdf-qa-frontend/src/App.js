import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Send, FileUp, FileText, X, Menu, AlertCircle } from 'lucide-react';
import './App.css';

const App = () => {
  
  const [file, setFile] = useState(null);
  const [pdfId, setPdfId] = useState('');
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadedPdfs, setUploadedPdfs] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const dropZoneRef = useRef(null);
  const conversationEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:8000/get_uploaded_pdfs/');
        setUploadedPdfs(response.data.pdfs);

        const savedPdfId = localStorage.getItem('pdfId');
        if (savedPdfId) {
          setPdfId(savedPdfId);
          await loadConversation(savedPdfId);
        }
      } catch (error) {
        setError('Failed to load saved documents. Please refresh the page.');
      }
    };
    loadSavedData();
  }, []);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  const loadConversation = async (selectedPdfId) => {
    try {
      setIsLoading(true);
      const response = await axios.get(`http://127.0.0.1:8000/get_conversation/?pdf_id=${selectedPdfId}`);
      setConversation(response.data.conversation || []);
      setError(null);
    } catch (error) {
      setError('Failed to load conversation history.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    validateAndSetFile(selectedFile);
  };

  const validateAndSetFile = (selectedFile) => {
    if (selectedFile?.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Please select a valid PDF file');
      setFile(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    validateAndSetFile(droppedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsLoading(true);
      const response = await axios.post('http://127.0.0.1:8000/upload_pdf/', formData);
      const newPdfId = response.data.pdf_id;

      setPdfId(newPdfId);
      localStorage.setItem('pdfId', newPdfId);
      setConversation([]);
      setError(null);
      setUploadedPdfs(prev => [
        ...prev,
        {
          pdf_id: newPdfId,
          filename: file.name,
          upload_date: new Date().toISOString()
        }
      ]);
    } catch (error) {
      setError('Upload failed. Please try again.');
    } finally {
      setIsLoading(false);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAskQuestion = async () => {
    if (!pdfId || !question.trim()) return;

    try {
      setIsLoading(true);
      setError(null);

      const newQuestion = question.trim();
      setQuestion('');

      setConversation(prev => [
        ...prev,
        {
          question: newQuestion,
          answer: null,
          timestamp: new Date().toISOString()
        }
      ]);

      const response = await axios.post('http://127.0.0.1:8000/ask_question', {
        question: newQuestion,
        pdf_id: pdfId,
      });

      setConversation(prev => {
        const updated = [...prev];
        updated[updated.length - 1].answer = response.data.answer;
        return updated;
      });

    } catch (error) {
      setError('Failed to get answer. Please try again.');
      setConversation(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
  };

  return (
    <div className="app-container">
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">Documents</h2>
          <button 
            className="close-sidebar"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={25} />
          </button>
        </div>
        
        <div className="pdf-list">
          {uploadedPdfs.map((pdf) => (
            <div
              key={pdf.pdf_id}
              className={`pdf-item ${pdf.pdf_id === pdfId ? 'active' : ''}`}
              onClick={() => {
                setPdfId(pdf.pdf_id);
                loadConversation(pdf.pdf_id);
                setIsSidebarOpen(false);
              }}
            >
              <FileText className="pdf-icon" size={25} />
              <div className="pdf-info">
                <div className="pdf-name">{pdf.filename}</div>
                <div className="pdf-date">
                  {new Date(pdf.upload_date).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="main-content">
        <header className="header">
          <button
            className="menu-button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <Menu size={24} />
          </button>
          <img src="logo_new.png" alt="Logo" className="logo" />
          <div 
            className={`drop-zone ${isDragging ? 'drag-over' : ''}`}
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <FileUp size={48} className="upload-icon" />
            <p className="upload-text">
              Drag & drop your PDF here or{' '}
              <label className="file-label">
                browse
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".pdf"
                  className="hidden-input"
                />
              </label>
            </p>
            {file && (
              <button
                className="upload-button"
                onClick={handleUpload}
                disabled={isLoading}
              >
                {isLoading ? 'Uploading...' : 'Upload PDF'}
              </button>
            )}
          </div>
        </header>

        <div className="conversation">
          {error && (
            <div className="error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          
          {conversation.map((entry, index) => (
            <div key={index} className="message">
              <div className="question">{entry.question}</div>
              {entry.answer !== null ? (
                <div className="answer">{entry.answer}</div>
              ) : (
                <div className="loading">
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                </div>
              )}
            </div>
          ))}
          <div ref={conversationEndRef} />
        </div>

        <div className="input-section">
          <div className="input-container">
            <textarea
              className="question-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask a question about the PDF..."
              disabled={!pdfId}
            />
            <button
              className="send-button"
              onClick={handleAskQuestion}
              disabled={isLoading || !question.trim() || !pdfId}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
