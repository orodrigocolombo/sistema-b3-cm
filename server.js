import express from "express";
import axios from "axios";
import https from "https";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Criar agente HTTPS com certificado .p12
const httpsAgent = new https.Agent({
  pfx: fs.readFileSync(process.env.B3_P12_PATH),
  passphrase: process.env.B3_P12_PASSWORD,
  rejectUnauthorized: false
});

// Função para obter token OAuth2
async function getAccessToken() {
  const response = await axios.post(
    `${process.env.B3_BASE_URL}/oauth/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.B3_CLIENT_ID,
      client_secret: process.env.B3_CLIENT_SECRET
    }),
    {
      httpsAgent,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  return response.data.access_token;
}

// Endpoint teste conexão
app.get("/api/b3/test", async (req, res) => {
  try {
    const token = await getAccessToken();

    res.json({
      success: true,
      message: "Conectado com sucesso à B3",
      token_preview: token.substring(0, 20) + "..."
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
