import express from "express";
import axios from "axios";
import https from "https";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Faltando variável ${name}.`);
  return v;
}

// ✅ mTLS com CERT + KEY (evita P12/PFX)
function createHttpsAgent() {
  const certB64 = getRequiredEnv("B3_CERT_BASE64").replace(/\s+/g, "");
  const keyB64 = getRequiredEnv("B3_KEY_BASE64").replace(/\s+/g, "");

  const cert = Buffer.from(certB64, "base64"); // bytes do .cer
  const key = Buffer.from(keyB64, "base64");   // bytes do .key

  return new https.Agent({
    cert,
    key,
    rejectUnauthorized: false, // homologação
  });
}

// ✅ OAuth2 token (Microsoft/Azure) — não precisa de mTLS
async function getAccessToken() {
  const tokenUrl = getRequiredEnv("B3_TOKEN_URL");
  const clientId = getRequiredEnv("B3_CLIENT_ID");
  const clientSecret = getRequiredEnv("B3_CLIENT_SECRET");
  const scope = getRequiredEnv("B3_SCOPE");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: scope,
  });

  const resp = await axios.post(tokenUrl, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30000,
  });

  if (!resp.data?.access_token) {
    throw new Error("Token não retornou access_token. Verifique client_id/secret/scope.");
  }
  return resp.data.access_token;
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/api/b3/test", async (req, res) => {
  try {
    const baseUrl = getRequiredEnv("B3_BASE_URL");

    const token = await getAccessToken();
    const httpsAgent = createHttpsAgent();

    const health = await axios.get(`${baseUrl}/api/acesso/healthcheck`, {
      httpsAgent,
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    });

    res.json({
      success: true,
      message: "Token OK + mTLS OK (healthcheck passou)",
      healthcheck: health.data,
    });
  } catch (err) {
    const status = err?.response?.status;
    const detail = err?.response?.data || err?.message || String(err);

    res.status(500).json({
      success: false,
      status,
      detail,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
