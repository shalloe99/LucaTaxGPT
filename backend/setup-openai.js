#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🤖 OpenAI API Setup for LucaTaxGPT');
console.log('=====================================\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, 'env.example');

if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env file from env.example...');
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ .env file created successfully');
  } else {
    console.error('❌ env.example file not found');
    process.exit(1);
  }
}

// Read current .env file
let envContent = fs.readFileSync(envPath, 'utf8');

// Check if OPENAI_API_KEY is already set
if (envContent.includes('OPENAI_API_KEY=sk-')) {
  console.log('⚠️  OpenAI API key is already configured in .env file');
  rl.question('Do you want to update it? (y/N): ', (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      promptForApiKey();
    } else {
      console.log('✅ Setup complete. No changes made.');
      rl.close();
    }
  });
} else {
  promptForApiKey();
}

function promptForApiKey() {
  console.log('\n📋 To get your OpenAI API key:');
  console.log('1. Go to https://platform.openai.com/api-keys');
  console.log('2. Sign in or create an account');
  console.log('3. Click "Create new secret key"');
  console.log('4. Copy the key (starts with "sk-")');
  console.log('\n💡 Make sure you have sufficient credits in your OpenAI account for GPT-4o usage.\n');

  rl.question('Enter your OpenAI API key (starts with "sk-"): ', (apiKey) => {
    if (!apiKey.trim()) {
      console.log('❌ API key cannot be empty');
      rl.close();
      return;
    }

    if (!apiKey.startsWith('sk-')) {
      console.log('❌ Invalid API key format. Should start with "sk-"');
      rl.close();
      return;
    }

    // Update the .env file
    const updatedContent = envContent.replace(
      /OPENAI_API_KEY=.*/,
      `OPENAI_API_KEY=${apiKey}`
    );

    fs.writeFileSync(envPath, updatedContent);
    console.log('✅ OpenAI API key configured successfully!');
    console.log('\n🚀 You can now start the backend server:');
    console.log('   npm run dev');
    console.log('\n📝 Note: Keep your API key secure and never commit it to version control.');
    
    rl.close();
  });
}

rl.on('close', () => {
  process.exit(0);
}); 