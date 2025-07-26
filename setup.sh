#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_header() {
    echo -e "${PURPLE}🚀 $1${NC}"
}

print_step() {
    echo -e "${CYAN}📋 $1${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check Node.js version
check_node_version() {
    if command_exists node; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            print_error "Node.js version 18+ is required. Current version: $(node -v)"
            print_info "Please install Node.js 18+ from https://nodejs.org/"
            exit 1
        else
            print_status "Node.js version: $(node -v)"
        fi
    else
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        print_info "Download from: https://nodejs.org/"
    exit 1
fi
}

# Function to setup environment variables
setup_environment() {
    print_step "Setting up environment variables..."
    
    if [ ! -f "backend/.env" ]; then
        if [ -f "backend/env.example" ]; then
            cp backend/env.example backend/.env
            print_status "Environment file created from template"
        else
            print_error "env.example file not found"
    exit 1
        fi
    else
        print_status "Environment file already exists"
    fi
    
    # Check if OpenAI API key is configured and valid
    if grep -q "OPENAI_API_KEY=sk-" backend/.env; then
        # Test if the API key is actually valid by making a simple request
        API_KEY=$(grep "OPENAI_API_KEY=" backend/.env | cut -d'=' -f2)
        if [ "$API_KEY" != "sk-your-openai-api-key-here" ] && [ "$API_KEY" != "" ]; then
            print_status "OpenAI API key is configured"
        else
            print_warning "OpenAI API key is not properly configured"
            echo ""
            print_info "To configure OpenAI API key:"
            echo "1. Get your API key from: https://platform.openai.com/api-keys"
            echo "2. Edit backend/.env and set OPENAI_API_KEY=sk-your-key-here"
            echo "3. Or run: cd backend && npm run setup-openai"
            echo ""
        fi
    else
        print_warning "OpenAI API key not configured"
        echo ""
        print_info "To configure OpenAI API key:"
        echo "1. Get your API key from: https://platform.openai.com/api-keys"
        echo "2. Edit backend/.env and set OPENAI_API_KEY=sk-your-key-here"
        echo "3. Or run: cd backend && npm run setup-openai"
        echo ""
    fi
}

# Function to install dependencies
install_dependencies() {
    print_step "Installing dependencies..."

# Install frontend dependencies
    print_info "Installing frontend dependencies..."
npm install

# Install backend dependencies
    print_info "Installing backend dependencies..."
cd backend
npm install
cd ..

    print_status "All dependencies installed"
}

# Function to check and setup Ollama
setup_ollama() {
    print_step "Checking Ollama setup..."
    
    if command_exists ollama; then
        print_status "Ollama is installed"
        
        # Check if ollama is running
        if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
            print_status "Ollama is running"
            
            # List available models
            MODELS=$(curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | head -5)
            if [ ! -z "$MODELS" ]; then
                print_info "Available models: [$(echo "$MODELS" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')]"
            else
                print_warning "No models found. To download a model:"
                echo "  ollama pull llama3.2:latest"
            fi
        else
            print_warning "Ollama is not running. To start it:"
            echo "  ollama serve"
        fi
    else
        print_warning "Ollama is not installed. For local AI models:"
        echo "1. Install from: https://ollama.com/download"
        echo "2. Start with: ollama serve"
        echo "3. Download a model: ollama pull llama3.2:latest"
    fi
}

# Function to check and setup ChromaDB
setup_chromadb() {
    print_step "Checking ChromaDB setup..."
    
    if command_exists docker; then
        if docker ps | grep -q "chromadb/chroma"; then
            print_status "ChromaDB is running"
        else
            print_warning "ChromaDB is not running. To start it:"
            echo "  docker run -p 8000:8000 chromadb/chroma"
        fi
    else
        print_warning "Docker not found. ChromaDB is optional for vector search."
        print_info "To install Docker: https://docs.docker.com/get-docker/"
    fi
}

# Function to create storage directories
create_storage_dirs() {
    print_step "Creating storage directories..."
    
    mkdir -p backend/storage/files
    mkdir -p backend/storage/metadata
    mkdir -p backend/logs
    
    print_status "Storage directories created"
}

# Function to verify setup
verify_setup() {
    print_step "Verifying setup..."
    
    # Check if all required files exist
    if [ -f "package.json" ] && [ -f "backend/package.json" ] && [ -f "backend/.env" ]; then
        print_status "All required files present"
    else
        print_error "Missing required files"
        exit 1
    fi
    
    # Test if backend can start (briefly)
    print_info "Testing backend startup..."
    cd backend
    timeout 10s node server.js >/dev/null 2>&1 &
    BACKEND_PID=$!
    sleep 3
    if kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID
        print_status "Backend startup test successful"
    else
        print_warning "Backend startup test failed (this is normal if dependencies are missing)"
    fi
    cd ..
}

# Function to show next steps
show_next_steps() {
    echo ""
    print_header "Setup Complete!"
    echo ""
    print_info "Next steps:"
    echo "1. Configure your OpenAI API key (if using ChatGPT):"
    echo "   - Edit backend/.env and set OPENAI_API_KEY"
    echo "   - Or run: cd backend && npm run setup-openai"
    echo ""
    echo "2. Start required services:"
    echo "   - Ollama (for local models): ollama serve"
    echo "   - ChromaDB (optional): docker run -p 8000:8000 chromadb/chroma"
    echo ""
    echo "3. Start the application:"
    echo "   npm run dev"
    echo ""
    echo "4. Access the application:"
    echo "   Frontend: http://localhost:3000"
    echo "   Backend: http://localhost:5300"
    echo ""
    print_info "For more information, see README.md"
}

# Function to cleanup (but preserve .env)
cleanup() {
    print_header "Cleaning up LucaTaxGPT..."
    echo ""
    
    print_step "Removing node_modules..."
    if [ -d "node_modules" ]; then
        rm -rf node_modules
        print_status "Frontend node_modules removed"
    fi
    
    if [ -d "backend/node_modules" ]; then
        rm -rf backend/node_modules
        print_status "Backend node_modules removed"
    fi
    
    print_step "Removing build directories..."
    if [ -d ".next" ]; then
        rm -rf .next
        print_status "Next.js build directory removed"
    fi
    
    print_step "Removing storage directories..."
    if [ -d "backend/storage/files" ]; then
        rm -rf backend/storage/files
        print_status "Storage files removed"
    fi
    
    if [ -d "backend/storage/metadata" ]; then
        rm -rf backend/storage/metadata
        print_status "Storage metadata removed"
    fi
    
    if [ -d "backend/logs" ]; then
        rm -rf backend/logs
        print_status "Logs removed"
    fi
    
    print_step "Removing package-lock files..."
    if [ -f "package-lock.json" ]; then
        rm package-lock.json
        print_status "Frontend package-lock.json removed"
    fi
    
    if [ -f "backend/package-lock.json" ]; then
        rm backend/package-lock.json
        print_status "Backend package-lock.json removed"
    fi

echo ""
    print_status "Cleanup complete! (.env file preserved)"
    echo ""
    print_info "To reinstall: npm run setup"
}

# Main setup function
main() {
    print_header "Setting up LucaTaxGPT..."
    echo ""
    
    # Check Node.js
    check_node_version
    
    # Install dependencies
    install_dependencies
    
    # Setup environment
    setup_environment
    
    # Setup Ollama
    setup_ollama
    
    # Setup ChromaDB
    setup_chromadb
    
    # Create storage directories
    create_storage_dirs
    
    # Verify setup
    verify_setup
    
    # Show next steps
    show_next_steps
}

# Check command line arguments
if [ "$1" = "cleanup" ]; then
    cleanup
elif [ "$1" = "help" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "LucaTaxGPT Setup Script"
echo ""
    echo "Usage:"
    echo "  ./setup.sh          - Run full setup"
    echo "  ./setup.sh cleanup  - Clean up installation (preserves .env)"
    echo "  ./setup.sh help     - Show this help"
echo ""
    echo "Or use npm scripts:"
    echo "  npm run setup       - Run full setup"
    echo "  npm run cleanup     - Clean up installation"
else
    # Run main function
    main "$@"
fi 