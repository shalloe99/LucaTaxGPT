#!/bin/bash

echo "🚀 Starting LucaTaxGPT Backend Server..."

# Check if we're in the right directory
if [ ! -f "apps/backend/package.json" ]; then
    echo "❌ Error: Please run this script from the LucaTaxGPT root directory"
    exit 1
fi

# Kill any existing processes on port 5300
echo "🔍 Checking for existing processes on port 5300..."
EXISTING_PID=$(lsof -ti:5300)
if [ ! -z "$EXISTING_PID" ]; then
    echo "🛑 Found existing process on port 5300 (PID: $EXISTING_PID), killing it..."
    kill -9 $EXISTING_PID
    sleep 2
    echo "✅ Process killed"
else
    echo "✅ Port 5300 is available"
fi

# Check if backend dependencies are installed
if [ ! -d "apps/backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd apps/backend && npm install && cd ../..
fi

# Check if .env file exists
if [ ! -f "apps/backend/.env" ]; then
    echo "⚠️  Warning: No .env file found in backend directory"
    echo "📝 Creating .env file from example..."
    if [ -f "apps/backend/env.example" ]; then
        cp apps/backend/env.example apps/backend/.env
        echo "✅ Created .env file from example"
    else
        echo "❌ No env.example file found. Please create a .env file manually."
    fi
fi

# Start the backend server
echo "🌐 Starting backend server on port 5300..."
echo "🔧 Backend will be available at: http://localhost:5300"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

cd apps/backend
npm start 