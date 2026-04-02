export type AssistantIntent =
  | { type: 'time' }
  | { type: 'open_youtube' }
  | { type: 'search_google'; query: string }
  | { type: 'weather'; city: string }
  | { type: 'none' };

export function detectIntent(input: string): AssistantIntent {
  const text = input.trim().toLowerCase();

  if (/(what\s+time|current\s+time|time\s+is\s+it)/.test(text)) {
    return { type: 'time' };
  }

  if (/open\s+youtube/.test(text)) {
    return { type: 'open_youtube' };
  }

  const searchMatch = text.match(/search\s+google\s+for\s+(.+)/i);
  if (searchMatch?.[1]) {
    return { type: 'search_google', query: searchMatch[1].trim() };
  }

  const weatherMatch = text.match(/weather\s+in\s+(.+)/i);
  if (weatherMatch?.[1]) {
    return { type: 'weather', city: weatherMatch[1].trim() };
  }

  return { type: 'none' };
}

export function ruleBasedReply(input: string): string {
  const lowered = input.toLowerCase();

  if (/(hello|hi|hey)\b/.test(lowered)) {
    return 'Hello! Say “Hey Assistant” and ask anything.';
  }

  if (/(who\s+are\s+you|what\s+can\s+you\s+do)/.test(lowered)) {
    return 'I am your free browser voice assistant. I can answer questions, open YouTube, search Google, and fetch weather.';
  }

  return 'I am having trouble reaching the model right now, but I can still help with commands like time, weather, YouTube, and Google search.';
}
