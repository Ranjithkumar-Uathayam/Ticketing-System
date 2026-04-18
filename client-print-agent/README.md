# HW Label Local Print Agent

This agent lets the IIS-hosted application print to a USB-connected `TSC TTP-244 Pro` on the user's Windows PC.

## How it works

1. The web app asks the server for the TSPL label job.
2. The browser sends that job to `http://127.0.0.1:17951/api/print-jobs`.
3. The local Windows agent sends the raw label data to the USB printer installed on that PC.

## Setup on the printer PC

1. Make sure the printer is installed in Windows with the exact name `TSC TTP-244 Pro`.
2. Copy this `client-print-agent` folder to the PC that has the USB printer.
3. Double-click [start-print-agent.cmd](C:\Users\BBT-012\Documents\corporate-ticketing-system-updated\client-print-agent\start-print-agent.cmd).
4. Keep that terminal window open while printing labels.
5. Open `http://127.0.0.1:17951/health` in the browser and confirm it returns a JSON `status: ok`.

## Notes

- The browser may ask for local network access permission in newer Chrome versions when the IIS site connects to `127.0.0.1`.
- The agent listens only on `127.0.0.1`, so it is available only to the same PC.
- If you want it to start automatically with Windows, create a shortcut to `start-print-agent.cmd` in the user's Startup folder or wrap it later as a Windows service.
