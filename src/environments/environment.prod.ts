// src/environments/environment.prod.ts  (Production)
export const environment = {
  production: true,
//   apiUrl: 'https://vms.uathayam.in:4300/TICKETING-API/api',
  apiUrl: 'http://localhost:3001/api',
  hwLabelPrintMode: 'local-agent' as const,
  hwLabelAgentUrl: 'http://127.0.0.1:17951',
};
