const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { createAgentSession } = require('./agy-bridge');

function setupWebSocketServer(server) {
  // Main data-sync WebSocket server (existing)
  const wss = new WebSocketServer({ noServer: true });

  // AGY agent WebSocket server (new)
  const agentWss = new WebSocketServer({ noServer: true });

  // Heartbeat ping interval to keep Cloud Run WebSocket connections active
  const interval = setInterval(() => {
    const allClients = [...wss.clients, ...agentWss.clients];
    allClients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  // ─── Existing data-sync WebSocket ────────────────────────────────
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed && parsed.type === 'ENTITY_UPDATE') {
          broadcastDataUpdate(parsed.entity, parsed.action, parsed.data, parsed.campaign);
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    });
  });

  // ─── AGY Agent WebSocket ─────────────────────────────────────────
  agentWss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    console.log('[AGY WS] Client connected');

    // Create an agent session for this WebSocket connection
    const session = createAgentSession({
      onEvent: (event) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(event));
        }
      },
      onError: (message) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message }));
        }
      },
      onClose: () => {
        // Agent process closed — handled by onEvent response_end
      },
    });

    ws.on('message', (rawMessage) => {
      try {
        const msg = JSON.parse(rawMessage.toString('utf8'));

        switch (msg.type) {
          case 'chat':
            if (!msg.message || typeof msg.message !== 'string') {
              ws.send(JSON.stringify({ type: 'error', message: 'Missing message field' }));
              return;
            }
            session.sendMessage(msg.message, msg.campaignId || null);
            break;

          case 'cancel':
            session.cancel();
            break;

          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: `Unknown message type: ${msg.type}`,
            }));
        }
      } catch (err) {
        console.error('[AGY WS] Error handling message:', err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      }
    });

    ws.on('close', () => {
      console.log('[AGY WS] Client disconnected');
      session.destroy();
    });

    ws.on('error', (err) => {
      console.error('[AGY WS] WebSocket error:', err);
      session.destroy();
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'AGY bridge connected. Send { type: "chat", message: "...", campaignId: N } to start.',
    }));
  });

  // ─── Upgrade handler with Authentication ────────────────────────
  const { verifySessionToken, parseCookies, COOKIE_NAME } = require('./auth');

  server.on('upgrade', (request, socket, head) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    } catch (e) {
      parsedUrl = { pathname: request.url || '/', searchParams: new URLSearchParams() };
    }

    const pathname = parsedUrl.pathname;

    // Validate Authentication
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[COOKIE_NAME] || parsedUrl.searchParams.get('token');
    const session = verifySessionToken(token);

    if (!session) {
      console.warn(`[WebSocket] Rejected unauthenticated connection attempt to ${pathname}`);
      socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\nUnauthorized: Session required\r\n');
      socket.destroy();
      return;
    }

    request.user = session;

    if (pathname === '/ws/agent' || pathname.startsWith('/ws/agent/')) {
      agentWss.handleUpgrade(request, socket, head, (ws) => {
        ws.user = session;
        agentWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws' || pathname === '/' || pathname.startsWith('/ws/')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.user = session;
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  function broadcastDataUpdate(entity, action, data, campaign) {
    const payload = JSON.stringify({
      type: 'ENTITY_UPDATE',
      entity,
      action,
      data,
      campaign,
      timestamp: Date.now()
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  return { wss, agentWss, broadcastDataUpdate };
}

// Standalone execution support
if (require.main === module) {
  const express = require('express');
  const cors = require('cors');

  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const { broadcastDataUpdate } = setupWebSocketServer(server);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'websocket-server' });
  });

  app.post('/broadcast', (req, res) => {
    const { entity, action, data, campaign } = req.body || {};
    if (!entity || !action || !data) {
      return res.status(400).json({ error: 'Missing entity, action, or data in request body' });
    }
    broadcastDataUpdate(entity, action, data, campaign);
    res.json({ success: true, entity, action });
  });

  const port = process.env.WS_PORT || process.env.PORT || 8081;
  server.listen(port, () => {
    console.log(`Standalone WebSocket server listening on port ${port}`);
  });
}

module.exports = { setupWebSocketServer };
