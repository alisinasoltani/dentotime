// app/doctor/chat/page.tsx
'use client';

import { useState } from 'react';
import ChatList from '@/components/chat/chat-list';
import ChatWindow from '@/components/chat/chat-window';
import type { ChatThread } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function ChatPage() {
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-0 w-full overflow-hidden lg:h-screen">
      {/* 
        Chat List 
        - Takes full width on mobile if no thread is selected.
        - Fixed width on larger screens.
      */}
      <div className={cn(
        "h-full min-h-0 w-full shrink-0 md:w-80 lg:w-96",
        activeThread && "hidden md:block" // Hide on mobile if a thread is open
      )}>
        <ChatList 
          onSelectThread={setActiveThread} 
          activeThreadId={activeThread?.id ?? null} 
          allowDirectConversations
        />
      </div>

      {/* 
        Chat Window
        - Takes full width on mobile if a thread is selected.
        - Fills remaining space on larger screens.
      */}
      <div className={cn(
        "h-full min-h-0 flex-1 min-w-0",
        !activeThread && "hidden md:flex" // Hide on mobile if no thread is open
      )}>
        <ChatWindow 
          thread={activeThread} 
          onBack={() => setActiveThread(null)} 
        />
      </div>
    </div>
  );
}
