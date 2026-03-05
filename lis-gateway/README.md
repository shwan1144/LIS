# LIS Gateway Bridge

A lightweight local application to connect laboratory instruments to a Cloud LIS.

## Features
- **TCP Listener**: Connects Ethernet-based instruments (e.g., Medonic M51).
- **Serial Listener**: Connects RS232-based instruments (e.g., Cobas C111, Cobas E411).
- **Automatic Forwarding**: Securely pushes data to the Cloud LIS API.
- **Local Logging**: Logs all activity for troubleshooting.

## Requirements
- [Node.js](https://nodejs.org/) (v18 or higher)
- Internet connection (to reach the Cloud LIS)

## Setup Instructions

1. **Install Dependencies**:
   Open a terminal in this folder and run:
   ```powershell
   npm install
   ```

2. **Configure Settings**:
   Open the `.env` file and fill in your Cloud LIS details:
   - `LIS_API_URL`: Your Cloud LIS API address.
   - `LIS_API_KEY`: Your unique integration key.
   - `PORT`/`ID`: Set the COM ports and Instrument IDs for your specific devices.

3. **Run the Bridge**:
   ```powershell
   npm start
   ```

## Troubleshooting
- **Logs**: Check the `logs/` folder for detailed activity reports.
- **Permissions**: Ensure the user running the app has permissions to access COM ports.
- **Firewall**: Ensure the TCP port (e.g., 5600) is open for the instrument to connect.
