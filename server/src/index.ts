/**
 * Foundation placeholder (phase 0). The Network agent replaces this with the real room server
 * (WebSocket + GameHost per room + static file serving) in milestone 3.
 */

import { createServer } from 'node:http';
import { PROTOCOL_VERSION } from '@shared/constants';

const port = Number(process.env.PORT ?? process.env.LIMINAL_SERVER_PORT ?? 8787);

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ name: 'liminal-server', protocol: PROTOCOL_VERSION, status: 'foundation' }));
});

server.listen(port, () => {
  console.log(`[liminal] serveur (socle) à l'écoute sur http://localhost:${port}`);
});
