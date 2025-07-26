# LucaTaxGPT - AI Tax Assistant

An intelligent tax assistance platform powered by official IRS documents and AI. This project combines web crawling, document processing, and AI-powered chat to provide accurate tax information and guidance.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Git** - For cloning the repository

### 1. Clone and Setup
```bash
git clone <repository-url>
cd LucaTaxGPT
npm run setup
```

Or run the setup script directly:
```bash
chmod +x setup.sh
./setup.sh
```

The setup script will automatically:
- ✅ Check Node.js version
- ✅ Install all dependencies (frontend + backend)
- ✅ Create environment configuration
- ✅ Check Ollama and ChromaDB status
- ✅ Create necessary directories
- ✅ Verify the setup

### 2. Configure AI Models

The application supports both cloud-based ChatGPT and local Ollama models.

#### Option A: ChatGPT (Cloud-based)
1. Get an OpenAI API key from [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Configure it:
   ```bash
   cd backend
   npm run setup-openai
   ```
   Or manually edit `backend/.env`:
   ```bash
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```

#### Option B: Ollama (Local Models)
1. Install Ollama from [https://ollama.com/download](https://ollama.com/download)
2. Start Ollama:
   ```bash
   ollama serve
   ```
3. Download a model:
   ```bash
   ollama pull llama3.2:latest
   ```

### 3. Start the Application
```bash
npm run dev
```

Access the application:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5300

---

## 🏗️ Project Structure

```
LucaTaxGPT/
├── setup.sh                    # Comprehensive setup script
├── src/                        # Frontend (Next.js)
│   ├── app/                   # Next.js app directory
│   │   ├── layout.tsx        # Root layout
│   │   ├── page.tsx          # Main page with 3-panel layout
│   │   └── globals.css       # Global styles
│   └── components/           # React components
│       ├── ChatbotPanel.tsx  # Main chat interface
│       ├── ProfilePanel.tsx  # User profile management
│       ├── AdminPanel.tsx    # Admin/crawler management
│       ├── ChatHistory.tsx   # Chat history sidebar
│       ├── ContextFilters.tsx # Context filtering
│       └── ModelSelector.tsx # AI model selection
├── backend/                   # Backend (Express.js)
│   ├── server.js             # Main server file
│   ├── package.json          # Backend dependencies
│   ├── env.example           # Environment variables template
│   ├── setup-openai.js       # OpenAI API setup script
│   ├── models/               # Database models
│   │   └── Chat.js          # Chat conversation model
│   ├── routes/               # API routes
│   │   ├── chat.js          # Chat API endpoints
│   │   ├── crawler.js       # Web crawler API
│   │   ├── admin.js         # Admin management API
│   │   └── profile.js       # User profile API
│   ├── services/            # Business logic services
│   │   ├── crawlerService.js # Web crawling logic
│   │   ├── analysisService.js # Document analysis & tagging
│   │   ├── embeddingService.js # Vector embeddings & search
│   │   ├── chatService.js   # AI chat functionality
│   │   ├── jobService.js    # Job management service
│   │   ├── storageService.js # Local file storage service
│   │   └── aiService.js     # AI model integration
│   └── storage/             # Local file storage
│       ├── files/           # Downloaded files
│       └── metadata/        # File metadata JSON
├── package.json              # Frontend dependencies
└── README.md                 # This file
```

## 🚀 Features

### Frontend
- **Three-Panel Layout**: Chatbot, Profile, and Admin panels
- **Dual AI Model Support**: Switch between ChatGPT and local Ollama models
- **Context Filtering**: Choose federal/state tax codes and profile tags
- **Dynamic User Profiles**: Add tags and context for personalized assistance
- **Real-time Chat Interface**: AI-powered tax assistance with document references
- **Admin Dashboard**: Monitor crawler status and manage documents
- **Chat History**: Persistent conversation management

### Backend
- **Three-Stage Web Crawler**: Discovery → Preparation → Selection with user-in-the-loop
- **Local File Storage**: S3-like structure with organized directories and JSON metadata
- **Asynchronous Job Processing**: Real-time progress tracking with load bars
- **Document Processing**: Extract text, analyze content, and create tags
- **Vector Embeddings**: Semantic search using ChromaDB
- **AI Chat**: GPT-4 powered responses with document context
- **Model Management**: Support for both OpenAI and local Ollama models

## 🔧 Configuration

### Environment Variables
The setup script creates `backend/.env` from `backend/env.example`. Key variables:

```bash
# Required for ChatGPT
OPENAI_API_KEY=sk-your-openai-api-key-here

# Optional for local models
OLLAMA_BASE_URL=http://localhost:11434

# Optional for vector search
CHROMA_URL=http://localhost:8000

# Server configuration
PORT=5300
FRONTEND_URL=http://localhost:3000
```

### AI Models
- **ChatGPT**: Requires OpenAI API key, supports GPT-4o-mini
- **Ollama**: Local models like llama3.2, mistral, codellama
- **Model Switching**: Real-time switching between models in the UI

## 🛠️ Development

### Available Scripts
```bash
# Development
npm run dev              # Start both frontend and backend
npm run dev:frontend     # Start frontend only
npm run dev:backend      # Start backend only

# Build
npm run build           # Build for production
npm run start           # Start production server

# Setup & Maintenance
npm run setup           # Complete setup
npm run cleanup         # Clean up installation (preserves .env)
cd backend && npm run setup-openai  # Configure OpenAI API
```

### Troubleshooting

#### OpenAI Issues
- **Missing API Key**: Run `cd backend && npm run setup-openai`
- **Invalid Key**: Verify key starts with "sk-" and has sufficient credits
- **Rate Limits**: Wait and retry, or upgrade your OpenAI plan

#### Ollama Issues
- **Not Running**: Start with `ollama serve`
- **No Models**: Download with `ollama pull llama3.2:latest`
- **Connection Error**: Check if Ollama is running on port 11434

#### General Issues
- **Port Conflicts**: Change ports in `backend/.env`
- **Dependencies**: Run `npm run setup` to reinstall
- **Build Errors**: Clear `.next` folder and rebuild
- **Clean Installation**: Run `npm run cleanup` to remove all dependencies and rebuild from scratch

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
- Check the troubleshooting section above
- Review the setup logs
- Open an issue on GitHub