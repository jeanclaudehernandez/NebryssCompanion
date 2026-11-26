const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { createAgentSession: createAgySession, listAgyModels } = require('./agy-bridge');
const { createAgentSession: createColibriSession, forgetServerContext, invalidateCampaignData } = require('./colibri-bridge');
const colibriEngine = require('./colibri-engine');
const fluxEngine = require('./flux-engine');

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

  // ─── AI Agent WebSocket (Colibri / AGY) ──────────────────────────
  agentWss.on('connection', (ws, request) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    let requestedBackend = null;
    let requestedModel = '';
    // Experimental format (Colibri): list results as tables instead of JSON. On unless the
    // client asks for JSON (format=json).
    let experimentalFormat = true;
    try {
      const reqUrl = new URL(request?.url || '/', `http://${request?.headers?.host || 'localhost'}`);
      requestedBackend = reqUrl.searchParams.get('backend');
      requestedModel = reqUrl.searchParams.get('model') || '';
      experimentalFormat = reqUrl.searchParams.get('format') !== 'json';
    } catch (_) {}

    let activeBackend = (requestedBackend === 'agy' || requestedBackend === 'colibri')
      ? requestedBackend
      : (process.env.AGENT_BACKEND === 'agy' ? 'agy' : 'colibri');
    let activeModel = typeof requestedModel === 'string' ? requestedModel.trim() : '';

    const createSessionForBackend = (backendName) => {
      const factory = backendName === 'agy' ? createAgySession : createColibriSession;
      return factory({
        model: backendName === 'agy' ? activeModel : undefined,
        experimentalFormat: backendName === 'colibri' ? experimentalFormat : undefined,
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
    };

    console.log(`[Agent WS] Client connected (backend: ${activeBackend})`);

    // Create an agent session for this WebSocket connection
    let session = createSessionForBackend(activeBackend);

    // Colibri model setup state and switch progress go to every connected client,
    // so a switch started anywhere blocks every open UI until the new engine is up.
    const sendEngineState = (engineState) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'colibri_engine', state: engineState }));
      }
    };
    const unsubscribeColibri = colibriEngine.subscribe(sendEngineState);
    // FLUX image studio: the image being made and the unsaved images, to every client.
    const sendFluxState = (fluxState) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'flux_state', state: fluxState }));
      }
    };
    const unsubscribeFlux = fluxEngine.subscribe(sendFluxState);
    // New or changed LoRAs (files in ComfyUI's loras folder, flux-loras.json) reach open studios
    // without restarting the API.
    const unsubscribeCatalog = fluxEngine.onCatalogChange((catalog) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'flux_catalog', catalog }));
      }
    });
    const unsubscribeEngine = () => { unsubscribeColibri(); unsubscribeFlux(); unsubscribeCatalog(); };
    const sendFluxError = (action, err) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'flux_error', action, message: err.message || String(err) }));
      }
    };

    // The model's stored conversation (Colibri only: AGY keeps its history inside the AGY CLI).
    const sendHistory = (outcome) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const history = session.getHistory
        ? session.getHistory()
        : {
          supported: false,
          reason: 'Antigravity keeps its conversation inside the AGY CLI, so it cannot be viewed or edited from here.',
          processing: false,
          messages: []
        };
      ws.send(JSON.stringify({ type: 'history', ...history, outcome: outcome || null }));
    };

    ws.on('message', (rawMessage) => {
      try {
        const msg = JSON.parse(rawMessage.toString('utf8'));

        switch (msg.type) {
          case 'chat':
            if (!msg.message || typeof msg.message !== 'string') {
              ws.send(JSON.stringify({ type: 'error', message: 'Missing message field' }));
              return;
            }
            if (activeBackend === 'colibri' && colibriEngine.isSwitching()) {
              // Named after the engine being started ('llama.cpp' / 'Colibri'), or the local engine.
              const switchingTo = colibriEngine.getState().targetEngineName || 'local';
              ws.send(JSON.stringify({ type: 'error', message: `The ${switchingTo} engine is starting; send the message again once it is ready.` }));
              ws.send(JSON.stringify({ type: 'response_end', status: 'ERROR' }));
              return;
            }
            if (activeBackend === 'colibri' && colibriEngine.getState().mode === colibriEngine.FLUX_MODE) {
              ws.send(JSON.stringify({ type: 'error', message: 'FLUX has the GPU, so the local model is stopped. Switch the AI engine back to Local to chat.' }));
              ws.send(JSON.stringify({ type: 'response_end', status: 'ERROR' }));
              return;
            }
            const parsedTemp = (typeof msg.temperature === 'number' && Number.isFinite(msg.temperature))
              ? Math.min(1, Math.max(0, msg.temperature))
              : undefined;
            const parsedMaxReply = (typeof msg.maxReplyTokens === 'number' && Number.isFinite(msg.maxReplyTokens) && msg.maxReplyTokens > 0)
              ? Math.min(64000, Math.max(1000, Math.round(msg.maxReplyTokens)))
              : undefined;
            session.sendMessage(msg.message, msg.campaignId || null, {
              thinking: Boolean(msg.thinking),
              ...(parsedTemp !== undefined ? { temperature: parsedTemp } : {}),
              ...(parsedMaxReply !== undefined ? { maxReplyTokens: parsedMaxReply } : {})
            });
            break;

          case 'approve_command': {
            const { commandId, rawCommandLine, command, payload } = msg;
            console.log(`[AGY WS] Approving command ${commandId}: ${command || rawCommandLine}`);

            const targetCampaignId = payload?.campaignId || (session.getActiveCampaignId ? session.getActiveCampaignId() : 1);
            const { spawn } = require('child_process');
            const path = require('path');
            const fs = require('fs');
            const cwd = path.resolve(__dirname, '../..');

            let scriptPath = path.resolve(cwd, 'scripts/campaign-session-tool.js');
            if (!fs.existsSync(scriptPath)) {
              scriptPath = path.resolve(cwd, 'NebryssCompanion/scripts/campaign-session-tool.js');
            }

            const targetCmd = command || (rawCommandLine ? (rawCommandLine.match(/campaign-session-tool\.js\s+([a-zA-Z0-9_-]+)/) || [])[1] : null) || 'save';

            // Write payload safely to a temporary JSON file to avoid Windows command line length limits (ENAMETOOLONG)
            const os = require('os');
            let payloadToPass = { ...(payload || {}), campaignId: targetCampaignId };

            // If the staged payload contains a _payloadFile reference (large content offloaded to temp file),
            // read it and merge into the full payload for execution
            if (payloadToPass._payloadFile) {
              try {
                const payloadFilePath = payloadToPass._payloadFile;
                if (fs.existsSync(payloadFilePath)) {
                  const filePayload = JSON.parse(fs.readFileSync(payloadFilePath, 'utf8'));
                  payloadToPass = { ...filePayload, ...payloadToPass, campaignId: targetCampaignId };
                  delete payloadToPass._payloadFile;
                  // Clean up the staged content temp file
                  try { fs.unlinkSync(payloadFilePath); } catch (_) {}
                }
              } catch (e) {
                console.warn('[AGY WS] Failed to read _payloadFile:', e.message);
              }
            }

            const tmpFile = path.join(os.tmpdir(), `nebryss-cmd-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.json`);
            fs.writeFileSync(tmpFile, JSON.stringify(payloadToPass), 'utf8');

            const args = [
              scriptPath,
              targetCmd,
              `--payload-file=${tmpFile}`,
              '--approved',
              `--campaignId=${targetCampaignId}`
            ];

            const addressInfo = server?.address?.();
            const actualPort = (addressInfo && typeof addressInfo === 'object' && addressInfo.port) ? addressInfo.port : (process.env.PORT || 8080);
            const apiUrl = process.env.API_URL || process.env.API_BASE_URL || `http://127.0.0.1:${actualPort}/api`;

            const child = spawn(process.execPath, args, {
              cwd,
              env: {
                ...process.env,
                PORT: String(actualPort),
                API_URL: apiUrl,
                API_BASE_URL: apiUrl,
                ADMIN_PIN: process.env.ADMIN_PIN || '849201',
                NEBRYSS_UI_APPROVED: 'true',
                NEBRYSS_ACTIVE_CAMPAIGN_ID: String(targetCampaignId)
              }
            });

            let stdout = '';
            let stderr = '';
            child.stdout.on('data', d => stdout += d.toString('utf8'));
            child.stderr.on('data', d => stderr += d.toString('utf8'));

            const cleanupTempFile = () => {
              try {
                if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
              } catch (_) {}
            };

            child.on('error', (err) => {
              cleanupTempFile();
              console.error(`[AGY WS] Error spawning approved command:`, err);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_result',
                  commandId,
                  status: 'error',
                  error: err.message
                }));
              }
            });

            child.on('close', (exitCode) => {
              cleanupTempFile();
              if (exitCode !== 0) {
                const errorMsg = stderr.trim() || stdout.trim() || `Process exited with code ${exitCode}`;
                console.error(`[AGY WS] Error executing approved command: ${errorMsg}`);
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'command_result',
                    commandId,
                    status: 'error',
                    error: errorMsg
                  }));
                }
                return;
              }

              let parsedResult = null;
              try {
                parsedResult = JSON.parse(stdout.trim());
              } catch (e) {
                parsedResult = stdout.trim();
              }

              // The change is applied: the Colibri bridge's cached data and RAG index are stale.
              invalidateCampaignData(targetCampaignId);

              // Broadcast update to all clients to refresh lists/rosters in real time
              if (parsedResult && typeof parsedResult === 'object') {
                const entityType = parsedResult.type || (targetCmd ? targetCmd.replace(/^(create|update|delete)-/, '') : 'entity');
                broadcastDataUpdate(entityType, 'UPDATE', parsedResult, targetCampaignId);
              }

              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_result',
                  commandId,
                  status: 'approved',
                  result: parsedResult
                }));
              }
            });
            break;
          }

          case 'decline_command': {
            const { commandId } = msg;
            console.log(`[AGY WS] Declining command ${commandId}`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'command_result',
                commandId,
                status: 'declined',
                message: 'Command declined by user.'
              }));
            }
            break;
          }

          case 'cancel':
            session.cancel();
            break;

          case 'set_campaign': {
            // Frontend notifies us of a campaign change — update the session's
            // active campaign so the next turn is scoped to the correct campaign.
            const newCampaignId = Number(msg.campaignId);
            if (!isNaN(newCampaignId) && newCampaignId > 0) {
              session.setActiveCampaign(newCampaignId);
              console.log(`[AGY WS] Campaign switched to ID: ${newCampaignId}`);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'campaign_changed',
                  campaignId: newCampaignId,
                }));
              }
            }
            break;
          }

          case 'set_backend': {
            const nextBackend = msg.backend === 'agy' ? 'agy' : (msg.backend === 'colibri' ? 'colibri' : null);
            if (!nextBackend) {
              ws.send(JSON.stringify({ type: 'error', message: `Invalid backend: ${msg.backend}` }));
              break;
            }
            if (nextBackend !== activeBackend) {
              const prevCampaignId = session.getActiveCampaignId ? session.getActiveCampaignId() : 1;
              session.destroy();
              activeBackend = nextBackend;
              session = createSessionForBackend(activeBackend);
              if (session.setActiveCampaign && prevCampaignId) {
                session.setActiveCampaign(prevCampaignId);
              }
              console.log(`[Agent WS] Switched backend to: ${activeBackend} (campaign: ${prevCampaignId})`);
            }
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'backend_changed',
                backend: activeBackend,
                model: activeBackend === 'agy' ? activeModel : undefined,
              }));
            }
            break;
          }

          case 'get_agy_models': {
            listAgyModels().then((models) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'agy_models',
                  models,
                  activeModel,
                }));
              }
            }).catch((err) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', message: `Failed to list AGY models: ${err.message}` }));
              }
            });
            break;
          }

          case 'set_model': {
            activeModel = typeof msg.model === 'string' ? msg.model.trim() : '';
            if (activeBackend === 'agy' && session.setModel) {
              session.setModel(activeModel);
            }
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'model_changed',
                model: activeModel,
              }));
            }
            break;
          }

          case 'set_experimental_format': {
            experimentalFormat = Boolean(msg.enabled);
            if (session.setExperimentalFormat) session.setExperimentalFormat(experimentalFormat);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'experimental_format_changed', enabled: experimentalFormat }));
            }
            break;
          }

          case 'get_history':
            sendHistory();
            break;

          case 'delete_history': {
            if (!session.deleteHistory) {
              sendHistory();
              break;
            }
            const outcome = session.deleteHistory(Array.isArray(msg.ids) ? msg.ids : []);
            sendHistory(outcome);
            if (outcome.ok && outcome.deleted > 0 && session.contextEstimate && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'context_estimate', context: session.contextEstimate() }));
            }
            break;
          }

          case 'restore_conversation': {
            if (session.restoreHistory) {
              const res = session.restoreHistory(Array.isArray(msg.messages) ? msg.messages : []);
              if (res.ok && session.contextEstimate && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'context_estimate', context: session.contextEstimate() }));
              }
            }
            break;
          }

          case 'get_colibri_engine':
            colibriEngine.refreshStatus()
              .then(sendEngineState)
              .catch((err) => sendEngineState({ ...colibriEngine.getState(), error: err.message }));
            break;

          case 'switch_colibri_engine': {
            const toFlux = msg.mode === colibriEngine.FLUX_MODE;
            const profile = !toFlux && typeof msg.mode === 'string' ? colibriEngine.resolveProfile(msg.mode) : null;
            if (!toFlux && !profile) {
              ws.send(JSON.stringify({ type: 'error', message: `Invalid local setup: ${msg.mode}` }));
              break;
            }
            const target = toFlux ? colibriEngine.FLUX_MODE : profile.id;
            if (colibriEngine.isSwitching()) {
              sendEngineState(colibriEngine.getState());
              break;
            }
            console.log(`[Agent WS] Switching the Colibri engine to ${target} (requested by ${ws.user?.email || ws.user?.username || 'unknown'})`);
            // Progress reaches this and every other client through the subscription above.
            colibriEngine.switchEngine(target, { onReady: forgetServerContext })
              .then((s) => console.log(`[Agent WS] Colibri engine switch ${s.phase === 'ready' ? `done: ${s.mode}` : `failed: ${s.error}`}`))
              .catch((err) => sendEngineState({ ...colibriEngine.getState(), phase: 'error', error: err.message }));
            break;
          }

          case 'stop_colibri_engine': {
            if (colibriEngine.isSwitching()) {
              sendEngineState(colibriEngine.getState());
              break;
            }
            console.log(`[Agent WS] Stopping the GPU engine (requested by ${ws.user?.email || ws.user?.username || 'unknown'})`);
            // The bridge's conversation is kept; only the server's prompt cache is gone.
            colibriEngine.stopEngine({ onStopped: forgetServerContext })
              .then((s) => console.log(`[Agent WS] Engine stop ${s.phase === 'ready' ? 'done' : `failed: ${s.error}`}`))
              .catch((err) => sendEngineState({ ...colibriEngine.getState(), phase: 'error', error: err.message }));
            break;
          }

          // ─── FLUX image studio ───
          case 'flux_get_catalog':
            try {
              ws.send(JSON.stringify({ type: 'flux_catalog', catalog: fluxEngine.catalog() }));
              sendFluxState(fluxEngine.getState());
            } catch (err) {
              sendFluxError('catalog', err);
            }
            break;

          case 'flux_generate':
            if (colibriEngine.isSwitching()) {
              sendFluxError('generate', new Error('The engine is switching; try again once FLUX is ready.'));
              break;
            }
            fluxEngine.generate(msg.params || {}).catch((err) => sendFluxError('generate', err));
            break;

          case 'flux_fix':
            if (colibriEngine.isSwitching()) {
              sendFluxError('fix', new Error('The engine is switching; try again once FLUX is ready.'));
              break;
            }
            fluxEngine.fixArea(msg.params || {}).catch((err) => sendFluxError('fix', err));
            break;

          case 'flux_cancel':
            fluxEngine.cancel().catch((err) => sendFluxError('cancel', err));
            break;

          case 'flux_save':
            try {
              const saved = fluxEngine.save(msg.id, typeof msg.name === 'string' ? msg.name : '');
              console.log(`[Agent WS] FLUX image saved to ${saved.path}`);
              ws.send(JSON.stringify({ type: 'flux_saved', ...saved }));
            } catch (err) {
              sendFluxError('save', err);
            }
            break;

          case 'flux_discard':
            try {
              ws.send(JSON.stringify({ type: 'flux_discarded', ...fluxEngine.discard(msg.id) }));
            } catch (err) {
              sendFluxError('discard', err);
            }
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
      unsubscribeEngine();
      session.destroy();
    });

    ws.on('error', (err) => {
      console.error('[AGY WS] WebSocket error:', err);
      unsubscribeEngine();
      session.destroy();
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      backend: activeBackend,
      model: activeBackend === 'agy' ? activeModel : undefined,
      message: `${activeBackend === 'agy' ? 'AGY' : 'Local'} bridge connected. Send { type: "chat", message: "...", campaignId: N } to start.`,
    }));
  });

  // ─── Upgrade handler with Origin & Authentication Validation ──────
  const { verifySessionToken, parseCookies, COOKIE_NAME } = require('./auth');
  const { validateWsOrigin, corsOptions } = require('./cors-config');

  server.on('upgrade', (request, socket, head) => {
    // 1. Validate CORS / Origin Header
    if (!validateWsOrigin(request)) {
      const origin = request.headers.origin || request.headers.referer || 'unknown';
      console.warn(`[WebSocket] Rejected upgrade from unauthorized origin: ${origin}`);
      socket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nForbidden: Origin not allowed\r\n');
      socket.destroy();
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    } catch (e) {
      parsedUrl = { pathname: request.url || '/', searchParams: new URLSearchParams() };
    }

    const pathname = parsedUrl.pathname;

    // 2. Validate Authentication
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
      if (session.role !== 'admin' && session.role !== 'gm') {
        console.warn(`[WebSocket] Rejected non-admin connection attempt to AI Agent bridge from user: ${session.email || session.username}`);
        socket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nForbidden: GM/Admin role required\r\n');
        socket.destroy();
        return;
      }
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
  const { corsOptions, originValidationMiddleware } = require('./cors-config');

  const app = express();
  app.use(cors(corsOptions));
  app.use(originValidationMiddleware);
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
