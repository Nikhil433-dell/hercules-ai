import React from 'react';
import { ChatMessage } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSend }) => {
  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map(msg => <div key={msg.id}>{msg.text}</div>)}
      </div>
      <input type="text" placeholder="Type a message..." />
    </div>
  );
};
