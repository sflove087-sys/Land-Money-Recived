import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL}/auth/google/callback`
  );

  // Google OAuth URL
  app.get("/api/auth/google/url", (req, res) => {
    const scopes = [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file"
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent"
    });

    res.json({ url });
  });

  // Google OAuth Callback
  app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      // In a real app, you'd store these tokens in Firestore for the user
      // For this demo, we'll send them back to the client to store in localStorage (not secure for production)
      // or just send a success message and have the client fetch them if stored on server.
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Google Auth Error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  // API to sync data to Google Sheets
  app.post("/api/gsheets/sync", async (req, res) => {
    const { tokens, data, spreadsheetId } = req.body;
    if (!tokens) return res.status(401).json({ error: "No tokens provided" });

    try {
      oauth2Client.setCredentials(tokens);
      const sheets = google.sheets({ version: "v4", auth: oauth2Client });

      let currentSpreadsheetId = spreadsheetId;

      if (!currentSpreadsheetId) {
        const spreadsheet = await sheets.spreadsheets.create({
          requestBody: {
            properties: { title: "LandPro Customers Database" }
          }
        });
        currentSpreadsheetId = spreadsheet.data.spreadsheetId;
      }

      // Prepare data for sheets
      const values = [
        ["Name", "Phone", "Address", "Area", "Validity Date", "Status"],
        ...data.map((c: any) => [
          c.name,
          c.phone,
          c.address,
          c.area,
          c.validityDate,
          c.status
        ])
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: currentSpreadsheetId,
        range: "Sheet1!A1",
        valueInputOption: "RAW",
        requestBody: { values }
      });

      res.json({ success: true, spreadsheetId: currentSpreadsheetId });
    } catch (error) {
      console.error("Sync Error:", error);
      res.status(500).json({ error: "Sync failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
