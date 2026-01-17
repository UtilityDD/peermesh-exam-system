
import { Peer, DataConnection } from 'peerjs';

export type MeshMessage = {
    type: 'QUESTION' | 'RESPONSE' | 'JOIN' | 'HEARTBEAT' | 'INTEGRITY' | 'ACK' | 'RESULTS' | 'SESSION_ENDED';
    payload: any;
};

class MeshService {
    private peer: Peer | null = null;
    private connections: Map<string, DataConnection> = new Map();
    private onMessageCallback: ((senderId: string, message: MeshMessage) => void) | null = null;

    async init(id?: string): Promise<string> {
        if (this.peer && !this.peer.destroyed && !this.peer.disconnected) {
            return this.peer.id;
        }

        return new Promise((resolve) => {
            console.log('Initializing Peer...');

            const config = {
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                    ]
                }
            };

            // Setup a safety timeout for offline initialization
            const timeoutId = setTimeout(() => {
                const fallbackId = id || `LOCAL-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
                console.warn('Signaling server unreachable. Operating in OFFLINE MESH mode.');
                resolve(fallbackId);
            }, 5000);

            try {
                this.peer = id ? new Peer(id, config) : new Peer(config);

                this.peer.on('open', (registeredId) => {
                    clearTimeout(timeoutId);
                    console.log('Peer ID registered: ' + registeredId);
                    resolve(registeredId);
                });

                this.peer.on('disconnected', () => {
                    console.log('Peer disconnected from signaling server. Attempting reconnect...');
                    this.peer?.reconnect();
                });

                this.peer.on('connection', (conn) => {
                    console.log('Connected to peer:', conn.peer);
                    this.setupConnection(conn);
                });

                this.peer.on('error', (err) => {
                    const message = `Peer error (${err.type}): ${err.message}`;
                    console.error(message);

                    // Unified LOCAL prefix for all offline/signaling fallbacks
                    const fallbackId = id || `LOCAL-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
                    resolve(fallbackId);
                });
            } catch (err) {
                console.error('Failed to create Peer instance:', err);
                resolve(`LOCAL-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
            }
        });
    }

    private setupConnection(conn: DataConnection) {
        conn.on('data', (data) => {
            console.log('Received data from', conn.peer, ':', data);
            if (this.onMessageCallback) {
                this.onMessageCallback(conn.peer, data as MeshMessage);
            }
        });

        conn.on('open', () => {
            console.log('Data channel open with:', conn.peer);
            this.connections.set(conn.peer, conn);
        });

        conn.on('close', () => {
            console.log('Connection closed with:', conn.peer);
            this.connections.delete(conn.peer);
        });

        conn.on('error', (err) => {
            console.error('Connection error with', conn.peer, ':', err);
        });
    }

    async connectToInstructor(instructorId: string): Promise<void> {
        if (!this.peer) throw new Error('Peer not initialized');

        console.log('Attempting to connect to instructor:', instructorId);
        const conn = this.peer.connect(instructorId);
        this.setupConnection(conn);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timed out. Check if the Instructor ID is correct and active.'));
            }, 10000);

            conn.on('open', () => {
                clearTimeout(timeout);
                console.log('Successfully connected to instructor!');
                resolve();
            });

            conn.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    broadcast(message: MeshMessage) {
        this.connections.forEach((conn) => {
            conn.send(message);
        });
    }

    send(peerId: string, message: MeshMessage) {
        const conn = this.connections.get(peerId);
        if (conn) {
            conn.send(message);
        }
    }

    onMessage(callback: (senderId: string, message: MeshMessage) => void) {
        this.onMessageCallback = callback;
    }

    getPeerId(): string | null {
        return this.peer?.id || null;
    }

    getConnectedCount(): number {
        return this.connections.size;
    }

    destroy() {
        if (this.peer) {
            this.connections.forEach(c => c.close());
            this.connections.clear();
            this.peer.destroy();
            this.peer = null;
        }
    }

    isDisconnected(): boolean {
        return !this.peer || this.peer.disconnected || this.peer.destroyed;
    }
}

export const meshService = new MeshService();
