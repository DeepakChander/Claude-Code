'use client';

import { useAppStore } from '@/lib/store';

export function Sidebar() {
  const { conversations, currentConversationId, setCurrentConversation, sidebarOpen, logout } =
    useAppStore();

  if (!sidebarOpen) return null;

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">OpenAnalyst</h1>
        <p className="text-sm text-gray-400">AI-Powered Assistant</p>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={() => setCurrentConversation(null)}
          className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          New Chat
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {conversations.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No conversations yet</p>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setCurrentConversation(conv.id)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors truncate ${
                currentConversationId === conv.id
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {conv.title || 'New Chat'}
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-700">
        <button
          onClick={logout}
          className="w-full px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-sm"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
