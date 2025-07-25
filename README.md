# LucaTaxGPT - AI Tax Assistant

An intelligent tax assistance platform powered by official IRS documents and AI. This project combines web crawling, document processing, and AI-powered chat to provide accurate tax information and guidance.

---

## 🆕 Quickstart for New Developers

### 1. Clone the repository
```bash
git clone <repository-url>
cd LucaTaxGPT
```

### 2. Install dependencies
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 3. Set up environment variables
```bash
cp backend/env.example backend/.env
```
Edit `backend/.env` with your configuration (see below).

### 4. Start MongoDB (if running locally)
```bash
mongod
```

### 5. (Optional) Start ChromaDB for vector search
```bash
docker run -p 8000:8000 chromadb/chroma
```

### 6. Set up Ollama for Local LLM (Llama 3.2)

Ollama is required for local LLM chat functionality. You can use it to run models like llama3.2:latest on your machine.

#### a. Install Ollama
- Visit: https://ollama.com/download
- Download and install for your OS (macOS, Linux, Windows)

#### b. Download the llama3.2:latest model
```bash
ollama pull llama3.2:latest
```

#### c. Start Ollama with llama3.2:latest
```bash
ollama run llama3.2:latest
```

Ollama will start a local server (default: http://localhost:11434) and download the model if not already present.

#### Troubleshooting Ollama
- If you see errors about missing models, make sure you have run `ollama pull llama3.2:latest`.
- If the Ollama server is not running, start it with `ollama serve` or `ollama run llama3.2:latest`.
- For more help, see https://ollama.com/docs

### 7. Start the application
```bash
# Start both frontend and backend
npm run dev

# Or start separately:
npm run dev:frontend  # Frontend on http://localhost:3000
npm run dev:backend   # Backend on http://localhost:5000
```

---

## 🏗️ Project Structure

```
LucaTaxGPT/
├── src/                          # Frontend (Next.js)
│   ├── app/                     # Next.js app directory
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Main page with 3-panel layout
│   │   └── globals.css         # Global styles
│   └── components/             # React components
│       ├── ChatbotPanel.tsx    # Main chat interface
│       ├── ProfilePanel.tsx    # User profile management
│       ├── AdminPanel.tsx      # Admin/crawler management
│       └── DomainSelector.tsx  # Tax domain selection
├── backend/                     # Backend (Express.js)
│   ├── server.js               # Main server file
│   ├── package.json            # Backend dependencies
│   ├── env.example             # Environment variables template
│   ├── models/                 # Database models
│   │   ├── Chat.js            # Chat conversation model
│   │   ├── Document.js        # Tax document model
│   │   ├── UserProfile.js     # User profile model
│   │   └── Job.js             # Crawler job model
│   ├── routes/                 # API routes
│   │   ├── chat.js            # Chat API endpoints
│   │   ├── crawler.js         # Web crawler API
│   │   ├── admin.js           # Admin management API
│   │   └── profile.js         # User profile API
│   ├── services/              # Business logic services
│   │   ├── crawlerService.js  # Web crawling logic
│   │   ├── analysisService.js # Document analysis & tagging
│   │   ├── embeddingService.js # Vector embeddings & search
│   │   ├── chatService.js     # AI chat functionality
│   │   ├── jobService.js      # Job management service
│   │   └── storageService.js  # Local file storage service
│   └── storage/               # Local file storage (S3-like structure)
│       ├── files/             # Downloaded files
│       └── metadata/          # File metadata JSON
├── package.json                # Frontend dependencies
└── README.md                   # This file
```

## 🚀 Features

### Frontend
- **Three-Panel Layout**: Chatbot, Profile, and Admin panels
- **Domain Knowledge Selection**: Choose federal/state tax codes and filing entities
- **Dynamic User Profiles**: Add tags and context for personalized assistance
- **Real-time Chat Interface**: AI-powered tax assistance with document references
- **Admin Dashboard**: Monitor crawler status and manage documents

### Backend
- **Three-Stage Web Crawler**: Discovery → Preparation → Selection with user-in-the-loop
- **Local File Storage**: S3-like structure with organized directories and JSON metadata
- **Asynchronous Job Processing**: Real-time progress tracking with load bars
- **Document Processing**: Extract text, analyze content, and create tags
- **Vector Embeddings**: Semantic search using ChromaDB
- **AI Chat**: GPT-4 powered responses with document context
- **RESTful APIs**: Complete API for all functionality

## 🛠️ Technology Stack

### Frontend
- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Lucide React** - Icons

### Backend
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **OpenAI API** - AI chat and embeddings
- **ChromaDB** - Vector database
- **Puppeteer** - Web crawling
- **Cheerio** - HTML parsing
- **PDF-parse** - PDF text extraction

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB
- OpenAI API key
- ChromaDB (optional, for vector search)
- Ollama (optional, for local LLM chat)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd LucaTaxGPT
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   cd ..
   ```

4. **Set up environment variables**
   ```bash
   cp backend/env.example backend/.env
   ```
   
   Edit `backend/.env` with your configuration:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/lucataxgpt
   OPENAI_API_KEY=your_openai_api_key_here
   CHROMA_URL=http://localhost:8000
   ```

5. **Start MongoDB** (if running locally)
   ```bash
   mongod
   ```

6. **Start ChromaDB** (optional, for vector search)
   ```bash
   docker run -p 8000:8000 chromadb/chroma
   ```

7. **Set up Ollama for Local LLM (Llama 3.2)** (optional, for local LLM chat)

    Ollama is required for local LLM chat functionality. You can use it to run models like llama3.2:latest on your machine.

    #### a. Install Ollama
    - Visit: https://ollama.com/download
    - Download and install for your OS (macOS, Linux, Windows)

    #### b. Download the llama3.2:latest model
    ```bash
    ollama pull llama3.2:latest
    ```

    #### c. Start Ollama with llama3.2:latest
    ```bash
    ollama run llama3.2:latest
    ```

    Ollama will start a local server (default: http://localhost:11434) and download the model if not already present.

    #### Troubleshooting Ollama
    - If you see errors about missing models, make sure you have run `ollama pull llama3.2:latest`.
    - If the Ollama server is not running, start it with `ollama serve` or `ollama run llama3.2:latest`.
    - For more help, see https://ollama.com/docs

## 🚀 Running the Application

### Development Mode
```bash
# Start both frontend and backend
npm run dev

# Or start separately:
npm run dev:frontend  # Frontend on http://localhost:3000
npm run dev:backend   # Backend on http://localhost:5000
```

### Production Mode
```bash
npm run build
npm start
```

## 📖 Usage

### 1. Domain Knowledge Selection
- Select federal tax code (enabled by default)
- Choose state for state-specific questions
- Select filing entity type (individual, business, etc.)

### 2. Chat Interface
- Ask tax-related questions
- Get AI responses with document references
- View relevant IRS forms and publications

### 3. User Profile
- Add personal context (e.g., "married with two kids")
- Create custom tags for better personalization
- Set filing entity and state preferences

### 4. Admin Panel
- **Overview**: System statistics and quick actions
- **Crawler**: Start new web crawls of IRS website
- **Documents**: Manage document processing pipeline
- **Logs**: Monitor system activity

## 🔄 Three-Stage Document Processing Pipeline

### Stage 1: Discovery
- Crawl website to find all relevant resources
- Rank resources by importance (PDFs, forms, instructions)
- Build dependency tree and categorize content
- Admin reviews and selects resources for next stage

### Stage 2: Preparation
- Filter resources to only downloadable URLs
- Collect metadata (file size, content type, last modified)
- Verify accessibility and downloadability
- Admin selects which resources to download

### Stage 3: Selection
- Download selected files to local storage
- Extract text content from PDFs and documents
- Create vector embeddings for semantic search
- Process and tag content for AI context

### Local Storage Structure
```
storage/
├── files/
│   └── documents/
│       └── 2024/
│           └── 01/
│               └── 15/
│                   └── [url-hash]/
│                       └── filename.pdf
└── metadata/
    └── documents/
        └── 2024/
            └── 01/
                └── 15/
                    └── [url-hash]/
                        └── filename.pdf.json
```

## 🗄️ Database Schema

### Chat Model
```javascript
{
  userId: String,
  sessionId: String,
  title: String,
  messages: [{
    role: 'user' | 'assistant' | 'system',
    content: String,
    timestamp: Date,
    metadata: Object
  }],
  domainKnowledge: {
    federalTaxCode: Boolean,
    stateTaxCode: String,
    filingEntity: String
  },
  userProfile: {
    tags: [String],
    context: String
  }
}
```

### Document Model
```javascript
{
  title: String,
  formNumber: String,
  year: Number,
  category: String,
  sourceUrl: String,
  pdfUrl: String,
  localPath: String,
  content: String,
  tags: [String],
  embeddings: [Number],
  status: 'pending' | 'downloaded' | 'processed' | 'embedded' | 'error'
}
```

### Job Model
```javascript
{
  jobId: String,
  websiteUrl: String,
  stage: 'discovery' | 'preparation' | 'selection' | 'completed' | 'error',
  progress: Number,
  status: 'running' | 'paused' | 'completed' | 'error',
  discoveryResults: {
    resources: [Resource],
    dependencyTree: Object,
    totalResources: Number
  },
  preparationResults: {
    downloadableResources: [PreparedResource],
    totalDownloadable: Number
  },
  selectionResults: {
    selectedResources: [Object],
    totalSelected: Number,
    downloadedCount: Number,
    processedCount: Number,
    embeddedCount: Number
  }
}
```

### UserProfile Model
```javascript
{
  userId: String,
  tags: [String],
  context: String,
  filingEntity: String,
  state: String,
  preferences: Object
}
```

## 🔌 API Endpoints

### Chat API
- `POST /api/chat/session` - Create new chat session
- `POST /api/chat/message` - Send message and get response
- `GET /api/chat/history/:sessionId` - Get chat history
- `GET /api/chat/sessions/:userId` - Get user's chat sessions

### Crawler API
- `POST /api/crawler/start` - Start web crawling
- `POST /api/crawler/download` - Download documents
- `POST /api/crawler/process` - Process documents
- `POST /api/crawler/analyze` - Analyze and tag documents
- `POST /api/crawler/embed` - Create embeddings
- `GET /api/crawler/status` - Get crawler statistics

### Admin Job Management API
- `POST /api/admin/jobs` - Create new crawler job
- `POST /api/admin/jobs/:jobId/discovery` - Start discovery stage
- `POST /api/admin/jobs/:jobId/preparation` - Start preparation stage
- `POST /api/admin/jobs/:jobId/selection` - Start selection stage
- `GET /api/admin/jobs/:jobId` - Get job status and details
- `GET /api/admin/jobs` - Get all jobs
- `DELETE /api/admin/jobs/:jobId` - Delete job
- `GET /api/admin/storage/stats` - Get storage statistics
- `GET /api/admin/storage/files` - List stored files
- `GET /api/admin/storage/files/:key` - Get file metadata
- `DELETE /api/admin/storage/files/:key` - Delete file

### Profile API
- `GET /api/profile/:userId` - Get user profile
- `PUT /api/profile/:userId` - Update user profile
- `POST /api/profile/:userId/tags` - Add tag
- `DELETE /api/profile/:userId/tags/:tag` - Remove tag

### Admin API
- `GET /api/admin/overview` - System overview
- `POST /api/admin/test-crawler` - Test crawler functions
- `GET /api/admin/logs` - System logs

## 🔒 Security Considerations

- Rate limiting on API endpoints
- Input validation and sanitization
- CORS configuration
- Environment variable protection
- Error handling without sensitive data exposure

## 🧪 Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests (when implemented)
npm test
```

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/lucataxgpt` |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `CHROMA_URL` | ChromaDB URL | `http://localhost:8000` |
| `JWT_SECRET` | JWT signing secret | Required for auth |
| `NODE_ENV` | Environment mode | `development` |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This application is for educational and informational purposes only. It should not be considered as professional tax advice. Always consult with a qualified tax professional for your specific tax situation.

## 🆘 Support

For issues and questions:
1. Check the documentation
2. Search existing issues
3. Create a new issue with detailed information

## 🔮 Future Enhancements

- [ ] User authentication and authorization
- [ ] Multi-language support
- [ ] Advanced document search filters
- [ ] Export chat conversations
- [ ] Integration with tax filing software
- [ ] Real-time notifications
- [ ] Mobile app version
- [ ] Advanced analytics dashboard