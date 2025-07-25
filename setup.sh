#!/bin/bash

echo "🚀 Setting up LucaTaxGPT..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm install

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..

# Create environment file if it doesn't exist
if [ ! -f "backend/.env" ]; then
    echo "🔧 Creating environment file..."
    cp backend/env.example backend/.env
    echo "⚠️  Please edit backend/.env with your configuration:"
    echo "   - MONGODB_URI"
    echo "   - OPENAI_API_KEY"
    echo "   - CHROMA_URL (optional)"
else
    echo "✅ Environment file already exists"
fi

# Check if MongoDB is running
echo "🔍 Checking MongoDB status..."
if command -v mongod &> /dev/null; then
    if pgrep -x "mongod" > /dev/null; then
        echo "✅ MongoDB is running"
    else
        echo "⚠️  MongoDB is not running. Please start MongoDB:"
        echo "   mongod"
    fi
else
    echo "⚠️  MongoDB is not installed. Please install MongoDB:"
    echo "   https://docs.mongodb.com/manual/installation/"
fi

# Check if ChromaDB is running (optional)
echo "🔍 Checking ChromaDB status..."
if command -v docker &> /dev/null; then
    if docker ps | grep -q "chromadb/chroma"; then
        echo "✅ ChromaDB is running"
    else
        echo "ℹ️  ChromaDB is not running. To start it:"
        echo "   docker run -p 8000:8000 chromadb/chroma"
    fi
else
    echo "ℹ️  Docker not found. ChromaDB is optional for vector search."
fi

# Create storage directories
echo "📁 Creating storage directories..."
mkdir -p backend/storage/files
mkdir -p backend/storage/metadata

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env with your configuration"
echo "2. Start MongoDB: mongod"
echo "3. Start ChromaDB (optional): docker run -p 8000:8000 chromadb/chroma"
echo "4. Start the application: npm run dev"
echo ""
echo "Frontend will be available at: http://localhost:3000"
echo "Backend will be available at: http://localhost:5000" 