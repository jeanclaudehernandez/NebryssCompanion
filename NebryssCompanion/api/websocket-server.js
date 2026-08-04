const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

function setupWebSocketServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  // Heartbeat ping interval to keep Cloud Run WebSocket connections active
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
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

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    if (pathname === '/ws' || pathname === '/') {
      wss.handleUpgrade(request, socket, head, (ws) => {
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

  return { wss, broadcastDataUpdate };
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
