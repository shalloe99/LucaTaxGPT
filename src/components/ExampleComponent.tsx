'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ExampleComponentProps {
  title?: string
  className?: string
}

export function ExampleComponent({ 
  title = 'Example Component', 
  className 
}: ExampleComponentProps) {
  const [count, setCount] = useState(0)

  return (
    <div className={cn(
      'p-6 bg-white rounded-lg shadow-md border border-gray-200',
      className
    )}>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{title}</h2>
      <p className="text-gray-600 mb-4">
        This is an example component demonstrating TypeScript and Tailwind CSS usage.
      </p>
      <div className="flex items-center gap-4">
        <button
          onClick={() => setCount(count - 1)}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          Decrease
        </button>
        <span className="text-xl font-semibold text-gray-900">{count}</span>
        <button
          onClick={() => setCount(count + 1)}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
        >
          Increase
        </button>
      </div>
    </div>
  )
} 