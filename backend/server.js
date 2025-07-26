const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: './backend/.env' });

// Debug environment variables
console.log('🔍 Environment check:');
console.log('  - OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);
console.log('  - OPENAI_API_KEY length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);
console.log('  - NODE_ENV:', process.env.NODE_ENV);

const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import routes
const chatRoutes = require('./routes/chat');
const crawlerRoutes = require('./routes/crawler');
const adminRoutes = require('./routes/admin');
const profileRoutes = require('./routes/profile');
const { bootstrapDemoData } = require('./models/Chat');
const { initializeServices } = require('./services/aiService');

// Initialize demo data and AI services
bootstrapDemoData();

// Set up routes
app.use('/api/chat', chatRoutes);
app.use('/api/crawler', crawlerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5300;

// Initialize AI services before starting the server
initializeServices().then(success => {
  if (!success) {
    console.warn('⚠️ Some AI services may not be available. Check the logs above for details.');
  }
  
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  }); 
  
  // Increase server timeout to 5 minutes for long LLM calls
  server.setTimeout(300000); // 300,000 ms = 5 minutes
}).catch(error => {
  console.error('❌ Failed to initialize AI services:', error);
  
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  }); 
  
  // Increase server timeout to 5 minutes for long LLM calls
  server.setTimeout(300000); // 300,000 ms = 5 minutes
}); 