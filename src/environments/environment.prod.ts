// src/environments/environment.prod.ts  (Production)
export const environment = {
  production: true,
  apiUrl: 'https://vms.uathayam.in:4300/TICKETING-API/api',
//   apiUrl: 'http://localhost:3001/api',
  hwLabelPrintMode: 'qz-tray' as 'server' | 'local-agent' | 'qz-tray',
  hwLabelAgentUrl: 'http://127.0.0.1:17951',
};
