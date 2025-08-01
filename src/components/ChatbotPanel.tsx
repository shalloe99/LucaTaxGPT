'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  Send,
  Bot,
  User,
  FileText,
  ThumbsUp,
  ThumbsDown,
  X,
  Check,
  MessageCircle,
  Copy,
  Edit2,
  Save,
  RotateCcw,
} from 'lucide-react'
import ProfilePanel from './ProfilePanel'
import ContextFilters from './ContextFilters'
import ModelSelector from './ModelSelector'
import { Chat } from '../types/Conversation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ReactElement } from 'react'

interface DomainKnowledge {
  federalTaxCode: boolean
  stateTaxCodes: string[]
  filingEntity: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  relevantDocs?: any[]
}

interface Conversation {
  id: string
  title: string
  federalTaxCode: boolean
  stateTaxCodes: string[]
  profileTags: string[]
  messages: any[]
  createdAt: string
  updatedAt: string
}

interface UserProfile {
  tags: string[]
  context: string
}

interface ChatbotPanelProps {
  currentChat?: Chat | null
  userProfile?: UserProfile | null
  updateChatTitle?: (chatId: string, newTitle: string) => void
  onChatContextUpdate?: (updated: Chat & { contextFilters?: any }) => void
  pendingNewChat?: boolean
  onCreateChatWithMessage?: (msg: string, modelType: 'chatgpt' | 'ollama', model: string) => void
}

interface FeedbackState {
  [messageId: string]: {
    feedback: 'like' | 'dislike' | null
    showInput: boolean
    input: string
    submitting: boolean
    editReady: boolean
  }
}

const US_STATES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
]

