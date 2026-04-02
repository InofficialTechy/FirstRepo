'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectIntent } from '@/lib/intents';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: {
      new (): SpeechRecognition;
    };
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
  }

  interface SpeechRecognitionEvent {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionErrorEvent {
    error: string;
  }
}

const WAKE_WORD = 'hey assistant';

export default function AssistantApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldResumeRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);

  const supportsSpeechRecognition = useMemo(() => {
    return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }, []);

  const supportsSpeechSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    return () => {
      shouldResumeRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!supportsSpeechSynthesis) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
    [supportsSpeechSynthesis]
  );

  const addMessage = useCallback((role: ChatMessage['role'], text: string) => {
    setMessages((prev) => {
      const updated = [...prev, { id: crypto.randomUUID(), role, text }];
      messagesRef.current = updated;
      return updated;
    });
  }, []);

  const handleIntentFirst = useCallback(async (query: string): Promise<string | null> => {
    const intent = detectIntent(query);

    if (intent.type === 'time') {
      return `It is ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
    }

    if (intent.type === 'open_youtube') {
      window.open('https://youtube.com', '_blank');
      return 'Opening YouTube now.';
    }

    if (intent.type === 'search_google') {
      const q = encodeURIComponent(intent.query);
      window.open(`https://www.google.com/search?q=${q}`, '_blank');
      return `Searching Google for ${intent.query}.`;
    }

    return null;
  }, []);

  const askAssistant = useCallback(
    async (query: string) => {
      const text = query.trim();
      if (!text) return;

      const conversation = [...messagesRef.current, { id: 'temp', role: 'user' as const, text }];

      addMessage('user', text);
      setInput('');
      setInterim('');

      try {
        const intentReply = await handleIntentFirst(text);
        if (intentReply) {
          addMessage('assistant', intentReply);
          speak(intentReply);
          return;
        }

        setIsThinking(true);

        const resp = await fetch('/api/brain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: conversation.map((m) => ({ role: m.role, content: m.text }))
          })
        });

        const data = await resp.json();
        const reply = data.text ?? 'No response.';

        setIsThinking(false);
        addMessage('assistant', reply);
        speak(reply);
      } catch {
        setIsThinking(false);
        const fallback = 'Error processing request.';
        addMessage('assistant', fallback);
        speak(fallback);
      }
    },
    [addMessage, handleIntentFirst, speak]
  );

  const stopListening = useCallback(() => {
    shouldResumeRef.current = false;
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    setError(null);

    if (!supportsSpeechRecognition) {
      setError('Speech recognition not supported.');
      return;
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0]?.transcript?.trim() ?? '';

          if (event.results[i].isFinal) {
            askAssistant(transcript);
          } else {
            interimText += transcript + ' ';
          }
        }

        setInterim(interimText.trim());
      };

      recognition.onend = () => {
        setIsListening(false);
        if (shouldResumeRef.current) {
          recognition.start();
          setIsListening(true);
        }
      };

      recognitionRef.current = recognition;
    }

    shouldResumeRef.current = true;
    recognitionRef.current.start();
    setIsListening(true);
  }, [askAssistant, supportsSpeechRecognition]);

  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-xl font-bold mb-4">Voice Assistant</h1>

      <div className="space-y-2 mb-4">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === 'user' ? 'text-right' : ''}>
            {msg.text}
          </div>
        ))}
        {interim && <div className="italic">{interim}</div>}
      </div>

      <button onClick={isListening ? stopListening : startListening}>
        {isListening ? 'Stop' : 'Start'} Mic
      </button>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          askAssistant(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit">Send</button>
      </form>
    </main>
  );
}
