
type LogCallback = (line: string) => void;

export class LogStream {
  private socket: WebSocket | null = null;
  private url: string;
  private onMessage: LogCallback;
  private onError: (err: Event) => void;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private isClosed = false;

  constructor(url: string, onMessage: LogCallback, onError: (err: Event) => void) {
    this.url = url;
    this.onMessage = onMessage;
    this.onError = onError;
  }

  public connect() {
    if (this.isClosed) return;
    
    try {
        this.socket = new WebSocket(this.url);
        
        this.socket.onopen = () => {
            console.log('LogStream Connected');
        };

        this.socket.onmessage = (e) => {
            if (typeof e.data === 'string') {
                this.onMessage(e.data);
            }
        };

        this.socket.onerror = (e) => {
            console.error('LogStream Error:', e);
            this.onError(e);
        };

        this.socket.onclose = () => {
            if (!this.isClosed) {
                console.log('LogStream Closed, retrying in 3s...');
                this.retryTimeout = setTimeout(() => this.connect(), 3000);
            }
        };
    } catch (e) {
        console.error("Failed to create WebSocket:", e);
        // Retry
        this.retryTimeout = setTimeout(() => this.connect(), 3000);
    }
  }

  public disconnect() {
    this.isClosed = true;
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
    if (this.socket) {
        this.socket.close();
        this.socket = null;
    }
  }
}