function StateAutocomplete({
  selectedStates,
  onChange,
}: {
  selectedStates: string[]
  onChange: (states: string[]) => void
}) {
  const [input, setInput] = useState('')
  const [filtered, setFiltered] = useState<string[]>(US_STATES)
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setFiltered(US_STATES.filter((s) => s.toLowerCase().includes(input.toLowerCase()) && !selectedStates.includes(s)))
  }, [input, selectedStates])

  function handleSelect(state: string) {
    onChange([...selectedStates, state])
    setInput('')
    setShowDropdown(false)
  }
  function handleRemove(state: string) {
    onChange(selectedStates.filter((s) => s !== state))
  }

  return (
    <div className="relative w-48">
      <div className="flex flex-wrap gap-1 mb-1">
        {selectedStates.map((s) => (
          <span key={s} className="bg-blue-100 text-blue-800 rounded px-2 py-0.5 text-xs flex items-center">
            {s}
            <button onClick={() => handleRemove(s)} className="ml-1 text-blue-600 hover:text-red-600">
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          setShowDropdown(true)
        }}
        onFocus={() => setShowDropdown(true)}
        placeholder="Type to search states..."
        className="w-full px-2 py-1 border rounded text-xs"
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute left-0 right-0 bg-white border rounded shadow z-10 max-h-40 overflow-y-auto">
          {filtered.map((s) => (
            <div key={s} className="px-2 py-1 hover:bg-blue-50 cursor-pointer text-xs" onClick={() => handleSelect(s)}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getInitialDomainKnowledge(currentChat?: Chat | null) {
  if (currentChat) {
    return {
      federalTaxCode: currentChat.contextFilters?.federalTaxCode ?? true,
      stateTaxCodes: currentChat.contextFilters?.stateTaxCodes ?? [],
      profileTags: currentChat.contextFilters?.profileTags ?? [],
      filingEntity: 'individuals',
    }
  }
  return {
    federalTaxCode: true,
    stateTaxCodes: [],
    profileTags: [],
    filingEntity: 'individuals',
  }
}

export default function ChatbotPanel({
  currentChat,
  userProfile,
  updateChatTitle,
  onChatContextUpdate,
  pendingNewChat = false,
  onCreateChatWithMessage,
}: ChatbotPanelProps & {
  pendingNewChat?: boolean
  onCreateChatWithMessage?: (msg: string, modelType: 'chatgpt' | 'ollama', model: string) => void
}) {
  // All hooks at the top
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState(currentChat?.title || '')
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)
  const [showStateDropdown, setShowStateDropdown] = useState(false)
  const stateDropdownRef = useRef<HTMLDivElement>(null)
  const [feedback, setFeedback] = useState<FeedbackState>({})
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [showUserMsgActions, setShowUserMsgActions] = useState<string | null>(null)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editInput, setEditInput] = useState('')
  const editTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [domainKnowledge, setDomainKnowledgeState] = useState(() => getInitialDomainKnowledge(currentChat))
  const [selectedModelType, setSelectedModelType] = useState<'chatgpt' | 'ollama'>('chatgpt')
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o-mini')
  const [showReloadModelSelector, setShowReloadModelSelector] = useState<string | null>(null)
  const [reloadingMessageId, setReloadingMessageId] = useState<string | null>(null)
  const [modelsLoaded, setModelsLoaded] = useState(false)

  // Initialize models on first load
  useEffect(() => {
    if (!modelsLoaded) {
      initializeModels()
    }
  }, [modelsLoaded])

  // Function to initialize models and set default
  const initializeModels = async () => {
    try {
      const response = await fetch('/api/chat/models')
      if (response.ok) {
        const data = await response.json()

        // Set default model if available
        if (data.defaultModel) {
          setSelectedModelType(data.defaultModel.modelType)
          setSelectedModel(data.defaultModel.model)
          console.log(`🎯 Set default model: ${data.defaultModel.modelType} - ${data.defaultModel.model}`)
        }

        setModelsLoaded(true)
      } else {
        console.error('Failed to fetch models')
        setModelsLoaded(true) // Still mark as loaded to avoid infinite retries
      }
    } catch (error) {
      console.error('Error initializing models:', error)
      setModelsLoaded(true) // Still mark as loaded to avoid infinite retries
    }
  }

  // Copy to clipboard helper
  const handleCopy = (content: string) => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(content)
    }
  }

  // Model selection handler
  const handleModelChange = (modelType: 'chatgpt' | 'ollama', model: string) => {
    setSelectedModelType(modelType)
    setSelectedModel(model)
  }

  // Reload message with different model
  const handleReloadMessage = async (messageId: string, modelType: 'chatgpt' | 'ollama', model: string) => {
    if (!currentChat) return

    // Find the message to reload
    const messageIndex = messages.findIndex((m) => m.id === messageId)
    if (messageIndex === -1 || messageIndex === 0) return // Can't reload first message or if not found

    // Find the user message that prompted this response
    const userMessage = messages[messageIndex - 1]
    if (userMessage.role !== 'user') return

    setReloadingMessageId(messageId)
    setShowReloadModelSelector(null)

    try {
      // Prepare context with user profile information
      let context = ''
      if (userProfile) {
        if (userProfile.context) {
          context += `User Context: ${userProfile.context}\n`
        }
        if (userProfile.tags && userProfile.tags.length > 0) {
          context += `User Tags: ${userProfile.tags.join(', ')}\n`
        }
      }

      // Call AI service with new model
      const response = await fetch(`/api/chat/user/messaging/${currentChat.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          context: context,
          domainKnowledge: {
            ...domainKnowledge,
            stateTaxCode: domainKnowledge.stateTaxCodes.join(','),
          },
          modelType: modelType,
          model: model,
        }),
      })

      if (response.ok) {
        const data = await response.json()

        // Update the message with new response
        const updatedMessages = [...messages]
        updatedMessages[messageIndex] = {
          ...updatedMessages[messageIndex],
          content: data.response,
          timestamp: new Date(),
        }

        setMessages(updatedMessages)

        // Update backend
        await fetch(`/api/chat/chats/${currentChat.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: updatedMessages }),
        })

        if (onChatContextUpdate) onChatContextUpdate(currentChat)
      } else {
        throw new Error('Failed to get response')
      }
    } catch (error) {
      console.error('Error reloading message:', error)
      // Optionally show error message
    } finally {
      setReloadingMessageId(null)
    }
  }

  // User message edit logic
  const handleEditClick = (msg: Message) => {
    setEditingMsgId(msg.id)
    setEditInput(msg.content)
  }

  const handleEditInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditInput(e.target.value)
  }

  // Save edited message and remove all subsequent messages
  const handleEditSave = async (msg: Message) => {
    if (!currentChat) return
    // Find index of the message
    const idx = messages.findIndex((m) => m.id === msg.id)
    if (idx === -1) return
    // Prepare new messages: up to and including the edited one
    const newMessages = [...messages.slice(0, idx), { ...msg, content: editInput }]
    setMessages(newMessages)
    setEditingMsgId(null)
    setEditInput('')
    // Save to backend: update message, then overwrite conversation messages
    try {
      // Update the message
      await fetch(`/api/chat/chats/${currentChat.id}/messages/${msg.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editInput }),
      })
      // Overwrite the conversation with only the messages up to the edited one
      await fetch(`/api/chat/chats/${currentChat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      // Optionally, refetch chat or update parent
      if (onChatContextUpdate) {
        const resp = await fetch(`/api/chat/chats/${currentChat.id}`)
        if (resp.ok) {
          const updated = await resp.json()
          onChatContextUpdate(updated)
        }
      }
      // Now, call LLM for next bot reply (simulate sendMessage for the edited message)
      // Prepare context with user profile information
      let context = ''
      if (userProfile) {
        if (userProfile.context) {
          context += `User Context: ${userProfile.context}\n`
        }
        if (userProfile.tags && userProfile.tags.length > 0) {
          context += `User Tags: ${userProfile.tags.join(', ')}\n`
        }
      }
      setIsLoading(true)
      const response = await fetch(`/api/chat/user/messaging/${currentChat.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: editInput,
          context: context,
          domainKnowledge: {
            ...domainKnowledge,
            stateTaxCode: domainKnowledge.stateTaxCodes.join(','),
          },
          modelType: selectedModelType,
          model: selectedModel,
        }),
      })
      if (response.ok) {
        const data = await response.json()
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
          relevantDocs: data.relevantDocs,
        }
        setMessages((prev) => [...prev, assistantMessage])
      } else {
        throw new Error('Failed to get response')
      }
    } catch (e) {
      // Optionally show error
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I apologize, but I'm having trouble processing your request right now. Please try again later.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  // Show user message actions on hover with shorter delay, hide with longer delay
  const handleUserMsgMouseEnter = (msgId: string) => {
    setHoveredMsgId(msgId)
    if (editTimeoutRef.current) clearTimeout(editTimeoutRef.current)
    // Shorter delay before showing buttons
    editTimeoutRef.current = setTimeout(() => {
      setShowUserMsgActions(msgId)
    }, 200) // 200ms delay before showing
  }
  const handleUserMsgMouseLeave = (msgId: string) => {
    setHoveredMsgId(null)
    if (editTimeoutRef.current) clearTimeout(editTimeoutRef.current)
    // Shorter delay before hiding buttons
    editTimeoutRef.current = setTimeout(() => {
      setShowUserMsgActions(null)
    }, 500) // 0.5 second delay before hiding
  }

  // Per-conversation context state
  // When switching conversations, update domainKnowledge and titleInput
  useEffect(() => {
    setDomainKnowledgeState(getInitialDomainKnowledge(currentChat))
    setTitleInput(currentChat?.title || '')
    setMessages(currentChat?.messages || [])
  }, [currentChat])

  // Remove starter message logic: do not set default assistant message for new conversations
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Save context filters to backend per conversation
  const persistContextFilters = async (filters: any) => {
    if (!currentChat) return
    try {
      const response = await fetch(`http://localhost:5300/api/chat/chats/${currentChat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextFilters: {
            ...domainKnowledge,
            ...filters,
            stateTaxCodes: filters.stateTaxCodes ?? domainKnowledge.stateTaxCodes,
            profileTags: filters.profileTags ?? domainKnowledge.profileTags,
            federalTaxCode:
              typeof filters.federalTaxCode === 'boolean' ? filters.federalTaxCode : domainKnowledge.federalTaxCode,
          },
        }),
      })
      if (response.ok) {
        const updated = await response.json()
        if (onChatContextUpdate) onChatContextUpdate(updated)
      }
    } catch (e) {
      // Optionally show error
    }
  }

  const setDomainKnowledge = (updater: any) => {
    setDomainKnowledgeState((prev: any) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      persistContextFilters(next)
      return next
    })
  }

  // Save title to backend
  const handleTitleSave = async () => {
    if (!currentChat) return
    if (titleInput.trim() && titleInput !== currentChat.title) {
      // Update the title in the backend
      const response = await fetch(`http://localhost:5300/api/chat/chats/${currentChat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleInput }),
      })
      if (response.ok) {
        const updated = await response.json()
        if (updateChatTitle) {
          updateChatTitle(currentChat.id, titleInput)
        }
        if (onChatContextUpdate) onChatContextUpdate(updated)
      }
    }
    setEditingTitle(false)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (messages.length > 0) {
      // Set scroll position to bottom without animation
      messagesEndRef.current?.scrollIntoView()
    }
  }, [messages, isClient])

  // Load conversation messages when currentConversation changes
  useEffect(() => {
    if (isClient && currentChat?.messages && currentChat.messages.length > 0) {
      setMessages(currentChat.messages as Message[])
      // Set scroll position to bottom after messages are loaded (no animation)
      setTimeout(() => messagesEndRef.current?.scrollIntoView(), 100)
    } else if (isClient && !currentChat?.messages) {
      // Only set messages to currentConversation?.messages or []
      setMessages([])
    }
  }, [currentChat, isClient])

  // Fix 1: Update sendMessage to always use the latest state
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    }

    // Build the new messages array synchronously
    const userMessages = [...messages, userMessage]
    setMessages(userMessages)
    setInputMessage('')
    setIsLoading(true)

    try {
      // Prepare context with user profile information
      let context = ''
      if (userProfile) {
        if (userProfile.context) {
          context += `User Context: ${userProfile.context}\n`
        }
        if (userProfile.tags && userProfile.tags.length > 0) {
          context += `User Tags: ${userProfile.tags.join(', ')}\n`
        }
      }

      // Use new AI API endpoint with model selection
      const response = await fetch(`/api/chat/user/messaging/${currentChat?.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputMessage,
          context: context,
          domainKnowledge: {
            ...domainKnowledge,
            stateTaxCode: domainKnowledge.stateTaxCodes.join(','), // Convert array to string for backend compatibility
          },
          modelType: selectedModelType,
          model: selectedModel,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
          relevantDocs: data.relevantDocs,
        }
        // Build the final messages array
        const allMessages = [...userMessages, assistantMessage]
        setMessages(allMessages)
        // Persist the full messages array to backend
        await fetch(`/api/chat/chats/${currentChat?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: allMessages }),
        })
        // After persisting messages, only call onChatContextUpdate if currentChat is valid
        if (onChatContextUpdate && currentChat) onChatContextUpdate(currentChat)
      } else {
        throw new Error('Failed to get response')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I apologize, but I'm having trouble processing your request right now. Please try again later.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  // When sending the first message (pendingNewChat), call onCreateChatWithMessage with model info
  const handleFirstMessage = async () => {
    if (onCreateChatWithMessage && inputMessage.trim()) {
      onCreateChatWithMessage(inputMessage, selectedModelType, selectedModel)
      setInputMessage('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (pendingNewChat) {
        handleFirstMessage()
      } else {
        sendMessage()
      }
    }
  }

  function handleCopySettings() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('copy-conversation-settings', { detail: currentChat }))
    }
  }

  // Add updateConversationFilters helper in the component
  function updateConversationFilters(updated: Chat) {
    setMessages(updated.messages || [])
    setTitleInput(updated.title)
    // Update in localStorage
    const cached = window.localStorage.getItem('cachedConversations')
    let conversations = []
    if (cached) {
      try {
        conversations = JSON.parse(cached)
        const idx = conversations.findIndex((c: any) => c.id === updated.id)
        if (idx !== -1) {
          conversations[idx] = { ...conversations[idx], ...updated }
          window.localStorage.setItem('cachedConversations', JSON.stringify(conversations))
        }
      } catch {}
    }
    // Dispatch event to update in ChatHistory
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('conversation-title-updated', { detail: { id: updated.id, title: updated.title } })
      )
    }
  }

  const MarkdownCode = ({
    inline,
    className,
    children,
    ...props
  }: {
    inline?: boolean
    className?: string
    children?: React.ReactNode
  }) => {
    return !inline ? (
      <pre className="bg-gray-900 text-white rounded p-2 overflow-x-auto my-2">
        <code>{children}</code>
      </pre>
    ) : (
      <code className="bg-gray-100 text-pink-700 rounded px-1 py-0.5 text-xs" {...props}>
        {children}
      </code>
    )
  }

  // Fix: Custom paragraph renderer to avoid <pre> inside <p>
  function MarkdownParagraph(props: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) {
    const { children, ...rest } = props
    if (Array.isArray(children) && children.length === 1 && (children[0] as any)?.type === 'pre') {
      return children[0] as React.ReactElement
    }
    return <p {...rest}>{children}</p>
  }

  const handleFeedback = async (messageId: string, type: 'like' | 'dislike') => {
    setFeedback((prev) => {
      const prevState = prev[messageId] || {
        feedback: null,
        showInput: false,
        input: '',
        submitting: false,
        editReady: false,
      }
      if (type === 'dislike') {
        // Only toggle editReady, not showInput
        return {
          ...prev,
          [messageId]: {
            ...prevState,
            feedback: 'dislike',
            editReady: !prevState.editReady,
            showInput: false,
          },
        }
      }
      // Like logic
      return {
        ...prev,
        [messageId]: {
          feedback: 'like',
          showInput: false,
          input: '',
          submitting: false,
          editReady: false,
        },
      }
    })
    // Send feedback to backend (without comment for like)
    if (type === 'like') {
      await fetch(`/api/chat/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: currentChat?.id,
          messageId,
          feedback: type,
          context: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })
    }
  }

  const openFeedbackInput = (messageId: string) => {
    setFeedback((prev) => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        showInput: true,
        editReady: false,
      },
    }))
  }

  const handleFeedbackInput = (messageId: string, value: string) => {
    setFeedback((prev) => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        input: value,
      },
    }))
  }

  const submitFeedbackComment = async (messageId: string) => {
    setFeedback((prev) => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        submitting: true,
      },
    }))
    await fetch(`/api/chat/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: currentChat?.id,
        messageId,
        feedback: 'dislike',
        comment: feedback[messageId]?.input,
        context: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    })
    setFeedback((prev) => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        showInput: false,
        submitting: false,
      },
    }))
  }

  const closeFeedbackInput = (messageId: string) => {
    setFeedback((prev) => ({
      ...prev,
      [messageId]: {
        feedback: null,
        showInput: false,
        input: '',
        submitting: false,
        editReady: false,
      },
    }))
  }

  // If pendingNewChat, show intro and input, and only create chat on first message
  if (pendingNewChat) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Tax Assistant</h2>
          </div>
          <p className="text-sm text-gray-600 mt-1">Powered by official IRS documents and AI</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center select-none">
          <Bot className="w-16 h-16 text-gray-200 mb-6" />
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">What can I help you with?</h1>
          <p className="text-gray-500 max-w-md mx-auto mb-8">
            Ask me anything about taxes, IRS documents, or your profile. Start typing below to begin your conversation.
          </p>
          <form
            className="w-full max-w-xl flex flex-col items-center"
            onSubmit={(e) => {
              e.preventDefault()
              if (inputMessage.trim() && !isLoading) {
                if (onCreateChatWithMessage) {
                  onCreateChatWithMessage(inputMessage, selectedModelType, selectedModel)
                  setInputMessage('')
                }
              }
            }}
          >
            <input
              className="w-full border rounded px-4 py-2 text-neutral-800 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Type your question..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={!inputMessage.trim()}
            >
              Start Chat
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Don't render until client-side to prevent hydration mismatch
  if (!isClient) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Bot className="h-6 w-6 text-blue-600 mr-3" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Tax Assistant</h2>
                <p className="text-sm text-gray-600">Powered by official IRS documents and AI</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    )
  }

  // Function to get model display name
  const getModelDisplayName = () => {
    if (selectedModelType === 'chatgpt') {
      switch (selectedModel) {
        case 'gpt-3.5-turbo':
          return 'GPT-3.5 Turbo'
        case 'gpt-4o-mini':
          return 'GPT-4o Mini'
        case 'gpt-4o':
          return 'GPT-4o'
        default:
          return selectedModel
      }
    } else {
      return selectedModel
    }
  }

  // Function to get provider name
  const getProviderName = () => {
    return selectedModelType === 'chatgpt' ? 'ChatGPT' : 'Local Model'
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Chat Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-blue-600" />
            {editingTitle ? (
              <input
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave()
                }}
                className="text-lg font-semibold text-gray-900 bg-white border-b border-blue-300 focus:outline-none"
              />
            ) : (
              <h2
                className="text-lg font-semibold text-gray-900 cursor-pointer"
                onClick={() => setEditingTitle(true)}
                title="Click to edit title"
              >
                {currentChat?.title || 'Tax Assistant'}
              </h2>
            )}
          </div>
          <ModelSelector
            selectedModelType={selectedModelType}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
          />
        </div>
        <p className="text-sm text-gray-600 mt-1">Powered by official IRS documents and AI</p>
        {/* Domain Knowledge & Profile Controls */}
        <ContextFilters
          domainKnowledge={domainKnowledge}
          setDomainKnowledge={setDomainKnowledge}
          profileTags={domainKnowledge.profileTags}
          setProfileTags={(tags: string[]) => setDomainKnowledge((dk: any) => ({ ...dk, profileTags: tags }))}
          setShowProfileDropdown={setShowProfileDropdown}
          showProfileDropdown={showProfileDropdown}
          setShowStateDropdown={setShowStateDropdown}
          showStateDropdown={showStateDropdown}
          stateDropdownRef={stateDropdownRef}
        />
      </div>

      {/* Messages Area or Intro Landing */}
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center select-none">
          <Bot className="w-16 h-16 text-gray-200 mb-6" />
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">What can I help you with?</h1>
          <p className="text-gray-500 max-w-md mx-auto mb-4">
            Ask me anything about taxes, IRS documents, or your profile. Start typing below to begin your conversation.
          </p>
          {modelsLoaded && (
            <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">
              <Bot className="w-4 h-4" />
              <span>
                Powered by {getModelDisplayName()} ({getProviderName()})
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {messages.map((message, idx) => (
            <div key={message.id} className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 relative group ${
                  message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                }`}
                onMouseEnter={message.role === 'user' ? () => handleUserMsgMouseEnter(message.id) : undefined}
                onMouseLeave={message.role === 'user' ? () => handleUserMsgMouseLeave(message.id) : undefined}
              >
                <div className="flex items-start space-x-2">
                  {message.role === 'assistant' && <Bot className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />}
                  {message.role === 'user' && <User className="h-4 w-4 text-white mt-0.5 flex-shrink-0" />}
                  <div className="flex-1">
                    {/* Bot message rendering */}
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm text-sm max-w-none relative">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code: MarkdownCode,
                            p: MarkdownParagraph,
                            table({ children }) {
                              return <table className="min-w-full border text-xs my-2">{children}</table>
                            },
                            th({ children }) {
                              return <th className="border px-2 py-1 bg-gray-100 font-semibold">{children}</th>
                            },
                            td({ children }) {
                              return <td className="border px-2 py-1">{children}</td>
                            },
                            ul({ children }) {
                              return <ul className="list-disc ml-6 my-2">{children}</ul>
                            },
                            ol({ children }) {
                              return <ol className="list-decimal ml-6 my-2">{children}</ol>
                            },
                            li({ children }) {
                              return <li className="mb-1">{children}</li>
                            },
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                        <div className="flex gap-2 mt-2 items-center relative">
                          <button
                            className="p-1 rounded hover:bg-gray-100"
                            title="Copy"
                            onClick={() => handleCopy(message.content)}
                          >
                            <Copy className="w-4 h-4 text-gray-500" />
                          </button>
                          <button
                            className={`p-1 rounded hover:bg-blue-100 ${
                              feedback[message.id]?.feedback === 'like' ? 'bg-blue-200' : ''
                            }`}
                            title="Like"
                            onClick={() => handleFeedback(message.id, 'like')}
                            disabled={feedback[message.id]?.feedback === 'like'}
                          >
                            <ThumbsUp className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            className={`p-1 rounded hover:bg-red-100 ${
                              feedback[message.id]?.feedback === 'dislike' ? 'bg-red-200' : ''
                            }`}
                            title="Dislike"
                            onClick={() => handleFeedback(message.id, 'dislike')}
                          >
                            <ThumbsDown className="w-4 h-4 text-red-600" />
                          </button>
                          <button
                            className="p-1 rounded hover:bg-green-100 relative group"
                            onClick={() =>
                              setShowReloadModelSelector(showReloadModelSelector === message.id ? null : message.id)
                            }
                            disabled={reloadingMessageId === message.id}
                          >
                            <RotateCcw
                              className={`w-4 h-4 text-green-600 ${
                                reloadingMessageId === message.id ? 'animate-spin' : ''
                              }`}
                            />
                            {/* Tooltip */}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 px-2 py-1 bg-black bg-opacity-70 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                              Switch model ({selectedModelType === 'chatgpt' ? 'ChatGPT' : 'Ollama'})
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-black border-b-opacity-70"></div>
                            </div>
                          </button>
                          {feedback[message.id]?.feedback === 'dislike' && feedback[message.id]?.editReady && (
                            <button
                              className="p-1 rounded hover:bg-yellow-100 bg-yellow-50 ml-1"
                              title="Leave feedback"
                              onClick={() => openFeedbackInput(message.id)}
                            >
                              <MessageCircle className="w-4 h-4 text-yellow-600" />
                            </button>
                          )}
                          {feedback[message.id]?.showInput && (
                            <div
                              className="absolute z-10 left-0 top-full bg-white border rounded shadow-lg p-1 w-60 min-h-[48px] flex flex-col gap-1 animate-fade-in mt-2"
                              style={{ aspectRatio: '5 / 1' }}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-semibold text-gray-700">Tell us what went wrong</span>
                                <button
                                  onClick={() => closeFeedbackInput(message.id)}
                                  className="text-gray-400 hover:text-gray-700"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <textarea
                                className="w-full border rounded p-1 text-xs min-h-[48px] resize-none"
                                rows={2}
                                placeholder="Your feedback..."
                                value={feedback[message.id]?.input || ''}
                                onChange={(e) => handleFeedbackInput(message.id, e.target.value)}
                                disabled={feedback[message.id]?.submitting}
                              />
                              <div className="flex gap-1 justify-end mt-1">
                                <button
                                  className="bg-blue-600 text-white text-xs rounded px-1 py-0.5 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 min-w-5 min-h-5"
                                  style={{ fontSize: '0.8rem' }}
                                  onClick={() => submitFeedbackComment(message.id)}
                                  disabled={feedback[message.id]?.submitting || !feedback[message.id]?.input?.trim()}
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  className="bg-gray-200 text-gray-700 text-xs rounded px-1 py-0.5 hover:bg-gray-300 flex items-center gap-1 min-w-5 min-h-5"
                                  style={{ fontSize: '0.8rem' }}
                                  onClick={() => closeFeedbackInput(message.id)}
                                  disabled={feedback[message.id]?.submitting}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Reload Model Selector */}
                          {showReloadModelSelector === message.id && (
                            <div className="absolute z-10 bottom-full right-0 bg-white border rounded shadow-lg p-2 w-64 mb-1">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-semibold text-gray-700">Choose model to regenerate</span>
                                <button
                                  onClick={() => setShowReloadModelSelector(null)}
                                  className="text-gray-400 hover:text-gray-700"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="space-y-1">
                                {/* ChatGPT Models */}
                                <div className="text-xs font-medium text-gray-600 mb-1">ChatGPT Models</div>
                                <button
                                  onClick={() => handleReloadMessage(message.id, 'chatgpt', 'gpt-4o')}
                                  className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 rounded"
                                >
                                  <div className="font-medium">GPT-4o</div>
                                  <div className="text-gray-500">Most capable GPT-4 model</div>
                                </button>
                                <button
                                  onClick={() => handleReloadMessage(message.id, 'chatgpt', 'gpt-4o-mini')}
                                  className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 rounded"
                                >
                                  <div className="font-medium">GPT-4o Mini</div>
                                  <div className="text-gray-500">Faster and more cost-effective</div>
                                </button>
                                <button
                                  onClick={() => handleReloadMessage(message.id, 'chatgpt', 'gpt-3.5-turbo')}
                                  className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 rounded"
                                >
                                  <div className="font-medium">GPT-3.5 Turbo</div>
                                  <div className="text-gray-500">Fast and efficient model</div>
                                </button>

                                {/* Ollama Models */}
                                <div className="text-xs font-medium text-gray-600 mb-1 mt-2">Local Models (Ollama)</div>
                                <button
                                  onClick={() => handleReloadMessage(message.id, 'ollama', 'llama3.2:latest')}
                                  className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 rounded"
                                >
                                  <div className="font-medium">llama3.2:latest</div>
                                  <div className="text-gray-500">Local model (1.9GB)</div>
                                </button>
                                <button
                                  onClick={() => handleReloadMessage(message.id, 'ollama', 'phi3:3.8b')}
                                  className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 rounded"
                                >
                                  <div className="font-medium">phi3:3.8b</div>
                                  <div className="text-gray-500">Local model (2.0GB)</div>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="prose prose-sm text-sm max-w-none relative">
                        {editingMsgId === message.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editInput}
                              onChange={handleEditInputChange}
                              className="w-full p-2 border rounded text-sm resize-none text-black"
                              rows={3}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditSave(message)}
                                className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex items-center gap-1"
                              >
                                <Save className="w-3 h-3" />
                                Save
                              </button>
                              <button
                                onClick={() => setEditingMsgId(null)}
                                className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div>{message.content}</div>
                          </>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-1 text-right">
                      {(() => {
                        try {
                          return new Date(message.timestamp).toLocaleTimeString()
                        } catch {
                          return 'Invalid time'
                        }
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              {/* User message action buttons - positioned completely outside the blue message */}
              {message.role === 'user' && (
                <div
                  className={`flex gap-3 justify-end mt-2 transition-all duration-300 ease-in-out ${
                    showUserMsgActions === message.id
                      ? 'opacity-100 transform translate-y-0'
                      : 'opacity-0 transform translate-y-2 pointer-events-none'
                  }`}
                >
                  <button
                    className="p-1 transition-colors duration-200 hover:bg-gray-100 rounded"
                    title="Copy"
                    onClick={() => handleCopy(message.content)}
                  >
                    <Copy className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                  </button>
                  <button
                    className="p-1 transition-colors duration-200 hover:bg-gray-100 rounded"
                    title="Edit"
                    onClick={() => handleEditClick(message)}
                  >
                    <Edit2 className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Show pending state if the last message is from user and we're not loading */}
          {messages.length > 0 && messages[messages.length - 1].role === 'user' && !isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-4 py-2">
                <div className="flex items-center space-x-2">
                  <Bot className="h-4 w-4 text-gray-500" />
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    ></div>
                  </div>
                  <span className="text-sm text-gray-500">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-4 py-2">
                <div className="flex items-center space-x-2">
                  <Bot className="h-4 w-4 text-gray-500" />
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex space-x-2">
          <div className="flex-1">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me about taxes, forms, deductions, or any tax-related questions..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
              disabled={isLoading}
            />
          </div>
          <button
            onClick={pendingNewChat ? handleFirstMessage : sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Suggestions */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            'What are the standard deduction amounts for 2024?',
            'How do I file as self-employed?',
            'What tax credits am I eligible for?',
            'When is the tax filing deadline?',
          ].map((suggestion, index) => (
            <button
              key={index}
              onClick={() => setInputMessage(suggestion)}
              className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
