import { buildOwnerLookup } from './owners';

export interface PolymarketMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  startTime: string;
  round: string;
  group?: string;
}

export interface PolymarketMessage {
  type: string;
  data?: any;
}

interface MatchUpdate {
  matchId: string;
  homeScore: number;
  awayScore: number;
  status: string;
  timestamp: string;
}

export class PolymarketWebSocketService {
  private ws: WebSocket | null = null;
  private url = 'wss://sports-api.polymarket.com/ws';
  private messageHandlers: ((message: PolymarketMessage) => void)[] = [];
  private matchUpdateHandlers: ((update: MatchUpdate) => void)[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private currentMatches: Map<string, PolymarketMatch> = new Map();
  private subscriptionId: string | null = null;
  private isConnecting = false;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        console.log('Already connecting...');
        return;
      }

      this.isConnecting = true;

      try {
        console.log('Attempting to connect to Polymarket API:', this.url);
        this.ws = new WebSocket(this.url);

        // Set a timeout for connection
        const connectionTimeout = setTimeout(() => {
          console.error('WebSocket connection timeout');
          this.isConnecting = false;
          reject(new Error('Connection timeout'));
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('Connected to Polymarket API');
          this.reconnectAttempts = 0;
          this.isConnecting = false;
          this.subscribeToWorldCupMatches();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: PolymarketMessage = JSON.parse(event.data);
            console.log('Received message:', message);
            this.handleMessage(message);
            this.messageHandlers.forEach(handler => handler(message));
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error, event.data);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('Disconnected from Polymarket API');
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.attemptReconnect();
        };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private subscribeToWorldCupMatches(): void {
    console.log('Subscribing to World Cup matches');
    // Subscribe to World Cup 2026 matches
    const subscription = {
      type: 'subscribe',
      channel: 'matches',
      filters: {
        tournament: 'fifa_world_cup_2026',
        active: true
      }
    };
    this.send(subscription);
  }

  private handleMessage(message: PolymarketMessage): void {
    if (message.type === 'match_update' && message.data) {
      const matchData = message.data;
      const matchId = matchData.id || `${matchData.homeTeam}-${matchData.awayTeam}`;
      
      const match: PolymarketMatch = {
        id: matchId,
        homeTeam: matchData.homeTeam,
        awayTeam: matchData.awayTeam,
        homeScore: matchData.homeScore || 0,
        awayScore: matchData.awayScore || 0,
        status: matchData.status || 'scheduled',
        startTime: matchData.startTime,
        round: matchData.round,
        group: matchData.group
      };

      const previousMatch = this.currentMatches.get(matchId);
      this.currentMatches.set(matchId, match);

      // Notify handlers of match updates
      if (previousMatch && 
          (previousMatch.homeScore !== match.homeScore || 
           previousMatch.awayScore !== match.awayScore ||
           previousMatch.status !== match.status)) {
        
        const update: MatchUpdate = {
          matchId,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          status: match.status,
          timestamp: new Date().toISOString()
        };
        
        this.matchUpdateHandlers.forEach(handler => handler(update));
        console.log('Match updated:', match);
      }
    }

    if (message.type === 'subscription_confirmed') {
      this.subscriptionId = message.data?.subscriptionId;
      console.log('Subscribed to World Cup matches:', this.subscriptionId);
    }
  }

  subscribe(handler: (message: PolymarketMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  unsubscribe(handler: (message: PolymarketMessage) => void): void {
    this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
  }

  onMatchUpdate(handler: (update: MatchUpdate) => void): () => void {
    this.matchUpdateHandlers.push(handler);
    // Return unsubscribe function
    return () => {
      this.matchUpdateHandlers = this.matchUpdateHandlers.filter(h => h !== handler);
    };
  }

  getCurrentMatches(): PolymarketMatch[] {
    return Array.from(this.currentMatches.values());
  }

  getMatchById(matchId: string): PolymarketMatch | undefined {
    return this.currentMatches.get(matchId);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentMatches.clear();
    this.subscriptionId = null;
    this.isConnecting = false;
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      console.log(`Attempting to reconnect in ${delay}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect().catch(err => console.error('Reconnection failed:', err)), delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected, state:', this.ws?.readyState);
    }
  }
}

export const polymarketService = new PolymarketWebSocketService();
