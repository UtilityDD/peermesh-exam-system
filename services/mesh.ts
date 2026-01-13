
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

        return new Promise((resolve, reject) => {
            console.log('Initializing Peer...');
            this.peer = id ? new Peer(id) : new Peer();

            this.peer.on('open', (id) => {
                console.log('Peer ID registered: ' + id);
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                console.log('Connected to peer:', conn.peer);
                this.setupConnection(conn);
            });

            this.peer.on('error', (err) => {
                const message = `Peer error (${err.type}): ${err.message}`;
                console.error(message);
                // Don't reject if we are already resolved, but useful for initial connection
                reject(new Error(message));
            });
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
}

export const meshService = new MeshService();
