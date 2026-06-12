export interface PolymarketMessage {
  // Adjust these based on actual Polymarket API response structure
  type: string;
  data?: any;
}

export class PolymarketWebSocketService {
  private ws: WebSocket | null = null;
  private url = 'wss://sports-api.polymarket.com/ws';
  private messageHandlers: ((message: PolymarketMessage) => void)[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('Connected to Polymarket API');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: PolymarketMessage = JSON.parse(event.data);
            this.messageHandlers.forEach(handler => handler(message));
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('Disconnected from Polymarket API');
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  subscribe(handler: (message: PolymarketMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  unsubscribe(handler: (message: PolymarketMessage) => void): void {
    this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      console.log(`Attempting to reconnect in ${delay}ms...`);
      setTimeout(() => this.connect(), delay);
    }
  }

  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}

export const polymarketService = new PolymarketWebSocketService();
