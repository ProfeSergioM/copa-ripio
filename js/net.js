// Red entre navegadores con WebRTC (PeerJS). El servidor público de PeerJS solo presenta a los
// jugadores; después los datos van directo entre ellos. El anfitrión mantiene una conexión con cada invitado.
const PREFIX = 'coparipio-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode() { let c = ''; for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)]; return c; }

export class Net {
  constructor() { this.peer = null; this.conns = new Map(); this.handlers = {}; this.role = null; this.code = null; this.hostConn = null; this.myId = null; }
  on(type, fn) { this.handlers[type] = fn; }
  emit(type, msg, from) { const h = this.handlers[type]; if (h) h(msg, from); }
  get available() { return typeof window !== 'undefined' && !!window.Peer; }

  _peer(id) {
    const P = window.Peer;
    return new P(id, { debug: 1 });
  }

  // Anfitrión: abre la sala con un código de 4 letras
  host(code, onOpen, onError) {
    this.role = 'host'; this.code = code;
    const peer = this.peer = this._peer(PREFIX + code);
    peer.on('open', (id) => { this.myId = id; onOpen && onOpen(code); });
    peer.on('error', (e) => { onError && onError(e); });
    peer.on('connection', (conn) => {
      conn.on('open', () => { this.conns.set(conn.peer, conn); this.emit('join', {}, conn.peer); });
      conn.on('data', (d) => this._recv(d, conn.peer));
      conn.on('close', () => { this.conns.delete(conn.peer); this.emit('leave', {}, conn.peer); });
      conn.on('error', () => { this.conns.delete(conn.peer); this.emit('leave', {}, conn.peer); });
    });
  }

  // Invitado: se conecta al anfitrión
  join(code, onOpen, onError) {
    this.role = 'guest'; this.code = code;
    const peer = this.peer = this._peer(undefined);
    peer.on('open', (id) => {
      this.myId = id;
      const conn = peer.connect(PREFIX + code, { reliable: false, serialization: 'json' });
      this.hostConn = conn;
      const timer = setTimeout(() => { if (!conn.open) onError && onError(new Error('No se encontró la sala ' + code)); }, 9000);
      conn.on('open', () => { clearTimeout(timer); this.conns.set(conn.peer, conn); onOpen && onOpen(); });
      conn.on('data', (d) => this._recv(d, conn.peer));
      conn.on('close', () => { if (this.role === 'guest') this.emit('hostgone', {}); }); // si cerramos nosotros, no es que se fue el anfitrión
      conn.on('error', (e) => { clearTimeout(timer); onError && onError(e); });
    });
    peer.on('error', (e) => { onError && onError(e); });
  }

  _recv(d, from) { if (d && d.t) this.emit(d.t, d, from); }
  send(to, msg) { const c = this.conns.get(to); if (c && c.open) { try { c.send(msg); } catch (e) { /* se cayó */ } } }
  sendHost(msg) { if (this.hostConn && this.hostConn.open) { try { this.hostConn.send(msg); } catch (e) { /* se cayó */ } } }
  broadcast(msg, except) { for (const [id, c] of this.conns) if (id !== except && c.open) { try { c.send(msg); } catch (e) { /* se cayó */ } } }
  close() { this.role = null; try { this.peer && this.peer.destroy(); } catch (e) { /* nada */ } this.peer = null; this.conns.clear(); this.hostConn = null; }
}
