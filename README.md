# Luca Tax GPT

A modern Next.js application with TypeScript, Tailwind CSS, and Vite-like optimizations.

## Features

- ⚡ **Next.js 15** with App Router
- 🔷 **TypeScript** for type safety
- 🎨 **Tailwind CSS** for styling
- ⚡ **Vite-like** build optimizations
- 📱 **Responsive** design
- 🎯 **ESLint** configuration
- 🔧 **PostCSS** with Autoprefixer

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd LucaTaxGPT
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Project Structure

```
src/
├── app/                 # App Router pages
│   ├── globals.css     # Global styles
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Home page
├── components/         # Reusable components
│   └── ui/            # UI components
└── lib/               # Utility functions
```

## Configuration Files

- `next.config.js` - Next.js configuration with Vite-like optimizations
- `tailwind.config.ts` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration
- `postcss.config.js` - PostCSS configuration
- `.eslintrc.json` - ESLint configuration

## Technologies Used

- [Next.js](https://nextjs.org/) - React framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [PostCSS](https://postcss.org/) - CSS processing
- [ESLint](https://eslint.org/) - Code linting

## Development

The project uses the latest Next.js App Router with TypeScript and Tailwind CSS. The configuration includes Vite-like optimizations for faster development and builds.

## Deployment

This project can be deployed on Vercel, Netlify, or any other platform that supports Next.js applications.

## License

MIT