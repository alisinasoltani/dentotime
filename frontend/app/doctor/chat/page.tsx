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
    <div className="flex h-full w-full overflow-hidden">
      {/* 
        Chat List 
        - Takes full width on mobile if no thread is selected.
        - Fixed width on larger screens.
      */}
      <div className={cn(
        "h-full w-full md:w-80 lg:w-96 shrink-0",
        activeThread && "hidden md:block" // Hide on mobile if a thread is open
      )}>
        <ChatList 
          onSelectThread={setActiveThread} 
          activeThreadId={activeThread?.id ?? null} 
        />
      </div>

      {/* 
        Chat Window
        - Takes full width on mobile if a thread is selected.
        - Fills remaining space on larger screens.
      */}
      <div className={cn(
        "h-full flex-1 min-w-0",
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