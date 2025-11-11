'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { Button } from '../ui/button';
import { Mic, MicOff, Send, X, Trash2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface VRCoachChatbotProps {
  position?: [number, number, number];
}

export function VRCoachChatbot({ position = [0, 2.5, -2] }: VRCoachChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/vr-coach-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });

      const data = await response.json();

      if (data.response) {
        const assistantMessage: Message = { role: 'assistant', content: data.response };
        setMessages(prev => [...prev, assistantMessage]);

        // Text-to-speech
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(data.response);
          utterance.rate = 0.9;
          utterance.pitch = 1.0;
          window.speechSynthesis.speak(utterance);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isMinimized) {
    return (
      <group position={position}>
        <Html center transform occlude>
          <div style={{ width: '80px' }}>
            <Button
              onClick={() => setIsMinimized(false)}
              className="w-full bg-gradient-to-r from-[#D4AF38] to-[#F5E7A3] hover:from-[#F5E7A3] hover:to-[#D4AF38] text-black rounded-full h-16 w-16"
            >
              <span className="text-2xl">🥇</span>
            </Button>
          </div>
        </Html>
      </group>
    );
  }

  return (
    <group position={position}>
      <Html center transform occlude>
        <div style={{ width: '500px', pointerEvents: 'all' }}>
          <div className="bg-black/95 border border-[#D4AF38]/30 shadow-2xl rounded-lg overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-[#D4AF38]/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#D4AF38] to-[#F5E7A3] flex items-center justify-center">
                  <span className="text-xl">🥇</span>
                </div>
                <span className="text-[#D4AF38] font-bold text-lg">Coach Andy</span>
              </div>
              <div className="flex gap-2">
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    className="text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button
                  onClick={() => setIsMinimized(true)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="h-[400px] overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="bg-white/10 text-white border border-white/20 rounded-lg p-3 text-sm">
                  <p className="font-semibold mb-2">🥇 Hey wrestler! I'm Coach Andy.</p>
                  <p className="text-xs">Ask me about any technique you see around you, or let's talk wrestling strategy!</p>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg p-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-[#D4AF38] text-black ml-auto max-w-[80%]'
                      : 'bg-white/10 text-white border border-white/20 max-w-[80%]'
                  }`}
                >
                  {msg.content}
                </div>
              ))}

              {isLoading && (
                <div className="bg-white/10 border border-white/20 rounded-lg p-3 text-sm text-white">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-[#D4AF38] rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-[#D4AF38] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-[#D4AF38] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-[#D4AF38]/20">
              <div className="flex gap-2">
                <button
                  onClick={toggleListening}
                  className={`p-2 rounded-lg transition-all ${
                    isListening
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  disabled={isLoading}
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder={isListening ? 'Listening...' : 'Ask Coach Andy...'}
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#D4AF38]"
                  disabled={isLoading || isListening}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className="bg-gradient-to-r from-[#D4AF38] to-[#F5E7A3] hover:from-[#F5E7A3] hover:to-[#D4AF38] text-black transition-all duration-300 disabled:opacity-50 p-2 rounded-lg"
                >
                  <Send size={20} />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Click mic to speak or type your question
              </p>
            </div>
          </div>
        </div>
      </Html>
    </group>
  );
}
