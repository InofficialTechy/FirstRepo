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

export default function AssistantApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [wakeWordArmed, setWakeWordArmed] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldResumeRef = useRef(false);

  const supportsSpeechRecognition = useMemo(() => {
    return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }, []);

  const supportsSpeechSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const speak = useCallback(
    (text: string) => {
      if (!supportsSpeechSynthesis) return;

      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => /en-US/i.test(v.lang) && /(Google|Siri|Neural|Jenny|Aria)/i.test(v.name));
      utterance.voice = preferred ?? voices.find((v) => /en-US/i.test(v.lang)) ?? null;
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
    [supportsSpeechSynthesis]
  );

  const addMessage = useCallback((role: ChatMessage['role'], text: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, text }]);
  }, []);

  const handleIntentFirst = useCallback(
    async (query: string): Promise<string | null> => {
      const intent = detectIntent(query);

      if (intent.type === 'time') {
        return `It is ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
      }

      if (intent.type === 'open_youtube') {
        window.open('https://youtube.com', '_blank', 'noopener,noreferrer');
        return 'Opening YouTube now.';
      }

      if (intent.type === 'search_google') {
        const q = encodeURIComponent(intent.query);
        window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener,noreferrer');
        return `Searching Google for ${intent.query}.`;
      }

      if (intent.type === 'weather') {
        const resp = await fetch(`/api/weather?city=${encodeURIComponent(intent.city)}`);
        const data = (await resp.json()) as {
          error?: string;
          city?: string;
          country?: string;
          current?: { temperature_2m: number; apparent_temperature: number };
        };

        if (!resp.ok || !data.current) {
          return data.error ?? 'I could not fetch weather right now.';
        }

        return `Weather in ${data.city}, ${data.country}: ${Math.round(data.current.temperature_2m)}°C, feels like ${Math.round(data.current.apparent_temperature)}°C.`;
      }

      return null;
    },
    []
  );

  const askAssistant = useCallback(
    async (query: string) => {
      const text = query.trim();
      if (!text) return;

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

        const payload = {
          messages: [...messages, { role: 'user' as const, text }].map((m) => ({
            role: m.role,
            content: m.text
          }))
        };

        const resp = await fetch('/api/brain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = (await resp.json()) as { text?: string };
        const reply = data.text ?? 'Sorry, I did not get a response.';
        addMessage('assistant', reply);
        speak(reply);
      } catch {
        const fallback = 'I hit an error while processing that request. Please try again.';
        addMessage('assistant', fallback);
        speak(fallback);
      }
    },
    [addMessage, handleIntentFirst, messages, speak]
  );

  const stopListening = useCallback(() => {
    shouldResumeRef.current = false;
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    setError(null);

    if (!supportsSpeechRecognition) {
      setError('Speech recognition is not supported in this browser. Use typing mode below.');
      return;
    }

    const SpeechRecognitionCtor =
      (window as Window & { SpeechRecognition?: { new (): SpeechRecognition } }).SpeechRecognition ??
      window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setError('Speech recognition is unavailable.');
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0]?.transcript?.trim() ?? '';
          if (!transcript) continue;

          if (event.results[i].isFinal) {
            if (!wakeWordArmed && transcript.toLowerCase().includes('hey assistant')) {
              setWakeWordArmed(true);
              const confirm = 'I am listening.';
              addMessage('assistant', confirm);
              speak(confirm);
              continue;
            }

            if (wakeWordArmed) {
              setWakeWordArmed(false);
              void askAssistant(transcript.replace(/hey assistant/gi, '').trim());
            }
          } else {
            interimText += `${transcript} `;
          }
        }

        setInterim(interimText.trim());
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          setError('Microphone permission denied. You can still use typing mode.');
          shouldResumeRef.current = false;
        } else {
          setError(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        if (shouldResumeRef.current) {
          try {
            recognition.start();
            setIsListening(true);
          } catch {
            setError('Could not restart listening. Tap mic again.');
          }
        }
      };

      recognitionRef.current = recognition;
    }

    try {
      shouldResumeRef.current = true;
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      setError('Unable to start voice input. If already running, press stop and retry.');
    }
  }, [addMessage, askAssistant, speak, supportsSpeechRecognition, wakeWordArmed]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-4 py-8">
      <header className="flex items-center justify-between rounded-2xl border border-slate-300 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
        <div>
          <h1 className="text-xl font-semibold">Voice Assistant</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">Say “Hey Assistant” then speak your request.</p>
        </div>
        <button
          onClick={() => setDarkMode((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
        >
          {darkMode ? 'Light' : 'Dark'}
        </button>
      </header>

      <section className="flex flex-1 flex-col rounded-2xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex-1 space-y-3 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Try: “Hey Assistant, what time is it?” or type below.
            </p>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`max-w-[90%] rounded-xl p-3 text-sm ${msg.role === 'user' ? 'ml-auto bg-brand-500 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>
              {msg.text}
            </div>
          ))}

          {interim && <div className="max-w-[90%] rounded-xl border border-dashed p-3 text-sm italic">{interim}</div>}
        </div>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <div className="mb-3 flex items-center justify-center">
          <button
            onClick={isListening ? stopListening : startListening}
            className={`relative h-20 w-20 rounded-full text-white transition ${
              isListening ? 'bg-red-500' : 'bg-brand-600 hover:bg-brand-500'
            }`}
            aria-label={isListening ? 'Stop listening' : 'Start listening'}
          >
            <span className="text-2xl">🎤</span>
            {isListening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-50" />}
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void askAssistant(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type if mic is unavailable…"
            className="flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2 dark:border-slate-600"
          />
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-500">
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
