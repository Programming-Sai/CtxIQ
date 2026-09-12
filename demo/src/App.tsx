import { useState } from 'react';
import { ConversationManager, ConversationSession } from 'ctxiq';
import './App.css';

function App() {
  const [messages, setMessages] = useState<Array<{role: string; content: string}>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Initialize manager and session on mount
  React.useEffect(() => {
    const manager = new ConversationManager();
    const id = manager.createSession('Demo Chat');
    setSessionId(id);

    // Store manager instance (in real app use context or state management)
    (window as any).ctxManager = manager;
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !sessionId) return;

    const manager = (window as any).ctxManager;
    const session = manager.getSession(sessionId);
    if (!session) return;

    // Add user message
    session.addMessage({ role: 'user', content: input });
    setMessages([...messages, { role: 'user', content: input }]);
    setInput('');

    // Simulate thinking
    setIsLoading(true);

    // Build prompt and get LLM response (mock for demo)
    try {
      const prompt = await session.buildPrompt();
      // In real app: call actual LLM
      const mockResponse = `This is a mock response to: "${input}". ` +
        `I can see you've sent ${messages.length + 1} messages so far.`;

      // Add assistant response
      session.addMessage({ role: 'assistant', content: mockResponse });
      setMessages(prev => [...prev, { role: 'assistant', content: mockResponse }]);
    } catch (error) {
      console.error('Error building prompt:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>CtxIQ Demo</h1>
        <p>Simple chat using ConversationSession</p>
      </header>

      <div className="chat-container">
        <div className="messages">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`message ${msg.role}`}
            >
              <strong>{msg.role === 'user' ? 'You' : 'AI'}:</strong>
              <p>{msg.content}</p>
            </div>
          ))}
          {isLoading && <div className="message assistant">Thinking...</div>}
        </div>

        <div className="input-area">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            disabled={isLoading}
          />
          <button onClick={handleSend} disabled={isLoading || !input.trim()}>
            Send
          </button>
        </div>
      </div>

      <div className="stats">
        <p>Session ID: {sessionId?.substring(0, 8)}...</p>
        <p>Messages in session: {messages.length}</p>
      </div>
    </div>
  );
}

export default App;