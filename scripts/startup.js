#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logHeader(message) {
  log(`🚀 ${message}`, 'magenta');
}

function logStep(message) {
  log(`📋 ${message}`, 'cyan');
}

// Check if a port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

// Kill process on a specific port
function killProcessOnPort(port) {
  try {
    const output = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim();
    if (output) {
      const pids = output.split('\n');
      pids.forEach(pid => {
        try {
          execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
          logSuccess(`Killed process ${pid} on port ${port}`);
        } catch (e) {
          // Process might already be dead
        }
      });
      return true;
    }
  } catch (e) {
    // No process found on port
  }
  return false;
}

// Check if dependencies are installed
function checkDependencies() {
  const frontendDeps = path.join(__dirname, '..', 'node_modules');
  const backendDeps = path.join(__dirname, '..', 'apps', 'backend', 'node_modules');
  
  if (!fs.existsSync(frontendDeps)) {
    logStep('Installing frontend dependencies...');
    try {
      execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
      logSuccess('Frontend dependencies installed');
    } catch (e) {
      logError('Failed to install frontend dependencies');
      process.exit(1);
    }
  } else {
    logSuccess('Frontend dependencies already installed');
  }
  
  if (!fs.existsSync(backendDeps)) {
    logStep('Installing backend dependencies...');
    try {
      execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, '..', 'apps', 'backend') });
      logSuccess('Backend dependencies installed');
    } catch (e) {
      logError('Failed to install backend dependencies');
      process.exit(1);
    }
  } else {
    logSuccess('Backend dependencies already installed');
  }
}

// Check environment setup
function checkEnvironment() {
  const envFile = path.join(__dirname, '..', 'apps', 'backend', '.env');
  const envExample = path.join(__dirname, '..', 'apps', 'backend', 'env.example');
  
  if (!fs.existsSync(envFile)) {
    if (fs.existsSync(envExample)) {
      logStep('Creating environment file from template...');
      try {
        fs.copyFileSync(envExample, envFile);
        logSuccess('Environment file created from template');
      } catch (e) {
        logError('Failed to create environment file');
        process.exit(1);
      }
    } else {
      logWarning('No env.example file found');
    }
  } else {
    logSuccess('Environment file already exists');
  }
}

// Wait for a service to be ready
function waitForService(url, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const check = () => {
      attempts++;
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          if (attempts >= maxAttempts) {
            reject(new Error(`Service not ready after ${maxAttempts} attempts`));
          } else {
            setTimeout(check, 1000);
          }
        }
      }).on('error', () => {
        if (attempts >= maxAttempts) {
          reject(new Error(`Service not ready after ${maxAttempts} attempts`));
        } else {
          setTimeout(check, 1000);
        }
      });
    };
    
    check();
  });
}

// Start the development servers
async function startDevServers() {
  logHeader('Starting LucaTaxGPT Development Environment');
  
  // Check and kill existing processes
  logStep('Checking for existing processes...');
  const frontendKilled = killProcessOnPort(3000);
  const backendKilled = killProcessOnPort(5300);
  
  if (frontendKilled || backendKilled) {
    logInfo('Waiting for processes to fully terminate...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Check dependencies
  checkDependencies();
  
  // Check environment
  checkEnvironment();
  
  // Set environment variables
  process.env.NODE_OPTIONS = '--no-deprecation';
  
  logStep('Starting frontend and backend servers...');
  logInfo('Frontend will be available at: http://localhost:3000');
  logInfo('Backend will be available at: http://localhost:5300');
  logInfo('Press Ctrl+C to stop both servers');
  console.log('');
  
  // Start frontend
  const frontend = spawn('npm', ['run', 'dev:frontend'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_OPTIONS: '--no-deprecation' }
  });
  
  // Start backend
  const backend = spawn('npm', ['run', 'dev:backend'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_OPTIONS: '--no-deprecation' }
  });
  
  // Wait for services to be ready
  setTimeout(async () => {
    try {
      await waitForService('http://localhost:3000');
      logSuccess('Frontend is ready at http://localhost:3000');
    } catch (e) {
      logWarning('Frontend may not be ready yet');
    }
    
    try {
      await waitForService('http://localhost:5300/api/health');
      logSuccess('Backend is ready at http://localhost:5300');
    } catch (e) {
      logWarning('Backend may not be ready yet');
    }
    
    console.log('');
    logSuccess('🚀 LucaTaxGPT is starting up!');
    logInfo('Frontend: http://localhost:3000');
    logInfo('Backend: http://localhost:5300');
    console.log('');
  }, 5000);
  
  // Handle process termination
  const cleanup = () => {
    logStep('Shutting down servers...');
    frontend.kill('SIGTERM');
    backend.kill('SIGTERM');
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  // Handle process errors
  frontend.on('error', (err) => {
    logError(`Frontend error: ${err.message}`);
  });
  
  backend.on('error', (err) => {
    logError(`Backend error: ${err.message}`);
  });
  
  frontend.on('exit', (code) => {
    if (code !== 0) {
      logError(`Frontend exited with code ${code}`);
    }
  });
  
  backend.on('exit', (code) => {
    if (code !== 0) {
      logError(`Backend exited with code ${code}`);
    }
  });
}

// Main execution
if (require.main === module) {
  startDevServers().catch((err) => {
    logError(`Startup failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { startDevServers }; 